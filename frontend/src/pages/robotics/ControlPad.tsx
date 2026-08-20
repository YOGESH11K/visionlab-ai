import React, { useEffect, useState } from "react";
import { robotics, RoboticsState } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Panel, Tag } from "../../components/ui";
import { IconAlert } from "../../components/icons";

function PadButton({
  label,
  onPress,
  onRelease,
  disabled,
  className = "",
  ariaLabel,
}: {
  label: string;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPress();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") onRelease();
      }}
      className={`select-none rounded-lg border border-[var(--color-line)] bg-[var(--color-base-800)] font-semibold text-[var(--color-ink)] transition-all active:translate-y-px disabled:opacity-40 ${className}`}
      style={{ minWidth: 64, minHeight: 48 }}
    >
      {label}
    </button>
  );
}

export function ControlPad({ state }: { state: RoboticsState | null }) {
  const { notify, refreshRobotics, telemetry } = useStore();
  const [speed, setSpeed] = useState(120);
  const [holdTimer, setHoldTimer] = useState<number | null>(null);

  const emergency = state?.emergency ?? false;
  const connected = state?.connected ?? false;

  useEffect(() => {
    if (state && !emergency) setSpeed((s) => (state.speed ? state.speed : s));
  }, [state, emergency]);

  const run = async (action: string, s = speed) => {
    if (emergency) {
      notify("warn", "Emergency stop latched — reset the safety system first");
      return;
    }
    const r = await robotics.control(action, s, "manual");
    if (r.ok) {
      refreshRobotics();
    } else {
      notify("error", r.error ?? `Command ${action} blocked`);
      refreshRobotics();
    }
  };

  const press = (action: string) => {
    if (holdTimer) window.clearTimeout(holdTimer);
    run(action);
  };

  const release = async () => {
    if (holdTimer) window.clearTimeout(holdTimer);
    setHoldTimer(window.setTimeout(() => run("STOP", 0), 120));
  };

  const setMotor = async (side: "left" | "right", value: number) => {
    const r = await robotics.motor(side, value);
    if (!r.ok) notify("error", r.error ?? "Motor command blocked");
    refreshRobotics();
  };

  const setServo = async (angle: number) => {
    const r = await robotics.servo(angle);
    if (!r.ok) notify("error", r.error ?? "Servo blocked");
    refreshRobotics();
  };

  const motors = state?.motors ?? { left: 0, right: 0 };
  const battery = telemetry.battery?.value ?? 100;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Directional pad */}
      <Panel title="Manual Control" bodyClassName="p-3">
        <div className="flex flex-col items-center gap-2">
          <div className="mb-2 flex items-center gap-2">
            <Tag color={emergency ? "var(--color-bad)" : "var(--color-good)"}>
              {emergency ? "EMERGENCY STOP" : "ARMED"}
            </Tag>
            <Tag color={connected ? "var(--color-accent)" : "var(--color-ink-faint)"}>
              {state?.mode ?? "MANUAL"}
            </Tag>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div />
            <PadButton label="FORWARD" ariaLabel="move forward" onPress={() => press("FORWARD")} onRelease={release} disabled={emergency} className="border-[var(--color-accent)]/40 text-[var(--color-accent)]" />
            <div />
            <PadButton label="LEFT" ariaLabel="turn left" onPress={() => press("LEFT")} onRelease={release} disabled={emergency} />
            <PadButton label="STOP" ariaLabel="stop" onPress={() => run("STOP", 0)} onRelease={release} disabled={emergency} className="bg-[var(--color-base-700)]" />
            <PadButton label="RIGHT" ariaLabel="turn right" onPress={() => press("RIGHT")} onRelease={release} disabled={emergency} />
            <div />
            <PadButton label="BACKWARD" ariaLabel="move backward" onPress={() => press("BACKWARD")} onRelease={release} disabled={emergency} className="text-[var(--color-bad)]" />
            <div />
          </div>

          <div className="mt-3 w-full max-w-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="panel-title">Speed</span>
              <span className="mono text-[12px] font-semibold text-[var(--color-accent)]">{speed}</span>
            </div>
            <input
              type="range"
              min={0}
              max={state?.limits.max_motor_speed ?? 255}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full"
              disabled={emergency}
            />
            <div className="mt-1 flex justify-between text-[9.5px] text-[var(--color-ink-faint)]">
              <span>0</span>
              <span className="mono">max {state?.limits.max_motor_speed ?? 255}</span>
            </div>
          </div>

          <p className="mono mt-1 text-[10px] text-[var(--color-ink-faint)]">
            last: {state?.last_command || "—"} · {state?.last_command_ts ?? ""}
          </p>
        </div>
      </Panel>

      <div className="flex flex-col gap-3">
        {/* Individual motors */}
        <Panel title="Motors" bodyClassName="p-3">
          <div className="flex flex-col gap-3">
            {(["left", "right"] as const).map((side) => (
              <div key={side} className="rounded-md border border-[var(--color-line)] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="mono text-[12px] uppercase">{side} motor</span>
                  <span className={`mono text-[12px] font-bold ${motors[side] > 0 ? "text-[var(--color-good)]" : motors[side] < 0 ? "text-[var(--color-bad)]" : "text-[var(--color-ink-faint)]"}`}>
                    {motors[side] > 0 ? "FWD" : motors[side] < 0 ? "REV" : "OFF"} {Math.abs(motors[side])}
                  </span>
                </div>
                <input
                  type="range"
                  min={-(state?.limits.max_motor_speed ?? 255)}
                  max={state?.limits.max_motor_speed ?? 255}
                  value={motors[side]}
                  onChange={(e) => setMotor(side, Number(e.target.value))}
                  className="w-full"
                  disabled={emergency}
                />
              </div>
            ))}
            <div className="mono text-[10px] text-[var(--color-ink-faint)]">
              differential drive: forward = both FWD, left = L rev / R fwd
            </div>
          </div>
        </Panel>

        {/* Servo + LED + battery */}
        <Panel title="Actuators & Power" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="panel-title mb-1">Servo</div>
              <div className="rounded-md border border-[var(--color-line)] p-2">
                <div className="mono mb-1 text-center text-[12px] font-semibold text-[var(--color-accent)]">{state?.servo_angle ?? 90}°</div>
                <input
                  type="range"
                  min={0}
                  max={state?.limits.max_servo_angle ?? 180}
                  value={state?.servo_angle ?? 90}
                  onChange={(e) => setServo(Number(e.target.value))}
                  className="w-full"
                  disabled={emergency}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <div className="panel-title mb-1">LED</div>
                <button
                  className={`btn w-full ${state?.led_state ? "btn-primary" : ""}`}
                  onClick={async () => { await robotics.led(!state?.led_state); refreshRobotics(); }}
                  disabled={emergency}
                >
                  {state?.led_state ? "ON — tap to off" : "OFF — tap to on"}
                </button>
              </div>
              <div className="rounded-md border border-[var(--color-line)] p-2">
                <div className="panel-title">Battery</div>
                <div className={`mono mt-0.5 text-[13px] font-bold ${Number(battery) < 20 ? "text-[var(--color-bad)]" : "text-[var(--color-good)]"}`}>
                  {battery}%
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {emergency && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/10 p-2.5">
            <IconAlert size={14} className="mt-0.5 shrink-0 text-[var(--color-bad)]" />
            <p className="text-[11.5px] text-[var(--color-ink-dim)]">
              <span className="mono font-bold text-[var(--color-bad)]">EMERGENCY STOP ENGAGED.</span> All motor commands are
              blocked until you reset the safety system on the <span className="mono">Safety</span> tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}