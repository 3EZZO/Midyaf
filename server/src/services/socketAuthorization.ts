import { DriverStatus, Role } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import { prisma } from "../db.js";
import { verifyAccessToken } from "../middleware/auth.js";
import type { AuthenticatedUser } from "../types/auth.js";
import {
  LEGACY_OPERATOR_ROLES,
  assertEventOperatorAccess,
  canReadEvent
} from "../utils/routeAuthorization.js";
import {
  decodeTelemetryFrame,
  type TelemetryFrame
} from "../utils/telemetryCodec.js";
import { geofenceEngine } from "./geofenceEngine.js";
import { telemetryBuffer } from "./telemetryBuffer.js";

/**
 * T-09 realtime security. Every socket must present a valid access token in
 * its handshake (`auth.token`); the verified actor, never a client-supplied
 * id, decides which rooms it may join and which telemetry it may publish.
 * Task, arrival and delay events are server-originated only (REST routes and
 * the delay monitor), so clients cannot broadcast them.
 *
 * Rooms:
 * - `user:<id>`        joined automatically for the actor only.
 * - `driver:<id>`      the driver who owns that profile.
 * - `event:<id>`       anyone `canReadEvent` admits (T-08 read policy); it
 *                      carries server-originated task/arrival/delay events.
 * - `event-ops:<id>`   joined alongside `event:<id>` only by that event's
 *                      operators (`assertEventOperatorAccess`): live telemetry.
 * - `organizers`       legacy global operator view (LM/SA).
 *
 * Telemetry follows the T-08 telemetry scope: event operators and the global
 * operator room, the driver itself, and the guests assigned to that driver.
 * There is no organization or coordinator-assignment model: LM/SA keep the
 * legacy global view and COORDINATOR fails closed, so this is not D-001.
 */

/** `connect_error` message the client uses to recognise an auth failure. */
export const SOCKET_UNAUTHORIZED = "unauthorized";

/** Roles allowed in the global "organizers" live room (legacy global view). */
export const ORGANIZER_ROOM_ROLES: Role[] = LEGACY_OPERATOR_ROLES;

/** Accepted telemetry clock skew: frames older or newer than this are dropped. */
export const TELEMETRY_MAX_AGE_MS = 5 * 60_000;
export const TELEMETRY_MAX_FUTURE_MS = 60_000;
const MAX_SPEED_KMH = 400;
const MAX_ID_LENGTH = 128;
const CACHE_MS = 60_000;
const DRIVER_STATUSES = new Set<string>(Object.values(DriverStatus));

export type RoomRequest =
  | { kind: "user"; id: unknown }
  | { kind: "driver"; id: unknown }
  | { kind: "event"; id: unknown }
  | { kind: "organizers" };

export type UserLocation = {
  userId: string;
  lat: number;
  lng: number;
  timestamp: string;
};

type Cached<T> = { value: T; checkedAt: number };

type SocketState = {
  user: AuthenticatedUser;
  /** Resolved lazily; null when the actor has no driver profile. */
  driverId?: string | null;
  /** eventId -> whether this socket's driver has a task in it. */
  assignments: Map<string, Cached<boolean>>;
};

type JoinAck = (result: { ok: boolean }) => void;

function unauthorized(reason: string) {
  const error = new Error(SOCKET_UNAUTHORIZED) as Error & {
    data?: { code: string; reason: string };
  };
  error.data = { code: SOCKET_UNAUTHORIZED, reason };
  return error;
}

function isRoomId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH
  );
}

function isCoordinate(value: unknown, limit: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
  );
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const EPOCH_MS = /^\d+$/;
const PACKED_PREFIX = "T1|";
/** Packed-frame positions of numeric fields (see encodeTelemetryFrame). */
const PACKED_NUMERIC_FIELDS = [2, 3, 4, 5, 6, 7, 11];
const PACKED_TIMESTAMP_FIELD = 8;
const OBJECT_NUMERIC_FIELDS = [
  "lat",
  "lng",
  "speed",
  "heading",
  "altitude",
  "accuracy",
  "batteryLevel"
];

/**
 * Puts telemetry into one of the two shapes the decoder handles directly: a
 * packed string or a plain object. One JSON-encoded layer (a JSON object, or
 * a JSON-quoted packed string) is unwrapped, so validation, the supplied
 * timestamp and the decoder all see the same input. Anything nested deeper,
 * or any other value, is rejected (null).
 */
