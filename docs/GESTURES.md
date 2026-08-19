# Gestures

## Recognized gestures

| Gesture | Definition |
|---|---|
| `ZERO_FINGERS` / `ONE` / `TWO` / `THREE` / `FOUR_FINGERS` | number of extended non-thumb fingers |
| `OPEN_PALM` | all 5 fingers extended |
| `FIST` | all 5 folded |
| `THUMB_UP` / `THUMB_DOWN` | thumb up/down |
| `PEACE` | index + middle extended (hold) |
| `POINT` | index extended (hold) |
| `PINCH` | thumb + index tips close |
| `SWIPE_LEFT` / `SWIPE_RIGHT` | hand moves across the frame |

## Stability (why gestures don't spam)

The engine only fires after a gesture is *stable*:

- **Confidence threshold** — low-confidence frames ignored (default 0.6).
- **Temporal smoothing** — the same gesture must appear for 3 consecutive frames.
- **Debounce** — fast 1-2-3-2-3 alternation never produces spurious commands.
- **Cooldown** — minimum interval between commands (default 0.8 s).
- **Sustained hold** — `POINT`/`PEACE` require holding the pose ~2 s, so the finger-count demo
  (1-4 fingers → LEDs) works without accidentally triggering the special gestures.

## Mapping gestures → hardware

The **Gesture Control** workspace lets you bind any gesture to any action:

| action_type | command produced |
|---|---|
| `led_on` / `led_off` | `LEDn_ON/OFF`, `ALL_ON/OFF` |
| `pwm` | `LEDn_PWM:value` |
| `servo` | `SERVO:value` |
| `buzzer` | `BUZZER:value:200` |
| `relay` | `RELAY:ON/OFF` |
| `motor` | `MOTOR:value` |
| `custom` | raw target text (e.g. `MODE_NEXT`) |

Mappings persist to SQLite and can be reset to defaults. Default demo:

```
0 fingers → ALL LEDs OFF    3 fingers → LED 3 ON
1 finger  → LED 1 ON        4 fingers → LED 4 ON
2 fingers → LED 2 ON        5 fingers → ALL LEDs ON
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/gestures/mappings` | all mappings (incl. computed command) |
| `GET /api/gestures/mappings/{gesture}` | one mapping |
| `PUT /api/gestures/mappings/{gesture}` | update `{action_type,target,value,enabled}` |
| `POST /api/gestures/reset` | restore defaults |
| `GET /api/gestures/action-types` | valid action types |

## Integration

A *stable* gesture triggers `GestureMappingService.find_enabled(gesture)` →
`mapping_to_command(mapping)` → `HardwareManager.send_command(...)`. The command and its result
appear in the Event Console.