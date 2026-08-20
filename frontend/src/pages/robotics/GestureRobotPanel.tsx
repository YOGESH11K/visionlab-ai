import React, { useEffect, useState } from "react";
import { robotics, RoboticsState } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Panel, Tag } from "../../components/ui";
import { IconHand, IconRobot } from "../../components/icons";

const GESTURES = ["OPEN_PALM", "THUMB_UP", "THUMB_DOWN", "ONE_FINGER", "TWO_FINGERS", "THREE_FINGERS", "FOUR_FINGERS", "FIST", "PEACE", "POINT", "PINCH", "SWIPE_LEFT", "SWIPE_RIGHT"];

const ACTIONS = ["NONE", "FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP", "EMERGENCY", "SERVO", "LED"];

const GESTURE_HINT: Record<string, string> = {
  OPEN_PALM: "Stop — open hand",
  THUMB_UP: "Forward — thumbs up",
  THUMB_DOWN: "Backward — thumbs down",
  ONE_FINGER: "Turn left — one finger",
  TWO_FINGERS: "Turn right — two fingers",
  THREE_FINGERS: "Action — three fingers",
  FIST: "Emergency stop — closed fist",
};

export function GestureRobotPanel({ state }: { state: RoboticsState | null }) {
  const { notify, refreshRobotics } = useStore();
  const [mapping, setMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    if (state?.gesture_robot) setMapping({ ...state.gesture_robot });
  }, [state?.gesture_robot]);

  const setAction = async (gesture: string, action: string) => {
    const next = { ...mapping, [gesture]: action };
    setMapping(next);
    const r = await robotics.setGestureMapping(next);
    if (r.ok) {
      notify("success", `${gesture} → ${action || "no action"}`);
      refreshRobotics();
    } else {
      notify("error", "Failed to update gesture mapping");
    }
  };

  const reset = async () => {
    const r = await robotics.setGestureMapping({
      OPEN_PALM: "STOP", THUMB_UP: "FORWARD", THUMB_DOWN: "BACKWARD",
      ONE_FINGER: "LEFT", TWO_FINGERS: "RIGHT", THREE_FINGERS: "SERVO", FIST: "EMERGENCY",
    });
    if (r.ok) {
      notify("info", "Gesture robot mapping reset to defaults");
      refreshRobotics();
    }
  };

  return (
    <Panel
      title="Gesture → Robot Action Mapping"
      right={<button className="btn !py-1 text-[11px]" onClick={reset}>Reset defaults</button>}
      bodyClassName="overflow-y-auto"
    >
      <div className="flex items-start gap-2 rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 p-3">
        <IconRobot size={16} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
        <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-dim)]">
          Assign computer vision gestures to robot actions. Gesture commands pass through the
          <span className="mono text-[var(--color-ink)]"> safety validator</span> — an open palm stops the robot, a closed
          fist engages the emergency stop. Mappings are fully customizable and persisted.
        </p>
      </div>

      <div className="grid gap-1.5 p-3 sm:grid-cols-2">
        {GESTURES.map((g) => {
          const action = mapping[g] ?? "NONE";
          const hint = GESTURE_HINT[g];
          return (
            <div key={g} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <IconHand size={15} className="shrink-0 text-[var(--color-ink-faint)]" />
                <div className="min-w-0">
                  <span className="mono block truncate text-[11.5px] font-semibold text-[var(--color-ink)]">{g}</span>
                  {hint && <span className="block text-[10px] text-[var(--color-ink-faint)]">{hint}</span>}
                </div>
              </div>
              <select
                className="select !py-1 text-[11.5px]"
                value={action}
                onChange={(e) => setAction(g, e.target.value)}
                aria-label={`action for ${g}`}
              >
                {ACTIONS.map((a) => <option key={a} value={a}>{a === "NONE" ? "— none —" : a}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      <div className="px-3 pb-3">
        <p className="mono text-[10px] text-[var(--color-ink-faint)]">
          The gesture engine fires the mapped action only on a stable, confident gesture (smoothing + debounce + cooldown).
        </p>
      </div>
    </Panel>
  );
}