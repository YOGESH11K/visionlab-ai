# API Reference

Base URL: `http://127.0.0.1:8000`. JSON bodies for POST/PUT. CORS allows `localhost:5173`.

## System

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{"status":"ok","app":"empire"}` |
| GET | `/api/system/status` | camera/arduino/esp32/ai/vision states + modes + fps + current gesture |
| GET | `/api/system/diagnostics` | fps, latencies, CPU/memory, websocket, backend, ai |
| GET | `/api/system/config` | sanitized runtime config (no secrets) |

## Vision

| Method | Path | Body / Notes |
|---|---|---|
| GET | `/api/vision/state` | mode, running, fps, latency, result |
| POST | `/api/vision/start` · `/stop` | |
| POST | `/api/vision/camera/{index}` | switch camera |
| POST | `/api/vision/simulation` | force simulation |
| POST | `/api/vision/sim/gesture` | `{gesture}` |
| POST | `/api/vision/detection` | `{enabled}` |
| POST | `/api/vision/overlays` | `{landmarks,bbox,ar,threshold}` |
| POST | `/api/vision/reset` | reset engine |

## Gestures

| Method | Path | Notes |
|---|---|---|
| GET | `/api/gestures/mappings` | all mappings + computed command |
| GET | `/api/gestures/mappings/{g}` | one |
| PUT | `/api/gestures/mappings/{g}` | `{action_type,target,value,enabled}` |
| POST | `/api/gestures/reset` | defaults |
| GET | `/api/gestures/action-types` | |

## Hardware

| Method | Path | Notes |
|---|---|---|
| GET | `/api/hardware/state` | board state incl. sensors |
| GET | `/api/hardware/ports` | serial ports |
| GET | `/api/hardware/boards` | supported boards |
| POST | `/api/hardware/connect` | `{port?,baud?,board?}`; empty port → Virtual |
| POST | `/api/hardware/disconnect` | |
| POST | `/api/hardware/command` | `{command:"LED3_ON"}` |
| GET | `/api/hardware/ping` | latency ms |

## Components

| Method | Path | Notes |
|---|---|---|
| GET | `/api/components` | all + categories |
| GET | `/api/components/categories` | |
| GET | `/api/components/search?q=` | |
| GET | `/api/components/{id}` | |
| GET | `/api/components/identify/{name}` | alias resolve |
| POST | `/api/components/scan` | experimental scan of current frame |

## Sensors

| Method | Path | Notes |
|---|---|---|
| GET | `/api/sensors/list` | sensor/channel definitions |
| GET | `/api/sensors/history?range_key=5min` | `minute|5min|hour|today`, optional `sensor`,`channel` |
| GET | `/api/sensors/stats` | rolling-window stats |
| GET | `/api/sensors/export?fmt=csv&range_key=hour` | `csv|json` |
| POST | `/api/sensors/sample` | force sample |
| POST | `/api/sensors/clear` | `{sensor?}` |

## AI

| Method | Path | Notes |
|---|---|---|
| POST | `/api/ai/chat` | `{message, mode?}` → `{answer, source, component}` |
| GET | `/api/ai/history` | chat history |
| POST | `/api/ai/generate` | `{description}` → `{ok,code,components,pins,explanation,expected}` |
| POST | `/api/ai/generate/save` | `{name?,description?,code}` → `{ok,id}` |

## Circuits

| Method | Path | Notes |
|---|---|---|
| GET | `/api/circuits/components` | pin catalog |
| POST | `/api/circuits/validate` | `{components, connections}` |

## Projects

| Method | Path | Notes |
|---|---|---|
| GET | `/api/projects` | list |
| POST | `/api/projects` | `{name, description, payload}` |
| GET | `/api/projects/{id}` | |
| PUT | `/api/projects/{id}` | `{name?, description?, payload?}` |
| DELETE | `/api/projects/{id}` | |

## Learning

| Method | Path | Notes |
|---|---|---|
| GET | `/api/learning/quizzes` | progress + quiz names |
| GET | `/api/learning/quiz/{key}` | `component|pins|circuit|arduino`, `?count=5` |
| POST | `/api/learning/quiz/{key}/submit` | `{answers:[{question,selected,correct}]}` |
| GET | `/api/learning/progress` | per-key attempts/score/percent |
| GET | `/api/learning/suggestions` | project ideas |

## WebSockets

| Path | Payload |
|---|---|
| `/ws/video` | frame JSON (jpeg + detection + mode + fps) |
| `/ws/events` | history then live events |
| `/ws/sensors` | sample JSON |

## Errors

All endpoints return JSON. Errors use HTTP status codes (400/404/500) with
`{"detail": "..."}` (FastAPI default) or structured bodies for command responses
(`{"ok":false,"status":"ERROR",...}`).