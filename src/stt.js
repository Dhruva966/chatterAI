require('dotenv').config();
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const logger = require('./logger');

const WAKE_PHRASE = 'hey chatter';
const COOLDOWN_MS = 3000; // ADR-001: 3s after Chatter finishes speaking
const MAX_RECONNECTS = 3;

/**
 * StreamingSTT manages the Deepgram WebSocket for one Twilio Media Stream.
 *
 * Usage:
 *   const stt = new StreamingSTT(transcript, onWakeWord);
 *   stt.start();
 *   stt.sendFrame(base64AudioChunk);  // called for each Twilio media frame
 *   stt.mute() / stt.unmute();        // call around Chatter TTS playback (ADR-005)
 *   stt.stop();
 */
class StreamingSTT {
  constructor(transcript, onWakeWord) {
    this.transcript = transcript;
    this.onWakeWord = onWakeWord;
    this.muted = false;
    this.lastChatterEndTime = 0;
    this.reconnectAttempts = 0;
    this.connection = null;
    this.stopped = false;
    this._frameQueue = []; // buffer during reconnect (ADR-004)
  }

  start() {
    this._connect();
  }

  _connect() {
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    this.connection = deepgram.listen.live({
      model: 'nova-2-phonecall', // optimized for 8kHz telephone audio
      encoding: 'mulaw',
      sample_rate: 8000,
      channels: 1,
      punctuate: true,
      interim_results: false, // ADR-001: final only
      endpointing: 400,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      logger.info('deepgram websocket open');
      this.reconnectAttempts = 0;
      // Flush buffered frames from reconnect window
      const buffered = this._frameQueue.splice(0);
      buffered.forEach(f => this._sendToDeepgram(f));
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data.channel?.alternatives?.[0];
      if (!alt?.transcript || !data.is_final) return;

      const text = alt.transcript.trim();
      if (!text) return;

      // Don't add Chatter's own speech back to transcript (ADR-005)
      // Chatter's audio is muted at the frame level, but add a belt-and-suspenders check
      if (!this.muted) {
        this.transcript.add('caller', text);
        this._checkWakeWord(text);
      }
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err) => {
      logger.error({ err: err.message }, 'deepgram error');
      this._reconnect();
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      if (!this.stopped) {
        logger.warn('deepgram websocket closed unexpectedly');
        this._reconnect();
      }
    });
  }

  _reconnect() {
    if (this.stopped || this.reconnectAttempts >= MAX_RECONNECTS) {
      logger.error({ attempts: this.reconnectAttempts }, 'deepgram reconnect limit reached');
      return;
    }
    const delay = Math.pow(2, this.reconnectAttempts) * 500; // 500ms, 1000ms, 2000ms
    this.reconnectAttempts++;
    logger.warn({ attempt: this.reconnectAttempts, delay_ms: delay }, 'deepgram reconnecting');
    setTimeout(() => this._connect(), delay);
  }

  sendFrame(base64Chunk) {
    if (this.muted) return; // ADR-005
    const buf = Buffer.from(base64Chunk, 'base64');
    if (this.connection?.getReadyState() === 1) {
      this._sendToDeepgram(buf);
    } else {
      // Buffer up to 2s (100 frames of 20ms) during reconnect
      if (this._frameQueue.length < 100) this._frameQueue.push(buf);
    }
  }

  _sendToDeepgram(buf) {
    this.connection.send(buf);
  }

  _checkWakeWord(text) {
    const normalized = text.toLowerCase();
    if (!normalized.includes(WAKE_PHRASE)) return;

    const now = Date.now();
    if (now - this.lastChatterEndTime < COOLDOWN_MS) {
      logger.info({ text, cooldown_remaining_ms: COOLDOWN_MS - (now - this.lastChatterEndTime) }, 'wake word suppressed (cooldown)');
      return;
    }

    // Extract the query: everything after "hey chatter"
    const phraseIndex = normalized.indexOf(WAKE_PHRASE);
    const query = text.slice(phraseIndex + WAKE_PHRASE.length).trim();

    logger.info({ text, query }, 'wake word detected');
    this.onWakeWord(query || null);
  }

  // Call before Chatter starts speaking (ADR-005)
  mute() {
    this.muted = true;
    logger.debug('deepgram muted (chatter speaking)');
  }

  // Call after Chatter finishes speaking + 500ms buffer
  unmute() {
    this.muted = false;
    this.lastChatterEndTime = Date.now();
    logger.debug('deepgram unmuted');
  }

  stop() {
    this.stopped = true;
    this.connection?.finish();
  }
}

module.exports = StreamingSTT;
