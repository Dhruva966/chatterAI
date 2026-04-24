require('dotenv').config();
const WebSocket = require('ws');
const { twilioToAgent, agentToTwilio, chunk } = require('./audio');
const logger = require('./logger');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TWILIO_FRAME_BYTES = 160; // 20ms mulaw frame for injection back to Twilio

const CHATTER_PROMPT = `You are Chatter, an AI assistant participating in a live phone call between two people.
You can hear the full conversation.

CRITICAL: Only respond when someone explicitly addresses you as "Chatter" or "Hey Chatter".
If people are talking to each other and not to you, stay completely silent — do not respond.

When you do respond:
- Be concise. Spoken answers only — 1 to 3 sentences max.
- No markdown, no lists, no formatting. Plain speech only.
- If you need to look something up, say so briefly while you retrieve it.
- Never repeat back the question. Just answer.

You are a helpful research assistant. Answer factual questions, give context, look things up.`;

/**
 * DeepgramAgent wraps the Deepgram Voice Agent WebSocket for one Chatter bot leg.
 *
 * The agent handles STT (Deepgram Flux), LLM (Gemini 2.5 Flash), and TTS (Deepgram Aura)
 * in a single bidirectional WebSocket connection.
 *
 * Audio in:  linear16 48kHz (converted from Twilio's mulaw 8kHz via audio.js)
 * Audio out: linear16 24kHz (converted back to mulaw 8kHz for Twilio injection)
 *
 * @param {function} onAudioOut  - called with Buffer[] of mulaw 8kHz frames to inject into Twilio
 * @param {function} onAgentText - called with string (agent's response text, for logging/transcript)
 * @param {function} onUserText  - called with string (what user said, for transcript)
 */
class DeepgramAgent {
  constructor(onAudioOut, onAgentText, onUserText) {
    this.onAudioOut = onAudioOut;
    this.onAgentText = onAgentText;
    this.onUserText = onUserText;
    this.ws = null;
    this.ready = false;
    this.agentSpeaking = false;
    this._pcmBuffer = Buffer.alloc(0); // accumulate partial PCM output from agent
  }

  connect() {
    this.ws = new WebSocket('wss://agent.deepgram.com/agent', {
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
    });

    this.ws.on('open', () => {
      logger.info('deepgram voice agent websocket open');
      this._sendSettings();
    });

    this.ws.on('message', (data) => {
      // Binary message = audio from agent (linear16 24kHz)
      if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
        this._handleAgentAudio(Buffer.from(data));
        return;
      }

      // Text message = JSON event
      try {
        const msg = JSON.parse(data.toString());
        this._handleEvent(msg);
      } catch (e) {
        logger.warn({ raw: data.toString().slice(0, 100) }, 'deepgram agent non-json message');
      }
    });

    this.ws.on('error', (err) => {
      logger.error({ err: err.message }, 'deepgram voice agent error');
    });

    this.ws.on('close', (code, reason) => {
      this.ready = false;
      logger.info({ code, reason: reason?.toString() }, 'deepgram voice agent closed');
    });
  }

  _sendSettings() {
    const settings = {
      type: 'Settings',
      audio: {
        input:  { encoding: 'linear16', sample_rate: 48000 },
        output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
      },
      agent: {
        listen: {
          provider: { type: 'deepgram', version: 'v2', model: 'flux-general-en' },
        },
        think: {
          provider: { type: 'google', model: 'gemini-2.5-flash' },
          prompt: CHATTER_PROMPT,
          ...(GEMINI_API_KEY ? { api_key: GEMINI_API_KEY } : {}),
        },
        speak: {
          provider: { type: 'deepgram', model: 'aura-2-odysseus-en' },
        },
        greeting: null, // no greeting — Chatter waits to be addressed
      },
    };

    this.ws.send(JSON.stringify(settings));
    logger.debug('deepgram agent settings sent');
  }

  _handleEvent(msg) {
    switch (msg.type) {
      case 'SettingsApplied':
        this.ready = true;
        logger.info('deepgram agent ready');
        break;

      case 'UserStartedSpeaking':
        logger.debug('user started speaking');
        break;

      case 'AgentStartedSpeaking':
        this.agentSpeaking = true;
        logger.debug('agent started speaking');
        break;

      case 'AgentAudioDone':
        this.agentSpeaking = false;
        // Flush any remaining PCM buffer
        if (this._pcmBuffer.length > 0) {
          this._flushPcmBuffer();
        }
        logger.debug('agent audio done');
        break;

      case 'ConversationText':
        if (msg.role === 'user' && msg.content) {
          logger.info({ text: msg.content }, 'user said');
          this.onUserText?.(msg.content);
        } else if (msg.role === 'assistant' && msg.content) {
          logger.info({ text: msg.content }, 'agent said');
          this.onAgentText?.(msg.content);
        }
        break;

      case 'Welcome':
        logger.info({ session_id: msg.session_id }, 'deepgram agent welcome');
        break;

      case 'Error':
        logger.error({ description: msg.description, code: msg.code }, 'deepgram agent error event');
        break;

      default:
        logger.debug({ type: msg.type }, 'deepgram agent event');
    }
  }

  _handleAgentAudio(pcmChunk) {
    // Accumulate PCM output and convert to mulaw 8kHz frames for Twilio
    this._pcmBuffer = Buffer.concat([this._pcmBuffer, pcmChunk]);

    // Process in chunks of 6 bytes (3 samples at 16-bit = 1 output sample at 8kHz)
    // Minimum sensible chunk: 160 output mulaw samples = 480 input PCM bytes (60 input samples * 2 bytes * 3 for 24→8 downsample)
    const inputBytesPerFrame = TWILIO_FRAME_BYTES * 3 * 2; // 960 bytes of 24kHz PCM per Twilio frame
    while (this._pcmBuffer.length >= inputBytesPerFrame) {
      const slice = this._pcmBuffer.slice(0, inputBytesPerFrame);
      this._pcmBuffer = this._pcmBuffer.slice(inputBytesPerFrame);
      const mulawFrame = agentToTwilio(slice);
      this.onAudioOut([mulawFrame]);
    }
  }

  _flushPcmBuffer() {
    if (this._pcmBuffer.length === 0) return;
    // Pad to multiple of 6 bytes and convert remaining
    const padded = Buffer.alloc(Math.ceil(this._pcmBuffer.length / 6) * 6);
    this._pcmBuffer.copy(padded);
    const mulawFrame = agentToTwilio(padded);
    this.onAudioOut([mulawFrame]);
    this._pcmBuffer = Buffer.alloc(0);
  }

  // Send a Twilio mulaw 8kHz frame to the agent (converts to linear16 48kHz).
  sendTwilioFrame(base64Chunk) {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Don't feed our own audio back to the agent while it's speaking
    if (this.agentSpeaking) return;
    const mulawBuf = Buffer.from(base64Chunk, 'base64');
    const pcmBuf = twilioToAgent(mulawBuf);
    this.ws.send(pcmBuf);
  }

  disconnect() {
    this.ready = false;
    this.ws?.close();
  }
}

module.exports = DeepgramAgent;
