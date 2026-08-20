import React, { useEffect, useRef, useState } from "react";
import { PageKey, useStore } from "../lib/store";
import {
  IconBook,
  IconBrain,
  IconCode,
  IconFolder,
  IconGear,
  IconGrid,
  IconHand,
  IconMenu,
  IconRobot,
  IconScan,
  IconX,
} from "./icons";

const NAV: { key: PageKey; label: string; hint: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { key: "dashboard", label: "Dashboard", hint: "overview", icon: IconGrid },
  { key: "gestures", label: "Gesture Control", hint: "vision · mapping", icon: IconHand },
  { key: "robotics", label: "Robotics Control", hint: "devices · safety · auto", icon: IconRobot },
  { key: "scanner", label: "Component Scanner", hint: "identify · info", icon: IconScan },
  { key: "ai", label: "AI Assistant", hint: "copilot", icon: IconBrain },
  { key: "codegen", label: "Code Generator", hint: "embedded · ai", icon: IconCode },
  { key: "learning", label: "Learning Lab", hint: "learn · simulate", icon: IconBook },
  { key: "projects", label: "Projects", hint: "workspace", icon: IconFolder },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 glow-cyan">
        <IconRobot size={19} className="text-[var(--color-accent)]" />
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[var(--color-accent)] pulse-good" />
      </div>
      <div>
        <div className="text-[14px] font-extrabold tracking-[0.08em] text-[var(--color-ink)]">
          EMPIRE
        </div>
        <div className="mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          AI Robotics Lab
        </div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { page, setPage, status, robotics } = useStore();

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-3">
      {NAV.map((item) => {
        const active = page === item.key;
        const Icon = item.icon;
        const isRobotics = item.key === "robotics";
        const em = isRobotics && robotics?.emergency;
        return (
          <button
            key={item.key}
            onClick={() => {
              setPage(item.key);
              onNavigate?.();
            }}
            aria-current={active ? "page" : undefined}
            className={`group relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-[8px] text-left transition-all ${
              active
                ? "border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] glow-cyan"
                : "border border-transparent text-[var(--color-ink-dim)] hover:bg-[var(--color-base-800)] hover:text-[var(--color-ink)]"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--color-accent)]" />
            )}
            <Icon size={16} className={active ? "text-[var(--color-accent)]" : ""} />
            <span className="flex-1">
              <span className="block text-[12.5px] font-semibold leading-tight">{item.label}</span>
              <span className={`block text-[9px] uppercase tracking-wider ${active ? "text-[var(--color-accent)]/70" : "text-[var(--color-ink-faint)]"}`}>
                {item.hint}
              </span>
            </span>
            {em && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-bad)] shadow-[0_0_8px_var(--color-bad)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const { page, setPage, status } = useStore();
  const active = page === "settings";
  return (
    <div className="border-t border-[var(--color-line)] p-3">
      <button
        onClick={() => setPage("settings")}
        aria-current={active ? "page" : undefined}
        className={`mb-2 flex w-full items-center gap-2.5 rounded-lg border px-3 py-[8px] text-left text-[12.5px] font-semibold transition-colors ${
          active
            ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            : "border-transparent text-[var(--color-ink-dim)] hover:bg-[var(--color-base-800)] hover:text-[var(--color-ink)]"
        }`}
      >
        <IconGear size={15} />
        Settings
      </button>
      <div className="flex items-center justify-between px-1">
        <span className="panel-title">Vision Core</span>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: status?.status.vision === "ONLINE" ? "var(--color-good)" : "var(--color-ink-faint)",
          }}
        />
      </div>
      <div className="mono mt-0.5 px-1 text-[9.5px] text-[var(--color-ink-faint)]">
        v1.2 · {status?.hardware_board ? status.hardware_board : "ready"}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (mobileOpen && drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [mobileOpen]);

  if (!isMobile) {
    return (
      <aside className="flex w-[224px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-base-950)]/85 backdrop-blur">
        <Brand />
        <NavItems />
        <SidebarFooter />
      </aside>
    );
  }

  return (
    <>
      <button
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-line)] bg-[var(--color-base-900)]/90 text-[var(--color-ink)]"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <IconX size={18} /> : <IconMenu size={18} />}
      </button>

      {mobileOpen && (
        <div
          ref={drawerRef}
          className="pop-in fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-[var(--color-line)] bg-[var(--color-base-950)]/97 shadow-2xl"
        >
          <Brand />
          <NavItems onNavigate={() => setMobileOpen(false)} />
          <SidebarFooter />
        </div>
      )}
    </>
  );
}