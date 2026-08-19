"""Component recognition scanner.

Heuristic computer-vision identification of common electronics / robotics
components. This is intentionally conservative: results are returned as
"possible match" candidates with an honest confidence, and never asserted as
certain. Each candidate maps to a real component id in the knowledge database
when the visual signature is strong enough, so the frontend can open the full
information panel (use, pins, wiring, safety).

A real YOLO/CNN detector can be dropped in later behind the same interface
(component -> list[Detection{id, confidence, bbox}]).
"""
from __future__ import annotations

from typing import Dict, List, Optional

import cv2
import numpy as np

from ..logging import get_logger
from .component_db import get_db

log = get_logger("scanner")

LED_COLORS = {
    "red": ((0, 120, 100), (10, 255, 255), "LED (red)"),
    "green": ((40, 80, 80), (85, 255, 255), "LED (green)"),
    "blue": ((95, 120, 80), (130, 255, 255), "LED (blue)"),
    "yellow": ((20, 120, 120), (35, 255, 255), "LED (yellow)"),
}

Cand = Dict[str, object]


def _norm_bbox(w: int, h: int, x: int, y: int, bw: int, bh: int) -> List[int]:
    return [int(max(0, x)), int(max(0, y)), int(min(bw, w - x)), int(min(bh, h - y))]


def _conf(score: float, lo: float = 0.3, hi: float = 0.7) -> float:
    return round(float(min(max(score, lo), hi)), 2)


# ---------------------------------------------------------------------------
# detectors (each returns list[Cand])
# ---------------------------------------------------------------------------