export function normalizeTelemetryInput(raw: unknown): unknown {
  if (typeof raw === "string") {
    if (raw.startsWith(PACKED_PREFIX)) return raw;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof parsed === "string") {
      return parsed.startsWith(PACKED_PREFIX) ? parsed : null;
    }
    raw = parsed;
  }

  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
}

/**
 * Checks the measurements a client actually supplied, before the permissive
 * decoder replaces malformed values with defaults (Date.now(), 0). Expects
 * normalized input (packed string or plain object). Omitted or empty fields
 * are allowed and keep the decoder's intentional defaults.
 */
export function hasWellFormedMeasurements(raw: unknown): boolean {
  if (typeof raw === "string") {
    if (!raw.startsWith(PACKED_PREFIX)) {
      return false;
    }

    const parts = raw.split("|");
    const supplied = (index: number) =>
      parts[index] !== undefined && parts[index] !== "";
    return (
      PACKED_NUMERIC_FIELDS.every(
        (index) => !supplied(index) || PLAIN_NUMBER.test(parts[index])
      ) &&
      (!supplied(PACKED_TIMESTAMP_FIELD) ||
        EPOCH_MS.test(parts[PACKED_TIMESTAMP_FIELD]))
    );
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }

  const fields = raw as Record<string, unknown>;
  const numericOk = OBJECT_NUMERIC_FIELDS.every((key) => {
    const value = fields[key];
    if (value === undefined || value === null) return true;
    return typeof value === "number"
      ? Number.isFinite(value)
      : typeof value === "string" && PLAIN_NUMBER.test(value);
  });

  const timestamp = fields.timestamp;
  const timestampOk =
    timestamp === undefined ||
    timestamp === null ||
    (typeof timestamp === "number" && Number.isFinite(timestamp)) ||
    (typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp)));

  return numericOk && timestampOk;
}

/**
 * The timestamp a packed frame actually supplied. The decoder turns a falsy
 * value such as "0" into Date.now(), which would let an explicitly stale
 * frame pass the freshness check; empty or omitted stays undefined so the
 * decoder's default still applies.
 */
function suppliedPackedTimestamp(raw: unknown): number | undefined {
  if (typeof raw !== "string" || !raw.startsWith(PACKED_PREFIX)) {
    return undefined;
  }
  const value = raw.split("|")[PACKED_TIMESTAMP_FIELD];
  return value === undefined || value === "" ? undefined : Number(value);
}

function finiteOrUndefined(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isFresh<T>(entry: Cached<T> | undefined, now = Date.now()) {
  return entry !== undefined && now - entry.checkedAt < CACHE_MS;
}

/** Handshake middleware: rejects anonymous, invalid and expired tokens. */
export function authenticateSocket(
  socket: Socket,
  next: (error?: Error) => void
) {
  const token = (socket.handshake.auth as { token?: unknown } | undefined)
    ?.token;

  if (typeof token !== "string" || !token) {
    next(unauthorized("missing_token"));
    return;
  }

  try {
    const user = verifyAccessToken(token);
    const state: SocketState = { user, assignments: new Map() };
    socket.data.realtime = state;
    next();
  } catch {
    next(unauthorized("invalid_token"));
  }
}

/** The driver profile id owned by this actor, or null. */
export async function resolveOwnDriverId(
  user: AuthenticatedUser
): Promise<string | null> {
  if (user.role !== Role.DRIVER) {
    return null;
  }

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
    select: { id: true }
  });

  return driver?.id ?? null;
}

/** Whether the verified actor may join the requested room. */
export async function canJoinRoom(
  user: AuthenticatedUser,
  request: RoomRequest,
  ownDriverId?: string | null
): Promise<boolean> {
  switch (request.kind) {
    case "user":
      return isRoomId(request.id) && request.id === user.id;
    case "driver": {
      if (!isRoomId(request.id)) return false;
      const driverId =
        ownDriverId === undefined ? await resolveOwnDriverId(user) : ownDriverId;
      return driverId !== null && request.id === driverId;
    }
    case "event":
      return isRoomId(request.id) && canReadEvent(user, request.id);
    case "organizers":
      return ORGANIZER_ROOM_ROLES.includes(user.role);
    default:
      return false;
  }
}

