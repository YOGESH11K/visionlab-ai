import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { useStore } from "../lib/store";
import { CodeBlock } from "../components/CodeBlock";
import { IconBook, IconChip, IconLayers, IconRobot, IconSparkles, IconTarget } from "../components/icons";

const CATEGORIES: { id: string; label: string; icon: React.FC<{ size?: number; className?: string }>; color: string }[] = [
  { id: "electronics", label: "Electronics", icon: IconChip, color: "var(--color-accent)" },
  { id: "arduino", label: "Arduino", icon: IconLayers, color: "var(--color-good)" },
  { id: "esp32", label: "ESP32", icon: IconChip, color: "var(--color-violet)" },
  { id: "robotics", label: "Robotics", icon: IconRobot, color: "var(--color-accent)" },
  { id: "ai", label: "AI + Computer Vision", icon: IconSparkles, color: "var(--color-violet)" },
];

interface Lesson {
  id: string;
  title: string;
  category: string;
  duration: string;
  concept: string;
  keyPoints: string[];
  interactive: { prompt: string; code: string; hint: string };
  challenge: string;
  miniProject: string;
}

const LESSONS: Lesson[] = [
  {
    id: "ohm-law", category: "electronics", title: "Ohm's Law, Voltage, Current & Resistance", duration: "8 min",
    concept: "Voltage (V) pushes charge, current (I) is the flow, resistance (R) opposes it. They are linked by V = I × R. A 220Ω resistor with an LED at 5V limits current to about (5-2)/220 ≈ 13mA.",
    keyPoints: ["V = I × R (Ohm's Law)", "Series: R total = R1 + R2", "Parallel: current splits, voltage equal", "LEDs need a current-limiting resistor"],
    interactive: {
      prompt: "Calculate the current through a 330Ω resistor powered at 9V (ignore LED drop).",
      code: "const voltage = 9; // volts\nconst resistance = 330; // ohms\nconst current = voltage / resistance; // amps\nconsole.log(`Current: ${(current * 1000).toFixed(1)} mA`);",
      hint: "Use I = V / R. 9 / 330 = 0.0272A ≈ 27mA.",
    },
    challenge: "Size the resistor for an LED running at 20mA from a 5V supply with a 2V LED forward drop.",
    miniProject: "Build a voltage divider using two resistors and measure the mid-point voltage.",
  },
  {
    id: "components-basics", category: "electronics", title: "Electronic Components", duration: "6 min",
    concept: "Components convert electrical energy into light (LED), heat (resistor), magnetism (coil), or information (IC). Know the symbol, polarity and typical ratings of each part before wiring it.",
    keyPoints: ["Resistors have color-code bands", "LEDs are polarized — long leg is anode", "Capacitors store charge; check max voltage", "Diodes conduct in one direction"],
    interactive: {
      prompt: "Identify the component: 4-band resistor brown-black-red-gold.",
      code: "const bands = { brown: 1, black: 0, red: 2 };\nconst value = (10 * bands.brown + bands.black) * 10 ** bands.red;\nconsole.log(`Resistor value: ${value} Ω (±5%)`);",
      hint: "First two bands are digits, third is multiplier, gold is 5% tolerance.",
    },
    challenge: "Which side of an LED is the cathode (negative) leg?",
    miniProject: "Use the Component Scanner to identify 5 components from your bench.",
  },
  {
    id: "arduino-gpio", category: "arduino", title: "Arduino GPIO & PWM", duration: "10 min",
    concept: "Arduino pins are GPIO — you set a pin HIGH or LOW to drive outputs, or read digital/analog inputs. PWM (pulse width modulation) simulates analog output by rapidly switching a pin on/off.",
    keyPoints: ["pinMode(pin, OUTPUT/INPUT)", "digitalWrite(pin, HIGH/LOW)", "analogWrite(pin, 0-255) = PWM", "analogRead(A0) returns 0-1023"],
    interactive: {
      prompt: "Fade an LED on pin 9 using PWM.",
      code: "void setup() { pinMode(9, OUTPUT); }\nvoid loop() {\n  for (int b = 0; b <= 255; b++) {\n    analogWrite(9, b);\n    delay(5);\n  }\n}",
      hint: "Pins 3, 5, 6, 9, 10, 11 support PWM on the Uno.",
    },
    challenge: "Blink an LED on pin 13 at 2Hz using digitalWrite and delay.",
    miniProject: "Build a traffic-light sequence with 3 LEDs.",
  },
  {
    id: "servo-control", category: "arduino", title: "Servo Motors & Control", duration: "8 min",
    concept: "Servos position precisely based on PWM pulse width. 1.0ms ≈ 0°, 1.5ms ≈ 90°, 2.0ms ≈ 180°. The Servo library hides the timing — you just set angle.",
    keyPoints: ["Servo myservo; then myservo.attach(9)", "myservo.write(angle) sets position", "Typical range 0-180°", "Power servos separately from the Arduino"],
    interactive: {
      prompt: "Sweep a servo from 0° to 180° and back.",
      code: "#include <Servo.h>\nServo s;\nvoid setup(){ s.attach(9); }\nvoid loop(){\n  for(int a=0; a<=180; a++){ s.write(a); delay(15); }\n  for(int a=180; a>=0; a--){ s.write(a); delay(15); }\n}",
      hint: "The Servo library is included with the Arduino IDE.",
    },
    challenge: "Why would a servo jitter? (Power brownout, noisy signal wire, or tight mechanical load.)",
    miniProject: "Control a servo using a potentiometer reading from A0.",
  },
  {
    id: "esp32-wifi", category: "esp32", title: "ESP32, Wi-Fi & Web Servers", duration: "10 min",
    concept: "The ESP32 is a dual-core MCU with built-in Wi-Fi and Bluetooth. It can run a web server and expose robot telemetry — a foundation for IoT robots.",
    keyPoints: ["WiFi.begin(ssid, password)", "ESP32 is 3.3V logic — use level shifters", "Dual core — run control on one core, network on the other", "Bluetooth Serial lets a phone drive the robot"],
    interactive: {
      prompt: "Connect an ESP32 to Wi-Fi and print the IP.",
      code: '#include <WiFi.h>\nconst char* ssid = "YOUR_SSID";\nconst char* pass = "YOUR_PASS";\nvoid setup(){\n  Serial.begin(115200);\n  WiFi.begin(ssid, pass);\n  while(WiFi.status() != WL_CONNECTED){ delay(500); }\n  Serial.println(WiFi.localIP());\n}',
      hint: "Use 115200 baud for ESP32 serial monitors.",
    },
    challenge: "What voltage are ESP32 GPIO pins? How do you safely interface 5V devices?",
    miniProject: "Build a web dashboard that toggles an LED over Wi-Fi.",
  },
  {
    id: "robot-control", category: "robotics", title: "Robot Drive & Control Systems", duration: "12 min",
    concept: "Differential drive robots move by setting each wheel's speed. Forward = both forward, turn = opposite wheels. Safety-first design always includes an emergency stop path.",
    keyPoints: ["Left/right motor speeds create all motions", "Encoders measure wheel rotation for odometry", "PID controllers smooth speed errors", "An emergency stop must bypass the control loop"],
    interactive: {
      prompt: "Compute motor speeds for a gentle right turn at half speed.",
      code: "const speed = 120; // half of max 255\nconst left = speed;   // fwd\nconst right = -speed; // rev => pivot right\nconsole.log({ left, right });",
      hint: "Opposite signs produce a pivot turn in place.",
    },
    challenge: "What happens to odometry if a wheel slips? How could you detect it?",
    miniProject: "Use the Robotics Control automation builder to make the robot trace a square.",
  },
  {
    id: "pid-control", category: "robotics", title: "PID Control", duration: "12 min",
    concept: "PID combines Proportional (react to error), Integral (eliminate steady error) and Derivative (dampen overshoot) terms to keep a system on target — used for line following and balancing.",
    keyPoints: ["Error = target - current", "Output = Kp·error + Ki·∫error + Kd·d(error)/dt", "Tune Kp first, then Ki, then Kd", "Too much Ki causes oscillation"],
    interactive: {
      prompt: "Implement a P controller that steers a line follower.",
      code: "double error = target - position;\ndouble steer = Kp * error; // P term\nmotorLeft  = base - steer;\nmotorRight = base + steer;",
      hint: "Start with Kp small (0.5-2) and increase until it tracks the line.",
    },
    challenge: "Describe the effect of too-high Kd on a balancing robot.",
    miniProject: "Tune a PID loop in simulation for the line follower template.",
  },
  {
    id: "vision-basics", category: "ai", title: "OpenCV & Computer Vision", duration: "10 min",
    concept: "Computer vision turns pixels into meaning. OpenCV provides filters, thresholds and contour detection. Empires' vision service processes frames to find hands and gestures.",
    keyPoints: ["Frames are arrays of pixels (BGR)", "Thresholding isolates regions of interest", "Contours describe object boundaries", "FPS matters more than resolution for real-time control"],
    interactive: {
      prompt: "Convert a frame to grayscale and threshold it.",
      code: "import cv2\nframe = cv2.imread('hand.jpg')\ngray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)\n_, mask = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)",
      hint: "BGR ordering matters — OpenCV is not RGB by default.",
    },
    challenge: "Why does brightness vary between frames and how does calibration help?",
    miniProject: "Drive the simulated gesture in Gesture Control and watch the detection confidence change.",
  },
  {
    id: "gesture-recog", category: "ai", title: "Hand Tracking & Gesture Recognition", duration: "10 min",
    concept: "MediaPipe finds 21 hand landmarks per hand. Finger states (extended/folded) are derived from joint angles, and gestures are classified with temporal smoothing for stability.",
    keyPoints: ["21 landmarks per hand", "Landmarks are normalized 0..1 coordinates", "Stability requires several matching frames", "Confidence thresholds reject unreliable detections"],
    interactive: {
      prompt: "Detect if the index finger is extended from landmarks.",
      code: "tip, pip = lm[8], lm[6]  # index tip & joint\nis_extended = tip[1] < pip[1]  # y is flipped\ngesture = 'POINT' if is_extended else 'FOLDED'",
      hint: "Compare the tip y to the pip joint y.",
    },
    challenge: "How would you add a new gesture such as 'wave'?",
    miniProject: "Map THUMB_UP to FORWARD in Gesture Control and drive the simulated robot.",
  },
];

