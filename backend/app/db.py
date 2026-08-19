"""Database session management (SQLite now, PostgreSQL-ready pattern).

Use `get_session()` as a dependency for request-scoped sessions.
SQLAlchemy 2.0 style: `Session.execute(select(...).where(...))`.
"""
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


def _ensure_sqlite_dir(url: str) -> str:
    if url.startswith("sqlite"):
        raw = url.split("///", 1)[-1]
        if raw and raw != ":memory:":
            Path(raw).parent.mkdir(parents=True, exist_ok=True)
    return url


_URL = _ensure_sqlite_dir(settings.db_url)
_engine = create_engine(_URL, connect_args={"check_same_thread": False} if _URL.startswith("sqlite") else {})


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):  # pragma: no cover
    if _URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Create all tables. Import models so they register with Base.metadata."""
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=_engine)


def get_session() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
