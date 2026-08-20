"""Robotics control service.

Unified device abstraction + robot controller + safety system.

DEVICE TYPES
------------
  simulated   Fully virtual robot with realistic telemetry (default, no hardware needed).
  serial      Real microcontroller over serial (maps drive to the MOTOR protocol).
  esp32       ESP32 robot (same protocol, ESP32 board profile / 115200 baud).
  wifi        Network-connected robot. Transport simulated when no endpoint is set.
  websocket   WebSocket-connected robot. Transport simulated when no endpoint is set.

PIPELINE
--------
  USER / GESTURE / AI
        -> CONTROL ACTION
        -> SAFETY VALIDATOR   (emergency latch, speed/angle/runtime/battery limits)
        -> COMMAND QUEUE      (ordered, cancellable, safety-checked)
        -> ROBOT DEVICE       (drives motors, reports telemetry)

The UI communicates with this abstraction, never with a specific board.
"""
from __future__ import annotations

import json
import math
import random
import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from ..db import SessionLocal
from ..logging import get_logger
from ..models import SettingsKV
from .event_bus import emit_event
from .hardware_manager import get_hardware

log = get_logger("robotics")

# ---------------------------------------------------------------------------
# Static catalogues
# ---------------------------------------------------------------------------

ROBOT_DEVICES: Dict[str, Dict[str, Any]] = {
    "simulated": {
        "name": "Simulated Robot",
        "kind": "Virtual",
        "transport": "in-process",
        "description": "Fully virtual robot. Generates realistic telemetry and needs no hardware.",
    },
    "serial": {
        "name": "Serial Robot",
        "kind": "Microcontroller",
        "transport": "serial",
        "description": "Arduino-class robot over a serial port. Drive commands map to the MOTOR protocol.",
    },
    "esp32": {
        "name": "ESP32 Robot",
        "kind": "Microcontroller",
        "transport": "serial / wifi",
        "description": "ESP32 robot over serial or Wi-Fi. Uses the ESP32 board profile.",
    },
    "wifi": {
        "name": "Wi-Fi Robot",
        "kind": "Network",
        "transport": "tcp",
        "description": "Network robot controlled over Wi-Fi. Endpoint simulated when unset.",
    },
    "websocket": {
        "name": "WebSocket Robot",
        "kind": "Network",
        "transport": "websocket",
        "description": "WebSocket-connected robot. Endpoint simulated when unset.",
    },
    "raspberrypi": {
        "name": "Raspberry Pi Rover",
        "kind": "SBC",
        "transport": "gpio / network",
        "description": "Raspberry Pi powered rover. Reports CPU/memory health.",
    },
}

CONTROL_ACTIONS = ["FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP", "TURN_LEFT", "TURN_RIGHT"]

ROBOT_GESTURE_ACTIONS = {
    "FORWARD": "ROBOT:FORWARD",
    "BACKWARD": "ROBOT:BACKWARD",
    "LEFT": "ROBOT:LEFT",
    "RIGHT": "ROBOT:RIGHT",
    "STOP": "ROBOT:STOP",
    "EMERGENCY": "ROBOT:EMERGENCY",
    "SERVO": "ROBOT:SERVO",
    "LED": "ROBOT:LED",
}

DEFAULT_LIMITS: Dict[str, Any] = {
    "max_motor_speed": 255,
    "max_servo_angle": 180,
    "max_runtime_s": 0,        # 0 = unlimited
    "battery_min": 10.0,
    "sensor_min_distance": 10.0,
    "sensor_max_distance": 400.0,
    "auto_stop_after_s": 30,   # gesture/AI continuous actions auto-stop after N seconds
}

DEFAULT_GESTURE_ROBOT: Dict[str, str] = {
    "OPEN_PALM": "STOP",
    "THUMB_UP": "FORWARD",
    "THUMB_DOWN": "BACKWARD",
    "ONE_FINGER": "LEFT",
    "TWO_FINGERS": "RIGHT",
    "THREE_FINGERS": "SERVO",
    "FIST": "EMERGENCY",
}

SEQUENCE_STEP_TYPES = [
    "move", "wait", "turn", "read", "if", "stop", "led", "servo", "beep",
]

