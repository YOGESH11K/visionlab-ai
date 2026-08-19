import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, SensorSeries, wsUrl } from "../lib/api";
import { Panel, Tag, SectionLabel } from "../components/ui";
import { LineChart, Sparkline } from "../components/charts";
import { IconDownload, IconTrash } from "../components/icons";
import { useStore } from "../lib/store";

const RANGES = [
  { key: "minute", label: "Last minute" },
  { key: "5min", label: "Last 5 min" },
  { key: "hour", label: "Last hour" },
  { key: "today", label: "Today" },
];

export function SensorMonitor() {
  const { notify } = useStore();
  const [range, setRange] = useState("5min");
  const [series, setSeries] = useState<SensorSeries[]>([]);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async (r: string) => {
    try {
      const data = await api.get<{ series: SensorSeries[] }>(`/api/sensors/history?range_key=${r}`);
      setSeries(data.series);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load(range);
    const t = setInterval(() => !paused && load(range), 5000);
    return () => clearInterval(t);
  }, [range, paused, load]);

  useEffect(() => {
    const ws = new WebSocket(wsUrl("/ws/sensors"));
    wsRef.current = ws;
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data);
        if (data.values) {
          const latest: Record<string, number> = {};
          for (const key of Object.keys(data.values)) {
            latest[key] = data.values[key].value;
          }
          setLive(latest);
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, []);

  const exportData = async (fmt: string) => {
    const r = await api.get<{ content: string; filename: string }>(`/api/sensors/export?fmt=${fmt}&range_key=${range}`);
    const blob = new Blob([r.content], { type: fmt === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.filename;
    a.click();
    URL.revokeObjectURL(url);
    notify("success", `Exported ${fmt.toUpperCase()}`);
  };

  const clear = async () => {
    await api.post("/api/sensors/clear");
    setSeries([]);
    notify("info", "Readings cleared");
  };

  const sample = async () => {
    await api.post("/api/sensors/sample");
    load(range);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <Panel
        title="Sensor Monitor"
        right={
          <div className="flex items-center gap-1.5">
            <select className="select" value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <button className="btn" onClick={sample}>Sample now</button>
            <button className="btn" onClick={() => exportData("csv")}>
              <IconDownload size={13} /> CSV
            </button>
            <button className="btn" onClick={() => exportData("json")}>
              <IconDownload size={13} /> JSON
            </button>
            <button className="btn btn-danger" onClick={clear}>
              <IconTrash size={13} />
            </button>
          </div>
        }
        bodyClassName="overflow-y-auto"
      >
        <div className="grid gap-3 p-3 lg:grid-cols-2">
          {series.map((s) => {
            const lastVal = live[s.key] ?? s.points[s.points.length - 1]?.value;
            return (
              <div key={s.key} className="rounded-md border border-[var(--color-line)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">
                    {s.sensor.toUpperCase()}{" "}
                    <span className="text-[var(--color-ink-faint)]">· {s.channel}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Tag>{s.unit}</Tag>
                    <Tag color={s.stats.trend === "rising" ? "var(--color-good)" : s.stats.trend === "falling" ? "var(--color-bad)" : "var(--color-ink-faint)"}>
                      {s.stats.trend}
                    </Tag>
                  </div>
                </div>
                <LineChart points={s.points} unit={s.unit} height={120} />
                <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                  {[
                    ["NOW", lastVal ?? "—"],
                    ["MIN", s.stats.min],
                    ["MAX", s.stats.max],
                    ["AVG", s.stats.avg],
                    ["N", s.stats.count],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded border border-[var(--color-line)]/60 py-1">
                      <div className="panel-title">{k}</div>
                      <div className="mono text-[11px] text-[var(--color-ink)]">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {series.length === 0 && (
            <div className="col-span-2 py-8 text-center text-[12px] text-[var(--color-ink-faint)]">
              No readings in this range yet. Sample now, or wait for the automatic sampler.
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Live Sensor Feed" bodyClassName="overflow-y-auto">
        <div className="p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            <button className="btn" onClick={() => setPaused((p) => !p)}>
              {paused ? "Resume live" : "Pause live"}
            </button>
            <span className="mono text-[10.5px] self-center text-[var(--color-ink-faint)]">
              {paused ? "PAUSED — showing last snapshot" : "LIVE via WebSocket"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {Object.entries(live).map(([key, v]) => (
              <div key={key} className="rounded-md border border-[var(--color-line)] px-3 py-2">
                <div className="panel-title">{key.split(".")[1]}</div>
                <div className="mono text-[15px] font-semibold text-[var(--color-accent)]">{v}</div>
                <Sparkline values={series.find((s) => s.key === key)?.points.map((p) => p.value) ?? []} />
              </div>
            ))}
            {Object.keys(live).length === 0 && (
              <p className="text-[12px] text-[var(--color-ink-faint)]">Waiting for sensor samples…</p>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}