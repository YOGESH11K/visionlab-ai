import React, { useCallback, useEffect, useState } from "react";
import { robotics, RobotSequence, SequenceStep, RoboticsState } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Panel, Tag } from "../../components/ui";
import { IconPlus, IconFlow, IconPlay, IconTrash, IconX } from "../../components/icons";

type DraftStep = { id: number } & SequenceStep;

let stepId = 0;

const STEP_DEFS: { type: string; label: string; icon: string; fields: { key: string; label: string; type: string; options?: string[]; def: string }[] }[] = [
  {
    type: "move", label: "Move", icon: "M", fields: [
      { key: "action", label: "Direction", type: "select", options: ["FORWARD", "BACKWARD", "LEFT", "RIGHT"], def: "FORWARD" },
      { key: "speed", label: "Speed", type: "number", def: "120" },
      { key: "duration", label: "Duration (s)", type: "number", def: "1.0" },
    ],
  },
  {
    type: "wait", label: "Wait", icon: "T", fields: [
      { key: "seconds", label: "Seconds", type: "number", def: "2" },
    ],
  },
  {
    type: "turn", label: "Turn", icon: "↻", fields: [
      { key: "direction", label: "Direction", type: "select", options: ["LEFT", "RIGHT"], def: "LEFT" },
      { key: "duration", label: "Turn time (s)", type: "number", def: "0.6" },
    ],
  },
  {
    type: "read", label: "Read sensor", icon: "R", fields: [
      { key: "sensor", label: "Sensor", type: "select", options: ["distance", "temperature", "battery", "motion"], def: "distance" },
    ],
  },
  {
    type: "if", label: "Condition", icon: "?", fields: [
      { key: "sensor", label: "Sensor", type: "select", options: ["distance", "temperature", "battery", "motion"], def: "distance" },
      { key: "op", label: "Operator", type: "select", options: ["<", ">", "<=", ">="], def: "<" },
      { key: "threshold", label: "Threshold", type: "number", def: "20" },
    ],
  },
  {
    type: "stop", label: "Stop", icon: "■", fields: [
      { key: "note", label: "Note", type: "text", def: "" },
    ],
  },
  {
    type: "led", label: "LED", icon: "●", fields: [
      { key: "value", label: "State", type: "select", options: ["ON", "OFF"], def: "ON" },
    ],
  },
  {
    type: "servo", label: "Servo", icon: "◠", fields: [
      { key: "angle", label: "Angle", type: "number", def: "90" },
    ],
  },
  {
    type: "beep", label: "Beep", icon: "♪", fields: [],
  },
];

