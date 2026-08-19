"""Structured logging for the Empire backend.

Sources: camera, vision, hardware, ai, system, api.
Levels: DEBUG / INFO / WARNING / ERROR.
"""
import logging
import sys
from pathlib import Path

from .config import settings

_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
_DATE = "%H:%M:%S"

_LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
}


def _get_level() -> int:
    return _LOG_LEVELS.get(settings.log_level.upper(), logging.INFO)


def setup_logging() -> None:
    root = logging.getLogger("empire")
    if root.handlers:
        return

    root.setLevel(_get_level())
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(_FORMAT, _DATE))
    root.addHandler(console)

    # Optional file log for diagnosis (logs/empire.log)
    try:
        log_dir = Path(settings.data_dir) / ".." / "logs"
        log_dir = log_dir.resolve()
        log_dir.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(log_dir / "empire.log", encoding="utf-8")
        fh.setFormatter(logging.Formatter(_FORMAT + " | %(pathname)s:%(lineno)d", _DATE))
        root.addHandler(fh)
    except OSError:  # pragma: no cover - best effort
        pass

    # Quiet noisy third-party loggers
    for noisy in ("uvicorn.access", "PIL", "matplotlib", "google", "absl"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger, e.g. empire.vision, empire.hardware."""
    return logging.getLogger(f"empire.{name}")
