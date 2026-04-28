# AGENTS.md — Outbound AI Calling Agent

Machine-readable project context for AI coding agents.
Human docs → [outbound-ai-design.md](outbound-ai-design.md). Agent docs → here.

---

## What This Is

An AI agent that makes outbound phone calls on behalf of a user. You submit a natural
language request. The server parses it, dials the business, and an AI agent handles
the full conversation — ordering food, booking appointments, handling customer service,
insurance calls, or any generic task. Live transcript streams back while the call is
in progress.

**This is not the original "Chatter joins your call as a third participant" product.**
That design is archived. See `archive/` if you need that context.

---

## Sub-Agent Development — MANDATORY

**These are hard rules, not suggestions.**

### Before Writing Any Code

**SPAWN PARALLEL EXPLORE AGENTS** for any task touching more than 2 files:
- Launch 2-3 Explore agents in a SINGLE MESSAGE (parallel, not sequential)
- One reads current file state. One fetches live API docs. One checks existing patterns.
- Never read files sequentially when parallel reads are possible.

**FETCH LIVE DOCS** before any Deepgram, Twilio, or Gemini API call:
- Use WebFetch. Training knowledge on these APIs is stale.
- Wrong audio format = silent failure. No exception, no error log, just a silent call.

**SPAWN PLAN AGENT** before writing more than 50 lines of new code:
- New file, new feature, new audio pipeline → Plan agent first.
- Present plan. Get user approval. Then build.
- Skip only for single-line fixes and renames.

### During Build

**PARALLEL IS THE DEFAULT:**
- Independent reads → single message with multiple tool calls
- Never serialize tool calls with no dependencies between them

**NEVER WRITE AUDIO PARAMETERS FROM MEMORY:**
- Always verify `sample_rate`, `encoding`, `container` against fetched docs
- Deepgram Voice Agent: input linear16 48kHz (from Twilio after transcoding), output linear16 24kHz
- Twilio Media Streams: mulaw 8kHz, 20ms frames (160 bytes/frame)

### After Each Milestone

**SPAWN REVIEW AGENT** before moving to next milestone:
- `/review` for diff-based review
- `/qa` if the call flow changed — test with a real phone number

### Sub-Agent Routing

| Task | What to do |
|------|------------|
| Multi-file exploration | Explore agents (2-3 in parallel) |
| New feature design | Plan agent |
| Code review | invoke `/review` |
| Bug in running code | invoke `/investigate` |
| Security concern | invoke `/cso` |
| Call flow changed | invoke `/qa` after build |
| Anything not core to call/audio pipeline | invoke `/codex` to offload |
| Boilerplate, config, docs, scripts | invoke `/codex` first |

---

## Architecture

```
User (CLI or HTTP)
  │
  ▼
POST /tasks  ──► Gemini 2.5 Flash (parse NL → structured task)
  │                      │
  │              [no phone number?]
  │                      ▼
  │              Exa search → Gemini extract phone
  │
  ▼
Gemini 2.5 Flash (route → agent_type + agent_mode)
  │
  ▼
Twilio outbound call → business phone number
  │
  ▼  [call answered]
Deepgram Voice Agent WebSocket
  ├── STT (Deepgram flux-general-en)
  ├── LLM (Gemini 2.5 Flash)
  └── TTS (Deepgram Aura)
       │
       ▼  [task done]
  mark_complete() tool call → Twilio hangup → task status = completed

SQLite (WAL) ─── tasks + transcripts persisted throughout
CLI ──────────── polls /tasks/:id every 2s, streams transcript live
```

### Audio Pipeline (Twilio ↔ Deepgram Voice Agent)

| Stage | Format | Notes |
|-------|--------|-------|
| Twilio Media Streams inbound | mulaw 8kHz | What Twilio sends to the server |
| Deepgram Voice Agent input | linear16 48kHz | Server transcodes mulaw→linear16, 8kHz→48kHz |
| Deepgram Voice Agent output | linear16 24kHz | Server transcodes to mulaw 8kHz for Twilio |
| Twilio Media Streams inject | mulaw 8kHz, 160 bytes/frame (20ms) | Inject back into call |

