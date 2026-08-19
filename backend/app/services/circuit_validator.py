"""Circuit builder validation.

This is a teaching-grade checker, NOT a full electrical simulator. It flags
obvious mistakes (missing ground/power, invalid pins, voltage mismatches,
unsupported connections, duplicates) with GREEN / YELLOW / RED status.
"""
from __future__ import annotations

from typing import Dict, List

from ..logging import get_logger

log = get_logger("circuits")

# pin catalog for the visual circuit editor
CIRCUIT_COMPONENTS: Dict[str, dict] = {
    "arduino_uno": {
        "name": "Arduino Uno",
        "pins": [
            {"name": "5V", "role": "power", "voltage": "5V"},
            {"name": "3.3V", "role": "power", "voltage": "3.3V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
            {"name": "D2", "role": "digital", "voltage": "5V"},
            {"name": "D3", "role": "pwm", "voltage": "5V"},
            {"name": "D4", "role": "digital", "voltage": "5V"},
            {"name": "D5", "role": "pwm", "voltage": "5V"},
            {"name": "D6", "role": "pwm", "voltage": "5V"},
            {"name": "D7", "role": "digital", "voltage": "5V"},
            {"name": "D8", "role": "digital", "voltage": "5V"},
            {"name": "D9", "role": "pwm", "voltage": "5V"},
            {"name": "D10", "role": "pwm", "voltage": "5V"},
            {"name": "D11", "role": "pwm", "voltage": "5V"},
            {"name": "D12", "role": "digital", "voltage": "5V"},
            {"name": "D13", "role": "digital", "voltage": "5V"},
            {"name": "A0", "role": "analog", "voltage": "5V"},
            {"name": "A1", "role": "analog", "voltage": "5V"},
            {"name": "A2", "role": "analog", "voltage": "5V"},
            {"name": "A3", "role": "analog", "voltage": "5V"},
        ],
    },
    "esp32": {
        "name": "ESP32 DevKit",
        "pins": [
            {"name": "3V3", "role": "power", "voltage": "3.3V"},
            {"name": "5V", "role": "power", "voltage": "5V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
            {"name": "GPIO2", "role": "digital", "voltage": "3.3V"},
            {"name": "GPIO4", "role": "digital", "voltage": "3.3V"},
            {"name": "GPIO5", "role": "digital", "voltage": "3.3V"},
            {"name": "GPIO18", "role": "pwm", "voltage": "3.3V"},
            {"name": "GPIO19", "role": "pwm", "voltage": "3.3V"},
            {"name": "GPIO21", "role": "i2c", "voltage": "3.3V"},
            {"name": "GPIO22", "role": "i2c", "voltage": "3.3V"},
            {"name": "GPIO34", "role": "analog", "voltage": "3.3V"},
            {"name": "GPIO35", "role": "analog", "voltage": "3.3V"},
            {"name": "GPIO36", "role": "analog", "voltage": "3.3V"},
        ],
    },
    "led": {
        "name": "LED",
        "pins": [
            {"name": "Anode (+)", "role": "positive", "voltage": "fwd"},
            {"name": "Cathode (-)", "role": "negative", "voltage": "0V"},
        ],
    },
    "resistor": {
        "name": "Resistor",
        "pins": [
            {"name": "Terminal 1", "role": "passive", "voltage": "any"},
            {"name": "Terminal 2", "role": "passive", "voltage": "any"},
        ],
    },
    "hcsr04": {
        "name": "HC-SR04",
        "pins": [
            {"name": "VCC", "role": "vcc", "voltage": "5V"},
            {"name": "TRIG", "role": "input", "voltage": "5V"},
            {"name": "ECHO", "role": "output", "voltage": "5V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
        ],
    },
    "dht22": {
        "name": "DHT22",
        "pins": [
            {"name": "VCC", "role": "vcc", "voltage": "3.3-5V"},
            {"name": "DATA", "role": "digital", "voltage": "3.3-5V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
        ],
    },
    "ldr": {
        "name": "LDR",
        "pins": [
            {"name": "Terminal 1", "role": "passive", "voltage": "any"},
            {"name": "Terminal 2", "role": "passive", "voltage": "any"},
        ],
    },
    "pir": {
        "name": "PIR",
        "pins": [
            {"name": "VCC", "role": "vcc", "voltage": "5V"},
            {"name": "OUT", "role": "output", "voltage": "3.3V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
        ],
    },
    "servo": {
        "name": "Servo",
        "pins": [
            {"name": "Signal", "role": "input", "voltage": "5V"},
            {"name": "VCC", "role": "vcc", "voltage": "5-6V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
        ],
    },
    "buzzer": {
        "name": "Buzzer",
        "pins": [
            {"name": "+", "role": "positive", "voltage": "5V"},
            {"name": "-", "role": "negative", "voltage": "0V"},
        ],
    },
    "dc_motor": {
        "name": "DC Motor",
        "pins": [
            {"name": "M1", "role": "passive", "voltage": "motor"},
            {"name": "M2", "role": "passive", "voltage": "motor"},
        ],
    },
    "relay": {
        "name": "Relay Module",
        "pins": [
            {"name": "VCC", "role": "vcc", "voltage": "5V"},
            {"name": "IN", "role": "input", "voltage": "5V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
            {"name": "COM", "role": "load", "voltage": "load"},
            {"name": "NO", "role": "load", "voltage": "load"},
        ],
    },
    "pot": {
        "name": "Potentiometer",
        "pins": [
            {"name": "Pin 1", "role": "passive", "voltage": "any"},
            {"name": "Wiper", "role": "passive", "voltage": "any"},
            {"name": "Pin 2", "role": "passive", "voltage": "any"},
        ],
    },
    "push_button": {
        "name": "Push Button",
        "pins": [
            {"name": "A", "role": "passive", "voltage": "any"},
            {"name": "B", "role": "passive", "voltage": "any"},
        ],
    },
    "oled": {
        "name": "OLED (SSD1306)",
        "pins": [
            {"name": "VCC", "role": "vcc", "voltage": "3.3-5V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
            {"name": "SCL", "role": "i2c", "voltage": "3.3V"},
            {"name": "SDA", "role": "i2c", "voltage": "3.3V"},
        ],
    },
    "lcd": {
        "name": "LCD 16x2 (I2C)",
        "pins": [
            {"name": "VCC", "role": "vcc", "voltage": "5V"},
            {"name": "GND", "role": "ground", "voltage": "0V"},
            {"name": "SCL", "role": "i2c", "voltage": "5V"},
            {"name": "SDA", "role": "i2c", "voltage": "5V"},
        ],
    },
}


def _pin(comp_type: str, pin_name: str) -> dict:
    comp = CIRCUIT_COMPONENTS.get(comp_type)
    if not comp:
        return {}
    for p in comp["pins"]:
        if p["name"].lower() == pin_name.strip().lower():
            return p
    return {}


def _connects_to(conns: List[dict], comp_id: str, pin: str) -> bool:
    for c in conns:
        if c["from"]["comp"] == comp_id and c["from"]["pin"].lower() == pin.lower():
            return True
        if c["to"]["comp"] == comp_id and c["to"]["pin"].lower() == pin.lower():
            return True
    return False


def validate_circuit(components: List[dict], connections: List[dict]) -> dict:
    results: List[dict] = []
    warnings: List[str] = []
    by_id = {c["id"]: c for c in components}
    connected_pairs = set()
    errors = 0

    # duplicate connections
    for c in connections:
        a = (c["from"]["comp"], c["from"]["pin"])
        b = (c["to"]["comp"], c["to"]["pin"])
        pair = frozenset([a, b])
        if pair in connected_pairs:
            results.append({"connection_id": c.get("id"), "status": "RED", "message": "Duplicate connection"})
            errors += 1
        connected_pairs.add(pair)

    for c in connections:
        fid, fpin, tid, tpin = c["from"]["comp"], c["from"]["pin"], c["to"]["comp"], c["to"]["pin"]
        fc = by_id.get(fid)
        tc = by_id.get(tid)
        status, message = "GREEN", "Valid connection"
        if fc is None or tc is None:
            status, message = "RED", "Connection references a missing component"
            errors += 1
        else:
            fp, tp = _pin(fc["type"], fpin), _pin(tc["type"], tpin)
            if not fp or not tp:
                status, message = "RED", "Invalid pin name"
                errors += 1
            else:
                # voltage mismatch
                if fp.get("voltage") and tp.get("voltage"):
                    v1, v2 = fp["voltage"], tp["voltage"]
                    if v1 in ("5V",) and v2 in ("3.3V",) or v1 in ("3.3V",) and v2 in ("5V",):
                        status = "YELLOW"
                        message = "Possible voltage mismatch (5V vs 3.3V)"
                        warnings.append(f"{fid}.{fpin} ↔ {tid}.{tpin}: 5V/3.3V mismatch")
                # unsupported connection
                if fp.get("role") in ("positive", "negative") and tp.get("role") in ("positive", "negative"):
                    if fp["role"] == tp["role"]:
                        status = "YELLOW"
                        message = "Two like-polarity pins connected"
        results.append({"connection_id": c.get("id"), "status": status, "message": message})
        if status == "RED":
            errors += 1

    # per-component checks
    for comp in components:
        ctype, cid = comp["type"], comp["id"]
        spec = CIRCUIT_COMPONENTS.get(ctype, {})
        if not spec:
            warnings.append(f"{cid}: unknown component type '{ctype}'")
            continue
        pins = [p["name"] for p in spec["pins"]]
        ground_pin = next((p["name"] for p in spec["pins"] if p["role"] in ("ground", "negative")), None)
        if ground_pin and not _connects_to(connections, cid, ground_pin):
            warnings.append(f"{cid} ({spec['name']}): missing GND connection")
        vcc_pin = next((p["name"] for p in spec["pins"] if p["role"] == "vcc"), None)
        if vcc_pin and not _connects_to(connections, cid, vcc_pin):
            warnings.append(f"{cid} ({spec['name']}): missing power (VCC)")
        if ctype == "led":
            anode = _connects_to(connections, cid, "Anode (+)")
            cathode_ok = _connects_to(connections, cid, "Cathode (-)")
            if not cathode_ok:
                warnings.append(f"{cid}: LED cathode must connect to GND")
            if not anode:
                warnings.append(f"{cid}: LED anode has no connection")

    if errors > 0:
        status = "INVALID"
    elif len(warnings) > 0:
        status = "WARNINGS"
    else:
        status = "MATCH"
    return {
        "status": status,
        "summary": f"{len(connections)} connections checked, {errors} invalid, {len(warnings)} warnings",
        "connections": results,
        "warnings": warnings,
        "experimental": True,
    }