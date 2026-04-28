require('dotenv').config();
const WebSocket = require('ws');
const logger = require('./logger');
const { buildAgentSystemPrompt } = require('./agent-configs');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

const MARK_COMPLETE_FN = {
  name: 'mark_complete',
  description: 'Call this when the task is done, voicemail was left, or it cannot be completed. Always call this to end the call.',
  parameters: {
    type: 'object',
    properties: {
      result: {
        type: 'string',
        description: 'Brief summary of what was accomplished or why it failed',
      },
    },
    required: ['result'],
  },
};

function buildGreeting(agentType) {
  switch (agentType) {
    case 'food_ordering':          return "Hi! I'd like to place an order for pickup, please.";
    case 'appointment_booking':    return "Hi, I'd like to book an appointment, please.";
    case 'general_customer_service': return "Hi, I'm calling to get some help with an issue. Could you assist me?";
    case 'insurance_calls':        return "Hi, I'm calling about my insurance policy. Could I speak with someone who can help me?";
    default:                       return "Hi, I have a quick request. Could you help me with that?";
  }
}

class OutboundAgent {
  constructor({ taskId, description, phoneNumber, agentType = 'generic', agentMode = null, userContext = null, onAudioOut, onMarkComplete, onAgentText, onUserText }) {
    this.taskId         = taskId;
    this.description    = description;
    this.phoneNumber    = phoneNumber;
    this.agentType      = agentType;
    this.agentMode      = agentMode;
    this.userContext    = userContext;
    this.onAudioOut     = onAudioOut;
    this.onMarkComplete = onMarkComplete;
    this.onAgentText    = onAgentText;
    this.onUserText     = onUserText;

    this.ws              = null;
    this.ready           = false;
    this.agentSpeaking   = false;
    this._keepAlive      = null;
    this._disconnecting  = false;
    this._pendingFrames  = [];
  }

  connect() {
    logger.info({ taskId: this.taskId, phoneNumber: this.phoneNumber }, 'outbound agent connecting');

    this.ws = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', ['token', DEEPGRAM_API_KEY]);

    this.ws.on('open', () => {
      logger.info({ taskId: this.taskId }, 'deepgram voice agent websocket open');
      this._sendSettings();
      this._startKeepAlive();
    });

    this.ws.on('message', (data, isBinary) => {
      if (isBinary) {
        this.onAudioOut?.(Buffer.from(data));
        return;
      }
      try {
        this._handleEvent(JSON.parse(data.toString()));
      } catch {
        logger.warn({ raw: data.toString().slice(0, 100) }, 'outbound agent non-json message');
      }
    });

    this.ws.on('error', (err) => {
      logger.error({ taskId: this.taskId, err: err.message }, 'outbound agent websocket error');
    });

    this.ws.on('close', (code, reason) => {
      this.ready = false;
      this._stopKeepAlive();
      logger.info({ taskId: this.taskId, code, reason: reason?.toString() }, 'outbound agent websocket closed');
      // Abnormal close mid-call — mark task failed so it doesn't stay in 'calling' forever
      if (code !== 1000 && code !== 1001 && !this._disconnecting) {
        this.onMarkComplete?.('Call interrupted: connection to voice service lost', 'failed');
      }
    });
  }

  _sendSettings() {
    const systemPrompt = buildAgentSystemPrompt({
      agentType:   this.agentType,
      agentMode:   this.agentMode,
      description: this.description,
      phoneNumber: this.phoneNumber,
      userContext: this.userContext,
    });

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
          prompt: systemPrompt,
          functions: [MARK_COMPLETE_FN],
        },
        speak: {
          provider: { type: 'deepgram', model: 'aura-2-odysseus-en' },
        },
        greeting: buildGreeting(this.agentType),
      },
    };
    this.ws.send(JSON.stringify(settings));
    logger.info({ taskId: this.taskId, agentType: this.agentType }, 'outbound agent settings sent');
  }

  _startKeepAlive() {
    this._keepAlive = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 10000);
  }

  _stopKeepAlive() {
    if (this._keepAlive) {
      clearInterval(this._keepAlive);
      this._keepAlive = null;
    }
  }

  _handleEvent(msg) {
    switch (msg.type) {
      case 'SettingsApplied':
        this.ready = true;
        logger.info({ taskId: this.taskId }, 'outbound agent ready');
        if (this._pendingFrames.length > 0) {
          for (const frame of this._pendingFrames) {
            if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
          }
          this._pendingFrames = [];
        }
        break;
      case 'AgentStartedSpeaking':
        this.agentSpeaking = true;
        break;
      case 'AgentAudioDone':
        this.agentSpeaking = false;
        break;
      case 'ConversationText':
        if (msg.role === 'user' && msg.content) {
          logger.info({ taskId: this.taskId, text: msg.content }, 'user said');
          this.onUserText?.(msg.content);
        }
        if (msg.role === 'assistant' && msg.content) {
          logger.info({ taskId: this.taskId, text: msg.content }, 'agent said');
          this.onAgentText?.(msg.content);
        }
        break;
      case 'FunctionCallRequest':
        this._handleFunctionCall(msg).catch(err =>
          logger.error({ taskId: this.taskId, err: err.message }, 'function call handler failed')
        );
        break;
      case 'Welcome':
        logger.info({ taskId: this.taskId, session_id: msg.session_id }, 'outbound agent welcome');
        break;
      case 'Error':
        logger.error({ taskId: this.taskId, description: msg.description, code: msg.code }, 'outbound agent error event');
        this.onMarkComplete?.(`Call failed: agent error (${msg.code || msg.description || 'unknown'})`, 'failed');
        this.disconnect();
        break;
      default:
        logger.debug({ taskId: this.taskId, type: msg.type }, 'outbound agent event');
    }
  }

  async _handleFunctionCall(msg) {
    // Support both format A and format B from Deepgram
    let id, name, rawArgs;

    if (msg.functions && Array.isArray(msg.functions) && msg.functions.length > 0) {
      // Format B: { type: 'FunctionCallRequest', functions: [{ id, name, arguments }] }
      const fn = msg.functions[0];
      id      = fn.id;
      name    = fn.name;
      rawArgs = fn.arguments;
    } else {
      // Format A: { type: 'FunctionCallRequest', function_call_id, input: { name, arguments } }
      id      = msg.function_call_id;
      name    = msg.input?.name;
      rawArgs = msg.input?.arguments;
    }

    logger.info({ taskId: this.taskId, id, name }, 'outbound agent function call request');

    if (name === 'mark_complete') {
      let result;
      try {
        const parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
        result = parsed?.result ?? String(rawArgs);
      } catch {
        result = String(rawArgs);
      }

      logger.info({ taskId: this.taskId, result }, 'mark_complete called');
      this.onMarkComplete?.(result);
      // client_side function — no FunctionCallResponse; hangUp() will close the stream
    } else {
      logger.warn({ taskId: this.taskId, name }, 'outbound agent unknown function');
    }
  }

  sendPcmFrame(linear16Buf) {
    if (!this.ready) {
      this._pendingFrames.push(linear16Buf);
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(linear16Buf);
  }

  disconnect() {
    this.ready = false;
    this._disconnecting = true;
    this._stopKeepAlive();
    this.ws?.close();
    logger.info({ taskId: this.taskId }, 'outbound agent disconnected');
  }
}

module.exports = OutboundAgent;
