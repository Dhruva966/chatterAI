# AGENTS.md — Chatter AI

Machine-readable project context for AI coding agents.
Human docs → README (if it exists). Agent docs → here.

---

## Project Overview

**Chatter** is a shared AI participant for live phone calls. Both parties hear it. Either can invoke it by name. It has full rolling transcript context of the call.

**Origin pain:** Two founders in a car, on a working call, needed to look something up. Siri blocked during calls. Neither could pull out their phone safely. Chatter joins the call as a third audible participant.

**Current state:** Migrating to LiveKit WebRTC. iOS app generates a join link. Party B opens it in Safari — no app install. Chatter AI bot joins as a LiveKit participant.

---

## Sub-Agent Development — MANDATORY

**This project requires sub-agent driven development. These are not suggestions.**

### Before Writing Any Code

**SPAWN PARALLEL EXPLORE AGENTS FIRST** for any task touching more than 2 files:
```
Launch 2-3 Explore agents IN PARALLEL (single message, multiple tool calls).
One agent reads current file state. One fetches live API docs. One checks for existing patterns.
Never read files sequentially when parallel reads are possible.
```

**FETCH LIVE DOCS BEFORE ANY API CALL:**
```
WebFetch the relevant doc URL BEFORE writing any Deepgram, LiveKit, or ElevenLabs code.
Training knowledge on these APIs is stale. Wrong audio format = silent failure.
This is a hard rule. No exceptions.
```

**SPAWN PLAN AGENT BEFORE >50 LINES OF NEW CODE:**
```
New feature, new file, new audio pipeline → Plan agent first.
Present plan to user. Get approval. Then build.
Skip for single-line fixes and renames only.
```

### During Build

**PARALLEL IS THE DEFAULT:**
```
Independent reads → single message with multiple tool calls.
Backend (Node.js) + iOS (Swift) work → use worktree isolation (separate git worktrees).
Never serialize tool calls that have no dependencies between them.
```

**AUDIO PARAMETERS ARE NEVER WRITTEN FROM MEMORY:**
```
Always verify sample_rate, encoding, container values against fetched docs.
The Deepgram Voice Agent input/output formats are documented at:
https://developers.deepgram.com/docs/voice-agent
Fetch it. Read it. Then write the config.
```

### After Each Milestone

**SPAWN REVIEW AGENT BEFORE NEXT MILESTONE:**
```
Milestone complete → spawn /review agent on the diff.
Audio pipeline changed → spawn /qa agent, test with real audio in two browser tabs.
iOS screen added → test in iPhone 16 SE simulator before moving on.
```

### Sub-Agent Routing Quick Reference

| Task | Agent to spawn |
|------|----------------|
| Multi-file exploration | Explore (2-3 in parallel) |
| New feature design | Plan |
| Code review | /review skill |
| Bug in running code | /investigate skill |
| SwiftUI new screen | /swiftui-patterns skill |
| Swift concurrency | /swift-concurrency-6-2 skill |
| iOS build broken | /investigate skill |
| Audio pipeline change | /qa skill after build |
| Security concern | /cso skill |
| **Anything not core to audio/LiveKit/iOS pipeline** | **/codex skill — offload to save Claude Code usage** |
| Boilerplate, scripts, config, docs, non-critical utilities | /codex skill |

### /codex Offload Rule — MANDATORY

Default to `/codex` for all non-critical work. Preserves Claude Code usage for what matters.

**Claude Code handles directly (core path):**
- Deepgram Voice Agent WebSocket config and audio pipeline
- LiveKit room/token/agent Node.js code
- iOS SwiftUI call UI and LiveKit Swift SDK integration
- Real-time audio routing logic

**Offload to `/codex`:**
- `package.json` scripts, `.gitignore`, `.env.example`, shell scripts
- Helper utilities not in the real-time audio path
- Markdown and doc updates
- Spike/test scripts
- CI/CD config, deployment scripts, Xcode build settings
- Any refactor that doesn't touch audio or WebSocket code

