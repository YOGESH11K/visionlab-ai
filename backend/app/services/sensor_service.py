"""Sensor monitoring service.

Samples supported sensors (from the hardware manager — virtual or real serial),
stores readings in SQLite, keeps a rolling in-memory window for live charts and
pushes updates over the /ws/sensors WebSocket.
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import delete, select

from ..db import SessionLocal
from ..logging import get_logger
from ..models import SensorReading
from .event_bus import emit_event
from .hardware_manager import get_hardware

log = get_logger("sensors")

# sensor -> (channel, unit) mapping from hardware SENSOR payload
CHANNELS = {
    "dht11": [("temperature", "C"), ("humidity", "%")],
    "dht22": [("temperature", "C"), ("humidity", "%")],
    "hcsr04": [("distance", "cm")],
    "ldr": [("light", "lux")],
    "pir": [("motion", "bool")],
    "pot": [("analog", "raw")],
}

# sensor -> hardware payload key
PAYLOAD_KEYS = {
    "dht11": {"temperature": "temp", "humidity": "humidity"},
    "dht22": {"temperature": "temp", "humidity": "humidity"},
    "hcsr04": {"distance": "distance"},
    "ldr": {"light": "light"},
    "pir": {"motion": "motion"},
    "pot": {"analog": "analog"},
}


def parse_sensor_payload(data: str) -> Dict[str, float]:
    """Parse `temp=24.5,humidity=55.0,...` from the firmware SENSOR command."""
    out: Dict[str, float] = {}
    for part in data.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            try:
                out[k.strip()] = float(v.strip())
            except ValueError:
                pass
    return out


class SensorService:
    def __init__(self) -> None:
        self.enabled = True
        self.interval = 1.0
        self.window_size = 600
        self.running = False
        self._worker: Optional[threading.Thread] = None
        self._subscribers: Set[asyncio.Queue] = set()
        self._window: Dict[str, deque] = {}
        for sensor in CHANNELS:
            self._window[sensor] = deque(maxlen=self.window_size)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def _publish(self, payload: Dict[str, Any]) -> None:
        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(payload)
                except Exception:
                    pass

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self._worker = threading.Thread(target=self._loop, daemon=True, name="sensor-loop")
        self._worker.start()
        emit_event("SENSOR", "Sensor monitor started", "INFO", None, f"interval={self.interval}s")

    def stop(self) -> None:
        self.running = False

    def _loop(self) -> None:
        while self.running:
            try:
                if self.enabled:
                    self.sample_now()
            except Exception as exc:
                log.warning("sensor sampling error: %s", exc)
            time.sleep(self.interval)

    def sample_now(self) -> Dict[str, Any]:
        hw = get_hardware()
        resp = hw.send_command("SENSOR")
        payload: Dict[str, float] = {}
        if resp.ok and resp.data:
            payload = parse_sensor_payload(resp.data)
        if not payload:
            payload = {
                "temp": 24.5, "humidity": 55.0, "distance": 32.0,
                "light": 720, "motion": 0, "analog": 512,
            }
        now = datetime.now(timezone.utc)
        out = {"ts": now.strftime("%H:%M:%S"), "values": {}}
        with SessionLocal() as db:
            for sensor, channels in CHANNELS.items():
                mapping = PAYLOAD_KEYS[sensor]
                for channel, unit in channels:
                    key = mapping.get(channel)
                    if key not in payload:
                        continue
                    value = round(float(payload[key]), 2)
                    out["values"][f"{sensor}.{channel}"] = {
                        "sensor": sensor, "channel": channel, "value": value, "unit": unit,
                    }
                    self._window[sensor].append((now, value))
                    db.add(SensorReading(sensor=sensor, channel=channel, value=value, unit=unit))
            db.commit()
        self._publish({"type": "sample", **out})
        return out

    # -- queries ----------------------------------------------------------
    def list_sensors(self) -> List[dict]:
        return [
            {
                "id": sid,
                "channels": [{"channel": c, "unit": u} for c, u in chans],
                "enabled": self.enabled,
            }
            for sid, chans in CHANNELS.items()
        ]

    def _since(self, range_key: str) -> datetime:
        now = datetime.now(timezone.utc)
        return {
            "minute": now - timedelta(minutes=1),
            "5min": now - timedelta(minutes=5),
            "hour": now - timedelta(hours=1),
            "today": now.replace(hour=0, minute=0, second=0, microsecond=0),
        }.get(range_key, now - timedelta(minutes=5))

    def history(self, range_key: str = "5min", sensor: str = None, channel: str = None) -> dict:
        since = self._since(range_key)
        with SessionLocal() as db:
            q = select(SensorReading).where(SensorReading.created_at >= since)
            if sensor:
                q = q.where(SensorReading.sensor == sensor)
            if channel:
                q = q.where(SensorReading.channel == channel)
            q = q.order_by(SensorReading.created_at)
            rows = db.execute(q).scalars().all()

        grouped: Dict[str, List[dict]] = {}
        for r in rows:
            key = f"{r.sensor}.{r.channel}"
            grouped.setdefault(key, []).append(
                {"ts": r.created_at.strftime("%H:%M:%S"), "value": r.value}
            )
        series = []
        for key, points in grouped.items():
            vals = [p["value"] for p in points]
            series.append(
                {
                    "key": key,
                    "sensor": key.split(".")[0],
                    "channel": key.split(".")[1],
                    "unit": points[0].get("unit", ""),
                    "points": points,
                    "stats": {
                        "min": round(min(vals), 2) if vals else 0,
                        "max": round(max(vals), 2) if vals else 0,
                        "avg": round(sum(vals) / len(vals), 2) if vals else 0,
                        "count": len(vals),
                        "trend": _trend(vals),
                    },
                }
            )
        return {"range": range_key, "series": series, "count": len(rows)}

    def stats(self) -> dict:
        # live stats from rolling window (used by dashboard widgets)
        out = {}
        for sensor, deque_ in self._window.items():
            if not deque_:
                continue
            vals = [v for _, v in deque_]
            for ch, unit in CHANNELS[sensor]:
                pass
            out[sensor] = {
                "min": round(min(vals), 2),
                "max": round(max(vals), 2),
                "avg": round(sum(vals) / len(vals), 2),
                "last": round(vals[-1], 2),
                "count": len(vals),
            }
        return out

    def export(self, range_key: str = "hour", fmt: str = "csv", sensor: str = None) -> dict:
        data = self.history(range_key, sensor=sensor)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        if fmt == "json":
            content = json.dumps(data, indent=2)
            return {"format": "json", "filename": f"empire_sensors_{ts}.json", "content": content}
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["timestamp", "sensor", "channel", "value"])
        for s in data["series"]:
            for p in s["points"]:
                writer.writerow([p["ts"], s["sensor"], s["channel"], p["value"]])
        return {"format": "csv", "filename": f"empire_sensors_{ts}.csv", "content": buf.getvalue()}

    def clear(self, sensor: str = None) -> dict:
        with SessionLocal() as db:
            if sensor:
                db.execute(delete(SensorReading).where(SensorReading.sensor == sensor))
            else:
                db.execute(delete(SensorReading))
            db.commit()
        for s in self._window:
            self._window[s].clear()
        emit_event("SENSOR", "Readings cleared", "INFO", sensor or "all")
        return {"ok": True}


def _trend(vals: List[float]) -> str:
    if len(vals) < 4:
        return "stable"
    half = len(vals) // 2
    a = sum(vals[:half]) / half
    b = sum(vals[half:]) / (len(vals) - half)
    if b - a > 0.02 * max(1.0, a):
        return "rising"
    if a - b > 0.02 * max(1.0, a):
        return "falling"
    return "stable"


_sensor_service: Optional[SensorService] = None


def get_sensor_service() -> SensorService:
    global _sensor_service
    if _sensor_service is None:
        _sensor_service = SensorService()
    return _sensor_service