**Wrong format = complete audio failure with no error message.**
Always fetch [https://developers.deepgram.com/docs/voice-agent](https://developers.deepgram.com/docs/voice-agent) before touching audio config.

---

## Key Files

### Active — Core Call Flow

| File | Role |
|------|------|
| `src/server.js` | Express routes, Twilio webhooks (`POST /outbound-twiml`, `POST /call-status`, `WS /stream`), task CRUD |
| `src/agent.js` | `OutboundAgent` class — Deepgram Voice Agent WebSocket, tool calling, audio in/out, `mark_complete` handler |
| `src/agent-configs.js` | System prompt builders for each agent type (5 types) |
| `src/agent-router.js` | Gemini-based task classifier → `agent_type` + `agent_mode` |
| `src/outbound.js` | Twilio `calls.create()` + `hangUp()` |
| `src/scheduler.js` | node-cron 1-min tick, fires scheduled tasks with atomic claim |
| `src/db.js` | SQLite schema, all DB operations (tasks + transcripts) |
| `src/search.js` | Exa search → phone number extraction → Gemini fallback |
| `src/audio.js` | mulaw↔linear16 codec + resampling: `upsample8to48` (inbound), `downsample24to8` (outbound) |
| `src/index.js` | Entry point — starts Express + scheduler |
| `src/cli.js` | CLI client — submit task + poll transcript live |
| `src/logger.js` | Pino structured logger |

### Present but Not in Active Call Flow

| File | Status |
|------|--------|
| `src/livekit-agent.js` | Spike from earlier direction — not used |
| `src/livekit-server.js` | Spike from earlier direction — not used |
| `src/consent.js` | Inbound consent IVR — not used in outbound flow |
| `src/transcript.js` | Rolling transcript helper — not used (transcripts via Deepgram Agent) |
| `src/llm.js` | Direct Claude API wrapper — not used (Gemini via REST) |
| `src/stt.js` | Standalone Deepgram STT — not used (Voice Agent handles STT) |
| `src/tts.js` | Legacy TTS wrapper — not used (Voice Agent handles TTS) |

### Spikes

| File | Status |
|------|--------|
| `spikes/elevenlabs-compat.js` | ElevenLabs mulaw compatibility spike — complete, not used in active flow |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tasks` | Create task + immediately trigger call |
| GET | `/tasks` | List all tasks |
| GET | `/tasks/:id` | Get task + full transcript |
| PATCH | `/tasks/:id` | Manually complete/fail/cancel a task |
| DELETE | `/tasks/:id` | Cancel a pending/scheduled task |
| GET | `/api/health` | Health check |
| POST | `/outbound-twiml` | Twilio webhook — outbound call answered, returns TwiML |
| POST | `/call-status` | Twilio statusCallback (no-answer, busy, failed, completed) |
| WS | `/stream` | Twilio Media Streams WebSocket |

**POST /tasks body:**
```json
{
  "request": "Call +1-650-555-1234 and order a large taro boba for pickup at 5pm",
  "scheduled_at": "2026-04-27T17:00:00Z"
}
```

---

## Agent Types

| Type | When triggered | Key behavior |
|------|---------------|-------------|
| `food_ordering` | Restaurant/cafe orders | Reads items, confirms pickup time + total |
| `appointment_booking` | Clinics, salons, doctors | Handles date negotiation, gets booking ref |
| `general_customer_service` | Refunds, complaints, billing | Assertive, pushes back once, escalates |
| `insurance_calls` | Claims, disputes, quotes, status | 4 sub-modes: `file_claim`, `dispute_denial`, `get_quote`, `check_status` |
| `generic` | Everything else | Adapts, completes task, gets reference number |

---

## Environment Variables

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=          # E.164 — the number that calls the business
TWILIO_WEBHOOK_BASE=          # Public HTTPS URL (ngrok in dev)

DEEPGRAM_API_KEY=
GEMINI_API_KEY=

EXA_API_KEY=                  # For business phone number lookup

PORT=3000
```

---

## Build & Run

```bash
npm install
# fill in .env
ngrok http 3000               # get public URL → TWILIO_WEBHOOK_BASE
npm start                     # or: npm run dev (node --watch)
```

**CLI usage:**
```bash
node src/cli.js "Call +1-650-555-1234 and order a large taro boba for pickup at 5pm"
node src/cli.js "Call dentist near downtown SF and book a cleaning" --at "2026-05-01T10:00"
```

---

## Database Schema

```
tasks: id, description, phone_number, call_sid, status, result,
       scheduled_at, agent_type, agent_mode, user_context,
       business_name, location_hint, created_at

transcripts: id, task_id, role (user|assistant), content, ts
```

Status lifecycle: `pending` → `calling` → `completed` | `failed` | `cancelled`

---

## Docs to Fetch (Never Rely on Training Data)

| API | URL | When |
|-----|-----|------|
| Deepgram Voice Agent | https://developers.deepgram.com/docs/voice-agent | Any agent config, audio format, event type |
| Deepgram STT streaming | https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio | STT model params |
| Twilio Programmable Voice | https://www.twilio.com/docs/voice | Webhook format, TwiML verbs |
| Twilio Media Streams | https://www.twilio.com/docs/voice/media-streams | WS protocol, audio format, frame size |
| Exa Search | `docs/exa-search-api.md` | Any Exa call — check `docs/exa-search-api.md` for JS vs Python param differences |

---

## Commit Rules

- One commit per meaningful feature/fix. Don't squash unrelated changes.
- Never commit a broken call flow. Test end-to-end first.
- Commit message format: `feat|fix|chore(<scope>): <description>`
- Do not push to remote without confirming with user.