---

## LiveKit — Critical Reference

**Fetch before any LiveKit code.** These URLs are the source of truth:

| Doc | URL |
|-----|-----|
| Server SDK (JS) | https://docs.livekit.io/home/server-sdks/javascript/ |
| RTC Node (bot) | https://docs.livekit.io/home/client-sdks/javascript/node/ |
| Client SDK (JS/browser) | https://docs.livekit.io/home/client-sdks/javascript/ |
| Swift SDK (iOS) | https://docs.livekit.io/home/client-sdks/swift/ |
| Room concepts | https://docs.livekit.io/realtime/server/rooms/ |
| Agents SDK | https://docs.livekit.io/agents/ |

### Token Generation (Node.js) — MANDATORY RULES

```javascript
const token = new AccessToken(apiKey, apiSecret, { identity, ttl: '2h' });
token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
const jwt = await token.toJwt(); // MUST be awaited — v2 SDK is async
```

**Silent failures if wrong:**
- `toJwt()` not awaited → returns `Promise`, not string → connection fails with no error
- Missing `roomJoin: true` → token valid but join rejected
- Missing `room` in grant → token rejected
- Missing `identity` → token invalid
- `identity` mismatch between token and app logic → subscription filtering breaks

### Room Creation — MANDATORY RULES

```javascript
await roomService.createRoom({
  name: roomName,
  emptyTimeout: 600,   // seconds — NEVER use 0 (closes room immediately)
  maxParticipants: 10,
});
```

**Silent failures:**
- `emptyTimeout: 0` → room closes the moment it empties — use 600+ for testing
- Room names are case-sensitive and stable identifiers — never change mid-session

### Browser Client (public/join.html) — MANDATORY RULES

```javascript
// Audio autoplay is browser-restricted — MUST start from click handler
if (!room.canPlaybackAudio) {
  // show "Tap to join audio" button
  button.onclick = () => room.startAudio();
}
room.on(RoomEvent.AudioPlaybackStatusChanged, () => { /* update UI */ });
```

**Silent failures:**
- Mic permission denied → remote audio won't autoplay even for subscribers — call `room.startAudio()` explicitly
- Both camera+mic permissions denied → WebRTC negotiation fails → set `webAudioMix: false` in RoomOptions
- Track published without attaching to DOM element → not visible to remote participants
- `room.participants` (v1) → use `room.remoteParticipants` (v2)

### iOS Swift SDK — MANDATORY RULES

**Info.plist — REQUIRED or runtime crash:**
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Chatter uses your microphone for live calls</string>
```

**AVAudioSession — leave auto-config enabled unless using CallKit:**
```swift
// DEFAULT (correct for Chatter) — SDK handles this automatically:
// category = .playback when no mic
// category = .playAndRecord when mic active

