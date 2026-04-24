/**
 * Audio transcoding between Twilio Media Streams and Deepgram Voice Agent.
 *
 * Twilio conference:  mulaw 8kHz  (G.711, 8-bit, 160 bytes = 20ms frame)
 * Deepgram Agent in:  linear16 48kHz (PCM, 16-bit, 1920 bytes = 20ms frame)
 * Deepgram Agent out: linear16 24kHz (PCM, 16-bit)
 */

// ----- mulaw <-> PCM16 (G.711 standard) -----

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

const EXP_TABLE = (() => {
  const t = new Int8Array(256);
  for (let i = 0; i < 256; i++) {
    t[i] = Math.floor(Math.log(i) / Math.log(2));
  }
  return t;
})();

function pcm16ToMulaw(sample) {
  let sign = 0;
  if (sample < 0) { sign = 0x80; sample = -sample; }
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  sample += MULAW_BIAS;
  const exp = EXP_TABLE[sample >> 7] & 0x07;
  const mantissa = (sample >> (exp + 3)) & 0x0F;
  return ~(sign | (exp << 4) | mantissa) & 0xFF;
}

function mulawToPcm16(ulaw) {
  ulaw = ~ulaw & 0xFF;
  const sign = ulaw & 0x80;
  const exp = (ulaw >> 4) & 0x07;
  const mantissa = ulaw & 0x0F;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exp;
  return sign ? -sample : sample;
}

// ----- Twilio → Deepgram Agent -----
// mulaw 8kHz → linear16 48kHz (upsample 6x, linear interpolation)

function twilioToAgent(mulawBuf) {
  const sampleCount = mulawBuf.length; // 160 samples per 20ms frame
  const outSamples = sampleCount * 6;
  const out = Buffer.allocUnsafe(outSamples * 2);

  for (let i = 0; i < sampleCount; i++) {
    const curr = mulawToPcm16(mulawBuf[i]);
    const next = mulawToPcm16(mulawBuf[Math.min(i + 1, sampleCount - 1)]);
    for (let j = 0; j < 6; j++) {
      const interp = Math.round(curr + (next - curr) * (j / 6));
      out.writeInt16LE(Math.max(-32768, Math.min(32767, interp)), (i * 6 + j) * 2);
    }
  }
  return out;
}

// ----- Deepgram Agent → Twilio -----
// linear16 24kHz → mulaw 8kHz (downsample 3x, average, encode)

function agentToTwilio(pcmBuf) {
  const sampleCount = pcmBuf.length / 2; // 16-bit samples
  const outSamples = Math.floor(sampleCount / 3);
  const out = Buffer.allocUnsafe(outSamples);

  for (let i = 0; i < outSamples; i++) {
    const a = pcmBuf.readInt16LE(i * 6);
    const b = pcmBuf.readInt16LE(i * 6 + 2);
    const c = pcmBuf.readInt16LE(i * 6 + 4);
    const avg = Math.round((a + b + c) / 3);
    out[i] = pcm16ToMulaw(avg);
  }
  return out;
}

// Split a Buffer into N-byte chunks.
function chunk(buf, size) {
  const chunks = [];
  for (let i = 0; i < buf.length; i += size) {
    chunks.push(buf.slice(i, i + size));
  }
  return chunks;
}

module.exports = { twilioToAgent, agentToTwilio, chunk };