def detect_led(frame: np.ndarray) -> List[Cand]:
    """LED: a small, round, highly-saturated bright die."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    found: List[Cand] = []
    frame_area = frame.shape[0] * frame.shape[1]
    for name, (lo, hi, label) in LED_COLORS.items():
        mask = cv2.inRange(hsv, np.array(lo), np.array(hi))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            area = cv2.contourArea(c)
            if area < 30 or area > frame_area * 0.005:
                continue
            x, y, w, h = cv2.boundingRect(c)
            circular = 4.0 * np.pi * area / max((cv2.arcLength(c, True) ** 2), 1e-6)
            if circular < 0.82:
                continue
            found.append(
                {
                    "id": "led",
                    "name": label,
                    "confidence": _conf(min(0.5 + circular * 0.2, 0.7)),
                    "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                    "possible": True,
                    "hint": f"small bright round {name} die",
                }
            )
    return found


def detect_breadboard(frame: np.ndarray) -> List[Cand]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 40, 140)
    density = float(edges.mean()) / 255.0
    if density < 0.08:
        return []
    # breadboard bodies are large neutral rectangles
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blurred, 120, 255, cv2.THRESH_BINARY)
    cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 2500:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if h < 1:
            continue
        aspect = w / h
        if 0.35 <= aspect <= 3.2 and area < frame.shape[0] * frame.shape[1] * 0.9:
            if best is None or area > best[0]:
                best = (area, x, y, w, h)
    if best is None:
        return []
    _, x, y, w, h = best
    return [
        {
            "id": "breadboard",
            "name": "Breadboard (possible)",
            "confidence": _conf(min(0.4 + density, 0.6)),
            "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
            "possible": True,
            "hint": "perforated grid pattern detected",
        }
    ]


def detect_resistor(frame: np.ndarray) -> List[Cand]:
    """Resistor: a row of saturated color-band stripes on a small body."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    sat = cv2.inRange(hsv, np.array([0, 90, 60]), np.array([180, 255, 255]))
    sat = cv2.morphologyEx(sat, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cnts, _ = cv2.findContours(sat, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    bands: List[tuple] = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 40 or area > frame.shape[0] * frame.shape[1] * 0.006:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w < 6 or h < 4 or h > 40:
            continue
        bands.append((x + w / 2, y + h / 2, x, y, w, h))
    if len(bands) < 2:
        return []
    # group bands that are roughly collinear (small y spread, wide x spread)
    ys = [b[1] for b in bands]
    y_min, y_max = min(ys), max(ys)
    if (y_max - y_min) > 25:
        return []
    xs = [b[0] for b in bands]
    x_span = max(xs) - min(xs)
    if x_span < 35:
        return []
    x0 = int(min(b[2] for b in bands))
    y0 = int(min(b[3] for b in bands))
    x1 = int(max(b[2] + b[4] for b in bands))
    y1 = int(max(b[3] + b[5] for b in bands))
    w = x1 - x0
    h = y1 - y0
    if w < 40 or h < 6 or w / max(h, 1) < 1.8:
        return []
    return [
        {
            "id": "resistor",
            "name": "Resistor (possible)",
            "confidence": _conf(min(0.35 + len(bands) * 0.06, 0.6)),
            "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x0, y0, w, h),
            "possible": True,
            "hint": f"{len(bands)} aligned color bands",
        }
    ]


def detect_capacitor(frame: np.ndarray) -> List[Cand]:
    """Electrolytic capacitor: tall dark cylinder with a light top cap."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, dark = cv2.threshold(blurred, 110, 255, cv2.THRESH_BINARY_INV)
    cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found: List[Cand] = []
    frame_area = frame.shape[0] * frame.shape[1]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 500 or area > frame_area * 0.06:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w < 12 or h < 30 or w > 70:
            continue
        # tall & narrow cylinder (allow partial body detection)
        if h < w * 1.2:
            continue
        # bright cap sits ABOVE the dark body - must be much brighter than bg
        top_h = max(2, int(h * 0.4))
        top_roi = frame[max(0, y - top_h) : y, x : x + w]
        if top_roi.size == 0:
            continue
        hsv_top = cv2.cvtColor(top_roi, cv2.COLOR_BGR2HSV)
        cap_mask = cv2.inRange(hsv_top, np.array([0, 0, 195]), np.array([180, 90, 255]))
        cap_ratio = float(cap_mask.mean()) / 255.0
        if cap_ratio < 0.35:
            continue
        # cap should be roughly as wide as the body
        cap_gray = cv2.cvtColor(top_roi, cv2.COLOR_BGR2GRAY)
        _, cap_th = cv2.threshold(cap_gray, 195, 255, cv2.THRESH_BINARY)
        cc, _ = cv2.findContours(cap_th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cc:
            continue
        cw = max(cv2.boundingRect(cc2)[2] for cc2 in cc)
        if cw < w * 0.5:
            continue
        found.append(
            {
                "id": "capacitor",
                "name": "Capacitor (electrolytic, possible)",
                "confidence": _conf(0.5 + cap_ratio * 0.15 + (h / w > 2.0) * 0.08),
                "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y - top_h, w, h + top_h),
                "possible": True,
                "hint": "dark cylinder with light top cap",
            }
        )
    return found


def detect_potentiometer(frame: np.ndarray) -> List[Cand]:
    """Circular knob with a metallic shaft + slot across the top face."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=60,
        param1=110, param2=40, minRadius=18, maxRadius=90,
    )
    found: List[Cand] = []
    if circles is None:
        return found
    circles = np.round(circles[0, :]).astype(int)
    for cx, cy, r in circles[:5]:
        x, y, w, h = cx - r, cy - r, r * 2, r * 2
        roi = gray[max(0, y) : y + h, max(0, x) : x + w]
        if roi.size == 0:
            continue
        # knob body should be clearly darker than the surrounding scene
        border = gray[max(0, y + h) : y + h + 12, max(0, x) : x + w]
        if border.size == 0:
            continue
        if float(roi.mean()) > float(border.mean()) * 0.85:
            continue
        edges = cv2.Canny(roi, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=18, minLineLength=int(r * 0.7), maxLineGap=8)
        if lines is None:
            continue
        # need a clear straight slot line spanning the face
        has_slot = False
        for ln in lines:
            p = ln.ravel()
            x1, y1, x2, y2 = int(p[0]), int(p[1]), int(p[2]), int(p[3])
            length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
            if length >= r * 0.8:
                has_slot = True
                break
        if not has_slot:
            continue
        # a distinct bright slot line on a dark knob
        slot_roi = roi[int(h * 0.35) : int(h * 0.65), :]
        if slot_roi.size == 0:
            continue
        if float(slot_roi.mean()) < float(roi.mean()):
            continue
        found.append(
            {
                "id": "potentiometer",
                "name": "Potentiometer (possible)",
                "confidence": _conf(min(0.5 + len(lines) * 0.02, 0.66)),
                "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                "possible": True,
                "hint": "circular knob with adjustment slot",
            }
        )
    return found


def detect_push_button(frame: np.ndarray) -> List[Cand]:
    """Tactile push button: a compact near-square colored cap (small)."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    sat = cv2.inRange(hsv, np.array([0, 110, 80]), np.array([180, 255, 255]))
    sat = cv2.morphologyEx(sat, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cnts, _ = cv2.findContours(sat, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found: List[Cand] = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 200 or area > 2400:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.045 * peri, True)
        x, y, w, h = cv2.boundingRect(c)
        if w < 12 or h < 12:
            continue
        aspect = max(w, h) / max(min(w, h), 1)
        if aspect > 1.3:
            continue
        squareness = 4.0 * np.pi * area / max((peri ** 2), 1e-6)
        # a square-ish cap: squareness well below a circle's 1.0, but still compact
        if not (0.55 <= squareness <= 0.9):
            continue
        found.append(
            {
                "id": "push_button",
                "name": "Push button (tactile, possible)",
                "confidence": _conf(0.45 + squareness * 0.25),
                "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                "possible": True,
                "hint": "compact near-square colored cap",
            }
        )
    return found


def detect_ldr(frame: np.ndarray) -> List[Cand]:
    """Light dependent resistor: round disc with zigzag ring trace."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=60,
        param1=110, param2=38, minRadius=12, maxRadius=70,
    )
    found: List[Cand] = []
    if circles is None:
        return found
    for cx, cy, r in np.round(circles[0, :]).astype(int)[:5]:
        x, y, w, h = cx - r, cy - r, r * 2, r * 2
        roi = gray[max(0, y) : y + h, max(0, x) : x + w]
        if roi.size == 0:
            continue
        edges = cv2.Canny(roi, 40, 130)
        density = float(edges.mean()) / 255.0
        if density < 0.22:
            continue
        # must NOT be a single-slot knob -> require high density (many rings)
        found.append(
            {
                "id": "ldr",
                "name": "LDR / photoresistor (possible)",
                "confidence": _conf(min(0.45 + density * 0.4, 0.64)),
                "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                "possible": True,
                "hint": "round disc with wavy ring trace pattern",
            }
        )
    return found


