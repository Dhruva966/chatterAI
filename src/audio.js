'use strict';

// ITU-T G.711 μ-law decode: single μ-law byte → signed 16-bit PCM sample
function mulawSampleDecode(mulaw) {
  mulaw = ~mulaw & 0xFF;
  const sign = mulaw & 0x80;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0F;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

// ITU-T G.711 μ-law encode: signed 16-bit PCM sample → μ-law byte
const MULAW_BIAS = 0x84; // 132 — ITU-T G.711 standard bias
const MULAW_CLIP = 32767;
function mulawSampleEncode(sample) {
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  sample = Math.min(sample + MULAW_BIAS, MULAW_CLIP);
  let exp = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exp > 0; exp--, expMask >>= 1) {}
  const mantissa = (sample >> (exp + 3)) & 0x0F;
  return ~(sign | (exp << 4) | mantissa) & 0xFF;
}

/**
 * Decode a buffer of μ-law bytes to 16-bit signed PCM (little-endian).
 *
 * Twilio Media Streams sends audio as mulaw 8 kHz, base64-encoded.
 * After base64-decoding, pass the raw bytes here to get linear16 PCM
 * suitable for Deepgram Voice Agent (8 kHz, linear16).
 *
 * @param {Buffer} mulawBuf - Buffer of μ-law encoded bytes
 * @returns {Buffer} Buffer of Int16 PCM samples (2 bytes per sample, little-endian)
 */
function mulawDecode(mulawBuf) {
  const out = Buffer.allocUnsafe(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    out.writeInt16LE(mulawSampleDecode(mulawBuf[i]), i * 2);
  }
  return out;
}

/**
 * Encode a buffer of 16-bit signed PCM (little-endian) to μ-law bytes.
 *
 * Use this to convert Deepgram Voice Agent linear16 output back to
 * mulaw before sending to Twilio Media Streams.
 *
 * @param {Buffer} pcmBuf - Buffer of Int16 PCM samples (little-endian, 2 bytes each)
 * @returns {Buffer} Buffer of μ-law encoded bytes (1 byte per sample)
 */
function mulawEncode(pcmBuf) {
  const numSamples = Math.floor(pcmBuf.length / 2);
  const out = Buffer.allocUnsafe(numSamples);
  for (let i = 0; i < numSamples; i++) {
    out[i] = mulawSampleEncode(pcmBuf.readInt16LE(i * 2));
  }
  return out;
}

// Upsample linear16 8kHz → 48kHz by repeating each sample 6×
function upsample8to48(buf) {
  const numSamples = Math.floor(buf.length / 2);
  const out = Buffer.allocUnsafe(numSamples * 12);
  for (let i = 0; i < numSamples; i++) {
    const sample = buf.readInt16LE(i * 2);
    for (let j = 0; j < 6; j++) out.writeInt16LE(sample, i * 12 + j * 2);
  }
  return out;
}

// Downsample linear16 24kHz → 8kHz by taking every 3rd sample
function downsample24to8(buf) {
  const numSamples = Math.floor(buf.length / 2);
  const outSamples = Math.floor(numSamples / 3);
  const out = Buffer.allocUnsafe(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    out.writeInt16LE(buf.readInt16LE(i * 6), i * 2);
  }
  return out;
}

module.exports = { mulawDecode, mulawEncode, upsample8to48, downsample24to8 };
