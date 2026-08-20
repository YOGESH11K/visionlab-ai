# Component Database

The knowledge base is `backend/app/data/components.json` — 24 components, each with:

```json
{
  "id": "hcsr04",
  "name": "HC-SR04",
  "category": "sensor",
  "aliases": ["ultrasonic", "distance sensor"],
  "description": "...",
  "working": "how it works",
  "pins": [{ "name": "VCC", "function": "Power", "value": "5V" }],
  "voltage": "5V",
  "current": "...",
  "interfaces": ["digital"],
  "compatibility": ["Arduino", "ESP32"],
  "arduino_examples": [{ "title": "...", "wiring": "...", "code": "..." }],
  "esp32_notes": "...",
  "applications": ["..."],
  "common_mistakes": ["..."],
  "safety_notes": "..."
}
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/components` | all components + categories |
| `GET /api/components/categories` | category map |
| `GET /api/components/search?q=...` | alias-aware search |
| `GET /api/components/{id}` | one component |
| `GET /api/components/identify/{name}` | resolve by name/alias |
| `POST /api/components/scan` | experimental frame scan (see below) |
| `POST /api/components/recognize` | recognize current backend camera frame (AI-first) |
| `POST /api/components/recognize/upload` | recognize an uploaded JPEG/PNG (AI-first) |

## Adding a component

Append an entry to `components.json` (same schema) — the API, AI assistant, scanner manual
identify, and circuit validator pick it up automatically. Rebuild nothing.

## Component Scanner

`scanner_service.py` identifies the component in a frame and answers with its
**name, pins and why it is used**. Recognition priority:

1. **AI vision (primary)** — when `EMPIRE_AI_API_KEY` is set, the frame is sent to
   the configured vision-capable model (e.g. `gpt-4o-mini`). The model returns a
   catalog id from the knowledge DB, which is matched to the verified record so the
   answer is decisive (`source: "ai"`, `possible: false`) and always includes pins,
   voltage/current, and why the component is used. If the AI call fails, it safely
   falls back to heuristics.
2. **Heuristic fallback** — HSV color masks, contours, Hough circles and edge
   density detect common components (LED, resistor, capacitor, potentiometer, button,
   LDR, DHT, relay, OLED/LCD, HC-SR04, PIR, servo, DC motor, buzzer, IR). These remain
   honest `possible` matches with a confidence score and never assert a false certainty.

Add a component to `components.json` (same schema) and it is picked up by the API, AI
assistant, scanner and circuit validator automatically. Rebuild nothing.