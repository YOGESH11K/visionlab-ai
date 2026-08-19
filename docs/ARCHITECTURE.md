# Architecture

## High-level

Empire is a two-process app: a Python **FastAPI** backend (vision, hardware, data, AI) and a
**React/Vite** frontend (workspace UI). They talk over REST + three WebSocket hubs.

```
┌────────────────────────────┐         HTTP /api/*         ┌────────────────────────────┐
│  React 18 + TS + Vite      │  ─────────────────────────▶ │  FastAPI backend            │
│  Tailwind v4 design system │  ◀───────────────────────── │  app.main (CORS, lifespan) │
│  12 workspace pages        │     WS /ws/video            │  routers/ (12 domains)      │
│  api.ts typed client       │     WS /ws/events           │  services/ (domain logic)   │
│  store.tsx app state       │     WS /ws/sensors          │  models.py (SQLAlchemy)     │
└────────────────────────────┘                             └─────────────┬──────────────┘
                                                                          │ serial (pyserial)
                                                          ┌───────────────┴──────────────┐
                                                          │ Arduino Uno/Nano/Mega/ESP32  │
                                                          │ or Virtual Arduino (fallback)│
                                                          └──────────────────────────────┘
```

## Backend layering

- **`routers/`** — thin HTTP/WS adapters. No business logic.
- **`services/`** — domain logic, fully decoupled:
  - `vision_service` — camera or SIMULATION loop, MediaPipe hand tracking, JPEG snapshots.
  - `gesture_engine` — named gestures + stability (smoothing, debounce, cooldown, confidence).
  - `gesture_mapping` — gesture → action translation, persisted mappings.
  - `hardware_manager` — Virtual Arduino + serial connection, shared command protocol.
  - `sensor_service` — sampling loop, SQLite history, rolling window, WS publish.
  - `event_bus` — in-process events → SQLite log → `/ws/events` fan-out.
  - `component_db`, `ai_assistant`, `circuit_validator`, `scanner_service`,
    `project_service`, `learning_service`, `system_service`.
- **`db.py`** — SQLAlchemy session; SQLite default, PostgreSQL-swappable (config `EMPIRE_DB_URL`).

## Frontend layering

- **`lib/api.ts`** — typed client + shared types; Vite proxies `/api` and `/ws` to the backend.
- **`lib/store.tsx`** — app context: page nav, 2s status polling, event WS, toasts, filters.
- **`lib/useVideo.ts`** — WS video frame hook.
- **`components/`** — Sidebar, Topbar, EventConsole, VideoFeed, UI primitives (Panel/Tag/Metric/StatusDot),
  charts (LineChart/Gauge/Sparkline), icons, CodeBlock/Markdownish.
- **`pages/`** — one page per workspace, state-based navigation (no router library).

## Data flow: gesture → hardware

```
camera/sim frame → MediaPipe → 21 landmarks → GestureEngine (stable?)
   → GestureMappingService.find_enabled(gesture) → mapping_to_command(mapping)
   → HardwareManager.send_command(cmd) → VirtualArduino | SerialConnection
   → CommandResponse → event_bus.emit_event → SQLite + /ws/events → UI (LEDs update)
```

## WebSocket hubs

| Hub | Payload |
|---|---|
| `/ws/video` | `{type:"frame", jpeg: base64, detection: {...}, mode, fps}` |
| `/ws/events` | `{type:"history", events:[...]}` then `{type:"event", ts, source, event, command, status, detail}` |
| `/ws/sensors` | `{type:"sample", ts, values:{ "dht11.temperature": {sensor, channel, value, unit}, … }}` |

## Configuration

All settings via `EMPIRE_`-prefixed env vars or `backend/.env` (see `.env.example`).
The `/api/system/config` endpoint returns the sanitized runtime config — secrets are never exposed.