"""Hardware manager: serial communication + Virtual Arduino + command protocol.

Command protocol (plain text lines, terminated by newline):

  PING                          -> PONG
  LED1_ON / LED1_OFF            -> OK
  ALL_ON / ALL_OFF              -> OK
  LED2_PWM:120                  -> OK (0-255)
  SERVO:90                      -> OK (0-180)
  BUZZER:1000:200               -> OK (freq Hz, duration ms; 0 = off)
  RELAY:ON / RELAY:OFF          -> OK
  MOTOR:120                     -> OK (-255..255)
  SENSOR                        -> OK DATA=temp=24.5,hum=55,distance=32,light=720,motion=0,analog=512
  IDLE                          -> ACK (keeps connection warm)

Responses always carry the command ID when supplied:
  client : COMMAND LED3_ON ID=1042
  device : OK ID=1042 STATUS=SUCCESS
  device : ERR ID=1042 STATUS=ERROR MSG=unknown_command

If no Arduino is connected, the manager transparently falls back to the
Virtual Arduino so the UI behaves identically (clearly labelled VIRTUAL).
"""
from __future__ import annotations

import math
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..config import settings
from ..logging import get_logger
from .event_bus import emit_event

log = get_logger("hardware")

BOARDS: Dict[str, dict] = {
    "Arduino Uno": {"name": "Arduino Uno", "mcu": "ATmega328P", "default_baud": 9600, "leds": 4, "pwm_pins": [3, 5, 6, 9, 10, 11]},
    "Arduino Nano": {"name": "Arduino Nano", "mcu": "ATmega328P", "default_baud": 9600, "leds": 4, "pwm_pins": [3, 5, 6, 9, 10, 11]},
    "Arduino Mega": {"name": "Arduino Mega", "mcu": "ATmega2560", "default_baud": 9600, "leds": 4, "pwm_pins": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]},
    "ESP32": {"name": "ESP32 DevKit", "mcu": "ESP32-WROOM", "default_baud": 115200, "leds": 4, "pwm_pins": list(range(16))},
}


@dataclass
class CommandResponse:
    ok: bool
    status: str = "SUCCESS"
    command: str = ""
    data: str = ""
    id: str = ""
    latency_ms: float = 0.0

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "status": self.status,
            "command": self.command,
            "data": self.data,
            "id": self.id,
            "latency_ms": round(self.latency_ms, 2),
        }


def parse_command(line: str) -> Optional[dict]:
    """Parse a client command line into a dict, or None if unparseable."""
    line = line.strip()
    if not line:
        return None
    cmd_id = ""
    parts = line.split(" ")
    if parts[0].upper() == "COMMAND" and len(parts) > 1:
        cmd = parts[1].upper()
        rest = parts[2:]
        for r in rest:
            if r.upper().startswith("ID="):
                cmd_id = r.split("=", 1)[1]
        return {"command": cmd, "id": cmd_id}
    return {"command": parts[0].upper(), "id": cmd_id}


def format_response(resp: CommandResponse) -> str:
    status = "OK" if resp.ok else "ERR"
    s = f"{status} ID={resp.id} STATUS={resp.status}"
    if resp.data:
        s += f" DATA={resp.data}"
    return s


def serialize_response(resp: CommandResponse) -> str:
    return format_response(resp)


