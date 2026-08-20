import React, { useState } from "react";
import { useStore } from "../lib/store";
import { RoboticsState } from "../lib/api";
import { robotics } from "../lib/api";
import { IconBolt, IconFlow, IconHand, IconHeart, IconRobot, IconShield, IconTarget, IconUsb, IconCheck } from "../components/icons";
import { DevicesPanel } from "./robotics/DevicesPanel";
import { ControlPad } from "./robotics/ControlPad";
import { TelemetryView } from "./robotics/TelemetryView";
import { HealthPanel } from "./robotics/HealthPanel";
import { SafetyPanel } from "./robotics/SafetyPanel";
import { SequenceEditor } from "./robotics/SequenceEditor";
import { AIModePanel } from "./robotics/AIModePanel";
import { GestureRobotPanel } from "./robotics/GestureRobotPanel";

type Tab = "devices" | "control" | "gesture" | "telemetry" | "health" | "safety" | "automation" | "ai";

const TABS: { key: Tab; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { key: "devices", label: "Devices", icon: IconUsb },
  { key: "control", label: "Manual Control", icon: IconTarget },
  { key: "gesture", label: "Gesture", icon: IconHand },
  { key: "telemetry", label: "Telemetry", icon: IconFlow },
  { key: "health", label: "Health", icon: IconHeart },
  { key: "safety", label: "Safety", icon: IconShield },
  { key: "automation", label: "Automation", icon: IconRobot },
  { key: "ai", label: "AI Mode", icon: IconBolt },
];

export function RoboticsControl() {
  const { robotics: state, refreshRobotics, notify } = useStore();
  const [tab, setTab] = useState<Tab>("control");

  const emergency = state?.emergency ?? false;

  const engageEmergency = async () => {
    await robotics.emergency(false);
    notify("error", "EMERGENCY STOP ENGAGED");
    refreshRobotics();
  };

  const resetEmergency = async () => {
    await robotics.emergency(true);
    notify("success", "Safety system re-armed");
    refreshRobotics();
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header bar with sticky emergency control */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-base-900)]/70 p-2 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10">
            <IconRobot size={16} className="text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-[var(--color-ink)]">ROBOTICS CONTROL</div>
            <div className="mono flex items-center gap-2 text-[9.5px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              <span style={{ color: state?.connected ? "var(--color-good)" : "var(--color-ink-faint)" }}>
                {state?.connected ? state.device_name : "OFFLINE"}
              </span>
              <span>·</span>
              <span style={{ color: emergency ? "var(--color-bad)" : "var(--color-accent)" }}>{state?.mode ?? "MANUAL"}</span>
            </div>
          </div>
        </div>

        {emergency ? (
          <button className="btn-emergency active px-5 py-2.5 text-[12px]" onClick={resetEmergency} aria-label="Reset emergency stop">
            <IconCheck size={18} /> RESET SAFETY
          </button>
        ) : (
          <button className="btn-emergency px-5 py-2.5 text-[12px]" onClick={engageEmergency} aria-label="Engage emergency stop">
            <IconBolt size={18} /> EMERGENCY STOP
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-line)]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`tab-btn ${tab === key ? "active" : ""}`}
            aria-current={tab === key ? "page" : undefined}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="fade-in">
          {tab === "devices" && <DevicesPanel state={state as RoboticsState | null} />}
          {tab === "control" && <ControlPad state={state as RoboticsState | null} />}
          {tab === "gesture" && <GestureRobotPanel state={state as RoboticsState | null} />}
          {tab === "telemetry" && <TelemetryView />}
          {tab === "health" && <HealthPanel health={state?.health ?? null} state={state as RoboticsState | null} />}
          {tab === "safety" && <SafetyPanel state={state as RoboticsState | null} />}
          {tab === "automation" && <SequenceEditor state={state as RoboticsState | null} />}
          {tab === "ai" && <AIModePanel state={state as RoboticsState | null} />}
        </div>
      </div>
    </div>
  );
}