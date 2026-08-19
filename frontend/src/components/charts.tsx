import React, { useMemo, useRef, useState } from "react";

// Lightweight SVG line/area chart (no external chart dependency).

export function LineChart({
  points,
  height = 150,
  width,
  unit = "",
  color = "#22d3ee",
  fill = true,
}: {
  points: { ts: string; value: number }[];
  height?: number;
  width?: number;
  unit?: string;
  color?: string;
  fill?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const w = width ?? wrapRef.current?.clientWidth ?? 600;

  const path = useMemo(() => {
    if (!points.length) return null;
    const visible = zoom
      ? points.filter((_, i) => i >= zoom[0] && i <= zoom[1])
      : points;
    const vals = visible.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const pad = 8;
    const innerH = height - pad * 2 - 6;
    const step = (w - 12) / Math.max(1, visible.length - 1);
    const coords = visible.map((p, i) => ({
      x: 6 + i * step,
      y: pad + innerH - ((p.value - min) / range) * innerH,
    }));
    const line = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(" ");
    const area = `${line} L${(coords[coords.length - 1]?.x ?? 6).toFixed(1)},${height - 6} L6,${height - 6} Z`;
    return { line, area, min, max, coords };
  }, [points, w, height, zoom]);

  if (!points.length) {
    return (
      <div className="flex h-[100px] items-center justify-center text-[11px] text-[var(--color-ink-faint)]">
        No readings yet
      </div>
    );
  }

  const last = points[points.length - 1];
  const firstVisible = zoom ? points[zoom[0]] : points[0];
  const lastVisible = zoom ? points[zoom[1]] : last;

  return (
    <div ref={wrapRef} className="relative">
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} className="select-none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="6"
            x2={w - 6}
            y1={height * f}
            y2={height * f}
            stroke="var(--color-line)"
            strokeDasharray="3 4"
          />
        ))}
        {path && fill && <path d={path.area} fill={color} opacity="0.12" />}
        {path && <path d={path.line} fill="none" stroke={color} strokeWidth="1.6" />}
        {path &&
          path.coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="1.8" fill={color} />
          ))}
      </svg>
      <div className="flex justify-between px-1 text-[10px] text-[var(--color-ink-faint)]">
        <span>
          {firstVisible.ts} — {lastVisible.ts}
        </span>
        <span className="mono">
          {last.value}
          {unit}
        </span>
      </div>
      {points.length > 40 && (
        <button
          className="absolute right-0 -top-1 text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]"
          onClick={() => setZoom(null)}
        >
          {zoom ? "reset zoom" : ""}
        </button>
      )}
    </div>
  );
}

export function Gauge({ value, min, max, label, unit, color = "#22d3ee" }: {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const r = 30;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width="92" height="64" viewBox="0 0 92 64">
        <path
          d={`M 12 56 A 34 34 0 0 1 80 56`}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d={`M 12 56 A 34 34 0 0 1 80 56`}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${circ * 0.5} ${circ}`}
          strokeDashoffset={circ * 0.5 - circ * 0.5 * pct}
          style={{ transition: "stroke-dashoffset 0.4s" }}
        />
        <text x="46" y="52" textAnchor="middle" className="mono" fill="var(--color-ink)" fontSize="12" fontWeight="600">
          {value}
          {unit}
        </text>
      </svg>
      <div className="panel-title">{label}</div>
    </div>
  );
}

export function Sparkline({ values, color = "#22d3ee", height = 28 }: {
  values: number[];
  color?: string;
  height?: number;
}) {
  const w = 120;
  const pts = values.slice(-60);
  if (!pts.length) return <div style={{ height }} className="text-[10px] text-[var(--color-ink-faint)]">—</div>;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const step = w / Math.max(1, pts.length - 1);
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - 4 - ((v - min) / range) * (height - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}