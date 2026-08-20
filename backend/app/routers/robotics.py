"""Robotics control endpoints: devices, control, safety, telemetry, automation, AI mode."""
from typing import List, Optional

from fastapi import APIRouter

from ..services.robotics_service import get_robotics

router = APIRouter(prefix="/api/robotics", tags=["robotics"])

ROBOT = get_robotics


@router.get("/state")
def state():
    return ROBOT().state()


@router.get("/devices")
def devices():
    return {"devices": ROBOT().list_devices()}


@router.get("/actions")
def actions():
    from ..services.robotics_service import CONTROL_ACTIONS, ROBOT_GESTURE_ACTIONS, SEQUENCE_STEP_TYPES
    return {"control": CONTROL_ACTIONS, "gesture": list(ROBOT_GESTURE_ACTIONS), "sequence_steps": SEQUENCE_STEP_TYPES}


@router.post("/connect")
def connect(payload: dict):
    device_type = payload.get("device_type", "simulated")
    endpoint = payload.get("endpoint", "")
    return ROBOT().connect(device_type, endpoint)


@router.post("/disconnect")
def disconnect():
    return ROBOT().disconnect()


@router.post("/control")
def control(payload: dict):
    return ROBOT().control(
        payload.get("action", ""),
        speed=payload.get("speed"),
        source=payload.get("source", "manual"),
    )


@router.post("/motor")
def motor(payload: dict):
    return ROBOT().set_motor(payload.get("side", "left"), payload.get("speed", 0))


@router.post("/servo")
def servo(payload: dict):
    return ROBOT().servo(payload.get("angle", 90))


@router.post("/led")
def led(payload: dict):
    return ROBOT().led(bool(payload.get("on", False)))


@router.post("/command")
def command(payload: dict):
    cmd = payload.get("command", "")
    if cmd.upper().startswith("ROBOT:"):
        return ROBOT().handle_robot_command(cmd)
    return {"ok": False, "error": "expected ROBOT: command"}


# -- safety ---------------------------------------------------------------
@router.post("/emergency")
def emergency(payload: dict = None):
    if payload and payload.get("reset"):
        return ROBOT().reset_emergency()
    return ROBOT().emergency_stop()


@router.get("/limits")
def limits():
    return {"limits": ROBOT().safety.limits}


@router.put("/limits")
def put_limits(payload: dict):
    return ROBOT().set_limits(payload)


@router.get("/health")
def health():
    return ROBOT().health()


@router.post("/mode")
def mode(payload: dict):
    return ROBOT().set_mode(payload.get("mode", "MANUAL"))


# -- gesture robot mapping ---------------------------------------------------
@router.get("/gesture-mapping")
def gesture_robot():
    return {"mapping": ROBOT().gesture_robot}


@router.put("/gesture-mapping")
def put_gesture_robot(payload: dict):
    return ROBOT().update_gesture_robot(payload.get("mapping", {}))


# -- automation / sequences ---------------------------------------------------
@router.get("/sequences")
def sequences():
    return {"sequences": ROBOT().sequences}


@router.post("/sequence/save")
def sequence_save(payload: dict):
    return ROBOT().save_sequence(payload.get("name", ""), payload.get("steps", []))


@router.delete("/sequence/{seq_id}")
def sequence_delete(seq_id: int):
    return ROBOT().delete_sequence(seq_id)


@router.post("/sequence/run")
def sequence_run(payload: dict):
    steps = payload.get("steps") or []
    if not steps:
        seq_id = payload.get("id")
        for s in ROBOT().sequences:
            if s.get("id") == seq_id:
                steps = s.get("steps", [])
    if not steps:
        return {"ok": False, "error": "no sequence steps provided"}
    return ROBOT().run_sequence(steps)


@router.post("/sequence/stop")
def sequence_stop():
    return ROBOT().sequence_stop()


# -- AI autonomous mode ------------------------------------------------------
@router.post("/ai/recommend")
def ai_recommend():
    return ROBOT().ai_recommend()


@router.post("/ai/apply")
def ai_apply(payload: dict):
    return ROBOT().apply_ai_action(payload.get("action", ""), speed=payload.get("speed"))


# -- telemetry -----------------------------------------------------------------
@router.get("/telemetry")
def telemetry():
    return {"ts": time_str(), "values": ROBOT().telemetry()}


def time_str() -> str:
    import time
    return time.strftime("%H:%M:%S")