/*
 * EMPIRE — minimal gesture demo firmware
 * ---------------------------------------
 * Only LEDs. Ideal for demonstrating the vision -> gesture -> LED pipeline.
 * LED1..LED4 on D8..D11. Protocol subset: PING, LEDn_ON/OFF, ALL_ON/OFF,
 * LEDn_PWM:value, IDLE.
 */
#define LED1 8
#define LED2 9
#define LED3 10
#define LED4 11

char buffer[64];
unsigned char bufLen = 0;

void respondOk(const char* id) {
  Serial.print("OK ID=");
  Serial.print(id);
  Serial.println(" STATUS=SUCCESS");
}
void respondErr(const char* id, const char* msg) {
  Serial.print("ERR ID=");
  Serial.print(id);
  Serial.print(" STATUS=ERROR MSG=");
  Serial.println(msg);
}

void handle(const char* cmd, const char* id) {
  if (strcmp(cmd, "PING") == 0) { respondOk(id); return; }
  if (strcmp(cmd, "IDLE") == 0) { respondOk(id); return; }
  if (strcmp(cmd, "ALL_ON") == 0) { for (int i = LED1; i <= LED4; i++) digitalWrite(i, HIGH); respondOk(id); return; }
  if (strcmp(cmd, "ALL_OFF") == 0) { for (int i = LED1; i <= LED4; i++) digitalWrite(i, LOW); respondOk(id); return; }

  if (strncmp(cmd, "LED", 3) == 0) {
    int n = cmd[3] - '0';
    int pin = (n >= 1 && n <= 4) ? LED1 + n - 1 : -1;
    if (pin < 0) { respondErr(id, "invalid_led"); return; }
    if (strstr(cmd, "_ON")) { digitalWrite(pin, HIGH); respondOk(id); return; }
    if (strstr(cmd, "_OFF")) { digitalWrite(pin, LOW); respondOk(id); return; }
    if (strstr(cmd, "_PWM:")) {
      int v = atoi(strstr(cmd, ":") + 1);
      if (v < 0 || v > 255) { respondErr(id, "invalid_value"); return; }
      analogWrite(pin, v);
      respondOk(id);
      return;
    }
  }
  respondErr(id, "unknown_command");
}

void readSerialLine() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') {
      buffer[bufLen] = 0;
      if (bufLen > 0) {
        char cmd[64], id[16] = "";
        if (strncmp(buffer, "COMMAND ", 8) == 0) {
          char* rest = buffer + 8;
          char* space = strchr(rest, ' ');
          if (space) { *space = 0; strncpy(cmd, rest, 63); char* p = strstr(space + 1, "ID="); if (p) strncpy(id, p + 3, 15); }
          else strncpy(cmd, rest, 63);
        } else {
          strncpy(cmd, buffer, 63);
        }
        cmd[63] = 0;
        handle(cmd, id);
      }
      bufLen = 0;
    } else if (bufLen < sizeof(buffer) - 1) {
      buffer[bufLen++] = ch;
    } else {
      bufLen = 0;
    }
  }
}

void setup() {
  Serial.begin(9600);
  for (int i = LED1; i <= LED4; i++) pinMode(i, OUTPUT);
}

void loop() {
  readSerialLine();
  delay(5);
}