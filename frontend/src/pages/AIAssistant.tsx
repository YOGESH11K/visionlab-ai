import React, { useState } from "react";
import { api } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { Markdownish } from "../components/CodeBlock";
import { useStore } from "../lib/store";
import { IconBrain } from "../components/icons";

const SUGGESTIONS = [
  "What is an HC-SR04?",
  "What are the pins of an LED?",
  "How does a servo work?",
  "How do I connect a DHT22?",
  "Why isn't my PIR sensor working?",
  "What projects can I build with an LDR?",
  "Explain like I'm a beginner: how does an ultrasonic sensor measure distance?",
];

interface Msg { role: "user" | "assistant"; text: string; source?: string }

export function AIAssistant() {
  const { notify } = useStore();
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

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[1fr_280px]">
      <Panel title="AI Assistant — verified hardware knowledge" bodyClassName="flex flex-col">
        <div className="mono flex-1 space-y-3 overflow-y-auto p-3" style={{ minHeight: 320 }}>
          {messages.length === 0 && (
            <div className="py-10 text-center">
              <IconBrain size={26} className="mx-auto mb-2 text-[var(--color-accent)]" />
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                Ask about any component in the verified database. The assistant prioritizes internal
                component data and never hallucinates hardware specs.
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
                <div className="mt-1">
                  <Markdownish text={m.text} />
                </div>
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
              placeholder='Try "how do I connect an HC-SR04?"'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
            />
            <button className="btn btn-primary" onClick={() => ask()} disabled={busy}>Ask</button>
          </div>
        </div>
      </Panel>

      <Panel title="Suggested questions" bodyClassName="overflow-y-auto">
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
            If the AI can't find a component, it says so — it never guesses specifications.
          </p>
        </div>
      </Panel>
    </div>
  );
}