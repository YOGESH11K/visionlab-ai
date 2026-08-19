/*
 * EMPIRE firmware — Arduino Uno / Nano / Mega
 * ------------------------------------------
 * Implements the Empire command protocol:
 *
 *   PING                -> OK PONG
 *   LED1_ON..LED4_ON    -> OK
 *   LED1_OFF..LED4_OFF  -> OK
 *   ALL_ON / ALL_OFF    -> OK
 *   LEDn_PWM:0..255     -> OK
 *   SERVO:0..180        -> OK
 *   BUZZER:freq:ms      -> OK   (freq 0 = off)
 *   RELAY:ON / RELAY:OFF-> OK
 *   MOTOR:-255..255     -> OK   (negative = reverse)
 *   SENSOR              -> OK DATA=temp=..,humidity=..,distance=..,light=..,motion=..,analog=..
 *   IDLE                -> ACK  (keep-alive)
 *
 * Responses are prefixed OK/ERR and always echo the command ID when supplied:
 *   client: COMMAND LED3_ON ID=1042
 *   device: OK ID=1042 STATUS=SUCCESS
 *
 * Default pin map (edit to match your wiring):
 *   LED1..LED4 : D8..D11        Servo : D5
 *   Buzzer     : D6             Relay : D7
 *   Motor PWM  : D3  Motor DIR  : D4
 *   DHT22 DATA : D2             LDR   : A0
 *   PIR OUT    : A1             Pot   : A2
 *   HC-SR04    : TRIG D12  ECHO D13
 */
#include <Servo.h>
#include <DHT.h>

// --- pins ---------------------------------------------------------------
#define LED1 8
#define LED2 9
#define LED3 10
#define LED4 11
#define SERVO_PIN 5
#define BUZZER_PIN 6
#define RELAY_PIN 7
#define MOTOR_PWM 3
#define MOTOR_DIR 4
#define DHT_PIN 2
#define LDR_PIN A0
#define PIR_PIN A1
#define POT_PIN A2
#define TRIG 12
#define ECHO 13

Servo servo;
DHT dht(DHT_PIN, DHT22);

char buffer[80];
unsigned char bufLen = 0;

unsigned long lastPing = 0;
float temp = 24.5, humidity = 55.0, distance = 32.0;
int light = 720, motion = 0, analogVal = 512;

void setup() {
  Serial.begin(9600);
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(LED3, OUTPUT);
  pinMode(LED4, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(MOTOR_PWM, OUTPUT);
  pinMode(MOTOR_DIR, OUTPUT);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(DHT_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);
  pinMode(POT_PIN, INPUT);
  servo.attach(SERVO_PIN);
  dht.begin();
  servo.write(90);
}

void respondOk(const char* id, const char* data = "") {
  Serial.print("OK ID=");
  Serial.print(id);
  Serial.print(" STATUS=SUCCESS");
  if (strlen(data)) {
    Serial.print(" DATA=");
    Serial.print(data);
  }
  Serial.println();
}

void respondErr(const char* id, const char* msg) {
  Serial.print("ERR ID=");
  Serial.print(id);
  Serial.print(" STATUS=ERROR MSG=");
  Serial.println(msg);
}

float readDistance() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long t = pulseIn(ECHO, HIGH, 30000);
  return t / 58.0;
}

