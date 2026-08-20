import React, { useState } from "react";
import { api } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { CodeBlock } from "../components/CodeBlock";
import { useStore } from "../lib/store";
import { IconDownload, IconSparkles, IconCode, IconChip, IconWrench, IconCheck, IconDoc } from "../components/icons";

const BOARDS = [
  { id: "arduino-uno", label: "Arduino Uno", chip: "ATmega328P", lang: "cpp" },
  { id: "arduino-mega", label: "Arduino Mega", chip: "ATmega2560", lang: "cpp" },
  { id: "arduino-nano", label: "Arduino Nano", chip: "ATmega328P", lang: "cpp" },
  { id: "esp32", label: "ESP32", chip: "ESP32-WROOM", lang: "cpp" },
  { id: "raspberry-pi", label: "Raspberry Pi (Python)", chip: "BCM2837", lang: "python" },
  { id: "generic-python", label: "Generic Python Robotics", chip: "cross-platform", lang: "python" },
];

const TEMPLATES: { name: string; desc: string }[] = [
  { name: "LED controller", desc: "Blink / PWM LED control" },
  { name: "Servo controller", desc: "Servo sweep and positioning" },
  { name: "Ultrasonic obstacle detector", desc: "HC-SR04 distance sensing" },
  { name: "Line follower", desc: "IR-based line tracking robot" },
  { name: "Bluetooth robot", desc: "Serial Bluetooth control" },
  { name: "Wi-Fi robot", desc: "ESP32 web-controlled rover" },
  { name: "Gesture controlled robot", desc: "Vision-to-motor pipeline" },
  { name: "Smart home", desc: "Relay + sensor automation" },
  { name: "Sensor dashboard", desc: "Multi-sensor telemetry" },
  { name: "Robotic arm", desc: "Multi-servo arm control" },
  { name: "Autonomous rover", desc: "Obstacle avoiding rover" },
];

interface GenResult {
  ok: boolean;
  code: string;
  components?: string[];
  pins?: string[];
  explanation?: string;
  expected?: string;
  error?: string;
}

export function CodeGenerator() {
  const { notify } = useStore();
  const [desc, setDesc] = useState("");
  const [board, setBoard] = useState("arduino-uno");
  const [result, setResult] = useState<GenResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");

  const selected = BOARDS.find((b) => b.id === board)!;

  const generate = async (text?: string) => {
    const d = (text ?? desc).trim();
    if (!d) return;
    setBusy(true);
    setAction("Generating");
    try {
      const r = await api.post<GenResult>("/api/ai/generate", { description: d, board: selected.label });
      setResult(r);
      if (!r.ok) notify("warn", r.error ?? "Could not generate");
      else notify("success", "Code generated");
    } catch (e) {
      notify("error", `Generation failed: ${e}`);
    } finally {
      setBusy(false);
      setAction("");
    }
  };

  const runAction = async (kind: string) => {
    if (!result?.ok) return;
    setAction(kind === "doc" ? "Writing docs" : kind === "wiring" ? "Generating wiring" : `${kind}ing code`);
    try {
      const r = await api.post<{ ok: boolean; code?: string; explanation?: string }>("/api/ai/generate", {
        description: `${kind === "explain" ? "Explain this code: " : kind === "optimize" ? "Optimize this code: " : kind === "debug" ? "Debug this code: " : ""}${result.code}`,
      });
      setResult({ ...result, code: r.code ?? result.code, explanation: r.explanation ?? result.explanation });
      notify("success", `Code ${kind} complete`);
    } catch (e) {
      notify("error", `${kind} failed: ${e}`);
    } finally {
      setAction("");
    }
  };

  const save = async () => {
    if (!result?.ok) return;
    try {
      const r = await api.post<{ id: number }>("/api/ai/generate/save", {
        name: "Generated project",
        description: desc,
        code: result.code,
      });
      notify("success", `Saved as project #${r.id} (Projects tab)`);
    } catch (e) {
      notify("error", `Save failed: ${e}`);
    }
  };

  const download = () => {
    if (!result?.ok) return;
    const ext = selected.lang === "python" ? "py" : "ino";
    const blob = new Blob([result.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empire_generated.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid h-full gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Panel title="Configure & Generate" bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-3 p-3">
            <label className="block">
              <span className="panel-title">Target board</span>
              <select className="select mt-1 w-full" value={board} onChange={(e) => setBoard(e.target.value)}>
                {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.label} — {b.chip}</option>)}
              </select>
            </label>

            <textarea
              className="input min-h-[80px] w-full resize-y"
              placeholder="Describe the behaviour in plain English…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <button className="btn btn-primary self-start" onClick={() => generate()} disabled={busy}>
              <IconSparkles size={13} /> {busy ? `${action}…` : "Generate code"}
            </button>

            <div>
              <div className="panel-title mb-1.5">Templates</div>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    title={t.desc}
                    className="rounded border border-[var(--color-line)] px-2 py-1.5 text-left text-[11px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-ink)]"
                    onClick={() => { setDesc(t.desc + " for " + selected.label); generate(t.desc); }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Actions" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["Explain code", "explain", IconCode],
              ["Optimize", "optimize", IconWrench],
              ["Debug", "debug", IconCheck],
              ["Generate wiring", "wiring", IconChip],
              ["Documentation", "doc", IconDoc],
            ] as const).map(([label, kind, Icon]) => (
              <button key={kind} className="btn" onClick={() => runAction(kind)} disabled={!result?.ok || busy}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <p className="mono mt-2 text-[10px] text-[var(--color-ink-faint)]">
            Generated code is for review in your IDE — Empire never flashes hardware automatically.
          </p>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        {result?.ok ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="var(--color-accent)">{selected.label}</Tag>
              <Tag>{selected.lang}</Tag>
              {result.components?.map((c) => <Tag key={c} color="var(--color-violet)">{c}</Tag>)}
              {result.pins?.map((p) => <Tag key={p}>{p}</Tag>)}
            </div>
            <Panel title={`Generated ${selected.lang.toUpperCase()} Sketch`} bodyClassName="overflow-y-auto">
              <div className="p-3">
                <CodeBlock code={result.code} language={selected.lang} maxHeight={420} />
              </div>
            </Panel>
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Explanation" bodyClassName="p-3">
                <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{result.explanation}</p>
              </Panel>
              <Panel title="Expected behaviour" bodyClassName="p-3">
                <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{result.expected}</p>
              </Panel>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={save}>Save to Projects</button>
              <button className="btn" onClick={download}><IconDownload size={13} /> Download .{selected.lang === "python" ? "py" : "ino"}</button>
            </div>
          </>
        ) : (
          <Panel title="Generated code will appear here" bodyClassName="flex items-center justify-center">
            <p className="px-8 text-center text-[12px] text-[var(--color-ink-faint)]">
              Select a board, describe a behaviour (or pick a template), and Empire produces a commented, wiring-aware
              sketch with required libraries, pin configuration, error handling and safety considerations.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}