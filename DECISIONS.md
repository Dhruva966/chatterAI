# Chatter — Architecture Decision Records

Single reference for every non-obvious engineering choice made during design.
Update this file when a decision changes. Date each entry.

---

## ADR-001: Wake word via transcript final-result matching (2026-04-24)

**Decision:** Detect "hey chatter" (case-insensitive, exact phrase) on Deepgram
FINAL transcripts. Not interim transcripts.

**Alternatives considered:**
- Picovoice Porcupine (on-device, <50ms): Rejected for Approach A. Audio arrives
  via Twilio Media Streams (server-side), not a local microphone. Porcupine requires
  local audio access.
- DTMF trigger (*1 to activate): Considered. Rejected because it requires both
  parties to know the gesture and adds friction.
- Transcript substring/partial match: Rejected. Too many false positives on interim
  results (Deepgram frequently produces mid-word partials that resolve to different text).

**Accepted limitations:**
- False positives: conversational mentions of "hey chatter" or "chatter" will trigger.
  Acceptable for 2-founder internal test (low ambient usage of the phrase).
- False negatives: ~30-40% on 8kHz noisy car audio. Acceptable for MVP.
- Approach B will use Picovoice Porcupine on-device via iOS/Android app.

**Safeguards implemented:**
- Match only on `is_final: true` Deepgram events
- 3-second cooldown after Chatter's TTS response completes
- Deepgram muted (frames not forwarded) while Chatter is speaking (prevents self-trigger)
- Strip Chatter's own utterances from transcript before wake-word check

---

## ADR-002: Latency ceiling raised to 4s (2026-04-24)

**Decision:** Target end-to-end latency ≤4s (wake word detected → audio audible).
Design doc specified 2s. Raised because web search is non-negotiable.

**Why 4s not 2s:** Web search tool call adds 800-1300ms to every query that
requires external lookup. Measured breakdown:
- Deepgram endpointing: 300-500ms
- STT finalization: 100-300ms
- Claude TTFB (Sonnet): 800-2000ms
- Web search (Exa): 800-1300ms (parallel with Claude where possible)
- ElevenLabs TTFB (Flash v2): 200-400ms
- Twilio Media Streams injection: 60-120ms
- Total realistic on LTE: 3-5s

