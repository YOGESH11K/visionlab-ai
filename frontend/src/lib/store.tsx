import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, EventEntry, RoboticsState, TelemetryEntry, wsUrl } from "./api";

export type PageKey =
  | "dashboard"
  | "gestures"
  | "robotics"
  | "scanner"
  | "ai"
  | "codegen"
  | "learning"
  | "projects"
  | "settings";

export interface SystemStatus {
  status: {
    camera: string;
    arduino: string;
    esp32: string;
    ai: string;
    backend: string;
    vision: string;
  };
  hardware_mode: string;
  hardware_board: string;
  vision_mode: string;
  vision_fps: number;
  gesture: string;
}

interface Toast {
  id: number;
  kind: "info" | "success" | "warn" | "error";
  text: string;
}

interface Store {
  page: PageKey;
  setPage: (p: PageKey) => void;
  status: SystemStatus | null;
  robotics: RoboticsState | null;
  telemetry: Record<string, TelemetryEntry>;
  refreshRobotics: () => void;
  events: EventEntry[];
  filters: Set<string>;
  toggleFilter: (f: string) => void;
  toasts: Toast[];
  notify: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
  refresh: () => void;
}

const Ctx = createContext<Store | null>(null);

let toastId = 0;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [robotics, setRobotics] = useState<RoboticsState | null>(null);
  const [telemetry, setTelemetry] = useState<Record<string, TelemetryEntry>>({});
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const evtRef = useRef<WebSocket | null>(null);

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toggleFilter = useCallback((f: string) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }, []);

  const refresh = useCallback(() => {
    api.get<SystemStatus>("/api/system/status").then(setStatus).catch(() => {});
  }, []);

  const refreshRobotics = useCallback(() => {
    api.get<RoboticsState>("/api/robotics/state").then(setRobotics).catch(() => {});
    api.get<{ values: Record<string, TelemetryEntry> }>("/api/robotics/telemetry")
      .then((r) => setTelemetry(r.values))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    refreshRobotics();
    const t = setInterval(() => {
      refresh();
      refreshRobotics();
    }, 2000);
    return () => clearInterval(t);
  }, [refresh, refreshRobotics]);

  useEffect(() => {
    const ws = new WebSocket(wsUrl("/ws/robotics"));
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data);
        if (data.type === "telemetry" && data.values) {
          setTelemetry(data.values);
        }
      } catch {
        /* ignore malformed */
      }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl("/ws/events"));
    evtRef.current = ws;
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data);
        if (data.type === "history") {
          setEvents(data.events);
        } else if (data.type === "event") {
          setEvents((prev) => [...prev.slice(-199), data]);
        }
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      setTimeout(() => {
        if (evtRef.current === ws) {
          // allow reconnect on next mount cycle
        }
      }, 2000);
    };
    return () => ws.close();
  }, []);

  const filteredEvents = useMemo(() => {
    if (filters.size === 0) return events;
    return events.filter((e) => filters.has(e.source.toUpperCase()));
  }, [events, filters]);

  const store: Store = {
    page,
    setPage,
    status,
    robotics,
    telemetry,
    refreshRobotics,
    events: filteredEvents,
    filters,
    toggleFilter,
    toasts,
    notify,
    dismissToast,
    refresh,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within AppProvider");
  return s;
}