def detect_dht(frame: np.ndarray) -> List[Cand]:
    """DHT11 (blue) / DHT22 (white) module: square body with grille of holes."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    results: List[Cand] = []
    for name, color_lo, color_hi, comp_id in [
        ("DHT11 (blue)", [100, 70, 60], [130, 255, 255], "dht11"),
        ("DHT22 (white)", [0, 0, 140], [180, 60, 255], "dht22"),
    ]:
        mask = cv2.inRange(hsv, np.array(color_lo), np.array(color_hi))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            area = cv2.contourArea(c)
            if area < 900 or area > frame.shape[0] * frame.shape[1] * 0.12:
                continue
            x, y, w, h = cv2.boundingRect(c)
            if w < 30 or h < 30:
                continue
            aspect = max(w, h) / max(min(w, h), 1)
            if aspect > 2.0:
                continue
            # grille = many small holes -> high edge density inside
            roi_gray = cv2.cvtColor(frame[y : y + h, x : x + w], cv2.COLOR_BGR2GRAY)
            density = float(cv2.Canny(roi_gray, 40, 130).mean()) / 255.0
            if density > 0.14:
                results.append(
                    {
                        "id": comp_id,
                        "name": f"{name} (possible)",
                        "confidence": _conf(min(0.42 + density * 0.5, 0.66)),
                        "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                        "possible": True,
                        "hint": "grille-hole pattern on square module",
                    }
                )
    return results


def detect_relay(frame: np.ndarray) -> List[Cand]:
    """Relay module: rectangular blue (or black) block."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    results: List[Cand] = []
    for name, lo, hi, comp_id in [
        ("Relay (blue)", [95, 60, 70], [125, 255, 180], "relay"),
        ("Relay (black)", [0, 0, 30], [180, 120, 110], "relay"),
    ]:
        mask = cv2.inRange(hsv, np.array(lo), np.array(hi))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            area = cv2.contourArea(c)
            if area < 1200 or area > frame.shape[0] * frame.shape[1] * 0.15:
                continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.05 * peri, True)
            x, y, w, h = cv2.boundingRect(c)
            if w < 25 or h < 25:
                continue
            aspect = max(w, h) / max(min(w, h), 1)
            if aspect > 2.4 or aspect < 0.7:
                continue
            if len(approx) < 4:
                continue
            # black relay: body must be uniformly dark (no bright shaft inside)
            if name == "Relay (black)":
                gray = cv2.cvtColor(frame[y : y + h, x : x + w], cv2.COLOR_BGR2GRAY)
                if float(gray.max()) > 130:
                    continue
            results.append(
                {
                    "id": comp_id,
                    "name": f"{name} module (possible)",
                    "confidence": _conf(0.45 + (aspect < 1.8) * 0.08),
                    "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                    "possible": True,
                    "hint": "solid rectangular relay block",
                }
            )
    return results


