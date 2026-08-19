"""SQLAlchemy models. Keep models JSON-friendly for the API layer."""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, Integer, String, Text

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class GestureMapping(Base):
    __tablename__ = "gesture_mappings"

    id = Column(Integer, primary_key=True)
    gesture = Column(String(64), unique=True, index=True)
    action_type = Column(String(32))       # led_on, led_off, pwm, servo, buzzer, relay, motor, custom
    target = Column(String(64))            # LED_1..LED_4, ALL, SERVO, BUZZER, RELAY, MOTOR, or free text
    value = Column(Integer, nullable=True) # e.g. PWM value / servo angle
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True)
    sensor = Column(String(32), index=True)  # e.g. dht11, hcsr04, ldr, pir, pot
    channel = Column(String(32))             # e.g. temperature, humidity, distance, light, motion, analog
    value = Column(Float)
    unit = Column(String(16))
    created_at = Column(DateTime, default=_now, index=True)


class EventLog(Base):
    __tablename__ = "event_log"

    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=_now)
    source = Column(String(32))   # VISION, HARDWARE, AI, SENSOR, SYSTEM, ERROR
    event = Column(String(128))
    command = Column(String(128), nullable=True)
    status = Column(String(32))   # SUCCESS / WARNING / ERROR / INFO
    detail = Column(Text, nullable=True)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(128))
    description = Column(Text, default="")
    payload = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class QuizScore(Base):
    __tablename__ = "quiz_scores"

    id = Column(Integer, primary_key=True)
    quiz_key = Column(String(64), index=True)  # component, pins, circuit, arduino
    question = Column(String(255))
    selected = Column(String(255), nullable=True)
    correct = Column(Boolean)
    score = Column(Integer)  # points awarded
    created_at = Column(DateTime, default=_now)


class AssistantHistory(Base):
    __tablename__ = "assistant_history"

    id = Column(Integer, primary_key=True)
    role = Column(String(16))  # user / assistant
    text = Column(Text)
    mode = Column(String(32), default="auto")
    created_at = Column(DateTime, default=_now)


class SettingsKV(Base):
    __tablename__ = "settings_kv"

    key = Column(String(64), primary_key=True)
    value = Column(Text)
    updated_at = Column(DateTime, default=_now, onupdate=_now)