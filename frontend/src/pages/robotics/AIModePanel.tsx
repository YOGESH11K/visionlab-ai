import React, { useCallback, useEffect, useState } from "react";
import { robotics, RoboticsState } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Panel, Tag } from "../../components/ui";
import { IconSparkles, IconShield, IconAlert, IconPlay } from "../../components/icons";

interface Recommendation {
  action: string;
  speed: number;
  reason: string;
  context: Record<string, unknown>;
  safe: boolean;
}

export function AIModePanel({ state }: { state: RoboticsState | null }) {
  const { notify, refreshRobotics, telemetry } = useStore();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [autoLoop, setAutoLoop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ action: string; ts: string }[]>([]);

  const recommend = useCallback(async () => {
    setBusy(true);
    try {
      const r = await robotics.aiRecommend();
      if (r.ok) {
        setRecommendation({ action: r.action, speed: r.speed, reason: r.reason, context: r.context, safe: r.safe });
        setHistory((h) => [...h.slice(-7), { action: r.action, ts: new Date().toLocaleTimeString() }]);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    recommend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoLoop) return;
    const t = setInterval(recommend, 3000);
    return () => clearInterval(t);
  }, [autoLoop, recommend]);

  const apply = async (action?: string) => {
    const a = (action ?? recommendation?.action ?? "STOP") as string;
    const r = await robotics.aiApply(a, recommendation?.speed);
    if (r.ok) {
      notify("success", `AI action applied: ${a} (validated)`);
      refreshRobotics();
    } else {
      notify("error", r.error ?? "AI action blocked");
      refreshRobotics();
    }
    recommend();
  };

  const emergency = state?.emergency ?? false;
  const distance = telemetry.distance?.value ?? 0;
  const battery = telemetry.battery?.value ?? 100;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-3">
        <Panel
          title="AI Autonomous Mode (Experimental)"
          right={
            <div className="flex items-center gap-2">
              <Tag color={state?.mode === "AUTONOMOUS" ? "var(--color-violet)" : "var(--color-ink-faint)"}>
                {state?.mode === "AUTONOMOUS" ? "AUTONOMOUS" : "SUGGEST ONLY"}
              </Tag>
              <button className="btn" onClick={() => setAutoLoop((v) => !v)} disabled={emergency}>
                {autoLoop ? "Stop loop" : "Auto-analyze"}
              </button>
            </div>
          }
          bodyClassName="overflow-y-auto"
        >
          <div className="flex flex-col gap-3 p-3">
            {emergency && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/10 p-3">
                <IconAlert size={15} className="mt-0.5 shrink-0 text-[var(--color-bad)]" />
                <div className="text-[12px] leading-snug text-[var(--color-ink-dim)]">
                  <span className="mono font-bold text-[var(--color-bad)]">SAFETY LATCH ACTIVE.</span> AI recommendations are
                  read-only. Reset the emergency system to allow autonomous actions.
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-[var(--color-violet)]/30 bg-[var(--color-violet)]/5 p-3">
              <IconSparkles size={16} className="mt-0.5 shrink-0 text-[var(--color-violet)]" />
              <div className="min-w-0">
                <div className="mono text-[10px] uppercase tracking-widest text-[var(--color-violet)]">AI DECISION</div>
                {recommendation ? (
                  <>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="mono text-[22px] font-extrabold tracking-wide text-[var(--color-ink)]">
                        {recommendation.action.replace("_", " ")}
                      </span>
                      <Tag color="var(--color-violet)">speed {recommendation.speed}</Tag>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-dim)]">{recommendation.reason}</p>
                    <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--color-ink-faint)]">
                      {Object.entries(recommendation.context).map(([k, v]) => (
                        <span key={k}><span className="text-[var(--color-accent)]">{k}</span>: {String(v)}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-[12px] text-[var(--color-ink-dim)]">Analyzing sensor data…</p>
                )}
              </div>
            </div>

            {/* Safety pipeline */}
            <div className="rounded-lg border border-[var(--color-line)] p-3">
              <div className="panel-title mb-2">Execution pipeline</div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                {["AI DECISION", "SAFETY VALIDATOR", "COMMAND QUEUE", "HARDWARE"].map((stage, i, arr) => (
                  <React.Fragment key={stage}>
                    <div
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10.5px] font-semibold ${
                        i === 1 ? "border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 text-[var(--color-warn)]"
                        : "border-[var(--color-line)] text-[var(--color-ink-dim)]"
                      }`}
                    >
                      <IconShield size={12} className={i === 1 ? "text-[var(--color-warn)]" : ""} />
                      {stage}
                    </div>
                    {i < arr.length - 1 && <span className="mono hidden text-[10px] text-[var(--color-ink-faint)] sm:block">→</span>}
                  </React.Fragment>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-[var(--color-ink-faint)]">
                AI output is never executed directly. It must pass the safety validator (limits, emergency latch, sensor
                thresholds) before entering the command queue.
              </p>
            </div>

            <div className="flex gap-2">
              <button className="btn btn-violet" onClick={() => apply()} disabled={emergency || busy}>
                <IconPlay size={12} /> {emergency ? "Blocked by safety" : "Execute recommendation"}
              </button>
              <button className="btn" onClick={recommend} disabled={busy}>Re-analyze</button>
              <button className="btn" onClick={() => apply("EMERGENCY")}>Emergency</button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Sensor Context" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Distance", `${distance} cm`, "var(--color-accent)"],
              ["Battery", `${battery}%`, "var(--color-good)"],
              ["Mode", state?.mode ?? "—", "var(--color-violet)"],
              ["Sequence", state?.sequence_running ? "RUNNING" : "IDLE", state?.sequence_running ? "var(--color-accent)" : "var(--color-ink-faint)"],
            ].map(([k, v, c]) => (
              <div key={k as string} className="rounded-md border border-[var(--color-line)] p-2.5">
                <div className="panel-title">{k}</div>
                <div className="mono mt-0.5 text-[13px] font-bold" style={{ color: c as string }}>{v}</div>
              </div>
            ))}
          </div>
          <p className="mono mt-2 text-[10px] text-[var(--color-ink-faint)]">
            Context is built from live telemetry + connected hardware state.
          </p>
        </Panel>

        <Panel title="AI Action History" bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-1 p-2">
            {[...history].reverse().map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-2.5 py-1.5">
                <span className="mono text-[11px] text-[var(--color-ink)]">{h.action}</span>
                <span className="mono text-[9.5px] text-[var(--color-ink-faint)]">{h.ts}</span>
              </div>
            ))}
            {history.length === 0 && <p className="p-2 text-[11.5px] text-[var(--color-ink-faint)]">No recommendations yet.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}