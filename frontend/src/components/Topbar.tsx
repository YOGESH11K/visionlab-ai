import React from "react";
import { useStore } from "../lib/store";
import { IconAlert, IconBell, IconX } from "./icons";

function Pill({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" | "idle" }) {
  const color =
    tone === "good"
      ? "var(--color-good)"
      : tone === "warn"
        ? "var(--color-warn)"
        : tone === "bad"
          ? "var(--color-bad)"
          : "var(--color-ink-faint)";
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-base-850)] px-2.5 py-1">
      <span className="panel-title">{label}</span>
      <span className="mono text-[10.5px] font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

export function Topbar({ current }: { current: string }) {
  const { status, toasts, dismissToast } = useStore();
  const s = status?.status;

  const tone = (v?: string): "good" | "warn" | "bad" | "idle" => {
    if (!v) return "idle";
    if (v === "CONNECTED" || v === "ONLINE" || v === "VIRTUAL" || v === "SIMULATION") return v === "SIMULATION" ? "warn" : "good";
    if (v === "DISCONNECTED" || v === "OFFLINE") return "bad";
    return "idle";
  };

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-base-950)]/80 px-4">
      <div className="flex items-center gap-2">
        <span className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-dim)]">
          Workspace
        </span>
        <span className="text-[13px] font-semibold text-[var(--color-ink)]">{current}</span>
      </div>

      <div className="flex items-center gap-2">
        <Pill label="CAM" value={s?.camera ?? "…"} tone={tone(s?.camera)} />
        <Pill label="ARDUINO" value={s?.arduino ?? "…"} tone={tone(s?.arduino)} />
        <Pill label="ESP32" value={s?.esp32 ?? "…"} tone={tone(s?.esp32)} />
        <Pill label="AI" value={s?.ai ?? "…"} tone={tone(s?.ai)} />
        {status?.gesture && status.gesture !== "NO_HAND" && (
          <Pill label="GESTURE" value={status.gesture} tone="good" />
        )}
        <div className="relative ml-1 text-[var(--color-ink-faint)]">
          <IconBell size={16} />
          {toasts.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-bad)] text-[8px] font-bold text-black">
              {toasts.length}
            </span>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed right-4 top-14 z-50 flex w-80 flex-col gap-1.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="panel flex items-start gap-2 border-l-2 px-3 py-2"
            style={{
              borderLeftColor:
                t.kind === "error" ? "var(--color-bad)" : t.kind === "warn" ? "var(--color-warn)" : t.kind === "success" ? "var(--color-good)" : "var(--color-accent)",
            }}
          >
            <IconAlert size={13} className="mt-0.5 shrink-0 text-[var(--color-ink-faint)]" />
            <span className="flex-1 text-[11.5px] leading-snug text-[var(--color-ink-dim)]">{t.text}</span>
            <button onClick={() => dismissToast(t.id)} className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
              <IconX size={11} />
            </button>
          </div>
        ))}
      </div>
    </header>
  );
}