"""Component database + scanner endpoints."""
from fastapi import APIRouter, HTTPException

from ..services.component_db import get_db
from ..services.scanner_service import recognize_frame, scan_frame
from ..services.vision_service import get_vision

router = APIRouter(prefix="/api/components", tags=["components"])


@router.get("")
def list_components():
    return {"components": get_db().all(), "categories": list(get_db().categories().keys())}


@router.get("/categories")
def categories():
    return get_db().categories()


@router.get("/search")
def search(q: str = ""):
    return {"results": get_db().search(q)}


@router.get("/{component_id}")
def component(component_id: str):
    comp = get_db().get(component_id)
    if not comp:
        raise HTTPException(404, "component not found")
    return comp


@router.post("/scan")
def scan():
    vision = get_vision()
    frame = vision._frame_jpeg
    if not frame:
        return {"experimental": True, "candidates": [], "note": "no frame available - start the camera"}
    import cv2
    import numpy as np

    arr = np.frombuffer(frame, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return scan_frame(img)


@router.get("/identify/{name}")
def identify(name: str):
    comp = get_db().resolve(name)
    if not comp:
        raise HTTPException(404, f"unknown component '{name}'")
    return comp


@router.post("/recognize")
def recognize():
    """Recognize component(s) in the current camera frame and return the full
    knowledge record for each possible match."""
    vision = get_vision()
    frame = vision._frame_jpeg
    if not frame:
        return {"experimental": True, "candidates": [], "note": "no frame available - start the camera"}
    import cv2
    import numpy as np

    arr = np.frombuffer(frame, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return recognize_frame(img)