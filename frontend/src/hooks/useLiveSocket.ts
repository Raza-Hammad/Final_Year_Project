/**
 * Resilient WebSocket hook for Cascadyx live telemetry.
 * Reconnects with exponential backoff (+ jitter) when the socket drops.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseLiveSocketOptions {
  /** Auth JWT; when null/undefined the socket stays closed. */
  token: string | null | undefined;
  /**
   * Called for every inbound message.
   * Prefer parsing JSON yourself, or use `onJson` for parsed payloads.
   */
  onJson?: (payload: unknown) => void;
  /** Initial reconnect delay in ms (default 1000). */
  baseDelayMs?: number;
  /** Cap on reconnect delay in ms (default 30000). */
  maxDelayMs?: number;
  /** Optional path override (default `/ws/live`). */
  path?: string;
}

export interface UseLiveSocketResult {
  status: LiveSocketStatus;
  connected: boolean;
  lastError: string | null;
  reconnectAttempt: number;
  /** Force a reconnect cycle (resets backoff). */
  reconnect: () => void;
}

function buildWsUrl(token: string, path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host =
    window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
  // Vite mid-dev (:5173) still talks to FastAPI on :8000.
  // One-command demo (SPA served by FastAPI) uses same host+port as the page.
  const isViteDev = window.location.port === '5173';
  const authority = isViteDev ? `${host}:8000` : window.location.host || `${host}:8000`;
  return `${protocol}//${authority}${path}?token=${encodeURIComponent(token)}`;
}

export function useLiveSocket({
  token,
  onJson,
  baseDelayMs = 1000,
  maxDelayMs = 30000,
  path = '/ws/live',
}: UseLiveSocketOptions): UseLiveSocketResult {
  const [status, setStatus] = useState<LiveSocketStatus>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const onJsonRef = useRef(onJson);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const tokenRef = useRef(token);
  const pathRef = useRef(path);
  const baseDelayRef = useRef(baseDelayMs);
  const maxDelayRef = useRef(maxDelayMs);

  useEffect(() => {
    onJsonRef.current = onJson;
  }, [onJson]);

  useEffect(() => {
    tokenRef.current = token;
    pathRef.current = path;
    baseDelayRef.current = baseDelayMs;
    maxDelayRef.current = maxDelayMs;
  }, [token, path, baseDelayMs, maxDelayMs]);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || !tokenRef.current) return;
    clearReconnectTimer();
    const attempt = attemptRef.current;
    const delay = Math.min(
      maxDelayRef.current,
      baseDelayRef.current * Math.pow(2, attempt),
    );
    // Jitter ±20% so multiple tabs don't thundering-herd the backend.
    const jittered = Math.round(delay * (0.8 + Math.random() * 0.4));
    attemptRef.current = attempt + 1;
    setReconnectAttempt(attempt + 1);
    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connectRef.current();
    }, jittered);
  }, []);

  connectRef.current = () => {
    const currentToken = tokenRef.current;
    if (!currentToken || !mountedRef.current) return;

    clearReconnectTimer();
    intentionalCloseRef.current = false;

    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
      intentionalCloseRef.current = false;
    }

    setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(buildWsUrl(currentToken, pathRef.current));
    } catch (err) {
      setStatus('error');
      setLastError(err instanceof Error ? err.message : 'Failed to open WebSocket');
      scheduleReconnect();
      return;
    }

    wsRef.current = ws;

    // Ignore events from a superseded socket (React StrictMode double-mount closes the
    // first socket while it is still CONNECTING; its late onclose must not null out or
    // schedule a reconnect over the live socket, which produced duplicate streams).
    const isStale = (): boolean => wsRef.current !== ws;

    ws.onopen = () => {
      if (!mountedRef.current || isStale()) return;
      attemptRef.current = 0;
      setReconnectAttempt(0);
      setLastError(null);
      setStatus('connected');
      console.log('Telemetry WebSocket connected');
    };

    ws.onmessage = (msg) => {
      if (isStale()) return;
      try {
        const payload = JSON.parse(msg.data as string);
        onJsonRef.current?.(payload);
      } catch (err) {
        console.error('WebSocket telemetry parse error:', err);
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current || isStale()) return;
      setStatus('error');
      setLastError('WebSocket error');
    };

    ws.onclose = () => {
      if (!mountedRef.current || isStale()) return;
      wsRef.current = null;
      setStatus('disconnected');
      console.warn('Telemetry WebSocket disconnected');
      if (!intentionalCloseRef.current) {
        scheduleReconnect();
      }
    };
  };

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    setReconnectAttempt(0);
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    intentionalCloseRef.current = false;
    connectRef.current();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!token) {
      intentionalCloseRef.current = true;
      clearReconnectTimer();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      setStatus('disconnected');
      return () => {
        mountedRef.current = false;
      };
    }

    connectRef.current();

    return () => {
      mountedRef.current = false;
      intentionalCloseRef.current = true;
      clearReconnectTimer();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [token]);

  return {
    status,
    connected: status === 'connected',
    lastError,
    reconnectAttempt,
    reconnect,
  };
}

export default useLiveSocket;
