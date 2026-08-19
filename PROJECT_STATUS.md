# EMPIRE — Project Status

> Product: **Empire** — AI-powered electronics laboratory (formerly "VisionLab AI").
> Computer vision · Hand tracking · AI · Arduino/ESP32 · Electronics learning · Gesture control · Sensor monitoring · Circuit analysis.

This file tracks the state of the build. It is updated after every completed phase.
See `handoff.md` for the running phase-by-phase handoff log.

---

## Current architecture

```
empire/
├── backend/                 Python 3.10 · FastAPI · OpenCV · MediaPipe
│   ├── app/
│   │   ├── main.py          FastAPI app + WebSocket hubs + router mount
│   │   ├── config.py        Settings (env-driven, .env support)
│   │   ├── logging.py       Structured logging (INFO/WARNING/ERROR/DEBUG)
│   │   ├── db.py            SQLite via SQLAlchemy (PostgreSQL-ready session pattern)
│   │   ├── routers/         REST + WebSocket endpoints per domain
│   │   └── services/        Domain logic (vision, gesture, hardware, components, ...)
│   └── tests/               pytest suite (gesture, protocol, components, circuits, API)
├── frontend/                React 18 + TypeScript + Vite + Tailwind v4
├── arduino/firmware/        Arduino .ino firmware (LED/PWM/Servo/Sensor protocol)
├── docs/                    Architecture & operator documentation
└── scripts/                 setup / run / test helper scripts
```

**Stack (deliberately minimal):**
- Frontend: React, TypeScript, Vite, Tailwind CSS. No router/state libraries — state-based navigation.
- Vision: Python OpenCV + MediaPipe Hands. Extensible `VisionService` with simulation fallback.
- Backend: FastAPI, REST + WebSocket. Frame stream over WS (JPEG) + detection JSON.
- Hardware: serial (pyserial) + built-in **Virtual Arduino** (exact same command protocol).
- Database: SQLite (SQLAlchemy session abstraction keeps a PostgreSQL swap possible).
- AI: rule-based knowledge engine (verified internal component data) + optional OpenAI-compatible API.

## Existing functionality

- [x] Backend FastAPI app with health/system endpoints and WebSocket hubs.
- [x] Component knowledge database (JSON, data-driven, ~24 components).
- [x] Vision service: MediaPipe hand tracking, 21 landmarks, left/right, finger states/count, palm bbox.
- [x] Synthetic simulation camera (clearly labelled SIMULATION) when no webcam is present.
- [x] Gesture engine: named gestures, temporal smoothing, debounce, confidence threshold, cooldown, stable detection.
- [x] Gesture mapping manager: fully configurable gesture → action mappings, persisted to SQLite.
- [x] Hardware manager: serial port scan/connect/disconnect, boards, baud, serial monitor, command protocol with IDs/status.
- [x] Virtual Arduino: simulates LEDs, PWM, servo, buzzer, digital/analog inputs, sensors; UI identical to real board.
- [x] Vision→Hardware pipeline: stable gesture → mapping → command → (virtual|real) Arduino → LED states + events.
- [x] Sensor monitor: virtual sensors (DHT11/22, HC-SR04, LDR, PIR, potentiometer), stats, history (SQLite), CSV/JSON export.
- [x] AI assistant: verified-data Q&A + intent-based Arduino code generator + safe fallback; optional LLM.
- [x] Circuit builder model + validator API (GREEN/YELLOW/RED per connection + warnings).
- [x] Projects CRUD (components, pin mappings, gestures, code, circuit, notes).
- [x] Learning engine: component/pin/circuit/Arduino quizzes, scores, progress, project suggestions.
- [x] Experimental component scanner (heuristic contour analysis, low-confidence "possible match", clearly labelled).
- [x] Arduino firmware (.ino) implementing the command protocol.
- [x] React frontend: design system, sidebar/topbar, Dashboard, Vision Lab, Gesture Control, Component Scanner, Sensor Monitor, Arduino/ESP32, AI Assistant, Code Generator, Circuit Builder, Projects, Learning Lab, Settings.
- [x] Event console (time/source/event/command/status) with filters.
- [x] Diagnostics panel (camera FPS, vision latency, CPU/memory, serial latency, WS/backend status).
- [x] Settings workspace: live system status, runtime diagnostics, sanitized configuration (no secrets exposed).
- [x] Docs (`docs/`) + helper scripts (`scripts/`).
- [x] Type-check and production build clean (`npm run typecheck`, `npm run build`).

## Missing functionality (known limits, all handled gracefully)

- **Real object detection** for components (e.g. YOLO) — no trained weights. Scanner uses an honest
  *experimental heuristic* mode and manual identification; never claims false positives.
- **Real webcam / real serial hardware** — not present in the build environment. The system auto-falls
  back to clearly-labelled SIMULATION camera and VIRTUAL Arduino; real hardware code paths are implemented
  and exercised via mocks/tests.
- **Internet AI** — disabled unless `EMPIRE_AI_API_KEY` is set; fallback is the verified knowledge engine.

## Problems encountered

- `mediapipe` upgrade forced `numpy 2.x` + `opencv-contrib-python 5.x`; verified import compatibility (passes).
- Camera absent on CI/build host → simulation fallback required (implemented, labelled, tested).
- No Java environment — irrelevant (stack is Python/Node only).

## Planned implementation

Covered by the 24-phase plan in `handoff.md`; remaining work is polishing and extra tests depth.

## Completed work

Phase-by-phase details and timestamps are logged in `handoff.md`.

---

**Validation status (final checklist):** see the closing section of `handoff.md`.
