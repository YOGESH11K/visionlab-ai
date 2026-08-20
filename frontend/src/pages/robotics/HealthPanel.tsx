import React from "react";
import { RobotHealth, RoboticsState } from "../../lib/api";
import { Panel, Tag, StatusDot } from "../../components/ui";
import { IconAlert, IconBolt, IconCpu, IconShield, IconWifi } from "../../components/icons";

function StatusRow({ label, value, tone, pulse }: { label: string; value: React.ReactNode; tone: "good" | "warn" | "bad" | "idle"; pulse?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-2.5 py-2">
      <span className="text-[11.5px] text-[var(--color-ink-dim)]">{label}</span>
      <span className="flex items-center gap-2">
        <StatusDot status={tone} pulse={pulse} />
        <span className="mono text-[11.5px] font-semibold text-[var(--color-ink)]">{value}</span>
      </span>
    </div>
  );
}

export function HealthPanel({ health, state }: { health: RobotHealth | null; state: RoboticsState | null }) {
  if (!health) {
    return <Panel title="Robot Health"><div className="p-4 text-[12px] text-[var(--color-ink-faint)]">Health data unavailable.</div></Panel>;
  }

  const toneFor = (v?: number, warn = 80): "good" | "warn" | "bad" | "idle" => {
    if (v == null) return "idle";
    if (v > warn) return v > warn + 15 ? "bad" : "warn";
    return "good";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Device Status" bodyClassName="p-3">
          <div className="flex flex-col gap-1.5">
            <StatusRow label="Device" value={health.device} tone={health.connected ? "good" : "bad"} pulse={health.connected} />
            <StatusRow label="Connection" value={health.connected ? "CONNECTED" : "DISCONNECTED"} tone={health.connected ? "good" : "bad"} pulse={health.connected} />
            <StatusRow label="Mode" value={health.mode} tone="idle" />
            <StatusRow label="Network" value={health.network} tone={health.network === "ONLINE" ? "good" : health.network === "SERIAL" ? "warn" : "bad"} />
            <StatusRow label="Safety system" value={health.emergency ? "EMERGENCY" : "ARMED"} tone={health.emergency ? "bad" : "good"} pulse={health.emergency} />
            <StatusRow label="Runtime active" value={health.runtime_started ? "RUNNING" : "IDLE"} tone="idle" />
          </div>
        </Panel>

        <Panel title="System Resources" bodyClassName="p-3">
          <div className="flex flex-col gap-1.5">
            <StatusRow label="CPU" value={`${health.cpu}%`} tone={toneFor(health.cpu)} />
            <StatusRow label="Memory" value={`${health.memory}%`} tone={toneFor(health.memory, 85)} />
            <StatusRow label="Temperature" value={`${health.temperature}°C`} tone={toneFor(health.temperature, 60)} />
            <StatusRow label="Battery" value={`${health.battery}%`} tone={health.battery < 20 ? "bad" : health.battery < 40 ? "warn" : "good"} />
            <StatusRow label="Uptime" value={`${Math.floor(health.uptime_s / 60)}m ${Math.round(health.uptime_s % 60)}s`} tone="idle" />
            <StatusRow label="Sensors" value={health.sensor_status} tone={health.sensor_status === "OK" ? "good" : "bad"} />
          </div>
        </Panel>

        <Panel title="Command Channel" bodyClassName="p-3">
          <div className="flex flex-col gap-1.5">
            <StatusRow label="Motors" value={health.motor_status} tone={health.motor_status === "OK" ? "good" : "bad"} />
            <StatusRow label="Servo" value={`${health.servo}°`} tone="idle" />
            <StatusRow label="Last command" value={health.last_command || "—"} tone="idle" />
            <StatusRow label="Response" value={health.last_response || "—"} tone={health.last_response?.startsWith("ERROR") ? "bad" : "good"} />
            <StatusRow label="Errors" value={health.error_count} tone={health.error_count > 0 ? "bad" : "good"} />
          </div>
          {health.last_error && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/10 p-2">
              <IconAlert size={13} className="mt-0.5 shrink-0 text-[var(--color-bad)]" />
              <span className="mono text-[10.5px] leading-snug text-[var(--color-bad)]">{health.last_error}</span>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Subsystem Indicators" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { label: "Camera", ok: true, icon: null },
              { label: "Vision", ok: true },
              { label: "Motors", ok: health.motor_status === "OK" },
              { label: "Sensors", ok: health.sensor_status === "OK" },
              { label: "Serial / Network", ok: health.connected },
              { label: "AI Context", ok: true },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-3 py-2">
                <span className="text-[11.5px] text-[var(--color-ink-dim)]">{s.label}</span>
                <StatusDot status={s.ok ? "good" : "bad"} pulse={s.ok} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Safety Perimeter" bodyClassName="p-3">
          <div className="flex items-start gap-2.5">
            <IconShield size={18} className={health.emergency ? "mt-0.5 text-[var(--color-bad)]" : "mt-0.5 text-[var(--color-good)]"} />
            <div className="text-[11.5px] leading-relaxed text-[var(--color-ink-dim)]">
              <span className="mono font-bold" style={{ color: health.emergency ? "var(--color-bad)" : "var(--color-good)" }}>
                {health.emergency ? "EMERGENCY STOP ACTIVE" : "SAFETY SYSTEM ARMED"}
              </span>
              <br />
              Every command passes through the Safety Validator: max motor speed, max servo angle, runtime limit, battery
              minimum and sensor distance threshold are enforced before anything reaches the device.
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-line)] px-2.5 py-2">
              <IconCpu size={13} className="text-[var(--color-ink-faint)]" />
              <span className="mono text-[10.5px] text-[var(--color-ink-dim)]">max speed {state?.limits.max_motor_speed ?? 255}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-line)] px-2.5 py-2">
              <IconBolt size={13} className="text-[var(--color-ink-faint)]" />
              <span className="mono text-[10.5px] text-[var(--color-ink-dim)]">min battery {state?.limits.battery_min ?? 10}%</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}