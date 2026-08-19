"""Gesture mapping manager.

Maps a gesture name to a hardware action. Mappings are persisted to SQLite
and fully editable at runtime. The mapping → command translation is shared
between real and virtual hardware.
"""
from typing import Dict, List, Optional

from sqlalchemy import select

from ..db import SessionLocal
from ..logging import get_logger
from ..models import GestureMapping
from .event_bus import emit_event
from .hardware_manager import get_hardware

log = get_logger("mapping")

DEFAULT_MAPPINGS: List[dict] = [
    {"gesture": "ZERO_FINGERS", "action_type": "led_off", "target": "ALL", "value": 0, "enabled": True},
    {"gesture": "ONE_FINGER", "action_type": "led_on", "target": "LED_1", "value": 0, "enabled": True},
    {"gesture": "TWO_FINGERS", "action_type": "led_on", "target": "LED_2", "value": 0, "enabled": True},
    {"gesture": "THREE_FINGERS", "action_type": "led_on", "target": "LED_3", "value": 0, "enabled": True},
    {"gesture": "FOUR_FINGERS", "action_type": "led_on", "target": "LED_4", "value": 0, "enabled": True},
    {"gesture": "OPEN_PALM", "action_type": "led_on", "target": "ALL", "value": 0, "enabled": True},
    {"gesture": "FIST", "action_type": "led_off", "target": "ALL", "value": 0, "enabled": True},
    {"gesture": "THUMB_UP", "action_type": "relay", "target": "RELAY", "value": 1, "enabled": True},
    {"gesture": "THUMB_DOWN", "action_type": "relay", "target": "RELAY", "value": 0, "enabled": True},
    {"gesture": "PEACE", "action_type": "custom", "target": "MODE_NEXT", "value": 0, "enabled": True},
    {"gesture": "POINT", "action_type": "buzzer", "target": "BUZZER", "value": 1000, "enabled": True},
    {"gesture": "PINCH", "action_type": "pwm", "target": "LED_1", "value": 120, "enabled": True},
    {"gesture": "SWIPE_LEFT", "action_type": "custom", "target": "MODE_PREV", "value": 0, "enabled": True},
    {"gesture": "SWIPE_RIGHT", "action_type": "custom", "target": "MODE_NEXT", "value": 0, "enabled": True},
]

# Action types that produce a concrete serial command
ACTION_TO_COMMAND = {
    "led_on": lambda m: _target_to_led(m["target"], True),
    "led_off": lambda m: _target_to_led(m["target"], False),
    "pwm": lambda m: f"{m['target'].replace('LED_', 'LED')}_PWM:{m.get('value', 128)}",
    "servo": lambda m: f"SERVO:{m.get('value', 90)}",
    "buzzer": lambda m: f"BUZZER:{m.get('value', 1000)}:200",
    "relay": lambda m: f"RELAY:{'ON' if m.get('value') else 'OFF'}",
    "motor": lambda m: f"MOTOR:{m.get('value', 0)}",
    "custom": lambda m: m["target"],
}


def _target_to_led(target: str, on: bool) -> str:
    if target.upper() == "ALL":
        return "ALL_ON" if on else "ALL_OFF"
    return f"{target.upper().replace('LED_', 'LED')}_{'ON' if on else 'OFF'}"


def apply_command(cmd: str) -> dict:
    """Send a raw command through the hardware manager."""
    hw = get_hardware()
    resp = hw.send_command(cmd)
    return resp.to_dict()


def mapping_to_command(mapping: dict) -> str:
    fn = ACTION_TO_COMMAND.get(mapping["action_type"])
    if not fn:
        return mapping.get("target", "")
    return fn(mapping)


class GestureMappingService:
    def seed_defaults(self) -> None:
        with SessionLocal() as db:
            existing = set(db.scalars(select(GestureMapping.gesture)).all())
            for m in DEFAULT_MAPPINGS:
                if m["gesture"] not in existing:
                    db.add(GestureMapping(**m))
            db.commit()

    def list(self) -> List[dict]:
        with SessionLocal() as db:
            rows = db.scalars(select(GestureMapping).order_by(GestureMapping.id)).all()
            return [self._to_dict(r) for r in rows]

    def get(self, gesture: str) -> Optional[dict]:
        with SessionLocal() as db:
            row = db.scalar(select(GestureMapping).where(GestureMapping.gesture == gesture))
            return self._to_dict(row) if row else None

    def upsert(self, data: dict) -> dict:
        gesture = data.get("gesture")
        if not gesture:
            raise ValueError("gesture is required")
        with SessionLocal() as db:
            row = db.scalar(select(GestureMapping).where(GestureMapping.gesture == gesture))
            if row is None:
                row = GestureMapping(gesture=gesture)
                db.add(row)
            row.action_type = data.get("action_type", row.action_type or "custom")
            row.target = data.get("target", row.target or "")
            row.value = data.get("value", row.value)
            row.enabled = data.get("enabled", row.enabled)
            db.commit()
            db.refresh(row)
        emit_event("SYSTEM", "Gesture mapping updated", "INFO", gesture, row.action_type)
        return self._to_dict(row)

    def reset_defaults(self) -> None:
        with SessionLocal() as db:
            db.query(GestureMapping).delete()
            for m in DEFAULT_MAPPINGS:
                db.add(GestureMapping(**m))
            db.commit()

    def find_enabled(self, gesture: str) -> Optional[dict]:
        m = self.get(gesture)
        if m and m.get("enabled"):
            return m
        return None

    @staticmethod
    def _to_dict(row: GestureMapping) -> dict:
        return {
            "gesture": row.gesture,
            "action_type": row.action_type,
            "target": row.target,
            "value": row.value,
            "enabled": row.enabled,
            "command": mapping_to_command(
                {
                    "action_type": row.action_type,
                    "target": row.target,
                    "value": row.value,
                }
            ),
        }


_mapping_service: Optional[GestureMappingService] = None


def get_mapping_service() -> GestureMappingService:
    global _mapping_service
    if _mapping_service is None:
        _mapping_service = GestureMappingService()
        _mapping_service.seed_defaults()
    return _mapping_service