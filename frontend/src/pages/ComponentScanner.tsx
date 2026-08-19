import React, { useEffect, useState } from "react";
import { api, ComponentInfo } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { useStore } from "../lib/store";
import { IconAlert, IconScan } from "../components/icons";

interface Candidate {
  id: string;
  name: string;
  confidence: number;
  bbox?: number[];
  possible: boolean;
}

export function ComponentScanner() {
  const { notify } = useStore();
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [guidance, setGuidance] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<ComponentInfo | null>(null);
  const [identifyName, setIdentifyName] = useState("");
  const [scanNote, setScanNote] = useState("");

  useEffect(() => {
    api.get<{ components: ComponentInfo[] }>("/api/components").then((r) => {
      setComponents(r.components);
    }).catch(() => {});
  }, []);

  const scan = async () => {
    setScanning(true);
    setCandidates([]);
    try {
      const r = await api.post<{
        candidates: Candidate[];
        guidance: string[];
        note?: string;
      }>("/api/components/scan");
      setCandidates(r.candidates ?? []);
      setGuidance(r.guidance ?? []);
      setScanNote(r.note ?? "");
      notify("info", r.candidates?.length ? "Scan complete — possible matches" : "Scan complete — no candidates");
    } catch (e) {
      notify("error", `Scan failed: ${e}`);
    } finally {
      setScanning(false);
    }
  };

  const identify = async () => {
    if (!identifyName) return;
    try {
      const r = await api.get<ComponentInfo>(`/api/components/identify/${identifyName}`);
      setSelected(r);
    } catch (e) {
      notify("error", `Unknown component: ${identifyName}`);
    }
  };

  return (
    <div className="grid h-full gap-3 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Panel
          title="Experimental Component Scanner"
          right={<Tag color="var(--color-warn)">EXPERIMENTAL</Tag>}
          bodyClassName="overflow-y-auto"
        >
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/5 p-2.5">
              <IconAlert size={14} className="mt-0.5 shrink-0 text-[var(--color-warn)]" />
              <p className="text-[11.5px] leading-snug text-[var(--color-ink-dim)]">
                This scanner uses heuristic image analysis. It never claims a confident
                identification — results are <span className="mono text-[var(--color-warn)]">possible matches</span>.
                Use manual identification below for verified component information.
              </p>
            </div>

            <button className="btn btn-primary self-start" onClick={scan} disabled={scanning}>
              <IconScan size={14} /> {scanning ? "Scanning…" : "Scan current frame"}
            </button>

            {scanNote && <p className="mono text-[10.5px] text-[var(--color-ink-faint)]">{scanNote}</p>}

            {candidates.length > 0 ? (
              <div className="space-y-2">
                {candidates.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-3 py-2">
                    <span className="text-[12.5px] text-[var(--color-ink)]">{c.name}</span>
                    <span className="mono text-[11px]" style={{ color: c.confidence >= 0.6 ? "var(--color-warn)" : "var(--color-ink-faint)" }}>
                      {Math.round(c.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                No scan results yet. Point the camera at a component and scan.
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
        {selected ? (
          <ComponentInfoPanel comp={selected} />
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

export function ComponentInfoPanel({ comp }: { comp: ComponentInfo }) {
  return (
    <Panel title={comp.name} bodyClassName="overflow-y-auto" className="min-h-0">
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