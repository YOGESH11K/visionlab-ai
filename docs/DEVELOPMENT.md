# Development

## Quick commands

```powershell
# backend
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # run
python -m pytest tests -q                                      # test (60 passing)

# frontend
cd frontend
npm run dev                                                    # dev server :5173
npm run typecheck                                              # TS check
npm run build                                                  # production build
```

## Repo map

```
backend/
  app/
    main.py            FastAPI app, CORS, lifespan, 3 WS hubs
    config.py          EMPIRE_-prefixed settings
    db.py              SQLAlchemy session + init_db
    models.py          GestureMapping, SensorReading, EventLog, Project, QuizScore, AssistantHistory, SettingsKV
    routers/           health, vision, gestures, hardware, components, sensors, ai, circuits, projects, learning, events
    services/          event_bus, vision_service, gesture_engine, gesture_mapping, hardware_manager,
                       sensor_service, component_db, scanner_service, ai_assistant, circuit_validator,
                       project_service, learning_service, system_service
    data/components.json
  tests/               test_gesture.py, test_protocol.py, test_services.py, test_api.py
  pytest.ini
frontend/
  src/
    lib/               api.ts (client+types), store.tsx (context), useVideo.ts (WS feed hook)
    components/        Sidebar, Topbar, EventConsole, VideoFeed, ui, charts, icons, CodeBlock
    pages/             Dashboard, VisionLab, GestureControl, ComponentScanner, SensorMonitor,
                       HardwareLab, AIAssistant, CodeGenerator, CircuitBuilder, Projects, LearningLab, Settings
    index.css          Tailwind v4 design system (@theme tokens, .panel/.btn/.input/.grid-bg/…)
arduino/firmware/      empire_uno, gesture_leds, empire_esp32
docs/                  per-area documentation
scripts/               setup.ps1, run-backend.ps1, run-frontend.ps1, test.ps1
```

## Conventions

- **Backend**: routers stay thin; logic lives in `services/`. New domain logic = new service +
  router + event emission via `emit_event`. Tests mirror the domain (`test_*.py` in `backend/tests`).
- **Frontend**: no router/state libraries — `store.tsx` context + `PageKey` navigation. All HTTP via
  `lib/api.ts` (typed). Reuse `components/ui.tsx` primitives and `components/icons.tsx`; avoid new
  icon deps. Charts are self-contained SVG components.
- **Data**: component knowledge lives in `components.json` (no code change needed to add a component).
- **Config**: every tunable uses an `EMPIRE_` env var with a sensible default in `config.py`.
- **Secrets**: never commit or expose secrets. `/api/system/config` redacts them by design.

## Adding a feature — checklist

1. Service in `backend/app/services/` + unit tests.
2. Router in `backend/app/routers/`, mounted in `main.py`.
3. Event emission + WS payloads where live UI is needed.
4. Client types + method in `frontend/src/lib/api.ts`.
5. Page or widget in `frontend/src/pages/` or `components/`.
6. `pytest` green; `npm run typecheck` green; manual smoke via dev servers.
7. Update `handoff.md`, `PROJECT_STATUS.md`, and `docs/` if behavior/API changed.

## Validation flow (Phase 20)

1. Start backend + frontend.
2. `GET /api/health`, `/api/system/status`, `/api/system/config`.
3. Exercise every workspace in the UI (all 12 pages) and the WS feeds.
4. Run `python -m pytest tests -q` and `npm run typecheck` / `npm run build`.
5. Update the final checklist in `handoff.md`.