# Troubleshooting

## Backend won't start

- Port 8000 in use → change `EMPIRE_PORT` or kill the old process:
  `Get-NetTCPConnection -LocalPort 8000 | Select OwningProcess` then `Stop-Process`.
- Missing packages → `python -m pip install -r requirements.txt` from `backend/`.
- `mediapipe`/numpy conflict → `pip install -U numpy opencv-contrib-python` then re-import to verify.
- Database locked → delete `backend/data/empire.db` only if you're OK losing stored data
  (mappings/projects/scores reset to defaults on restart).

## Camera shows SIMULATION instead of real feed

That's expected on hosts without a camera (or when camera index 0 fails). It is clearly labelled.
To force real camera: set `EMPIRE_CAMERA_INDEX` and call `POST /api/vision/camera/{index}` or the
**start** button in the Vision workspace. Check `GET /api/system/status` → camera.

## Arduino connects but no response

- Check the COM port in the UI list (device manager on Windows).
- Match the baud: Uno/Nano/Mega 9600, ESP32 firmware 115200.
- Verify the firmware is uploaded with the same protocol (see `docs/ARDUINO.md`).
- Empire auto-falls back to **Virtual Arduino** on serial errors and logs the event — look at the
  Event Console for the exact serial error.

## Gestures fire commands unexpectedly

- 1–4 finger counts intentionally drive LEDs by default. Hold poses briefly — gestures must be
  stable (3 frames, cooldown 0.8 s) to fire.
- `POINT`/`PEACE` need ~2 s hold; adjust threshold/cooldown via the engine settings in
  `gesture_engine.py` or the vision `/overlays` endpoint.
- Disable a mapping in **Gesture Control** to stop a specific gesture.

## Component Scanner returns nothing / low confidence

It's an experimental heuristic — improve lighting, move closer, avoid glare, and use **manual
identification** for verified info.

## AI answers "unknown component"

The assistant only answers from the verified database (24 components). It intentionally refuses to
hallucinate. Try: "pins of LED", "connect an HC-SR04", "what is a DHT22?".

## Frontend can't reach the backend

- Confirm backend is on `127.0.0.1:8000` (Vite proxies `/api` and `/ws` there).
- Run `Invoke-RestMethod http://127.0.0.1:8000/api/health`.
- If you changed backend host/port, update `frontend/vite.config.ts` proxy.

## TypeScript / build errors

```powershell
cd frontend
npm run typecheck
npm run build
```

`tsc -b --noEmit` (typecheck) must be clean before `npm run build`.

## Tests

```powershell
cd backend
python -m pytest tests -q
```

60 tests cover gesture engine, protocol, services and the API.

## Still stuck?

Check the Event Console (top-right, bell icon) — every subsystem logs events there. Enable DEBUG
logging via `EMPIRE_LOG_LEVEL=DEBUG` in `backend/.env`.