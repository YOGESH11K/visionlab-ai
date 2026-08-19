# Hardware Module

## Overview

The hardware manager abstracts "a board" behind a single command protocol. It works with a real
Arduino/ESP32 over serial **or** the built-in Virtual Arduino simulator — the UI and gesture
pipeline are identical in both modes. When no serial device is connected, the manager transparently
falls back to Virtual Arduino and every screen clearly shows **VIRTUAL**.

## Boards

| Name | MCU | Default baud | PWM pins |
|---|---|---|---|
| Arduino Uno | ATmega328P | 9600 | 3,5,6,9,10,11 |
| Arduino Nano | ATmega328P | 9600 | 3,5,6,9,10,11 |
| Arduino Mega | ATmega2560 | 9600 | 2-13 |
| ESP32 DevKit | ESP32-WROOM | 115200 | all GPIO |

## Command protocol

Plain-text lines, newline-terminated. Client may prefix with `COMMAND <CMD> ID=<id>`; the device
echoes the ID so responses can be correlated.

```
PING                          → PONG
LED1_ON / LED1_OFF / LED2..4  → OK
ALL_ON / ALL_OFF              → OK
LED2_PWM:120                  → OK   (0–255)
SERVO:90                      → OK   (0–180)
BUZZER:1000:200               → OK   (freq Hz, duration ms; 0 = off)
RELAY:ON / RELAY:OFF          → OK
MOTOR:120                     → OK   (−255..255)
SENSOR                        → OK DATA=temp=24.5,humidity=55,distance=32,light=720,motion=0,analog=512
IDLE                          → ACK  (keep-alive)
```

Responses:

```
OK  ID=1042 STATUS=SUCCESS [DATA=...]
ERR ID=1042 STATUS=ERROR MSG=unknown_command
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/hardware/state` | full board state (LEDs, servo, buzzer, relay, motor, sensors, mode) |
| `GET /api/hardware/ports` | list serial ports |
| `GET /api/hardware/boards` | supported boards |
| `POST /api/hardware/connect` | `{port?, baud?, board?}` — empty port → Virtual Arduino |
| `POST /api/hardware/disconnect` | disconnect |
| `POST /api/hardware/command` | `{command: "LED3_ON"}` → `{ok, status, data, id, latency_ms}` |
| `GET /api/hardware/ping` | round-trip latency |

## Virtual Arduino

Simulates LED/pwm/servo/buzzer/relay/motor state plus drifting sensors (temp, humidity, distance,
light, motion, analog) so the Sensor Monitor and dashboard are alive without hardware. State is
exposed via `/api/hardware/state`; commands mutate it identically to the firmware.

## Serial troubleshooting

- Windows driver issues → check `devmgmt.msc` and the port list in the UI.
- Wrong baud → board default is 9600 (ESP32 firmware uses 115200 — match it in the UI).
- Replug the board → press **Connect** again; a failed serial connect falls back to Virtual and
  logs an event, so the app never dies.