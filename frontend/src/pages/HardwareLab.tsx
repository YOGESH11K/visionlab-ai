import React, { useCallback, useEffect, useState } from "react";
import { api, HardwareState } from "../lib/api";
import { Panel, Tag, StatusDot } from "../components/ui";
import { IconSerial, IconTerminal, IconAlert } from "../components/icons";
import { useStore } from "../lib/store";

interface Port { port: string; description: string }

export function HardwareLab() {
  const { notify } = useStore();
  const [state, setState] = useState<HardwareState | null>(null);
  const [ports, setPorts] = useState<Port[]>([]);
  const [boards, setBoards] = useState<{ name: string }[]>([]);
  const [board, setBoard] = useState("Arduino Uno");
  const [baud, setBaud] = useState(9600);
  const [port, setPort] = useState("");
  const [cmd, setCmd] = useState("");
  const [monitor, setMonitor] = useState<{ ts: string; cmd: string; resp: string; ok: boolean }[]>([]);
  const [diag, setDiag] = useState<Record<string, number | string> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.get<HardwareState>("/api/hardware/state"));
    } catch { /* ignore */ }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const p = await api.get<{ ports: Port[] }>("/api/hardware/ports");
      setPorts(p.ports);
      const b = await api.get<{ boards: { name: string }[] }>("/api/hardware/boards");
      setBoards(b.boards);
      const d = await api.get<Record<string, number | string>>("/api/system/diagnostics");
      setDiag(d);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    loadMeta();
    const t = setInterval(() => {
      refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [refresh, loadMeta]);

  const connect = async () => {
    try {
      const r = await api.post<{ ok: boolean; mode: string; port?: string }>("/api/hardware/connect", {
        port: port || undefined,
        baud,
        board,
      });
      notify(r.ok ? "success" : "warn", r.mode === "virtual" ? "Connected (VIRTUAL Arduino — no serial device)" : `Connected on ${r.port}`);
      refresh();
    } catch (e) {
      notify("error", `Connect failed: ${e}`);
    }
  };

  const disconnect = async () => {
    await api.post("/api/hardware/disconnect");
    notify("info", "Disconnected");
    refresh();
  };

  const send = async () => {
    if (!cmd.trim()) return;
    try {
      const r = await api.post<{ ok: boolean; status: string; data: string; id: string; latency_ms: number }>("/api/hardware/command", { command: cmd.trim() });
      setMonitor((m) => [...m.slice(-49), {
        ts: new Date().toLocaleTimeString(),
        cmd: cmd.trim(),
        resp: `${r.ok ? "OK" : "ERR"} ${r.data ?? ""}`,
        ok: r.ok,
      }]);
      setCmd("");
      refresh();
    } catch (e) {
      notify("error", `Command failed: ${e}`);
    }
  };

  const quick = async (c: string) => {
    await api.post<{ ok: boolean }>("/api/hardware/command", { command: c });
    refresh();
  };

  const virtual = state?.virtual ?? state?.mode === "virtual";
  const leds = state?.leds ?? {};

  return (
    <div className="grid h-full gap-3 xl:grid-cols-3">
      <div className="flex flex-col gap-3">
        <Panel title="Connection" bodyClassName="p-3">
          {virtual && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-2.5">
              <IconAlert size={14} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
              <div className="text-[11.5px] leading-snug text-[var(--color-ink-dim)]">
                <span className="mono text-[var(--color-accent)]">VIRTUAL HARDWARE</span> active — the
                UI behaves exactly like a real board. Connect a serial port to use physical hardware.
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block">
              <span className="panel-title">Board</span>
              <select className="select mt-1 w-full" value={board} onChange={(e) => setBoard(e.target.value)}>
                {boards.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="panel-title">Serial port</span>
              <div className="mt-1 flex gap-2">
                <select className="select flex-1" value={port} onChange={(e) => setPort(e.target.value)}>
                  <option value="">Auto / Virtual</option>
                  {ports.map((p) => (
                    <option key={p.port} value={p.port}>{p.port} — {p.description.slice(0, 28)}</option>
                  ))}
                </select>
                <button className="btn" onClick={loadMeta} title="Rescan ports"><IconSerial size={14} /></button>
              </div>
            </label>
            <label className="block">
              <span className="panel-title">Baud</span>
              <select className="select mt-1 w-full" value={baud} onChange={(e) => setBaud(Number(e.target.value))}>
                {[9600, 57600, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <div className="flex gap-2 pt-1">
              <button className="btn btn-primary flex-1" onClick={connect}>Connect</button>
              <button className="btn btn-danger" onClick={disconnect}>Disconnect</button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11.5px] text-[var(--color-ink-dim)]">Mode</span>
              <Tag color={virtual ? "var(--color-accent)" : "var(--color-good)"}>
                {state?.mode?.toUpperCase() ?? "…"}
              </Tag>
            </div>
          </div>
        </Panel>

        <Panel title="Diagnostics" bodyClassName="p-3">
          {diag && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[
                ["Camera FPS", `${diag.camera_fps}`],
                ["Vision latency", `${diag.vision_latency_ms} ms`],
                ["CPU", `${diag.cpu_percent}%`],
                ["Memory", `${diag.memory_percent}%`],
                ["Serial latency", `${(diag.hardware_latency_ms as number)?.toFixed?.(2) ?? "—"} ms`],
                ["WebSocket", String(diag.websocket)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-[11px] text-[var(--color-ink-faint)]">{k}</span>
                  <span className="mono text-[11px] text-[var(--color-ink)]">{v}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Serial Monitor"
        right={<span className="mono text-[10px] text-[var(--color-ink-faint)]">PROTOCOL: COMMAND &lt;CMD&gt; ID=&lt;id&gt;</span>}
        bodyClassName="flex flex-col"
      >
        <div className="mono flex-1 overflow-y-auto bg-[var(--color-base-950)] p-3 text-[11px] leading-relaxed" style={{ minHeight: 200 }}>
          {monitor.map((m, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[var(--color-ink-faint)]">{m.ts}</span>
              <span className="text-[var(--color-accent)]">&gt; {m.cmd}</span>
              <span className={m.ok ? "text-[var(--color-good)]" : "text-[var(--color-bad)]"}>&lt; {m.resp}</span>
            </div>
          ))}
          {monitor.length === 0 && <span className="text-[var(--color-ink-faint)]">Command history…</span>}
        </div>
        <div className="flex gap-2 border-t border-[var(--color-line)] p-2">
          <input
            className="input mono flex-1"
            placeholder="e.g. LED2_PWM:120"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="btn btn-primary" onClick={send}><IconTerminal size={13} /> Send</button>
        </div>
      </Panel>

      <Panel title="Board Controls" bodyClassName="overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">
          <div>
            <div className="panel-title mb-1.5">LEDs</div>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((n) => {
                const led = leds[n];
                return (
                  <div key={n} className="flex items-center justify-between rounded-md border border-[var(--color-line)] px-2.5 py-2">
                    <span className="mono text-[12px]">LED {n}</span>
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={led?.on ? "good" : "idle"} pulse={led?.on} />
                      <button className="btn !px-2 !py-0.5" onClick={() => quick(`LED${n}_ON`)}>ON</button>
                      <button className="btn !px-2 !py-0.5" onClick={() => quick(`LED${n}_OFF`)}>OFF</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="panel-title mb-1.5">Servo</div>
            <div className="rounded-md border border-[var(--color-line)] p-2.5">
              <div className="flex items-center justify-between">
                <span className="mono text-[12px]">{state?.servo ?? 90}°</span>
                <input
                  type="range" min={0} max={180}
                  value={state?.servo ?? 90}
                  onChange={async (e) => { setState({ ...state!, servo: Number(e.target.value) }); await quick(`SERVO:${e.target.value}`); }}
                  className="w-40 accent-[var(--color-accent)]"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="panel-title mb-1.5">Relay</div>
            <button className={`btn w-full ${state?.relay ? "btn-danger" : ""}`} onClick={() => quick(state?.relay ? "RELAY:OFF" : "RELAY:ON")}>
              {state?.relay ? "RELAY ON — tap to turn OFF" : "RELAY OFF — tap to turn ON"}
            </button>
          </div>

          <div>
            <div className="panel-title mb-1.5">Motor</div>
            <div className="rounded-md border border-[var(--color-line)] p-2.5">
              <input
                type="range" min={-255} max={255}
                value={state?.motor ?? 0}
                onChange={async (e) => { setState({ ...state!, motor: Number(e.target.value) }); await quick(`MOTOR:${e.target.value}`); }}
                className="w-full accent-[var(--color-accent)]"
              />
              <div className="mono mt-1 text-center text-[11px]">{state?.motor ?? 0}</div>
            </div>
          </div>

          <div>
            <div className="panel-title mb-1.5">Sensor snapshot</div>
            <pre className="mono overflow-x-auto rounded bg-[var(--color-base-950)] p-2 text-[10.5px] text-[var(--color-ink-dim)]">
              {JSON.stringify(state?.sensors ?? {}, null, 1)}
            </pre>
          </div>
        </div>
      </Panel>
    </div>
  );
}