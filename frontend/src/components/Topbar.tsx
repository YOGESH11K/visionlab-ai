import React from "react";
import { useStore } from "../lib/store";
import { IconAlert, IconBell, IconBolt, IconBrain, IconRobot, IconWifi, IconX } from "./icons";

type Tone = "good" | "warn" | "bad" | "idle";

function tone(v?: string): Tone {
  if (!v) return "idle";
  if (v === "CONNECTED" || v === "ONLINE" || v === "VIRTUAL" || v === "SUCCESS") return v === "VIRTUAL" ? "warn" : "good";
  if (v === "SIMULATION" || v === "AVAILABLE" || v === "WARNING") return "warn";
  if (v === "DISCONNECTED" || v === "OFFLINE" || v === "ERROR") return "bad";
  return "idle";
}

function StatusItem({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  const t = tone(value);
  const color =
    t === "good" ? "var(--color-good)" : t === "warn" ? "var(--color-warn)" : t === "bad" ? "var(--color-bad)" : "var(--color-ink-faint)";
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-base-850)] px-2.5 py-1"
      title={`${label}: ${value ?? "unknown"}`}
    >
      <span className="text-[var(--color-ink-faint)]">{icon}</span>
      <span className="panel-title">{label}</span>
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${t === "good" ? "pulse-good" : ""}`}
          style={{ backgroundColor: color, boxShadow: t === "good" ? `0 0 6px ${color}` : "none" }}
        />
        <span className="mono text-[10px] font-semibold" style={{ color }}>
          {value ?? "…"}
        </span>
      </span>
    </div>
  );
}

export function Topbar({ current }: { current: string }) {
  const { status, robotics, toasts, dismissToast } = useStore();
  const s = status?.status;

  const isSim = status?.vision_mode === "simulation";
  const connected = robotics?.connected;
  const em = robotics?.emergency;

  return (
    <header className="relative flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-base-950)]/80 px-3 backdrop-blur md:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="mono hidden text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] sm:block">
          Module
        </span>
        <span className="truncate text-[13px] font-bold text-[var(--color-ink)]">{current}</span>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto md:gap-2">
        <StatusItem icon={<IconBolt size={11} />} label="SYS" value={s?.backend} />
        <StatusItem
          icon={<span className="h-2 w-2 rounded-full" style={{ background: "var(--color-accent)" }} />}
          label="CAM"
          value={isSim ? "SIM" : s?.camera}
        />
        <StatusItem icon={<IconWifi size={11} />} label="NET" value={connected ? robotics?.device_type.toUpperCase() : "OFF"} />
        <StatusItem icon={<IconRobot size={11} />} label="ROBOT" value={connected ? (robotics?.device_name ?? "ON") : "OFF"} />
        <StatusItem icon={<IconBrain size={11} />} label="AI" value={s?.ai} />
        {robotics?.emergency && (
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--color-bad)]/60 bg-[var(--color-bad)]/15 px-2.5 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-bad)]" />
            <span className="mono text-[10px] font-bold tracking-widest text-[var(--color-bad)]">EMERGENCY</span>
          </div>
        )}
        <div className="relative ml-1 text-[var(--color-ink-faint)]" aria-label={`${toasts.length} notifications`}>
          <IconBell size={16} />
          {toasts.length > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-bad)] text-[8px] font-bold text-black">
              {toasts.length}
            </span>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed right-4 top-14 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-1.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pop-in panel flex items-start gap-2 border-l-2 px-3 py-2"
            style={{
              borderLeftColor:
                t.kind === "error" ? "var(--color-bad)" : t.kind === "warn" ? "var(--color-warn)" : t.kind === "success" ? "var(--color-good)" : "var(--color-accent)",
            }}
          >
            <IconAlert size={13} className="mt-0.5 shrink-0 text-[var(--color-ink-faint)]" />
            <span className="flex-1 text-[11.5px] leading-snug text-[var(--color-ink-dim)]">{t.text}</span>
            <button onClick={() => dismissToast(t.id)} className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]" aria-label="Dismiss">
              <IconX size={11} />
            </button>
          </div>
        ))}
      </div>
    </header>
  );
}