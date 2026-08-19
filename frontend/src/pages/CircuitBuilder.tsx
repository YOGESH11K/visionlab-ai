import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { useStore } from "../lib/store";
import { IconAlert } from "../components/icons";

interface CatalogComp {
  name: string;
  pins: { name: string; role: string; voltage: string }[];
}
interface Placed {
  id: string;
  type: string;
}
interface Conn {
  id: number;
  from: { comp: string; pin: string };
  to: { comp: string; pin: string };
}
interface Report {
  status: string;
  summary: string;
  connections: { connection_id?: number; status: string; message: string }[];
  warnings: string[];
}

const OVERALL: Record<string, { color: string; label: string }> = {
  MATCH: { color: "var(--color-good)", label: "VALID" },
  WARNINGS: { color: "var(--color-warn)", label: "WARNINGS" },
  INVALID: { color: "var(--color-bad)", label: "INVALID" },
};

const CONN_COLOR: Record<string, string> = {
  GREEN: "var(--color-good)",
  YELLOW: "var(--color-warn)",
  RED: "var(--color-bad)",
};

let counter = 1;

export function CircuitBuilder() {
  const { notify } = useStore();
  const [catalog, setCatalog] = useState<Record<string, CatalogComp>>({});
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [newType, setNewType] = useState("");
  const [conns, setConns] = useState<Conn[]>([]);
  const [selFrom, setSelFrom] = useState({ comp: "", pin: "" });
  const [selTo, setSelTo] = useState({ comp: "", pin: "" });
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    api.get<{ components: Record<string, CatalogComp> }>("/api/circuits/components").then((r) => {
      setCatalog(r.components);
      setNewType(Object.keys(r.components)[0] ?? "");
    }).catch(() => {});
  }, []);

  const addComponent = () => {
    if (!newType) return;
    const id = `${newType}_${counter++}`;
    setPlaced((p) => [...p, { id, type: newType }]);
    setReport(null);
  };

  const pinsOf = (compId: string) => {
    const p = placed.find((x) => x.id === compId);
    if (!p) return [];
    return catalog[p.type]?.pins ?? [];
  };

  const addConn = () => {
    if (!selFrom.comp || !selFrom.pin || !selTo.comp || !selTo.pin || selFrom.comp === selTo.comp) return;
    setConns((c) => [...c, { id: counter++, from: selFrom, to: selTo }]);
    setReport(null);
  };

  const validate = async () => {
    try {
      const r = await api.post<Report>("/api/circuits/validate", {
        components: placed.map((p) => ({ id: p.id, type: p.type })),
        connections: conns,
      });
      setReport(r);
    } catch (e) {
      notify("error", `Validation failed: ${e}`);
    }
  };

  const overall = report ? OVERALL[report.status] : null;

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[1fr_360px]">
      <div className="flex min-h-0 flex-col gap-3">
        <Panel
          title="Components & Connections"
          right={overall && <Tag color={overall.color}>{overall.label}</Tag>}
          bodyClassName="overflow-y-auto"
        >
          <div className="flex flex-col gap-4 p-3">
            <div className="flex gap-2">
              <select className="select" value={newType} onChange={(e) => setNewType(e.target.value)}>
                {Object.entries(catalog).map(([id, c]) => (
                  <option key={id} value={id}>{c.name}</option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={addComponent}>Place component</button>
            </div>

            <div>
              <div className="panel-title mb-1.5">Placed components</div>
              {placed.length === 0 && (
                <p className="text-[12px] text-[var(--color-ink-faint)]">No components yet.</p>
              )}
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {placed.map((p) => (
                  <div key={p.id} className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[12px] text-[var(--color-ink)]">{p.id}</span>
                      <button
                        className="text-[11px] text-[var(--color-bad)]"
                        onClick={() => {
                          setPlaced((ps) => ps.filter((x) => x.id !== p.id));
                          setConns((cs) => cs.filter((c) => c.from.comp !== p.id && c.to.comp !== p.id));
                          setReport(null);
                        }}
                      >
                        remove
                      </button>
                    </div>
                    <span className="text-[10.5px] text-[var(--color-ink-faint)]">
                      {catalog[p.type]?.name} · {pinsOf(p.id).length} pins
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="panel-title mb-1.5">Add connection</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">From</span>
                  <select className="select" value={selFrom.comp} onChange={(e) => { setSelFrom({ comp: e.target.value, pin: pinsOf(e.target.value)[0]?.name ?? "" }); }}>
                    <option value="">Component…</option>
                    {placed.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                  </select>
                  <select className="select" value={selFrom.pin} onChange={(e) => setSelFrom({ ...selFrom, pin: e.target.value })}>
                    {pinsOf(selFrom.comp).map((pin) => <option key={pin.name} value={pin.name}>{pin.name}</option>)}
                  </select>
                </label>
                <span className="pb-2 text-[var(--color-ink-faint)]">→</span>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">To</span>
                  <select className="select" value={selTo.comp} onChange={(e) => { setSelTo({ comp: e.target.value, pin: pinsOf(e.target.value)[0]?.name ?? "" }); }}>
                    <option value="">Component…</option>
                    {placed.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                  </select>
                  <select className="select" value={selTo.pin} onChange={(e) => setSelTo({ ...selTo, pin: e.target.value })}>
                    {pinsOf(selTo.comp).map((pin) => <option key={pin.name} value={pin.name}>{pin.name}</option>)}
                  </select>
                </label>
                <button className="btn btn-primary" onClick={addConn} disabled={placed.length < 2}>Add</button>
              </div>
            </div>

            {conns.length > 0 && (
              <div>
                <div className="panel-title mb-1.5">Connections ({conns.length})</div>
                <div className="space-y-1">
                  {conns.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded border border-[var(--color-line)] px-2.5 py-1.5">
                      <span className="mono text-[12px]">
                        {c.from.comp}.{c.from.pin} → {c.to.comp}.{c.to.pin}
                      </span>
                      <button className="text-[11px] text-[var(--color-bad)]" onClick={() => { setConns((cs) => cs.filter((x) => x.id !== c.id)); setReport(null); }}>
                        remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn btn-primary self-start" onClick={validate} disabled={conns.length === 0}>
              Validate circuit
            </button>
          </div>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <Panel title="Validation report" bodyClassName="overflow-y-auto">
          <div className="space-y-4 p-3">
            {!report && (
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                Place components, add connections, then run validation to see a report.
              </p>
            )}
            {report && overall && (
              <>
                <div
                  className="flex items-center gap-2 rounded-md border px-3 py-2.5"
                  style={{ borderColor: overall.color, background: `color-mix(in srgb, ${overall.color} 8%, transparent)` }}
                >
                  <IconAlert size={16} style={{ color: overall.color }} />
                  <div>
                    <span className="mono text-[13px] font-bold" style={{ color: overall.color }}>{report.status}</span>
                    <span className="ml-2 text-[11.5px] text-[var(--color-ink-dim)]">{report.summary}</span>
                  </div>
                </div>

                {report.connections.length > 0 && (
                  <div>
                    <div className="panel-title mb-1">Per-connection results</div>
                    <div className="space-y-1">
                      {report.connections.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 rounded border border-[var(--color-line)] px-2.5 py-1.5">
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CONN_COLOR[c.status] ?? "var(--color-ink-faint)" }} />
                          <span className="mono text-[10.5px] text-[var(--color-ink-faint)]">#{c.connection_id ?? i + 1}</span>
                          <span className="text-[11.5px] text-[var(--color-ink-dim)]">{c.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.warnings.length > 0 && (
                  <div>
                    <div className="panel-title mb-1" style={{ color: "var(--color-warn)" }}>Warnings ({report.warnings.length})</div>
                    <ul className="space-y-1">
                      {report.warnings.map((w, i) => (
                        <li key={i} className="rounded border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-ink-dim)]">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="mono text-[10px] text-[var(--color-ink-faint)]">
                  Teaching-grade checker — not a full electrical simulator. Always double-check with a datasheet.
                </p>
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}