# Outbound AI — Architecture Decision Records

Single reference for every non-obvious engineering choice.
Update when a decision changes. Date each entry.

---

## ADR-001: Deepgram Voice Agent as conversation engine (2026-04-26)

**Decision:** Use Deepgram Voice Agent (single bidirectional WebSocket) for the
entire STT → LLM → TTS pipeline instead of three separate API calls.

**Alternatives rejected:**
- Deepgram STT → Claude → ElevenLabs TTS: Three separate API calls per turn,
  multiple points of failure, latency from chaining. Eliminated.
- Deepgram STT → Gemini → Deepgram TTS: Same chaining problem.

**Why Voice Agent wins:**
- One WebSocket handles STT (Nova-2), LLM (Gemini 2.5 Flash), TTS (Aura) internally
- Audio I/O in one place — no inter-service audio routing
- Eliminates ElevenLabs mulaw compatibility as a blocker
- Built-in function calling via `think.functions` config

**Accepted trade-offs:**
- Less control over individual components (can't swap TTS voice easily)
- Gemini is the only LLM option (can't use Claude directly in the agent loop)
- Voice Agent pricing includes all three components — no mix-and-match cost optimization

---

## ADR-002: Two separate Gemini calls — parse then route (2026-04-26)

**Decision:** Task creation uses two sequential Gemini 2.5 Flash calls:
1. Parse the natural language request → structured fields (phone, description, schedule, context)
2. Route the description → agent_type + agent_mode

**Why not combined:** Routing logic needs to evolve independently of parsing logic.
Mixing them into one prompt makes prompt engineering fragile — a change to the routing
criteria risks breaking field extraction and vice versa.

**Why Gemini not Claude:** User has Gemini API key. Cost. Gemini 2.5 Flash is
sufficient for structured extraction and classification tasks.

---

## ADR-003: SQLite WAL for persistence (2026-04-26)

**Decision:** Use `better-sqlite3` with WAL journal mode for tasks + transcripts.

**Why not Postgres/Redis:** Zero infra. Single-server MVP. SQLite handles the
read/write pattern (frequent transcript inserts, occasional task reads) fine
at this scale.

**WAL mode reason:** node-cron scheduler ticks every minute, potentially reading
while Express is writing. WAL allows concurrent readers without blocking writers.

**Schema migration strategy:** Additive-only via `try/catch ALTER TABLE`. No migration
tool. Safe to re-run on startup. If a column already exists, the error is swallowed.

---

## ADR-004: Atomic task claim in scheduler (2026-04-26)

**Decision:** Scheduler uses `UPDATE tasks SET status = 'calling' WHERE id = ? AND status = 'pending'`
to claim a task before firing it. If `changes === 0`, another process already claimed it — skip.

**Why:** node-cron fires on every minute tick. If the server restarts mid-tick, or if
two processes run simultaneously, the same scheduled task could fire twice (duplicate calls).
The atomic UPDATE prevents double-fire without a distributed lock.

---

## ADR-005: mark_complete as the call termination signal (2026-04-26)

**Decision:** The Deepgram Voice Agent is given a `mark_complete` function tool.
When the agent calls it, the server receives a `FunctionCallRequest`, updates the
task status + result in SQLite, then calls Twilio `calls(callSid).update({ status: 'completed' })`
to hang up.

**Why not hang up on call end event:** The call end event fires after the call is
already over. `mark_complete` lets the agent signal task completion before the call
ends, capturing the result while the WebSocket is still alive.

**Required behavior:** Every system prompt in `agent-configs.js` instructs the agent
to always call `mark_complete` when done — whether successful, voicemail, or failed.
Without this, calls run until Twilio's timeout.

---

## ADR-006: Exa search + Gemini fallback for phone number lookup (2026-04-26)

**Decision:** When a task has no phone number, use:
1. Exa `searchAndContents` to find business pages
2. Regex extraction on text/highlights (fast, no LLM cost)
3. Gemini fallback if regex finds nothing (parse Exa content)

**Known limitation:** Phone numbers extracted this way can be wrong (wrong location,
outdated listing). No validation that the number is correct before dialing.

**Acceptable for now:** Internal use only. Fix when false dials become a problem.
Long-term: Google Places API or similar verified directory.

---

## ADR-007: Pino structured logging (2026-04-26)

**Decision:** Use Pino for all server logging. JSON in production, pretty-print in dev.

**What is logged at minimum:**
- Deepgram WS open/close/error (taskId)
- Agent routing decision (description, agentType, agentMode)
- mark_complete received (taskId, result)
- Call status updates (callSid, callStatus)
- All errors with taskId + message

**Why:** Without structured logs, debugging a failed call after the fact is impossible.
Querying by taskId shows the full lifecycle of a call in sequence.

---

## ADR-008: CLI as primary interface (2026-04-26)

**Decision:** The primary UX is a CLI that submits a task and streams the transcript
live via 2-second polling of `GET /tasks/:id`.

**Why not a web UI:** Fastest to build and use. The transcript stream IS the product
experience — a terminal does this well. Web UI is a future milestone.

**Why polling not WebSocket/SSE:** Simpler. The 2s polling lag is acceptable for
a transcript viewer. SSE or WebSocket would be needed only if sub-second streaming
is required — it isn't for this use case.

**Note:** CLI reads `task.transcripts` (the field returned by `db.getTask()`). Any
code that reads `task.transcript` (no s) will silently receive `undefined`.

---

## Open Decisions

1. **Business phone number validation** — no check that the found number is correct
   before dialing. Need to evaluate Google Places API vs. manual confirmation step.

2. **Web UI** — design direction (mission control aesthetic, amber accent, transcript as hero)
   is documented in `.impeccable.md` at the project root. Not built yet. When building:
   task input at top, live transcript stream in center, status indicators.

3. **Concurrent call limit** — `countActive()` is tracked but no hard cap enforced.
   Decide on max concurrent Twilio calls before exposing to non-founder users.

4. **Auth on POST /tasks** — none. Any caller who can reach the server can trigger
   outbound calls. Required before any non-localhost deployment.

5. **Cost tracking** — no per-task cost logging. Needed before pricing decisions.
   Track: Twilio minutes, Deepgram VA seconds, Gemini tokens per task.
