require('dotenv').config();
const twilio = require('twilio');
const WebSocket = require('ws');
const DeepgramAgent = require('./agent');
const ConsentManager = require('./consent');
const Transcript = require('./transcript');
const logger = require('./logger');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VoiceResponse = twilio.twiml.VoiceResponse;

// Per-conference state. In production: Redis.
const conferences = new Map();

/**
 * POST /voice — caller dials the Chatter number.
 * Plays consent IVR then routes to /join.
 */
function handleIncomingCall(req, res) {
  const callSid = req.body.CallSid;
  const conferenceName = 'chatter-main';

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: `/consent?callSid=${callSid}&conference=${conferenceName}`,
    timeout: 10,
  });
  gather.say(
    { voice: 'Polly.Joanna' },
    'This call includes Chatter, an AI assistant. Both parties will hear it. Press 1 to continue.'
  );
  twiml.redirect(`/join?callSid=${callSid}&conference=${conferenceName}&consented=false`);

  logger.info({ callSid, conferenceName }, 'incoming call');
  res.type('text/xml').send(twiml.toString());
}

/**
 * POST /consent — digit received from IVR.
 */
function handleConsent(req, res) {
  const { callSid, conference } = req.query;
  const consented = req.body.Digits === '1';
  logger.info({ callSid, consented }, 'consent digit');

  const twiml = new VoiceResponse();
  if (consented) twiml.say({ voice: 'Polly.Joanna' }, 'Thank you.');
  twiml.redirect(`/join?callSid=${callSid}&conference=${conference}&consented=${consented}`);
  res.type('text/xml').send(twiml.toString());
}

/**
 * POST /join — puts caller into Twilio conference.
 */
function handleJoin(req, res) {
  const { callSid, conference, consented } = req.query;

  if (!conferences.has(conference)) {
    conferences.set(conference, createConferenceState(conference));
  }
  conferences.get(conference).pendingConsents.set(callSid, consented === 'true');

  const twiml = new VoiceResponse();
  const dial = twiml.dial();
  dial.conference(conference, {
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
    statusCallback: `/conference/status?conference=${conference}`,
    statusCallbackEvent: 'join leave',
    statusCallbackMethod: 'POST',
  });

  logger.info({ callSid, conference, consented }, 'joining conference');
  res.type('text/xml').send(twiml.toString());
}

/**
 * POST /conference/status — participant join/leave events from Twilio.
 */
async function handleConferenceStatus(req, res) {
  const { conference } = req.query;
  const { CallSid, StatusCallbackEvent } = req.body;

  if (!conferences.has(conference)) {
    conferences.set(conference, createConferenceState(conference));
  }
  const state = conferences.get(conference);

  if (StatusCallbackEvent === 'participant-join') {
    state.participants.add(CallSid);
    state.consent.participantJoined(CallSid);

    const didConsent = state.pendingConsents.get(CallSid);
    if (didConsent) {
      state.consent.consent(CallSid);
    } else if (!state.timerStarted) {
      state.timerStarted = true;
      state.consent.startTimer();
    }

    logger.info({ CallSid, participants: state.participants.size }, 'participant joined');
  }

  if (StatusCallbackEvent === 'participant-leave') {
    state.participants.delete(CallSid);
    logger.info({ CallSid, remaining: state.participants.size }, 'participant left');
    if (state.participants.size === 0) await teardownConference(conference);
  }

  res.sendStatus(200);
}

/**
 * POST /chatter/stream — TwiML for Chatter's bot call leg.
 * Opens a bidirectional Media Stream to /media-stream.
 */
function handleChatterStream(req, res) {
  const { conference } = req.query;
  const wsUrl = process.env.BASE_URL.replace(/^http/, 'ws') + `/media-stream?conference=${conference}`;

  const twiml = new VoiceResponse();

  // Put Chatter's leg into the same conference
  const dial = twiml.dial();
  const conf = dial.conference(conference, { startConferenceOnEnter: false });
  void conf; // suppress unused var warning

  // Open Media Stream on this leg for audio I/O
  const connect = twiml.connect();
  connect.stream({ url: wsUrl, track: 'both_tracks' });

  logger.info({ conference }, 'chatter stream twiml sent');
  res.type('text/xml').send(twiml.toString());
}

