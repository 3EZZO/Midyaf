import type { ActivityIntake } from "@prisma/client";

export function calculateVipCars(vipVisitorCount: number) {
  return Math.max(0, Math.ceil(vipVisitorCount));
}

export function calculateShuttleGroups(
  normalVisitorCount: number,
  guestsPerVehicle = 4
) {
  if (normalVisitorCount <= 0) {
    return 0;
  }

  return Math.ceil(normalVisitorCount / guestsPerVehicle);
}

export function calculateShuttleVehicles(normalVisitorCount: number) {
  const groups = calculateShuttleGroups(normalVisitorCount);

  if (groups === 0) {
    return 0;
  }

  const standbyVehicles = groups >= 10 ? 1 : 0;

  return Math.ceil(groups / 2) + standbyVehicles;
}

export function calculateCommission(totalPrice: number, commissionPercent: number) {
  return roundCurrency((totalPrice * commissionPercent) / 100);
}

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildAiPlanFromIntake(intake: ActivityIntake) {
  const vipCars = calculateVipCars(intake.vipVisitorCount);
  const shuttleGroups = calculateShuttleGroups(intake.normalVisitorCount);
  const shuttleVehicles = calculateShuttleVehicles(intake.normalVisitorCount);
  const hotelRooms =
    intake.vipVisitorCount + Math.ceil(intake.normalVisitorCount / 2);

  return {
    summary:
      "VIP guests receive dedicated cars for the full Riyadh stay. Normal guests are grouped into 3-4 person shuttle movements for airport, hotel, venue, and departure trips.",
    assumptions: [
      `${intake.vipVisitorCount} VIP guests require dedicated vehicles.`,
      `${intake.normalVisitorCount} normal guests are grouped into ${shuttleGroups} shuttle groups.`,
      "First class tickets are reserved for VIP guests when ticket type is mixed.",
      "Five-star hotels are prioritized for VIPs; four-star hotels are used for standard guest groups."
    ],
    visitorGrouping: `${intake.vipVisitorCount} VIP dedicated vehicles; ${intake.normalVisitorCount} normal guests in ${shuttleGroups} groups.`,
    vipCars,
    shuttleVehicles,
    hotelRooms,
    firstClassTickets:
      intake.ticketType === "NORMAL" ? 0 : intake.vipVisitorCount,
    normalTickets:
      intake.ticketType === "FIRST_CLASS"
        ? 0
        : intake.normalVisitorCount,
    phases: [
      {
        name: "Vendor quotation collection",
        owner: "Procurement Manager",
        deadline: addHours(24),
        status: "PENDING"
      },
      {
        name: "Contract confirmation",
        owner: "Logistics Manager",
        deadline: addHours(48),
        status: "PENDING"
      },
      {
        name: "Arrival operations",
        owner: "Airport Supervisor",
        deadline: addHours(72),
        status: "PENDING"
      },
      {
        name: "Departure operations",
        owner: "Departure Supervisor",
        deadline: addHours(96),
        status: "PENDING"
      }
    ],
    risks: [
      "Airport arrival delays can break VIP handoff timing.",
      "Normal guest grouping must be recalculated when flight manifests change.",
      "Riyadh venue traffic requires earlier hotel departure buffers."
    ]
  };
}

function addHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
