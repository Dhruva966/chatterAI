require('dotenv').config();
const {
  Room,
  RoomEvent,
  AudioStream,
  AudioSource,
  AudioFrame,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
  AudioMixer,
  AudioResampler,
  AudioResamplerQuality,
  dispose,
} = require('@livekit/rtc-node');
const { AccessToken } = require('livekit-server-sdk');
const DeepgramAgent = require('./agent');
const logger = require('./logger');

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;

const BOT_SAMPLE_RATE = 48000;
const BOT_CHANNELS    = 1;

async function makeBotToken(roomName) {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: 'chatter-bot',
    ttl: '2h',
  });
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  return await token.toJwt(); // must await — v2 SDK is async
}

async function startBot(roomName) {
  const room = new Room();

  // --- Publish source (bot speaks into this) ---
  const audioSource = new AudioSource(BOT_SAMPLE_RATE, BOT_CHANNELS);
  const localTrack  = LocalAudioTrack.createAudioTrack('chatter', audioSource);
  const pubOptions  = new TrackPublishOptions();
  pubOptions.source = TrackSource.SOURCE_MICROPHONE;

  // --- Mixer: combines all remote participant audio into one stream for Deepgram ---
  const mixer      = new AudioMixer(BOT_SAMPLE_RATE, BOT_CHANNELS);
  const trackStreams = new Map(); // identity → AudioStream

  // --- Resampler: Deepgram TTS output is 24kHz, LiveKit needs 48kHz ---
  const resampler = new AudioResampler(24000, BOT_SAMPLE_RATE, BOT_CHANNELS, AudioResamplerQuality.MEDIUM);

  // --- Deepgram Voice Agent ---
  const agent = new DeepgramAgent(
    async (pcm24Buffer) => {
      // TTS audio from Deepgram (linear16 24kHz) → resample to 48kHz → publish to room
      const frame = new AudioFrame(
        new Int16Array(pcm24Buffer.buffer, pcm24Buffer.byteOffset, pcm24Buffer.byteLength / 2),
        24000,
        BOT_CHANNELS,
        pcm24Buffer.byteLength / 2,
      );
      const upsampled = resampler.push(frame);
      for (const f of upsampled) {
        await audioSource.captureFrame(f);
      }
    },
    (text) => logger.info({ text, room: roomName }, 'chatter said'),
    (text) => logger.info({ text, room: roomName }, 'user said'),
  );

  // --- Pump mixed audio into Deepgram ---
  async function pumpMixer() {
    for await (const frame of mixer) {
      // frame.data is Int16Array — wrap as Buffer for Deepgram WS send
      agent.sendPcmFrame(
        Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength),
      );
    }
  }

  // --- Room event handlers ---
  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (track.kind !== 'audio') return;
    logger.info({ participant: participant.identity, room: roomName }, 'audio track subscribed');
    const stream = new AudioStream(track, BOT_SAMPLE_RATE, BOT_CHANNELS);
    trackStreams.set(participant.identity, stream);
    mixer.addStream(stream);
  });

  room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => {
    const stream = trackStreams.get(participant.identity);
    if (stream) {
      mixer.removeStream(stream);
      trackStreams.delete(participant.identity);
      logger.info({ participant: participant.identity }, 'audio stream removed from mixer');
    }
  });

  room.on(RoomEvent.Disconnected, async () => {
    logger.info({ room: roomName }, 'bot disconnected');
    agent.disconnect();
    resampler.close();
    await mixer.aclose();
    await dispose();
  });

  room.on(RoomEvent.ParticipantConnected, (p) =>
    logger.info({ participant: p.identity, room: roomName }, 'participant joined'),
  );

  room.on(RoomEvent.ParticipantDisconnected, (p) =>
    logger.info({ participant: p.identity, room: roomName }, 'participant left'),
  );

  // --- Connect ---
  const token = await makeBotToken(roomName);
  await room.connect(LIVEKIT_URL, token, { autoSubscribe: true, dynacast: true });
  logger.info({ room: roomName }, 'chatter bot connected');

  await room.localParticipant.publishTrack(localTrack, pubOptions);
  logger.info({ room: roomName }, 'bot audio track published');

  agent.connect();

  // Pump mixer in background — don't await (runs until room closes)
  pumpMixer().catch((err) => logger.error({ err: err.message, room: roomName }, 'mixer pump error'));

  return room;
}

module.exports = { startBot };
