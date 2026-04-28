require('dotenv').config();
const WebSocket = require('ws');
const Exa = require('exa-js').default;
const logger = require('./logger');

const exa = new Exa(process.env.EXA_API_KEY);

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;

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

async function webSearch(query) {
  const start = Date.now();
  try {
    const result = await exa.searchAndContents(query, {
      type: 'fast',
      numResults: 3,
      highlights: { numSentences: 3, highlightsPerUrl: 2 },
    });
    const text = (result.results || []).map(r => {
      const h = r.highlights?.join(' ') || r.text?.slice(0, 400) || '';
      return `${r.title}: ${h}`;
    }).join('\n\n');
    logger.info({ latency_ms: Date.now() - start, results: result.results?.length }, 'exa search complete');
    return text || 'No results found.';
  } catch (err) {
    logger.error({ err: err.message }, 'exa search failed');
    return 'Search unavailable.';
  }
}

/**
 * DeepgramAgent wraps the Deepgram Voice Agent WebSocket.
 *
 * Audio in:  raw linear16 48kHz PCM Buffer (from LiveKit via livekit-agent.js)
 * Audio out: raw linear16 24kHz PCM Buffer (to livekit-agent.js for resampling + publish)
 *
 * @param {function} onAudioOut  - called with Buffer of linear16 24kHz PCM
 * @param {function} onAgentText - called with string (agent response text)
 * @param {function} onUserText  - called with string (what user said)
 */
class DeepgramAgent {
  constructor(onAudioOut, onAgentText, onUserText) {
    this.onAudioOut   = onAudioOut;
    this.onAgentText  = onAgentText;
    this.onUserText   = onUserText;
    this.ws           = null;
    this.ready        = false;
    this.agentSpeaking = false;
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
      if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
        this._handleAgentAudio(Buffer.from(data));
        return;
      }
      try {
        this._handleEvent(JSON.parse(data.toString()));
      } catch {
        logger.warn({ raw: data.toString().slice(0, 100) }, 'deepgram agent non-json message');
      }
    });

    this.ws.on('error', (err) => logger.error({ err: err.message }, 'deepgram voice agent error'));
    this.ws.on('close', (code, reason) => {
      this.ready = false;
      logger.info({ code, reason: reason?.toString() }, 'deepgram voice agent closed');
    });
  }

  _sendSettings(extraPrompt = '') {
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
          prompt: extraPrompt ? `${CHATTER_PROMPT}\n\n${extraPrompt}` : CHATTER_PROMPT,
          ...(GEMINI_API_KEY ? { api_key: GEMINI_API_KEY } : {}),
          functions: [{
            name: 'web_search',
            description: 'Search the web for current information. Use for recent facts, prices, news, or data not in the conversation.',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string', description: 'Search query' } },
              required: ['query'],
            },
          }],
        },
        speak: {
          provider: { type: 'deepgram', model: 'aura-2-odysseus-en' },
        },
        greeting: null,
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
      case 'AgentStartedSpeaking':
        this.agentSpeaking = true;
        break;
      case 'AgentAudioDone':
        this.agentSpeaking = false;
        break;
      case 'ConversationText':
        if (msg.role === 'user' && msg.content)      { logger.info({ text: msg.content }, 'user said');  this.onUserText?.(msg.content); }
        if (msg.role === 'assistant' && msg.content) { logger.info({ text: msg.content }, 'agent said'); this.onAgentText?.(msg.content); }
        break;
      case 'FunctionCallRequest':
        this._handleFunctionCall(msg);
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

  async _handleFunctionCall(msg) {
    const { function_call_id, input } = msg;
    const name  = input?.name;
    const args  = input?.arguments;
    logger.info({ function_call_id, name }, 'agent function call request');

    let result = '';
    if (name === 'web_search') {
      const query = typeof args === 'string' ? JSON.parse(args).query : args?.query;
      result = await webSearch(query);
    } else {
      result = `Unknown function: ${name}`;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'FunctionCallResponse', function_call_id, output: result }));
    }
  }

  _handleAgentAudio(pcmChunk) {
    // Raw linear16 24kHz PCM from Deepgram — forward to caller (livekit-agent resamples to 48kHz)
    this.onAudioOut?.(pcmChunk);
  }

  // Send raw linear16 48kHz PCM from LiveKit directly to Deepgram Voice Agent.
  sendPcmFrame(pcmBuffer) {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.agentSpeaking) return; // don't feed own audio back
    this.ws.send(pcmBuffer);
  }

  // Inject context-specific system prompt addendum (called before connect()).
  setContextPrompt(extraPrompt) {
    this._extraPrompt = extraPrompt;
  }

  disconnect() {
    this.ready = false;
    this.ws?.close();
  }
}

module.exports = DeepgramAgent;
