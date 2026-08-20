import React from "react";
import { AppProvider, useStore } from "./lib/store";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Dashboard } from "./pages/Dashboard";
import { GestureControl } from "./pages/GestureControl";
import { RoboticsControl } from "./pages/RoboticsControl";
import { ComponentScanner } from "./pages/ComponentScanner";
import { AIAssistant } from "./pages/AIAssistant";
import { CodeGenerator } from "./pages/CodeGenerator";
import { LearningLab } from "./pages/LearningLab";
import { Projects } from "./pages/Projects";
import { SettingsPage } from "./pages/Settings";

const TITLES: Record<string, string> = {
  dashboard: "Command Center",
  gestures: "Gesture Control",
  robotics: "Robotics Control",
  scanner: "Component Scanner",
  ai: "AI Assistant",
  codegen: "Code Generator",
  learning: "Learning Lab",
  projects: "Projects",
  settings: "Settings",
};

function Shell() {
  const { page, robotics } = useStore();

  return (
    <div className="grid-bg flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar current={TITLES[page]} />
        <main className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
          {page === "dashboard" && <Dashboard />}
          {page === "gestures" && <GestureControl />}
          {page === "robotics" && <RoboticsControl />}
          {page === "scanner" && <ComponentScanner />}
          {page === "ai" && <AIAssistant />}
          {page === "codegen" && <CodeGenerator />}
          {page === "learning" && <LearningLab />}
          {page === "projects" && <Projects />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>

      {robotics?.emergency && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--color-bad)]/60 bg-[var(--color-base-900)]/90 px-4 py-2 shadow-[0_0_30px_rgba(248,113,113,0.35)] backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-bad)]" />
            <span className="mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-bad)]">
              Emergency stop engaged
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}