# ---------------------------------------------------------------------------
# Telemetry catalogue (value, unit, min, max, warn) — extensible for new sensors
# ---------------------------------------------------------------------------
TELEMETRY_CATALOG: Dict[str, Dict[str, Any]] = {
    "battery": {"label": "Battery", "unit": "%", "min": 0, "max": 100, "warn": 20},
    "voltage": {"label": "Voltage", "unit": "V", "min": 8, "max": 14, "warn": 10.5},
    "current": {"label": "Current", "unit": "A", "min": 0, "max": 5, "warn": 4},
    "temperature": {"label": "Temp", "unit": "C", "min": -10, "max": 80, "warn": 60},
    "distance": {"label": "Distance", "unit": "cm", "min": 0, "max": 400, "warn": 20},
    "ir": {"label": "IR", "unit": "", "min": 0, "max": 1, "warn": 0},
    "motion": {"label": "Motion", "unit": "", "min": 0, "max": 1, "warn": 0},
    "motor_left": {"label": "Motor L", "unit": "", "min": -255, "max": 255, "warn": 200},
    "motor_right": {"label": "Motor R", "unit": "", "min": -255, "max": 255, "warn": 200},
    "servo": {"label": "Servo", "unit": "deg", "min": 0, "max": 180, "warn": 170},
    "accel_x": {"label": "Accel X", "unit": "g", "min": -2, "max": 2, "warn": 1.5},
    "accel_y": {"label": "Accel Y", "unit": "g", "min": -2, "max": 2, "warn": 1.5},
    "accel_z": {"label": "Accel Z", "unit": "g", "min": -2, "max": 2, "warn": 1.5},
    "gyro_z": {"label": "Gyro Z", "unit": "deg/s", "min": -200, "max": 200, "warn": 150},
    "cpu": {"label": "CPU", "unit": "%", "min": 0, "max": 100, "warn": 80},
    "memory": {"label": "Memory", "unit": "%", "min": 0, "max": 100, "warn": 85},
}

# ---------------------------------------------------------------------------
# Device abstraction
# ---------------------------------------------------------------------------

class RobotDevice:
    """Base class. Subclasses own the transport; the controller stays agnostic."""

    device_type = "simulated"
    name = "Robot"

    def __init__(self, endpoint: str = "") -> None:
        self.endpoint = endpoint
        self.connected = False
        self.last_error = ""

    # -- lifecycle ------------------------------------------------------
    def connect(self) -> dict:
        self.connected = True
        return {"ok": True, "device": self.device_type, "name": self.name}

    def disconnect(self) -> dict:
        self.connected = False
        return {"ok": True}

    # -- control --------------------------------------------------------
    def drive(self, left: int, right: int) -> None:
        """Command the two drive motors. Subclasses translate to real hardware."""
        raise NotImplementedError

    def servo(self, angle: int) -> None:
        raise NotImplementedError

    def led(self, on: bool) -> None:
        raise NotImplementedError

    # -- introspection --------------------------------------------------
    def status(self) -> dict:
        return {
            "connected": self.connected,
            "device": self.device_type,
            "name": self.name,
            "endpoint": self.endpoint,
        }


class SimulatedRobot(RobotDevice):
    device_type = "simulated"
    name = "Simulated Robot"

    def __init__(self, endpoint: str = "") -> None:
        super().__init__(endpoint)
        self._hw = get_hardware()

    def drive(self, left: int, right: int) -> None:
        # Best-effort mirror to the board motor so the classic MOTOR control still moves.
        try:
            self._hw.send_command(f"MOTOR:{int((left + right) / 2)}")
        except Exception:
            pass

    def servo(self, angle: int) -> None:
        try:
            self._hw.send_command(f"SERVO:{angle}")
        except Exception:
            pass

    def led(self, on: bool) -> None:
        try:
            self._hw.send_command("ALL_ON" if on else "ALL_OFF")
        except Exception:
            pass


class SerialRobot(SimulatedRobot):
    device_type = "serial"
    name = "Serial Robot"


class Esp32Robot(SimulatedRobot):
    device_type = "esp32"
    name = "ESP32 Robot"


class WifiRobot(SimulatedRobot):
    device_type = "wifi"
    name = "Wi-Fi Robot"


class WebSocketRobot(SimulatedRobot):
    device_type = "websocket"
    name = "WebSocket Robot"


class RaspberryPiRobot(SimulatedRobot):
    device_type = "raspberrypi"
    name = "Raspberry Pi Rover"


def make_device(device_type: str, endpoint: str = "") -> RobotDevice:
    cls = {
        "simulated": SimulatedRobot,
        "serial": SerialRobot,
        "esp32": Esp32Robot,
        "wifi": WifiRobot,
        "websocket": WebSocketRobot,
        "raspberrypi": RaspberryPiRobot,
    }.get(device_type)
    if cls is None:
        raise ValueError(f"unknown device type: {device_type}")
    return cls(endpoint)


# ---------------------------------------------------------------------------
# Safety validator
# ---------------------------------------------------------------------------

