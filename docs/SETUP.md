# Setup

## Prerequisites

- **Python 3.10+** (tested with 3.10.7)
- **Node.js 20+/npm** (tested with Node 24 / npm 11)
- Optional: a webcam (for real vision) and an Arduino/ESP32 (for real hardware)

## 1. Backend

```powershell
cd backend
python -m pip install -r requirements.txt
```

The environment we validated with:

```
fastapi           0.115.6
uvicorn           0.34.0
opencv-python / opencv-contrib-python  5.x
numpy             2.x
mediapipe         1.0.1
pyserial          3.5
sqlalchemy        2.0.36
pydantic          2.10.4
pytest            8.3.4
pytest-asyncio
httpx
websockets
python-multipart
psutil
```

> If `mediapipe` forces a numpy/OpenCV bump, verify compatibility by importing them:
> `python -c "import mediapipe, cv2, numpy; print('ok')"`.

### Configuration (`.env`)

Copy `backend/.env.example` to `backend/.env` and edit as needed:

```
EMPIRE_HOST=127.0.0.1
EMPIRE_PORT=8000
EMPIRE_DEBUG=true
EMPIRE_DB_URL=sqlite:///.../empire.db      # or postgresql://...
EMPIRE_CAMERA_INDEX=0
EMPIRE_VISION_WIDTH=640
EMPIRE_VISION_HEIGHT=480
EMPIRE_STREAM_FPS=15
EMPIRE_INFERENCE_FPS=12
EMPIRE_SERIAL_BAUD=9600
EMPIRE_DEFAULT_BOARD=Arduino Uno
EMPIRE_AI_API_KEY=                          # leave empty = rule-based knowledge engine
```

## 2. Frontend

```powershell
cd frontend
npm install
npm run dev       # http://localhost:5173 (proxies /api and /ws → 127.0.0.1:8000)
```

`npm run build` produces a production bundle; `npm run typecheck` runs the TS check.

## 3. Run

```powershell
# terminal 1
scripts\run-backend.ps1
# terminal 2
scripts\run-frontend.ps1
```

Open **http://localhost:5173**. The backend serves a REST API on port 8000.

## 4. Tests

```powershell
cd backend
python -m pytest tests -q
```

## 5. Verify

- Health: `GET http://127.0.0.1:8000/api/health` → `{"status":"ok","app":"empire"}`
- Status: `GET /api/system/status` shows camera/arduino/ai/vision modes (SIMULATION/VIRTUAL fallbacks when no hardware).
- In the UI, open **Vision Lab** (simulation hand renders) and **Arduino/ESP32** (Virtual board controls respond).