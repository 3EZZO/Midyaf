import { CONCENTRIC_GEOFENCES } from "../../../shared/constants.js";
import type {
  ConcentricGeofence,
  ConcentricRing,
  GeofenceRingType,
  GeofenceTransitionEvent,
  GeofenceDriverState
} from "../../../shared/domain.js";
import { calculateDistanceMeters } from "../utils/telemetryCodec.js";

const HYSTERESIS_METERS = 15;
const MAX_RECENT_EVENTS = 100;

interface DriverGeofenceInternalState {
  currentRing: GeofenceRingType | "OUTSIDE";
  distanceMeters: number;
  lastCrossedAt: number;
  direction: "APPROACHING" | "DEPARTING" | "STATIONARY";
}

export type GeofenceTransitionCallback = (
  event: GeofenceTransitionEvent
) => Promise<void> | void;

export class GeofenceEngine {
  private geofences: ConcentricGeofence[] = [];
  // driverId -> geofenceId -> DriverGeofenceInternalState
  private driverStates = new Map<string, Map<string, DriverGeofenceInternalState>>();
  private recentEvents: GeofenceTransitionEvent[] = [];
  private callbacks: GeofenceTransitionCallback[] = [];

  constructor(initialGeofences: ConcentricGeofence[] = CONCENTRIC_GEOFENCES as ConcentricGeofence[]) {
    this.geofences = [...initialGeofences];
  }

  public getGeofences(): (ConcentricGeofence & {
    activeVehiclesCount: number;
    ringCounts: Record<GeofenceRingType, number>;
  })[] {
    return this.geofences.map((geo) => {
      const ringCounts: Record<GeofenceRingType, number> = {
        OUTER_APPROACH: 0,
        STAGING_HOLD: 0,
        CURBSIDE_GATE: 0,
        DOCKED_BAY: 0
      };

      let totalInside = 0;

      for (const [, geoMap] of this.driverStates.entries()) {
        const state = geoMap.get(geo.id);
        if (state && state.currentRing !== "OUTSIDE") {
          ringCounts[state.currentRing] = (ringCounts[state.currentRing] || 0) + 1;
          totalInside++;
        }
      }

      return {
        ...geo,
        activeVehiclesCount: totalInside,
        ringCounts
      };
    });
  }

  public getGeofenceById(id: string): ConcentricGeofence | undefined {
    return this.geofences.find((g) => g.id === id || g.code === id);
  }

  public getRecentEvents(limit: number = 50): GeofenceTransitionEvent[] {
    return this.recentEvents.slice(0, Math.min(limit, this.recentEvents.length));
  }

  public getDriverState(driverId: string): GeofenceDriverState[] {
    const geoMap = this.driverStates.get(driverId);
    if (!geoMap) return [];

    const results: GeofenceDriverState[] = [];
    for (const [geofenceId, state] of geoMap.entries()) {
      results.push({
        driverId,
        geofenceId,
        currentRing: state.currentRing,
        distanceMeters: Math.round(state.distanceMeters),
        lastCrossedAt: new Date(state.lastCrossedAt).toISOString(),
        direction: state.direction
      });
    }
    return results;
  }