// ----- Conference state factory -----

function createConferenceState(conferenceName) {
  const transcript = new Transcript();

  const consent = new ConsentManager(
    conferenceName,
    () => {
      logger.info({ conference: conferenceName }, 'consent granted — starting chatter leg');
      startChatterLeg(conferenceName);
    },
    (reason) => {
      logger.info({ conference: conferenceName, reason }, 'chatter departing');
      const state = conferences.get(conferenceName);
      if (state?.agent) {
        // Agent will announce and close itself when we disconnect
        state.agent.disconnect();
      }
    }
  );

  return {
    transcript,
    consent,
    participants: new Set(),
    pendingConsents: new Map(),
    timerStarted: false,
    agent: null,
    mediaWs: null,
    streamSid: null,
    chatterCallSid: null,
  };
}

// ----- Chatter bot leg -----

async function startChatterLeg(conferenceName) {
  try {
    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/chatter/stream?conference=${conferenceName}`,
      to: process.env.TWILIO_PHONE_NUMBER,  // calls itself to create the bot leg
      from: process.env.TWILIO_PHONE_NUMBER,
    });
    const state = conferences.get(conferenceName);
    if (state) state.chatterCallSid = call.sid;
    logger.info({ callSid: call.sid, conference: conferenceName }, 'chatter bot leg created');
  } catch (err) {
    logger.error({ err: err.message }, 'failed to create chatter bot leg');
  }
}

// ----- Media Streams WebSocket -----

function setupMediaStreamServer(server) {
  const wss = new WebSocket.Server({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== '/media-stream') return;
    const conference = url.searchParams.get('conference');
    wss.handleUpgrade(req, socket, head, (ws) => handleMediaStreamWs(ws, conference));
  });
}

function handleMediaStreamWs(twilioWs, conferenceName) {
  logger.info({ conference: conferenceName }, 'media stream connected');

  const state = conferences.get(conferenceName);
  if (!state) {
    logger.error({ conference: conferenceName }, 'no state found for conference');
    twilioWs.close();
    return;
  }

  state.mediaWs = twilioWs;

  // Create Deepgram Voice Agent (handles STT + Gemini LLM + Deepgram TTS in one WS)
  const agent = new DeepgramAgent(
    // onAudioOut: agent produced audio — inject mulaw frames into Twilio conference
    (frames) => injectAudio(twilioWs, state.streamSid, frames),

    // onAgentText: what Chatter said (for transcript + logging)
    (text) => state.transcript.add('Chatter', text),

    // onUserText: what the caller said (for transcript)
    (text) => state.transcript.add('caller', text),
  );

  state.agent = agent;
  agent.connect();

  twilioWs.on('message', (data) => {
    const msg = JSON.parse(data);
    switch (msg.event) {
      case 'start':
        state.streamSid = msg.streamSid;
        logger.info({ streamSid: msg.streamSid }, 'media stream started');
        break;
      case 'media':
        // Forward conference audio to the Deepgram agent (transcodes internally)
        agent.sendTwilioFrame(msg.media.payload);
        break;
      case 'stop':
        logger.info({ conference: conferenceName }, 'media stream stopped');
        agent.disconnect();
        break;
    }
  });

  twilioWs.on('close', () => {
    logger.info({ conference: conferenceName }, 'twilio ws closed');
    agent.disconnect();
  });
}

/**
 * Inject mulaw 8kHz frames into the Twilio conference via Media Streams WebSocket.
 */
function injectAudio(ws, streamSid, frames) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !streamSid) return;
  for (const frame of frames) {
    ws.send(JSON.stringify({
      event: 'media',
      streamSid,
      media: { payload: frame.toString('base64') },
    }));
  }
}

async function teardownConference(conferenceName) {
  const state = conferences.get(conferenceName);
  if (!state) return;
  state.agent?.disconnect();
  state.mediaWs?.close();
  conferences.delete(conferenceName);
  logger.info({ conference: conferenceName }, 'conference torn down');
}

module.exports = {
  handleIncomingCall,
  handleConsent,
  handleJoin,
  handleConferenceStatus,
  handleChatterStream,
  setupMediaStreamServer,
};
