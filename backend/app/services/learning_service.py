"""Learning engine: quizzes, scores/progress, and project suggestions."""
from __future__ import annotations

import random
from typing import Dict, List, Optional

from sqlalchemy import select

from ..db import SessionLocal
from ..models import QuizScore
from .component_db import get_db

QUIZ_KEYS = {
    "component": "Component quiz",
    "pins": "Pin quiz",
    "circuit": "Circuit quiz",
    "arduino": "Arduino coding quiz",
}


def _build_component_quiz() -> List[dict]:
    db = get_db()
    comps = random.sample(db.all(), min(12, len(db.all())))
    questions = []
    for comp in comps:
        answers = [comp["name"]]
        others = [c["name"] for c in random.sample(db.all(), 3) if c["id"] != comp["id"]]
        options = answers + others
        random.shuffle(options)
        questions.append({
            "key": "component",
            "question": comp.get("working", comp.get("description", ""))[:160] + "...",
            "options": options,
            "answer": comp["name"],
        })
    return questions


def _build_pin_quiz() -> List[dict]:
    db = get_db()
    comps = random.sample(db.all(), 10)
    questions = []
    for comp in comps:
        pins = comp.get("pins", [])
        if len(pins) < 2:
            continue
        pin = random.choice(pins)
        options = list({p["function"] for p in pins})
        while len(options) < 3:
            options.append("Not a pin")
        random.shuffle(options)
        questions.append({
            "key": "pins",
            "question": f"What does pin '{pin['name']}' do on the {comp['name']}?",
            "options": options,
            "answer": pin["function"],
        })
    return questions


def _build_circuit_quiz() -> List[dict]:
    questions = [
        {"key": "circuit", "question": "Which two pins must every powered component have connected?",
         "options": ["VCC and GND", "SDA and SCL", "D13 and GND", "A0 and A1"], "answer": "VCC and GND"},
        {"key": "circuit", "question": "Why does an LED need a series resistor?",
         "options": ["To limit current and protect the LED", "To increase brightness", "To reverse polarity", "To store charge"],
         "answer": "To limit current and protect the LED"},
        {"key": "circuit", "question": "What is the safest extra component when driving a DC motor?",
         "options": ["Flyback diode", "Ceramic capacitor only", "Extra resistor", "Nothing"],
         "answer": "Flyback diode"},
        {"key": "circuit", "question": "What happens if you feed 5V into an ESP32 GPIO?",
         "options": ["It can damage the pin (ESP32 is 3.3V)", "It works fine", "It doubles the ADC range", "Nothing"],
         "answer": "It can damage the pin (ESP32 is 3.3V)"},
        {"key": "circuit", "question": "Which Arduino pins support PWM (analogWrite)?",
         "options": ["D3, D5, D6, D9, D10, D11", "A0-A5", "Only D13", "All digital pins"],
         "answer": "D3, D5, D6, D9, D10, D11"},
    ]
    return questions


def _build_arduino_quiz() -> List[dict]:
    questions = [
        {"key": "arduino", "question": "Which function runs once at startup?",
         "options": ["setup()", "loop()", "begin()", "main()"], "answer": "setup()"},
        {"key": "arduino", "question": "Which function runs repeatedly?",
         "options": ["loop()", "setup()", "delay()", "pinMode()"], "answer": "loop()"},
        {"key": "arduino", "question": "How do you set pin 13 as an output?",
         "options": ["pinMode(13, OUTPUT)", "digitalWrite(13, OUTPUT)", "analogWrite(13, OUTPUT)", "pin(13).output()"],
         "answer": "pinMode(13, OUTPUT)"},
        {"key": "arduino", "question": "What does analogWrite(9, 128) do?",
         "options": ["Sets a ~50% PWM duty cycle on pin 9", "Writes 128 volts", "Reads pin 9", "Sets pin 9 HIGH"],
         "answer": "Sets a ~50% PWM duty cycle on pin 9"},
        {"key": "arduino", "question": "Which library drives a servo?",
         "options": ["Servo", "Wire", "EEPROM", "Math"], "answer": "Servo"},
    ]
    return questions


BUILDERS = {
    "component": _build_component_quiz,
    "pins": _build_pin_quiz,
    "circuit": _build_circuit_quiz,
    "arduino": _build_arduino_quiz,
}


def _suggestions() -> List[dict]:
    db = get_db()
    out = []
    for comp_id in ["led", "ldr", "hcsr04", "dht22", "servo", "pir", "buzzer"]:
        comp = db.get(comp_id)
        if not comp:
            continue
        ex = (comp.get("arduino_examples") or [{}])[0]
        out.append({
            "title": f"{comp['name']} starter",
            "difficulty": "beginner",
            "components": [comp["name"]],
            "concept": comp.get("working", "")[:120],
            "code": ex.get("code", ""),
            "upgrades": ["Add wireless reporting", "Add data logging", "Combine sensors"],
        })
    out += [
        {"title": "Gesture controlled LED array", "difficulty": "intermediate",
         "components": ["Arduino", "LED x4"], "concept": "Fingers control LEDs via the vision pipeline.",
         "code": "// Empire default mapping handles this automatically.", "upgrades": ["Add servo + gesture"]},
        {"title": "Smart parking assistant", "difficulty": "intermediate",
         "components": ["HC-SR04", "Buzzer", "LED"], "concept": "Beeps faster as the car gets closer.",
         "code": "// distance + tone() example", "upgrades": ["Add OLED display"]},
    ]
    return out


class LearningService:
    def quiz(self, key: str, count: int = 5) -> dict:
        builder = BUILDERS.get(key)
        if not builder:
            return {"ok": False, "error": f"unknown quiz key {key}"}
        questions = builder()
        random.shuffle(questions)
        return {"ok": True, "key": key, "name": QUIZ_KEYS[key], "questions": questions[:count]}

    def submit(self, key: str, answers: List[dict]) -> dict:
        correct = 0
        with SessionLocal() as db:
            for a in answers:
                is_correct = bool(a.get("correct"))
                if is_correct:
                    correct += 1
                db.add(QuizScore(
                    quiz_key=key,
                    question=a.get("question", ""),
                    selected=a.get("selected", ""),
                    correct=is_correct,
                    score=1 if is_correct else 0,
                ))
            db.commit()
        total = len(answers) or 1
        return {
            "ok": True,
            "key": key,
            "score": correct,
            "total": total,
            "percent": round(correct / total * 100),
        }

    def progress(self) -> dict:
        with SessionLocal() as db:
            rows = db.scalars(select(QuizScore)).all()
        by_key: Dict[str, Dict] = {}
        for r in rows:
            k = r.quiz_key
            by_key.setdefault(k, {"attempts": 0, "correct": 0})
            by_key[k]["attempts"] += 1
            by_key[k]["correct"] += int(r.correct)
        out = {}
        for k, v in by_key.items():
            out[k] = {
                "attempts": v["attempts"],
                "score": v["correct"],
                "percent": round(v["correct"] / max(1, v["attempts"]) * 100),
            }
        return {"keys": out, "quizzes": QUIZ_KEYS}

    def suggestions(self) -> List[dict]:
        return _suggestions()


_learning: Optional[LearningService] = None


def get_learning() -> LearningService:
    global _learning
    if _learning is None:
        _learning = LearningService()
    return _learning