// ONLY disable if integrating CallKit:
AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
// Then YOU must set .playAndRecord BEFORE setMicrophone(enabled: true)
// Failure = mic enabled but sends silence — no error thrown
```

**Microphone enable:**
```swift
try await room.localParticipant.setMicrophone(enabled: true)
// Errors: throws if AVAudioSession not configured, or Info.plist missing
```

**Silent failures (Swift):**
- `isAutomaticConfigurationEnabled = false` + forgot `setCategory(.playAndRecord)` → mic sends silence
- Missing `NSMicrophoneUsageDescription` → runtime crash on first mic request
- `setMicrophone()` called before `room.connect()` completes → no-op, no error
- Not calling `try await room.connect()` from async context → Swift 6 concurrency error at compile time

### Webhook Handler (if used)

```javascript
// MUST use raw body — NOT express.json()
app.post('/livekit/webhook', express.raw({ type: 'application/webhook+json' }), handler);
// express.json() = signature validation always fails silently
```

### Summary: Silent Failure Cheat Sheet

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `toJwt()` not awaited | Token is `[object Promise]`, join fails | `await token.toJwt()` |
| `roomJoin: true` missing | Join rejected, no error message | Add to grant |
| `emptyTimeout: 0` | Room closes immediately when empty | Use `600` or higher |
| Browser mic denied | Remote audio won't play | `room.startAudio()` from click |
| Swift auto-config disabled + no `setCategory` | Mic active, sends silence | Set `.playAndRecord` first |
| `NSMicrophoneUsageDescription` missing | Runtime crash | Add to Info.plist |
| `express.json()` for webhook | Signature validation fails silently | Use `express.raw()` |
| `room.participants` (v1 API) | Undefined in v2 | Use `room.remoteParticipants` |

---

## Architecture

### Architecture (LiveKit WebRTC)

```
LiveKit Room
  ├── Person 1 (iOS SwiftUI app, LiveKit Swift SDK)
  ├── Person 2 (Safari/Chrome, LiveKit JS SDK via CDN join link)
  └── Chatter AI bot (Node.js, @livekit/rtc-node)
        └── Deepgram Voice Agent WebSocket (src/agent.js)
              Audio in:  linear16 48kHz from LiveKit (no codec needed)
              Audio out: linear16 24kHz → upsample to 48kHz → publish to room
```

### Critical Audio Pipeline Facts

**MEMORIZE THESE. WRONG VALUE = SILENT FAILURE, NO ERROR:**

| Stage | Format | Notes |
|-------|--------|-------|
| LiveKit participant audio out | linear16 48kHz | What the bot receives from room |
| Deepgram Voice Agent input | linear16 48kHz | Direct pass-through — no conversion |
| Deepgram Voice Agent output | linear16 24kHz | Must upsample before publishing back |
| LiveKit publish (bot TTS) | linear16 48kHz | Upsample 24kHz→48kHz (~5 lines) |

---

## Key Files

### DO NOT BREAK WITHOUT A PLAN

| File | Role | Status |
|------|------|--------|
| `src/agent.js` | DeepgramAgent class — STT+LLM+TTS in one WS, Exa function calling, wake word via prompt | KEEP, minor audio source swap |
| `src/transcript.js` | Rolling transcript, sliding window, token counting | KEEP unchanged |
| `src/consent.js` | Consent state machine (WAITING→ACTIVE→DEPARTED) | KEEP logic, replace IVR with app UI |
| `src/server.js` | Express routes | MODIFY — add LiveKit routes |
| `src/index.js` | App entrypoint | MODIFY — remove old WS setup |

### SCHEDULED FOR DELETION

| File | Why |
|------|-----|
| `src/conference.js` | PSTN conference logic — replaced by LiveKit |
| `src/audio.js` | mulaw codec — not needed, LiveKit sends linear16 natively |

### OPTIONAL FALLBACK (keep, not active)

| File | Role |
|------|------|
| `src/llm.js` | Claude Sonnet direct API (bypassed by Voice Agent) |
| `src/stt.js` | Deepgram streaming STT (bypassed by Voice Agent) |
| `src/tts.js` | ElevenLabs TTS (bypassed by Voice Agent) |

### TO CREATE

| File | Role |
|------|------|
| `src/livekit-server.js` | Token generation, room creation (livekit-server-sdk) |
| `src/livekit-agent.js` | AI bot joins LiveKit room (@livekit/rtc-node), pipes to Deepgram |
| `public/join.html` | Browser join page (LiveKit JS SDK via CDN, no npm) |
| `ios/ChatterApp/` | Xcode project (SwiftUI + LiveKit Swift SDK via SPM) |
| `contexts/` | JSON context files per user |

---

## Build & Run

```bash
npm run dev          # node --watch src/index.js (auto-reload on save)
npm start            # production start
node spikes/<file>   # manual spike tests (not in test suite)
```

### Manual Test Flow

```bash
# Terminal 1
npm run dev