function StepEditor({ step, onChange, onRemove }: { step: DraftStep; onChange: (s: DraftStep) => void; onRemove: () => void }) {
  const def = STEP_DEFS.find((d) => d.type === step.type) ?? STEP_DEFS[1];
  return (
    <div className="rounded-lg border border-[var(--color-line)] p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="mono flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-[var(--color-accent)]/15 text-[10px]">{def.icon}</span>
          {def.label}
        </span>
        <button onClick={onRemove} className="text-[var(--color-ink-faint)] hover:text-[var(--color-bad)]" aria-label={`remove ${def.label}`}>
          <IconX size={13} />
        </button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {def.fields.map((f) => {
          const cur = (step[f.key] ?? f.def) as string;
          return (
            <label key={f.key} className="block">
              <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-ink-faint)]">{f.label}</span>
              {f.type === "select" ? (
                <select className="select mt-0.5 w-full !py-1 text-[11.5px]" value={cur} onChange={(e) => onChange({ ...step, [f.key]: e.target.value })}>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className="input mt-0.5 w-full !py-1 text-[11.5px]"
                  type={f.type}
                  value={cur}
                  onChange={(e) => onChange({ ...step, [f.key]: e.target.value })}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function SequenceEditor({ state }: { state: RoboticsState | null }) {
  const { notify } = useStore();
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [name, setName] = useState("My sequence");
  const [saved, setSaved] = useState<RobotSequence[]>([]);
  const [activeTab, setActiveTab] = useState<"editor" | "saved">("editor");
  const [running, setRunning] = useState(false);

  const loadSaved = useCallback(async () => {
    try {
      const r = await robotics.sequences();
      setSaved(r.sequences);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  useEffect(() => {
    setRunning(state?.sequence_running ?? false);
  }, [state?.sequence_running]);

  const addStep = (type: string) => {
    const def = STEP_DEFS.find((d) => d.type === type)!;
    const s: DraftStep = { id: ++stepId, type } as DraftStep;
    for (const f of def.fields) s[f.key] = f.def;
    setSteps((prev) => [...prev, s]);
  };

  const updateStep = (id: number, patch: DraftStep) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? patch : s)));
  };

  const removeStep = (id: number) => setSteps((prev) => prev.filter((s) => s.id !== id));

  const moveStep = (index: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (steps.length === 0) return;
    const r = await robotics.saveSequence(name, steps.map(({ id: _id, ...rest }) => rest));
    if (r.ok) {
      notify("success", `Sequence "${name}" saved`);
      loadSaved();
    }
  };

  const run = async () => {
    if (steps.length === 0) return;
    const r = await robotics.runSequence(steps.map(({ id: _id, ...rest }) => rest));
    if (r.ok) {
      notify("success", "Sequence running");
      setActiveTab("editor");
    } else {
      notify("error", r.error ?? "Cannot run sequence");
    }
  };

  const runSaved = async (seq: RobotSequence) => {
    const r = await robotics.runSequence(seq.steps);
    if (r.ok) notify("success", `Sequence "${seq.name}" running`);
    else notify("error", r.error ?? "Cannot run sequence");
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-3">
        <Panel
          title="Sequence Builder"
          right={
            <div className="flex items-center gap-2">
              <input className="input !py-1 text-[12px]" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn" onClick={save}><IconPlus size={12} /> Save</button>
              <button className="btn btn-primary" onClick={run} disabled={steps.length === 0 || running}>
                <IconPlay size={12} /> {running ? "Running…" : "Run"}
              </button>
              <button className="btn btn-danger" onClick={() => robotics.stopSequence()} disabled={!running}>Stop</button>
            </div>
          }
          bodyClassName="overflow-y-auto"
        >
          <div className="flex flex-wrap gap-1.5 p-3">
            {STEP_DEFS.map((d) => (
              <button key={d.type} className="btn !px-2.5 !py-1 text-[11.5px]" onClick={() => addStep(d.type)}>
                <span className="mono text-[10px]">{d.icon}</span> {d.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 px-3 pb-3">
            {steps.length === 0 && (
              <p className="py-8 text-center text-[12px] text-[var(--color-ink-faint)]">
                Build a sequence by adding steps. Example: MOVE FORWARD → WAIT 2s → TURN RIGHT → READ DISTANCE → IF distance &lt; 20cm → STOP.
              </p>
            )}
            {steps.map((s, i) => (
              <div key={s.id} className="relative">
                <div className="mb-1 flex items-center gap-2">
                  <span className="mono flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-accent)]/40 text-[9.5px] text-[var(--color-accent)]">
                    {i + 1}
                  </span>
                  <button className="text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]" onClick={() => moveStep(i, -1)} disabled={i === 0}>↑</button>
                  <button className="text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>↓</button>
                  {i < steps.length - 1 && <span className="ml-1 h-3 w-px bg-[var(--color-line-bright)]" />}
                </div>
                <StepEditor step={s} onChange={(patch) => updateStep(s.id, patch)} onRemove={() => removeStep(s.id)} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-1 border-b border-[var(--color-line)]">
          <button className={`tab-btn ${activeTab === "editor" ? "active" : ""}`} onClick={() => setActiveTab("editor")}>Builder</button>
          <button className={`tab-btn ${activeTab === "saved" ? "active" : ""}`} onClick={() => setActiveTab("saved")}>Saved ({saved.length})</button>
        </div>
        {activeTab === "saved" ? (
          <Panel title="Saved Sequences" bodyClassName="overflow-y-auto">
            <div className="flex flex-col gap-2 p-2">
              {saved.map((seq) => (
                <div key={seq.id} className="rounded-lg border border-[var(--color-line)] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">{seq.name}</span>
                    <div className="flex gap-1">
                      <button className="btn btn-primary !px-2 !py-0.5" onClick={() => runSaved(seq)}><IconPlay size={11} /></button>
                      <button className="btn !px-2 !py-0.5" onClick={async () => { await robotics.deleteSequence(seq.id); loadSaved(); }}><IconTrash size={11} /></button>
                    </div>
                  </div>
                  <p className="mono mt-1 text-[10px] text-[var(--color-ink-faint)]">
                    {seq.steps.map((s) => (s.type as string).toUpperCase()).join(" → ")}
                  </p>
                </div>
              ))}
              {saved.length === 0 && <p className="p-3 text-center text-[12px] text-[var(--color-ink-faint)]">No saved sequences yet.</p>}
            </div>
          </Panel>
        ) : (
          <Panel title="Automation Runtime" bodyClassName="p-3">
            <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-line)] p-3">
              <IconFlow size={16} className={running ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]"} />
              <div>
                <div className="mono text-[12px] font-bold text-[var(--color-ink)]">{running ? "SEQUENCE RUNNING" : "SEQUENCE IDLE"}</div>
                <p className="text-[11px] text-[var(--color-ink-dim)]">
                  {running ? "The safety validator checks every step. Emergency stop cancels immediately." : "Run a sequence to start the automation engine."}
                </p>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}