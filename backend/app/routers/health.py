"""Health / system / diagnostics endpoints."""
from fastapi import APIRouter

from ..services.system_service import diagnostics, system_status

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health():
    return {"status": "ok", "app": "empire"}


@router.get("/system/status")
def status():
    return system_status()


@router.get("/system/diagnostics")
def diag():
    return diagnostics()


@router.get("/system/config")
def config():
    """Sanitized runtime configuration (never exposes secrets)."""
    from ..config import settings

    return {
        "server": {
            "host": settings.host,
            "port": settings.port,
            "debug": settings.debug,
            "log_level": settings.log_level,
            "cors_origins": settings.cors_origins,
        },
        "database": {
            "provider": "sqlite" if settings.db_url.startswith("sqlite") else "postgres",
            "path": str(settings.data_dir),
        },
        "vision": {
            "camera_index": settings.camera_index,
            "resolution": f"{settings.vision_width}x{settings.vision_height}",
            "stream_fps": settings.stream_fps,
            "inference_fps": settings.inference_fps,
        },
        "hardware": {
            "default_board": settings.default_board,
            "serial_baud": settings.serial_baud,
            "boards": ["Arduino Uno", "Arduino Nano", "Arduino Mega", "ESP32 DevKit"],
        },
        "ai": {
            "enabled": settings.ai_enabled,
            "model": settings.ai_model if settings.ai_enabled else None,
            "provider": "openai-compatible",
        },
    }