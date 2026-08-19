"""AI assistant service.

Priority order:
  1. Verified internal component knowledge (never hallucinated hardware facts).
  2. Optional LLM (OpenAI-compatible) — only when EMPIRE_AI_API_KEY is set.
  3. Explicit "unknown" responses with guidance when nothing verifiable is found.

Also provides the intent-based Arduino code generator used by the Code Generator module.
"""
from __future__ import annotations

import json
import re
from typing import Dict, List, Optional

from sqlalchemy import select

from ..config import settings
from ..db import SessionLocal
from ..logging import get_logger
from ..models import AssistantHistory
from .component_db import get_db
from .event_bus import emit_event

log = get_logger("ai")


# --------------------------------------------------------------------------
# intent helpers
# --------------------------------------------------------------------------
def _extract_component(text: str) -> Optional[dict]:
    db = get_db()
    lower = text.lower()
    best = None
    for comp in db.all():
        tokens = [comp["id"], comp["name"]] + comp.get("aliases", [])
        for t in tokens:
            t = t.lower()
            if len(t) < 3:
                continue
            pattern = r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])"
            if re.search(pattern, lower):
                if best is None or len(t) > len(best[1]):
                    best = (comp, t)
    return best[0] if best else None


def _intent(text: str) -> str:
    lower = text.lower()
    if any(k in lower for k in ["pin", "wire", "connect", "hook up", "wiring"]):
        return "connect"
    if any(k in lower for k in ["project", "build", "make with", "idea"]):
        return "projects"
    if any(k in lower for k in ["why", "not working", "problem", "error", "fix", "issue"]):
        return "troubleshoot"
    if any(k in lower for k in ["eli5", "beginner", "simple terms", "dummy"]):
        return "eli5"
    if any(k in lower for k in ["technically", "technical", "deep dive"]):
        return "technical"
    if any(k in lower for k in ["how does", "how it work", "principle", "function"]):
        return "working"
    if any(k in lower for k in ["what is", "what are", "what's", "tell me about", "describe"]):
        return "whatis"
    return "general"


def _f(text: str, indent: str = "") -> str:
    return f"{indent}{text}\n"


def _section(title: str, lines: List[str]) -> str:
    out = f"{title}\n" + "-" * len(title) + "\n"
    out += "\n".join(lines) + "\n"
    return out


# --------------------------------------------------------------------------
# knowledge answers
# --------------------------------------------------------------------------
def _answer_component(comp: dict, mode: str) -> str:
    name = comp["name"]
    lines: List[str] = []

    if mode == "technical":
        lines.append(_section("Technical overview", [comp.get("working", "")]))
        lines.append(_f(f"Category: {comp['category']}"))
        lines.append(_f(f"Voltage: {comp.get('voltage', 'n/a')}"))
        lines.append(_f(f"Current: {comp.get('current', 'n/a')}"))
        lines.append(_f(f"Interfaces: {', '.join(comp.get('interfaces', []))}"))
    elif mode == "eli5":
        first = comp.get("description", "").split(". ")[0]
        lines.append(_f(f"{name} is a component used in electronics. {first}."))
        lines.append(_f(f"You would normally pair it with a board like {comp.get('compatibility', ['Arduino'])[0]}."))
    else:
        lines.append(_f(f"{name} — {comp.get('category', 'component').upper()}"))
        lines.append(_f(comp.get("description", "")))
    pins = comp.get("pins", [])
    if pins:
        lines.append("")
        lines.append("PINOUT")
        for p in pins:
            lines.append(f"  {p['name']:<10} {p['function']:<28} {p['value']}")
    lines.append("")
    lines.append("HOW IT WORKS")
    lines.append(comp.get("working", ""))
    lines.append("")
    lines.append("APPLICATIONS")
    lines.append("  • " + "\n  • ".join(comp.get("applications", [])))
    lines.append("")
    lines.append("COMMON MISTAKES")
    lines.append("  • " + "\n  • ".join(comp.get("common_mistakes", [])))
    if comp.get("safety_notes"):
        lines.append("")
        lines.append(f"SAFETY: {comp['safety_notes']}")
    if comp.get("esp32_notes"):
        lines.append("")
        lines.append(f"ESP32 NOTE: {comp['esp32_notes']}")
    return "\n".join(lines)


