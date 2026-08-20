"""Vision service: camera capture, MediaPipe hand tracking, overlay rendering,
synthetic simulation camera, and the gesture -> hardware pipeline.

Design goals:
  * Blocking OpenCV work runs in a background thread (never blocks the API/WS).
  * The gesture engine emits at most one command per stable gesture.
  * No camera => honest SIMULATION mode (clearly labelled).
"""
from __future__ import annotations

import base64
import threading
import time
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from ..config import settings
from ..logging import get_logger
from .event_bus import emit_event
from .gesture_engine import (
    GestureEngine,
    GestureResult,
    HandState,
)
from .gesture_mapping import get_mapping_service, mapping_to_command
from .hardware_manager import get_hardware

log = get_logger("vision")

SIM_GESTURES = {
    "ZERO_FINGERS": [False, False, False, False, False],
    "FIST": [False, False, False, False, False],
    "ONE_FINGER": [False, True, False, False, False],
    "TWO_FINGERS": [False, True, True, False, False],
    "THREE_FINGERS": [False, True, True, True, False],
    "FOUR_FINGERS": [False, True, True, True, True],
    "OPEN_PALM": [True, True, True, True, True],
    "THUMB_UP": [True, False, False, False, False],
    "THUMB_DOWN": [False, True, True, True, True],
    "PEACE": [False, True, True, False, False],
    "POINT": [False, True, False, False, False],
    "PINCH": [False, True, False, False, False],
    "SWIPE_LEFT": [False, False, False, False, False],
    "SWIPE_RIGHT": [False, False, False, False, False],
}


def simulate_landmarks(fingers: List[bool], jitter: float = 0.004) -> List[tuple]:
    """Build a synthetic 21-point hand for the given finger states.

    Coordinates are normalized 0..1 (x, y, z). The resulting landmarks are fed
    through the SAME classification pipeline as real hands.
    """
    # base joint positions (x, y) for a right hand
    base = {
        0: (0.50, 0.90),
        # thumb
        1: (0.42, 0.82), 2: (0.36, 0.78), 3: (0.30, 0.80), 4: (0.19, 0.84),
        # index
        5: (0.56, 0.72), 6: (0.60, 0.58), 7: (0.62, 0.50), 8: (0.63, 0.42),
        # middle
        9: (0.66, 0.72), 10: (0.68, 0.56), 11: (0.70, 0.48), 12: (0.71, 0.40),
        # ring
        13: (0.76, 0.72), 14: (0.78, 0.58), 15: (0.79, 0.50), 16: (0.80, 0.42),
        # pinky
        17: (0.84, 0.76), 18: (0.86, 0.64), 19: (0.87, 0.56), 20: (0.88, 0.50),
    }
    folded_tip = {
        4: (0.46, 0.80), 8: (0.60, 0.72), 12: (0.68, 0.72), 16: (0.78, 0.72), 20: (0.86, 0.76),
    }
    tip_idx = {1: 4, 2: 8, 3: 12, 4: 16, 5: 20}
    pts = list(base.values())
    for finger_idx, tip in tip_idx.items():
        if not fingers[finger_idx - 1]:
            pts[tip] = folded_tip[tip]

    rng = np.random.default_rng()
    out = []
    for i, (x, y) in enumerate(pts):
        z = 0.0 if i == 0 else float(rng.normal(0, 0.01))
        out.append((min(0.98, max(0.02, x + rng.normal(0, jitter))),
                    min(0.98, max(0.02, y + rng.normal(0, jitter))),
                    z))
    return out


FINGER_LANDMARK_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (9, 10), (10, 11), (11, 12), (5, 9),
    (13, 14), (14, 15), (15, 16), (9, 13),
    (17, 18), (18, 19), (19, 20), (13, 17), (0, 17),
]


