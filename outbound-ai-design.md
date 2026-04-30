# Chatter — Outbound AI Calling Agent

**Repo:** https://github.com/Dhruva966/chatterAI.git  
**Working dir:** `/Users/dhruvavutukury/VoiceAI`  
**Branch:** `feat/outbound-ai-agent`  
**Authors:** Dhruva Vutukury + Shivansh  
**Last updated:** 2026-04-27

---

## What this is

An AI agent that makes phone calls on your behalf. You give it a natural language command. It parses the task, calls the business, handles the full conversation, and reports back what happened — including a live transcript while the call is in progress.

```
You: "Call Panda Garden and order a large taro boba for pickup at 5pm"
  ↓
Server parses → finds phone number → Twilio dials business
  ↓
AI agent speaks as you, handles the full conversation
  ↓
CLI streams transcript live → reports result when done
```

**The original "Chatter joins your call as third participant" idea is on hold.** The outbound agent is the current focus and is in a working state.

---

## What's built and working

### Core call flow

1. **POST /tasks** — accepts a natural language `request` string (+ optional `scheduled_at`)
2. **Gemini 2.5 Flash** parses the request into: phone number, task description, scheduled time, user context, and business name/location if no phone number provided
3. If no phone number: **Exa search + Gemini fallback** finds it
4. **Agent router** (second Gemini call) classifies the task into an agent type
5. **Twilio** initiates the outbound call
6. When answered: **Deepgram Voice Agent** WebSocket opens — handles STT + TTS + LLM conversation in one session
7. Agent calls `mark_complete` tool when task is done → Twilio call ends
8. **SQLite** persists tasks + transcripts
9. **CLI** polls task status and streams transcript lines live

### CLI usage

```bash
# Immediate call
node src/cli.js "Call +1-650-555-1234 and order a large taro boba for pickup at 5pm"

# Scheduled call
node src/cli.js "Call +1-650-555-1234 and book a haircut" --at "2026-04-26T17:00"

# No phone number — system searches for it
node src/cli.js "Order me a large taro boba from the nearest boba shop for pickup at 5pm"
```

### REST API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tasks` | Create + immediately trigger a task |
| GET | `/tasks` | List all tasks |
| GET | `/tasks/:id` | Get task + full transcript |
| PATCH | `/tasks/:id` | Manually complete/fail/cancel a task |
| DELETE | `/tasks/:id` | Cancel a pending/scheduled task |
| GET | `/api/health` | Health check |
| POST | `/outbound-twiml` | Twilio webhook — returns TwiML for answered call |
| POST | `/call-status` | Twilio statusCallback |
| WS | `/stream` | Twilio Media Streams WebSocket |

**POST /tasks body:**
```json
{
  "request": "natural language task string",
  "scheduled_at": "2026-04-27T17:00:00Z"  // optional ISO 8601
}
```

### Agent types (auto-detected by router)

| Type | When triggered | Behavior |
|------|---------------|----------|
| `food_ordering` | Restaurant/cafe orders | Casual, reads items, confirms pickup time + total |
| `appointment_booking` | Clinics, salons, doctors | Polite, handles date negotiation, gets booking reference |
| `general_customer_service` | Refunds, complaints, billing | Assertive, pushes back once on deflection, escalates to supervisor |
| `insurance_calls` | Claims, disputes, quotes | Sub-modes: `file_claim`, `dispute_denial`, `get_quote`, `check_status` |
| `generic` | Everything else | Adapts tone, completes task, gets reference number |

---

## Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Server | Node.js + Express | HTTP + WebSocket server |
| Outbound calls | Twilio Programmable Voice | Dial the business |
| Voice AI | Deepgram Voice Agent API | STT + TTS + LLM conversation |
| Task parsing | Gemini 2.5 Flash (REST) | Parse NL → structured task |
| Agent routing | Gemini 2.5 Flash (REST) | Classify task type |
| Business search | Exa + Gemini fallback | Find phone numbers by name/location |
| Persistence | SQLite (better-sqlite3, WAL) | Tasks + transcripts |
| Scheduling | node-cron (1-min tick) | Fire scheduled tasks |
| Logging | Pino | Structured JSON logs |

---

## File map

```
src/
  index.js         — entry point, starts server + scheduler
  server.js        — Express routes, Twilio webhooks, WebSocket media handler
  agent.js         — OutboundAgent class (Deepgram Voice Agent WS, tool calling)
  agent-configs.js — System prompt builders for each agent type
  agent-router.js  — Gemini-based agent type classifier
  outbound.js      — Twilio call initiation + hangup
  scheduler.js     — node-cron, fires pending scheduled tasks
  db.js            — SQLite schema + all DB operations
  search.js        — Exa business search + Gemini fallback (for taskless phone numbers)
  audio.js         — Audio format helpers (mulaw, chunking)
  stt.js           — Deepgram streaming STT (legacy, kept for reference)
  tts.js           — TTS helpers
  transcript.js    — Rolling transcript management
  llm.js           — LLM call wrappers
  consent.js       — Consent IVR (from original inbound design, unused in outbound)
  cli.js           — CLI client (task submission + live transcript streaming)
  logger.js        — Pino logger config
  livekit-agent.js — LiveKit agent (spike, not in active flow)
  livekit-server.js— LiveKit server (spike, not in active flow)
spikes/
  elevenlabs-compat.js — ElevenLabs mulaw compatibility test (passed, unused now)
data/
  tasks.db         — SQLite database (gitignored)
```

