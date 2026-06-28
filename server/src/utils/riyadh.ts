import type { Driver, DriverZone } from "@prisma/client";

export type Coordinates = {
  lat: number;
  lng: number;
};

export const RIYADH_CENTER: Coordinates = {
  lat: 24.7136,
  lng: 46.6753
};

export const RIYADH_ZONES: Record<DriverZone, Coordinates> = {
  NORTH_RIYADH: { lat: 24.82, lng: 46.64 },
  CENTRAL_RIYADH: { lat: 24.7136, lng: 46.6753 },
  EAST_RIYADH: { lat: 24.75, lng: 46.83 },
  WEST_RIYADH: { lat: 24.67, lng: 46.54 },
  SOUTH_RIYADH: { lat: 24.57, lng: 46.76 },
  DIRIYAH_CORRIDOR: { lat: 24.737, lng: 46.575 }
};

export function haversineDistanceKm(a: Coordinates, b: Coordinates) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const value =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) *
      Math.sin(dLng / 2) *
      Math.cos(lat1) *
      Math.cos(lat2);

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
}

export function inferRiyadhZone(location: Coordinates): DriverZone {
  return Object.entries(RIYADH_ZONES)
    .map(([zone, center]) => ({
      zone: zone as DriverZone,
      distance: haversineDistanceKm(location, center)
    }))
    .sort((a, b) => a.distance - b.distance)[0].zone;
}

export function sortDriversByDistance<T extends Driver>(
  drivers: T[],
  target: Coordinates
) {
  const targetZone = inferRiyadhZone(target);

  return [...drivers]
    .map((driver) => {
      const location =
        driver.currentLat && driver.currentLng
          ? { lat: driver.currentLat, lng: driver.currentLng }
          : RIYADH_ZONES[driver.zone];

      return {
        driver,
        distanceKm: haversineDistanceKm(location, target),
        zoneMatch: driver.zone === targetZone
      };
    })
    .sort((a, b) => {
      if (a.zoneMatch !== b.zoneMatch) {
        return a.zoneMatch ? -1 : 1;
      }

      return a.distanceKm - b.distanceKm;
    });
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
