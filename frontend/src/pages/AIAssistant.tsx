import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { Markdownish } from "../components/CodeBlock";
import { useStore } from "../lib/store";
import { IconBrain, IconRobot, IconCpu, IconCamera, IconCode, IconLayers } from "../components/icons";

const SUGGESTIONS = [
  "Why is my ultrasonic sensor returning 0?",
  "Generate ESP32 code for a line-following robot.",
  "Why is my servo jittering?",
  "Design a circuit for an obstacle avoiding robot.",
  "Explain this Arduino code.",
  "Find possible causes of this sensor error.",
  "What pins do I need for an HC-SR04 on an Arduino Uno?",
];

interface Msg { role: "user" | "assistant"; text: string; source?: string }

function ContextChip({ icon, label, value, tone = "idle" }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "good" | "warn" | "idle" }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-dim)]">
        {icon} {label}
      </span>
      <span className="mono text-[10.5px] font-semibold" style={{ color: tone === "good" ? "var(--color-good)" : tone === "warn" ? "var(--color-warn)" : "var(--color-ink)" }}>
        {value}
      </span>
    </div>
  );
}

export function AIAssistant() {
  const { notify, status, robotics, telemetry } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("auto");
  const [busy, setBusy] = useState(false);

  const ask = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: q }]);
    try {
      const r = await api.post<{ answer: string; source: string; component?: string }>("/api/ai/chat", { message: q, mode });
      setMessages((m) => [...m, { role: "assistant", text: r.answer, source: r.source }]);
    } catch (e) {
      notify("error", `AI request failed: ${e}`);
      setMessages((m) => [...m, { role: "assistant", text: "Request failed. Check the backend connection." }]);
    } finally {
      setBusy(false);
    }
  };

  const distance = telemetry.distance?.value;

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title="Robotics Engineering Copilot" bodyClassName="flex flex-col">
        <div className="mono flex-1 space-y-3 overflow-y-auto p-3" style={{ minHeight: 320 }}>
          {messages.length === 0 && (
            <div className="py-10 text-center">
              <IconBrain size={26} className="mx-auto mb-2 text-[var(--color-accent)]" />
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                Your AI engineering copilot. Ask about Arduino, ESP32, Python, C/C++, electronics, sensors, robotics,
                computer vision, circuit debugging and hardware troubleshooting. Answers use verified internal knowledge
                and never hallucinate specs.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-md border px-3 py-2 ${
                  m.role === "user"
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10"
                    : "border-[var(--color-line)] bg-[var(--color-base-850)]"
                }`}
              >
                {m.source && (
                  <Tag color={m.source === "llm" ? "var(--color-violet)" : "var(--color-good)"}>
                    {m.source === "llm" ? "LLM" : "verified"}
                  </Tag>
                )}
                <div className="mt-1"><Markdownish text={m.text} /></div>
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="mono rounded border border-[var(--color-line)] bg-[var(--color-base-850)] px-3 py-2 text-[11px] text-[var(--color-ink-faint)]">
                thinking…
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-[var(--color-line)] p-2">
          <div className="mb-2 flex gap-1.5">
            {["auto", "beginner", "technical"].map((m) => (
              <button
                key={m}
                className={`mono rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  mode === m ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]" : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                }`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder='Try "generate ESP32 code for a line-following robot"'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              aria-label="Ask the AI assistant"
            />
            <button className="btn btn-primary" onClick={() => ask()} disabled={busy}>Ask</button>
          </div>
        </div>
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel title="Live Context" bodyClassName="p-3">
          <p className="mb-2 text-[11px] text-[var(--color-ink-faint)]">
            The copilot is context-aware — it knows your current robotics state, connected hardware and sensors.
          </p>
          <div className="flex flex-col gap-1.5">
            <ContextChip icon={<IconRobot size={12} />} label="Robot" value={robotics?.device_name ?? "—"} tone={robotics?.connected ? "good" : "warn"} />
            <ContextChip icon={<IconCpu size={12} />} label="Board" value={status?.hardware_board ?? "—"} />
            <ContextChip icon={<IconCamera size={12} />} label="Camera" value={status?.vision_mode ?? "—"} tone={status?.vision_mode === "camera" ? "good" : "warn"} />
            <ContextChip icon={<IconLayers size={12} />} label="Mode" value={robotics?.mode ?? "—"} />
            <ContextChip icon={<IconCode size={12} />} label="Distance" value={typeof distance === "number" ? `${distance} cm` : "—"} tone={Number(distance) < 25 ? "warn" : "idle"} />
          </div>
        </Panel>

        <Panel title="Suggested prompts" bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-1.5 p-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="rounded-md border border-[var(--color-line)] px-2.5 py-2 text-left text-[11.5px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-ink)]"
                onClick={() => ask(s)}
              >
                {s}
              </button>
            ))}
            <p className="mono mt-2 text-[10px] text-[var(--color-ink-faint)]">
              If the AI can't answer, it says so — it never guesses specifications.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}