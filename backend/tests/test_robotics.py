"""Tests for the robotics control service (device abstraction, safety, sequences)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.robotics_service import RoboticsController, make_device, ROBOT_GESTURE_ACTIONS


def _fresh():
    return RoboticsController(persist=False)


def test_device_factory():
    for dtype in ("simulated", "serial", "esp32", "wifi", "websocket", "raspberrypi"):
        d = make_device(dtype)
        assert d.connected is False
        assert d.device_type == dtype
        assert d.connect()["ok"]
        assert d.connected is True


def test_control_forwards_sets_motors():
    rc = _fresh()
    rc.connect("simulated")
    r = rc.control("FORWARD", 100)
    assert r["ok"]
    assert rc.motors == {"left": 100, "right": 100}
    assert rc.last_command == "FORWARD @ 100"


def test_control_turn_differential():
    rc = _fresh()
    rc.connect("simulated")
    rc.control("LEFT", 120)
    assert rc.motors == {"left": -120, "right": 120}
    rc.control("RIGHT", 80)
    assert rc.motors == {"left": 80, "right": -80}


def test_stop_zeroes_motors():
    rc = _fresh()
    rc.control("FORWARD", 100)
    rc.control("STOP", 0)
    assert rc.motors == {"left": 0, "right": 0}


def test_speed_limit_blocked():
    rc = _fresh()
    rc.set_limits({"max_motor_speed": 100})
    r = rc.control("FORWARD", 150)
    assert r["ok"] is False
    assert "EXCEEDS LIMIT" in r["error"]
    assert r["blocked"] is True


def test_servo_angle_limit_blocked():
    rc = _fresh()
    rc.set_limits({"max_servo_angle": 90})
    r = rc.servo(120)
    assert r["ok"] is False
    assert "EXCEEDS LIMIT" in r["error"]


def test_emergency_latch_blocks_until_reset():
    rc = _fresh()
    rc.control("FORWARD", 100)
    rc.emergency_stop()
    assert rc.safety.emergency is True
    assert rc.motors == {"left": 0, "right": 0}
    r = rc.control("FORWARD", 50)
    assert r["ok"] is False
    assert "EMERGENCY" in r["error"]
    rc.reset_emergency()
    assert rc.safety.emergency is False
    assert rc.control("FORWARD", 50)["ok"] is True


def test_gesture_robot_mapping():
    rc = _fresh()
    assert rc.gesture_action("THUMB_UP") == "FORWARD"
    assert rc.gesture_action("FIST") == "EMERGENCY"
    assert rc.gesture_action("OPEN_PALM") == "STOP"
    rc.update_gesture_robot({"THUMB_UP": "LEFT"})
    assert rc.gesture_action("THUMB_UP") == "LEFT"


def test_robot_command_parse():
    rc = _fresh()
    rc.handle_robot_command("ROBOT:FORWARD:80")
    assert rc.motors == {"left": 80, "right": 80}
    rc.handle_robot_command("ROBOT:STOP")
    assert rc.motors == {"left": 0, "right": 0}
    rc.handle_robot_command("ROBOT:EMERGENCY")
    assert rc.safety.emergency is True


def test_telemetry_shape():
    rc = _fresh()
    t = rc.telemetry()
    assert "battery" in t
    assert "distance" in t
    assert "motor_left" in t
    assert 0 <= t["battery"]["value"] <= 100
    assert t["distance"]["unit"] == "cm"


def test_ai_recommend_obstacle():
    rc = _fresh()
    rc.set_limits({"sensor_min_distance": 10})
    rec = rc.ai_recommend()
    assert rec["ok"] is True
    assert rec["action"] in ("FORWARD", "TURN_LEFT", "STOP")
    assert "context" in rec


def test_ai_action_validated_through_safety():
    rc = _fresh()
    rc.emergency_stop()
    r = rc.apply_ai_action("FORWARD")
    assert r["ok"] is False
    assert r["blocked"] is True
    rc.reset_emergency()
    r = rc.apply_ai_action("FORWARD")
    assert r["ok"] is True


def test_sequence_runs_and_stops():
    rc = _fresh()
    steps = [
        {"type": "move", "action": "FORWARD", "speed": 100, "duration": 0.1},
        {"type": "wait", "seconds": 0.05},
        {"type": "turn", "direction": "LEFT", "duration": 0.1},
        {"type": "if", "sensor": "distance", "op": "<", "threshold": 1, "then": [{"type": "stop"}]},
        {"type": "stop"},
    ]
    r = rc.run_sequence(steps)
    assert r["ok"] is True
    import time
    for _ in range(40):
        if not rc.sequence_running:
            break
        time.sleep(0.05)
    assert rc.sequence_running is False
    assert rc.motors == {"left": 0, "right": 0}


def test_gesture_actions_known():
    for action in ("FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP", "EMERGENCY", "SERVO", "LED"):
        assert action in ROBOT_GESTURE_ACTIONS