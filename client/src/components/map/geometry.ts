/** Pure geo helpers used by the marker registry and the controller. */

export type LatLngTuple = [number, number];

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function coordinates(
  lat: number | null | undefined,
  lng: number | null | undefined
): LatLngTuple | null {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
    ? [lat, lng]
    : null;
}

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLngTuple, b: LatLngTuple): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from `a` to `b`, degrees clockwise from north, 0–360. */
export function bearing(a: LatLngTuple, b: LatLngTuple): number {
  const φ1 = toRad(a[0]);
  const φ2 = toRad(b[0]);
  const Δλ = toRad(b[1] - a[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Linear interpolation between two points — fine at city scale. */
export function lerpLatLng(a: LatLngTuple, b: LatLngTuple, t: number): LatLngTuple {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Ease-in-out (cubic); convoys accelerate away and settle into the next fix. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Shortest angular step from `from` toward `to` scaled by `t`, for smooth heading turns. */
export function lerpAngle(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

export function samePoint(a: LatLngTuple, b: LatLngTuple, epsilon = 1e-7): boolean {
  return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
}
