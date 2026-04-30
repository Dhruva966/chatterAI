require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const FRAME_BYTES = 160; // 20ms frame at 8kHz 8-bit mulaw (ADR-006)

/**
 * Synthesize text to mulaw 8kHz audio frames using ElevenLabs Flash v2.
 * Returns an array of 160-byte Buffers (20ms frames) for Twilio Media Streams.
 *
 * If ElevenLabs fails the spike test, replace this with polly() from tts-polly.js.
 */
async function synthesize(text) {
  const start = Date.now();
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
      {
        text,
        model_id: 'eleven_flash_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/basic', // mulaw
        },
        params: { output_format: 'ulaw_8000' },
        responseType: 'arraybuffer',
      }
    );

    const ttfb = Date.now() - start;
    logger.info({ ttfb_ms: ttfb, bytes: response.data.byteLength, text_len: text.length }, 'elevenlabs tts complete');

    return chunkFrames(Buffer.from(response.data));
  } catch (err) {
    logger.error({ err: err.message, status: err.response?.status }, 'elevenlabs tts failed');
    throw err;
  }
}

// Split raw audio buffer into 160-byte frames (20ms each at 8kHz 8-bit).
function chunkFrames(buf) {
  const frames = [];
  for (let i = 0; i < buf.length; i += FRAME_BYTES) {
    frames.push(buf.slice(i, i + FRAME_BYTES));
  }
  return frames;
}

module.exports = { synthesize };
