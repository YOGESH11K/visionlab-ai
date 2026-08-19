"""In-process event bus + WebSocket fan-out + persistent event log.

Services call `emit_event(...)`; events are stored in SQLite and pushed to all
connected `/ws/events` clients as JSON. This keeps modules decoupled.
"""
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Set

from ..db import SessionLocal
from ..logging import get_logger
from ..models import EventLog

log = get_logger("event_bus")


class _Hub:
    def __init__(self) -> None:
        self._subscribers: Set[asyncio.Queue] = set()
        self._history: List[Dict[str, Any]] = []

    def register(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._subscribers.add(q)
        return q

    def unregister(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def publish(self, payload: Dict[str, Any]) -> None:
        self._history.append(payload)
        if len(self._history) > 1000:
            self._history = self._history[-500:]
        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(payload)
                except Exception:
                    pass

    def recent(self, limit: int = 100) -> List[Dict[str, Any]]:
        return self._history[-limit:]


_hub = _Hub()


def _serialize_event(event: EventLog) -> Dict[str, Any]:
    ts = event.ts or datetime.now(timezone.utc)
    return {
        "id": event.id,
        "ts": ts.strftime("%H:%M:%S"),
        "source": event.source,
        "event": event.event,
        "command": event.command,
        "status": event.status,
        "detail": event.detail,
    }


def emit_event(
    source: str,
    event: str,
    status: str = "INFO",
    command: str = None,
    detail: str = None,
) -> Dict[str, Any]:
    """Record + broadcast a system event. Never raises (log failure only)."""
    payload = {
        "ts": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        "source": source.upper(),
        "event": event,
        "command": command,
        "status": status.upper(),
        "detail": detail,
    }
    _hub.publish(payload)
    try:
        with SessionLocal() as db:
            row = EventLog(
                source=source.upper(),
                event=event,
                command=command,
                status=status.upper(),
                detail=detail,
            )
            db.add(row)
            db.commit()
            payload["id"] = row.id
    except Exception as exc:  # pragma: no cover - db issues must not break runtime
        log.error("Failed to persist event: %s", exc)
    return payload


def get_recent_events(limit: int = 100) -> List[Dict[str, Any]]:
    with SessionLocal() as db:
        rows = (
            db.query(EventLog)
            .order_by(EventLog.id.desc())
            .limit(limit)
            .all()
        )
    return [_serialize_event(r) for r in reversed(rows)]


def subscribe() -> asyncio.Queue:
    return _hub.register()


def unsubscribe(q: asyncio.Queue) -> None:
    _hub.unregister(q)