"""EXPERIMENTAL component scanner.

Heuristic computer-vision component identification. This is intentionally
conservative: it never asserts a confident ID. Results are returned as
"possible match" candidates with a confidence and actionable guidance.

A real YOLO detector can be dropped in later behind the same interface
(component -> list[Detection{id, confidence, bbox}]).
"""
from __future__ import annotations

from typing import Dict, List

import cv2
import numpy as np

from ..logging import get_logger
from .component_db import get_db

log = get_logger("scanner")

LED_COLORS = {
    "red": ((0, 120, 120), (10, 255, 255), "LED (red)"),
    "green": ((40, 80, 80), (85, 255, 255), "LED (green)"),
    "blue": ((95, 120, 80), (130, 255, 255), "LED (blue)"),
    "yellow": ((20, 120, 120), (35, 255, 255), "LED (yellow)"),
}


def _hsv_masks(frame: np.ndarray) -> Dict[str, List]:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    found = []
    for name, (lo, hi, label) in LED_COLORS.items():
        mask = cv2.inRange(hsv, np.array(lo), np.array(hi))
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            area = cv2.contourArea(c)
            if area < 30:
                continue
            x, y, w, h = cv2.boundingRect(c)
            found.append({"label": label, "area": int(area), "bbox": [x, y, w, h]})
    return {"leds": found}


def _board_shapes(frame: np.ndarray) -> List[dict]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    _, th = cv2.threshold(gray, 90, 255, cv2.THRESH_BINARY)
    cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boards = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 1500:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.04 * peri, True)
        x, y, w, h = cv2.boundingRect(c)
        boards.append({"label": "PCB/board-like region", "area": int(area), "bbox": [x, y, w, h], "corners": len(approx)})
    return boards


def _grain_surface(frame: np.ndarray) -> Dict[str, float]:
    """Rough breadboard-style hole detection -> returns density 0..1."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 40, 140)
    return {"hole_density": round(float(edges.mean()) / 255.0, 3)}


def scan_frame(frame: np.ndarray) -> dict:
    """Analyze one BGR frame. Returns honest, low-confidence candidates."""
    if frame is None or frame.size == 0:
        return {"candidates": [], "experimental": True, "note": "no frame"}

    result = {"experimental": True, "candidates": [], "guidance": []}
    leds = _hsv_masks(frame)["leds"]
    boards = _board_shapes(frame)
    surface = _grain_surface(frame)

    db = get_db()

    if leds:
        for led in leds[:6]:
            candidate = db.resolve("LED")
            conf = min(0.5 + led["area"] / 2000.0, 0.7)
            result["candidates"].append(
                {
                    "id": "led",
                    "name": led["label"],
                    "confidence": round(conf, 2),
                    "bbox": led["bbox"],
                    "possible": True,
                }
            )
    if boards:
        for b in boards[:3]:
            result["candidates"].append(
                {
                    "id": "unknown_board",
                    "name": b["label"],
                    "confidence": 0.45,
                    "bbox": b["bbox"],
                    "possible": True,
                }
            )
    if surface["hole_density"] > 0.12:
        result["candidates"].append(
            {
                "id": "breadboard",
                "name": "Breadboard (possible)",
                "confidence": round(min(0.4 + surface["hole_density"], 0.6), 2),
                "bbox": None,
                "possible": True,
            }
        )

    if result["candidates"]:
        result["guidance"] = [
            "Move closer for a clearer view.",
            "Improve lighting and avoid glare.",
            "Rotate the component to expose identifying features.",
            "Use the Component Scanner 'manual identify' for confident information.",
        ]
    else:
        result["guidance"] = [
            "Nothing confidently detected. Improve lighting and re-scan.",
            "Use manual identification to open the full component information panel.",
        ]
    return result