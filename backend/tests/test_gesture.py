"""Gesture engine unit tests: classification + temporal stability."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.gesture_engine import (
    GestureEngine,
    GestureResult,
    HandState,
    classify_gesture,
    finger_count,
    finger_states_from_landmarks,
)
from app.services.vision_service import simulate_landmarks


def _hand(gesture_fingers, score=0.95, handedness="Right"):
    lms = simulate_landmarks(gesture_fingers, jitter=0.0)
    return HandState(handedness=handedness, landmarks=lms, detection_score=score)


def test_finger_states_landmarks():
    # OPEN_PALM -> all five extended
    lms = simulate_landmarks([True, True, True, True, True], jitter=0.0)
    states = finger_states_from_landmarks(lms, "Right")
    assert all(states)

    # FIST -> thumb extended (by our sim), all fingers folded
    lms = simulate_landmarks([True, False, False, False, False], jitter=0.0)
    states = finger_states_from_landmarks(lms, "Right")
    assert not any(states[1:])
    assert states[0]


def test_finger_count():
    assert finger_count([True, True, False, False, False]) == 1
    assert finger_count([True, True, True, True, True]) == 4
    assert finger_count([False, False, False, False, False]) == 0


def test_classify_open_palm():
    r = classify_gesture(_hand([True, True, True, True, True]))
    assert r.gesture == "OPEN_PALM"
    assert r.finger_count == 4


def test_classify_three_fingers():
    r = classify_gesture(_hand([False, True, True, True, False]))
    assert r.gesture == "THREE_FINGERS"
    assert r.finger_count == 3


def test_classify_fist():
    r = classify_gesture(_hand([False, False, False, False, False]))
    assert r.gesture == "FIST"


def test_classify_peace_and_point():
    # finger-count names take priority (demo); POINT/PEACE come from sustained holds
    assert classify_gesture(_hand([False, True, True, False, False])).gesture == "TWO_FINGERS"
    assert classify_gesture(_hand([False, True, False, False, False])).gesture == "ONE_FINGER"


def test_sustained_hold_emits_point_and_peace():
    eng = GestureEngine(stable_frames=2, cooldown_s=5.0, confidence_threshold=0.0, sustained_seconds=1.0)
    point_emitted = []
    t = 0.0
    for _ in range(12):
        r = eng.process(_hand([False, True, False, False, False]), now=t)
        if r.emitted:
            point_emitted.append(r.gesture)
        t += 0.2
    assert point_emitted == ["ONE_FINGER", "POINT"]


def test_classify_thumb_up_down():
    assert classify_gesture(_hand([True, False, False, False, False])).gesture == "THUMB_UP"
    assert classify_gesture(_hand([False, True, True, True, True])).gesture == "THUMB_DOWN"


def test_classify_pinch():
    # landmarks with thumb+index tips close together
    lms = simulate_landmarks([False, True, False, False, False], jitter=0.0)
    lms[4] = (lms[8][0] - 0.005, lms[8][1] - 0.003, 0.0)  # pinch
    r = classify_gesture(HandState(handedness="Right", landmarks=lms, detection_score=0.95))
    assert r.gesture == "PINCH"


def test_no_hand():
    r = classify_gesture(HandState(handedness="Unknown", landmarks=[], detection_score=0.0))
    assert r.gesture == "NO_HAND"


def test_low_confidence_gated():
    eng = GestureEngine(confidence_threshold=0.6)
    r = eng.process(_hand([True, True, True, True, True], score=0.3))
    assert r.gesture == "NO_HAND"
    assert r.emitted is False


def test_stable_single_emit_for_noisy_stream():
    """1,2,3,2,3,2... must emit exactly ONE command once stable."""
    eng = GestureEngine(stable_frames=3, cooldown_s=10, confidence_threshold=0.0)
    seq = [
        [False, True, False, False, False],   # ONE
        [False, True, True, False, False],    # TWO
        [False, True, True, True, False],     # THREE
        [False, True, True, False, False],    # TWO
        [False, True, True, True, False],     # THREE
        [False, True, True, True, False],     # THREE
        [False, True, True, True, False],     # THREE (stable)
    ]
    emitted = []
    t = 0.0
    for fingers in seq:
        r = eng.process(_hand(fingers), now=t)
        if r.emitted:
            emitted.append(r.gesture)
        t += 0.1
    assert emitted == ["THREE_FINGERS"]


def test_no_command_when_rapid_alternation():
    eng = GestureEngine(stable_frames=3, cooldown_s=5, confidence_threshold=0.0)
    seq = [
        [False, True, False, False, False],
        [False, True, True, False, False],
        [False, True, False, False, False],
        [False, True, True, False, False],
        [False, True, False, False, False],
    ]
    emitted = 0
    t = 0.0
    for fingers in seq:
        r = eng.process(_hand(fingers), now=t)
        if r.emitted:
            emitted += 1
        t += 0.1
    assert emitted == 0


def test_cooldown_suppresses_rapid_reemit():
    eng = GestureEngine(stable_frames=2, cooldown_s=1.0, confidence_threshold=0.0)
    eng.process(_hand([True, True, True, True, True]), now=0.0)  # warm-up frame
    first = eng.process(_hand([True, True, True, True, True]), now=0.2)
    assert first.emitted is True
    # immediate repeat within cooldown -> no emit
    again = eng.process(_hand([True, True, True, True, True]), now=0.4)
    assert again.emitted is False
    # after cooldown a re-establishing frame emits again
    later = eng.process(_hand([True, True, True, True, True]), now=1.2)
    assert later.emitted is True