class VirtualArduino:
    """In-process simulator with the same behaviour as the firmware."""

    def __init__(self, board: str = "Arduino Uno") -> None:
        self.board = board
        self.leds = {i: {"on": False, "pwm": 0} for i in range(1, 5)}
        self.servo = 90
        self.buzzer = {"on": False, "freq": 1000}
        self.relay = False
        self.motor = 0
        self.inputs = {"D2": True, "D3": True}          # buttons/switches
        self.analog = {"A0": 512, "A1": 400}
        self.sensors = {
            "temp": 24.5, "humidity": 55.0, "distance": 32.0,
            "light": 720, "motion": 0, "analog": 512,
        }
        self.connected = True
        self._t = 0.0

    def _tick(self) -> None:
        # simulated environment drift for believable virtual readings
        self._t += 0.05
        self.sensors["temp"] = 24.5 + math.sin(self._t) * 0.8 + random.uniform(-0.3, 0.3)
        self.sensors["humidity"] = 55.0 + math.cos(self._t * 0.6) * 3 + random.uniform(-0.5, 0.5)
        self.sensors["distance"] = max(2, 32 + math.sin(self._t * 0.9) * 8 + random.uniform(-1, 1))
        self.sensors["light"] = 720 + math.sin(self._t * 0.4) * 120 + random.uniform(-15, 15)
        self.sensors["motion"] = 1 if math.sin(self._t * 1.3) > 0.97 else 0
        self.sensors["analog"] = 512 + int(math.sin(self._t * 0.7) * 120 + random.uniform(-20, 20))
        self.analog["A0"] = int(self.sensors["analog"])

    def process(self, cmd: str, cmd_id: str = "") -> CommandResponse:
        self._tick()
        c = cmd.upper()
        if c == "PING":
            return CommandResponse(ok=True, command=cmd, id=cmd_id, data="PONG")
        if c == "IDLE":
            return CommandResponse(ok=True, command=cmd, id=cmd_id)
        if c.startswith("LED") and c.endswith("_ON"):
            n = int(c[3:4])
            if 1 <= n <= 4:
                self.leds[n] = {"on": True, "pwm": 255}
                return CommandResponse(ok=True, command=cmd, id=cmd_id)
            return CommandResponse(ok=False, status="ERROR", command=cmd, id=cmd_id, data="invalid_led")
        if c.startswith("LED") and c.endswith("_OFF"):
            n = int(c[3:4])
            if 1 <= n <= 4:
                self.leds[n] = {"on": False, "pwm": 0}
                return CommandResponse(ok=True, command=cmd, id=cmd_id)
            return CommandResponse(ok=False, status="ERROR", command=cmd, id=cmd_id, data="invalid_led")
        if c == "ALL_ON":
            for i in self.leds:
                self.leds[i] = {"on": True, "pwm": 255}
            return CommandResponse(ok=True, command=cmd, id=cmd_id)
        if c == "ALL_OFF":
            for i in self.leds:
                self.leds[i] = {"on": False, "pwm": 0}
            return CommandResponse(ok=True, command=cmd, id=cmd_id)
        if c.startswith("LED") and "_PWM:" in c:
            n = int(c[3:4])
            val = int(c.split(":")[1])
            if 1 <= n <= 4 and 0 <= val <= 255:
                self.leds[n] = {"on": val > 0, "pwm": val}
                return CommandResponse(ok=True, command=cmd, id=cmd_id, data=str(val))
            return CommandResponse(ok=False, status="ERROR", command=cmd, id=cmd_id, data="invalid_value")
        if c.startswith("SERVO:"):
            val = int(c.split(":")[1])
            if 0 <= val <= 180:
                self.servo = val
                return CommandResponse(ok=True, command=cmd, id=cmd_id, data=str(val))
            return CommandResponse(ok=False, status="ERROR", command=cmd, id=cmd_id, data="invalid_angle")
        if c.startswith("BUZZER:"):
            f, d = c.split(":")[1], c.split(":")[2]
            self.buzzer = {"on": int(f) > 0, "freq": int(f)}
            return CommandResponse(ok=True, command=cmd, id=cmd_id, data=f"{f}:{d}")
        if c == "RELAY:ON":
            self.relay = True
            return CommandResponse(ok=True, command=cmd, id=cmd_id)
        if c == "RELAY:OFF":
            self.relay = False
            return CommandResponse(ok=True, command=cmd, id=cmd_id)
        if c.startswith("MOTOR:"):
            v = int(c.split(":")[1])
            if -255 <= v <= 255:
                self.motor = v
                return CommandResponse(ok=True, command=cmd, id=cmd_id, data=str(v))
            return CommandResponse(ok=False, status="ERROR", command=cmd, id=cmd_id, data="invalid_speed")
        if c == "SENSOR":
            data = ",".join(f"{k}={v:.2f}" if isinstance(v, float) else f"{k}={v}" for k, v in self.sensors.items())
            return CommandResponse(ok=True, command=cmd, id=cmd_id, data=data)
        return CommandResponse(ok=False, status="ERROR", command=cmd, id=cmd_id, data="unknown_command")

    def state(self) -> dict:
        return {
            "connected": self.connected,
            "virtual": True,
            "board": self.board,
            "leds": self.leds,
            "servo": self.servo,
            "buzzer": self.buzzer,
            "relay": self.relay,
            "motor": self.motor,
            "inputs": self.inputs,
            "analog": self.analog,
            "sensors": self.sensors,
        }


class SerialConnection:
    """Real serial device using pyserial. Parser is shared with VirtualArduino."""

    def __init__(self, port: str, baud: int) -> None:
        import serial as pyserial

        self._ser = pyserial.Serial(port=port, baudrate=baud, timeout=settings.serial_timeout)
        self.connected = True

    def write(self, line: str) -> None:
        if not line.endswith("\n"):
            line += "\n"
        self._ser.write(line.encode("utf-8", errors="replace"))

    def readline(self, timeout_s: float = 0.5) -> Optional[str]:
        return self._ser.readline().decode("utf-8", errors="replace").strip() or None

    def close(self) -> None:
        try:
            self._ser.close()
        except Exception:
            pass
        self.connected = False