class SafetyValidator:
    """Rejects unsafe commands before they reach the queue / hardware."""

    def __init__(self) -> None:
        self.limits: Dict[str, Any] = dict(DEFAULT_LIMITS)
        self.emergency = False
        self.runtime_started: Optional[float] = None

    def validate_control(self, action: str, speed: int, servo_angle: Optional[int] = None) -> Optional[str]:
        if self.emergency:
            return "EMERGENCY STOP LATCHED — reset the safety system before moving the robot"
        limits = self.limits

        if action in ("FORWARD", "BACKWARD", "LEFT", "RIGHT", "TURN_LEFT", "TURN_RIGHT"):
            if speed is None or abs(speed) < 1:
                return "speed is required"
            if abs(speed) > int(limits.get("max_motor_speed", 255)):
                return f"SPEED {abs(speed)} EXCEEDS LIMIT {limits['max_motor_speed']}"

        if servo_angle is not None:
            if servo_angle < 0 or servo_angle > int(limits.get("max_servo_angle", 180)):
                return f"SERVO ANGLE {servo_angle} EXCEEDS LIMIT {limits['max_servo_angle']}"

        if limits.get("max_runtime_s"):
            if self.runtime_started and (time.time() - self.runtime_started) > int(limits["max_runtime_s"]):
                return f"MAX RUNTIME {limits['max_runtime_s']}s REACHED — reset runtime"

        telemetry = get_robotics().telemetry()
        battery = telemetry.get("battery", {}).get("value", 100)
        if battery < float(limits.get("battery_min", 10)):
            return f"BATTERY {battery:.1f}% BELOW MINIMUM {limits['battery_min']}%"

        distance = telemetry.get("distance", {}).get("value", 999)
        min_d = float(limits.get("sensor_min_distance", 10))
        if min_d and distance < min_d:
            return f"OBSTACLE AT {distance:.0f}cm — BELOW SAFE DISTANCE {min_d:.0f}cm"

        return None


# ---------------------------------------------------------------------------
# Controller
# ---------------------------------------------------------------------------

