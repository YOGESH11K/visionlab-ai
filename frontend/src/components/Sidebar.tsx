import React from "react";
import { PageKey, useStore } from "../lib/store";
import {
  IconBook,
  IconCamera,
  IconChart,
  IconChip,
  IconCircuit,
  IconCode,
  IconFolder,
  IconGear,
  IconGrid,
  IconHand,
  IconScan,
  IconBrain,
  IconTerminal,
} from "./icons";

const NAV: { key: PageKey; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { key: "dashboard", label: "Dashboard", icon: IconGrid },
  { key: "vision", label: "Vision Lab", icon: IconCamera },
  { key: "gestures", label: "Gesture Control", icon: IconHand },
  { key: "scanner", label: "Component Scanner", icon: IconScan },
  { key: "sensors", label: "Sensor Monitor", icon: IconChart },
  { key: "hardware", label: "Arduino / ESP32", icon: IconChip },
  { key: "circuits", label: "Circuit Builder", icon: IconCircuit },
  { key: "ai", label: "AI Assistant", icon: IconBrain },
  { key: "codegen", label: "Code Generator", icon: IconCode },
  { key: "projects", label: "Projects", icon: IconFolder },
  { key: "learning", label: "Learning Lab", icon: IconBook },
  { key: "settings", label: "Settings", icon: IconGear },
];

export function Sidebar() {
  const { page, setPage, status } = useStore();
  const visionRunning = status?.status.vision === "ONLINE";

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-base-950)]/80">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 glow-cyan">
          <IconTerminal size={18} className="text-[var(--color-accent)]" />
        </div>
        <div>
          <div className="text-[14px] font-bold tracking-wide text-[var(--color-ink)]">
            EMPIRE
          </div>
          <div className="mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
            AI Electronics Lab
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {NAV.map((item) => {
          const active = page === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`group mb-0.5 flex w-full items-center gap-2.5 rounded-md px-3 py-[7px] text-left text-[12.5px] transition-colors ${
                active
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/25"
                  : "border border-transparent text-[var(--color-ink-dim)] hover:bg-[var(--color-base-800)] hover:text-[var(--color-ink)]"
              }`}
            >
              <Icon size={15} className={active ? "text-[var(--color-accent)]" : ""} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-line)] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="panel-title">Vision Core</span>
          <span
            className={`h-2 w-2 rounded-full ${visionRunning ? "pulse-good" : ""}`}
            style={{
              backgroundColor: visionRunning ? "var(--color-good)" : "var(--color-ink-faint)",
            }}
          />
        </div>
        <div className="mono mt-1 text-[10.5px] text-[var(--color-ink-faint)]">
          v1.0.0 · Python {status?.hardware_board ? status.hardware_board : "ready"}
        </div>
      </div>
    </aside>
  );
}