import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, ComponentInfo } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { useStore } from "../lib/store";
import { IconAlert, IconCamera, IconRefresh, IconScan } from "../components/icons";

interface Candidate {
  id: string;
  name: string;
  confidence: number;
  bbox?: number[];
  possible: boolean;
  hint?: string;
  info?: ComponentInfo | null;
  answer?: ComponentAnswer | null;
}

interface ComponentAnswer {
  id: string;
  name: string;
  category: string;
  answer: string;
  why: string;
  pins: { name: string; function: string; value: string }[];
  voltage: string;
  current: string;
  how_it_works: string;
  interfaces: string[];
  applications: string[];
}

interface RecognizeResult {
  experimental: boolean;
  source?: "ai" | "heuristic" | "none";
  candidates: Candidate[];
  note?: string;
  guidance?: string[];
  top_match?: ComponentInfo | null;
  answer?: ComponentAnswer | null;
}

export function ComponentScanner() {
  const { notify } = useStore();
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [guidance, setGuidance] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [selected, setSelected] = useState<ComponentInfo | null>(null);
  const [answer, setAnswer] = useState<ComponentAnswer | null>(null);
  const [source, setSource] = useState<"ai" | "heuristic" | "none">("none");
  const [identifyName, setIdentifyName] = useState("");
  const [lastScan, setLastScan] = useState<string>("");
  const [camError, setCamError] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoRef = useRef<number | null>(null);
  const scanLock = useRef(false);

  useEffect(() => {
    api.get<{ components: ComponentInfo[] }>("/api/components").then((r) => {
      setComponents(r.components);
    }).catch(() => {});
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamError("");
    } catch (e) {
      setCamError(`Camera unavailable: ${(e as Error).message}. You can still scan using manual identification.`);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [startCamera]);

  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
  }, []);

  const scan = useCallback(async () => {
    if (scanning || scanLock.current) return;
    scanLock.current = true;
    setScanning(true);
    try {
      const blob = await capture();
      if (!blob) {
        setCandidates([]);
        setGuidance(["Camera not ready yet. Make sure this tab is not blocked from accessing the camera."]);
        return;
      }
      const r = await api.upload<RecognizeResult>("/api/components/recognize/upload", blob, "frame.jpg");
      setCandidates(r.candidates ?? []);
      setGuidance(r.guidance ?? []);
      setLastScan(new Date().toLocaleTimeString());
      setSource(r.source ?? "none");
      setAnswer(r.answer ?? null);
      if (r.top_match && !selected) {
        setSelected(r.top_match);
      }
    } catch (e) {
      notify("error", `Scan failed: ${e}`);
    } finally {
      setScanning(false);
      scanLock.current = false;
    }
  }, [scanning, selected, capture, notify]);

  // Auto-scan every 2.5s while camera is live
  useEffect(() => {
    if (!autoScan) return;
    autoRef.current = window.setInterval(() => {
      scan();
    }, 2500);
    return () => {
      if (autoRef.current) window.clearInterval(autoRef.current);
    };
  }, [autoScan, scan]);

  const identify = async () => {
    if (!identifyName) return;
    try {
      const r = await api.get<ComponentInfo>(`/api/components/identify/${identifyName}`);
      setSelected(r);
    } catch (e) {
      notify("error", `Unknown component: ${identifyName}`);
    }
  };

  const openCandidate = (c: Candidate) => {
    if (c.answer) setAnswer(c.answer);
    if (c.info) {
      setSelected(c.info);
    } else if (c.id && c.id !== "breadboard") {
      api.get<ComponentInfo>(`/api/components/${c.id}`).then(setSelected).catch(() => {});
    }
  };

  const openAnswerDetails = useCallback(() => {
    if (!answer) return;
    api.get<ComponentInfo>(`/api/components/${answer.id}`).then(setSelected).catch(() => {});
  }, [answer]);

  return (
    <div className="grid h-full gap-3 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col gap-3">
        <Panel title="Camera Component Recognition" bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/5 p-2.5">
              <IconAlert size={14} className="mt-0.5 shrink-0 text-[var(--color-warn)]" />
              <p className="text-[11.5px] leading-snug text-[var(--color-ink-dim)]">
                Point your device camera at any electronic or robotics component. VisionLab identifies it
                and answers with its <span className="mono text-[var(--color-ink)]">name, pins and why it is used</span>.
                With an AI vision key configured the answer is decisive; without one it falls back to honest{" "}
                <span className="mono text-[var(--color-warn)]">possible matches</span>, never false certainties.
              </p>
            </div>

            {/* local browser camera feed */}
            <div className="relative overflow-hidden rounded-md border border-[var(--color-line)] bg-black">
              <video ref={videoRef} className="h-full w-full object-contain" muted playsInline />
              {candidates.length > 0 && (
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 640 480" preserveAspectRatio="xMidYMid meet">
                  {candidates.map((c, i) => {
                    if (!c.bbox || c.bbox.length !== 4) return null;
                    const [bx, by, bw, bh] = c.bbox;
                    return (
                      <g key={i}>
                        <rect
                          x={bx}
                          y={by}
                          width={bw}
                          height={bh}
                          fill="none"
                          stroke={c.info ? "var(--color-accent)" : "var(--color-warn)"}
                          strokeWidth="1.6"
                        />
                        <rect x={bx} y={Math.max(0, by - 18)} width={Math.min(bw + 40, 640 - bx)} height="18" fill={c.info ? "#7c3aed" : "#b45309"} />
                        <text x={bx + 4} y={Math.max(12, by - 5)} fontSize="10.5" fill="#fff" className="mono">
                          {c.name} {Math.round(c.confidence * 100)}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
              {camError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
                  <p className="mono max-w-md text-center text-[11.5px] leading-snug text-[var(--color-warn)]">
                    {camError}
                  </p>
                </div>
              )}
              {!camError && !streamRef.current && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <span className="mono text-[12px] uppercase tracking-widest text-[var(--color-warn)]">
                    Starting camera…
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button className="btn btn-primary" onClick={scan} disabled={scanning}>
                <IconScan size={14} /> {scanning ? "Scanning…" : "Scan now"}
              </button>
              <button
                className="btn"
                style={{ borderColor: autoScan ? "var(--color-good)" : undefined }}
                onClick={() => setAutoScan((a) => !a)}
              >
                <IconCamera size={14} /> Auto {autoScan ? "ON" : "OFF"}
              </button>
              <button className="btn" onClick={startCamera} title="Re-open camera">
                <IconRefresh size={14} /> Restart cam
              </button>
              <span className="mono ml-auto text-[10px] text-[var(--color-ink-faint)]">
                {lastScan ? `last ${lastScan}` : "no scan yet"}
              </span>
            </div>

            {candidates.length > 0 ? (
              <div className="space-y-1.5">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    className="flex w-full items-center justify-between rounded-md border border-[var(--color-line)] px-3 py-2 text-left hover:border-[var(--color-accent)]"
                    onClick={() => openCandidate(c)}
                  >
                    <span className="flex items-center gap-2 text-[12.5px] text-[var(--color-ink)]">
                      {c.info && <IconRefresh size={12} className="text-[var(--color-accent)]" />}
                      {c.name}
                      {c.confidence < 0.5 && (
                        <span className="mono rounded border border-[var(--color-warn)]/50 bg-[var(--color-warn)]/10 px-1 py-0.5 text-[8.5px] uppercase tracking-wide text-[var(--color-warn)]">
                          low confidence
                        </span>
                      )}
                    </span>
                    <span className="mono text-[11px]" style={{ color: c.confidence >= 0.6 ? "var(--color-warn)" : "var(--color-ink-faint)" }}>
                      {Math.round(c.confidence * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                No candidates yet. Point the camera at a component and scan (or keep Auto ON).
              </p>
            )}

            {guidance.length > 0 && (
              <div className="mt-1">
                <div className="panel-title mb-1">Improve detection</div>
                <ul className="ml-4 list-disc space-y-0.5 text-[11.5px] text-[var(--color-ink-dim)]">
                  {guidance.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Manual Identification" bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-2 p-3">
            <p className="text-[11.5px] text-[var(--color-ink-faint)]">
              Select a component to load its full verified knowledge panel.
            </p>
            <div className="flex gap-2">
              <select className="select flex-1" value={identifyName} onChange={(e) => setIdentifyName(e.target.value)}>
                <option value="">Select component…</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={identify} disabled={!identifyName}>
                Load
              </button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        {answer && (
          <AnswerPanel answer={answer} source={source} onOpen={openAnswerDetails} />
        )}
        {selected ? (
          <ComponentInfoPanel comp={selected} onClose={() => setSelected(null)} />
        ) : (
          <Panel title="Component Information" bodyClassName="flex items-center justify-center">
            <p className="px-6 text-center text-[12px] text-[var(--color-ink-faint)]">
              Detection panel. When a component is identified you'll see its name, description,
              pins, electrical data, Arduino wiring, ESP32 notes, common mistakes and safety notes here.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

export function AnswerPanel({
  answer,
  source,
  onOpen,
}: {
  answer: ComponentAnswer;
  source: "ai" | "heuristic" | "none";
  onOpen?: () => void;
}) {
  const ai = source === "ai";
  return (
    <Panel
      title="Detected Component"
      right={
        <span
          className="mono rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
          style={{
            color: ai ? "var(--color-good)" : "var(--color-warn)",
            border: `1px solid ${ai ? "var(--color-good)" : "var(--color-warn)"}55`,
            background: `${ai ? "var(--color-good)" : "var(--color-warn)"}11`,
          }}
        >
          {ai ? "AI vision" : "heuristic"}
        </span>
      }
      bodyClassName="overflow-y-auto"
      className="min-h-0"
    >
      <div className="space-y-3 p-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">{answer.name}</h3>
            <Tag color={ai ? "var(--color-good)" : "var(--color-warn)"}>
              {answer.category}
            </Tag>
          </div>
          {ai ? (
            <p className="mt-1 text-[11.5px] text-[var(--color-good)]">
              Identified by AI vision — answer below is from the verified knowledge base.
            </p>
          ) : (
            <p className="mt-1 text-[11.5px] text-[var(--color-warn)]">
              Possible match from visual heuristics — answer from the verified knowledge base.
            </p>
          )}
        </div>

        <section className="rounded border border-[var(--color-good)]/30 bg-[var(--color-good)]/5 p-2.5">
          <div className="panel-title mb-1">Answer</div>
          <p className="text-[13px] leading-relaxed text-[var(--color-ink)]">{answer.answer}</p>
        </section>

        <section>
          <div className="panel-title mb-1">Why we use it</div>
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{answer.why}</p>
        </section>

        <section>
          <div className="panel-title mb-1">Pins</div>
          <div className="space-y-1">
            {answer.pins.length > 0 ? (
              answer.pins.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded border border-[var(--color-line)] px-2.5 py-1.5 text-[12px]">
                  <span className="mono font-semibold text-[var(--color-ink)]">{p.name}</span>
                  <span className="text-[var(--color-ink-dim)]">{p.function}</span>
                  <span className="mono text-[10.5px] text-[var(--color-ink-faint)]">{p.value}</span>
                </div>
              ))
            ) : (
              <p className="text-[11.5px] text-[var(--color-ink-faint)]">No pin data available.</p>
            )}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-[var(--color-line)] p-2.5">
            <div className="panel-title">Voltage</div>
            <div className="mt-1 text-[12px] text-[var(--color-ink)]">{answer.voltage || "n/a"}</div>
          </div>
          <div className="rounded border border-[var(--color-line)] p-2.5">
            <div className="panel-title">Current</div>
            <div className="mt-1 text-[12px] text-[var(--color-ink)]">{answer.current || "n/a"}</div>
          </div>
        </div>

        {answer.how_it_works && (
          <section>
            <div className="panel-title mb-1">How it works</div>
            <p className="text-[12px] leading-relaxed text-[var(--color-ink-dim)]">{answer.how_it_works}</p>
          </section>
        )}

        {onOpen && (
          <button className="btn btn-primary w-full" onClick={onOpen}>
            Full details &amp; wiring
          </button>
        )}
      </div>
    </Panel>
  );
}

export function ComponentInfoPanel({ comp, onClose }: { comp: ComponentInfo; onClose?: () => void }) {
  return (
    <Panel
      title={comp.name}
      right={onClose ? (
        <button className="mono text-[11px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]" onClick={onClose}>
          close
        </button>
      ) : undefined}
      bodyClassName="overflow-y-auto"
      className="min-h-0"
    >
      <div className="space-y-4 p-3">
        <div className="flex items-center gap-2">
          <Tag color="var(--color-accent)">{comp.category}</Tag>
          <span className="text-[11px] text-[var(--color-ink-faint)]">
            aliases: {comp.aliases.join(", ")}
          </span>
        </div>

        <section>
          <div className="panel-title mb-1">Description</div>
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{comp.description}</p>
        </section>

        <section>
          <div className="panel-title mb-1">How it works</div>
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{comp.working}</p>
        </section>

        <section>
          <div className="panel-title mb-1">Pins</div>
          <div className="space-y-1">
            {comp.pins.map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded border border-[var(--color-line)] px-2.5 py-1.5 text-[12px]">
                <span className="mono font-semibold text-[var(--color-ink)]">{p.name}</span>
                <span className="text-[var(--color-ink-dim)]">{p.function}</span>
                <span className="mono text-[10.5px] text-[var(--color-ink-faint)]">{p.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <div className="rounded border border-[var(--color-line)] p-2.5">
            <div className="panel-title">Voltage</div>
            <div className="mt-1 text-[12px] text-[var(--color-ink)]">{comp.voltage}</div>
          </div>
          <div className="rounded border border-[var(--color-line)] p-2.5">
            <div className="panel-title">Current</div>
            <div className="mt-1 text-[12px] text-[var(--color-ink)]">{comp.current}</div>
          </div>
        </section>

        {comp.arduino_examples.length > 0 && (
          <section>
            <div className="panel-title mb-1">Arduino examples</div>
            <div className="space-y-2">
              {comp.arduino_examples.map((ex, i) => (
                <details key={i} className="rounded border border-[var(--color-line)]">
                  <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] text-[var(--color-ink)]">
                    {ex.title}
                  </summary>
                  <div className="border-t border-[var(--color-line)] px-2.5 py-2 text-[11.5px]">
                    <div className="mb-1 text-[var(--color-ink-dim)]">
                      <span className="panel-title">Wiring: </span>
                      {ex.wiring}
                    </div>
                    <pre className="mono overflow-x-auto rounded bg-[var(--color-base-950)] p-2 text-[11px] text-[var(--color-ink)]">
                      {ex.code}
                    </pre>
                  </div>
                </details>
              ))}
            </div>
            <p className="mono mt-2 text-[10px] text-[var(--color-warn)]">
              Pin mappings depend on your board and project — these are reference examples, not universal rules.
            </p>
          </section>
        )}

        <section>
          <div className="panel-title mb-1">ESP32 notes</div>
          <p className="text-[12px] leading-relaxed text-[var(--color-ink-dim)]">{comp.esp32_notes}</p>
        </section>

        <section>
          <div className="panel-title mb-1">Common mistakes</div>
          <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-[var(--color-ink-dim)]">
            {comp.common_mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>

        <section>
          <div className="panel-title mb-1">Applications</div>
          <div className="flex flex-wrap gap-1.5">
            {comp.applications.map((a, i) => (
              <Tag key={i}>{a}</Tag>
            ))}
          </div>
        </section>

        <section className="rounded border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/5 p-2.5">
          <div className="panel-title mb-1">Safety</div>
          <p className="text-[12px] leading-relaxed text-[var(--color-ink-dim)]">{comp.safety_notes}</p>
        </section>
      </div>
    </Panel>
  );
}