
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
| Twilio Media Streams | https://www.twilio.com/docs/voice/media-streams | Audio framing, WS message format, streamSid |
| Twilio Programmable Voice | https://www.twilio.com/docs/voice/twiml | TwiML verbs, conference, gather |
| Twilio Conference | https://www.twilio.com/docs/voice/api/conference-resource | Participant API, status callbacks |

**Rule:** If a task touches Deepgram, ElevenLabs, or Twilio — fetch the relevant
doc page first with WebFetch. Configs, event names, and audio format parameters
change frequently. A wrong format (e.g. wrong mulaw sample rate) silently breaks
audio with no error. Always verify against live docs.

---

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

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
