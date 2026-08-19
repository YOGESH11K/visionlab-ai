"""Events endpoints."""
from fastapi import APIRouter

from ..services.event_bus import get_recent_events

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("")
def events(limit: int = 100):
    return {"events": get_recent_events(limit)}