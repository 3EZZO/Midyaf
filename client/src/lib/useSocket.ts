import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";
import type { DriverZone, GeofenceTransitionEvent, Task, TaskStatus } from "@shared/domain";
import { liveEvents } from "./liveEvents";

/**
 * One Socket.IO connection per session.
 *
 * The connection lifetime is tied only to the session token and the joined
 * rooms. Event handlers are read through a ref on every emit, so callers can
 * pass fresh closures each render without the socket being torn down.
 */

export type SocketStatus = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

export type ServerEvents = {
  "driver:location_update": {
    driverId: string;
    lat: number;
    lng: number;
    zone?: DriverZone;
    updatedAt: string;
    /** Optional; the director sends the scripted speed, real captains may not. */
    speedKmh?: number;
  };
  "user:location_update": {
    userId: string;
    driverId?: string;
    lat: number;
    lng: number;
    timestamp: string;
  };
  "driver:telemetry_stream": unknown;
  "rider:update": unknown;
  "task:status_change": { taskId: string; status: TaskStatus };
  "task:assigned": Task;
  "guest:arrived": { guestId: string; guestName?: string };
  "alert:delay": { taskId: string };
  "geofence:transition": GeofenceTransitionEvent;
  "fleet:diverted": { message: string };
};

export type ServerEventName = keyof ServerEvents;

export type SocketHandlers = {
  [K in ServerEventName]?: (payload: ServerEvents[K]) => void;
};

const EVENT_NAMES: ServerEventName[] = [
  "driver:location_update",
  "user:location_update",
  "driver:telemetry_stream",
  "rider:update",
  "task:status_change",
  "task:assigned",
  "guest:arrived",
  "alert:delay",
  "geofence:transition",
  "fleet:diverted"
];

/** `connect_error` message the server sends when the handshake token is rejected. */
export const SOCKET_UNAUTHORIZED = "unauthorized";

/**
 * Socket options with a handshake token. `auth` is a callback, so every
 * connection and automatic reconnection reads the latest token instead of
 * the one captured when the socket was created.
 */
export function buildSocketOptions(
  getToken: () => string | null | undefined
): Partial<ManagerOptions & SocketOptions> {
  return {
    autoConnect: true,
    transports: ["websocket", "polling"],
    auth: (callback: (data: object) => void) => callback({ token: getToken() ?? "" })
  };
}

/** True when the server refused the connection because of the access token. */
export function isSocketAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === SOCKET_UNAUTHORIZED;
}

export type RecoverableSession = { accessToken: string; refreshToken: string };

/**
 * Runs `load` for `active` and passes its result to `apply` only while
 * `active` is still the current session. A logout, account switch or token
 * refresh in between drops the late result. Used for socket-triggered data
 * reloads (task:assigned, rider:update) and other workspace refreshes.
 */
export async function loadForSession<S, T>(
  active: S,
  getSession: () => S | null,
  load: () => Promise<T>,
  apply: (value: T) => void
): Promise<boolean> {
  const value = await load();
  if (getSession() !== active) return false;
  apply(value);
  return true;
}

export type SessionRefreshDeps<S extends RecoverableSession> = {
  getSession: () => S | null;
  refresh: (refreshToken: string) => Promise<S>;
  install: (next: S) => void;
  signOut: () => void;
};

export type SessionRefreshOutcome = "installed" | "unchanged" | "signed_out" | "stale";

/**
 * Refreshes `active` and applies the outcome only while it is still the
 * current session. A logout, an account switch or another refresh that
 * completes first wins: the late success is not installed and the late
 * failure does not sign the newer session out. Shared by the socket recovery
 * and the bootstrap 401 path so neither can overwrite the other.
 */
export async function refreshSessionIfCurrent<S extends RecoverableSession>(
  active: S,
  deps: SessionRefreshDeps<S>
): Promise<SessionRefreshOutcome> {
  let next: S;
  try {
    next = await deps.refresh(active.refreshToken);
  } catch {
    if (deps.getSession() !== active) return "stale";
    deps.signOut();
    return "signed_out";
  }

  if (deps.getSession() !== active) return "stale";
  if (next.accessToken === active.accessToken) return "unchanged";
  deps.install(next);
  return "installed";
}

/**
 * Recovers from a rejected socket handshake with one refresh per episode.
 *
 * - An episode lasts until a socket connects or `reset()` (login/logout), so
 *   a server that keeps rejecting fresh tokens cannot cause a refresh loop.
 * - A refresh result is applied only if the session is still the one that
 *   failed: a logout, an account switch or another refresh (for example the
 *   bootstrap 401 path) in the meantime wins, and the stale result is dropped.
 * - A refresh that returns the same access token installs nothing; the socket
 *   stays offline instead of retrying a token the server already refused.
 */
