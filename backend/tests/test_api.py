"""API integration tests using FastAPI TestClient with dependency overrides."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_components_list(client):
    r = client.get("/api/components")
    assert r.status_code == 200
    assert len(r.json()["components"]) >= 20


def test_component_by_id(client):
    r = client.get("/api/components/hcsr04")
    assert r.status_code == 200
    assert r.json()["name"] == "HC-SR04"
    assert len(r.json()["arduino_examples"]) >= 4


def test_component_search(client):
    r = client.get("/api/components/search?q=servo")
    assert r.status_code == 200
    assert r.json()["results"]


def test_gesture_mappings_default(client):
    r = client.get("/api/gestures/mappings")
    assert r.status_code == 200
    assert len(r.json()["mappings"]) >= 10


def test_update_mapping(client):
    r = client.put("/api/gestures/mappings/PINCH", json={"action_type": "pwm", "target": "LED_2", "value": 100})
    assert r.status_code == 200
    assert r.json()["command"] == "LED2_PWM:100"


def test_hardware_state_virtual(client):
    r = client.get("/api/hardware/state")
    assert r.status_code == 200
    assert r.json()["virtual"] is True


def test_hardware_command(client):
    r = client.post("/api/hardware/command", json={"command": "LED3_ON"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_hardware_invalid_command(client):
    r = client.post("/api/hardware/command", json={"command": "NOPE"})
    assert r.status_code == 200
    assert r.json()["ok"] is False


def test_sensor_sample(client):
    r = client.post("/api/sensors/sample")
    assert r.status_code == 200
    assert "values" in r.json()


def test_sensor_history(client):
    client.post("/api/sensors/sample")
    r = client.get("/api/sensors/history?range_key=hour")
    assert r.status_code == 200
    assert "series" in r.json()


def test_sensor_export_csv(client):
    r = client.get("/api/sensors/export?fmt=csv")
    assert r.status_code == 200
    assert r.json()["format"] == "csv"
    assert "timestamp" in r.json()["content"]


def test_ai_chat_knowledge(client):
    r = client.post("/api/ai/chat", json={"message": "what is an LED?", "mode": "beginner"})
    assert r.status_code == 200
    assert r.json()["source"] == "knowledge"
    assert "LED" in r.json()["answer"]


def test_ai_generate(client):
    r = client.post("/api/ai/generate", json={"description": "Turn on LED when distance is less than 10 cm"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert "void loop()" in r.json()["code"]


def test_circuit_validate(client):
    r = client.post("/api/circuits/validate", json={
        "components": [
            {"id": "a", "type": "arduino_uno"},
            {"id": "led", "type": "led"},
        ],
        "connections": [
            {"id": "c1", "from": {"comp": "a", "pin": "D13"}, "to": {"comp": "led", "pin": "Anode (+)"}},
        ],
    })
    assert r.status_code == 200
    assert "connections" in r.json()


def test_projects_crud(client):
    r = client.post("/api/projects", json={"name": "Test Project", "description": "d", "payload": {"code": "x"}})
    assert r.status_code == 200
    pid = r.json()["id"]
    r = client.get(f"/api/projects/{pid}")
    assert r.json()["name"] == "Test Project"
    r = client.delete(f"/api/projects/{pid}")
    assert r.json()["ok"] is True


def test_learning_quiz(client):
    r = client.get("/api/learning/quiz/component?count=3")
    assert r.status_code == 200
    assert len(r.json()["questions"]) == 3


def test_learning_submit(client):
    q = client.get("/api/learning/quiz/arduino?count=2").json()["questions"]
    answers = [{"question": x["question"], "selected": x["answer"], "correct": True} for x in q]
    r = client.post("/api/learning/quiz/arduino/submit", json={"answers": answers})
    assert r.status_code == 200
    assert r.json()["score"] == 2


def test_events(client):
    r = client.get("/api/events")
    assert r.status_code == 200
    assert "events" in r.json()


def test_system_status(client):
    r = client.get("/api/system/status")
    assert r.status_code == 200
    assert "status" in r.json()