# Terminal 2
ngrok http 3000
# Copy https URL → set BASE_URL in .env

# Browser: open two tabs with different tokens from POST /rooms
# Confirm: audio works between tabs, AI bot joins, "Hey Chatter" triggers response
```

---

## Environment Variables

### Currently Required
```
DEEPGRAM_API_KEY=
GEMINI_API_KEY=
EXA_API_KEY=
PORT=3000
BASE_URL=https://<ngrok>.ngrok.io
```

### Adding (LiveKit migration)
```
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=wss://yourproject.livekit.cloud
```

### Remove (already done)
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

---

## Milestones

### M1 — Two browsers talking (NO AI)
- Install `livekit-server-sdk`
- `POST /rooms` → `{ roomName, token, joinUrl }`
- `public/join.html` with LiveKit JS CDN
- Test: two tabs, audio both ways
- Commit: `feat(m1): livekit room creation + browser join`

### M2 — AI bot joins room
- Install `@livekit/rtc-node`
- `src/livekit-agent.js` — bot subscribes to audio tracks, pipes to Deepgram
- Pipe TTS output back (upsample 24kHz→48kHz, publish as AudioTrack)
- Test: two tabs + AI bot, "Hey Chatter" triggers response
- Commit: `feat(m2): chatter ai bot in livekit room`

### M3 — iOS app (iPhone 16 SE simulator)
- Xcode project with LiveKit Swift SDK via SPM
- `ContentView.swift` — start call button → POST /rooms → show join link + share sheet
- `CallViewModel.swift` — LiveKit room session, mic/speaker
- Test: simulator + browser tab, confirm audio both ways
- Commit: `feat(m3): ios swiftui app with livekit`

### M4 — Context system
- `contexts/[userId]/[name].json` files
- iOS picker UI (list of context names)
- Server injects `system_prompt_text` into Deepgram Voice Agent settings on call start
- Append transcript to `context.history[]` on call end
- Commit: `feat(m4): context system with json files`

---

## PR / Commit Rules

- One commit per milestone. Do not squash milestones together.
- Never commit a broken audio pipeline. Test end-to-end first.
- Commit message format: `feat(m<N>): <description>`
- Do not push to remote without confirming with user.

---

## Docs to Fetch (Never Rely on Training Data)

| API | URL | When |
|-----|-----|------|
| Deepgram Voice Agent | https://developers.deepgram.com/docs/voice-agent | Any agent config, audio format, event type |
| LiveKit Server SDK | https://docs.livekit.io/home/server-sdks/javascript/ | Token gen, room creation |
| LiveKit RTC Node | https://docs.livekit.io/home/client-sdks/javascript/node/ | Bot audio subscribe/publish |
| LiveKit Swift SDK | https://docs.livekit.io/home/client-sdks/swift/ | iOS room connection, audio tracks |
| LiveKit JS SDK | https://docs.livekit.io/home/client-sdks/javascript/ | Browser join page |
| Exa Search | `docs/exa-search-api.md` | Any Exa call — params must be nested under `contents` |

---

## Wake Word Behavior

Wake word detection is **prompt-level**, not code-level.

The Deepgram Voice Agent's system prompt (`CHATTER_PROMPT` in `src/agent.js`) instructs the LLM to only respond when addressed as "Chatter" or "Hey Chatter". No regex, no transcript scanning.

- To change wake word: update `CHATTER_PROMPT` in `src/agent.js`
- No code change needed if just renaming "Chatter" to something else
- Debounce and false-positive handling are handled by the LLM instruction, not application logic

---

## Consent Model

Current (PSTN): IVR — both parties press 1 within 10s window.
Target (app): In-app UI toggle — Party A consents on app start. Party B sees banner in browser join page.

`src/consent.js` state machine logic is reusable. Replace the IVR trigger with app UI events.

**Legal note:** ECPA all-party consent required in some US states (CA strictest). Retain telecom attorney before consumer launch.
