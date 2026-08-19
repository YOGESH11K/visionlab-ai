# Arduino Firmware

Firmware lives in `arduino/firmware/`.

| Sketch | Board | Purpose |
|---|---|---|
| `empire_uno/empire_uno.ino` | Uno/Nano/Mega | Full command protocol (LEDs, PWM, servo, buzzer, relay, motor, sensors, PING) |
| `gesture_leds/gesture_leds.ino` | Uno/Nano | Minimal LED-only demo driven by gestures via serial |
| `empire_esp32/empire_esp32.ino` | ESP32 DevKit | Full protocol at 115200 baud + 3.3V notes |

## Upload

1. Open the sketch in the Arduino IDE (or `arduino-cli`).
2. Select your board and COM port.
3. Upload, then connect Empire → **Arduino/ESP32** → select the port → **Connect**.
4. Use the Serial Monitor panel to send raw commands, or gestures to drive the board.

## Protocol (shared with Virtual Arduino)

Text lines, newline-terminated. The host may send:

```
COMMAND LED3_ON ID=1042
```

and the firmware replies:

```
OK ID=1042 STATUS=SUCCESS
ERR ID=1042 STATUS=ERROR MSG=unknown_command
```

Commands: `PING`, `LED1_ON..LED4_ON/OFF`, `ALL_ON/OFF`, `LEDn_PWM:0..255`, `SERVO:0..180`,
`BUZZER:freq:ms`, `RELAY:ON/OFF`, `MOTOR:-255..255`, `SENSOR`, `IDLE`.
`SENSOR` returns `DATA=temp=24.5,humidity=55.0,distance=32.0,light=720,motion=0,analog=512`.

## Wiring reference (Uno)

| Output | Pin |
|---|---|
| LEDs (x4) | D13, D12, D11, D10 (each with 220 Ω resistor) |
| Servo signal | D9 |
| Buzzer | D8 |
| Relay IN | D7 |
| Motor driver signal | D9 |

Verify pin numbers against your own schematic — the sketches use `#define`s at the top so they are
easy to re-map.