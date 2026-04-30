require('dotenv').config();
const http = require('http');
const express = require('express');
const expressWs = require('express-ws');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const db = require('./db');
const audio = require('./audio');
const OutboundAgent = require('./agent');
const { initiateCall, hangUp } = require('./outbound');
const { routeToAgent } = require('./agent-router');
const { findBusiness } = require('./search');
const logger = require('./logger');
const { requireAuth } = require('./middleware/auth');
const twilio = require('twilio');

// Validates that incoming POST is genuinely from Twilio.
// Skipped in development (no BASE_URL set) to allow ngrok testing.
function requireTwilioSignature(req, res, next) {
  const webhookBase = process.env.TWILIO_WEBHOOK_BASE || process.env.BASE_URL;
  if (!webhookBase) return next(); // dev — skip
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers['x-twilio-signature'] || '';
  const url = `${webhookBase}${req.originalUrl}`;
  if (!twilio.validateRequest(authToken, signature, url, req.body)) {
    logger.warn({ url }, 'rejected request with invalid Twilio signature');
    return res.status(403).send('Forbidden');
  }
  next();
}

const app = express();
const server = http.createServer(app);
expressWs(app, server);

app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(process.cwd(), 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    logger.error({ raw, cleaned, err: err.message }, 'Gemini response was not valid JSON');
    throw new Error(`Gemini returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Routes — user-facing (require auth)
// ---------------------------------------------------------------------------

app.post('/tasks', requireAuth, async (req, res) => {
  const { request } = req.body;

  // Batch mode: phone_number provided directly — skip Gemini parsing
  let parsed;
  if (req.body.phone_number) {
    const desc = req.body.description || request;
    if (!desc) return res.status(400).json({ error: 'description or request required in batch mode.' });
    parsed = {
      phone_number: req.body.phone_number,
      description: desc,
      business_query: null,
      location_hint: req.body.location_hint || null,
      scheduled_at: req.body.scheduled_at || null,
      user_context: null,
    };
  } else {
    if (!request || typeof request !== 'string') {
      return res.status(400).json({ error: 'request body must include a "request" string.' });
    }
    try {
      parsed = await parseTaskWithGemini(request);
    } catch (err) {
      logger.error({ err: err.message }, 'Gemini parse failed');
      return res.status(500).json({ error: 'Failed to parse request with Gemini.', detail: err.message });
    }
  }

  const {
    phone_number: rawPhone,
    description,
    business_query: businessQuery,
    location_hint: parsedLocationHint,
    scheduled_at,
    user_context: userContext,
  } = parsed;

  // Merge location from direct request body (sent by frontend geolocation) as fallback
  const locationHint = parsedLocationHint || req.body.location_hint || null;

  if (!description) {
    return res.status(400).json({ error: 'Could not determine what to accomplish on the call.' });
  }

  let phoneNumber = rawPhone || null;
  let businessName = null;

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

  let agentType, agentMode;
  try {
    ({ agentType, agentMode } = await routeToAgent(description));
  } catch (err) {
    logger.error({ err: err.message }, 'routeToAgent failed');
    return res.status(500).json({ error: 'Failed to route request to agent.' });
  }

  const webhookBase = process.env.TWILIO_WEBHOOK_BASE || process.env.BASE_URL;

  // Merge profile personal context with any request-level context
  let profileContext;
  try {
    profileContext = await db.getUserContext(req.user.id);
  } catch (err) {
    logger.warn({ err: err.message }, 'getUserContext failed — continuing without profile');
    profileContext = null;
  }
  const mergedContext = userContext
    ? `${JSON.stringify(profileContext)}\n${userContext}`
    : JSON.stringify(profileContext);

  const fireNow = !scheduled_at || new Date(scheduled_at) <= new Date();

  if (fireNow) {
    const task = await db.createTask({
      description,
      phone_number: phoneNumber,
      scheduled_at: null,
      agent_type: agentType,
      agent_mode: agentMode,
      user_context: mergedContext,
      business_name: businessName,
      location_hint: locationHint,
    }, req.user.id);

    await db.updateTaskStatus(task.id, 'calling');

    try {
      await initiateCall({ taskId: task.id, phoneNumber, webhookBase });
    } catch (err) {
      logger.error({ err: err.message, taskId: task.id }, 'initiateCall failed');
      await db.updateTaskStatus(task.id, 'failed', err.message);
      return res.status(500).json({ error: 'Failed to initiate call.', detail: err.message });
    }

    const updated = await db.getTask(task.id);
    return res.json({ ...updated, status: 'calling' });
  }

  const task = await db.createTask({
    description,
    phone_number: phoneNumber,
    scheduled_at,
    agent_type: agentType,
    agent_mode: agentMode,
    user_context: mergedContext,
    business_name: businessName,
    location_hint: locationHint,
  }, req.user.id);

  logger.info({ taskId: task.id, scheduled_at, agentType }, 'task scheduled');
  return res.json({ ...task, status: 'pending', scheduled_at });
});

app.get('/tasks', requireAuth, async (req, res) => {
  const tasks = await db.listTasks(req.user.id);
  res.json(tasks);
});

app.get('/tasks/:id', requireAuth, async (req, res) => {
  const task = await db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
  res.json(task);
});

app.patch('/tasks/:id', requireAuth, async (req, res) => {
  const task = await db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

  const { status = 'completed', result } = req.body;
  const validStatuses = ['completed', 'failed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  await db.updateTaskStatus(req.params.id, status, result);
  if (task.call_sid && ['completed', 'failed'].includes(status)) {
    hangUp(task.call_sid).catch(() => {});
  }
  res.json({ id: req.params.id, status });
});

app.delete('/tasks/:id', requireAuth, async (req, res) => {
  const task = await db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

  if (!['pending', 'scheduled'].includes(task.status)) {
    return res.status(400).json({ error: `Cannot cancel a task with status '${task.status}'.` });
  }

  await db.updateTaskStatus(req.params.id, 'cancelled');
  res.json({ id: req.params.id, status: 'cancelled' });
});

// ---------------------------------------------------------------------------
// Agent CRUD routes
// ---------------------------------------------------------------------------

app.get('/api/phone-number', requireAuth, (_req, res) => {
  res.json({ phoneNumber: process.env.TWILIO_PHONE_NUMBER || null });
});

app.get('/agents', requireAuth, async (req, res) => {
  try {
    res.json(await db.listAgents(req.user.id));
  } catch (err) {
    logger.error({ err: err.message }, 'listAgents failed');
    res.status(500).json({ error: err.message });
  }
});

app.post('/agents', requireAuth, async (req, res) => {
  const { name, agent_type = 'generic', voice = 'aura-asteria-en', system_prompt } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    res.json(await db.createAgent({ name, agent_type, voice, system_prompt }, req.user.id));
  } catch (err) {
    logger.error({ err: err.message }, 'createAgent failed');
    res.status(500).json({ error: err.message });
  }
});

app.put('/agents/:id', requireAuth, async (req, res) => {
  const { name, agent_type, voice, system_prompt } = req.body;
  try {
    res.json(await db.updateAgent(req.params.id, req.user.id, { name, agent_type, voice, system_prompt }));
  } catch (err) {
    logger.error({ err: err.message }, 'updateAgent failed');
    res.status(500).json({ error: err.message });
  }
});

app.delete('/agents/:id', requireAuth, async (req, res) => {
  try {
    await db.deleteAgent(req.params.id, req.user.id);
    res.sendStatus(204);
  } catch (err) {
    logger.error({ err: err.message }, 'deleteAgent failed');
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Twilio webhooks — no auth (Twilio calls these, not users)
// ---------------------------------------------------------------------------

app.post('/outbound-twiml', requireTwilioSignature, (req, res) => {
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

app.post('/call-status', requireTwilioSignature, async (req, res) => {
  const callStatus = req.body.CallStatus;
  const callSid = req.body.CallSid;

  logger.info({ callSid, callStatus }, 'call status update');

  const task = await db.getTaskByCallSid(callSid);
  if (!task) {
    logger.warn({ callSid }, 'call-status: no matching task found');
    return res.sendStatus(200);
  }

  if (['no-answer', 'busy', 'failed'].includes(callStatus)) {
    await db.updateTaskStatus(task.id, 'failed', callStatus);
  }

  res.sendStatus(200);
});

app.get('/api/health', async (_req, res) => {
  const activeCalls = await db.countActive();
  res.json({ status: 'ok', activeCalls, timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// WebSocket: /stream — Twilio Media Streams (no user auth — Twilio connects here)
// ---------------------------------------------------------------------------
app.ws('/stream', (ws, _req) => {
  let agent = null;
  let callSid = null;
  let taskId = null;
  let streamSid = null;

  ws.on('message', (data) => {
    (async () => {
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

        const task = await db.getTask(taskId);
        if (!task) {
          logger.error({ taskId }, 'task not found for stream');
          ws.close();
          return;
        }
        // Verify the callSid from Twilio matches what we stored when the call was placed.
        // Guards against a rogue WebSocket client supplying a known taskId.
        if (task.call_sid && task.call_sid !== callSid) {
          logger.error({ taskId, expected: task.call_sid, got: callSid }, 'callSid mismatch — closing stream');
          ws.close();
          return;
        }

        await db.updateCallSid(taskId, callSid);
        await db.updateTaskStatus(taskId, 'calling');

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
              ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }));
            }
          },

          onMarkComplete: async (result, status = 'completed') => {
            await db.updateTaskStatus(taskId, status, result);

            // N8N post-call webhook — fire-and-forget, never blocks completion
            const n8nUrl = process.env.N8N_WEBHOOK_URL;
            if (n8nUrl) {
              db.getTask(taskId)
                .then(async completedTask => {
                  const user_email = await db.getUserEmail(completedTask.user_id).catch(() => null);
                  return fetch(n8nUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      event: 'call_completed',
                      task_id: taskId,
                      status,
                      result,
                      user_email,
                      task: completedTask,
                    }),
                  });
                })
                .catch(err => logger.warn({ err: err.message }, 'N8N webhook failed — non-fatal'));
            }

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
        if (agent) { agent.disconnect(); agent = null; }
        const task = taskId ? await db.getTask(taskId) : null;
        if (task && !['completed', 'failed', 'cancelled'].includes(task.status)) {
          await db.updateTaskStatus(taskId, 'failed', 'Call ended without completing the task');
        }
      }
    })().catch(err => logger.error({ err: err.message }, 'stream message handler error'));
  });

  ws.on('close', () => {
    logger.info({ callSid, taskId }, 'WebSocket closed');
    if (agent) { agent.disconnect(); agent = null; }
  });

  ws.on('error', (err) => {
    logger.error({ err: err.message, callSid, taskId }, 'WebSocket error');
    if (agent) { agent.disconnect(); agent = null; }
  });
});

module.exports = { app, server };
