# EMPIRE — AI Electronics Laboratory

**Empire** (formerly "VisionLab AI") is a production-grade AI-powered electronics laboratory:
computer vision hand tracking, gesture control, Arduino/ESP32, sensor monitoring, an AI
assistant and code generator, a circuit builder, projects and a learning lab — in one app.

```
Frontend (React + Vite)  ──HTTP/WS──▶  Backend (FastAPI)  ──serial──▶  Arduino / ESP32
      · 12 workspaces         │           · vision (MediaPipe)         (or Virtual Arduino)
      · live video + events    │           · gesture engine             — same protocol —
      · charts + exports       └──SQLite──▶ events · sensors · mappings · projects · scores
```

## Quick start

```powershell
# 1. Backend
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

No webcam? No Arduino? Empire auto-falls back to a **clearly-labelled SIMULATION** camera and a
**Virtual Arduino**, so every feature works out of the box.

## Tests

```powershell
cd backend
python -m pytest tests -q    # 60 tests
```

## Repo layout

```
backend/        FastAPI app (routers + services + tests) + component DB + SQLite data
frontend/       React 18 + TypeScript + Vite + Tailwind v4
arduino/        .ino firmware (Uno / gesture demo / ESP32)
docs/           Architecture, setup, hardware, vision, gestures, API, troubleshooting…
scripts/        setup / run / test helpers
```

## Modules

| Module | What it does |
|---|---|
| Vision Lab | Live webcam or SIMULATION feed; 21-hand landmark tracking, overlays |
| Gesture Control | Map any gesture to any hardware action; persisted, editable, reset |
| Component Scanner | Experimental heuristic scanner + verified manual identification |
| Sensor Monitor | Live sensors (DHT11/22, HC-SR04, LDR, PIR, pot), charts, CSV/JSON export |
| Arduino / ESP32 | Serial connect, board/baud, serial monitor, LED/servo/relay/motor controls |
| AI Assistant | Verified-knowledge Q&A (ELI5/technical), optional LLM |
| Code Generator | Plain-English → compilable Arduino sketch |
| Circuit Builder | Pin-level circuit editor with GREEN/YELLOW/RED validation |
| Projects | Save/load projects (components, pins, code, notes) |
| Learning Lab | Component/pin/circuit/Arduino quizzes with progress tracking |
| Settings | Status, diagnostics, sanitized configuration |

See `docs/` for deep dives on each area.