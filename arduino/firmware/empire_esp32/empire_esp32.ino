/*
 * EMPIRE firmware — ESP32 DevKit
 * -------------------------------
 * Same command protocol as the Arduino firmware (see empire_uno.ino).
 *
 * ESP32 specifics:
 *   - 3.3V logic: NEVER feed 5V into a GPIO. The HC-SR04 ECHO outputs 5V,
 *     so it MUST go through a voltage divider (e.g. 1k series + 2k to GND).
 *   - Default serial baud for this sketch is 115200.
 *
 * Pin map (edit to match your wiring):
 *   LED1..LED4 : GPIO2, GPIO4, GPIO5, GPIO18
 *   Servo      : GPIO19            Buzzer : GPIO21
 *   Relay      : GPIO22            DHT22  : GPIO23
 *   HC-SR04    : TRIG GPIO25  ECHO GPIO26 (with divider!)
 *   LDR        : GPIO34 (ADC1)     PIR   : GPIO27
 *   Pot        : GPIO35 (ADC1)
 */
#include <WiFi.h>
#include <Servo.h>
#include <DHT.h>

#define LED1 2
#define LED2 4
#define LED3 5
#define LED4 18
#define SERVO_PIN 19
#define BUZZER_PIN 21
#define RELAY_PIN 22
#define DHT_PIN 23
#define LDR_PIN 34
#define PIR_PIN 27
#define POT_PIN 35
#define TRIG 25
#define ECHO 26

Servo servo;
DHT dht(DHT_PIN, DHT22);

char buffer[80];
unsigned char bufLen = 0;
unsigned long lastPing = 0;

void respondOk(const char* id, const char* data = "") {
  Serial.print("OK ID=");
  Serial.print(id);
  Serial.print(" STATUS=SUCCESS");
  if (strlen(data)) { Serial.print(" DATA="); Serial.print(data); }
  Serial.println();
}
void respondErr(const char* id, const char* msg) {
  Serial.print("ERR ID=");
  Serial.print(id);
  Serial.print(" STATUS=ERROR MSG=");
  Serial.println(msg);
}

float readDistance() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long t = pulseIn(ECHO, HIGH, 30000);
  return t / 58.0;
}

void handle(const char* cmd, const char* id) {
  char c[80]; strncpy(c, cmd, 79); c[79] = 0;

  if (strcmp(c, "PING") == 0) { respondOk(id, "PONG"); return; }
  if (strcmp(c, "IDLE") == 0) { respondOk(id); return; }
  if (strcmp(c, "ALL_ON") == 0) { int pins[4] = {LED1, LED2, LED3, LED4}; for (int i = 0; i < 4; i++) digitalWrite(pins[i], HIGH); respondOk(id); return; }
  if (strcmp(c, "ALL_OFF") == 0) { int pins[4] = {LED1, LED2, LED3, LED4}; for (int i = 0; i < 4; i++) digitalWrite(pins[i], LOW); respondOk(id); return; }
  if (strcmp(c, "RELAY:ON") == 0) { digitalWrite(RELAY_PIN, HIGH); respondOk(id); return; }
  if (strcmp(c, "RELAY:OFF") == 0) { digitalWrite(RELAY_PIN, LOW); respondOk(id); return; }

  if (strncmp(c, "LED", 3) == 0) {
    int n = c[3] - '0';
    int pins[4] = {LED1, LED2, LED3, LED4};
    if (n < 1 || n > 4) { respondErr(id, "invalid_led"); return; }
    int pin = pins[n - 1];
    if (strstr(c, "_ON")) { digitalWrite(pin, HIGH); respondOk(id); return; }
    if (strstr(c, "_OFF")) { digitalWrite(pin, LOW); respondOk(id); return; }
    if (strstr(c, "_PWM:")) {
      int v = atoi(strstr(c, ":") + 1);
      if (v < 0 || v > 255) { respondErr(id, "invalid_value"); return; }
      ledcSetup(n + 3, 5000, 8);
      ledcAttachPin(pin, n + 3);
      ledcWrite(n + 3, v);
      respondOk(id);
      return;
    }
    respondErr(id, "unknown_led_command");
    return;
  }

  if (strncmp(c, "SERVO:", 6) == 0) {
    int v = atoi(c + 6);
    if (v < 0 || v > 180) { respondErr(id, "invalid_angle"); return; }
    servo.write(v); respondOk(id); return;
  }
  if (strncmp(c, "BUZZER:", 7) == 0) {
    int f = atoi(c + 7), ms = atoi(strstr(c + 7, ":") + 1);
    if (f <= 0) noTone(BUZZER_PIN); else tone(BUZZER_PIN, f, ms);
    respondOk(id); return;
  }

  if (strcmp(c, "SENSOR") == 0) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) { /* keep */ }
    float dist = readDistance();
    int light = analogRead(LDR_PIN);
    int motion = digitalRead(PIR_PIN) == HIGH ? 1 : 0;
    int pot = analogRead(POT_PIN);
    char data[96];
    snprintf(data, sizeof(data), "temp=%.1f,humidity=%.1f,distance=%.1f,light=%d,motion=%d,analog=%d",
             (isnan(t) ? 0.0 : t), (isnan(h) ? 0.0 : h), dist, light, motion, pot);
    respondOk(id, data);
    return;
  }
  respondErr(id, "unknown_command");
}

void readSerialLine() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') {
      buffer[bufLen] = 0;
      if (bufLen > 0) {
        char cmd[80], id[16] = "";
        if (strncmp(buffer, "COMMAND ", 8) == 0) {
          char* rest = buffer + 8;
          char* space = strchr(rest, ' ');
          if (space) { *space = 0; strncpy(cmd, rest, 79); char* p = strstr(space + 1, "ID="); if (p) strncpy(id, p + 3, 15); }
          else strncpy(cmd, rest, 79);
        } else strncpy(cmd, buffer, 79);
        cmd[79] = 0;
        handle(cmd, id);
      }
      bufLen = 0;
    } else if (bufLen < sizeof(buffer) - 1) buffer[bufLen++] = ch;
    else bufLen = 0;
  }
}

void setup() {
  Serial.begin(115200);
  int pins[4] = {LED1, LED2, LED3, LED4};
  for (int i = 0; i < 4; i++) { pinMode(pins[i], OUTPUT); ledcSetup(i + 3, 5000, 8); ledcAttachPin(pins[i], i + 3); }
  pinMode(BUZZER_PIN, OUTPUT); pinMode(RELAY_PIN, OUTPUT);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  servo.attach(SERVO_PIN); dht.begin();
}

void loop() {
  readSerialLine();
  if (millis() - lastPing > 2000) { lastPing = millis(); Serial.println("ACK IDLE"); }
  delay(5);
}