void handleCommand(const char* cmd, const char* id) {
  char c[80];
  strncpy(c, cmd, 79);
  c[79] = 0;

  if (strcmp(c, "PING") == 0) { respondOk(id, "PONG"); return; }
  if (strcmp(c, "IDLE") == 0) { respondOk(id); return; }
  if (strcmp(c, "ALL_ON") == 0) {
    for (int i = LED1; i <= LED4; i++) digitalWrite(i, HIGH);
    respondOk(id); return;
  }
  if (strcmp(c, "ALL_OFF") == 0) {
    for (int i = LED1; i <= LED4; i++) digitalWrite(i, LOW);
    respondOk(id); return;
  }
  if (strcmp(c, "RELAY:ON") == 0) { digitalWrite(RELAY_PIN, HIGH); respondOk(id); return; }
  if (strcmp(c, "RELAY:OFF") == 0) { digitalWrite(RELAY_PIN, LOW); respondOk(id); return; }

  // LEDn_ON / LEDn_OFF
  if (strncmp(c, "LED", 3) == 0) {
    int n = c[3] - '0';
    int pin = n >= 1 && n <= 4 ? LED1 + (n - 1) : -1;
    if (pin < 0) { respondErr(id, "invalid_led"); return; }
    if (strstr(c, "_ON") != NULL) { digitalWrite(pin, HIGH); respondOk(id); }
    else if (strstr(c, "_OFF") != NULL) { digitalWrite(pin, LOW); respondOk(id); }
    else { respondErr(id, "unknown_led_command"); }
    return;
  }

  // LEDn_PWM:value
  if (strncmp(c, "LED", 3) == 0 && strstr(c, "_PWM:") != NULL) {
    int n = c[3] - '0';
    int pin = n >= 1 && n <= 4 ? LED1 + (n - 1) : -1;
    int val = atoi(strstr(c, ":") + 1);
    if (pin < 0 || val < 0 || val > 255) { respondErr(id, "invalid_value"); return; }
    analogWrite(pin, val);
    respondOk(id);
    return;
  }

  // SERVO:angle
  if (strncmp(c, "SERVO:", 6) == 0) {
    int v = atoi(c + 6);
    if (v < 0 || v > 180) { respondErr(id, "invalid_angle"); return; }
    servo.write(v);
    respondOk(id);
    return;
  }

  // BUZZER:freq:ms
  if (strncmp(c, "BUZZER:", 7) == 0) {
    int freq = atoi(c + 7);
    int ms = atoi(strstr(c + 7, ":") + 1);
    if (freq <= 0) { noTone(BUZZER_PIN); }
    else { tone(BUZZER_PIN, freq, ms); }
    respondOk(id);
    return;
  }

  // MOTOR:speed (-255..255)
  if (strncmp(c, "MOTOR:", 6) == 0) {
    int v = atoi(c + 6);
    if (v < -255 || v > 255) { respondErr(id, "invalid_speed"); return; }
    digitalWrite(MOTOR_DIR, v >= 0 ? LOW : HIGH);
    analogWrite(MOTOR_PWM, abs(v));
    respondOk(id);
    return;
  }

  // SENSOR
  if (strcmp(c, "SENSOR") == 0) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) temp = t;
    if (!isnan(h)) humidity = h;
    distance = readDistance();
    light = analogRead(LDR_PIN);
    motion = digitalRead(PIR_PIN) == HIGH ? 1 : 0;
    analogVal = analogRead(POT_PIN);

    char data[96];
    snprintf(data, sizeof(data),
             "temp=%.1f,humidity=%.1f,distance=%.1f,light=%d,motion=%d,analog=%d",
             temp, humidity, distance, light, motion, analogVal);
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
        // format: COMMAND <CMD> ID=<id>   OR  <CMD>
        if (strncmp(buffer, "COMMAND ", 8) == 0) {
          char* rest = buffer + 8;
          char* space = strchr(rest, ' ');
          if (space) {
            *space = 0;
            strncpy(cmd, rest, 79);
            char* idp = strstr(space + 1, "ID=");
            if (idp) strncpy(id, idp + 3, 15);
          } else {
            strncpy(cmd, rest, 79);
          }
        } else {
          strncpy(cmd, buffer, 79);
        }
        cmd[79] = 0;
        handleCommand(cmd, id);
      }
      bufLen = 0;
    } else if (bufLen < sizeof(buffer) - 1) {
      buffer[bufLen++] = ch;
    } else {
      bufLen = 0;  // overflow guard
    }
  }
}

void loop() {
  readSerialLine();
  // send SENSOR data periodically so remote monitors stay fresh
  if (millis() - lastPing > 2000) {
    lastPing = millis();
    Serial.println("ACK IDLE");
  }
  delay(5);
}