def _answer_connect(comp: dict, mode: str) -> str:
    examples = comp.get("arduino_examples", [])
    out = [f"Connecting the {comp['name']}:"]
    out.append("")
    out.append("STEP 1 — Wiring")
    for p in comp.get("pins", [])[:6]:
        out.append(f"  • {p['name']}: {p['function']}")
    out.append("")
    out.append("STEP 2 — Power & ground")
    out.append("  • Respect the component's voltage: " + comp.get("voltage", "see datasheet"))
    out.append("  • Always share a common ground with your board.")
    if comp.get("esp32_notes"):
        out.append("")
        out.append("ESP32 note: " + comp["esp32_notes"])
    if examples:
        ex = examples[0]
        out.append("")
        out.append("EXAMPLE PROJECT — " + ex.get("title", ""))
        out.append("Wiring: " + ex.get("wiring", ""))
        out.append("")
        out.append("```cpp")
        out.append(ex.get("code", ""))
        out.append("```")
    out.append("")
    out.append("IMPORTANT: pin mappings depend on your board and project. The example above is a "
               "reference, not a universal rule — always double-check against your schematic.")
    return "\n".join(out)


def _answer_projects(comp: dict) -> str:
    examples = comp.get("arduino_examples", [])
    out = [f"Projects you can build with the {comp['name']}:"]
    for i, ex in enumerate(examples, 1):
        out.append(f"  {i}. {ex.get('title', 'Untitled')}")
        out.append(f"     Wiring: {ex.get('wiring', 'n/a')}")
    out.append("")
    out.append("Suggested upgrades:")
    out.append("  • Add wireless reporting (ESP32 + MQTT)")
    out.append("  • Add data logging to SD/cloud")
    out.append("  • Combine with other components from your workspace")
    return "\n".join(out)


def _answer_troubleshoot(comp: dict) -> str:
    out = [f"Troubleshooting the {comp['name']}:"]
    for m in comp.get("common_mistakes", []):
        out.append("  • " + m)
    out.append("")
    out.append("General checks:")
    out.append("  • Verify power and ground (common ground is essential).")
    out.append("  • Check wiring matches the schematic, not assumptions.")
    out.append("  • Use a multimeter to confirm voltage at the power pins.")
    out.append("  • Inspect the board for damaged/loose connections.")
    if comp.get("safety_notes"):
        out.append("")
        out.append("Safety: " + comp["safety_notes"])
    return "\n".join(out)


def knowledge_answer(question: str, mode: str = "auto") -> Dict:
    comp = _extract_component(question)
    if comp is None:
        return {
            "ok": False,
            "answer": (
                "I couldn't identify a component from the verified database for that question. "
                "I won't guess hardware specifications. Try asking about a known component "
                "(e.g. HC-SR04, LED, DHT22, Servo, ESP32) or 'pins of LED'."
            ),
            "component": None,
        }
    intent = _intent(question)
    answer = {
        "connect": lambda: _answer_connect(comp, mode),
        "projects": lambda: _answer_projects(comp),
        "troubleshoot": lambda: _answer_troubleshoot(comp),
        "working": lambda: _answer_component(comp, mode),
        "whatis": lambda: _answer_component(comp, mode),
        "eli5": lambda: _answer_component(comp, "eli5"),
        "technical": lambda: _answer_component(comp, "technical"),
        "general": lambda: _answer_component(comp, mode),
    }[intent]()
    return {"ok": True, "answer": answer, "component": comp["id"], "intent": intent}


# --------------------------------------------------------------------------
# optional LLM
# --------------------------------------------------------------------------
def _llm_answer(question: str, context: str) -> Optional[str]:
    if not settings.ai_enabled:
        return None
    try:
        import httpx

        body = {
            "model": settings.ai_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are the Empire electronics assistant. Base answers on the verified "
                        "component data provided. If the data does not cover something, say the "
                        "information is unknown. Never invent hardware specifications.\n\n"
                        f"VERIFIED COMPONENT DATA:\n{context[:6000]}"
                    ),
                },
                {"role": "user", "content": question},
            ],
            "temperature": 0.3,
            "max_tokens": 900,
        }
        with httpx.Client(timeout=settings.ai_timeout) as client:
            resp = client.post(
                f"{settings.ai_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.ai_api_key}"},
                json=body,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        log.warning("LLM call failed, using fallback: %s", exc)
        return None


# --------------------------------------------------------------------------
# code generator (intent-based Arduino sketch)
# --------------------------------------------------------------------------
def _map_pin(comp: dict, default: str) -> str:
    return default  # keep simple; pins are user-configurable in the UI


