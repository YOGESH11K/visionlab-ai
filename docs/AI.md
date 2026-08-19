# AI Assistant & Code Generator

## Assistant

`/api/ai/chat` — priority order:

1. **Verified internal knowledge** — answers built from the component DB (pinout, wiring steps,
   projects, troubleshooting, ELI5/technical modes). Never hallucinated hardware facts.
2. **Optional LLM** (OpenAI-compatible) — used only when `EMPIRE_AI_API_KEY` is set; the verified
   component data is injected as system context so the LLM stays grounded.
3. **Explicit unknown** — if no component matches, Empire says so and points to the database;
   it does not guess specifications.

The UI shows a **verified** vs **LLM** source tag on each answer. Chat history is stored in SQLite.

Request:

```json
POST /api/ai/chat
{ "message": "How do I connect an HC-SR04?", "mode": "auto" }
// mode: auto | beginner (eli5) | technical
```

## Code Generator

`/api/ai/generate` parses natural language into a compilable Arduino sketch:

```
"Turn on LED when distance is less than 10 cm"
→ senses: HC-SR04 + LED → #define pins, setup(), readDistance(), loop() with the condition
```

- Recognizes `distance/temperature/humidity/light/button` conditions and
  `led/servo/buzzer/motor/relay` outputs.
- Returns `{ok, code, components, pins, explanation, expected}`.
- `POST /api/ai/generate/save` saves the sketch into Projects.

**Safety policy:** Empire never flashes code to hardware automatically. Generated sketches are for
review in the Arduino IDE — flashing always requires your explicit action. Pin numbers must be
verified against your wiring.

## API

| Endpoint | Description |
|---|---|
| `POST /api/ai/chat` | `{message, mode?}` → `{answer, source, component}` |
| `GET /api/ai/history` | chat history |
| `POST /api/ai/generate` | `{description}` → sketch |
| `POST /api/ai/generate/save` | `{name?, description?, code}` → project id |

## LLM setup

```env
EMPIRE_AI_API_KEY=sk-...
EMPIRE_AI_BASE_URL=https://api.openai.com/v1
EMPIRE_AI_MODEL=gpt-4o-mini
EMPIRE_AI_TIMEOUT=30
```

The key is read server-side only; the API never exposes it.