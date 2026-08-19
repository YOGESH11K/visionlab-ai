import React, { useEffect, useState } from "react";
import { api, HardwareState } from "../lib/api";
import { useStore } from "../lib/store";
import { Panel, Metric, StatusDot, SectionLabel } from "../components/ui";
import { EventConsole } from "../components/EventConsole";
import { IconAlert, IconCamera, IconChip, IconHand } from "../components/icons";

export function Dashboard() {
  const { status } = useStore();
  const [hw, setHw] = useState<HardwareState | null>(null);

  useEffect(() => {
    api.get<HardwareState>("/api/hardware/state").then(setHw).catch(() => {});
    const t = setInterval(() => {
      api.get<HardwareState>("/api/hardware/state").then(setHw).catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const s = status?.status;

  const statusColor = (v?: string) => {
    if (!v) return "idle";
    if (v === "CONNECTED" || v === "ONLINE" || v === "VIRTUAL") return "good" as const;
    if (v === "SIMULATION") return "warn" as const;
    if (v === "DISCONNECTED" || v === "OFFLINE") return "bad" as const;
    return "idle" as const;
  };

  const leds = hw?.leds ?? {};

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
        {/* Left column: live status cards */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Panel title="Camera">
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <IconCamera size={16} className="text-[var(--color-accent)]" />
                  <StatusDot status={statusColor(s?.camera)} pulse />
                  <span className="text-[13px] font-medium">{s?.camera ?? "…"}</span>
                </div>
                <div className="mono mt-2 text-[11px] text-[var(--color-ink-dim)]">
                  FPS {status?.vision_fps?.toFixed?.(1) ?? "…"}
                </div>
              </div>
            </Panel>
            <Panel title="Arduino">
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <IconChip size={16} className="text-[var(--color-accent)]" />
                  <StatusDot status={statusColor(s?.arduino)} pulse />
                  <span className="text-[13px] font-medium">{s?.arduino ?? "…"}</span>
                </div>
                <div className="mono mt-2 text-[11px] text-[var(--color-ink-dim)]">{hw?.board ?? "…"}</div>
              </div>
            </Panel>
            <Panel title="ESP32">
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <IconChip size={16} className="text-[var(--color-violet)]" />
                  <StatusDot status={statusColor(s?.esp32)} />
                  <span className="text-[13px] font-medium">{s?.esp32 ?? "…"}</span>
                </div>
              </div>
            </Panel>
            <Panel title="AI Core">
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <IconHand size={16} className="text-[var(--color-violet)]" />
                  <StatusDot status={statusColor(s?.ai)} />
                  <span className="text-[13px] font-medium">{s?.ai ?? "…"}</span>
                </div>
                <div className="mono mt-2 text-[11px] text-[var(--color-ink-dim)]">
                  {s?.ai === "ONLINE" ? "external model" : "knowledge engine"}
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Vision Pipeline">
              <div className="grid grid-cols-2 gap-y-2 p-3">
                <Metric label="Current gesture" value={status?.gesture ?? "NO_HAND"} tone={status?.gesture && status.gesture !== "NO_HAND" ? "good" : "default"} />
                <Metric label="Vision mode" value={status?.vision_mode?.toUpperCase() ?? "…"} tone={status?.vision_mode === "simulation" ? "warn" : "good"} />
                <Metric label="Hands detected" value={hw?.virtual ? "SIM" : "…"} />
                <Metric label="Confidence" value="—" />
              </div>
            </Panel>
            <Panel title="Hardware State">
              <div className="flex flex-col gap-2 p-3">
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((n) => {
                    const led = leds[n];
                    const on = led?.on ?? false;
                    return (
                      <div key={n} className="flex flex-col items-center gap-1 rounded-md border border-[var(--color-line)] p-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: on ? "var(--color-good)" : "var(--color-line)", boxShadow: on ? "0 0 10px var(--color-good)" : "none" }} />
                        <span className="mono text-[10px] text-[var(--color-ink-faint)]">LED {n}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="text-center">
                    <div className="panel-title">Servo</div>
                    <div className="mono text-[12px]">{hw?.servo ?? "—"}°</div>
                  </div>
                  <div className="text-center">
                    <div className="panel-title">Relay</div>
                    <div className="mono text-[12px]" style={{ color: hw?.relay ? "var(--color-good)" : "var(--color-ink-faint)" }}>{hw?.relay ? "ON" : "OFF"}</div>
                  </div>
                  <div className="text-center">
                    <div className="panel-title">Motor</div>
                    <div className="mono text-[12px]">{hw?.motor ?? 0}</div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Live Camera">
            <div className="p-3">
              <p className="text-[12px] text-[var(--color-ink-dim)]">
                {status?.vision_mode === "camera" ? (
                  "Real webcam feed active — hand tracking running through MediaPipe."
                ) : (
                  <>
                    <IconAlert size={13} className="mr-1 inline text-[var(--color-warn)]" />
                    No webcam on the backend — <span className="mono text-[var(--color-warn)]">SIMULATION</span> camera renders a virtual hand.
                    Open <span className="mono">Vision Lab</span> to control the simulated gesture.
                  </>
                )}
              </p>
            </div>
          </Panel>
        </div>

        {/* Right column: event console */}
        <Panel title="Event Console" bodyClassName="flex flex-col">
          <EventConsole height={420} />
        </Panel>
      </div>
    </div>
  );
}