def generate_code(description: str) -> Dict:
    """Generate an Arduino sketch from a natural-language request.

    Recognizes conditions like "distance < 10", "temperature > 30", "light",
    "button pressed", and outputs a clean compilable sketch.
    """
    desc = description.lower()

    cond_distance = re.search(r"distance\s*([<>=]+)\s*(\d+)", desc)
    cond_temp = re.search(r"t(?:emperature)?\s*([<>=]+)\s*(-?\d+)", desc)
    cond_hum = re.search(r"humidity\s*([<>=]+)\s*(\d+)", desc)
    cond_light = re.search(r"light\s*([<>=]+)\s*(\d+)", desc)

    # determine sensors included
    sensors = []
    if cond_distance or "distance" in desc or "ultrasonic" in desc or "hcsr" in desc:
        sensors.append("distance")
    if cond_temp or "temperature" in desc or "dht" in desc:
        sensors.append("dht")
    if cond_hum:
        sensors.append("dht")
    if cond_light or "light" in desc or "ldr" in desc:
        sensors.append("ldr")
    if "button" in desc or "switch" in desc:
        sensors.append("button")

    outputs = []
    if "led" in desc:
        outputs.append("led")
    if "servo" in desc:
        outputs.append("servo")
    if "buzzer" in desc or "alarm" in desc:
        outputs.append("buzzer")
    if "motor" in desc:
        outputs.append("motor")
    if "relay" in desc:
        outputs.append("relay")

    if not outputs and not sensors:
        return {"ok": False, "error": "Could not understand the request. Try: 'Turn on LED when distance is less than 10 cm'."}

    lines: List[str] = []

    if "dht" in sensors:
        lines.append("#include <DHT.h>")
        lines.append("DHT dht(2, DHT22);")
        lines.append("")
    if "servo" in outputs:
        lines.append("#include <Servo.h>")
        lines.append("Servo servo;")
        lines.append("")

    lines.append("#define LED_PIN 13")
    if "distance" in sensors:
        lines.append("#define TRIG 9")
        lines.append("#define ECHO 10")
    if "ldr" in sensors:
        lines.append("#define LDR_PIN A0")
    if "buzzer" in outputs:
        lines.append("#define BUZZER_PIN 8")
    if "button" in sensors:
        lines.append("#define BUTTON_PIN 2")
    if "relay" in outputs:
        lines.append("#define RELAY_PIN 7")
    if "motor" in outputs:
        lines.append("#define MOTOR_PIN 9")
    lines.append("")

    lines.append("void setup() {")
    lines.append("  Serial.begin(9600);")
    lines.append("  pinMode(LED_PIN, OUTPUT);")
    if "distance" in sensors:
        lines.append("  pinMode(TRIG, OUTPUT);")
        lines.append("  pinMode(ECHO, INPUT);")
    if "ldr" in sensors:
        lines.append("  pinMode(LDR_PIN, INPUT);")
    if "button" in sensors:
        lines.append("  pinMode(BUTTON_PIN, INPUT_PULLUP);")
    if "buzzer" in outputs:
        lines.append("  pinMode(BUZZER_PIN, OUTPUT);")
    if "relay" in outputs:
        lines.append("  pinMode(RELAY_PIN, OUTPUT);")
    if "servo" in outputs:
        lines.append("  servo.attach(9);")
    lines.append("}")
    lines.append("")

    if "distance" in sensors:
        lines.append("float readDistance() {")
        lines.append("  digitalWrite(TRIG, LOW); delayMicroseconds(2);")
        lines.append("  digitalWrite(TRIG, HIGH); delayMicroseconds(10);")
        lines.append("  digitalWrite(TRIG, LOW);")
        lines.append("  return pulseIn(ECHO, HIGH) / 58.0;")
        lines.append("}")
        lines.append("")

    lines.append("void loop() {")
    if "dht" in sensors:
        lines.append("  float t = dht.readTemperature();")
        lines.append("  float h = dht.readHumidity();")
    if "ldr" in sensors:
        lines.append("  int light = analogRead(LDR_PIN);")
    if "button" in sensors:
        lines.append("  bool pressed = !digitalRead(BUTTON_PIN);")

    # build the trigger condition
    condition = None
    if cond_distance:
        condition = f"readDistance() {cond_distance.group(1)} {cond_distance.group(2)}"
        lines.append("  float dist = readDistance();")
    elif cond_temp:
        condition = f"t {cond_temp.group(1)} {cond_temp.group(2)}"
    elif cond_hum:
        condition = f"h {cond_hum.group(1)} {cond_hum.group(2)}"
    elif cond_light:
        condition = f"light {cond_light.group(1)} {cond_light.group(2)}"
    elif "button" in sensors:
        condition = "pressed"

    if condition:
        lines.append(f"  if ({condition}) {{")
        for o in outputs:
            if o == "led":
                lines.append("    digitalWrite(LED_PIN, HIGH);")
            if o == "buzzer":
                lines.append("    tone(BUZZER_PIN, 2000, 200);")
            if o == "relay":
                lines.append("    digitalWrite(RELAY_PIN, HIGH);")
            if o == "motor":
                lines.append("    analogWrite(MOTOR_PIN, 180);")
            if o == "servo":
                lines.append("    servo.write(90);")
        lines.append("  } else {")
        for o in outputs:
            if o == "led":
                lines.append("    digitalWrite(LED_PIN, LOW);")
            if o == "relay":
                lines.append("    digitalWrite(RELAY_PIN, LOW);")
            if o == "motor":
                lines.append("    analogWrite(MOTOR_PIN, 0);")
            if o == "servo":
                lines.append("    servo.write(0);")
        lines.append("  }")
    else:
        for o in outputs:
            if o == "led":
                lines.append("  digitalWrite(LED_PIN, HIGH);")
                lines.append("  delay(1000);")
                lines.append("  digitalWrite(LED_PIN, LOW);")
                lines.append("  delay(1000);")
        if not outputs:
            lines.append("  // no output action requested — add logic here")
    lines.append("  delay(100);")
    lines.append("}")

    code = "\n".join(lines)
    explanation = _explain_generated(desc, sensors, outputs, condition)
    return {
        "ok": True,
        "code": code,
        "components": _components_for(desc),
        "pins": _pins_for(sensors, outputs),
        "explanation": explanation,
        "expected": "When the condition is true the outputs activate; otherwise they deactivate.",
    }


