import React from "react";

export function Panel({
  title,
  children,
  right,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`panel flex flex-col ${className}`}>
      {title !== undefined && (
        <div className="panel-header">
          <span className="panel-title">{title}</span>
          {right}
        </div>
      )}
      <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export function StatusDot({
  status,
  pulse = false,
}: {
  status: "good" | "warn" | "bad" | "idle";
  pulse?: boolean;
}) {
  const color =
    status === "good" ? "var(--color-good)" : status === "warn" ? "var(--color-warn)" : status === "bad" ? "var(--color-bad)" : "var(--color-ink-faint)";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${pulse ? "pulse-good" : ""}`}
      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

export function Tag({
  color,
  children,
}: {
  color?: string;
  children: React.ReactNode;
}) {
  const bg = color ?? "var(--color-base-700)";
  return (
    <span
      className="mono inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{
        color: color ?? "var(--color-ink)",
        backgroundColor: color ? `${color}22` : bg,
        border: `1px solid ${color ?? "var(--color-line)"}`,
      }}
    >
      {children}
    </span>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "var(--color-good)"
      : tone === "warn"
        ? "var(--color-warn)"
        : tone === "bad"
          ? "var(--color-bad)"
          : "var(--color-ink)";
  return (
    <div className="px-3 py-2.5">
      <div className="panel-title">{label}</div>
      <div className="mono mt-1 text-[15px] font-semibold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--color-ink-dim)]">{sub}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel-title px-3 pt-3 pb-1">{children}</div>
  );
}