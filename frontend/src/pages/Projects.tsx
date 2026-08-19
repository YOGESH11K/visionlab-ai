import React, { useCallback, useEffect, useState } from "react";
import { api, Project } from "../lib/api";
import { Panel, Tag } from "../components/ui";
import { CodeBlock } from "../components/CodeBlock";
import { useStore } from "../lib/store";
import { IconAlert } from "../components/icons";

interface Payload {
  components?: string[];
  pins?: { name: string; pin: string }[];
  gestures?: string[];
  notes?: string;
  code?: string;
}

export function Projects() {
  const { notify } = useStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ projects: Project[] }>("/api/projects");
      setProjects(r.projects);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (id: number) => {
    try {
      setSelected(await api.get<Project>(`/api/projects/${id}`));
    } catch (e) {
      notify("error", `Load failed: ${e}`);
    }
  };

  const payload = (selected?.payload ?? {}) as Payload;

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const r = await api.post<{ id: number }>("/api/projects", {
        name,
        description: desc,
        payload: { code },
      });
      notify("success", `Project created (id ${r.id})`);
      setName(""); setDesc(""); setCode("");
      load();
    } catch (e) {
      notify("error", `Create failed: ${e}`);
    } finally {
      setCreating(false);
    }
  };

  const updateNameDesc = async () => {
    if (!selected) return;
    await api.put<Project>(`/api/projects/${selected.id}`, { name: selected.name, description: selected.description });
    notify("success", "Project updated");
    setSelected(await api.get<Project>(`/api/projects/${selected.id}`));
    load();
  };

  const updateCode = async () => {
    if (!selected) return;
    const cur = (selected.payload ?? {}) as Payload;
    await api.put<Project>(`/api/projects/${selected.id}`, { payload: { ...cur, code } });
    notify("success", "Code saved");
    setSelected(await api.get<Project>(`/api/projects/${selected.id}`));
  };

  const remove = async () => {
    if (!selected) return;
    await api.del(`/api/projects/${selected.id}`);
    notify("info", "Project deleted");
    setSelected(null);
    load();
  };

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-3">
        <Panel title="New project" bodyClassName="p-3">
          <div className="flex flex-col gap-2">
            <input className="input" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" placeholder="Short description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <textarea className="input min-h-[60px] resize-y" placeholder="Arduino sketch (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-primary self-start" onClick={create} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </Panel>

        <Panel title={`Projects (${projects.length})`} bodyClassName="overflow-y-auto">
          <div className="flex flex-col gap-1 p-2">
            {projects.map((p) => {
              const pl = (p.payload ?? {}) as Payload;
              return (
                <button
                  key={p.id}
                  className={`rounded-md border px-2.5 py-2 text-left ${
                    selected?.id === p.id
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5"
                      : "border-[var(--color-line)] hover:border-[var(--color-accent)]/40"
                  }`}
                  onClick={() => open(p.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">{p.name}</span>
                    <Tag color="var(--color-ink-faint)">#{p.id}</Tag>
                  </div>
                  <p className="truncate text-[11px] text-[var(--color-ink-faint)]">{p.description}</p>
                  <p className="mono mt-1 text-[9.5px] text-[var(--color-ink-faint)]">
                    {pl.components?.length ?? 0} components · updated {p.updated_at?.slice(0, 10)}
                  </p>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        {selected ? (
          <>
            <Panel
              title={selected.name}
              right={<button className="btn btn-danger" onClick={remove}>Delete</button>}
              bodyClassName="overflow-y-auto"
            >
              <div className="flex flex-col gap-3 p-3">
                <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-dim)]">{selected.description}</p>

                {payload.components && payload.components.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {payload.components.map((c, i) => <Tag key={i} color="var(--color-accent)">{c}</Tag>)}
                  </div>
                )}
                {payload.pins && payload.pins.length > 0 && (
                  <div>
                    <div className="panel-title mb-1">Pins</div>
                    <div className="flex flex-wrap gap-1.5">
                      {payload.pins.map((p, i) => <Tag key={i}>{p.name} → {p.pin}</Tag>)}
                    </div>
                  </div>
                )}
                {payload.gestures && payload.gestures.length > 0 && (
                  <div>
                    <div className="panel-title mb-1">Gestures</div>
                    <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-[var(--color-ink-dim)]">
                      {payload.gestures.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </div>
                )}
                {payload.notes && (
                  <div className="flex items-start gap-2 rounded border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/5 p-2.5">
                    <IconAlert size={13} className="mt-0.5 shrink-0 text-[var(--color-warn)]" />
                    <span className="text-[11.5px] text-[var(--color-ink-dim)]">{payload.notes}</span>
                  </div>
                )}
                {payload.code && <CodeBlock code={payload.code} language="cpp" maxHeight={360} />}
              </div>
            </Panel>

            <Panel title="Edit" bodyClassName="p-3">
              <div className="flex flex-col gap-2">
                <input
                  className="input"
                  value={selected.name}
                  onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                />
                <textarea
                  className="input min-h-[50px] resize-y"
                  value={selected.description}
                  onChange={(e) => setSelected({ ...selected, description: e.target.value })}
                />
                <textarea
                  className="input min-h-[120px] resize-y mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Arduino sketch code"
                />
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={updateNameDesc}>Save name & description</button>
                  <button className="btn" onClick={updateCode}>Save code</button>
                </div>
              </div>
            </Panel>
          </>
        ) : (
          <Panel title="Select a project" bodyClassName="flex items-center justify-center">
            <p className="px-8 text-center text-[12px] text-[var(--color-ink-faint)]">
              Choose a project from the list to view its components, pins, gestures, notes and code.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}