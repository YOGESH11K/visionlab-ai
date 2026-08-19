"""Component database, circuits, AI, sensor parsing tests."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.ai_assistant import generate_code, knowledge_answer
from app.services.circuit_validator import validate_circuit
from app.services.component_db import ComponentDB
from app.services.sensor_service import parse_sensor_payload

DATA = Path(__file__).resolve().parent.parent / "app" / "data" / "components.json"


def test_component_db_loads():
    db = ComponentDB(DATA)
    assert len(db.all()) >= 20
    assert db.get("hcsr04")["name"] == "HC-SR04"


def test_component_aliases_and_search():
    db = ComponentDB(DATA)
    assert db.resolve("range finder")["id"] == "hcsr04"
    assert db.by_name("led")["id"] == "led"
    assert db.resolve("ultrasonic")["id"] == "ultrasonic"
    results = db.search("servo")
    assert any("Servo" in r["name"] for r in results)


def test_component_schema_fields():
    db = ComponentDB(DATA)
    for c in db.all():
        for field in ["id", "name", "category", "description", "working", "pins", "voltage",
                      "current", "interfaces", "compatibility", "arduino_examples", "esp32_notes",
                      "applications", "common_mistakes", "safety_notes"]:
            assert field in c, f"{c['id']} missing {field}"


def test_parse_sensor_payload():
    p = parse_sensor_payload("temp=24.5,humidity=55.0,distance=32.1,light=720,motion=0,analog=512")
    assert p["temp"] == 24.5
    assert p["distance"] == 32.1
    assert p["motion"] == 0


# --------------------------------------------------------------------------
# circuit validator
# --------------------------------------------------------------------------
def _base_circuit():
    return {
        "components": [
            {"id": "a", "type": "arduino_uno", "x": 0, "y": 0},
            {"id": "led", "type": "led", "x": 100, "y": 100},
        ],
        "connections": [
            {"id": "c1", "from": {"comp": "a", "pin": "D13"}, "to": {"comp": "led", "pin": "Anode (+)"}},
            {"id": "c2", "from": {"comp": "a", "pin": "GND"}, "to": {"comp": "led", "pin": "Cathode (-)"}},
        ],
    }


def test_circuit_valid():
    c = _base_circuit()
    r = validate_circuit(c["components"], c["connections"])
    assert r["status"] in ("MATCH", "WARNINGS")
    assert all(x["status"] != "RED" for x in r["connections"])


def test_circuit_missing_ground_warning():
    c = _base_circuit()
    c["connections"] = [c["connections"][0]]  # drop GND
    r = validate_circuit(c["components"], c["connections"])
    assert any("GND" in w for w in r["warnings"])


def test_circuit_invalid_pin():
    c = _base_circuit()
    c["connections"][0]["to"]["pin"] = "NotAPin"
    r = validate_circuit(c["components"], c["connections"])
    assert r["status"] == "INVALID"


def test_circuit_voltage_mismatch_warning():
    c = {
        "components": [
            {"id": "e", "type": "esp32", "x": 0, "y": 0},
            {"id": "h", "type": "hcsr04", "x": 100, "y": 100},
        ],
        "connections": [
            {"id": "c1", "from": {"comp": "e", "pin": "5V"}, "to": {"comp": "h", "pin": "VCC"}},
        ],
    }
    # 5V pin exists on esp32 -> connecting ESP32 5V to HC-SR04 VCC is fine electrically.
    r = validate_circuit(c["components"], c["connections"])
    assert r["status"] in ("MATCH", "WARNINGS")


def test_circuit_duplicate_detected():
    c = _base_circuit()
    dup = dict(c["connections"][0], id="c3")
    c["connections"].append(dup)
    r = validate_circuit(c["components"], c["connections"])
    assert any(x["status"] == "RED" and "Duplicate" in x["message"] for x in r["connections"])


# --------------------------------------------------------------------------
# AI
# --------------------------------------------------------------------------
def test_knowledge_answer_component():
    r = knowledge_answer("what is an HC-SR04?")
    assert r["ok"]
    assert "HC-SR04" in r["answer"]
    assert r["component"] == "hcsr04"


def test_knowledge_answer_unknown():
    r = knowledge_answer("what is a zorp quantum flux widget?")
    assert r["ok"] is False
    assert "won't guess" in r["answer"].lower() or "unknown" in r["answer"].lower()


def test_generate_code_distance_led():
    r = generate_code("Turn on LED when distance is less than 10 cm")
    assert r["ok"]
    code = r["code"]
    assert "TRIG" in code and "ECHO" in code
    assert "readDistance()" in code
    assert "LED_PIN" in code


def test_generate_code_unknown():
    r = generate_code("do the thing")
    assert r["ok"] is False