**Optimization levers (if 4s is still too slow):**
1. Stream ElevenLabs TTS from first token (don't wait for full Claude response)
2. Run web search in parallel with Claude's initial reasoning (speculative fetch)
3. Use Claude haiku for simple queries (when web search not needed)
4. Pre-warm ElevenLabs connection

**Measure on first real call.** If p50 exceeds 5s, implement optimization lever 1.

---

## ADR-003: No transcript summarization (2026-04-24)

**Decision:** Keep raw rolling transcript. No Claude summarization of older content.

**Why the design doc was wrong:** Design doc planned summarization at 10-min intervals
to manage context. But Claude Sonnet has 200K token context. 10 min of speech ≈ 1700
tokens. Summarization would be needed only at ~100 minutes of raw transcript.
Summarization adds cost (~$0.003/event), latency, and destroys specificity.

**Sliding window safety valve:** If transcript exceeds 150K tokens (>~850 min —
never in practice for a working call), drop the oldest 20% of turns.

---

## ADR-004: Deepgram WebSocket reconnect on LTE drop (2026-04-24)

**Decision:** Implement exponential backoff reconnect on Deepgram WebSocket
disconnection. Reconnect up to 3 times before giving up.

**Why:** LTE handoffs in a moving car will drop the WebSocket. Without reconnect,
Chatter silently goes deaf with no recovery path. Users have no indication why
Chatter stopped responding.

**Implementation:** On `close` or `error` event, wait 500ms → 1000ms → 2000ms.
Buffer incoming Twilio Media Streams audio frames during reconnect (ring buffer,
max 2s). Flush buffer to Deepgram after reconnect. Discard if reconnect fails.
Notify conference if all reconnects fail: "Chatter lost connection. Reconnecting..."

---

## ADR-005: Mute Deepgram while Chatter speaks (2026-04-24)

**Decision:** Stop forwarding Media Streams audio frames to Deepgram while Chatter's
TTS is playing. Resume immediately after playback ends.

**Why:** The Twilio conference mix includes Chatter's own audio. Without muting,
Deepgram transcribes Chatter's TTS output and adds it to the rolling transcript as
if it were a human utterance. This corrupts context and can trigger recursive wake
word detection if Chatter says "hey chatter" in a response.

**Implementation:** `let chatterSpeaking = false` flag in stt.js. Set true when
first TTS frame is sent. Set false when last TTS frame is sent + 500ms buffer.

---

## ADR-006: ElevenLabs fallback to Amazon Polly (2026-04-24)

**Decision:** If spikes/elevenlabs-compat.js fails (mulaw 8kHz incompatibility with
Twilio Media Streams), switch TTS to Amazon Polly.

**Polly config:** Voice: Joanna (or Matthew), Engine: neural, SampleRate: 8000,
OutputFormat: pcm (then transcode to mulaw via ffmpeg). OR OutputFormat: pcm
injected directly if Twilio accepts it (test separately).

**ElevenLabs mulaw format:** Request `output_format: "ulaw_8000"`. This requests
8kHz mulaw output. Twilio Media Streams expects exactly this format in 20ms frames
(160 bytes/frame). The compatibility is the unknown.

---

## ADR-007: Consent IVR state machine (2026-04-24)

**Decision:** 

```
States: WAITING_CONSENT → ACTIVE → DEPARTED

WAITING_CONSENT (both parties):
  - Party presses 1: record consent
  - Both consented: → ACTIVE
  - 10s timeout (either party): Chatter announces departure → DEPARTED
  - Party presses 2: Chatter announces departure → DEPARTED

ACTIVE:
  - Either party presses 2: → DEPARTED
  - Late joiner (joins after consent window): Chatter exits (cannot retroactively
    consent a party who wasn't present for the IVR)
  - No re-enable in Approach A (would require second IVR pass, deferred to Approach B)

DEPARTED:
  - Terminal. Chatter's Twilio leg disconnects.
```

**ECPA compliance note:** This IVR constitutes all-party consent for recording/AI
participation. California (strictest) requires ALL parties to consent before
any recording begins. The 10s timeout handles non-responsive parties by removing
Chatter. Legal review required before non-founder users.

---

## ADR-008: Structured logging with Pino (2026-04-24)

**Decision:** Use Pino for structured JSON logging. Pretty-print in development.

**Log every:**
- Wake word trigger (timestamp, phrase matched, transcript context, conference SID)
- Claude API call (input tokens, output tokens, latency_ms, tool_called)
- ElevenLabs call (TTFB_ms, bytes, voice_id)
- Deepgram reconnect (attempt number, reason)
- Consent event (party, action, timestamp)
- Error (type, message, conference SID, stack)

**Why:** Without structured logs, debugging "Chatter interrupted us on a call last
Tuesday" is impossible. With structured logs: query by conference SID + timestamp
range, see all wake word triggers, confirm whether they were intentional.

---

## ADR-009: Switched to Deepgram Voice Agent + Gemini 2.5 Flash (2026-04-24)

**Decision:** Replace the 3-API pipeline (Deepgram STT → Claude → ElevenLabs TTS)
with the Deepgram Voice Agent — a single bidirectional WebSocket that handles
STT (Deepgram Flux), LLM (Gemini 2.5 Flash), and TTS (Deepgram Aura) internally.

**Why:**
- Simpler: one WebSocket instead of three separate API calls per query
- Eliminates ElevenLabs/Twilio mulaw compatibility as a P0 blocker
- Gemini 2.5 Flash preferred for demos (lower cost, user's key)
- Deepgram Aura TTS output format known-compatible with agent's 24kHz PCM output

**Audio transcoding required (ADR-009 carries this):**
- Twilio sends mulaw 8kHz → must transcode to linear16 48kHz for Deepgram Agent input
- Deepgram Agent sends linear16 24kHz → must transcode to mulaw 8kHz for Twilio injection
- Implemented in src/audio.js (G.711 mulaw codec + linear interpolation resampling)

**Wake word behavior change:**
- Old: explicit "hey chatter" transcript match → trigger Claude call
- New: Deepgram Agent always listening; prompt instructs it to only respond when
  addressed as "Chatter" or "Hey Chatter". LLM-level gate, not audio-level.
- Acceptable for demos. Will tune if false-positive rate is too high.

**Web search:**
- Kept in EXA_API_KEY / src/llm.js for explicit tool calls
- Deepgram Voice Agent doesn't expose web search as a native tool call yet
- TODO: wire Exa as a function_call in the agent's `think.functions` config
  so Gemini can invoke it. See Deepgram Voice Agent function calling docs.

**Files changed:** src/agent.js (new), src/audio.js (new), src/conference.js (rewrite)
**Files now optional:** src/llm.js, src/tts.js, src/stt.js (kept for fallback/future)

---

## Open decisions (unresolved as of 2026-04-24)

1. **Approach B fallback architecture** — if iOS 3-way carrier merge fails on
   AT&T/Verizon/T-Mobile. Candidates: VAPI media streaming, Radisys open telecom
   integration. Not blocking Approach A.

2. **Pricing model** — $1.87/30-min call infra cost makes flat $5-10/month
   inverted for heavy users. Usage-based pricing likely needed. Not blocking
   Approach A (internal test, no pricing needed yet).