interface QuizQuestion {
  key: string;
  question: string;
  options: string[];
  answer: string;
}

interface Suggestion {
  title: string;
  difficulty: string;
  components: string[];
  concept: string;
  code: string;
  upgrades: string[];
}

export function LearningLab() {
  const { notify } = useStore();
  const [category, setCategory] = useState("all");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [showSim, setShowSim] = useState(false);

  const [keys, setKeys] = useState<Record<string, { attempts: number; score: number; percent: number }>>({});
  const [quizNames, setQuizNames] = useState<Record<string, string>>({});
  const [quizKey, setQuizKey] = useState("");
  const [quiz, setQuiz] = useState<{ key: string; name: string; questions: QuizQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; total: number; percent: number } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const loadProgress = useCallback(async () => {
    try {
      const r = await api.get<{ keys: typeof keys; quizzes: Record<string, string> }>("/api/learning/progress");
      setKeys(r.keys);
      setQuizNames(r.quizzes);
      if (!quizKey) setQuizKey(Object.keys(r.quizzes)[0] ?? "");
    } catch { /* ignore */ }
  }, [quizKey]);

  useEffect(() => {
    loadProgress();
    api.get<{ suggestions: Suggestion[] }>("/api/learning/suggestions").then((s) => setSuggestions(s.suggestions)).catch(() => {});
  }, [loadProgress]);

  const visible = lesson === null ? LESSONS : LESSONS.filter((l) => l.id === lesson.id);
  const list = category === "all" ? LESSONS : LESSONS.filter((l) => l.category === category);

  const start = async (key: string) => {
    setQuizKey(key);
    setQuiz(null);
    setAnswers({});
    setResult(null);
    try {
      const r = await api.get<{ ok: boolean; key: string; name: string; questions: QuizQuestion[] }>(`/api/learning/quiz/${key}`);
      if (r.ok) setQuiz(r);
      else notify("warn", "Unknown quiz");
    } catch (e) {
      notify("error", `Load failed: ${e}`);
    }
  };

  const submit = async () => {
    if (!quiz) return;
    const answersArr = quiz.questions.map((q) => ({
      question: q.question,
      selected: answers[q.question] ?? "",
      correct: answers[q.question] === q.answer,
    }));
    try {
      const r = await api.post<{ ok: boolean; score: number; total: number; percent: number }>(`/api/learning/quiz/${quiz.key}/submit`, { answers: answersArr });
      setResult(r);
      notify(r.percent >= 70 ? "success" : "warn", `${r.score}/${r.total} — ${r.percent}%`);
      loadProgress();
    } catch (e) {
      notify("error", `Submit failed: ${e}`);
    }
  };

  const lessonFlow = (l: Lesson) => (
    <div className="flex flex-col gap-3">
      <Panel title={l.title} bodyClassName="p-3">
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{l.concept}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {l.keyPoints.map((k, i) => <Tag key={i} color="var(--color-accent)">{k}</Tag>)}
        </div>
      </Panel>

      <Panel title="Interactive Example" right={<Tag color="var(--color-good)">SIMULATION</Tag>} bodyClassName="p-3">
        <p className="mb-2 text-[12px] text-[var(--color-ink-dim)]">{l.interactive.prompt}</p>
        <button className="btn btn-primary mb-2" onClick={() => setShowSim((v) => !v)}>
          {showSim ? "Hide" : "Run simulation"}
        </button>
        {showSim && (
          <div className="pop-in">
            <CodeBlock code={l.interactive.code} language={l.category === "ai" ? "python" : "cpp"} maxHeight={220} />
            <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 p-2.5">
              <IconTarget size={13} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
              <span className="text-[11.5px] text-[var(--color-ink-dim)]">{l.interactive.hint}</span>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Challenge" bodyClassName="p-3">
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink)]">{l.challenge}</p>
      </Panel>

      <Panel title="Mini Project" bodyClassName="p-3">
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{l.miniProject}</p>
      </Panel>

      <button className="btn self-start" onClick={() => { setLesson(null); setShowSim(false); }}>← All lessons</button>
    </div>
  );

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Panel title="Categories" bodyClassName="p-2">
          <div className="flex flex-col gap-1">
            {[{ id: "all", label: "All lessons", icon: IconBook, color: "var(--color-accent)" }, ...CATEGORIES].map((c) => (
              <button
                key={c.id}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] ${category === c.id ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/30" : "text-[var(--color-ink-dim)] hover:bg-[var(--color-base-800)] border border-transparent"}`}
                onClick={() => { setCategory(c.id); setLesson(null); }}
              >
                <c.icon size={14} /> {c.label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Quizzes" bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-1 p-2">
            {Object.entries(quizNames).map(([key, name]) => {
              const p = keys[key];
              return (
                <button
                  key={key}
                  className={`rounded border px-2.5 py-2 text-left ${quizKey === key ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5" : "border-[var(--color-line)] hover:border-[var(--color-accent)]/40"}`}
                  onClick={() => start(key)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[var(--color-ink)]">{name}</span>
                    {p && <Tag color={p.percent >= 70 ? "var(--color-good)" : "var(--color-warn)"}>{p.percent}%</Tag>}
                  </div>
                  {p && <p className="mono mt-0.5 text-[10px] text-[var(--color-ink-faint)]">{p.attempts} attempts · {p.score} correct</p>}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {lesson ? (
          lessonFlow(lesson)
        ) : quiz ? (
          <Panel title={quiz.name} right={result && <Tag color={result.percent >= 70 ? "var(--color-good)" : "var(--color-warn)"}>{result.percent}%</Tag>} bodyClassName="overflow-y-auto">
            <div className="space-y-4 p-3">
              {result && (
                <div className={`rounded-md border px-3 py-2 text-[12.5px] ${result.percent >= 70 ? "border-[var(--color-good)]/40 bg-[var(--color-good)]/5 text-[var(--color-good)]" : "border-[var(--color-warn)]/40 bg-[var(--color-warn)]/5 text-[var(--color-warn)]"}`}>
                  Score {result.score}/{result.total} ({result.percent}%). {result.percent >= 70 ? "Keep it up!" : "Review and retry."}
                </div>
              )}
              {quiz.questions.map((q, i) => {
                const chosen = answers[q.question];
                return (
                  <div key={i} className="rounded-md border border-[var(--color-line)] p-3">
                    <p className="mb-2 text-[13px] font-medium text-[var(--color-ink)]">{q.question}</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {q.options.map((opt, oi) => {
                        const isChosen = chosen === opt;
                        const isCorrect = result && opt === q.answer;
                        const isWrongPick = result && isChosen && opt !== q.answer;
                        let cls = "border-[var(--color-line)] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]/50";
                        if (isCorrect) cls = "border-[var(--color-good)]/60 bg-[var(--color-good)]/5 text-[var(--color-good)]";
                        else if (isWrongPick) cls = "border-[var(--color-bad)]/60 bg-[var(--color-bad)]/5 text-[var(--color-bad)]";
                        else if (isChosen) cls = "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5 text-[var(--color-ink)]";
                        return (
                          <button key={oi} disabled={!!result} className={`rounded border px-2.5 py-1.5 text-left text-[12px] transition-colors ${cls}`} onClick={() => setAnswers((a) => ({ ...a, [q.question]: opt }))}>
                            {String.fromCharCode(65 + oi)}. {opt}
                            {isCorrect && <span className="ml-1.5">✓</span>}
                            {isWrongPick && <span className="ml-1.5 text-[var(--color-bad)]">✗</span>}
                          </button>
                        );
                      })}
                    </div>
                    {result && !!chosen && chosen !== q.answer && <p className="mt-2 text-[11.5px] text-[var(--color-bad)]">Correct answer: {q.answer}</p>}
                  </div>
                );
              })}
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={submit} disabled={!!result}>Submit answers</button>
                <button className="btn" onClick={() => { setAnswers({}); setResult(null); }}>Reset</button>
              </div>
            </div>
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            <Panel title="Lessons" right={<Tag color="var(--color-accent)">{list.length} lessons</Tag>} bodyClassName="overflow-y-auto">
              <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
                {list.map((l) => {
                  const cat = CATEGORIES.find((c) => c.id === l.category);
                  return (
                    <button
                      key={l.id}
                      onClick={() => setLesson(l)}
                      className="group rounded-lg border border-[var(--color-line)] p-3 text-left transition-all hover:border-[var(--color-accent)]/40 hover:shadow-[0_0_18px_rgba(34,211,238,0.08)]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: cat?.color ?? "var(--color-accent)" }}>
                          {cat?.icon && <cat.icon size={12} />} {cat?.label ?? l.category}
                        </span>
                        <span className="mono text-[9.5px] text-[var(--color-ink-faint)]">{l.duration}</span>
                      </div>
                      <div className="mt-1.5 text-[13px] font-bold text-[var(--color-ink)] group-hover:text-[var(--color-accent)]">{l.title}</div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--color-ink-dim)]">{l.concept}</p>
                      <div className="mono mt-2 flex items-center gap-1 text-[9.5px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                        learn → simulate → challenge → build
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Project ideas" bodyClassName="overflow-y-auto">
              <div className="flex flex-col gap-2 p-3">
                {suggestions.map((s) => (
                  <div key={s.title} className="rounded-md border border-[var(--color-line)] p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">{s.title}</span>
                      <Tag color={s.difficulty === "beginner" ? "var(--color-good)" : "var(--color-warn)"}>{s.difficulty}</Tag>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink-dim)]">{s.concept}</p>
                    <p className="mono mt-1 text-[10px] text-[var(--color-ink-faint)]">{s.components.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}