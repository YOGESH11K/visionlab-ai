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

## Adding a component

Append an entry to `components.json` (same schema) — the API, AI assistant, scanner manual
identify, and circuit validator pick it up automatically. Rebuild nothing.

## Component Scanner (EXPERIMENTAL)

`scanner_service.py` runs honest, low-confidence heuristic analysis on the current frame:

- HSV color masks → possible LEDs (red/green/blue/yellow).
- Contour/threshold → PCB/board-like regions, breadboard hole density.

Results are **possible matches** with a confidence and guidance — it never asserts a confident ID.
For verified information use **manual identification** (drops down the component DB).
A real detector (e.g. YOLO) can replace the scanner behind the same `scan_frame` interface.