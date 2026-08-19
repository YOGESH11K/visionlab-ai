"""Hardware endpoints: ports, connect/disconnect, commands, state."""
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..services.hardware_manager import BOARDS, get_hardware

router = APIRouter(prefix="/api/hardware", tags=["hardware"])


@router.get("/state")
def state():
    return get_hardware().state()


@router.get("/ports")
def ports():
    return {"ports": get_hardware().list_ports()}


@router.get("/boards")
def boards():
    return {"boards": list(BOARDS.values())}


@router.post("/connect")
def connect(payload: dict):
    port = payload.get("port", "") or None
    baud = payload.get("baud")
    board = payload.get("board")
    return get_hardware().connect(port=port, baud=baud, board=board)


@router.post("/disconnect")
def disconnect():
    return get_hardware().disconnect()


@router.post("/command")
def command(payload: dict):
    cmd = payload.get("command", "")
    if not cmd:
        raise HTTPException(400, "command required")
    return get_hardware().send_command(cmd).to_dict()


@router.get("/ping")
def ping():
    return {"latency_ms": get_hardware().ping()}