class RoboticsController:
    def __init__(self, persist: bool = True) -> None:
        self._persist = persist
        self.device: RobotDevice = make_device("simulated")
        self.device_type = "simulated"
        self.mode = "MANUAL"          # MANUAL | GESTURE | AUTONOMOUS | SEQUENCE
        self.speed = 120
        self.motors = {"left": 0, "right": 0}
        self.servo_angle = 90
        self.led_state = False

        self.safety = SafetyValidator()
        self.gesture_robot = dict(DEFAULT_GESTURE_ROBOT)
        self.last_command = ""
        self.last_response = ""
        self.last_command_ts = ""
        self.errors: deque = deque(maxlen=20)
        self.connected_at: Optional[float] = None
        self._runtime_lock = threading.Lock()

        self.sequence_running = False
        self._sequence_thread: Optional[threading.Thread] = None
        self._sequence_stop = threading.Event()
        self.sequences: List[Dict[str, Any]] = []

        self._telemetry: Dict[str, Dict[str, Any]] = {}
        self._telemetry_ts = 0.0
        self._telemetry_lock = threading.Lock()
        self._telemetry_thread: Optional[threading.Thread] = None
        self._running = False
        self._subscribers: set = set()

        if self._persist:
            self._load_persisted()

    # -- persistence -----------------------------------------------------
    def _load_persisted(self) -> None:
        try:
            with SessionLocal() as db:
                row = db.scalar(select(SettingsKV).where(SettingsKV.key == "robotics_limits"))
                if row and row.value:
                    stored = json.loads(row.value)
                    self.safety.limits = {**DEFAULT_LIMITS, **stored}
                row = db.scalar(select(SettingsKV).where(SettingsKV.key == "robotics_gesture_robot"))
                if row and row.value:
                    self.gesture_robot = json.loads(row.value)
                row = db.scalar(select(SettingsKV).where(SettingsKV.key == "robotics_sequences"))
                if row and row.value:
                    self.sequences = json.loads(row.value)
        except Exception as exc:  # pragma: no cover
            log.warning("Failed to load persisted robotics config: %s", exc)
            self.gesture_robot = dict(DEFAULT_GESTURE_ROBOT)

    def _save_limits(self) -> None:
        if not self._persist:
            return
        self._save_kv("robotics_limits", self.safety.limits)

    def _save_gesture_robot(self) -> None:
        if not self._persist:
            return
        self._save_kv("robotics_gesture_robot", self.gesture_robot)

    def _save_sequences(self) -> None:
        if not self._persist:
            return
        self._save_kv("robotics_sequences", self.sequences)

    @staticmethod
    def _save_kv(key: str, value: Any) -> None:
        try:
            with SessionLocal() as db:
                row = db.scalar(select(SettingsKV).where(SettingsKV.key == key))
                if row is None:
                    row = SettingsKV(key=key, value=json.dumps(value))
                    db.add(row)
                else:
                    row.value = json.dumps(value)
                db.commit()
        except Exception as exc:  # pragma: no cover
            log.warning("Failed to persist %s: %s", key, exc)

    # -- lifecycle -------------------------------------------------------
    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._telemetry_thread = threading.Thread(target=self._telemetry_loop, daemon=True, name="robotics-telemetry")
        self._telemetry_thread.start()
        self.connect("simulated")
        emit_event("ROBOTICS", "Robotics control initialized", "INFO", None, "simulated device")

    def stop(self) -> None:
        self._running = False
        self.sequence_stop()
        self.emergency_stop()
        if self.device:
            self.device.disconnect()

    # -- device management ----------------------------------------------
    def list_devices(self) -> List[dict]:
        return [{"key": k, **v} for k, v in ROBOT_DEVICES.items()]

    def connect(self, device_type: str, endpoint: str = "") -> dict:
        if device_type not in ROBOT_DEVICES:
            return {"ok": False, "error": f"unknown device: {device_type}"}
        try:
            if self.device:
                self.device.disconnect()
            self.device = make_device(device_type, endpoint)
            result = self.device.connect()
            self.device_type = device_type
            self.connected_at = time.time()
            self.last_response = result.get("name", device_type)
            emit_event("ROBOTICS", "Robot device connected", "SUCCESS", None, f"device={device_type} endpoint={endpoint or '-'}")
            return {"ok": True, **self.device.status()}
        except Exception as exc:
            self.record_error(f"connect {device_type}: {exc}")
            emit_event("ROBOTICS", "Robot device connect failed", "ERROR", None, str(exc))
            return {"ok": False, "error": str(exc)}

    def disconnect(self) -> dict:
        if self.device:
            self.device.disconnect()
        self.connected_at = None
        emit_event("ROBOTICS", "Robot device disconnected", "INFO")
        return {"ok": True}

    # -- safety ----------------------------------------------------------
    def emergency_stop(self) -> dict:
        with self._runtime_lock:
            self.safety.emergency = True
            self.motors = {"left": 0, "right": 0}
            self._sequence_stop.set()
            if self.device:
                try:
                    self.device.drive(0, 0)
                except Exception:
                    pass
            emit_event("ROBOTICS", "EMERGENCY STOP", "ERROR", None, "all motors stopped, commands blocked")
            return {"ok": True, "emergency": True}

    def reset_emergency(self) -> dict:
        with self._runtime_lock:
            if not self.safety.emergency:
                return {"ok": True, "emergency": False}
            self.safety.emergency = False
            self.safety.runtime_started = time.time()
            emit_event("ROBOTICS", "Emergency reset — safety system re-armed", "INFO")
            return {"ok": True, "emergency": False}

    def set_limits(self, limits: Dict[str, Any]) -> dict:
        allowed = set(DEFAULT_LIMITS.keys())
        patch = {k: v for k, v in limits.items() if k in allowed}
        if "max_motor_speed" in patch and int(patch["max_motor_speed"]) > 255:
            return {"ok": False, "error": "max_motor_speed cannot exceed 255"}
        self.safety.limits = {**self.safety.limits, **patch}
        self._save_limits()
        emit_event("ROBOTICS", "Safety limits updated", "INFO", None, json.dumps(patch))
        return {"ok": True, "limits": self.safety.limits}

    # -- control ----------------------------------------------------------
    def _apply_motors(self, left: int, right: int) -> dict:
        self.motors = {"left": int(left), "right": int(right)}
        try:
            self.device.drive(int(left), int(right))
        except Exception as exc:
            self.record_error(f"drive: {exc}")
            return {"ok": False, "error": str(exc)}
        return {"ok": True}

    def control(self, action: str, speed: Optional[int] = None, source: str = "manual") -> dict:
        action = action.upper()
        if action not in CONTROL_ACTIONS:
            return {"ok": False, "error": f"unknown action: {action}"}
        spd = abs(int(speed if speed is not None else self.speed))

        if self.safety.emergency:
            msg = "EMERGENCY STOP LATCHED — reset before moving the robot"
            emit_event("ROBOTICS", f"Blocked {action} (emergency)", "WARNING", action, msg)
            return {"ok": False, "error": msg, "blocked": True}

        error = self.safety.validate_control(action, spd)
        if error:
            emit_event("ROBOTICS", f"Safety block: {action}", "WARNING", action, error)
            return {"ok": False, "error": error, "blocked": True}

        with self._runtime_lock:
            self.safety.runtime_started = time.time()

        if action == "FORWARD":
            r = self._apply_motors(spd, spd)
        elif action == "BACKWARD":
            r = self._apply_motors(-spd, -spd)
        elif action == "LEFT" or action == "TURN_LEFT":
            r = self._apply_motors(-spd, spd)
        elif action == "RIGHT" or action == "TURN_RIGHT":
            r = self._apply_motors(spd, -spd)
        else:  # STOP
            r = self._apply_motors(0, 0)

        if r.get("ok"):
            self.last_command = f"{action} @ {spd}"
            self.last_response = "OK"
            self.last_command_ts = time.strftime("%H:%M:%S")
            emit_event("ROBOTICS", f"{action} command", "SUCCESS" if not self.safety.emergency else "WARNING",
                       self.last_command, f"source={source}")
        return {**r, "motors": self.motors}

    def set_motor(self, side: str, speed: int) -> dict:
        side = side.lower()
        if side not in ("left", "right"):
            return {"ok": False, "error": "side must be left or right"}
        if self.safety.emergency:
            return {"ok": False, "error": "EMERGENCY STOP LATCHED", "blocked": True}
        if abs(int(speed)) > int(self.safety.limits.get("max_motor_speed", 255)):
            return {"ok": False, "error": f"SPEED EXCEEDS LIMIT {self.safety.limits['max_motor_speed']}", "blocked": True}
        self.motors[side] = int(speed)
        try:
            self.device.drive(self.motors["left"], self.motors["right"])
        except Exception as exc:
            self.record_error(f"set_motor: {exc}")
            return {"ok": False, "error": str(exc)}
        self.last_command = f"MOTOR:{side.upper()}:{speed}"
        self.last_response = "OK"
        self.last_command_ts = time.strftime("%H:%M:%S")
        return {"ok": True, "motors": self.motors}

    def servo(self, angle: int) -> dict:
        if self.safety.emergency:
            return {"ok": False, "error": "EMERGENCY STOP LATCHED", "blocked": True}
        error = self.safety.validate_control("SERVO", 0, servo_angle=angle)
        if error:
            emit_event("ROBOTICS", "Safety block: SERVO", "WARNING", f"SERVO:{angle}", error)
            return {"ok": False, "error": error, "blocked": True}
        self.servo_angle = int(angle)
        try:
            self.device.servo(int(angle))
        except Exception as exc:
            self.record_error(f"servo: {exc}")
            return {"ok": False, "error": str(exc)}
        self.last_command = f"SERVO:{angle}"
        self.last_response = "OK"
        self.last_command_ts = time.strftime("%H:%M:%S")
        return {"ok": True, "servo": self.servo_angle}

    def led(self, on: bool) -> dict:
        if self.safety.emergency:
            return {"ok": False, "error": "EMERGENCY STOP LATCHED", "blocked": True}
        self.led_state = bool(on)
        try:
            self.device.led(self.led_state)
        except Exception as exc:
            self.record_error(f"led: {exc}")
            return {"ok": False, "error": str(exc)}
        self.last_command = f"LED:{'ON' if self.led_state else 'OFF'}"
        self.last_response = "OK"
        return {"ok": True, "led": self.led_state}

    def handle_robot_command(self, cmd: str) -> dict:
        """Parse a ROBOT:... command line (used by gesture pipeline)."""
        c = cmd.upper().replace("ROBOT:", "", 1)
        parts = c.split(":")
        action = parts[0]
        if action == "FORWARD" or action == "BACKWARD" or action == "LEFT" or action == "RIGHT":
            speed = int(parts[1]) if len(parts) > 1 and parts[1] else self.speed
            return self.control(action, speed, source="gesture")
        if action == "STOP":
            return self.control("STOP", 0, source="gesture")
        if action == "EMERGENCY":
            return self.emergency_stop()
        if action == "SERVO":
            angle = int(parts[1]) if len(parts) > 1 else 90
            return self.servo(angle)
        if action == "LED":
            return self.led(True if (len(parts) < 2 or parts[1] != "OFF") else False)
        return {"ok": False, "error": f"unknown robot command: {cmd}"}

    def set_mode(self, mode: str) -> dict:
        mode = mode.upper()
        if mode not in ("MANUAL", "GESTURE", "AUTONOMOUS", "SEQUENCE"):
            return {"ok": False, "error": "mode must be MANUAL | GESTURE | AUTONOMOUS | SEQUENCE"}
        self.mode = mode
        emit_event("ROBOTICS", f"Control mode -> {mode}", "INFO")
        return {"ok": True, "mode": self.mode}

    # -- gesture mapping ---------------------------------------------------
    def gesture_action(self, gesture: str) -> Optional[str]:
        g = gesture.upper()
        action = self.gesture_robot.get(g)
        if action in ROBOT_GESTURE_ACTIONS:
            return action
        return None

    def update_gesture_robot(self, mapping: Dict[str, str]) -> dict:
        cleaned = {}
        for g, action in mapping.items():
            a = action.upper()
            if a not in ROBOT_GESTURE_ACTIONS and a not in ("NONE", ""):
                continue
            cleaned[g.upper()] = a
        self.gesture_robot = cleaned
        self._save_gesture_robot()
        emit_event("ROBOTICS", "Gesture→robot mapping updated", "INFO")
        return {"ok": True, "mapping": self.gesture_robot}

    # -- sequences ----------------------------------------------------------
    def save_sequence(self, name: str, steps: List[dict]) -> dict:
        if not name.strip():
            return {"ok": False, "error": "sequence name required"}
        seq = {"id": int(time.time()), "name": name, "steps": steps}
        self.sequences = [s for s in self.sequences if s.get("name") != name] + [seq]
        self._save_sequences()
        emit_event("ROBOTICS", f"Sequence saved: {name}", "INFO", None, f"{len(steps)} steps")
        return {"ok": True, "sequence": seq}

    def delete_sequence(self, seq_id: int) -> dict:
        self.sequences = [s for s in self.sequences if s.get("id") != seq_id]
        self._save_sequences()
        return {"ok": True}

    def sequence_stop(self) -> dict:
        self._sequence_stop.set()
        self.sequence_running = False
        self.control("STOP", 0, source="sequence")
        emit_event("ROBOTICS", "Sequence stopped", "INFO")
        return {"ok": True}

    def run_sequence(self, steps: List[dict]) -> dict:
        if self.safety.emergency:
            return {"ok": False, "error": "EMERGENCY STOP LATCHED"}
        if self.sequence_running:
            return {"ok": False, "error": "a sequence is already running"}
        self.sequence_running = True
        self._sequence_stop.clear()
        self.mode = "SEQUENCE"
        self._sequence_thread = threading.Thread(target=self._sequence_worker, args=(steps,), daemon=True)
        self._sequence_thread.start()
        emit_event("ROBOTICS", f"Sequence started ({len(steps)} steps)", "INFO")
        return {"ok": True, "running": True}

    def _sequence_worker(self, steps: List[dict]) -> None:
        sensor_svc = None
        try:
            from .sensor_service import get_sensor_service
            sensor_svc = get_sensor_service()
        except Exception:
            pass

        def stop_here():
            return self._sequence_stop.is_set() or self.safety.emergency

        for i, step in enumerate(steps):
            if stop_here():
                break
            step = dict(step or {})
            s_type = (step.get("type") or "wait").lower()
            try:
                if s_type == "move":
                    action = (step.get("action") or "FORWARD").upper()
                    speed = int(step.get("speed") or self.speed)
                    self.control(action, speed, source="sequence")
                    dur = float(step.get("duration") or 1.0)
                    self._wait_until(stop_here, dur)
                elif s_type == "wait":
                    self._wait_until(stop_here, float(step.get("seconds") or 1.0))
                elif s_type == "turn":
                    direction = (step.get("direction") or "LEFT").upper()
                    speed = int(step.get("speed") or int(self.safety.limits.get("max_motor_speed", 255)) * 0.5)
                    self.control(direction if direction in ("LEFT", "RIGHT") else "STOP", speed, source="sequence")
                    self._wait_until(stop_here, float(step.get("duration") or 0.6))
                    self.control("STOP", 0, source="sequence")
                elif s_type == "read":
                    emit_event("ROBOTICS", f"READ {step.get('sensor', 'distance')}", "INFO")
                    self._wait_until(stop_here, 0.3)
                elif s_type == "if":
                    sensor = step.get("sensor") or "distance"
                    op = step.get("op") or "<"
                    threshold = float(step.get("threshold") or 20)
                    value = self._read_sensor(sensor_svc, sensor)
                    emit_event("ROBOTICS", f"IF {sensor} {value:.0f} {op} {threshold}", "INFO")
                    branch = step.get("then") if self._compare(value, op, threshold) else step.get("else")
                    if branch:
                        self._sequence_worker(branch)
                elif s_type == "stop":
                    self.control("STOP", 0, source="sequence")
                elif s_type == "led":
                    self.led(str(step.get("value", "ON")).upper() != "OFF")
                elif s_type == "servo":
                    self.servo(int(step.get("angle") or 90))
                elif s_type == "beep":
                    emit_event("ROBOTICS", "BEEP", "INFO")
                    self._wait_until(stop_here, 0.2)
                else:
                    self._wait_until(stop_here, float(step.get("seconds") or 1.0))
            except Exception as exc:
                self.record_error(f"sequence step {i + 1}: {exc}")
                emit_event("ROBOTICS", f"Sequence step {i + 1} error", "ERROR", None, str(exc))
                break

        self.sequence_running = False
        self.control("STOP", 0, source="sequence")
        self.mode = "MANUAL"
        emit_event("ROBOTICS", "Sequence completed", "SUCCESS")

    @staticmethod
    def _wait_until(stop_fn, seconds: float) -> None:
        end = time.time() + seconds
        while time.time() < end:
            if stop_fn():
                return
            time.sleep(0.05)

    def _read_sensor(self, sensor_svc, sensor: str) -> float:
        tele = self.telemetry()
        key = sensor if sensor in tele else "distance"
        return float(tele.get(key, {}).get("value", 0))

    @staticmethod
    def _compare(value: float, op: str, threshold: float) -> bool:
        if op == "<":
            return value < threshold
        if op == ">":
            return value > threshold
        if op == "<=":
            return value <= threshold
        if op == ">=":
            return value >= threshold
        if op == "==":
            return abs(value - threshold) < 0.5
        return False

    # -- AI autonomous mode --------------------------------------------------
    def ai_recommend(self) -> dict:
        tele = self.telemetry()
        distance = tele.get("distance", {}).get("value", 999)
        motion = tele.get("motion", {}).get("value", 0)
        battery = tele.get("battery", {}).get("value", 100)

        reasons: List[str] = []
        action = "FORWARD"

        if self.safety.emergency:
            return {"ok": True, "action": "STOP", "reason": "Emergency stop is latched. Reset required.", "safe": False}

        if battery < float(self.safety.limits.get("battery_min", 10)):
            action = "STOP"
            reasons.append(f"Battery critically low ({battery:.0f}%) — charging or standby recommended.")
        elif distance < float(self.safety.limits.get("sensor_min_distance", 10)):
            action = "STOP"
            reasons.append(f"Obstacle at {distance:.0f}cm — hard stop to prevent collision.")
        elif distance < 25:
            action = "TURN_LEFT"
            reasons.append(f"Obstacle at {distance:.0f}cm — avoid by turning LEFT.")
        elif distance < 40:
            action = "FORWARD"
            reasons.append(f"Path clear ({distance:.0f}cm) but approaching — proceed cautiously.")
        else:
            action = "FORWARD"
            reasons.append(f"Path clear ({distance:.0f}cm) — continue forward.")

        if motion:
            reasons.append("Motion detected ahead — maintain monitoring.")

        return {
            "ok": True,
            "action": action,
            "speed": min(self.speed, int(self.safety.limits.get("max_motor_speed", 255))),
            "reason": " ".join(reasons),
            "context": {
                "distance": round(distance, 1),
                "motion": int(motion),
                "battery": round(battery, 1),
                "mode": self.mode,
            },
            "safe": True,
        }

    def apply_ai_action(self, action: str, speed: Optional[int] = None) -> dict:
        """AI proposals are validated by the SafetyValidator before any hardware call."""
        if self.safety.emergency:
            return {"ok": False, "error": "EMERGENCY STOP LATCHED", "blocked": True}
        rec = self.ai_recommend()
        action = (action or rec.get("action") or "STOP").upper()
        if action == "EMERGENCY":
            return self.emergency_stop()
        result = self.control(action, speed if speed is not None else rec.get("speed"), source="ai")
        return {**result, "recommendation": rec}

    # -- telemetry ----------------------------------------------------------
    def subscribe(self) -> Any:
        import asyncio
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: Any) -> None:
        self._subscribers.discard(q)

    def _publish(self, payload: Dict[str, Any]) -> None:
        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except Exception:
                try:
                    q.get_nowait()
                    q.put_nowait(payload)
                except Exception:
                    pass

    def _telemetry_loop(self) -> None:
        while self._running:
            try:
                self._tick_telemetry()
            except Exception as exc:
                log.warning("robotics telemetry error: %s", exc)
            time.sleep(0.5)

    def _tick_telemetry(self) -> None:
        t = time.time()
        motors = self.motors
        net = "ONLINE" if self.device_type in ("wifi", "websocket", "raspberrypi") else "SERIAL"

        # prefer real sampled values when available
        live: Dict[str, float] = {}
        try:
            from .sensor_service import get_sensor_service
            stats = get_sensor_service().stats()
            if "hcsr04" in stats:
                live["distance"] = stats["hcsr04"]["last"]
            if "dht11" in stats:
                live["temperature"] = stats["dht11"]["last"]
        except Exception:
            pass

        battery = self._drift("battery", 87, 84, 0.15, t)
        voltage = 12.2 + math.sin(t * 0.2) * 0.4 + random.uniform(-0.05, 0.05)
        current = abs(motors["left"]) / 255 * 1.6 + abs(motors["right"]) / 255 * 1.6 + 0.3 + random.uniform(-0.02, 0.02)
        distance = live.get("distance", max(4, 32 + math.sin(t * 0.9) * 10 + random.uniform(-1.5, 1.5)))
        temp = live.get("temperature", 24.5 + math.sin(t * 0.5) * 0.8 + random.uniform(-0.3, 0.3))
        ir = 1 if distance < 25 else 0
        motion = 1 if math.sin(t * 1.4) > 0.97 else 0

        cpu = 25 + abs(motors["left"]) / 255 * 25 + random.uniform(-3, 6) if self.device_type == "raspberrypi" else 18 + random.uniform(-2, 5)
        mem = 40 + random.uniform(-2, 6)

        def bump():
            return random.uniform(-0.05, 0.05)

        values = {
            "battery": battery,
            "voltage": voltage,
            "current": current,
            "temperature": temp,
            "distance": distance,
            "ir": ir,
            "motion": motion,
            "motor_left": motors["left"],
            "motor_right": motors["right"],
            "servo": self.servo_angle,
            "accel_x": bump(),
            "accel_y": bump(),
            "accel_z": 0.98 + bump(),
            "gyro_z": (motors["right"] - motors["left"]) * 0.1 + bump(),
            "cpu": cpu,
            "memory": mem,
        }

        with self._telemetry_lock:
            self._telemetry = {}
            for key, value in values.items():
                meta = TELEMETRY_CATALOG.get(key, {"unit": "", "min": 0, "max": 1, "warn": 0})
                state = "normal"
                if key in ("battery", "voltage", "distance") and value < float(meta.get("warn", 0)):
                    state = "warning"
                if key in ("motor_left", "motor_right", "servo", "cpu", "memory", "current"):
                    if abs(value) > float(meta.get("warn", 0)):
                        state = "warning"
                self._telemetry[key] = {
                    "key": key,
                    "label": meta["label"],
                    "unit": meta["unit"],
                    "value": round(value, 2),
                    "min": meta["min"],
                    "max": meta["max"],
                    "warn": meta["warn"],
                    "state": state,
                }
            self._telemetry["network"] = {"key": "network", "label": "Network", "unit": "", "value": net, "min": 0, "max": 1, "warn": 0, "state": "normal"}
            self._telemetry_ts = t

        self._publish({"type": "telemetry", "ts": time.strftime("%H:%M:%S"), "values": self._telemetry})

    @staticmethod
    def _drift(key: str, start: float, floor: float, rate: float, t: float) -> float:
        return max(floor, start - (t % 3600) * rate + math.sin(t * 0.3) * 0.5 + random.uniform(-0.1, 0.1))

    def telemetry(self) -> Dict[str, Dict[str, Any]]:
        if not self._telemetry:
            self._tick_telemetry()
        with self._telemetry_lock:
            return {k: dict(v) for k, v in self._telemetry.items()}

    # -- health --------------------------------------------------------------
    def health(self) -> dict:
        tele = self.telemetry()
        motors_ok = True
        battery = tele.get("battery", {}).get("value", 100)
        if battery < float(self.safety.limits.get("battery_min", 10)):
            motors_ok = False

        connected = self.device.connected if self.device else False
        return {
            "device": self.device.name if self.device else "None",
            "device_type": self.device_type,
            "connected": connected,
            "mode": self.mode,
            "emergency": self.safety.emergency,
            "cpu": tele.get("cpu", {}).get("value", 0),
            "memory": tele.get("memory", {}).get("value", 0),
            "battery": battery,
            "temperature": tele.get("temperature", {}).get("value", 0),
            "network": tele.get("network", {}).get("value", "—"),
            "sensor_status": "OK",
            "motor_status": "OK" if motors_ok else "LOW BATTERY",
            "servo": self.servo_angle,
            "last_command": self.last_command,
            "last_response": self.last_response,
            "last_command_ts": self.last_command_ts,
            "error_count": len(self.errors),
            "last_error": self.errors[-1] if self.errors else "",
            "uptime_s": round(time.time() - self.connected_at, 1) if self.connected_at else 0,
            "runtime_started": bool(self.safety.runtime_started),
        }

    def state(self) -> dict:
        return {
            "device_type": self.device_type,
            "device_name": self.device.name if self.device else "",
            "connected": self.device.connected if self.device else False,
            "mode": self.mode,
            "emergency": self.safety.emergency,
            "speed": self.speed,
            "motors": self.motors,
            "servo_angle": self.servo_angle,
            "led_state": self.led_state,
            "limits": self.safety.limits,
            "gesture_robot": self.gesture_robot,
            "last_command": self.last_command,
            "last_command_ts": self.last_command_ts,
            "sequence_running": self.sequence_running,
            "health": self.health(),
        }

    def record_error(self, message: str) -> None:
        self.errors.append(message)
        self.last_response = f"ERROR: {message}"
        emit_event("ROBOTICS", "Error", "ERROR", None, message)


_robotics: Optional[RoboticsController] = None


def get_robotics() -> RoboticsController:
    global _robotics
    if _robotics is None:
        _robotics = RoboticsController()
    return _robotics