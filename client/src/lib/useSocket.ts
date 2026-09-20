import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
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

type UseSocketOptions = {
  /** When false the socket is closed (e.g. logged out or data not loaded). */
  enabled: boolean;
  /** Changes when the user logs in/out; forces a fresh connection. */
  sessionKey?: string | null;
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

    const instance = io({
      autoConnect: true,
      transports: ["websocket", "polling"]
    });
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
      joinRooms();
    });
    instance.on("disconnect", () => setStatus("reconnecting"));
    instance.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    instance.io.on("reconnect_failed", () => setStatus("offline"));
    instance.on("connect_error", () => {
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
