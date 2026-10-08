import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Driver, Task } from "@shared/domain";
import { eventTaskCards, TASK_CARD_LIMIT } from "../lib/eventTaskCards";
import { ClientMessagesEmpty, EventTaskList } from "./SilaOperationsDashboard";

// Translation is not initialised in tests; use a fixed English language.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

/**
 * VIS-04: the operations task cards come from the current event's tasks and
 * the scoped drivers, and the seeded client chat is gone. No DOM test
 * environment exists here, so the list is rendered with react-dom/server;
 * tab switching itself is left to the browser check.
 */

const source = fs.readFileSync(
  path.join(process.cwd(), "client/src/components/SilaOperationsDashboard.tsx"),
  "utf8"
);

const driver = (id: string, name: string): Driver =>
  ({ id, status: "ASSIGNED", user: { id: `u-${id}`, name } }) as unknown as Driver;

const task = (overrides: Partial<Task> & { id: string }): Task =>
  ({
    eventId: "evt",
    type: "AIRPORT_PICKUP",
    status: "ASSIGNED",
    pickupLocation: "Pickup",
    dropoffLocation: "Dropoff",
    scheduledAt: "2027-01-01T10:00:00.000Z",
    ...overrides
  }) as Task;

function render(tasks: Task[], drivers: Driver[], isArabic = false) {
  return renderToStaticMarkup(
    <EventTaskList cards={eventTaskCards(tasks, drivers, isArabic)} isArabic={isArabic} />
  );
}

describe("EventTaskList", () => {
  it("renders each event's own routes and captains", () => {
    const first = render(
      [task({ id: "a1", pickupLocation: "Taif Airport", dropoffLocation: "Shubra Palace", driverId: "d1" })],
      [driver("d1", "Majed Rashed")]
    );
    const second = render(
      [task({ id: "b1", type: "HOTEL_TRANSFER", pickupLocation: "Hail Station", dropoffLocation: "Aja Lodge", driverId: "d2" })],
      [driver("d2", "Yousef Amin")]
    );

    expect(first).toContain("Taif Airport → Shubra Palace");
    expect(first).toContain("Majed Rashed");
    expect(first).toContain("Airport pickup");
    expect(first).not.toContain("Hail Station");
    expect(second).toContain("Hail Station → Aja Lodge");
    expect(second).toContain("Yousef Amin");
    expect(second).toContain("Hotel transfer");
    expect(second).not.toContain("Majed Rashed");
  });

  it("shows honest unassigned, unnamed-captain and missing-time states", () => {
    const html = render(
      [
        task({ id: "u1", pickupLocation: "Gate A" }),
        task({ id: "u2", pickupLocation: "Gate B", driverId: "hidden" }),
        task({ id: "u3", pickupLocation: "Gate C", scheduledAt: "" })
      ],
      []
    );
    expect(html).toContain("Unassigned");
    expect(html).toContain("Captain assigned (name not available)");
    expect(html).toContain("No time set");
    expect(html).toContain("Scheduled ·");
  });

  it("renders Arabic labels for the same data", () => {
    const html = render([task({ id: "x1", type: "VIP_ESCORT", ownerName: "Field Lead" })], [], true);
    expect(html).toContain("مرافقة كبار الشخصيات");
    expect(html).toContain("المسؤول:");
    expect(html).toContain("Field Lead");
  });

  it("has an empty state and a limit note instead of invented rows", () => {
    expect(render([], [])).toContain("No tasks for this event yet");
    const many = Array.from({ length: TASK_CARD_LIMIT + 3 }, (_, i) => task({ id: `m${i}` }));
    expect(render(many, [])).toContain(`Showing ${TASK_CARD_LIMIT} of ${TASK_CARD_LIMIT + 3} tasks`);
  });
});

describe("client messages", () => {
  it("shows that messaging is not connected", () => {
    const html = renderToStaticMarkup(<ClientMessagesEmpty isArabic={false} />);
    expect(html).toContain("No client messages");
    expect(html).toContain("Client messaging is not connected");
  });
});

describe("SilaOperationsDashboard source", () => {
  it("no longer carries the fixed sample delegations or seeded chat", () => {
    for (const fixed of [
      "UK Delegation",
      "Four Seasons",
      "Saud Al Otaibi",
      "Sultan Al Ghamdi",
      "Ministry of Culture",
      "all 12 vehicles",
      "handleSendClientReply",
      "TaskDelegation"
    ]) {
      expect(source).not.toContain(fixed);
    }
    expect(source).toMatch(/eventTaskCards\(tasks, data\.drivers, isArabic\)/);
  });
});
