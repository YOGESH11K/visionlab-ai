import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Panel, Tag, Metric, StatusDot } from "../components/ui";
import { useStore } from "../lib/store";
import { IconCheck } from "../components/icons";

interface SystemStatus {
  status: Record<string, string>;
  hardware_mode?: string;
  hardware_board?: string;
  vision_mode?: string;
  vision_fps?: number;
  gesture?: string;
}
interface Diagnostics {
  camera_fps: number;
  vision_latency_ms: number;
  vision_mode: string;
  inference_fps_limit: number;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  hardware_latency_ms: number;
  hardware_mode: string;
  websocket: string;
  backend: string;
  ai: string;
}
interface Config {
  server: Record<string, unknown>;
  database: Record<string, unknown>;
  vision: Record<string, unknown>;
  hardware: Record<string, unknown>;
  ai: Record<string, unknown>;
}

const statusTone = (s: string) =>
  s === "CONNECTED" || s === "ONLINE" ? "good" : s === "SIMULATION" || s === "AVAILABLE" || s === "VIRTUAL" ? "warn" : "bad";

export function SettingsPage() {
  const { notify } = useStore();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [config, setConfig] = useState<Config | null>(null);

  const load = async () => {
    try {
      setStatus(await api.get<SystemStatus>("/api/system/status"));
      setDiag(await api.get<Diagnostics>("/api/system/diagnostics"));
      setConfig(await api.get<Config>("/api/system/config"));
    } catch (e) {
      notify("error", `Backend unreachable: ${e}`);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col gap-3">
      <Panel title="System status" bodyClassName="overflow-y-auto">
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-6">
          {status &&
            Object.entries(status.status).map(([k, v]) => (
              <div key={k} className="rounded-md border border-[var(--color-line)] p-3">
                <div className="panel-title">{k}</div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusDot status={statusTone(v)} pulse={v === "CONNECTED" || v === "ONLINE"} />
                  <span className="mono text-[13px] font-semibold text-[var(--color-ink)]">{v}</span>
                </div>
              </div>
            ))}
        </div>
        {status && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 pb-3 text-[11px] text-[var(--color-ink-faint)]">
            <span>Hardware: <span className="mono text-[var(--color-ink-dim)]">{status.hardware_mode} / {status.hardware_board}</span></span>
            <span>Vision: <span className="mono text-[var(--color-ink-dim)]">{status.vision_mode} @ {status.vision_fps}fps</span></span>
            <span>Gesture: <span className="mono text-[var(--color-accent)]">{status.gesture}</span></span>
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Runtime diagnostics" bodyClassName="overflow-y-auto">
          {diag && (
            <div className="grid grid-cols-2 gap-2 p-3">
              <Metric label="Camera FPS" value={diag.camera_fps} tone={diag.camera_fps >= 10 ? "good" : "warn"} />
              <Metric label="Vision latency" value={`${diag.vision_latency_ms} ms`} tone={diag.vision_latency_ms < 100 ? "good" : "warn"} />
              <Metric label="Hardware latency" value={`${diag.hardware_latency_ms} ms`} />
              <Metric label="Inference limit" value={`${diag.inference_fps_limit} fps`} />
              <Metric label="CPU" value={`${diag.cpu_percent}%`} tone={diag.cpu_percent > 80 ? "bad" : "default"} />
              <Metric label="Memory" value={`${diag.memory_percent}%`} sub={`${diag.memory_used_mb} MB used`} tone={diag.memory_percent > 85 ? "bad" : "default"} />
              <div className="col-span-2 flex flex-wrap gap-1.5 px-3 pb-2">
                <Tag color="var(--color-good)">backend {diag.backend}</Tag>
                <Tag color="var(--color-good)">websocket {diag.websocket}</Tag>
                <Tag color={diag.ai === "online" ? "var(--color-good)" : "var(--color-warn)"}>ai {diag.ai}</Tag>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Configuration" bodyClassName="overflow-y-auto">
          {config && (
            <div className="flex flex-col gap-3 p-3">
              {(
                [
                  ["Server", config.server],
                  ["Database", config.database],
                  ["Vision", config.vision],
                  ["Hardware", config.hardware],
                  ["AI", config.ai],
                ] as [string, Record<string, unknown>][]
              ).map(([section, values]) => (
                <div key={section}>
                  <div className="panel-title mb-1">{section}</div>
                  <div className="space-y-1">
                    {Object.entries(values).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between rounded border border-[var(--color-line)]/60 px-2.5 py-1">
                        <span className="mono text-[11px] text-[var(--color-ink-faint)]">{k}</span>
                        <span className="mono text-[11px] text-[var(--color-ink)]">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Environment & security" bodyClassName="overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-start gap-2 rounded-md border border-[var(--color-good)]/30 bg-[var(--color-good)]/5 p-2.5">
            <IconCheck size={14} className="mt-0.5 shrink-0 text-[var(--color-good)]" />
            <p className="text-[11.5px] leading-snug text-[var(--color-ink-dim)]">
              Configuration is loaded from <span className="mono">backend/.env</span> using the
              <span className="mono"> EMPIRE_</span> prefix (see <span className="mono">.env.example</span>).
              Secrets such as the AI API key are never exposed by the API. The AI assistant falls back to
              the verified internal knowledge engine when no key is configured.
            </p>
          </div>
          <div className="mono grid gap-x-6 gap-y-1 text-[11px] text-[var(--color-ink-faint)] sm:grid-cols-2">
            <span>EMPIRE_HOST · EMPIRE_PORT · EMPIRE_DEBUG</span>
            <span>EMPIRE_DB_URL (sqlite default)</span>
            <span>EMPIRE_CAMERA_INDEX · EMPIRE_VISION_WIDTH/HEIGHT</span>
            <span>EMPIRE_STREAM_FPS · EMPIRE_INFERENCE_FPS</span>
            <span>EMPIRE_SERIAL_BAUD · EMPIRE_DEFAULT_BOARD</span>
            <span>EMPIRE_AI_API_KEY (optional)</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}