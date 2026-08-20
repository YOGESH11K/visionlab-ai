import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { IconDownload, IconPause, IconPlay, IconTrash, IconX } from "./icons";

const SOURCES = ["ALL", "VISION", "HARDWARE", "SENSOR", "AI", "CAMERA", "SYSTEM", "ERROR", "ROBOTICS"];

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "var(--color-good)",
  INFO: "var(--color-accent)",
  WARNING: "var(--color-warn)",
  ERROR: "var(--color-bad)",
};

const SOURCE_COLOR: Record<string, string> = {
  VISION: "var(--color-accent)",
  HARDWARE: "var(--color-violet)",
  SENSOR: "var(--color-good)",
  AI: "var(--color-violet)",
  CAMERA: "var(--color-accent)",
  SYSTEM: "var(--color-ink-dim)",
  ERROR: "var(--color-bad)",
  ROBOTICS: "var(--color-accent)",
};

export function EventConsole({ height = 220 }: { height?: number }) {
  const { events, filters, toggleFilter, notify } = useStore();
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const capturedRef = useRef<typeof events>([]);

  const filtered = useMemo(() => {
    const base = paused ? capturedRef.current : events;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (e) =>
        e.source.toLowerCase().includes(q) ||
        e.event.toLowerCase().includes(q) ||
        (e.command ?? "").toLowerCase().includes(q) ||
        (e.status ?? "").toLowerCase().includes(q) ||
        (e.detail ?? "").toLowerCase().includes(q),
    );
  }, [events, search, paused]);

  if (paused && capturedRef.current.length === 0) {
    capturedRef.current = events;
  }

  const exportLogs = () => {
    const rows = filtered.map((e) => `${e.ts}\t${e.source}\t${e.event}\t${e.command ?? ""}\t${e.status}\t${e.detail ?? ""}`).join("\n");
    const blob = new Blob([`ts\tsource\tevent\tcommand\tstatus\tdetail\n${rows}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empire_events_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("success", `Exported ${filtered.length} events`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-line)] px-2 py-1.5">
        {SOURCES.map((s) => {
          const isAll = s === "ALL";
          const on = isAll ? filters.size === 0 : filters.has(s);
          return (
            <button
              key={s}
              onClick={() => {
                if (isAll) {
                  if (filters.size > 0) filters.forEach((f) => toggleFilter(f));
                  return;
                }
                toggleFilter(s);
              }}
              className={`mono rounded px-1.5 py-0.5 text-[9.5px] tracking-wide transition-colors ${
                on
                  ? "border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                  : "border border-[var(--color-line)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              }`}
            >
              {s}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <input
            className="input !py-0.5 !px-2 text-[10.5px]"
            placeholder="search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search events"
          />
          <button className="btn !px-1.5 !py-0.5 text-[10px]" onClick={() => setPaused((p) => !p)} title={paused ? "Resume" : "Pause"}>
            {paused ? <IconPlay size={11} /> : <IconPause size={11} />}
          </button>
          <button className="btn !px-1.5 !py-0.5 text-[10px]" onClick={exportLogs} title="Export logs"><IconDownload size={11} /></button>
          <button className="btn !px-1.5 !py-0.5 text-[10px]" onClick={() => capturedRef.current = []} title="Clear view"><IconTrash size={11} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ height }}>
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            {filtered.slice(-120).reverse().map((e, i) => {
              const color = STATUS_COLOR[e.status] ?? "var(--color-ink-dim)";
              return (
                <tr key={`${e.id ?? i}-${e.ts}`} className="border-b border-[var(--color-line)]/50 last:border-0 hover:bg-[var(--color-base-800)]/40">
                  <td className="mono whitespace-nowrap px-2 py-1 text-[var(--color-ink-faint)]">{e.ts}</td>
                  <td className="whitespace-nowrap px-1 py-1">
                    <span className="mono text-[9.5px] font-semibold" style={{ color: SOURCE_COLOR[e.source] ?? "var(--color-ink-dim)" }}>
                      {e.source}
                    </span>
                  </td>
                  <td className="px-1 py-1 text-[var(--color-ink)]">{e.event}</td>
                  <td className="mono whitespace-nowrap px-1 py-1 text-[var(--color-ink-dim)]">{e.command ?? ""}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    <span className="mono text-[9.5px] font-semibold" style={{ color }}>{e.status}</span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-[var(--color-ink-faint)]">
                  No events match. Start a gesture or send a command.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}