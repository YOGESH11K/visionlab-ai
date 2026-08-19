"""Circuit builder endpoints: catalog + validation."""
from fastapi import APIRouter

from ..services.circuit_validator import CIRCUIT_COMPONENTS, validate_circuit

router = APIRouter(prefix="/api/circuits", tags=["circuits"])


@router.get("/components")
def catalog():
    return {"components": CIRCUIT_COMPONENTS}


@router.post("/validate")
def validate(payload: dict):
    components = payload.get("components", [])
    connections = payload.get("connections", [])
    return validate_circuit(components, connections)