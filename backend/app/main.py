"""Empire backend entrypoint.

REST API + three WebSocket hubs:
  /ws/video    -> JPEG frame stream + detection JSON
  /ws/events   -> event console stream
  /ws/sensors  -> live sensor sample stream
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .logging import setup_logging
from .routers import ai, circuits, components, events, gestures, hardware, health, learning, projects, sensors, vision
from .services import event_bus, sensor_service, vision_service

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    vision_service.get_vision().start()
    sensor_service.get_sensor_service().start()
    yield
    vision_service.get_vision().stop()
    sensor_service.get_sensor_service().stop()


app = FastAPI(
    title="Empire",
    description="AI-powered electronics laboratory — vision, hand tracking, Arduino/ESP32, sensors, learning.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (health, vision, gestures, hardware, components, sensors, ai, circuits, projects, learning, events):
    app.include_router(r.router)


# ---------------------------------------------------------------------------
# WebSocket hubs
# ---------------------------------------------------------------------------
@app.websocket("/ws/video")
async def ws_video(ws: WebSocket):
    await ws.accept()
    v = vision_service.get_vision()
    try:
        while True:
            jpeg = v.snapshot_b64()
            payload = {
                "type": "frame",
                "jpeg": jpeg,
                "detection": v.last_detection,
                "mode": v.mode,
                "fps": v.state()["fps"],
            }
            await ws.send_json(payload)
            await asyncio.sleep(1.0 / max(settings.stream_fps, 1))
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await ws.close()
        except Exception:
            pass


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    q = event_bus.subscribe()
    try:
        await ws.send_json({"type": "history", "events": event_bus.get_recent_events(50)})
        while True:
            payload = await q.get()
            await ws.send_json({"type": "event", **payload})
    except WebSocketDisconnect:
        pass
    finally:
        event_bus.unsubscribe(q)


@app.websocket("/ws/sensors")
async def ws_sensors(ws: WebSocket):
    await ws.accept()
    svc = sensor_service.get_sensor_service()
    q = svc.subscribe()
    try:
        while True:
            payload = await q.get()
            await ws.send_json(payload)
    except WebSocketDisconnect:
        pass
    finally:
        svc.unsubscribe(q)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)