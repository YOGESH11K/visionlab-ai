# Empire — Deployment Guide

This documents the production deployment of Empire (VisionLab AI).

## Live URLs

| Service  | URL |
|----------|-----|
| Frontend (Vercel) | https://visionlab-ai.vercel.app |
| Backend API (Render) | https://empire-backend-pjvk.onrender.com |
| GitHub repo | https://github.com/YOGESH11K/visionlab-ai |

## Architecture

```
Browser (Vercel)                    Render (FastAPI)
┌──────────────────┐  REST /api    ┌──────────────────────────┐
│ React + Vite SPA  │ ───────────▶ │ app.main:app (uvicorn)   │
│ wsUrl -> backend  │ ◀─────────── │ vision (MediaPipe/sim)   │
└──────────────────┘  WebSocket /ws│ gesture engine           │
   VITE_API_BASE                    │ sensors · projects · etc │
   = backend URL                    └──────────────────────────┘
```

The frontend is a static SPA served by Vercel. It calls the Render backend
cross-origin using `VITE_API_BASE` (baked into the JS bundle at build time).
WebSockets (`/ws/video`, `/ws/events`, `/ws/sensors`) connect directly to the
Render origin, which allows them (Vercel's own proxy does not forward WebSockets
on the free plan).

## Backend (Render)

The service was created via the Render Public API from the repo
`YOGESH11K/visionlab-ai` with `rootDir: backend`.

- **Runtime:** Python 3.12 (pinned via `backend/.python-version`)
- **Build:** `pip install --upgrade pip && pip install -r requirements.txt`
- **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health check:** `/api/health`
- **Plan:** free (Oregon), auto-deploy on commit to `master`

### Environment variables (Render dashboard → empire-backend → Environment)

| Key | Value |
|-----|-------|
| `EMPIRE_HOST` | `0.0.0.0` |
| `EMPIRE_PORT` | `8000` |
| `EMPIRE_LOG_LEVEL` | `INFO` |
| `EMPIRE_DEBUG` | `false` |
| `EMPIRE_CAMERA_INDEX` | `-1` (no webcam on Render → SIMULATION mode) |
| `EMPIRE_CORS_ORIGINS` | `https://visionlab-ai.vercel.app` (comma-separated) |
| `EMPIRE_AI_API_KEY` | *(optional)* enables the LLM assistant |

The same values are declared in `render.yaml` for Blueprint deployments.

### Re-deploying

Push to `master` → auto-deploy triggers. Or from the Render dashboard:
Deploy → Clear build cache & deploy (use only when dependency pins change).

### Notes / limits

- Render free instances sleep after inactivity and cold-start on the first
  request (can take 30–60s). Paid plans avoid this.
- SQLite data is ephemeral on Render (resets on redeploy). For persistence,
  attach a Render PostgreSQL database and set `EMPIRE_DB_URL` to its connection
  string (the app is PostgreSQL-ready via SQLAlchemy).
- No webcam/serial hardware exists on Render, so the app runs in clearly
  labelled SIMULATION camera + VIRTUAL Arduino mode.

## Frontend (Vercel)

- Project: `visionlab-ai` (linked via Vercel CLI, logged in as
  `yogeskumar63979195-2443`)
- Framework auto-detected: Vite (build `npm run build`, output `dist`)
- Env var (project → Settings → Environment Variables):
  - `VITE_API_BASE` = `https://empire-backend-pjvk.onrender.com` (Production)

### Re-deploying

```bash
cd frontend
vercel deploy --prod --yes
```

Or push to the connected branch (Vercel auto-deploys once Git integration is
enabled for the repo).

## Local development

```bash
scripts/run-backend.ps1    # uvicorn on 127.0.0.1:8000
scripts/run-frontend.ps1   # vite dev on localhost:5173 (proxies /api + /ws)
```

No `VITE_API_BASE` is needed locally — the Vite dev server proxies `/api` and
`/ws` to `127.0.0.1:8000`.

## Verify a deployment

```bash
curl https://empire-backend-pjvk.onrender.com/api/health
curl https://visionlab-ai.vercel.app
```

Check the event console and camera feed in the UI for live WebSocket traffic.