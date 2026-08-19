import React from "react";
import { AppProvider, useStore } from "./lib/store";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Dashboard } from "./pages/Dashboard";
import { VisionLab } from "./pages/VisionLab";
import { GestureControl } from "./pages/GestureControl";
import { ComponentScanner } from "./pages/ComponentScanner";
import { SensorMonitor } from "./pages/SensorMonitor";
import { HardwareLab } from "./pages/HardwareLab";
import { AIAssistant } from "./pages/AIAssistant";
import { CodeGenerator } from "./pages/CodeGenerator";
import { CircuitBuilder } from "./pages/CircuitBuilder";
import { Projects } from "./pages/Projects";
import { LearningLab } from "./pages/LearningLab";
import { SettingsPage } from "./pages/Settings";

function Shell() {
  const { page } = useStore();
  const TITLES: Record<string, string> = {
    dashboard: "Command Center",
    vision: "Vision Lab",
    gestures: "Gesture Control",
    scanner: "Component Scanner",
    sensors: "Sensor Monitor",
    hardware: "Arduino / ESP32",
    circuits: "Circuit Builder",
    ai: "AI Assistant",
    codegen: "Code Generator",
    projects: "Projects",
    learning: "Learning Lab",
    settings: "Settings",
  };

  return (
    <div className="grid-bg flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar current={TITLES[page]} />
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {page === "dashboard" && <Dashboard />}
          {page === "vision" && <VisionLab />}
          {page === "gestures" && <GestureControl />}
          {page === "scanner" && <ComponentScanner />}
          {page === "sensors" && <SensorMonitor />}
          {page === "hardware" && <HardwareLab />}
          {page === "circuits" && <CircuitBuilder />}
          {page === "ai" && <AIAssistant />}
          {page === "codegen" && <CodeGenerator />}
          {page === "projects" && <Projects />}
          {page === "learning" && <LearningLab />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
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