"""Gesture mapping endpoints."""
from fastapi import APIRouter, HTTPException

from ..services.gesture_mapping import get_mapping_service

router = APIRouter(prefix="/api/gestures", tags=["gestures"])

SERVICE = get_mapping_service


@router.get("/mappings")
def list_mappings():
    return {"mappings": SERVICE().list()}


@router.get("/mappings/{gesture}")
def get_mapping(gesture: str):
    m = SERVICE().get(gesture)
    if not m:
        raise HTTPException(404, "mapping not found")
    return m


@router.put("/mappings/{gesture}")
def put_mapping(gesture: str, payload: dict):
    payload["gesture"] = gesture
    try:
        return SERVICE().upsert(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/reset")
def reset_defaults():
    SERVICE().reset_defaults()
    return {"ok": True}


@router.get("/action-types")
def action_types():
    return {"actions": ["led_on", "led_off", "pwm", "servo", "buzzer", "relay", "motor", "custom"]}