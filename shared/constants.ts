export const RIYADH = {
  code: "riyadh",
  nameEn: "Riyadh",
  nameAr: "الرياض",
  centerLat: 24.7136,
  centerLng: 46.6753,
  defaultZoom: 12,
  timezone: "Asia/Riyadh",
  currency: "SAR",
  vatPercent: 15
} as const;

export const BUSINESS_RULES = {
  freeTierGuestLimit: 50,
  commissionMinPercent: 10,
  commissionMaxPercent: 15,
  commissionDefaultPercent: 12,
  vipPriority: true,
  delayAlertMinutes: 5,
  normalGuestsPerShuttleCar: 4,
  vipCarRatio: 1
} as const;

export const DRIVER_ZONES = [
  "NORTH_RIYADH",
  "CENTRAL_RIYADH",
  "EAST_RIYADH",
  "WEST_RIYADH",
  "SOUTH_RIYADH",
  "DIRIYAH_CORRIDOR"
] as const;

export const PORTALS = [
  "intake",
  "guest",
  "captain",
  "coordinator",
  "logistics",
  "company"
] as const;
