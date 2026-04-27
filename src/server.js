require('dotenv').config();
const http = require('http');
const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const axios = require('axios');
const db = require('./db');
const audio = require('./audio');
const OutboundAgent = require('./agent');
const { initiateCall, hangUp } = require('./outbound');
const { routeToAgent } = require('./agent-router');
const { findBusiness } = require('./search');
const logger = require('./logger');

const app = express();
const server = http.createServer(app);
expressWs(app, server);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(process.cwd(), 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the webhook base URL and return the bare hostname (no scheme/trailing slash).
 * Falls back to req.headers.host if TWILIO_WEBHOOK_BASE is not set.
 */
function getHost(req) {
  const base = process.env.TWILIO_WEBHOOK_BASE || process.env.BASE_URL;
  if (base) {
    try {
      return new URL(base).host;
    } catch {
      return base.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    }
  }
  return req.headers.host;
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Call Gemini 2.5 Flash via the REST API and return parsed JSON from the model.
 */
async function parseTaskWithGemini(request) {
  const today = new Date().toISOString().split('T')[0];
  const prompt = `Extract from this request:
- phone_number: E.164 format (e.g. +16505551234), or null if no number given.
- description: what to accomplish on the call. Required. Should be a clear action sentence.
- business_query: if no phone number, what business/service to search for (e.g. "nearest pizza place", "dentist"). Null if phone number was provided.
- location_hint: city, neighborhood, or zip code if mentioned for finding a business. Null if not mentioned.
- scheduled_at: ISO 8601 datetime if a specific time was mentioned, else null. Assume today's date ${today}. Use UTC.
- user_context: any personal info in the request useful for identity verification or completing the task (name, account numbers, dates, preferences). Null if none.

Return valid JSON only, no explanation, no markdown.
Input: "${request}"`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
  }, { timeout: 15000 });

  const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Strip optional markdown fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    logger.error({ raw, cleaned, err: err.message }, 'Gemini response was not valid JSON');
    throw new Error(`Gemini returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /tasks — create and optionally fire a new outbound task
app.post('/tasks', async (req, res) => {
  const { request } = req.body;
  if (!request || typeof request !== 'string') {
    return res.status(400).json({ error: 'request body must include a "request" string.' });
  }

  let parsed;
  try {
    parsed = await parseTaskWithGemini(request);
  } catch (err) {
    logger.error({ err: err.message }, 'Gemini parse failed');
    return res.status(500).json({ error: 'Failed to parse request with Gemini.', detail: err.message });
  }

  const {
    phone_number: rawPhone,
    description,
    business_query: businessQuery,
    location_hint: locationHint,
    scheduled_at,
    user_context: userContext,
  } = parsed;

  if (!description) {
    return res.status(400).json({ error: 'Could not determine what to accomplish on the call.' });
  }

  let phoneNumber = rawPhone || null;
  let businessName = null;

  // If no phone number, search for the business
  if (!phoneNumber) {
    if (!businessQuery) {
      return res.status(400).json({ error: 'Please include a phone number or a business to call.' });
    }
    logger.info({ businessQuery, locationHint }, 'no phone — searching for business');
    const found = await findBusiness(businessQuery, locationHint);
    if (!found || !found.phoneNumber) {
      return res.status(400).json({ error: `Could not find a phone number for "${businessQuery}". Try adding a city or address.` });
    }
    phoneNumber = found.phoneNumber;
    businessName = found.businessName;
    logger.info({ businessName, phoneNumber }, 'business resolved');
  }

  // Classify description into agent type + mode
  const { agentType, agentMode } = await routeToAgent(description);

  const webhookBase = process.env.TWILIO_WEBHOOK_BASE || process.env.BASE_URL;

  // Determine if we should fire immediately or schedule
  const fireNow = !scheduled_at || new Date(scheduled_at) <= new Date();

  if (fireNow) {
    const task = db.createTask({
      description,
      phone_number: phoneNumber,
      scheduled_at: null,
      agent_type: agentType,
      agent_mode: agentMode,
      user_context: userContext,
      business_name: businessName,
      location_hint: locationHint,
    });
    db.updateTaskStatus(task.id, 'calling');

    try {
      await initiateCall({ taskId: task.id, phoneNumber, webhookBase });
    } catch (err) {
      logger.error({ err: err.message, taskId: task.id }, 'initiateCall failed');
      db.updateTaskStatus(task.id, 'failed', err.message);
      return res.status(500).json({ error: 'Failed to initiate call.', detail: err.message });
    }

    const updated = db.getTask(task.id);
    return res.json({ ...updated, status: 'calling' });
  }

  // Future scheduled task
  const task = db.createTask({
    description,
    phone_number: phoneNumber,
    scheduled_at,
    agent_type: agentType,
    agent_mode: agentMode,
    user_context: userContext,
    business_name: businessName,
    location_hint: locationHint,
  });
  logger.info({ taskId: task.id, scheduled_at, agentType }, 'task scheduled');
  return res.json({ ...task, status: 'pending', scheduled_at });
});

// GET /tasks — list all tasks, newest first
app.get('/tasks', (_req, res) => {
  const tasks = db.listTasks();
  res.json(tasks);
});

// GET /tasks/:id — single task with transcripts
app.get('/tasks/:id', (req, res) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json(task);
});

// PATCH /tasks/:id — manually complete a calling task with a result
app.patch('/tasks/:id', (req, res) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const { status = 'completed', result } = req.body;
  const validStatuses = ['completed', 'failed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  db.updateTaskStatus(req.params.id, status, result);
  if (task.call_sid && ['completed', 'failed'].includes(status)) {
    hangUp(task.call_sid).catch(() => {});
  }
  res.json({ id: req.params.id, status });
});

// DELETE /tasks/:id — cancel a pending/scheduled task
app.delete('/tasks/:id', (req, res) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  if (!['pending', 'scheduled'].includes(task.status)) {
    return res.status(400).json({ error: `Cannot cancel a task with status '${task.status}'.` });
  }

  db.updateTaskStatus(req.params.id, 'cancelled');
  res.json({ id: req.params.id, status: 'cancelled' });
});

// POST /outbound-twiml — return TwiML to Twilio to start a media stream
app.post('/outbound-twiml', (req, res) => {
  const taskId = req.query.taskId || req.body.taskId;
  const host = getHost(req);

  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/stream">
      <Parameter name="taskId" value="${xmlEscape(taskId)}"/>
    </Stream>
  </Connect>
</Response>`);
});

