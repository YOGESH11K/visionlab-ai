import React, { useEffect, useState } from "react";
import { robotics, RoboticsState } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Panel, Tag } from "../../components/ui";
import { IconAlert, IconBolt, IconShield, IconCheck } from "../../components/icons";

const LIMIT_FIELDS: { key: string; label: string; unit: string; min: number; max: number; hint: string }[] = [
  { key: "max_motor_speed", label: "Max motor speed", unit: "", min: 0, max: 255, hint: "Hard cap on any speed command" },
  { key: "max_servo_angle", label: "Max servo angle", unit: "°", min: 0, max: 180, hint: "Angles above this are rejected" },
  { key: "max_runtime_s", label: "Max runtime", unit: "s", min: 0, max: 3600, hint: "0 = unlimited; commands stop after limit" },
  { key: "battery_min", label: "Battery minimum", unit: "%", min: 0, max: 100, hint: "Movement blocked below this charge" },
  { key: "sensor_min_distance", label: "Min obstacle distance", unit: "cm", min: 0, max: 200, hint: "Auto-stop before collision" },
  { key: "auto_stop_after_s", label: "Auto-stop delay", unit: "s", min: 1, max: 300, hint: "Continuous actions auto-stop after N s" },
];

export function SafetyPanel({ state }: { state: RoboticsState | null }) {
  const { notify, refreshRobotics } = useStore();
  const emergency = state?.emergency ?? false;
  const [limits, setLimits] = useState<Record<string, number>>({});

  useEffect(() => {
    if (state?.limits) setLimits({ ...state.limits });
  }, [state?.limits]);

  const engage = async () => {
    await robotics.emergency(false);
    notify("error", "EMERGENCY STOP ENGAGED — all motors stopped, commands blocked");
    refreshRobotics();
  };

  const reset = async () => {
    await robotics.emergency(true);
    notify("success", "Safety system re-armed");
    refreshRobotics();
  };

  const saveLimits = async () => {
    const r = await robotics.setLimits(limits);
    if (r.ok) {
      notify("success", "Safety limits saved");
      refreshRobotics();
    } else {
      notify("error", r.error ?? "Invalid limits");
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-3">
        <Panel
          title="Emergency Stop"
          right={<Tag color={emergency ? "var(--color-bad)" : "var(--color-good)"}>{emergency ? "ENGAGED" : "ARMED"}</Tag>}
          bodyClassName="p-4"
        >
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={emergency ? reset : engage}
              className={`btn-emergency active h-36 w-36 ${emergency ? "active" : ""}`}
              aria-label={emergency ? "Reset emergency stop" : "Engage emergency stop"}
            >
              <div className="flex flex-col items-center gap-1">
                {emergency ? <IconCheck size={30} /> : <IconBolt size={30} />}
                <span className="text-[13px] tracking-widest">{emergency ? "RESET" : "STOP"}</span>
              </div>
            </button>
            <p className="max-w-sm text-center text-[11.5px] leading-relaxed text-[var(--color-ink-dim)]">
              {emergency ? (
                <>
                  <span className="mono font-bold text-[var(--color-bad)]">EMERGENCY STATE</span> — motors stopped, command
                  queue cancelled. Explicitly press again to re-arm the safety system before driving.
                </>
              ) : (
                <>
                  Press to <span className="mono text-[var(--color-ink)]">immediately stop all motors</span>, cancel active
                  movement and disable queued actions. An explicit reset is required to resume.
                </>
              )}
            </p>
          </div>
        </Panel>

        <Panel title="Safety Log" bodyClassName="p-3">
          <div className="flex items-start gap-2 rounded-md border border-[var(--color-line)] p-3">
            <IconShield size={15} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
            <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-dim)]">
              The <span className="mono text-[var(--color-ink)]">Safety Validator</span> sits between every command source
              (manual, gesture, AI, sequence) and the command queue. Unsafe commands are <span className="mono text-[var(--color-warn)]">blocked with a reason</span> —
              they are never silently executed. AI output can never reach hardware without validation.
            </p>
          </div>
          {emergency && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/10 p-3">
              <IconAlert size={14} className="mt-0.5 shrink-0 text-[var(--color-bad)]" />
              <p className="text-[11.5px] text-[var(--color-ink-dim)]">
                <span className="mono font-bold text-[var(--color-bad)]">All commands blocked.</span> Gesture and AI actions
                that require movement are rejected until reset.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Safety Limits" bodyClassName="overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">
          {LIMIT_FIELDS.map((f) => {
            const val = limits[f.key] ?? 0;
            const isBoolish = f.max <= 1;
            return (
              <div key={f.key} className="rounded-md border border-[var(--color-line)] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[var(--color-ink)]">{f.label}</span>
                  <span className="mono text-[12px] font-bold text-[var(--color-accent)]">
                    {val}{f.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={isBoolish ? 1 : 1}
                  value={val}
                  onChange={(e) => setLimits((l) => ({ ...l, [f.key]: Number(e.target.value) }))}
                  className="mt-2 w-full"
                />
                <p className="mt-1 text-[10px] leading-snug text-[var(--color-ink-faint)]">{f.hint}</p>
              </div>
            );
          })}
          <button className="btn btn-primary" onClick={saveLimits}>Save safety limits</button>
          <button className="btn" onClick={async () => { await robotics.setLimits({}); refreshRobotics(); }}>
            Reset to defaults
          </button>
        </div>
      </Panel>
    </div>
  );
}