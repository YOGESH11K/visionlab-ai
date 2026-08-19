// Typed API client for the Empire backend.
//
// In development the Vite dev server proxies /api and /ws to the backend.
// In production (Vercel) set VITE_API_BASE to the deployed backend origin,
// e.g. https://empire-backend.onrender.com (no trailing slash).

const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const isForm = options?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: Blob, filename: string) => {
    const fd = new FormData();
    fd.append("file", file, filename);
    return req<T>(path, { method: "POST", body: fd });
  },
};

export function wsUrl(path: string): string {
  if (BASE) {
    const proto = BASE.startsWith("https:") ? "wss" : "ws";
    return `${proto}://${BASE.replace(/^https?:\/\//, "")}${path}`;
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Detection {
  handedness?: string;
  gesture?: string;
  finger_count?: number;
  fingers?: boolean[];
  confidence?: number;
  stable?: boolean;
  engine?: Record<string, unknown>;
  landmarks?: number[][];
}

export interface HardwareState {
  connected: boolean;
  virtual?: boolean;
  mode?: string;
  board?: string;
  port?: string;
  baud?: number;
  leds?: Record<string, { on: boolean; pwm: number }>;
  servo?: number;
  buzzer?: { on: boolean; freq: number };
  relay?: boolean;
  motor?: number;
  sensors?: Record<string, number>;
}

export interface Mapping {
  gesture: string;
  action_type: string;
  target: string;
  value: number | null;
  enabled: boolean;
  command: string;
}

export interface SensorSeries {
  key: string;
  sensor: string;
  channel: string;
  unit: string;
  points: { ts: string; value: number }[];
  stats: { min: number; max: number; avg: number; count: number; trend: string };
}

export interface ComponentInfo {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  description: string;
  working: string;
  pins: { name: string; function: string; value: string }[];
  voltage: string;
  current: string;
  interfaces: string[];
  compatibility: string[];
  arduino_examples: { title: string; wiring: string; code: string }[];
  esp32_notes: string;
  applications: string[];
  common_mistakes: string[];
  safety_notes: string;
}

export interface EventEntry {
  id?: number;
  ts: string;
  source: string;
  event: string;
  command?: string;
  status: string;
  detail?: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}