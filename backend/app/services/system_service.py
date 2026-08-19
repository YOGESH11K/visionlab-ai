"""System status + diagnostics."""
from __future__ import annotations

from typing import Dict

import psutil

from ..config import settings
from .hardware_manager import get_hardware
from .vision_service import get_vision


def system_status() -> Dict:
    vision = get_vision()
    hw = get_hardware()

    hw_state = hw.state()
    arduino_connected = hw_state.get("connected", False)
    esp32_connected = hw_state.get("connected", False) and hw_state.get("board", "").startswith("ESP32")

    return {
        "status": {
            "camera": "CONNECTED" if vision.mode == "camera" else "SIMULATION" if vision.mode == "simulation" else "DISCONNECTED",
            "arduino": "CONNECTED" if arduino_connected and not hw_state.get("virtual") else "VIRTUAL" if hw_state.get("virtual") else "DISCONNECTED",
            "esp32": "CONNECTED" if esp32_connected else "AVAILABLE",
            "ai": "ONLINE" if settings.ai_enabled else "OFFLINE",
            "backend": "ONLINE",
            "vision": "ONLINE" if vision.running else "OFFLINE",
        },
        "hardware_mode": hw_state.get("mode", "disconnected"),
        "hardware_board": hw_state.get("board", ""),
        "vision_mode": vision.mode,
        "vision_fps": vision.state()["fps"],
        "gesture": vision.result.gesture if vision.result else "NO_HAND",
    }


def diagnostics() -> Dict:
    vision = get_vision()
    hw = get_hardware()
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()
    return {
        "camera_fps": round(vision.state()["fps"], 1),
        "vision_latency_ms": round(vision.state()["latency_ms"], 1),
        "vision_mode": vision.mode,
        "inference_fps_limit": settings.inference_fps,
        "cpu_percent": cpu,
        "memory_percent": round(mem.percent, 1),
        "memory_used_mb": round(mem.used / 1024 / 1024),
        "hardware_latency_ms": hw._last_ping_ms or 0.0,
        "hardware_mode": hw.mode,
        "websocket": "online",
        "backend": "online",
        "ai": "online" if settings.ai_enabled else "offline",
    }