---

## Environment variables required

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=         # E.164 format, e.g. +16505551234
TWILIO_WEBHOOK_BASE=         # Public HTTPS URL for Twilio callbacks (ngrok in dev)

DEEPGRAM_API_KEY=
GEMINI_API_KEY=

EXA_API_KEY=                 # For business phone number search (Gemini is fallback)

PORT=3000                    # Optional, defaults to 3000
```

---

## How to run

```bash
npm install
# Set env vars in .env
ngrok http 3000              # Get public URL → set as TWILIO_WEBHOOK_BASE
npm start                    # Start server

# In another terminal:
node src/cli.js "Call +1-XXX-XXX-XXXX and ..."
```

---

## Database schema

```sql
tasks (
  id          TEXT PRIMARY KEY,  -- random hex ID
  description TEXT,              -- what to do on the call
  phone_number TEXT,             -- E.164 destination
  call_sid    TEXT,              -- Twilio call SID
  status      TEXT,              -- pending | calling | completed | failed
  result      TEXT,              -- mark_complete summary or error
  scheduled_at DATETIME,         -- null = immediate
  agent_type  TEXT,              -- food_ordering | appointment_booking | ...
  agent_mode  TEXT,              -- insurance sub-mode or null
  user_context TEXT,             -- name, account numbers, etc.
  business_name TEXT,
  location_hint TEXT,
  created_at  DATETIME
)

transcripts (
  id       INTEGER PRIMARY KEY,
  task_id  TEXT REFERENCES tasks(id),
  role     TEXT,     -- user | assistant
  content  TEXT,
  ts       DATETIME
)
```

---

## Key technical decisions (locked)

**Deepgram Voice Agent for the conversation loop** — single WebSocket handles STT + LLM + TTS in one session. No separate STT/LLM/TTS chain to coordinate. Agent speaks first (greeting injected at connect). Uses `mark_complete` function call to signal task completion and trigger Twilio hangup.

**Gemini 2.5 Flash for parsing + routing** — two separate calls: one to parse the NL request into structured fields, one to classify agent type. Kept separate so routing logic can evolve independently.

**SQLite WAL mode** — simple, zero-infra persistence. Good enough for a single-server MVP. No migration tool — additive-only schema changes via `try/catch ALTER TABLE`.

**node-cron 1-minute tick** — atomic claim pattern (`UPDATE ... WHERE status = 'pending'`) prevents double-fire if multiple processes run.

**No LiveKit in current flow** — `livekit-agent.js` and `livekit-server.js` are spikes from a prior direction. Current stack is Twilio + Deepgram only.

---

## What's not built yet / open questions

1. **Web UI** — tasks are submitted via CLI only. No dashboard.
2. **Business phone search reliability** — Exa + Gemini extraction sometimes returns wrong numbers. No validation that the number is correct before dialing.
3. **Parallel call limit** — `countActive` is tracked but no hard cap enforced in server.
4. **Error recovery mid-call** — if Deepgram WS drops abnormally, `src/agent.js` calls `onMarkComplete('failed')` and `src/server.js` hangs up the Twilio leg. No reconnect/retry — the call ends. A soft retry loop would be a future improvement.
5. **Cost tracking** — no per-task cost logging (Twilio + Deepgram + Gemini).
6. **Auth** — no API key or auth on POST /tasks. Anyone who can reach the server can trigger calls.
7. **Consent / ECPA** — no IVR consent flow in outbound direction. Legal review needed before non-founder use.

---

## Original product context

Chatter started as "an AI that joins your existing phone call as a third participant — both parties hear it, either can invoke it by wake word." That design doc is at [archive/chatter-design-20260423.md](archive/chatter-design-20260423.md).

That vision is paused — the iOS/Android OS blocks third-party access to active carrier call audio. To inject audio both parties hear, you need to own the call leg (3-way conference merge). That's the Approach B described in the original doc.

The outbound agent is a different product: AI makes calls for you rather than joining calls with you. It's what got built while the original concept was being validated.

---

## Session history

| Date | Session | Outcome |
|------|---------|---------|
| 2026-04-23 | /office-hours | Original design APPROVED — 3-party PSTN conference bridge |
| 2026-04-24 | /critique + /plan-ceo-review | 8 critical gaps, cost problem identified ($0.33/call), scope hold |
| 2026-04-24 | Architecture update | SignalWire migration path + LiveKit VoIP roadmap added |
| 2026-04-27 | Build | Outbound AI calling agent shipped on feat/outbound-ai-agent |
