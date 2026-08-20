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

export const robotics = {
  state: () => api.get<RoboticsState>("/api/robotics/state"),
  devices: () => api.get<{ devices: RobotDeviceInfo[] }>("/api/robotics/devices"),
  actions: () =>
    api.get<{ control: string[]; gesture: string[]; sequence_steps: string[] }>("/api/robotics/actions"),
  connect: (device_type: string, endpoint?: string) =>
    api.post<{ ok: boolean; error?: string }>("/api/robotics/connect", { device_type, endpoint }),
  disconnect: () => api.post<{ ok: boolean }>("/api/robotics/disconnect"),
  control: (action: string, speed?: number, source?: string) =>
    api.post<{ ok: boolean; error?: string; blocked?: boolean; motors?: Record<string, number> }>(
      "/api/robotics/control",
      { action, speed, source },
    ),
  motor: (side: "left" | "right", speed: number) =>
    api.post<{ ok: boolean; error?: string; blocked?: boolean }>("/api/robotics/motor", { side, speed }),
  servo: (angle: number) => api.post<{ ok: boolean; error?: string; blocked?: boolean }>("/api/robotics/servo", { angle }),
  led: (on: boolean) => api.post<{ ok: boolean; error?: string }>("/api/robotics/led", { on }),
  emergency: (reset?: boolean) => api.post<{ ok: boolean; emergency: boolean }>("/api/robotics/emergency", { reset }),
  limits: () => api.get<{ limits: Record<string, number> }>("/api/robotics/limits"),
  setLimits: (limits: Record<string, number>) =>
    api.put<{ ok: boolean; error?: string; limits: Record<string, number> }>("/api/robotics/limits", limits),
  health: () => api.get<RobotHealth>("/api/robotics/health"),
  setMode: (mode: string) => api.post<{ ok: boolean; mode: string }>("/api/robotics/mode", { mode }),
  gestureMapping: () => api.get<{ mapping: Record<string, string> }>("/api/robotics/gesture-mapping"),
  setGestureMapping: (mapping: Record<string, string>) =>
    api.put<{ ok: boolean; mapping: Record<string, string> }>("/api/robotics/gesture-mapping", { mapping }),
  sequences: () => api.get<{ sequences: RobotSequence[] }>("/api/robotics/sequences"),
  saveSequence: (name: string, steps: SequenceStep[]) =>
    api.post<{ ok: boolean; sequence: RobotSequence }>("/api/robotics/sequence/save", { name, steps }),
  deleteSequence: (id: number) => api.del<{ ok: boolean }>(`/api/robotics/sequence/${id}`),
  runSequence: (steps: SequenceStep[]) =>
    api.post<{ ok: boolean; error?: string }>("/api/robotics/sequence/run", { steps }),
  stopSequence: () => api.post<{ ok: boolean }>("/api/robotics/sequence/stop"),
  aiRecommend: () => api.post<{ ok: boolean; action: string; speed: number; reason: string; context: Record<string, unknown>; safe: boolean }>("/api/robotics/ai/recommend"),
  aiApply: (action: string, speed?: number) =>
    api.post<{ ok: boolean; error?: string; blocked?: boolean; recommendation?: unknown }>("/api/robotics/ai/apply", { action, speed }),
  telemetry: () => api.get<{ ts: string; values: Record<string, TelemetryEntry> }>("/api/robotics/telemetry"),
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

// ---------------------------------------------------------------------------
// Robotics
// ---------------------------------------------------------------------------
export interface TelemetryEntry {
  key: string;
  label: string;
  unit: string;
  value: number | string;
  min: number;
  max: number;
  warn: number;
  state: string;
}

export interface RobotHealth {
  device: string;
  device_type: string;
  connected: boolean;
  mode: string;
  emergency: boolean;
  cpu: number;
  memory: number;
  battery: number;
  temperature: number;
  network: string;
  sensor_status: string;
  motor_status: string;
  servo: number;
  last_command: string;
  last_response: string;
  last_command_ts: string;
  error_count: number;
  last_error: string;
  uptime_s: number;
  runtime_started: boolean;
}

export interface RoboticsState {
  device_type: string;
  device_name: string;
  connected: boolean;
  mode: string;
  emergency: boolean;
  speed: number;
  motors: { left: number; right: number };
  servo_angle: number;
  led_state: boolean;
  limits: Record<string, number>;
  gesture_robot: Record<string, string>;
  last_command: string;
  last_command_ts: string;
  sequence_running: boolean;
  health: RobotHealth;
}

export interface RobotDeviceInfo {
  key: string;
  name: string;
  kind: string;
  transport: string;
  description: string;
}

export interface SequenceStep {
  type: string;
  [key: string]: unknown;
}

export interface RobotSequence {
  id: number;
  name: string;
  steps: SequenceStep[];
}