/** Whether the actor may see live telemetry for the event (T-08 scope). */
export async function isEventOperator(
  user: AuthenticatedUser,
  eventId: string
): Promise<boolean> {
  try {
    await assertEventOperatorAccess(user, eventId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Accepts telemetry only from a DRIVER for its own driver profile, with a
 * plausible position, speed and timestamp. Optional fields that are not finite
 * or not a known driver status are dropped. An eventId the driver has no task
 * in is removed, so the frame cannot be broadcast into another event.
 */
export async function authorizeDriverTelemetry(
  user: AuthenticatedUser,
  ownDriverId: string | null,
  raw: unknown,
  isAssignedToEvent: (eventId: string) => Promise<boolean>,
  now = Date.now()
): Promise<TelemetryFrame | null> {
  const input = normalizeTelemetryInput(raw);
  if (
    user.role !== Role.DRIVER ||
    !ownDriverId ||
    input === null ||
    !hasWellFormedMeasurements(input)
  ) {
    return null;
  }

  const decoded = decodeTelemetryFrame(input);
  const frame = decoded && {
    ...decoded,
    timestamp: suppliedPackedTimestamp(input) ?? decoded.timestamp
  };
  if (
    !frame ||
    frame.driverId !== ownDriverId ||
    !isCoordinate(frame.lat, 90) ||
    !isCoordinate(frame.lng, 180) ||
    !Number.isFinite(frame.speed) ||
    frame.speed < 0 ||
    frame.speed > MAX_SPEED_KMH ||
    !Number.isFinite(frame.heading) ||
    !Number.isFinite(frame.timestamp) ||
    frame.timestamp < now - TELEMETRY_MAX_AGE_MS ||
    frame.timestamp > now + TELEMETRY_MAX_FUTURE_MS
  ) {
    return null;
  }

  const battery = finiteOrUndefined(frame.batteryLevel);
  const sanitized: TelemetryFrame = {
    driverId: frame.driverId,
    lat: frame.lat,
    lng: frame.lng,
    speed: frame.speed,
    heading: ((frame.heading % 360) + 360) % 360,
    altitude: finiteOrUndefined(frame.altitude),
    accuracy: finiteOrUndefined(frame.accuracy),
    timestamp: frame.timestamp,
    status:
      frame.status && DRIVER_STATUSES.has(frame.status) ? frame.status : undefined,
    eventId: frame.eventId,
    batteryLevel:
      battery !== undefined && battery >= 0 && battery <= 100 ? battery : undefined
  };

  if (sanitized.eventId && !(await isAssignedToEvent(sanitized.eventId))) {
    sanitized.eventId = undefined;
  }

  return sanitized;
}

/** Rebuilds a user location from the verified actor; never trusts ids in it. */
export function sanitizeUserLocation(
  user: AuthenticatedUser,
  payload: unknown
): UserLocation | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { lat, lng } = payload as { lat?: unknown; lng?: unknown };
  if (!isCoordinate(lat, 90) || !isCoordinate(lng, 180)) {
    return null;
  }

  return {
    userId: user.id,
    lat,
    lng,
    timestamp: new Date().toISOString()
  };
}

/** User ids of guests with an open task assigned to the driver in the event. */
export async function assignedGuestUserIds(driverId: string, eventId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      driverId,
      eventId,
      guestId: { not: null },
      status: { notIn: ["COMPLETED", "CANCELLED"] }
    },
    select: { guest: { select: { userId: true } } }
  });

  return [
    ...new Set(
      tasks
        .map((task) => task.guest?.userId)
        .filter((id): id is string => Boolean(id))
    )
  ];
}

function stateOf(socket: Socket): SocketState {
  return socket.data.realtime as SocketState;
}

async function ownDriverIdFor(socket: Socket) {
  const state = stateOf(socket);
  if (state.driverId === undefined) {
    state.driverId = await resolveOwnDriverId(state.user);
  }
  return state.driverId;
}

async function isAssignedToEvent(socket: Socket, eventId: string) {
  const state = stateOf(socket);
  const driverId = await ownDriverIdFor(socket);
  if (!driverId || !isRoomId(eventId)) return false;

  const cached = state.assignments.get(eventId);
  if (cached && isFresh(cached)) {
    return cached.value;
  }

  const task = await prisma.task.findFirst({
    where: { eventId, driverId },
    select: { id: true }
  });
  const assigned = Boolean(task);
  state.assignments.set(eventId, { value: assigned, checkedAt: Date.now() });
  return assigned;
}

