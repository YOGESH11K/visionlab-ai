"""Learning endpoints: quizzes, progress, suggestions."""
from fastapi import APIRouter

from ..services.learning_service import get_learning

router = APIRouter(prefix="/api/learning", tags=["learning"])


@router.get("/quizzes")
def quizzes():
    return get_learning().progress()


@router.get("/quiz/{key}")
def quiz(key: str, count: int = 5):
    return get_learning().quiz(key, count)


@router.post("/quiz/{key}/submit")
def submit(key: str, payload: dict):
    return get_learning().submit(key, payload.get("answers", []))


@router.get("/progress")
def progress():
    return get_learning().progress()


@router.get("/suggestions")
def suggestions():
    return {"suggestions": get_learning().suggestions()}