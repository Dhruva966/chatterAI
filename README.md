# Outbound AI

AI agent that makes outbound phone calls on your behalf.

Give it a task in plain English — *"Call Domino's on Main St and order a large pepperoni for pickup at 7pm"* — and it dials the number, speaks with a real person using a conversational AI voice, and reports back with a transcript and result.

## Demo

[![Watch the demo](https://drive.google.com/thumbnail?id=1pJpix72N1Kkn3E9xsH3CpP1V2STvUrvM&sz=w640)](https://drive.google.com/file/d/1pJpix72N1Kkn3E9xsH3CpP1V2STvUrvM/view)

---

## How it works

1. You submit a task via the web dashboard
2. The backend finds the business phone number (via Exa web search)
3. Twilio places an outbound call
4. Deepgram Voice Agent handles real-time speech: STT → LLM (Gemini) → TTS
5. The call transcript and result are saved to Supabase and streamed back to the dashboard

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), Tailwind CSS, Supabase Auth |
| Backend | Node.js, Express, express-ws |
| Voice | Twilio Programmable Voice + Media Streams, Deepgram Voice Agent |
| AI / Search | Google Gemini (task parsing + agent LLM), Exa (business search) |
| Database | Supabase (PostgreSQL) |
| Deploy | Railway (backend), Vercel (frontend) |

---

## Prerequisites

You need accounts and API keys for:

| Service | What it's used for | Get it |
|---|---|---|
| [Twilio](https://twilio.com) | Outbound calls + media streaming | console.twilio.com |
| [Deepgram](https://deepgram.com) | Real-time STT + TTS voice agent | console.deepgram.com |
| [Google Gemini](https://aistudio.google.com) | Task parsing + agent LLM | aistudio.google.com |
| [Exa](https://exa.ai) | Business phone number search | dashboard.exa.ai |
| [Supabase](https://supabase.com) | Database + auth | app.supabase.com |

---

## Local setup

### 1. Clone the repo

```bash
git clone https://github.com/Dhruva966/outboundAI.git
cd outboundAI
```

### 2. Install dependencies

```bash
# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

### 3. Configure backend environment

Create `.env` at the repo root:

```env
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
TWILIO_WEBHOOK_BASE=https://your-ngrok-or-railway-url

# Deepgram
DEEPGRAM_API_KEY=your_deepgram_key

# Google Gemini
GEMINI_API_KEY=your_gemini_key

# Exa
EXA_API_KEY=your_exa_key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
```

### 4. Configure frontend environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 5. Set up Supabase

1. Create a new Supabase project
2. Run the migrations in `supabase/migrations/` (or apply the schema manually)
3. Enable Google OAuth: Authentication → Providers → Google
   - Add your GCP OAuth client ID + secret
4. Set Site URL to `http://localhost:3001`
5. Add redirect URL: `http://localhost:3001/auth/callback`

### 6. Set up Google OAuth (GCP)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Authorized JavaScript Origins: `http://localhost:3001`
4. Authorized Redirect URIs: `http://localhost:3001/auth/callback`
5. Copy client ID + secret into Supabase Google provider settings

### 7. Expose backend for Twilio (local dev)

Twilio needs a public URL to send webhooks. Use [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

Copy the ngrok URL and set it in `.env`:

```env
TWILIO_WEBHOOK_BASE=https://xxxx.ngrok-free.app
```

### 8. Run the app

```bash
# Terminal 1 — backend
npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

---

## Deployment

### Backend → Railway

1. Create account at [railway.com](https://railway.com)
2. Install CLI: `npm install -g @railway/cli`
3. From repo root:
   ```bash
   railway login
   railway init
   railway up
   ```
4. Generate a public domain: Railway Dashboard → service → Settings → Networking → Generate Domain
5. Set all environment variables from `.env` in the Railway Variables tab
   - Set `TWILIO_WEBHOOK_BASE` to your Railway domain
   - Set `FRONTEND_URL` to your Vercel domain (after deploying frontend)
   - Do **not** set `PORT` — Railway injects it automatically

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → import this repo
2. Set **Root Directory** to `frontend`
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` = your Railway backend URL
4. Deploy

After deploying both:
- Update Supabase Site URL + Redirect URLs to your Vercel domain
- Update GCP OAuth authorized origins + redirect URIs to your Vercel domain
- Update Railway `FRONTEND_URL` to your Vercel domain

---

## Environment variable reference

### Backend (`.env`)

| Variable | Required | Description |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | ✅ | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | ✅ | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | ✅ | Your Twilio phone number (E.164 format) |
| `TWILIO_WEBHOOK_BASE` | ✅ | Public URL Twilio uses for callbacks |
| `DEEPGRAM_API_KEY` | ✅ | Deepgram Voice Agent key |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `EXA_API_KEY` | ✅ | Exa search API key |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side only) |
| `FRONTEND_URL` | ✅ | Frontend URL for CORS |
| `PORT` | ❌ | Server port (default: 3000, auto-set by Railway) |
| `NODE_ENV` | ❌ | `development` or `production` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API URL |

---

## Project structure

```
outboundAI/
├── src/                  # Express backend
│   ├── server.js         # HTTP + WebSocket server
│   ├── index.js          # Entry point, env validation
│   ├── db.js             # Supabase client + queries
│   ├── agent/            # AI call agent logic
│   ├── audio/            # Audio transcoding (mulaw ↔ linear16)
│   └── middleware/       # Auth middleware
├── frontend/             # Next.js frontend
│   └── src/
│       ├── app/          # App Router pages
│       │   ├── (app)/    # Authenticated route group
│       │   └── login/    # Login page
│       ├── components/   # UI components
│       └── lib/          # Supabase client helpers
├── railway.json          # Railway deployment config
└── CLAUDE.md             # AI agent instructions
```

---

## License

Apache-2.0 license
