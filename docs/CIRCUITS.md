# Circuit Builder

## What it does

A pin-level circuit editor backed by a teaching-grade validator. Place components (Arduino Uno,
ESP32, LED, resistor, HC-SR04, DHT22, LDR, PIR, servo, buzzer, DC motor, relay, pot, push button,
OLED, LCD), connect pins, then run validation.

## Catalog

`GET /api/circuits/components` returns the pin catalog:

```json
{
  "arduino_uno": { "name": "Arduino Uno",
    "pins": [ {"name":"5V","role":"power","voltage":"5V"}, {"name":"GND","role":"ground","voltage":"0V"}, … ] },
  "led": { "name": "LED", "pins": [ {"name":"Anode (+)","role":"positive"}, … ] },
  …
}
```

## Validate

```json
POST /api/circuits/validate
{
  "components": [ { "id": "uno1", "type": "arduino_uno" }, { "id": "led1", "type": "led" } ],
  "connections": [
    { "id": 1, "from": { "comp": "uno1", "pin": "D13" }, "to": { "comp": "led1", "pin": "Anode (+)" } }
  ]
}
```

Response:

```json
{
  "status": "WARNINGS",           // MATCH | WARNINGS | INVALID
  "summary": "1 connections checked, 0 invalid, 3 warnings",
  "connections": [ { "connection_id": 1, "status": "GREEN", "message": "Valid connection" } ],
  "warnings": [ "uno1 (Arduino Uno): missing GND connection", "led1: LED cathode must connect to GND" ]
}
```

## Rules checked

- Duplicate connections → RED
- Connections referencing missing components → RED
- Invalid pin names → RED
- 5V ↔ 3.3V mismatch → YELLOW
- Like-polarity pins joined → YELLOW
- Missing GND / VCC per component → warning
- LED anode unconnected / cathode not grounded → warnings

## Limitations

This is a **teaching-grade sanity checker, not an electrical simulator** — it does not model
current, impedance, or timing. Always confirm against datasheets and your schematic before
powering anything.