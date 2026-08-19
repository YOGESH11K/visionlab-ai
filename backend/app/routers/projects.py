"""Project CRUD endpoints."""
from fastapi import APIRouter, HTTPException

from ..services.project_service import get_projects

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
def list_projects():
    return {"projects": get_projects().list()}


@router.post("")
def create(payload: dict):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    return get_projects().create(name, payload.get("description", ""), payload.get("payload"))


@router.get("/{project_id}")
def get(project_id: int):
    p = get_projects().get(project_id)
    if not p:
        raise HTTPException(404, "project not found")
    return p


@router.put("/{project_id}")
def update(project_id: int, payload: dict):
    p = get_projects().update(project_id, payload)
    if not p:
        raise HTTPException(404, "project not found")
    return p


@router.delete("/{project_id}")
def delete(project_id: int):
    if not get_projects().delete(project_id):
        raise HTTPException(404, "project not found")
    return {"ok": True}