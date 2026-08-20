import React, { useEffect, useState } from "react";
import { robotics, RobotDeviceInfo, RoboticsState } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Panel, Tag, StatusDot } from "../../components/ui";
import { IconRefresh, IconWifi, IconUsb, IconCpu, IconBluetooth, IconBolt, IconCheck, IconAlert } from "../../components/icons";

const ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  simulated: IconCpu,
  serial: IconUsb,
  esp32: IconWifi,
  wifi: IconWifi,
  websocket: IconBolt,
  raspberrypi: IconCpu,
};

export function DevicesPanel({ state }: { state: RoboticsState | null }) {
  const { notify, refreshRobotics } = useStore();
  const [devices, setDevices] = useState<RobotDeviceInfo[]>([]);
  const [selected, setSelected] = useState("simulated");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    robotics.devices().then((r) => {
      setDevices(r.devices);
      if (state) setSelected(state.device_type);
    }).catch(() => {});
  }, [state]);

  const connect = async () => {
    setBusy(true);
    const r = await robotics.connect(selected, endpoint);
    setBusy(false);
    if (r.ok) {
      notify("success", `Connected to ${selected.toUpperCase()} robot`);
      refreshRobotics();
    } else {
      notify("error", `Connect failed: ${r.error ?? "unknown error"}`);
    }
  };

  const disconnect = async () => {
    await robotics.disconnect();
    notify("info", "Robot disconnected");
    refreshRobotics();
  };

  return (
    <Panel
      title="Device Abstraction Layer"
      right={<Tag color={state?.connected ? "var(--color-good)" : "var(--color-ink-faint)"}>{state?.connected ? "CONNECTED" : "OFFLINE"}</Tag>}
      bodyClassName="overflow-y-auto"
    >
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="panel-title mb-1">Select robot device</div>
          <div className="grid gap-1.5">
            {devices.map((d) => {
              const Icon = ICONS[d.key] ?? IconCpu;
              const active = selected === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => setSelected(d.key)}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5"
                      : "border-[var(--color-line)] hover:border-[var(--color-line-bright)]"
                  }`}
                >
                  <Icon size={17} className={active ? "mt-0.5 text-[var(--color-accent)]" : "mt-0.5 text-[var(--color-ink-faint)]"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">{d.name}</span>
                      <Tag color={active ? "var(--color-accent)" : "var(--color-ink-faint)"}>{d.kind}</Tag>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-ink-dim)]">{d.description}</p>
                    <span className="mono mt-1 block text-[9.5px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                      transport: {d.transport}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="panel-title">Connection settings</div>
          {(selected === "wifi" || selected === "websocket" || selected === "raspberrypi") && (
            <label className="block">
              <span className="text-[11px] text-[var(--color-ink-faint)]">Endpoint (optional — simulated if empty)</span>
              <input
                className="input mono mt-1 w-full"
                placeholder={selected === "websocket" ? "ws://robot:8765" : "192.168.1.50:8000"}
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </label>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={connect} disabled={busy}>
              <IconRefresh size={13} /> {busy ? "Connecting…" : "Connect"}
            </button>
            <button className="btn btn-danger" onClick={disconnect}>Disconnect</button>
          </div>

          <div className="mt-1 flex items-start gap-2 rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 p-3">
            <IconAlert size={14} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
            <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-dim)]">
              The UI talks to a <span className="mono text-[var(--color-ink)]">unified device abstraction</span>, never to a
              specific board. Serial/ESP32 robots map drive commands to the standard MOTOR protocol; network robots use a
              simulated transport until an endpoint is provided. This keeps the platform extensible for future hardware.
            </p>
          </div>

          <div className="mt-1 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-[var(--color-line)] p-2.5">
              <div className="panel-title">Current device</div>
              <div className="mono mt-1 text-[12px] text-[var(--color-ink)]">{state?.device_name ?? "—"}</div>
            </div>
            <div className="rounded-md border border-[var(--color-line)] p-2.5">
              <div className="panel-title">Transport</div>
              <div className="mt-1 flex items-center gap-1.5">
                <StatusDot status={state?.connected ? "good" : "idle"} pulse={!!state?.connected} />
                <span className="mono text-[12px] text-[var(--color-ink)]">
                  {devices.find((d) => d.key === (state?.device_type ?? ""))?.transport ?? state?.device_type ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}