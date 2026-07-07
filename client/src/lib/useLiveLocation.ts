import { useEffect, useState, useRef } from "react";
import type { Socket } from "socket.io-client";

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
        const { latitude, longitude, speed, heading, accuracy } = position.coords;
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

        // Throttle emissions to once every 8 seconds
        if (socket && now - lastEmitRef.current > 8000) {
          lastEmitRef.current = now;
          const payload = {
            userId,
            role,
            driverId,
            eventId,
            lat: latitude,
            lng: longitude,
            speed: speed ?? 0,
            heading: heading ?? 0,
            timestamp: new Date().toISOString()
          };

          if (role === "DRIVER") {
            socket.emit("driver:location_update", payload);
          } else {
            socket.emit("user:location_update", payload);
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
        timeout: 15000,
        maximumAge: 10000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, userId, role, driverId, eventId, socket]);

  return state;
}
