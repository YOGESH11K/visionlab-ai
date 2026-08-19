import React, { useCallback, useEffect, useState } from "react";
import { api, Mapping } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { useStore } from "../lib/store";

const ACTION_TYPES = ["led_on", "led_off", "pwm", "servo", "buzzer", "relay", "motor", "custom"];

const TARGETS = [
  "LED_1", "LED_2", "LED_3", "LED_4", "ALL",
  "SERVO", "BUZZER", "RELAY", "MOTOR",
  "MODE_NEXT", "MODE_PREV", "EMERGENCY_OFF",
];

export function GestureControl() {
  const { notify } = useStore();
  const [mappings, setMappings] = useState<Mapping[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ mappings: Mapping[] }>("/api/gestures/mappings");
      setMappings(r.mappings);
    } catch {
      /* ignore */
    }
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
      <Panel
        title="Gesture Mapping Manager"
        right={
          <button className="btn" onClick={reset}>
            Reset defaults
          </button>
        }
        bodyClassName="overflow-y-auto"
      >
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              <th className="px-3 py-2">Gesture</th>
              <th className="px-2 py-2">Action</th>
              <th className="px-2 py-2">Target</th>
              <th className="px-2 py-2">Value</th>
              <th className="px-2 py-2">Command</th>
              <th className="px-2 py-2">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.gesture} className="border-t border-[var(--color-line)]/60">
                <td className="px-3 py-1.5">
                  <Tag color="var(--color-accent)">{m.gesture}</Tag>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className="select w-full"
                    value={m.action_type}
                    onChange={(e) => update(m.gesture, { action_type: e.target.value })}
                  >
                    {ACTION_TYPES.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  {m.action_type === "custom" ? (
                    <input
                      className="input w-full"
                      value={m.target}
                      onChange={(e) => update(m.gesture, { target: e.target.value })}
                    />
                  ) : (
                    <select
                      className="select w-full"
                      value={m.target}
                      onChange={(e) => update(m.gesture, { target: e.target.value })}
                    >
                      {TARGETS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className="input w-20"
                    type="number"
                    value={m.value ?? 0}
                    onChange={(e) => update(m.gesture, { value: Number(e.target.value) })}
                  />
                </td>
                <td className="mono px-2 py-1.5 text-[11px] text-[var(--color-ink-dim)]">{m.command}</td>
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => update(m.gesture, { enabled: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="How gesture control works">
          <div className="p-3 text-[12px] leading-relaxed text-[var(--color-ink-dim)]">
            <p className="mb-1">
              Vision → gesture → mapping → hardware command. The gesture engine only fires a
              command when a gesture is <span className="text-[var(--color-good)]">stable</span>:
            </p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>Debounce — rapid 1-2-3-2-3 alternation never spams commands</li>
              <li>Confidence threshold — low-confidence frames are ignored</li>
              <li>Temporal smoothing — 3 consecutive matching frames required</li>
              <li>Cooldown — min interval between commands (default 0.8s)</li>
            </ul>
            <p className="mt-2">
              <span className="mono text-[var(--color-accent)]">POINT</span> and{" "}
              <span className="mono text-[var(--color-accent)]">PEACE</span> trigger after holding
              one/two fingers for 2 seconds, leaving the finger-count demo untouched.
            </p>
          </div>
        </Panel>
        <Panel title="Default demo mapping">
          <div className="p-3">
            <table className="w-full text-[12px]">
              <tbody>
                {[
                  ["0 fingers / Fist", "ALL LEDs OFF"],
                  ["1 finger", "LED 1 ON"],
                  ["2 fingers", "LED 2 ON"],
                  ["3 fingers", "LED 3 ON"],
                  ["4 fingers", "LED 4 ON"],
                  ["5 fingers / Open palm", "ALL LEDs ON"],
                ].map(([g, a]) => (
                  <tr key={g} className="border-t border-[var(--color-line)]/50">
                    <td className="mono py-1.5 text-[var(--color-ink)]">{g}</td>
                    <td className="py-1.5 text-right text-[var(--color-ink-dim)]">{a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mono mt-2 text-[10.5px] text-[var(--color-ink-faint)]">
              Fully configurable above — nothing is hard-coded.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}