class HardwareManager:
    """Facade used by the rest of the app. Falls back to Virtual Arduino."""

    def __init__(self) -> None:
        self._device: Optional[object] = None  # VirtualArduino or SerialConnection
        self._virtual: Optional[VirtualArduino] = None
        self.mode = "virtual"                 # virtual | serial
        self.port = ""
        self.baud = settings.serial_baud
        self.board = settings.default_board
        self._lock = threading.Lock()
        self._cmd_counter = 1000
        self._last_ping_ms: Optional[float] = None

    # -- lifecycle -------------------------------------------------------
    def list_ports(self) -> List[dict]:
        try:
            import serial.tools.list_ports as lp
            return [{"port": p.device, "description": p.description, "hwid": p.hwid} for p in lp.comports()]
        except Exception:
            return []

    def connect(self, port: str = "", baud: int = None, board: str = None) -> dict:
        with self._lock:
            self._disconnect_locked()
            self.board = board or self.board
            self.baud = baud or settings.serial_baud
            if port:
                try:
                    self._device = SerialConnection(port, self.baud)
                    self.mode = "serial"
                    self.port = port
                    self._last_ping_ms = None
                    emit_event("HARDWARE", "Serial connected", "SUCCESS", f"port={port} baud={self.baud}", f"board={self.board}")
                    return {"ok": True, "mode": "serial", "port": port}
                except Exception as exc:
                    log.error("Serial connect failed: %s", exc)
                    emit_event("HARDWARE", "Serial connect failed", "ERROR", port, str(exc))
                    self._device = None
            self._virtual = VirtualArduino(self.board)
            self.mode = "virtual"
            emit_event("HARDWARE", "Virtual Arduino enabled", "INFO", None, f"board={self.board}")
            return {"ok": True, "mode": "virtual", "port": ""}

    def disconnect(self) -> dict:
        with self._lock:
            self._disconnect_locked()
            emit_event("HARDWARE", "Disconnected", "INFO")
            return {"ok": True}

    def _disconnect_locked(self) -> None:
        if self._device is not None:
            try:
                self._device.close()
            except Exception:
                pass
        self._device = None
        self._virtual = None
        self.mode = "disconnected"

    # -- commands ---------------------------------------------------------
    def send_command(self, command: str) -> CommandResponse:
        with self._lock:
            cmd_id = str(self._cmd_counter)
            self._cmd_counter += 1
            started = time.monotonic()

            if self.mode == "serial" and self._device is not None:
                try:
                    self._device.write(f"COMMAND {command} ID={cmd_id}")
                    resp = self._device.readline()
                    if resp is None:
                        raise ConnectionError("no response (timeout)")
                    latency = (time.monotonic() - started) * 1000
                    self._last_ping_ms = latency
                    parsed = parse_command(command)
                    ok = resp.upper().startswith("OK")
                    status = "SUCCESS" if ok else "ERROR"
                    data = resp.split("DATA=", 1)[1] if "DATA=" in resp else ""
                    emit_event("HARDWARE", command, status, command, data or resp)
                    return CommandResponse(ok=ok, status=status, command=command, data=data, id=cmd_id, latency_ms=latency)
                except Exception as exc:
                    emit_event("HARDWARE", "Serial error, falling back to virtual", "ERROR", command, str(exc))
                    log.error("Serial error, falling back to virtual: %s", exc)
                    self._device = None
                    self.mode = "virtual"
                    self._virtual = VirtualArduino(self.board)

            if self._virtual is not None:
                resp = self._virtual.process(command, cmd_id)
                resp.latency_ms = 1.0
                emit_event(
                    "HARDWARE",
                    command,
                    "SUCCESS" if resp.ok else "ERROR",
                    command,
                    resp.data or "",
                )
                return resp

            return CommandResponse(ok=False, status="ERROR", command=command, id=cmd_id, data="no_device")

    def ping(self) -> float:
        start = time.monotonic()
        self.send_command("PING")
        return (time.monotonic() - start) * 1000

    def state(self) -> dict:
        with self._lock:
            if self.mode == "serial" and self._device is not None:
                base = {
                    "connected": True, "virtual": False, "board": self.board,
                    "port": self.port, "baud": self.baud, "mode": "serial",
                }
                return base
            if self._virtual is not None:
                st = self._virtual.state()
                st["mode"] = "virtual"
                st["port"] = ""
                return st
            return {"connected": False, "virtual": False, "mode": "disconnected", "board": self.board}


_hw: Optional[HardwareManager] = None


def get_hardware() -> HardwareManager:
    global _hw
    if _hw is None:
        _hw = HardwareManager()
        _hw.connect()  # default to Virtual Arduino so the app works without hardware
    return _hw