  public onTransition(callback: GeofenceTransitionCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Evaluates telemetry coordinates for a driver against all active concentric geofences.
   * Emits transition events if a concentric boundary is crossed.
   */
  public evaluateTelemetry(params: {
    driverId: string;
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
    driverName?: string;
    eventId?: string;
  }): GeofenceTransitionEvent[] {
    const { driverId, lat, lng, driverName } = params;
    const transitions: GeofenceTransitionEvent[] = [];
    const now = Date.now();

    let driverMap = this.driverStates.get(driverId);
    if (!driverMap) {
      driverMap = new Map<string, DriverGeofenceInternalState>();
      this.driverStates.set(driverId, driverMap);
    }

    for (const geofence of this.geofences) {
      const distance = calculateDistanceMeters(
        lat,
        lng,
        geofence.centerLat,
        geofence.centerLng
      );

      const existingState = driverMap.get(geofence.id);
      const previousRing: GeofenceRingType | "OUTSIDE" =
        existingState?.currentRing ?? "OUTSIDE";
      const previousDistance = existingState?.distanceMeters ?? distance;

      // Determine movement direction relative to geofence center
      let direction: "APPROACHING" | "DEPARTING" | "STATIONARY" = "STATIONARY";
      const distanceDelta = distance - previousDistance;
      if (distanceDelta < -3) {
        direction = "APPROACHING";
      } else if (distanceDelta > 3) {
        direction = "DEPARTING";
      } else if (existingState) {
        direction = existingState.direction;
      }

      // Classify which ring the driver is inside, applying hysteresis
      const newRing = this.classifyRing(distance, previousRing, geofence.rings);

      // Check if ring state transitioned
      if (newRing !== previousRing) {
        const automatedActionsTaken = this.determineAutomatedActions(
          newRing,
          geofence
        );

        const event: GeofenceTransitionEvent = {
          id: `gt-${driverId}-${geofence.code}-${now}`,
          driverId,
          driverName,
          geofenceId: geofence.id,
          geofenceCode: geofence.code,
          geofenceNameEn: geofence.nameEn,
          geofenceNameAr: geofence.nameAr,
          previousRing,
          currentRing: newRing,
          distanceMeters: Math.round(distance),
          direction,
          timestamp: new Date(now).toISOString(),
          automatedActionsTaken
        };

        transitions.push(event);

        // Record in circular event log
        this.recentEvents.unshift(event);
        if (this.recentEvents.length > MAX_RECENT_EVENTS) {
          this.recentEvents.pop();
        }

        // Notify registered callbacks asynchronously
        for (const cb of this.callbacks) {
          try {
            const res = cb(event);
            if (res instanceof Promise) {
              res.catch((err) => console.error("Geofence callback error:", err));
            }
          } catch (err) {
            console.error("Geofence callback error:", err);
          }
        }
      }

      // Update in-memory driver state
      driverMap.set(geofence.id, {
        currentRing: newRing,
        distanceMeters: distance,
        lastCrossedAt: newRing !== previousRing ? now : (existingState?.lastCrossedAt ?? now),
        direction
      });
    }

    return transitions;
  }

  /**
   * Classifies which concentric ring a given distance falls into,
   * taking into account hysteresis on outward transitions.
   */
  public classifyRing(
    distanceMeters: number,
    previousRing: GeofenceRingType | "OUTSIDE",
    rings: ConcentricRing[]
  ): GeofenceRingType | "OUTSIDE" {
    // Sort rings by radius ascending: DOCKED_BAY (smallest) -> OUTER_APPROACH (largest)
    const sortedRings = [...rings].sort((a, b) => a.radiusMeters - b.radiusMeters);

    // If already inside a ring, apply hysteresis for exiting
    if (previousRing !== "OUTSIDE") {
      const currentRingDef = sortedRings.find((r) => r.ring === previousRing);
      if (currentRingDef) {
        // Check if moving deeper (into smaller ring)
        for (const ring of sortedRings) {
          if (ring.radiusMeters < currentRingDef.radiusMeters && distanceMeters <= ring.radiusMeters) {
            return ring.ring;
          }
        }

        // If distance is still within current ring radius + hysteresis buffer, hold state
        if (distanceMeters <= currentRingDef.radiusMeters + HYSTERESIS_METERS) {
          return previousRing;
        }
      }
    }

    // Standard inward / outer ring search (smallest matching radius wins)
    for (const ring of sortedRings) {
      if (distanceMeters <= ring.radiusMeters) {
        return ring.ring;
      }
    }

    return "OUTSIDE";
  }

  /**
   * Maps a ring transition to automated sovereign operational actions.
   */
  private determineAutomatedActions(
    newRing: GeofenceRingType | "OUTSIDE",
    geofence: ConcentricGeofence
  ): string[] {
    if (newRing === "OUTSIDE") {
      return ["DEPARTURE_RECORDED", "PERIMETER_EXIT"];
    }

    const matchedRing = geofence.rings.find((r) => r.ring === newRing);
    const actions: string[] = [];

    if (matchedRing?.autoAction) {
      actions.push(matchedRing.autoAction);
    }

    switch (newRing) {
      case "OUTER_APPROACH":
        actions.push("ETA_SYNCHRONIZED", "WAR_ROOM_APPROACH_FLAGGED");
        break;
      case "STAGING_HOLD":
        actions.push("STAGING_DEPOT_ENTRY", "DRIVER_STANDBY_SIGNAL");
        break;
      case "CURBSIDE_GATE":
        actions.push("VIP_GUEST_CURBSIDE_NOTIFIED", "FRICTIONLESS_MATCH_READY");
        break;
      case "DOCKED_BAY":
        actions.push("ZERO_TOUCH_HANDSHAKE_CONFIRMED", "BOARDING_VERIFICATION_ENABLED");
        break;
    }

    return actions;
  }

  /**
   * Simulates a full concentric penetration handshake sequence for a driver
   * (Approach -> Staging -> Curbside -> Docked) for demo mode and automated tests.
   */
  public simulateHandshakeSequence(
    driverId: string,
    geofenceIdOrCode: string,
    driverName: string = "Capt. Sultan Al-Otaibi"
  ): GeofenceTransitionEvent[] {
    const geofence = this.getGeofenceById(geofenceIdOrCode) || this.geofences[0];
    if (!geofence) return [];

    // Clear previous state for clean simulation
    this.driverStates.get(driverId)?.delete(geofence.id);

    // Approximate step distances corresponding to each concentric ring
    const simulatedDistances = [
      { ring: "OUTER_APPROACH", dist: 3500 },
      { ring: "STAGING_HOLD", dist: 1000 },
      { ring: "CURBSIDE_GATE", dist: 180 },
      { ring: "DOCKED_BAY", dist: 25 }
    ];

    const generatedEvents: GeofenceTransitionEvent[] = [];

    for (const step of simulatedDistances) {
      // Calculate coordinates at roughly 'step.dist' meters away from center
      const latOffset = (step.dist / 111320) * 0.7071;
      const lngOffset = (step.dist / (111320 * Math.cos((geofence.centerLat * Math.PI) / 180))) * 0.7071;

      const events = this.evaluateTelemetry({
        driverId,
        driverName,
        lat: geofence.centerLat + latOffset,
        lng: geofence.centerLng + lngOffset,
        speed: step.dist > 500 ? 85 : 20,
        heading: 180
      });

      generatedEvents.push(...events);
    }

    return generatedEvents;
  }

  /**
   * Resets all in-memory driver states (useful for test teardown).
   */
  public clear(): void {
    this.driverStates.clear();
    this.recentEvents = [];
    this.callbacks = [];
  }
}

export const geofenceEngine = new GeofenceEngine();
