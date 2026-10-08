import { describe, expect, it } from "vitest";
import type { Driver, Task } from "@shared/domain";
import { eventTaskCards } from "./eventTaskCards";

const driver = (id: string, name: string): Driver =>
  ({ id, status: "ASSIGNED", user: { id: `u-${id}`, name } }) as unknown as Driver;

const task = (overrides: Partial<Task> & { id: string }): Task =>
  ({
    eventId: "evt",
    type: "AIRPORT_PICKUP",
    status: "PENDING",
    pickupLocation: "Pickup",
    dropoffLocation: "Dropoff",
    scheduledAt: "2027-01-01T10:00:00.000Z",
    ...overrides
  }) as Task;

describe("eventTaskCards", () => {
  it("renders the current tasks' route, captain, time and status", () => {
    const cards = eventTaskCards(
      [
        task({
          id: "t-2",
          type: "VENUE_TRANSFER",
          status: "EN_ROUTE",
          pickupLocation: "Corniche Hotel",
          dropoffLocation: "Harbour Hall",
          driverId: "d-1",
          scheduledAt: "2027-01-01T12:00:00.000Z",
          deadlineAt: "2027-01-01T12:30:00.000Z",
          guest: { isVIP: true, user: { name: "Lina Haddad" } } as Task["guest"]
        }),
        task({
          id: "t-1",
          pickupLocation: "Terminal North",
          dropoffLocation: "Corniche Hotel",
          scheduledAt: "2027-01-01T09:00:00.000Z"
        })
      ],
      [driver("d-1", "Omar Fayez")],
      false
    );

    // Soonest first.
    expect(cards.map((c) => c.id)).toEqual(["t-1", "t-2"]);
    expect(cards[0]).toMatchObject({
      title: "Airport pickup",
      pickup: "Terminal North",
      dropoff: "Corniche Hotel",
      assignment: { kind: "unassigned" },
      time: "2027-01-01T09:00:00.000Z",
      timeKind: "scheduled",
      status: "PENDING",
      guestName: null,
      isVip: false
    });
    expect(cards[1]).toMatchObject({
      title: "Venue transfer",
      assignment: { kind: "captain", name: "Omar Fayez" },
      time: "2027-01-01T12:30:00.000Z",
      timeKind: "deadline",
      status: "EN_ROUTE",
      guestName: "Lina Haddad",
      isVip: true
    });
  });

  it("follows a changed snapshot and language", () => {
    const before = [task({ id: "t-1", status: "ASSIGNED", driverId: "d-1" })];
    const after = [
      task({ id: "t-1", status: "COMPLETED", driverId: "d-2" }),
      task({ id: "t-9", type: "VIP_ESCORT", ownerName: "Field Lead Sara" })
    ];
    const drivers = [driver("d-1", "Omar Fayez"), driver("d-2", "Hani Saleh")];

    expect(eventTaskCards(before, drivers, false)[0]).toMatchObject({
      status: "ASSIGNED",
      assignment: { kind: "captain", name: "Omar Fayez" }
    });
    const next = eventTaskCards(after, drivers, true);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({
      status: "COMPLETED",
      title: "استقبال من المطار",
      assignment: { kind: "captain", name: "Hani Saleh" }
    });
    expect(next[1]).toMatchObject({
      title: "مرافقة كبار الشخصيات",
      assignment: { kind: "owner", name: "Field Lead Sara" }
    });
  });

  it("does not invent a name for a captain outside the scoped snapshot", () => {
    const [card] = eventTaskCards(
      [task({ id: "t-1", driverId: "d-hidden" })],
      [driver("d-1", "Omar Fayez")],
      false
    );
    expect(card.assignment).toEqual({ kind: "captain_unnamed" });
  });

  it("reports missing route and time as missing", () => {
    const [card] = eventTaskCards(
      [
        task({
          id: "t-1",
          pickupLocation: "  ",
          dropoffLocation: "",
          scheduledAt: "not a date",
          deadlineAt: undefined
        })
      ],
      [],
      false
    );
    expect(card).toMatchObject({
      pickup: null,
      dropoff: null,
      time: null,
      timeKind: null
    });
  });

  it("is empty without an event or tasks", () => {
    expect(eventTaskCards(undefined, undefined, false)).toEqual([]);
    expect(eventTaskCards([], [driver("d-1", "Omar")], true)).toEqual([]);
  });
});
