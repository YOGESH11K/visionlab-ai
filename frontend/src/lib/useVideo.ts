import { useCallback, useEffect, useRef, useState } from "react";
import { Detection, wsUrl } from "./api";

export interface VideoFrame {
  jpeg: string | null;
  detection: Detection;
  mode: string;
  fps: number;
}

export function useVideoFeed(enabled: boolean) {
  const [connected, setConnected] = useState(false);
  const [frame, setFrame] = useState<VideoFrame | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const ws = new WebSocket(wsUrl("/ws/video"));
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data);
        if (data.type === "frame") {
          setFrame(data);
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled]);

  const send = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { connected, frame, send };
}