"""Sensor monitor endpoints."""
from typing import Optional

from fastapi import APIRouter

from ..services.sensor_service import get_sensor_service

router = APIRouter(prefix="/api/sensors", tags=["sensors"])


@router.get("/list")
def list_sensors():
    return {"sensors": get_sensor_service().list_sensors()}


@router.get("/history")
def history(range_key: str = "5min", sensor: Optional[str] = None, channel: Optional[str] = None):
    return get_sensor_service().history(range_key, sensor, channel)


@router.get("/stats")
def stats():
    return get_sensor_service().stats()


@router.get("/export")
def export(range_key: str = "hour", fmt: str = "csv", sensor: Optional[str] = None):
    return get_sensor_service().export(range_key, fmt, sensor)


@router.post("/sample")
def sample():
    return get_sensor_service().sample_now()


@router.post("/clear")
def clear(payload: dict = None):
    sensor = (payload or {}).get("sensor")
    return get_sensor_service().clear(sensor)