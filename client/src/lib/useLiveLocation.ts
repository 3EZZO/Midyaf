import { useEffect, useState, useRef } from "react";
import type { Socket } from "socket.io-client";
import {
  encodeTelemetryFrame,
  shouldEmitTelemetry,
  type TelemetryFrame
} from "./telemetryCodec";

export type LiveLocationState = {
  lat: number | null;
  lng: number | null;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  error: string | null;
  tracking: boolean;
};

export function useLiveLocation({
  enabled,
  userId,
  role,
  driverId,
  eventId,
  socket
}: {
  enabled: boolean;
  userId?: string;
  role?: string;
  driverId?: string;
  eventId?: string;
  socket?: Socket | null;
}) {
  const [state, setState] = useState<LiveLocationState>({
    lat: null,
    lng: null,
    speed: null,
    heading: null,
    accuracy: null,
    error: null,
    tracking: false
  });

  const lastEmitRef = useRef<number>(0);
  const lastFrameRef = useRef<TelemetryFrame | null>(null);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        tracking: false,
        error: !navigator.geolocation ? "Geolocation not supported by browser" : null
      }));
      return;
    }

    setState((prev) => ({ ...prev, tracking: true, error: null }));

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading, accuracy, altitude } = position.coords;
        const now = Date.now();

        setState({
          lat: latitude,
          lng: longitude,
          speed: speed ?? 0,
          heading: heading ?? 0,
          accuracy: accuracy ?? 0,
          error: null,
          tracking: true
        });

        // Fast high-precision tracking (evaluated at 2s interval with deadband filtering)
        if (socket && now - lastEmitRef.current >= 2000) {
          const nextFrame: TelemetryFrame = {
            driverId: driverId || userId || "unknown",
            lat: latitude,
            lng: longitude,
            speed: Math.round((speed ?? 0) * 3.6), // m/s to km/h
            heading: Math.round(heading ?? 0),
            altitude: altitude !== null ? Math.round(altitude) : undefined,
            accuracy: accuracy !== null ? Math.round(accuracy) : undefined,
            timestamp: now,
            status: "EN_ROUTE",
            eventId
          };

          if (shouldEmitTelemetry(lastFrameRef.current, nextFrame, 5, 10, 6000)) {
            lastEmitRef.current = now;
            lastFrameRef.current = nextFrame;

            const packed = encodeTelemetryFrame(nextFrame);

            if (role === "DRIVER") {
              // Emit compact binary-like stream
              socket.emit("driver:telemetry_stream", packed);
              // Emit formatted legacy update for standard UI handlers
              socket.emit("driver:location_update", {
                userId,
                role,
                driverId,
                eventId,
                lat: latitude,
                lng: longitude,
                speed: nextFrame.speed,
                heading: nextFrame.heading,
                timestamp: new Date(now).toISOString()
              });
            } else {
              socket.emit("user:location_update", {
                userId,
                role,
                driverId,
                eventId,
                lat: latitude,
                lng: longitude,
                speed: nextFrame.speed,
                heading: nextFrame.heading,
                timestamp: new Date(now).toISOString()
              });
            }
          }
        }
      },
      (err) => {
        setState((prev) => ({
          ...prev,
          tracking: false,
          error: err.message || "Failed to retrieve location"
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, userId, role, driverId, eventId, socket]);

  return state;
}
