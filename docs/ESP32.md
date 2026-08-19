# ESP32 Notes

Empire supports the **ESP32 DevKit** as a board type (115200 baud default).

## Firmware

`arduino/firmware/empire_esp32/empire_esp32.ino` implements the same command protocol at
115200 baud. The firmware is 3.3V logic level.

## Critical: 3.3V vs 5V

- **Never feed 5V into an ESP32 GPIO** — the pins are 3.3V and can be damaged.
- The HC-SR04 **ECHO** output is 5V. On ESP32 use a **voltage divider** (e.g. 1k series + 2k to GND)
  or a level shifter before wiring ECHO to a GPIO.
- Most sensor modules (DHT22, OLED, LDR) work at 3.3V; power from the `3V3` pin.

## Connecting from Empire

1. Select board **ESP32 DevKit** in the Arduino/ESP32 workspace.
2. Set baud to **115200**.
3. Pick the COM port and connect. The same commands work (LED/PWM/servo/buzzer/relay/motor/SENSOR).

## PWM on ESP32

All GPIOs are exposed as PWM-capable in the Empire board definition, so `LEDn_PWM:120` works on any
LED you wire to a GPIO. Note that some GPIOs are strapping pins (e.g. GPIO0/GPIO2/GPIO12) and have
special behaviour at boot — prefer GPIO 4, 5, 18, 19, 21, 22 for new designs.