export function createSocketAuthRecovery<S extends RecoverableSession>(
  deps: SessionRefreshDeps<S>
) {
  let recovering = false;

  return {
    onAuthError() {
      const active = deps.getSession();
      if (!active || recovering) return;
      recovering = true;

      void refreshSessionIfCurrent(active, deps);
    },
    onConnected() {
      recovering = false;
    },
    reset() {
      recovering = false;
    }
  };
}

type UseSocketOptions = {
  /** When false the socket is closed (e.g. logged out or data not loaded). */
  enabled: boolean;
  /** Changes when the user logs in/out; forces a fresh connection. */
  sessionKey?: string | null;
  /** Access token sent in the handshake; the server rejects sockets without one. */
  accessToken?: string | null;
  /**
   * Called once per socket when the server rejects the token (expired or
   * revoked). The caller refreshes the session or signs out; a new token
   * creates a new socket through `sessionKey`.
   */
  onAuthError?: () => void;
  /** Called on every successful connection (ends an auth-recovery episode). */
  onConnect?: () => void;
  eventId?: string;
  userId?: string;
  joinOrganizers?: boolean;
  handlers: SocketHandlers;
  /**
   * Explicit gate: return false to drop a server event before it reaches the
   * bus or a handler. Demo mode uses it so real telemetry for the
   * name-matched demo captains cannot fight the director.
   */
  filter?: <K extends ServerEventName>(name: K, payload: ServerEvents[K]) => boolean;
};

export function useSocket({
  enabled,
  sessionKey,
  accessToken,
  onAuthError,
  onConnect,
  eventId,
  userId,
  joinOrganizers = false,
  handlers,
  filter
}: UseSocketOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<SocketStatus>("idle");
  const handlersRef = useRef<SocketHandlers>(handlers);
  handlersRef.current = handlers;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  // Rooms are read from refs inside `connect` so a room change never
  // recreates the socket.
  const roomsRef = useRef({ eventId, userId, joinOrganizers });
  roomsRef.current = { eventId, userId, joinOrganizers };

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setSocket(null);
      return;
    }

    const instance = io(buildSocketOptions(() => tokenRef.current));
    let authErrorReported = false;
    setSocket(instance);
    setStatus("connecting");

    const joinRooms = () => {
      const rooms = roomsRef.current;
      if (rooms.eventId) instance.emit("event:join", rooms.eventId);
      if (rooms.userId) instance.emit("user:join", rooms.userId);
      if (rooms.joinOrganizers) instance.emit("organizer:join");
    };

    instance.on("connect", () => {
      setStatus("connected");
      onConnectRef.current?.();
      joinRooms();
    });
    instance.on("disconnect", () => setStatus("reconnecting"));
    instance.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    instance.io.on("reconnect_failed", () => setStatus("offline"));
    instance.on("connect_error", (error) => {
      if (isSocketAuthError(error)) {
        // The server does not retry a rejected handshake; ask the session
        // owner for a fresh token instead of looping with a dead one.
        setStatus("offline");
        if (!authErrorReported) {
          authErrorReported = true;
          onAuthErrorRef.current?.();
        }
        return;
      }
      setStatus((current) => (current === "connected" ? "reconnecting" : "offline"));
    });

    for (const name of EVENT_NAMES) {
      instance.on(name, (payload: unknown) => {
        if (filterRef.current && !filterRef.current(name, payload as ServerEvents[typeof name])) return;
        // Every server event is republished on the bus so panels can
        // subscribe without touching the socket.
        liveEvents.emit(name, payload as ServerEvents[typeof name], "socket");
        const handler = handlersRef.current[name] as
          | ((value: unknown) => void)
          | undefined;
        handler?.(payload);
      });
    }

    return () => {
      instance.disconnect();
      setSocket(null);
      setStatus("idle");
    };
  }, [enabled, sessionKey]);

  // Re-join rooms in place when they change on a live connection.
  useEffect(() => {
    if (!socket || !socket.connected) return;
    if (eventId) socket.emit("event:join", eventId);
    if (userId) socket.emit("user:join", userId);
    if (joinOrganizers) socket.emit("organizer:join");
  }, [socket, eventId, userId, joinOrganizers]);

  return { socket, status };
}

export type SocketContextValue = {
  socket: Socket | null;
  status: SocketStatus;
};

export const SocketContext = createContext<SocketContextValue>({
  socket: null,
  status: "idle"
});

export function useSocketContext() {
  return useContext(SocketContext);
}
