import type { MidyafData, TaskStatus } from "@shared/domain";
import type { LiveEvent } from "./liveEvents";

/**
 * Pure reducer from a live event onto the workspace snapshot. The socket
 * handlers and the demo director both go through here, which is what makes
 * "two data sources, one shape" true: a panel reading `data` cannot tell
 * whether a captain's position came from a phone or from the script.
 *
 * Events that need a server round-trip (`task:assigned`, `rider:update`)
 * return the snapshot unchanged; the caller refreshes.
 */
export function applyLiveEvent(
  current: MidyafData | null,
  event: LiveEvent
): MidyafData | null {
  if (!current) return current;
  switch (event.name) {
    case "driver:location_update": {
      const p = event.payload;
      return withDriver(current, p.driverId, (driver) => ({
        ...driver,
        currentLat: p.lat,
        currentLng: p.lng,
        zone: p.zone ?? driver.zone,
        speedKmh: p.speedKmh ?? driver.speedKmh,
        status: driver.status === "OFFLINE" ? "EN_ROUTE" : driver.status,
        lastLocationAt: p.updatedAt
      }));
    }
    case "user:location_update": {
      const p = event.payload;
      if (!p.driverId) return current;
      return withDriver(current, p.driverId, (driver) => ({
        ...driver,
        currentLat: p.lat,
        currentLng: p.lng,
        lastLocationAt: p.timestamp
      }));
    }
    case "task:status_change":
      return withTaskStatus(
        current,
        event.payload.taskId,
        event.payload.status
      );
    case "alert:delay":
      return withTaskStatus(current, event.payload.taskId, "DELAYED");
    case "guest:arrived": {
      const guestId = event.payload.guestId;
      return {
        ...current,
        events: current.events.map((evt) => ({
          ...evt,
          guests: evt.guests.map((g) =>
            g.id === guestId ? { ...g, rsvpStatus: "ARRIVED" } : g
          )
        })),
        guestJourneys: current.guestJourneys.map((j) =>
          j.guestId === guestId
            ? { ...j, arrivalStatus: "PICKED_UP", luggageStatus: "RECEIVED" }
            : j
        )
      };
    }
    default:
      return current;
  }
}

function withDriver(
  data: MidyafData,
  driverId: string,
  patch: (
    driver: MidyafData["drivers"][number]
  ) => MidyafData["drivers"][number]
): MidyafData {
  let touched = false;
  const drivers = data.drivers.map((driver) => {
    if (driver.id !== driverId) return driver;
    touched = true;
    return patch(driver);
  });
  return touched ? { ...data, drivers } : data;
}

function withTaskStatus(
  data: MidyafData,
  taskId: string,
  status: TaskStatus
): MidyafData {
  return {
    ...data,
    events: data.events.map((evt) => ({
      ...evt,
      tasks: evt.tasks.map((task) =>
        task.id === taskId ? { ...task, status } : task
      )
    }))
  };
}