/** Installs handshake authentication and the authorized realtime handlers. */
export function configureRealtime(io: Server) {
  const guestRecipients = new Map<string, Cached<string[]>>();

  async function guestRoomsFor(driverId: string, eventId: string | undefined) {
    if (!eventId) return [];
    const key = `${driverId}:${eventId}`;
    let entry = guestRecipients.get(key);
    if (!isFresh(entry)) {
      try {
        entry = {
          value: await assignedGuestUserIds(driverId, eventId),
          checkedAt: Date.now()
        };
        guestRecipients.set(key, entry);
      } catch {
        // Fail closed for guests; operators still receive the frame.
        return [];
      }
    }
    return (entry?.value ?? []).map((userId) => `user:${userId}`);
  }

  async function broadcastTelemetry(frame: TelemetryFrame) {
    const result = telemetryBuffer.ingest(frame);
    if (!result) return;

    const { driverId, eventId } = result.frame;
    const operatorRooms = eventId
      ? ["organizers", `event-ops:${eventId}`]
      : ["organizers"];
    const guestRooms = await guestRoomsFor(driverId, eventId);

    io.to(operatorRooms).emit("driver:telemetry_stream", result.packed);

    if (result.shouldBroadcast) {
      const reportedAt = new Date(result.frame.timestamp).toISOString();
      // `updatedAt` is the client contract (ServerEvents, App, liveState);
      // `timestamp` is kept for older consumers of this payload.
      io.to([...operatorRooms, ...guestRooms]).emit("driver:location_update", {
        driverId,
        lat: result.frame.lat,
        lng: result.frame.lng,
        speed: result.frame.speed,
        heading: result.frame.heading,
        altitude: result.frame.altitude,
        accuracy: result.frame.accuracy,
        status: result.frame.status,
        eventId,
        updatedAt: reportedAt,
        timestamp: reportedAt
      });
    }

    const transitions = geofenceEngine.evaluateTelemetry({
      driverId,
      lat: result.frame.lat,
      lng: result.frame.lng,
      speed: result.frame.speed,
      heading: result.frame.heading,
      eventId
    });

    for (const transition of transitions) {
      io.to([...operatorRooms, ...guestRooms, `driver:${driverId}`]).emit(
        "geofence:transition",
        transition
      );
    }
  }

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const { user } = stateOf(socket);
    // Every actor receives its own direct messages (e.g. task:assigned).
    socket.join(`user:${user.id}`);

    const joinHandler =
      (toRequest: (id: unknown) => RoomRequest) =>
      async (id: unknown, ack?: unknown) => {
        const request = toRequest(id);
        let ok = false;
        try {
          ok = await canJoinRoom(
            user,
            request,
            request.kind === "driver" ? await ownDriverIdFor(socket) : undefined
          );
          if (ok && request.kind === "event") {
            const eventId = String(request.id);
            const rooms = [`event:${eventId}`];
            if (await isEventOperator(user, eventId)) {
              rooms.push(`event-ops:${eventId}`);
            }
            await socket.join(rooms);
          } else if (ok) {
            await socket.join(
              request.kind === "organizers"
                ? "organizers"
                : `${request.kind}:${String(request.id)}`
            );
          }
        } catch {
          ok = false;
        }

        if (typeof ack === "function") (ack as JoinAck)({ ok });
      };

    socket.on("event:join", joinHandler((id) => ({ kind: "event", id })));
    socket.on("user:join", joinHandler((id) => ({ kind: "user", id })));
    socket.on("driver:join", joinHandler((id) => ({ kind: "driver", id })));
    socket.on(
      "organizer:join",
      joinHandler(() => ({ kind: "organizers" }))
    );

    const telemetryHandler = async (raw: unknown) => {
      try {
        const frame = await authorizeDriverTelemetry(
          user,
          await ownDriverIdFor(socket),
          raw,
          (eventId) => isAssignedToEvent(socket, eventId)
        );
        if (frame) await broadcastTelemetry(frame);
      } catch {
        // A failed lookup drops the frame; it never broadcasts it.
      }
    };

    socket.on("driver:location_update", telemetryHandler);
    socket.on("driver:telemetry_stream", telemetryHandler);

    socket.on("user:location_update", (payload: unknown) => {
      const location = sanitizeUserLocation(user, payload);
      if (location) io.to("organizers").emit("user:location_update", location);
    });

    // task:status_change, guest:arrived and alert:delay are intentionally not
    // handled: only the server emits them, after its own authorization.
  });
}
