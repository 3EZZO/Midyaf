/**
 * Compact Telemetry Protocol (Midyaf Sovereign Transport Layer)
 * 
 * High-performance frame packing for sub-50ms latency GPS streams.
 * Compresses vehicle telemetry by ~75% compared to standard JSON objects,
 * reducing carrier bandwidth consumption across congested cellular towers.
 */

export interface TelemetryFrame {
  driverId: string;
  lat: number;
  lng: number;
  speed: number;        // km/h
  heading: number;      // 0 - 359 degrees
  altitude?: number;    // meters
  accuracy?: number;    // meters
  timestamp: number;    // epoch milliseconds
  status?: string;      // DriverStatus
  eventId?: string;
  batteryLevel?: number;// 0 - 100%
}

const MAGIC_PREFIX = "T1";
const DELIMITER = "|";

/**
 * Packs a TelemetryFrame into a lightweight delimited frame string.
 * Example: T1|drv-891|24.957600|46.698800|85.5|184|612|4|1741223456789|EN_ROUTE|evt-2027|92
 */
export function encodeTelemetryFrame(frame: TelemetryFrame): string {
  const parts = [
    MAGIC_PREFIX,
    frame.driverId,
    frame.lat.toFixed(6),
    frame.lng.toFixed(6),
    Math.round((frame.speed ?? 0) * 10) / 10,
    Math.round(frame.heading ?? 0),
    frame.altitude !== undefined ? Math.round(frame.altitude) : "",
    frame.accuracy !== undefined ? Math.round(frame.accuracy) : "",
    frame.timestamp || Date.now(),
    frame.status || "",
    frame.eventId || "",
    frame.batteryLevel !== undefined ? Math.round(frame.batteryLevel) : ""
  ];

  return parts.join(DELIMITER);
}

/**
 * Decodes a raw payload (packed string or legacy JSON object) into a normalized TelemetryFrame.
 */
export function decodeTelemetryFrame(raw: unknown): TelemetryFrame | null {
  if (!raw) return null;

  // 1. Packed Frame String: T1|driverId|lat|lng|...
  if (typeof raw === "string") {
    if (!raw.startsWith(`${MAGIC_PREFIX}${DELIMITER}`)) {
      // Attempt JSON parse fallback
      try {
        const parsed = JSON.parse(raw);
        return decodeTelemetryFrame(parsed);
      } catch {
        return null;
      }
    }

    const parts = raw.split(DELIMITER);
    if (parts.length < 5) return null;

    const driverId = parts[1];
    const lat = parseFloat(parts[2]);
    const lng = parseFloat(parts[3]);
    const speed = parseFloat(parts[4]) || 0;
    const heading = parseFloat(parts[5]) || 0;
    const altitude = parts[6] !== "" ? parseFloat(parts[6]) : undefined;
    const accuracy = parts[7] !== "" ? parseFloat(parts[7]) : undefined;
    const timestamp = parseInt(parts[8], 10) || Date.now();
    const status = parts[9] || undefined;
    const eventId = parts[10] || undefined;
    const batteryLevel = parts[11] !== "" && parts[11] !== undefined ? parseInt(parts[11], 10) : undefined;

    if (!driverId || isNaN(lat) || isNaN(lng)) return null;

    return {
      driverId,
      lat,
      lng,
      speed,
      heading,
      altitude,
      accuracy,
      timestamp,
      status,
      eventId,
      batteryLevel
    };
  }

  // 2. Legacy / Standard Object
  if (typeof raw === "object") {
    const obj = raw as Record<string, any>;
    const driverId = obj.driverId || obj.id || obj.userId;
    const lat = typeof obj.lat === "number" ? obj.lat : parseFloat(obj.lat);
    const lng = typeof obj.lng === "number" ? obj.lng : parseFloat(obj.lng);

    if (!driverId || isNaN(lat) || isNaN(lng)) return null;

    const timestamp = typeof obj.timestamp === "number" 
      ? obj.timestamp 
      : obj.timestamp 
        ? new Date(obj.timestamp).getTime() 
        : Date.now();

    return {
      driverId: String(driverId),
      lat,
      lng,
      speed: typeof obj.speed === "number" ? obj.speed : parseFloat(obj.speed) || 0,
      heading: typeof obj.heading === "number" ? obj.heading : parseFloat(obj.heading) || 0,
      altitude: typeof obj.altitude === "number" ? obj.altitude : undefined,
      accuracy: typeof obj.accuracy === "number" ? obj.accuracy : undefined,
      timestamp: isNaN(timestamp) ? Date.now() : timestamp,
      status: obj.status ? String(obj.status) : undefined,
      eventId: obj.eventId ? String(obj.eventId) : undefined,
      batteryLevel: typeof obj.batteryLevel === "number" ? obj.batteryLevel : undefined
    };
  }

  return null;
}

/**
 * Checks if a string payload is in packed format.
 */
export function isPackedFrame(raw: unknown): boolean {
  return typeof raw === "string" && raw.startsWith(`${MAGIC_PREFIX}${DELIMITER}`);
}

/**
 * Calculates Great-Circle distance between two coordinates in meters using the Haversine formula.
 */
export function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Deadband Filter: Evaluates whether a new telemetry frame has moved significantly
 * or whether its status or heading has meaningfully shifted to warrant transmission.
 */
export function shouldEmitTelemetry(
  prev: TelemetryFrame | null,
  next: TelemetryFrame,
  minDistanceMeters = 5,
  minHeadingDegrees = 10,
  maxHeartbeatIntervalMs = 6000
): boolean {
  if (!prev) return true;

  // Status or Event change forces instant update
  if (prev.status !== next.status || prev.eventId !== next.eventId) {
    return true;
  }

  // Heartbeat timeout forces periodic state sync even if stationary
  const elapsed = next.timestamp - prev.timestamp;
  if (elapsed >= maxHeartbeatIntervalMs) {
    return true;
  }

  // Distance check
  const distance = calculateDistanceMeters(prev.lat, prev.lng, next.lat, next.lng);
  if (distance >= minDistanceMeters) {
    return true;
  }

  // Heading shift check (only relevant if vehicle is in motion)
  if (next.speed > 5) {
    const headingDelta = Math.abs(prev.heading - next.heading);
    const normalizedDelta = headingDelta > 180 ? 360 - headingDelta : headingDelta;
    if (normalizedDelta >= minHeadingDegrees) {
      return true;
    }
  }

  return false;
}
