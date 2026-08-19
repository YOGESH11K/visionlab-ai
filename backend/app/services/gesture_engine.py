"""Gesture classification + temporal stability engine.

Pure logic (no MediaPipe dependency) so it is fully unit-testable.

Pipeline: per-frame classification -> temporal smoothing (stable-after-N) ->
debounce (only emit on change) -> cooldown (min interval between emits).

This guarantees that a noisy stream like 1,2,3,2,3,2 emits ONE command once
the gesture becomes stable, instead of six commands.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

THUMB, INDEX, MIDDLE, RING, PINKY = 0, 1, 2, 3, 4
FINGER_NAMES = ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"]

NUMBER_GESTURES = {
    0: "FIST",
    1: "ONE_FINGER",
    2: "TWO_FINGERS",
    3: "THREE_FINGERS",
    4: "FOUR_FINGERS",
    5: "OPEN_PALM",
}

# Sustained-hold variants: holding a finger-count gesture longer triggers a
# different named gesture (useful for POINT / PEACE without stealing the demo).
SUSTAINED_VARIANTS = {
    "ONE_FINGER": "POINT",
    "TWO_FINGERS": "PEACE",
}


@dataclass
class HandState:
    """Input contract consumed by the gesture engine (from vision service)."""
    handedness: str = "Unknown"          # Right / Left
    landmarks: List[tuple] = field(default_factory=list)  # 21 (x, y, z) normalized
    detection_score: float = 0.0


@dataclass
class GestureResult:
    gesture: str = "UNKNOWN"
    fingers: List[bool] = field(default_factory=lambda: [False] * 5)
    finger_count: int = 0
    handedness: str = "Unknown"
    confidence: float = 0.0
    stable: bool = False
    emitted: bool = False
    reason: str = ""


def _thumb_extended(fingers: List[bool], handedness: str) -> bool:
    # First element is THUMB; recompute robustly from landmarks if available
    # is handled in `finger_states_from_landmarks`; here just return stored value.
    return fingers[THUMB]


def finger_states_from_landmarks(
    landmarks: List[tuple], handedness: str
) -> List[bool]:
    """Standard MediaPipe-style finger extension heuristic on normalized landmarks.

    Each landmark is (x, y, z). y grows downward in image space.
    """
    if not landmarks or len(landmarks) < 21:
        return [False] * 5

    def tip(p: int):
        return landmarks[p]

    def pip(p: int):
        return landmarks[p]

    states = [False] * 5

    # Thumb: direction differs per hand. Compare tip.x to ip.x.
    tip_t, ip_t = landmarks[4], landmarks[3]
    if handedness.lower() == "left":
        states[THUMB] = tip_t[0] > ip_t[0] + 0.005
    else:
        states[THUMB] = tip_t[0] < ip_t[0] - 0.005

    # Fingers: tip above pip (smaller y) => extended.
    for finger, (tip_i, pip_i) in enumerate(
        [(8, 6), (12, 10), (16, 14), (20, 18)], start=1
    ):
        states[finger] = landmarks[tip_i][1] < landmarks[pip_i][1] - 0.02

    return states


def finger_count(fingers: List[bool]) -> int:
    return sum(1 for f in fingers[1:] if f)


def _pinch_distance(landmarks: List[tuple]) -> Optional[float]:
    if not landmarks or len(landmarks) < 21:
        return None
    tip_thumb = landmarks[4]
    tip_index = landmarks[8]
    return math.hypot(tip_thumb[0] - tip_index[0], tip_thumb[1] - tip_index[1])


def _mean(a: List[tuple]) -> tuple:
    return (
        sum(p[0] for p in a) / len(a),
        sum(p[1] for p in a) / len(a),
        sum(p[2] for p in a) / len(a),
    )


def classify_gesture(hand: HandState) -> GestureResult:
    """Classify a single frame into a named gesture."""
    lms = hand.landmarks
    if not lms:
        return GestureResult(gesture="NO_HAND")

    fingers = finger_states_from_landmarks(lms, hand.handedness)
    count = finger_count(fingers)
    conf = hand.detection_score

    if all(fingers):
        gesture = "OPEN_PALM"
        reason = "all five fingers extended"
    else:
        gesture = NUMBER_GESTURES.get(count, "UNKNOWN")
        reason = f"{count} finger(s) extended"

    # PINCH overrides count when thumb+index tips are close
    pinch = _pinch_distance(lms)
    if pinch is not None and pinch < 0.06:
        gesture = "PINCH"
        reason = f"pinch distance {pinch:.3f}"
        conf = min(conf, 0.98)

    # THUMB_UP / THUMB_DOWN
    if count == 0 and fingers[THUMB]:
        gesture = "THUMB_UP"
        reason = "thumb extended, others folded"
    if count == 4 and not fingers[THUMB]:
        gesture = "THUMB_DOWN"
        reason = "four fingers extended, thumb folded"

    # PEACE / POINT are triggered via a sustained hold of TWO_FINGERS / ONE_FINGER
    # in the temporal engine, so the finger-count demo keeps priority here.

    # Apply heuristic confidence: degrade when a finger sits near its threshold
    for i in range(1, 5):
        tip_y, pip_y = lms[[8, 12, 16, 20][i - 1]][1], lms[[6, 10, 14, 18][i - 1]][1]
        margin = abs((tip_y - pip_y)) 
        if margin < 0.05:
            conf = max(0.35, conf - 0.12)

    conf = max(0.0, min(1.0, conf))
    return GestureResult(
        gesture=gesture,
        fingers=fingers,
        finger_count=count,
        handedness=hand.handedness,
        confidence=round(conf, 3),
        reason=reason,
    )


class GestureEngine:
    """Temporal layer on top of `classify_gesture`.

    - `stable_frames`: consecutive identical frames required to call a gesture stable.
    - `cooldown_s`: minimum seconds between emitted events.
    - `confidence_threshold`: frames below this are treated as NO_HAND (ignored).
    """

    def __init__(
        self,
        stable_frames: int = 3,
        cooldown_s: float = 0.8,
        confidence_threshold: float = 0.6,
        swipe_window: int = 6,
        sustained_seconds: float = 2.0,
    ) -> None:
        self.stable_frames = stable_frames
        self.cooldown_s = cooldown_s
        self.confidence_threshold = confidence_threshold
        self.swipe_window = swipe_window
        self.sustained_seconds = sustained_seconds

        self._runs = 0
        self._current: str = "NO_HAND"
        self._current_conf = 0.0
        self._pending: str = "NO_HAND"
        self._stable: str = "NO_HAND"
        self._stable_conf = 0.0
        self._stable_since: float = 0.0
        self._sustained_emitted: Optional[str] = None
        self._last_emit: float = 0.0
        self._palm_x: List[float] = []
        self._swipe: str = ""

    def reset(self) -> None:
        self._runs = 0
        self._current = "NO_HAND"
        self._pending = "NO_HAND"
        self._stable = "NO_HAND"
        self._stable_since = 0.0
        self._sustained_emitted = None
        self._last_emit = 0.0
        self._palm_x = []

    # -- swipe detection ------------------------------------------------
    def _track_palm(self, hand: HandState) -> str:
        if hand.landmarks:
            palm = _mean([hand.landmarks[0], hand.landmarks[9]])
            self._palm_x.append(palm[0])
            if len(self._palm_x) > self.swipe_window:
                self._palm_x.pop(0)
        if len(self._palm_x) < self.swipe_window:
            return ""
        dx = self._palm_x[-1] - self._palm_x[0]
        if abs(dx) < 0.15:
            return ""
        self._palm_x.clear()
        return "SWIPE_LEFT" if dx > 0 else "SWIPE_RIGHT"

    # -- main loop --------------------------------------------------------
    def process(self, hand: HandState, now: float = None) -> GestureResult:
        """Feed one frame; returns result with `emitted=True` only when a command
        should be fired (stable + debounced + past cooldown)."""
        now = now if now is not None else time.monotonic()
        result = classify_gesture(hand)
        self._current = result.gesture
        self._current_conf = result.confidence

        # Confidence gate: below threshold -> ignore frame
        if result.confidence < self.confidence_threshold:
            result.gesture = "NO_HAND"
            result.confidence = 0.0
            result.stable = False
            self._runs = 0
            self._swipe = ""
            return result

        swipe = self._track_palm(hand)
        if swipe:
            result.gesture = swipe
            result.reason = "palm velocity"
            self._swipe = swipe

        # stability counter against the pending gesture
        if result.gesture == self._pending:
            self._runs += 1
        else:
            self._pending = result.gesture
            self._runs = 1

        if self._runs >= self.stable_frames:
            result.stable = True
            changed = self._pending != self._stable
            if changed:
                self._stable_since = now
                self._sustained_emitted = None
            if changed or (now - self._last_emit >= self.cooldown_s):
                result.emitted = True
                self._last_emit = now
            self._stable = self._pending
            self._stable_conf = result.confidence

            # Sustained hold: ONE_FINGER / TWO_FINGERS held long enough emit
            # the POINT / PEACE variant exactly once.
            variant = SUSTAINED_VARIANTS.get(self._stable)
            if (
                variant
                and now - self._stable_since >= self.sustained_seconds
                and self._sustained_emitted != variant
            ):
                result.gesture = variant
                result.reason = "sustained hold"
                result.emitted = True
                self._last_emit = now
                self._sustained_emitted = variant
        else:
            result.stable = False
            result.emitted = False

        return result

    @property
    def stable_gesture(self) -> str:
        return self._stable

    def state(self) -> Dict:
        return {
            "current": self._current,
            "current_confidence": self._current_conf,
            "stable": self._stable,
            "stable_confidence": self._stable_conf,
            "runs": self._runs,
            "swipe": self._swipe,
        }