class VisionService:
    def __init__(self) -> None:
        self.camera_index = settings.camera_index
        self.width = settings.vision_width
        self.height = settings.vision_height
        self.stream_fps = settings.stream_fps
        self.inference_fps = settings.inference_fps

        self.mode = "off"            # off | camera | simulation
        self.detection_enabled = True
        self.show_landmarks = True
        self.show_bbox = True
        self.show_ar = True
        self.confidence_threshold = 0.6

        self._lock = threading.Lock()
        self._cap = None
        self._worker: Optional[threading.Thread] = None
        self._running = False

        self.engine = GestureEngine(confidence_threshold=self.confidence_threshold)
        self._mp = None  # lazy mediapipe import
        self._hands = None

        self._frame_jpeg: Optional[bytes] = None
        self._frame_time: float = 0.0
        self._fps = 0.0
        self._latency_ms = 0.0

        self.result: GestureResult = GestureResult()
        self.last_detection: dict = {}
        self.sim_gesture = "THREE_FINGERS"
        self.last_scan: dict = {}

    @property
    def running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------
    # mediapipe lazy init (keeps import fast and safe without the package)
    # ------------------------------------------------------------------
    def _init_mp(self) -> None:
        if self._hands is not None:
            return
        import mediapipe as mp  # local import keeps startup light

        self._mp = mp
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------
    def start(self) -> dict:
        if self._running:
            return {"ok": True, "mode": self.mode}
        self._running = True
        self._worker = threading.Thread(target=self._loop, daemon=True, name="vision-loop")
        self._worker.start()
        emit_event("SYSTEM", "Vision service started", "INFO", None, f"mode={self.mode}")
        return {"ok": True, "mode": self.mode}

    def stop(self) -> None:
        self._running = False
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        emit_event("SYSTEM", "Vision service stopped", "INFO")

    def set_camera(self, index: int) -> dict:
        with self._lock:
            self.camera_index = index
            if self._cap is not None:
                self._cap.release()
                self._cap = None
            self._open_camera_locked()
        return {"ok": True, "mode": self.mode}

    def _open_camera_locked(self) -> bool:
        try:
            cap = cv2.VideoCapture(self.camera_index)
            if not cap.isOpened():
                cap.release()
                return False
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self._cap = cap
            self.mode = "camera"
            emit_event("CAMERA", "Camera opened", "SUCCESS", None, f"index={self.camera_index}")
            return True
        except Exception as exc:
            log.warning("Camera open failed: %s", exc)
            return False

    def use_simulation(self) -> dict:
        with self._lock:
            if self._cap is not None:
                self._cap.release()
                self._cap = None
            self.mode = "simulation"
        emit_event("CAMERA", "Simulation camera enabled", "WARNING", None, "No webcam available or simulation requested")
        return {"ok": True, "mode": self.mode}

    def set_sim_gesture(self, gesture: str) -> dict:
        g = gesture.upper()
        if g not in SIM_GESTURES:
            return {"ok": False, "error": f"unknown sim gesture: {gesture}"}
        self.sim_gesture = g
        emit_event("VISION", "Simulation gesture set", "INFO", g)
        return {"ok": True, "gesture": g}

    # ------------------------------------------------------------------
    # worker loop
    # ------------------------------------------------------------------
    def _loop(self) -> None:
        frame_interval = 1.0 / max(self.inference_fps, 1)
        stream_interval = 1.0 / max(self.stream_fps, 1)
        last_stream = 0.0
        frame_count = 0
        last_fps_time = time.monotonic()

        while self._running:
            started = time.monotonic()
            with self._lock:
                if self.mode == "off":
                    self.mode = "simulation"
                if self.mode == "camera" and self._cap is None:
                    if not self._open_camera_locked():
                        self.mode = "simulation"
                        emit_event("CAMERA", "No camera - simulation fallback", "WARNING")

                if self.mode == "camera" and self._cap is not None:
                    ok, frame = self._cap.read()
                    if not ok or frame is None:
                        emit_event("CAMERA", "Camera read failed - simulation fallback", "WARNING")
                        self._cap.release()
                        self._cap = None
                        self.mode = "simulation"
                        frame = self._render_simulation()
                    else:
                        frame = cv2.resize(frame, (self.width, self.height))
                else:
                    frame = self._render_simulation()

            self._process_frame(frame)

            frame = self.apply_overlays(frame)

            frame_count += 1
            now = time.monotonic()
            if now - last_fps_time >= 1.0:
                self._fps = frame_count / (now - last_fps_time)
                frame_count = 0
                last_fps_time = now

            if now - last_stream >= stream_interval:
                encoded = self._encode(frame)
                if encoded is not None:
                    self._frame_jpeg = encoded
                    self._frame_time = now
                last_stream = now

            elapsed = time.monotonic() - started
            sleep = frame_interval - elapsed
            if sleep > 0:
                time.sleep(sleep)

    def _process_frame(self, frame: np.ndarray) -> None:
        started = time.monotonic()
        hand_state: Optional[HandState] = None

        if self.detection_enabled:
            if self.mode == "simulation":
                fingers = SIM_GESTURES.get(self.sim_gesture, [False] * 5)
                lms = simulate_landmarks(fingers)
                hand_state = HandState(handedness="Right", landmarks=lms, detection_score=0.95)
            else:
                hand_state = self._detect_mediapipe(frame)

        if hand_state is not None:
            res = self.engine.process(hand_state)
            self.result = res
            self.last_detection = {
                "handedness": res.handedness,
                "gesture": res.gesture,
                "finger_count": res.finger_count,
                "fingers": res.fingers,
                "confidence": res.confidence,
                "stable": res.stable,
                "engine": self.engine.state(),
            }
            if self.mode != "simulation":
                self.last_detection["landmarks"] = hand_state.landmarks
            if res.emitted:
                self._execute_gesture(res)
        else:
            self.result = GestureResult(gesture="NO_HAND")
            self.last_detection = {}

        self._latency_ms = (time.monotonic() - started) * 1000

    def _detect_mediapipe(self, frame: np.ndarray) -> Optional[HandState]:
        try:
            self._init_mp()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            out = self._hands.process(rgb)
            if not out.multi_hand_landmarks:
                return None
            hl = out.multi_hand_landmarks[0]
            handedness = "Unknown"
            if out.multi_handedness:
                handedness = out.multi_handedness[0].classification[0].label
            lms = [(lm.x, lm.y, lm.z) for lm in hl.landmark]
            score = out.multi_handedness[0].classification[0].score if out.multi_handedness else 0.8
            return HandState(handedness=handedness, landmarks=lms, detection_score=score)
        except Exception as exc:
            log.error("MediaPipe processing failed: %s", exc)
            emit_event("VISION", "MediaPipe error", "ERROR", None, str(exc))
            return None

    def _execute_gesture(self, res: GestureResult) -> None:
        svc = get_mapping_service()
        mapping = svc.find_enabled(res.gesture)
        if not mapping:
            emit_event("VISION", f"{res.gesture} (no mapping)", "WARNING", None, "no action configured")
            return
        try:
            cmd = mapping_to_command(mapping)
            if cmd.upper().startswith("ROBOT:"):
                # Robot commands pass through the safety validator inside the robotics controller.
                from .robotics_service import get_robotics
                rc = get_robotics()
                resp = rc.handle_robot_command(cmd)
                emit_event(
                    "VISION",
                    res.gesture,
                    "SUCCESS" if resp.get("ok") else "ERROR",
                    cmd,
                    f"confidence={res.confidence:.0%} motors={resp.get('motors', {})}",
                )
                return
            hw = get_hardware()
            resp = hw.send_command(cmd)
            emit_event(
                "VISION",
                res.gesture,
                "SUCCESS" if resp.ok else "ERROR",
                cmd,
                f"confidence={res.confidence:.0%}",
            )
        except Exception as exc:
            emit_event("VISION", res.gesture, "ERROR", None, str(exc))

    # ------------------------------------------------------------------
    # simulation rendering
    # ------------------------------------------------------------------
    def _render_simulation(self) -> np.ndarray:
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        frame[:] = (16, 16, 24)
        cv2.putText(frame, "EMPIRE  |  SIMULATION CAMERA", (16, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120, 190, 255), 1, cv2.LINE_AA)

        # technical grid
        for x in range(0, self.width, 40):
            cv2.line(frame, (x, 0), (x, self.height), (30, 30, 44), 1)
        for y in range(0, self.height, 40):
            cv2.line(frame, (0, y), (self.width, y), (30, 30, 44), 1)

        fingers = SIM_GESTURES.get(self.sim_gesture, [False] * 5)
        lms = simulate_landmarks(fingers)
        self._draw_hand(frame, lms, (0, 255, 170))

        cv2.putText(frame, f"Virtual hand: {self.sim_gesture}", (16, self.height - 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 170), 1, cv2.LINE_AA)
        return frame

    def _draw_hand(self, frame: np.ndarray, lms: List[tuple], color) -> None:
        h, w = frame.shape[:2]
        pts = [(int(p[0] * w), int(p[1] * h)) for p in lms]
        for a, b in FINGER_LANDMARK_CONNECTIONS:
            cv2.line(frame, pts[a], pts[b], color, 2, cv2.LINE_AA)
        for p in pts:
            cv2.circle(frame, p, 3, (255, 255, 255), -1, cv2.LINE_AA)

    # ------------------------------------------------------------------
    # output
    # ------------------------------------------------------------------
    def _encode(self, frame: np.ndarray) -> Optional[bytes]:
        try:
            ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
            if ok:
                return buf.tobytes()
        except Exception:
            pass
        return None

    def snapshot_b64(self) -> Optional[str]:
        with self._lock:
            if self._frame_jpeg is None:
                return None
            return base64.b64encode(self._frame_jpeg).decode("ascii")

    def state(self) -> dict:
        hw = get_hardware().state()
        return {
            "mode": self.mode,
            "running": self._running,
            "fps": round(self._fps, 1),
            "latency_ms": round(self._latency_ms, 1),
            "width": self.width,
            "height": self.height,
            "detection_enabled": self.detection_enabled,
            "show_landmarks": self.show_landmarks,
            "show_bbox": self.show_bbox,
            "show_ar": self.show_ar,
            "confidence_threshold": self.confidence_threshold,
            "sim_gesture": self.sim_gesture,
            "detection": self.last_detection,
            "hardware": {
                "mode": hw.get("mode"),
                "connected": hw.get("connected", False),
                "virtual": hw.get("virtual", False),
            },
        }

    def apply_overlays(self, frame: np.ndarray) -> np.ndarray:
        """Draw detection overlays (used by the WS stream)."""
        h, w = frame.shape[:2]
        if self.show_ar:
            overlay = frame.copy()
            cv2.rectangle(overlay, (0, 0), (w, 44), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)
            fps = self.state()["fps"]
            mode = self.mode.upper()
            det = self.result.gesture if self.result else "NO_HAND"
            conf = (self.result.confidence if self.result else 0.0)
            cv2.putText(frame, f"FPS {fps:.0f} | LAT {self._latency_ms:.0f}ms | {mode} | {det} {conf:.0%}",
                        (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 200), 1, cv2.LINE_AA)
        if self.show_landmarks and self.mode != "simulation":
            lms = self.last_detection.get("landmarks") or []
            if lms:
                self._draw_hand(frame, lms, (0, 255, 170))
                if self.show_bbox and len(lms) > 0:
                    xs = [p[0] for p in lms]
                    ys = [p[1] for p in lms]
                    x0, y0 = int(min(xs) * w), int(min(ys) * h)
                    x1, y1 = int(max(xs) * w), int(max(ys) * h)
                    cv2.rectangle(frame, (x0, y0), (x1, y1), (80, 220, 255), 1, cv2.LINE_AA)
                    label = f"{self.result.handedness} HAND"
                    cv2.putText(frame, label, (x0, max(16, y0 - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (80, 220, 255), 1, cv2.LINE_AA)
        return frame


_vision: Optional[VisionService] = None


def get_vision() -> VisionService:
    global _vision
    if _vision is None:
        _vision = VisionService()
    return _vision