import React, { useEffect, useState } from "react";
import { api, HardwareState } from "../lib/api";
import { useStore } from "../lib/store";
import { Panel, StatusDot, Tag } from "../components/ui";
import { EventConsole } from "../components/EventConsole";
import {
  IconAlert, IconBolt, IconCamera, IconCpu, IconFlow, IconGrid, IconHand, IconRobot, IconShield, IconSparkles, IconTarget,
} from "../components/icons";

function StatCard({ icon, label, value, sub, tone = "default" }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" | "default";
}) {
  const color = tone === "good" ? "var(--color-good)" : tone === "warn" ? "var(--color-warn)" : tone === "bad" ? "var(--color-bad)" : "var(--color-accent)";
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-base-900)]/60 p-3">
      <div className="flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="panel-title">{label}</span>
      </div>
      <div className="mono mt-1.5 text-[16px] font-bold" style={{ color: color === "var(--color-accent)" ? "var(--color-ink)" : color }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--color-ink-dim)]">{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const { status, robotics, telemetry, refreshRobotics } = useStore();
  const [hw, setHw] = useState<HardwareState | null>(null);

  useEffect(() => {
    api.get<HardwareState>("/api/hardware/state").then(setHw).catch(() => {});
    const t = setInterval(() => {
      api.get<HardwareState>("/api/hardware/state").then(setHw).catch(() => {});
      refreshRobotics();
    }, 2000);
    return () => clearInterval(t);
  }, [refreshRobotics]);

  const s = status?.status;
  const h = robotics?.health;
  const emergency = robotics?.emergency ?? false;
  const distance = telemetry.distance?.value;
  const battery = telemetry.battery?.value ?? h?.battery ?? 87;
  const motorL = robotics?.motors?.left ?? 0;
  const motorR = robotics?.motors?.right ?? 0;
  const leds = hw?.leds ?? {};

  const toneOf = (v?: string) => {
    if (!v) return "idle";
    if (v === "CONNECTED" || v === "ONLINE" || v === "VIRTUAL") return "good" as const;
    if (v === "SIMULATION") return "warn" as const;
    if (v === "DISCONNECTED" || v === "OFFLINE") return "bad" as const;
    return "idle" as const;
  };

  const alertCount = Object.values(telemetry).filter((t) => t.state === "warning").length;

  return (
    <div className="flex flex-col gap-3">
      {/* SYSTEM OVERVIEW */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<IconGrid size={14} />} label="System" value={s?.backend ?? "…"} tone={s?.backend === "ONLINE" ? "good" : "bad"} sub={`vision ${s?.vision ?? "…"}`} />
        <StatCard icon={<IconRobot size={14} />} label="Active Robot" value={robotics?.connected ? (robotics.device_name ?? "ON") : "OFFLINE"} tone={robotics?.connected ? "good" : "bad"} sub={robotics?.device_type ?? "—"} />
        <StatCard icon={<IconTarget size={14} />} label="Sensors" value={Object.keys(telemetry).filter((k) => typeof telemetry[k].value === "number").length} sub={`${alertCount} warning${alertCount === 1 ? "" : "s"}`} tone={alertCount > 0 ? "warn" : "default"} />
        <StatCard icon={<IconFlow size={14} />} label="Automation" value={robotics?.sequence_running ? "RUNNING" : "IDLE"} tone={robotics?.sequence_running ? "good" : "default"} />
        <StatCard icon={<IconSparkles size={14} />} label="AI" value={s?.ai ?? "…"} tone={s?.ai === "ONLINE" ? "good" : "warn"} sub={robotics?.mode ?? "manual"} />
        <StatCard icon={<IconShield size={14} />} label="Health" value={emergency ? "EMERGENCY" : "OK"} tone={emergency ? "bad" : "good"} sub={h?.connected ? "robot connected" : "offline"} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Active robot */}
        <Panel title="Active Robot" className="panel-corner" bodyClassName="p-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border ${emergency ? "border-[var(--color-bad)]/60 bg-[var(--color-bad)]/10" : "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10"}`}>
              <IconRobot size={22} className={emergency ? "text-[var(--color-bad)]" : "text-[var(--color-accent)]"} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-bold text-[var(--color-ink)]">{h?.device ?? "—"}</span>
                <span className="mono text-[10px] font-bold" style={{ color: h?.connected ? "var(--color-good)" : "var(--color-bad)" }}>
                  {h?.connected ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              <div className="mono mt-0.5 text-[10.5px] text-[var(--color-ink-faint)]">
                {h?.mode} · battery {typeof battery === "number" ? battery.toFixed(0) : battery}%
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              ["Battery", `${typeof battery === "number" ? battery.toFixed(0) : battery}%`, Number(battery) < 20 ? "bad" : Number(battery) < 40 ? "warn" : "good"],
              ["Speed", `${Math.max(Math.abs(motorL), Math.abs(motorR))}`, motorL === 0 && motorR === 0 ? "idle" : "good"],
              ["Mode", h?.mode ?? "—", "default"],
              ["Sequence", robotics?.sequence_running ? "RUN" : "IDLE", robotics?.sequence_running ? "good" : "idle"],
            ].map(([label, value, t]) => (
              <div key={label} className="rounded-md border border-[var(--color-line)] p-2 text-center">
                <div className="panel-title">{label}</div>
                <div className="mono mt-0.5 text-[13px] font-bold" style={{ color: t === "bad" ? "var(--color-bad)" : t === "warn" ? "var(--color-warn)" : t === "good" ? "var(--color-good)" : "var(--color-ink)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--color-line)] px-3 py-2">
            <span className="text-[11px] text-[var(--color-ink-dim)]">Last command</span>
            <span className="mono text-[11px] text-[var(--color-accent)]">
              {h?.last_command || "—"} <span className="text-[var(--color-ink-faint)]">{h?.last_command_ts ?? ""}</span>
            </span>
          </div>

          {emergency && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--color-bad)]/50 bg-[var(--color-bad)]/10 px-3 py-2">
              <IconAlert size={13} className="text-[var(--color-bad)]" />
              <span className="mono text-[11px] font-bold text-[var(--color-bad)]">EMERGENCY STOP ENGAGED</span>
            </div>
          )}
        </Panel>

        {/* Vision */}
        <Panel title="Vision" className="panel-corner" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-line)] px-3 py-2">
              <IconCamera size={14} className="text-[var(--color-accent)]" />
              <div>
                <div className="panel-title">Camera</div>
                <div className="mono text-[12px] font-semibold text-[var(--color-ink)]">{s?.camera ?? "…"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-line)] px-3 py-2">
              <IconBolt size={14} className="text-[var(--color-violet)]" />
              <div>
                <div className="panel-title">FPS</div>
                <div className="mono text-[12px] font-semibold text-[var(--color-ink)]">{status?.vision_fps?.toFixed?.(1) ?? "…"}</div>
              </div>
            </div>
            <div className="col-span-2 flex items-center gap-2 rounded-md border border-[var(--color-line)] px-3 py-2">
              <IconHand size={14} className="text-[var(--color-accent)]" />
              <div className="flex-1">
                <div className="panel-title">Current gesture</div>
                <div className="mono text-[14px] font-bold text-[var(--color-ink)]">{status?.gesture ?? "NO_HAND"}</div>
              </div>
              <Tag color="var(--color-accent)">{status?.vision_mode ?? "…"}</Tag>
            </div>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/5 p-2.5">
            <IconAlert size={13} className="mt-0.5 shrink-0 text-[var(--color-warn)]" />
            <p className="text-[11px] leading-snug text-[var(--color-ink-dim)]">
              {status?.vision_mode === "camera" ? "Real webcam feed — MediaPipe hand tracking active." : "SIMULATION camera rendering a virtual hand. Open Gesture Control to drive it."}
            </p>
          </div>
        </Panel>

        {/* Hardware */}
        <Panel title="Hardware" className="panel-corner" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-[var(--color-line)] p-2.5">
              <div className="flex items-center justify-between">
                <span className="panel-title">Arduino</span>
                <StatusDot status={toneOf(s?.arduino)} pulse />
              </div>
              <div className="mono mt-1 text-[12px] font-semibold text-[var(--color-ink)]">{s?.arduino ?? "…"}</div>
            </div>
            <div className="rounded-md border border-[var(--color-line)] p-2.5">
              <div className="flex items-center justify-between">
                <span className="panel-title">ESP32</span>
                <StatusDot status={toneOf(s?.esp32)} />
              </div>
              <div className="mono mt-1 text-[12px] font-semibold text-[var(--color-ink)]">{s?.esp32 ?? "…"}</div>
            </div>
            <div className="rounded-md border border-[var(--color-line)] p-2.5">
              <div className="panel-title">Motors</div>
              <div className="mono mt-1 flex items-center gap-1 text-[12px] font-semibold text-[var(--color-ink)]">
                <span style={{ color: motorL > 0 ? "var(--color-good)" : motorL < 0 ? "var(--color-bad)" : "var(--color-ink-faint)" }}>L{motorL}</span>
                <span className="text-[var(--color-ink-faint)]">·</span>
                <span style={{ color: motorR > 0 ? "var(--color-good)" : motorR < 0 ? "var(--color-bad)" : "var(--color-ink-faint)" }}>R{motorR}</span>
              </div>
            </div>
            <div className="rounded-md border border-[var(--color-line)] p-2.5">
              <div className="panel-title">Servo</div>
              <div className="mono mt-1 text-[12px] font-semibold text-[var(--color-ink)]">{robotics?.servo_angle ?? hw?.servo ?? "—"}°</div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((n) => {
              const on = leds[n]?.on ?? false;
              return (
                <div key={n} className="flex flex-col items-center gap-1 rounded-md border border-[var(--color-line)] p-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: on ? "var(--color-good)" : "var(--color-line)", boxShadow: on ? "0 0 10px var(--color-good)" : "none" }} />
                  <span className="mono text-[9px] text-[var(--color-ink-faint)]">LED {n}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-md border border-[var(--color-line)] px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-dim)]"><IconCpu size={12} /> Obstacle distance</span>
            <span className={`mono text-[12px] font-bold ${Number(distance) < 20 ? "text-[var(--color-warn)]" : "text-[var(--color-accent)]"}`}>
              {typeof distance === "number" ? `${distance} cm` : "—"}
            </span>
          </div>
        </Panel>
      </div>

      {/* Event console */}
      <Panel title="Event Console" bodyClassName="flex flex-col">
        <EventConsole height={300} />
      </Panel>
    </div>
  );
}