import React, { useCallback, useEffect, useState } from "react";
import { api, Mapping } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { useStore } from "../lib/store";
import { VideoFeed } from "../components/VideoFeed";
import { GestureRobotPanel } from "./robotics/GestureRobotPanel";
import { IconCamera, IconHand, IconRobot } from "../components/icons";

const ACTION_TYPES = [
  "led_on", "led_off", "pwm", "servo", "buzzer", "relay", "motor",
  "robot_forward", "robot_backward", "robot_left", "robot_right", "robot_stop", "robot_emergency", "robot_servo", "robot_led",
  "custom",
];

const TARGETS = [
  "LED_1", "LED_2", "LED_3", "LED_4", "ALL",
  "SERVO", "BUZZER", "RELAY", "MOTOR",
  "MODE_NEXT", "MODE_PREV", "EMERGENCY_OFF",
];

type Tab = "vision" | "robot" | "hardware";

function HardwareMappingTable({
  mappings,
  onUpdate,
  onReset,
}: {
  mappings: Mapping[];
  onUpdate: (gesture: string, patch: Partial<Mapping>) => void;
  onReset: () => void;
}) {
  return (
    <Panel
      title="Hardware Action Mapping"
      right={<button className="btn !py-1 text-[11px]" onClick={onReset}>Reset defaults</button>}
      bodyClassName="overflow-y-auto"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-2">Gesture</th>
              <th className="px-2 py-2">Action</th>
              <th className="px-2 py-2">Target</th>
              <th className="px-2 py-2">Value</th>
              <th className="px-2 py-2">Command</th>
              <th className="px-2 py-2">On</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.gesture} className="border-t border-[var(--color-line)]/60">
                <td className="px-3 py-1.5"><Tag color="var(--color-accent)">{m.gesture}</Tag></td>
                <td className="px-2 py-1.5">
                  <select
                    className="select w-full"
                    value={m.action_type}
                    onChange={(e) => onUpdate(m.gesture, { action_type: e.target.value })}
                  >
                    {ACTION_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  {m.action_type === "custom" ? (
                    <input className="input w-full" value={m.target} onChange={(e) => onUpdate(m.gesture, { target: e.target.value })} />
                  ) : (
                    <select className="select w-full" value={m.target} onChange={(e) => onUpdate(m.gesture, { target: e.target.value })}>
                      {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <input className="input w-20" type="number" value={m.value ?? 0} onChange={(e) => onUpdate(m.gesture, { value: Number(e.target.value) })} />
                </td>
                <td className="mono px-2 py-1.5 text-[11px] text-[var(--color-ink-dim)]">{m.command}</td>
                <td className="px-2 py-1.5">
                  <input type="checkbox" checked={m.enabled} onChange={(e) => onUpdate(m.gesture, { enabled: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function GestureControl() {
  const { notify, robotics } = useStore();
  const [tab, setTab] = useState<Tab>("vision");
  const [mappings, setMappings] = useState<Mapping[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ mappings: Mapping[] }>("/api/gestures/mappings");
      setMappings(r.mappings);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (gesture: string, patch: Partial<Mapping>) => {
    const m = mappings.find((x) => x.gesture === gesture);
    if (!m) return;
    try {
      await api.put(`/api/gestures/mappings/${gesture}`, {
        action_type: patch.action_type ?? m.action_type,
        target: patch.target ?? m.target,
        value: patch.value ?? m.value,
        enabled: patch.enabled ?? m.enabled,
      });
      notify("success", `Mapping updated: ${gesture}`);
      load();
    } catch (e) {
      notify("error", `Update failed: ${e}`);
    }
  };

  const reset = async () => {
    await api.post("/api/gestures/reset");
    notify("info", "Mappings reset to defaults");
    load();
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-line)]">
        <button className={`tab-btn ${tab === "vision" ? "active" : ""}`} onClick={() => setTab("vision")}><IconCamera size={14} /> <span className="hidden sm:inline">Vision</span></button>
        <button className={`tab-btn ${tab === "robot" ? "active" : ""}`} onClick={() => setTab("robot")}><IconRobot size={14} /> <span className="hidden sm:inline">Robot Actions</span></button>
        <button className={`tab-btn ${tab === "hardware" ? "active" : ""}`} onClick={() => setTab("hardware")}><IconHand size={14} /> <span className="hidden sm:inline">Hardware Mapping</span></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {tab === "vision" && (
          <div className="flex flex-col gap-3">
            <VideoFeed height={420} />
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Vision pipeline">
                <div className="p-3 text-[12px] leading-relaxed text-[var(--color-ink-dim)]">
                  <p className="mb-1">
                    Camera → gesture engine → mapping → command. The gesture engine only fires when a gesture is
                    <span className="text-[var(--color-good)]"> stable</span>:
                  </p>
                  <ul className="ml-4 list-disc space-y-0.5">
                    <li>Debounce — rapid alternation never spams commands</li>
                    <li>Confidence threshold — low-confidence frames are ignored</li>
                    <li>Temporal smoothing — 3 consecutive matching frames required</li>
                    <li>Cooldown — min interval between commands</li>
                  </ul>
                </div>
              </Panel>
              <Panel title="Gesture → Robot actions">
                <div className="p-3">
                  <table className="w-full text-[12px]">
                    <tbody>
                      {[
                        ["Open palm", "STOP"],
                        ["Thumb up", "FORWARD"],
                        ["Thumb down", "BACKWARD"],
                        ["One finger", "LEFT"],
                        ["Two fingers", "RIGHT"],
                        ["Three fingers", "SERVO / action"],
                        ["Closed fist", "EMERGENCY STOP"],
                      ].map(([g, a]) => (
                        <tr key={g} className="border-t border-[var(--color-line)]/50">
                          <td className="mono py-1.5 text-[var(--color-ink)]">{g}</td>
                          <td className="py-1.5 text-right text-[var(--color-ink-dim)]">{a}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mono mt-2 text-[10.5px] text-[var(--color-ink-faint)]">
                    Fully configurable in the <span className="text-[var(--color-accent)]">Robot Actions</span> tab — nothing is hard-coded.
                  </p>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {tab === "robot" && <GestureRobotPanel state={robotics} />}
        {tab === "hardware" && <HardwareMappingTable mappings={mappings} onUpdate={update} onReset={reset} />}
      </div>
    </div>
  );
}