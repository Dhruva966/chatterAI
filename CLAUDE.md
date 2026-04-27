
## Documentation — fetch these before building anything

Before writing any code or making architecture decisions for this project,
fetch and read the relevant documentation. Do not rely solely on training
knowledge — these APIs evolve and the docs are the source of truth.

| What | URL | When to fetch |
|------|-----|---------------|
| Deepgram home | https://developers.deepgram.com/home | Any Deepgram change |
| Deepgram Voice Agent API | https://developers.deepgram.com/docs/voice-agent | Changing agent config, audio format, event types |
| Deepgram STT streaming | https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio | STT model params, endpointing |
| ElevenLabs Agents | https://elevenlabs.io/docs/eleven-agents/overview | If switching to ElevenLabs agent |
| ElevenLabs TTS API | https://elevenlabs.io/docs/api-reference/text-to-speech | TTS format, Flash v2, output_format param |
| Exa Search API | [docs/exa-search-api.md](docs/exa-search-api.md) | Any Exa search call — params, types, snake_case vs camelCase, common mistakes |
| LiveKit Server SDK | https://docs.livekit.io/home/server-sdks/javascript/ | Token gen, room creation — `toJwt()` is async, must `await` |
| LiveKit RTC Node | https://docs.livekit.io/home/client-sdks/javascript/node/ | AI agent joins room as participant |
| LiveKit Swift SDK | https://docs.livekit.io/home/client-sdks/swift/ | iOS audio/room — check AVAudioSession + Info.plist rules |
| LiveKit JS SDK | https://docs.livekit.io/home/client-sdks/javascript/ | Browser join — audio autoplay requires click handler |
| LiveKit Rooms | https://docs.livekit.io/realtime/server/rooms/ | Room lifecycle, emptyTimeout, participant management |

**Rule:** If a task touches Deepgram, ElevenLabs, or LiveKit — fetch the relevant
doc page first with WebFetch. Configs, event names, and audio format parameters
change frequently. A wrong format (e.g. wrong mulaw sample rate, wrong sample_rate value)
silently breaks audio with no error. Always verify against live docs.

**Rule:** LiveKit has many silent failures — wrong values produce no errors, just broken audio or failed connections. Before writing any LiveKit token, room, or audio track code: fetch the relevant doc URL above AND read the LiveKit section in `AGENTS.md` for the silent-failure cheat sheet.

**Critical LiveKit rules (never rely on memory):**
- `token.toJwt()` is async in v2 — always `await` it
- Grant must include `roomJoin: true` + `room` + `identity`
- `emptyTimeout: 0` closes room immediately — use `600`+
- iOS: leave `AVAudioSession` auto-config enabled; add `NSMicrophoneUsageDescription` to Info.plist
- Browser: audio autoplay blocked — call `room.startAudio()` from a click handler
- Webhooks: use `express.raw()` not `express.json()`

**Rule:** If a task touches Exa search — read `docs/exa-search-api.md` first.
Parameters must be nested under `contents`; Python uses snake_case, JS uses camelCase.
Several deprecated params (`useAutoprompt`, `livecrawl`, `numSentences`) silently break calls.

---

## Sub-Agent Development — MANDATORY

**This project requires sub-agent driven development. These are hard rules, not suggestions.**

### Before writing any code

**SPAWN PARALLEL EXPLORE AGENTS** for any task touching more than 2 files:
- Launch 2-3 Explore agents in a SINGLE MESSAGE (parallel, not sequential)
- One reads current file state. One fetches live API docs. One checks existing patterns.
- Never read files sequentially when parallel reads are possible.

**FETCH LIVE DOCS** before any Deepgram, LiveKit, ElevenLabs, or iOS API call:
- Use WebFetch. Training knowledge on these APIs is stale.
- Wrong audio format = silent failure. No exception, no error log, just broken audio.

**SPAWN PLAN AGENT** before writing more than 50 lines of new code:
- New file, new feature, new audio pipeline → Plan agent first.
- Present plan. Get user approval. Then build.
- Skip only for single-line fixes and renames.

### During build

**PARALLEL IS THE DEFAULT:**
- Independent reads → single message with multiple tool calls
- Backend (Node.js) + iOS (Swift) in same session → worktree isolation
- Never serialize tool calls with no dependencies between them

**NEVER WRITE AUDIO PARAMETERS FROM MEMORY:**
- Always verify `sample_rate`, `encoding`, `container` against fetched docs
- Deepgram Voice Agent formats: input linear16 48kHz, output linear16 24kHz
- LiveKit delivers participant audio: linear16 48kHz (no codec needed for input)

### After each milestone

**SPAWN REVIEW AGENT** before moving to next milestone:
- Diff-based review → `/review` skill
- Audio pipeline changed → `/qa` skill, test with real audio in two browser tabs
- iOS screen added → test in iPhone 16 SE simulator before proceeding

### Sub-agent routing

| Task | What to do |
|------|------------|
| Multi-file exploration | Explore agents (2-3 in parallel) |
| New feature design | Plan agent |
| Code review | invoke `/review` |
| Bug in running code | invoke `/investigate` |
| SwiftUI new screen | invoke `/swiftui-patterns` |
| Swift concurrency | invoke `/swift-concurrency-6-2` |
| iOS build broken | invoke `/investigate` |
| Security concern | invoke `/cso` |
| Audio pipeline change | invoke `/qa` after build |

---

## Skill routing

**Use relevant skills whenever possible.** Skills have multi-step workflows, checklists,
and quality gates that produce better results than ad-hoc answers. When in doubt, invoke
the skill — a false positive is cheaper than a false negative.

When the user's request matches an available skill, invoke it via the Skill tool immediately.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- ANY task not directly core to the call/audio/LiveKit/iOS pipeline → invoke /codex to offload and preserve Claude Code usage
- Boilerplate, config files, scripts, docs, non-critical utilities → invoke /codex first
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health
- SwiftUI screen, new View → invoke /swiftui-patterns
- Swift concurrency issue → invoke /swift-concurrency-6-2
- iOS build broken, Swift error → invoke /investigate