def _components_for(desc: str) -> List[str]:
    db = get_db()
    comps = []
    for token in ["arduino_uno", "led", "hcsr04", "dht22", "ldr", "servo", "buzzer", "relay", "dc_motor", "push_button"]:
        comp = db.get(token)
        if comp and comp["name"].lower() in desc or comp and comp["id"] in desc:
            comps.append(comp["id"])
    if not comps:
        comps = ["arduino_uno"]
    return comps


def _pins_for(sensors: List[str], outputs: List[str]) -> List[str]:
    pins = []
    if "distance" in sensors:
        pins += ["TRIG → D9", "ECHO → D10"]
    if "dht" in sensors:
        pins += ["DHT DATA → D2"]
    if "ldr" in sensors:
        pins += ["LDR → A0 (divider)"]
    if "button" in sensors:
        pins += ["Button → D2 (INPUT_PULLUP)"]
    if "led" in outputs:
        pins.append("LED → D13 (with resistor)")
    if "buzzer" in outputs:
        pins.append("Buzzer → D8")
    if "relay" in outputs:
        pins.append("Relay IN → D7")
    if "motor" in outputs:
        pins.append("Motor driver → D9")
    if "servo" in outputs:
        pins.append("Servo signal → D9")
    return pins


def _explain_generated(desc: str, sensors: List[str], outputs: List[str], condition) -> str:
    parts = ["This sketch was generated from your request."]
    if sensors:
        parts.append("It reads " + ", ".join(sensors) + ".")
    if condition:
        parts.append(f"The condition checked is: {condition}.")
    if outputs:
        parts.append("Outputs driven: " + ", ".join(outputs) + ".")
    parts.append("Verify pin numbers against your wiring before uploading. Always confirm before flashing to real hardware.")
    return " ".join(parts)


# --------------------------------------------------------------------------
# service
# --------------------------------------------------------------------------
class AssistantService:
    def chat(self, text: str, mode: str = "auto") -> Dict:
        db = get_db()
        comp = _extract_component(text)
        context = json.dumps(comp, indent=1) if comp else ""

        llm = _llm_answer(text, context) if settings.ai_enabled else None
        if llm:
            answer = llm
            source = "llm"
        else:
            k = knowledge_answer(text, mode)
            answer = k["answer"]
            source = "knowledge"

        self._store("user", text, mode)
        self._store("assistant", answer, mode)
        emit_event("AI", "Assistant answered", "INFO", None, f"source={source}")
        return {"answer": answer, "source": source, "component": comp["id"] if comp else None}

    def _store(self, role: str, text: str, mode: str) -> None:
        try:
            with SessionLocal() as db:
                db.add(AssistantHistory(role=role, text=text, mode=mode))
                db.commit()
        except Exception:
            pass

    def history(self, limit: int = 50) -> List[Dict]:
        with SessionLocal() as db:
            rows = db.scalars(
                select(AssistantHistory).order_by(AssistantHistory.id.desc()).limit(limit)
            ).all()
        return [{"role": r.role, "text": r.text, "mode": r.mode, "created_at": r.created_at.isoformat()}
                for r in reversed(rows)]


_assistant: Optional[AssistantService] = None


def get_assistant() -> AssistantService:
    global _assistant
    if _assistant is None:
        _assistant = AssistantService()
    return _assistant