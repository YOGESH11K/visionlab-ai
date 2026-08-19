import React from "react";
import { useStore } from "../lib/store";

const SOURCES = ["VISION", "HARDWARE", "SENSOR", "AI", "CAMERA", "SYSTEM", "ERROR"];

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "var(--color-good)",
  INFO: "var(--color-accent)",
  WARNING: "var(--color-warn)",
  ERROR: "var(--color-bad)",
};

export function EventConsole({ height = 220 }: { height?: number }) {
  const { events, filters, toggleFilter } = useStore();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-[var(--color-line)] px-2 py-1.5">
        {SOURCES.map((s) => {
          const on = filters.has(s);
          return (
            <button
              key={s}
              onClick={() => toggleFilter(s)}
              className={`mono rounded px-1.5 py-0.5 text-[9.5px] tracking-wide ${
                on
                  ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                  : "border border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ height }}>
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            {events.slice(-80).reverse().map((e, i) => {
              const color = STATUS_COLOR[e.status] ?? "var(--color-ink-dim)";
              return (
                <tr key={i} className="border-b border-[var(--color-line)]/50 last:border-0">
                  <td className="mono whitespace-nowrap px-2 py-1 text-[var(--color-ink-faint)]">{e.ts}</td>
                  <td className="whitespace-nowrap px-1 py-1">
                    <span
                      className="mono text-[9.5px] font-semibold"
                      style={{ color: e.source === "ERROR" ? "var(--color-bad)" : "var(--color-accent)" }}
                    >
                      {e.source}
                    </span>
                  </td>
                  <td className="px-1 py-1 text-[var(--color-ink)]">{e.event}</td>
                  <td className="mono whitespace-nowrap px-1 py-1 text-[var(--color-ink-dim)]">{e.command ?? ""}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    <span className="mono text-[9.5px] font-semibold" style={{ color }}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-[var(--color-ink-faint)]">
                  No events yet — start a gesture or send a command.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}