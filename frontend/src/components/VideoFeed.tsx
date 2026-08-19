import React, { useEffect, useRef, useState } from "react";
import { Detection } from "../lib/api";
import { useVideoFeed } from "../lib/useVideo";
import { IconPlay, IconPause, IconRefresh } from "./icons";
import { api } from "../lib/api";

export function VideoFeed({ height = 360 }: { height?: number }) {
  const { connected, frame, send } = useVideoFeed(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const [paused, setPaused] = useState(false);
  const [showAr, setShowAr] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showBbox, setShowBbox] = useState(true);
  const [simGesture, setSimGesture] = useState("THREE_FINGERS");
  const [mode, setMode] = useState<string>("");

  useEffect(() => {
    if (frame) {
      setMode(frame.mode);
    }
  }, [frame?.mode]);

  const toggleDetection = async (enabled: boolean) => {
    await api.post("/api/vision/detection", { enabled });
  };
  const updateOverlays = async () => {
    await api.post("/api/vision/overlays", { landmarks: showLandmarks, bbox: showBbox, ar: showAr });
  };

  const det: Detection = frame?.detection ?? {};
  const conf = det.confidence ?? 0;

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[1fr_260px]">
      <div className="relative overflow-hidden rounded-md border border-[var(--color-line)] bg-black grid-bg">
        {paused ? (
          <div className="flex h-full items-center justify-center text-[var(--color-ink-faint)]">
            <span className="mono text-[12px] uppercase tracking-widest">Feed paused</span>
          </div>
        ) : (
          <img
            ref={imgRef}
            src={frame?.jpeg ? `data:image/jpeg;base64,${frame.jpeg}` : undefined}
            alt="vision feed"
            className="h-full w-full object-contain"
            style={{ filter: "none" }}
          />
        )}

        {/* detection overlay (React-drawn from JSON, stays crisp) */}
        {!paused && showLandmarks && det.landmarks && det.landmarks.length > 0 && (
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 640 480" preserveAspectRatio="xMidYMid meet">
            {det.landmarks.map((p, i) => (
              <circle key={i} cx={p[0] * 640} cy={p[1] * 480} r="2.4" fill="#34d399" />
            ))}
            {showBbox && det.landmarks.length > 0 && (
              <g>
                {(() => {
                  const xs = det.landmarks.map((p) => p[0] * 640);
                  const ys = det.landmarks.map((p) => p[1] * 480);
                  const x0 = Math.min(...xs);
                  const y0 = Math.min(...ys);
                  const x1 = Math.max(...xs);
                  const y1 = Math.max(...ys);
                  return (
                    <>
                      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="#50b8ff" strokeWidth="1.2" />
                      <text x={x0} y={Math.max(12, y0 - 5)} fill="#50b8ff" fontSize="11" className="mono">
                        {det.handedness ?? ""} HAND
                      </text>
                    </>
                  );
                })()}
              </g>
            )}
          </svg>
        )}

        {/* AR info strip */}
        {showAr && (
          <div className="pointer-events-none absolute left-2 top-2 rounded border border-[var(--color-line)] bg-black/60 px-2 py-1.5 backdrop-blur">
            <div className="mono text-[10px] text-[var(--color-accent)]">
              FPS {frame?.fps?.toFixed?.(0) ?? "…"} · MODE {mode.toUpperCase()}
            </div>
            <div className="mono mt-0.5 text-[10px] text-[var(--color-ink-dim)]">
              {det.gesture ?? "NO_HAND"} · conf {(conf * 100).toFixed(0)}%
            </div>
          </div>
        )}

        {!connected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="mono text-[12px] uppercase tracking-widest text-[var(--color-warn)]">
              Connecting to vision service…
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Camera Control</span>
            <span className={`mono text-[10px] ${connected ? "text-[var(--color-good)]" : "text-[var(--color-bad)]"}`}>
              {connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
          <div className="flex flex-col gap-2 p-3">
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={() => { setPaused((p) => !p); send({ type: "pause" }); }}>
                {paused ? <IconPlay size={13} /> : <IconPause size={13} />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button className="btn flex-1" onClick={() => api.post("/api/vision/reset")}>
                <IconRefresh size={13} /> Reset
              </button>
            </div>

            <label className="flex items-center justify-between text-[12px] text-[var(--color-ink-dim)]">
              <span>Detection</span>
              <input type="checkbox" defaultChecked onChange={(e) => toggleDetection(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-[12px] text-[var(--color-ink-dim)]">
              <span>Hand landmarks</span>
              <input type="checkbox" checked={showLandmarks} onChange={(e) => { setShowLandmarks(e.target.checked); updateOverlays(); }} />
            </label>
            <label className="flex items-center justify-between text-[12px] text-[var(--color-ink-dim)]">
              <span>Bounding box</span>
              <input type="checkbox" checked={showBbox} onChange={(e) => { setShowBbox(e.target.checked); updateOverlays(); }} />
            </label>
            <label className="flex items-center justify-between text-[12px] text-[var(--color-ink-dim)]">
              <span>AR overlay</span>
              <input type="checkbox" checked={showAr} onChange={(e) => { setShowAr(e.target.checked); updateOverlays(); }} />
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Simulation Gesture</span>
          </div>
          <div className="p-3">
            <p className="mb-2 text-[11px] text-[var(--color-ink-faint)]">
              Drive the virtual hand when no webcam is available. Clearly labelled SIMULATION.
            </p>
            <select
              className="select w-full"
              value={simGesture}
              onChange={async (e) => {
                setSimGesture(e.target.value);
                await api.post("/api/vision/sim/gesture", { gesture: e.target.value });
              }}
            >
              {[
                "ZERO_FINGERS", "ONE_FINGER", "TWO_FINGERS", "THREE_FINGERS",
                "FOUR_FINGERS", "OPEN_PALM", "FIST", "THUMB_UP", "THUMB_DOWN",
                "PEACE", "POINT", "PINCH", "SWIPE_LEFT", "SWIPE_RIGHT",
              ].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {mode === "simulation" && (
              <div className="mono mt-2 rounded border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 px-2 py-1 text-[10.5px] text-[var(--color-warn)]">
                SIMULATION — no webcam detected on the backend
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}