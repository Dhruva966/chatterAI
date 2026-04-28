/**
 * P0 SPIKE: ElevenLabs Flash v2 → Twilio Media Streams mulaw 8kHz compatibility
 *
 * Run this BEFORE writing any other Approach A code.
 * If this fails, switch to Amazon Polly (see DECISIONS.md ADR-006).
 *
 * What this tests:
 *   1. ElevenLabs Flash v2 can return audio in ulaw_8000 format
 *   2. That audio, chunked into 160-byte frames, is audible when injected
 *      into a Twilio conference via Media Streams WebSocket
 *
 * How to run:
 *   1. Copy .env.example to .env and fill in your keys
 *   2. npm install
 *   3. Expose port 3000: `npx ngrok http 3000`
 *   4. Set BASE_URL in .env to your ngrok URL
 *   5. npm run spike
 *   6. Call TWILIO_PHONE_NUMBER from two phones
 *   7. Listen for "Hello, this is Chatter" — if both parties hear it clearly: PASS
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../src/logger');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const VoiceResponse = twilio.twiml.VoiceResponse;
const app = express();
app.use(express.urlencoded({ extended: false }));

const FRAME_BYTES = 160; // 20ms at 8kHz 8-bit mulaw
let streamSid = null;
let mediaWs = null;

// Step 1: Caller dials in → put in conference
app.post('/spike/voice', (req, res) => {
  const twiml = new VoiceResponse();
  const dial = twiml.dial();
  dial.conference('spike-conference', {
    startConferenceOnEnter: true,
    statusCallback: `${process.env.BASE_URL}/spike/conference-status`,
    statusCallbackEvent: 'start',
    statusCallbackMethod: 'POST',
  });
  logger.info({ callSid: req.body.CallSid }, 'spike: caller joined conference');
  res.type('text/xml').send(twiml.toString());
});

// Step 2: Conference starts → create Chatter bot leg with Media Stream
app.post('/spike/conference-status', async (req, res) => {
  if (req.body.StatusCallbackEvent !== 'conference-start') return res.sendStatus(200);

  logger.info({ conferenceSid: req.body.ConferenceSid }, 'spike: conference started, creating chatter bot leg');

  try {
    await client.calls.create({
      url: `${process.env.BASE_URL}/spike/chatter-twiml`,
      to: process.env.TWILIO_PHONE_NUMBER, // Call ourselves — creates the bot leg
      from: process.env.TWILIO_PHONE_NUMBER,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'spike: failed to create bot leg');
    // Note: calling to/from same number may require a verified caller ID or SIP
    // Alternative: use Twilio Conferences participant API directly
  }

  res.sendStatus(200);
});

// Step 3: Chatter bot leg TwiML — start Media Stream
app.post('/spike/chatter-twiml', (req, res) => {
  const wsUrl = `${process.env.BASE_URL.replace(/^http/, 'ws')}/spike/media-stream`;
  const twiml = new VoiceResponse();
  const connect = twiml.connect();
  connect.stream({ url: wsUrl });
  // Also put bot leg in the same conference
  const dial = twiml.dial();
  dial.conference('spike-conference');
  logger.info({ callSid: req.body.CallSid }, 'spike: chatter bot leg started');
  res.type('text/xml').send(twiml.toString());
});

// Step 4: Twilio connects Media Streams WebSocket → inject ElevenLabs audio
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/spike/media-stream') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      mediaWs = ws;
      logger.info('spike: media stream websocket connected');
      ws.on('message', async (data) => {
        const msg = JSON.parse(data);
        if (msg.event === 'start') {
          streamSid = msg.streamSid;
          logger.info({ streamSid }, 'spike: stream started — fetching ElevenLabs audio');
          await injectElevenLabsAudio(ws, streamSid);
        }
      });
    });
  }
});

async function injectElevenLabsAudio(ws, sid) {
  logger.info('spike: calling ElevenLabs Flash v2 with ulaw_8000 format...');
  const start = Date.now();

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
      {
        text: 'Hello. This is Chatter. If you can hear this clearly on both phones, the compatibility test has passed.',
        model_id: 'eleven_flash_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/basic',
        },
        params: { output_format: 'ulaw_8000' },
        responseType: 'arraybuffer',
      }
    );

    const ttfb = Date.now() - start;
    const buf = Buffer.from(response.data);
    logger.info({ ttfb_ms: ttfb, bytes: buf.length, content_type: response.headers['content-type'] }, 'spike: ElevenLabs response received');

    // Save raw audio for inspection
    const outPath = path.join(__dirname, '../tmp/spike-output.ulaw');
    fs.writeFileSync(outPath, buf);
    logger.info({ path: outPath }, 'spike: raw audio saved (inspect with: ffplay -f mulaw -ar 8000 -ac 1 tmp/spike-output.ulaw)');

    // Inject 160-byte frames into Twilio Media Streams
    let frameCount = 0;
    for (let i = 0; i < buf.length; i += FRAME_BYTES) {
      const frame = buf.slice(i, i + FRAME_BYTES);
      ws.send(JSON.stringify({
        event: 'media',
        streamSid: sid,
        media: { payload: frame.toString('base64') },
      }));
      frameCount++;
    }

    logger.info({ frameCount, duration_ms: frameCount * 20 }, 'spike: all frames injected');
    logger.info('---');
    logger.info('SPIKE RESULT: Did both parties hear the message clearly?');
    logger.info('  PASS → ElevenLabs + Twilio mulaw compatible. Proceed with Approach A build.');
    logger.info('  FAIL → Switch to Amazon Polly (see DECISIONS.md ADR-006).');
    logger.info('---');

  } catch (err) {
    logger.error({ err: err.message, status: err.response?.status }, 'spike: ElevenLabs call FAILED');
    logger.error('SPIKE FAILED — ElevenLabs error. Check API key and voice ID. Consider Amazon Polly fallback.');
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info({ port: PORT }, 'spike server running');
  logger.info(`Set Twilio webhook to: ${process.env.BASE_URL}/spike/voice`);
  logger.info('Call your Twilio number to start the spike test.');
});
