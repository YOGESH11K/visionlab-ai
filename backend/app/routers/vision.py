"""Vision endpoints: start/stop, camera selection, simulation, overlays, state."""
from typing import Optional

from fastapi import APIRouter

from ..services.vision_service import get_vision

router = APIRouter(prefix="/api/vision", tags=["vision"])


@router.get("/state")
def state():
    return get_vision().state()


@router.post("/start")
def start():
    return get_vision().start()


@router.post("/stop")
def stop():
    get_vision().stop()
    return {"ok": True}


@router.post("/camera/{index}")
def camera(index: int):
    return get_vision().set_camera(index)


@router.post("/simulation")
def simulation():
    return get_vision().use_simulation()


@router.post("/sim/gesture")
def sim_gesture(payload: dict):
    return get_vision().set_sim_gesture(payload.get("gesture", ""))


@router.post("/detection")
def detection(payload: dict):
    v = get_vision()
    v.detection_enabled = bool(payload.get("enabled", v.detection_enabled))
    return {"ok": True, "enabled": v.detection_enabled}


@router.post("/overlays")
def overlays(payload: dict):
    v = get_vision()
    if "landmarks" in payload:
        v.show_landmarks = bool(payload["landmarks"])
    if "bbox" in payload:
        v.show_bbox = bool(payload["bbox"])
    if "ar" in payload:
        v.show_ar = bool(payload["ar"])
    if "threshold" in payload:
        v.confidence_threshold = float(payload["threshold"])
        v.engine.confidence_threshold = float(payload["threshold"])
    return {"ok": True}


@router.post("/reset")
def reset():
    get_vision().engine.reset()
    return {"ok": True}