def detect_display(frame: np.ndarray) -> List[Cand]:
    """OLED (dark) vs LCD (light/blue-green) rectangles."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    results: List[Cand] = []
    # OLED: near-black rectangle
    dark = cv2.inRange(gray, 0, 60)
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 1500 or area > frame.shape[0] * frame.shape[1] * 0.15:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w < 40 or h < 40:
            continue
        aspect = w / h
        if 1.2 <= aspect <= 4.5:
            results.append(
                {
                    "id": "oled",
                    "name": "OLED display (possible)",
                    "confidence": _conf(0.4 + (aspect <= 3.5) * 0.1),
                    "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                    "possible": True,
                    "hint": "dark rectangular screen area",
                }
            )
    # LCD: light rectangle with green/blue tint
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    lcd_mask = cv2.inRange(hsv, np.array([45, 30, 120]), np.array([120, 180, 255]))
    lcd_mask = cv2.morphologyEx(lcd_mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    lc, _ = cv2.findContours(lcd_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in lc:
        area = cv2.contourArea(c)
        if area < 1500 or area > frame.shape[0] * frame.shape[1] * 0.15:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w < 40 or h < 25:
            continue
        aspect = w / h
        if 1.4 <= aspect <= 6.0:
            results.append(
                {
                    "id": "lcd",
                    "name": "LCD display (possible)",
                    "confidence": _conf(0.4 + (aspect <= 4.0) * 0.08),
                    "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                    "possible": True,
                    "hint": "light rectangular LCD panel",
                }
            )
    return results


def detect_hcsr04(frame: np.ndarray) -> List[Cand]:
    """HC-SR04: PCB with two silver cylindrical transducers ('eyes')."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    silver = cv2.inRange(hsv, np.array([0, 0, 110]), np.array([180, 100, 255]))
    silver = cv2.morphologyEx(silver, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cnts, _ = cv2.findContours(silver, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    eyes: List[tuple] = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 120:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w > 60 or h > 60:
            continue
        if w < 1 or h < 1:
            continue
        # eyes must be round-ish discs, not long streaks
        if max(w, h) / min(w, h) > 2.2:
            continue
        circular = 4.0 * np.pi * area / max((cv2.arcLength(c, True) ** 2), 1e-6)
        if circular < 0.45:
            continue
        eyes.append((x + w / 2, y + h / 2, w, h))
    eyes.sort(key=lambda e: e[0])
    for i in range(len(eyes) - 1):
        x1, y1, w1, h1 = eyes[i]
        x2, y2, w2, h2 = eyes[i + 1]
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        if dx < 40 or dx > 260 or dy > 45:
            continue
        # group bounding box
        x = int(min(x1 - w1 / 2, x2 - w2 / 2))
        y = int(min(y1 - h1 / 2, y2 - h2 / 2))
        w = int(max(x1 + w1 / 2, x2 + w2 / 2) - x)
        h = int(max(y1 + h1 / 2, y2 + h2 / 2) - y)
        return [
            {
                "id": "hcsr04",
                "name": "HC-SR04 ultrasonic (possible)",
                "confidence": _conf(0.55 + (dx < 140) * 0.1),
                "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                "possible": True,
                "hint": "two silver ultrasonic transducers",
            }
        ]
    return []


def detect_pir(frame: np.ndarray) -> List[Cand]:
    """PIR sensor: white dome (hemisphere) on a small board."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 60, 255]))
    white = cv2.morphologyEx(white, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cnts, _ = cv2.findContours(white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found: List[Cand] = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 1500 or area > frame.shape[0] * frame.shape[1] * 0.18:
            continue
        peri = cv2.arcLength(c, True)
        x, y, w, h = cv2.boundingRect(c)
        if w < 30 or h < 30:
            continue
        circular = 4.0 * np.pi * area / max((peri ** 2), 1e-6)
        aspect = max(w, h) / max(min(w, h), 1)
        if aspect < 1.5 and circular >= 0.5:
            found.append(
                {
                    "id": "pir",
                    "name": "PIR motion sensor (possible)",
                    "confidence": _conf(0.45 + circular * 0.15),
                    "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                    "possible": True,
                    "hint": "white dome lens",
                }
            )
    return found


def detect_servo(frame: np.ndarray) -> List[Cand]:
    """Servo: colored body (blue/orange/white) with a light horn on top."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    found: List[Cand] = []
    for lo, hi, label in [
        ((95, 70, 70), (140, 255, 255), "blue"),   # blue body
        ((10, 110, 140), (30, 255, 255), "orange"),  # orange body
    ]:
        mask = cv2.inRange(hsv, np.array(lo), np.array(hi))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            area = cv2.contourArea(c)
            if area < 2000 or area > frame.shape[0] * frame.shape[1] * 0.18:
                continue
            x, y, w, h = cv2.boundingRect(c)
            if w < 40 or h < 25:
                continue
            aspect = max(w, h) / max(min(w, h), 1)
            if aspect > 2.6 or aspect < 0.5:
                continue
            # light horn on top
            gray_roi = cv2.cvtColor(frame[y : y + h, x : x + w], cv2.COLOR_BGR2GRAY)
            top_third = gray_roi[: max(1, h // 3), :]
            if top_third.size == 0:
                continue
            top_mean = float(top_third.mean())
            if top_mean < 120:
                continue
            found.append(
                {
                    "id": "servo",
                    "name": f"Servo motor ({label} body, possible)",
                    "confidence": _conf(0.45 + (top_mean > 160) * 0.1),
                    "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                    "possible": True,
                    "hint": f"{label} body with light horn",
                }
            )
    return found


def detect_dc_motor(frame: np.ndarray) -> List[Cand]:
    """DC motor: dark body rectangle with a bright metallic shaft on top."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, dark = cv2.threshold(blurred, 100, 255, cv2.THRESH_BINARY_INV)
    cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found: List[Cand] = []
    frame_area = frame.shape[0] * frame.shape[1]
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 1500 or area > frame_area * 0.2:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w < 25 or h < 30:
            continue
        aspect = max(w, h) / max(min(w, h), 1)
        if aspect > 3.0 or aspect < 0.6:
            continue
        # DC motor bodies are neutral gray/dark (low saturation), not colored
        body_hsv = cv2.cvtColor(frame[y : y + h, x : x + w], cv2.COLOR_BGR2HSV)
        sat_mean = float(body_hsv[..., 1].mean())
        if sat_mean > 50:
            continue
        # bright metallic shaft above/on the body
        shaft_h = max(2, int(h * 0.3))
        shaft_roi = frame[max(0, y - shaft_h) : y, x : x + w]
        if shaft_roi.size == 0:
            continue
        hsv_shaft = cv2.cvtColor(shaft_roi, cv2.COLOR_BGR2HSV)
        silver = cv2.inRange(hsv_shaft, np.array([0, 0, 170]), np.array([180, 90, 255]))
        silver_ratio = float(silver.mean()) / 255.0
        if not (0.1 < silver_ratio < 0.9):
            continue
        found.append(
            {
                "id": "dc_motor",
                "name": "DC motor (possible)",
                "confidence": _conf(0.48 + silver_ratio * 0.2),
                "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y - shaft_h, w, h + shaft_h),
                "possible": True,
                "hint": "dark motor body with metallic shaft",
            }
        )
    return found


def detect_buzzer(frame: np.ndarray) -> List[Cand]:
    """Buzzer: black circle with a central hole."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=60,
        param1=110, param2=35, minRadius=18, maxRadius=75,
    )
    found: List[Cand] = []
    if circles is None:
        return found
    for cx, cy, r in np.round(circles[0, :]).astype(int)[:5]:
        x, y, w, h = cx - r, cy - r, r * 2, r * 2
        roi = gray[max(0, y) : y + h, max(0, x) : x + w]
        if roi.size == 0:
            continue
        center_roi = roi[int(h * 0.3) : int(h * 0.7), int(w * 0.3) : int(w * 0.7)]
        if center_roi.size == 0:
            continue
        center_mean = float(center_roi.mean())
        ring_mean = float(roi[: int(h * 0.2), :].mean()) if h > 5 else 255
        if center_mean < 90 and ring_mean < 130:
            found.append(
                {
                    "id": "buzzer",
                    "name": "Buzzer (possible)",
                    "confidence": _conf(0.42 + (center_mean < 70) * 0.1),
                    "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                    "possible": True,
                    "hint": "dark circular buzzer with center hole",
                }
            )
    return found


def detect_ir_sensor(frame: np.ndarray) -> List[Cand]:
    """IR sensor: black or clear dome on a small PCB."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=60,
        param1=100, param2=32, minRadius=10, maxRadius=45,
    )
    found: List[Cand] = []
    if circles is None:
        return found
    for cx, cy, r in np.round(circles[0, :]).astype(int)[:5]:
        x, y, w, h = cx - r, cy - r, r * 2, r * 2
        roi = frame[max(0, y) : y + h, max(0, x) : x + w]
        if roi.size == 0:
            continue
        mean_brightness = float(roi.reshape(-1, 3).mean(axis=0).mean())
        if mean_brightness < 60:
            found.append(
                {
                    "id": "ir_sensor",
                    "name": "IR sensor dome (possible)",
                    "confidence": _conf(0.42),
                    "bbox": _norm_bbox(frame.shape[1], frame.shape[0], x, y, w, h),
                    "possible": True,
                    "hint": "dark dome-shaped IR component",
                }
            )
    return found


_DETECTORS = [
    detect_led,
    detect_breadboard,
    detect_resistor,
    detect_capacitor,
    detect_potentiometer,
    detect_push_button,
    detect_ldr,
    detect_dht,
    detect_relay,
    detect_display,
    detect_hcsr04,
    detect_pir,
    detect_servo,
    detect_dc_motor,
    detect_buzzer,
    detect_ir_sensor,
]


def _dedupe(candidates: List[Cand]) -> List[Cand]:
    """Keep best candidate per (id, name) pair."""
    best: Dict[tuple, Cand] = {}
    for cand in candidates:
        key = (cand.get("id"), cand.get("name"))
        if key not in best or float(cand.get("confidence", 0)) > float(best[key].get("confidence", 0)):
            best[key] = cand
    return sorted(best.values(), key=lambda c: float(c.get("confidence", 0)), reverse=True)


def scan_frame(frame: np.ndarray) -> dict:
    """Analyze one BGR frame. Returns honest, low-confidence candidates."""
    if frame is None or frame.size == 0:
        return {"experimental": True, "candidates": [], "note": "no frame"}

    candidates: List[Cand] = []
    for detector in _DETECTORS:
        try:
            candidates.extend(detector(frame))
        except Exception as exc:  # noqa: BLE001 - a detector must never crash a scan
            log.debug("detector %s failed: %s", detector.__name__, exc)

    candidates = _dedupe(candidates)
    result: dict = {"experimental": True, "candidates": candidates, "guidance": []}

    if candidates:
        result["guidance"] = [
            "Move closer for a clearer view.",
            "Improve lighting and avoid glare.",
            "Rotate the component to expose identifying features.",
            "Tap a possible match to open its full information panel.",
        ]
    else:
        result["guidance"] = [
            "Nothing confidently detected. Improve lighting and re-scan.",
            "Use manual identification to open the full component information panel.",
        ]
    return result


def recognize_frame(frame: np.ndarray) -> dict:
    """Run detection and attach the full knowledge record for each candidate."""
    scan = scan_frame(frame)
    db = get_db()
    enriched: List[Cand] = []
    for cand in scan["candidates"]:
        info = None
        comp_id = cand.get("id")
        if comp_id and comp_id != "breadboard":
            info = db.get(comp_id) if isinstance(comp_id, str) else None
        enriched.append({**cand, "info": info})
    scan["candidates"] = enriched
    scan["top_match"] = next(
        (c["info"] for c in enriched if c.get("info") is not None and float(c.get("confidence", 0)) >= 0.4),
        None,
    )
    return scan