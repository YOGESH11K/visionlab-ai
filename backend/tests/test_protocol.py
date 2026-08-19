"""Hardware command protocol + Virtual Arduino tests (with mocks for serial)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.hardware_manager import (
    CommandResponse,
    VirtualArduino,
    format_response,
    parse_command,
    serialize_response,
)


def test_parse_plain_command():
    assert parse_command("LED3_ON") == {"command": "LED3_ON", "id": ""}


def test_parse_structured_command():
    assert parse_command("COMMAND LED3_ON ID=1042") == {"command": "LED3_ON", "id": "1042"}


def test_response_format():
    r = CommandResponse(ok=True, command="LED3_ON", id="1042", data="ok")
    assert serialize_response(r) == "OK ID=1042 STATUS=SUCCESS DATA=ok"
    assert format_response(CommandResponse(ok=False, status="ERROR", command="X", id="1")) == "ERR ID=1 STATUS=ERROR"


def _mk():
    return VirtualArduino("Arduino Uno")


def test_led_on_off():
    v = _mk()
    assert v.process("LED1_ON").ok
    assert v.leds[1]["on"] is True
    assert v.process("LED1_OFF").ok
    assert v.leds[1]["on"] is False


def test_all_on_off():
    v = _mk()
    v.process("ALL_ON")
    assert all(v.leds[i]["on"] for i in range(1, 5))
    v.process("ALL_OFF")
    assert all(not v.leds[i]["on"] for i in range(1, 5))


def test_pwm():
    v = _mk()
    assert v.process("LED2_PWM:120").ok
    assert v.leds[2]["pwm"] == 120
    assert v.process("LED2_PWM:999").ok is False


def test_servo():
    v = _mk()
    assert v.process("SERVO:90").ok
    assert v.servo == 90
    assert v.process("SERVO:200").ok is False


def test_buzzer_relay_motor():
    v = _mk()
    assert v.process("BUZZER:1000:200").ok
    assert v.buzzer["freq"] == 1000
    assert v.process("RELAY:ON").ok and v.relay is True
    assert v.process("RELAY:OFF").ok and v.relay is False
    assert v.process("MOTOR:120").ok and v.motor == 120
    assert v.process("MOTOR:999").ok is False


def test_sensor_command_returns_payload():
    v = _mk()
    resp = v.process("SENSOR")
    assert resp.ok
    assert "temp=" in resp.data
    assert "humidity=" in resp.data
    assert "distance=" in resp.data


def test_unknown_command():
    v = _mk()
    resp = v.process("FOOBAR")
    assert resp.ok is False
    assert resp.status == "ERROR"


def test_ping():
    v = _mk()
    resp = v.process("PING")
    assert resp.ok
    assert resp.data == "PONG"


def test_invalid_led():
    v = _mk()
    assert v.process("LED9_ON").ok is False


def test_mock_serial_response_parsing():
    """Simulated serial reply handling via format/parse round-trip."""
    r = CommandResponse(ok=True, command="SENSOR", id="10", data="temp=25.0")
    line = serialize_response(r)
    assert line.startswith("OK ID=10")
    data = line.split("DATA=", 1)[1] if "DATA=" in line else ""
    assert data == "temp=25.0"