// POST /call-status — Twilio statusCallback (form-encoded)
app.post('/call-status', (req, res) => {
  const callStatus = req.body.CallStatus;
  const callSid = req.body.CallSid;

  logger.info({ callSid, callStatus }, 'call status update');

  const task = db.getTaskByCallSid(callSid);

  if (!task) {
    logger.warn({ callSid }, 'call-status: no matching task found');
    return res.sendStatus(200);
  }

  if (['no-answer', 'busy', 'failed'].includes(callStatus)) {
    db.updateTaskStatus(task.id, 'failed', callStatus);
  }
  // 'completed' from Twilio means the call ended — not that the task succeeded.
  // Actual task success/failure is set by mark_complete or the stream stop handler.
  // We do not write 'completed' here to avoid racing with those handlers.

  res.sendStatus(200);
});

// GET /api/health
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    activeCalls: db.countActive(),
    timestamp: new Date().toISOString(),
  });
});

// GET / — serve index.html
app.get('/', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// WebSocket: /stream — Twilio Media Streams handler
// ---------------------------------------------------------------------------
app.ws('/stream', (ws, _req) => {
  let agent = null;
  let callSid = null;
  let taskId = null;
  let streamSid = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.event === 'start') {
      callSid = msg.start.callSid;
      taskId = msg.start.customParameters?.taskId;
      streamSid = msg.start.streamSid;

      logger.info({ callSid, taskId, streamSid }, 'stream started');

      if (!taskId) {
        logger.error('no taskId in stream start — closing');
        ws.close();
        return;
      }

      const task = db.getTask(taskId);
      if (!task) {
        logger.error({ taskId }, 'task not found for stream');
        ws.close();
        return;
      }

      db.updateCallSid(taskId, callSid);
      db.updateTaskStatus(taskId, 'calling');

      agent = new OutboundAgent({
        taskId,
        description: task.description,
        phoneNumber: task.phone_number,
        agentType:   task.agent_type  || 'generic',
        agentMode:   task.agent_mode  || null,
        userContext: task.user_context || null,

        onAudioOut: (pcm24k) => {
          const pcm8k = audio.downsample24to8(pcm24k);
          const mulaw = audio.mulawEncode(pcm8k);
          const payload = mulaw.toString('base64');
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              event: 'media',
              streamSid,
              media: { payload },
            }));
          }
        },

        onMarkComplete: async (result, status = 'completed') => {
          db.updateTaskStatus(taskId, status, result);
          try {
            await hangUp(callSid);
          } catch (err) {
            logger.warn({ err: err.message }, 'hangUp after completion failed');
          }
        },

        onAgentText: (text) => db.addTranscript(taskId, 'assistant', text),
        onUserText: (text) => db.addTranscript(taskId, 'user', text),
      });

      agent.connect();
    }

    if (msg.event === 'media' && agent) {
      const mulaw = Buffer.from(msg.media.payload, 'base64');
      const pcm8k = audio.mulawDecode(mulaw);
      const pcm48k = audio.upsample8to48(pcm8k);
      agent.sendPcmFrame(pcm48k);
    }

    if (msg.event === 'stop') {
      logger.info({ callSid, taskId }, 'stream stopped');
      if (agent) {
        agent.disconnect();
        agent = null;
      }
      const task = taskId ? db.getTask(taskId) : null;
      if (task && !['completed', 'failed', 'cancelled'].includes(task.status)) {
        // Stream ended without mark_complete — treat as incomplete/interrupted
        db.updateTaskStatus(taskId, 'failed', 'Call ended without completing the task');
      }
    }
  });

  ws.on('close', () => {
    logger.info({ callSid, taskId }, 'WebSocket closed');
    if (agent) {
      agent.disconnect();
      agent = null;
    }
  });

  ws.on('error', (err) => {
    logger.error({ err: err.message, callSid, taskId }, 'WebSocket error');
    if (agent) {
      agent.disconnect();
      agent = null;
    }
  });
});

module.exports = { app, server };
