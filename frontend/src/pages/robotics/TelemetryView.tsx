import React, { useMemo, useState } from "react";
import { TelemetryEntry } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Panel, Tag } from "../../components/ui";
import { Sparkline } from "../../components/charts";
import { IconAlert, IconHistory } from "../../components/icons";

const PRIORITY = ["battery", "voltage", "current", "temperature", "distance", "ir", "motion", "motor_left", "motor_right", "servo", "accel_x", "accel_y", "accel_z", "gyro_z", "cpu", "memory"];

export function TelemetryView() {
  const { telemetry, robotics } = useStore();
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [paused, setPaused] = useState(false);

  const entries = useMemo(() => {
    const byKey = new Map(Object.entries(telemetry));
    const ordered: TelemetryEntry[] = [];
    for (const key of PRIORITY) {
      if (byKey.has(key)) {
        ordered.push(byKey.get(key)!);
        byKey.delete(key);
      }
    }
    for (const [, v] of byKey) ordered.push(v);
    return ordered;
  }, [telemetry]);

  // rolling history for sparklines (kept client-side, 60 samples)
  const lastKey = JSON.stringify(entries.map((e) => [e.key, e.value]));
  const prev = useMemo(() => history, [history]);
  React.useEffect(() => {
    if (paused) return;
    setHistory((h) => {
      const next: Record<string, number[]> = { ...h };
      for (const e of entries) {
        if (typeof e.value === "number") {
          next[e.key] = [...(next[e.key] ?? []).slice(-59), e.value];
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey, paused]);

  void prev;

  const stateFor = (e: TelemetryEntry) => {
    const n = typeof e.value === "number" ? e.value : 0;
    if (e.key === "battery" || e.key === "voltage" || e.key === "distance") {
      if (n < e.warn) return "warning";
    }
    if (e.key === "motor_left" || e.key === "motor_right" || e.key === "servo" || e.key === "current" || e.key === "cpu" || e.key === "memory") {
      if (Math.abs(n) > e.warn) return "warning";
    }
    return e.state ?? "normal";
  };

  const alertCount = entries.filter((e) => stateFor(e) === "warning").length;

  return (
    <Panel
      title="Sensor & Telemetry Telemetry"
      right={
        <div className="flex items-center gap-2">
          {alertCount > 0 && <Tag color="var(--color-warn)">{alertCount} warning</Tag>}
          <Tag color={paused ? "var(--color-warn)" : "var(--color-good)"}>{paused ? "PAUSED" : "LIVE"}</Tag>
          <button className="btn !px-2 !py-0.5" onClick={() => setPaused((p) => !p)}>
            <IconHistory size={12} /> {paused ? "resume" : "pause"}
          </button>
        </div>
      }
      bodyClassName="overflow-y-auto"
    >
      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((e) => {
          const warn = stateFor(e) === "warning";
          const border = warn ? "border-[var(--color-warn)]/50" : "border-[var(--color-line)]";
          const num = typeof e.value === "number" ? e.value : null;
          const min = e.min;
          const max = e.max;
          const pct = num != null ? Math.max(0, Math.min(1, (num - min) / (max - min || 1))) : 0;
          const spark = history[e.key] ?? [];
          return (
            <div key={e.key} className={`rounded-lg border ${border} p-3 transition-colors ${warn ? "bg-[var(--color-warn)]/5" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--color-ink)]">{e.label}</span>
                {warn && <IconAlert size={13} className="text-[var(--color-warn)]" />}
              </div>
              <div className="mono mt-1 text-[18px] font-bold leading-none" style={{ color: warn ? "var(--color-warn)" : "var(--color-accent)" }}>
                {typeof e.value === "number" ? e.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : e.value}
                <span className="ml-1 text-[11px] text-[var(--color-ink-faint)]">{e.unit}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-base-700)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(pct * 100)}%`,
                    background: warn ? "var(--color-warn)" : "var(--color-accent)",
                  }}
                />
              </div>
              <div className="mono mt-1 flex justify-between text-[9.5px] text-[var(--color-ink-faint)]">
                <span>min {min}</span>
                <span>max {max}</span>
              </div>
              {spark.length > 1 && <Sparkline values={spark} height={26} color={warn ? "#fbbf24" : "#22d3ee"} />}
            </div>
          );
        })}
      </div>
      <div className="px-3 pb-3">
        <p className="mono text-[10px] text-[var(--color-ink-faint)]">
          Device: {robotics?.device_name ?? "—"} · stream: /ws/robotics · thresholds from safety limits
        </p>
      </div>
    </Panel>
  );
}