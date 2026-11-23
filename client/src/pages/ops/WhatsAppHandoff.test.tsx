import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Driver, MidyafData, Task } from "@shared/domain";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

import { TaskAssignmentBoard } from "./TaskAssignmentBoard";

const drivers = [
  {
    id: "drv_1",
    userId: "u_drv_1",
    status: "AVAILABLE",
    zone: "NORTH_RIYADH",
    active: true,
    user: {
      id: "u_drv_1",
      name: "Captain Fahad",
      email: "fahad@midyaf.local",
      phone: "+966501112222",
      role: "DRIVER",
      language: "ar"
    }
  }
] as unknown as Driver[];

const tasks = [
  {
    id: "tsk_1",
    eventId: "evt_1",
    driverId: "drv_1",
    guestId: "gst_1",
    type: "AIRPORT_PICKUP",
    status: "ASSIGNED",
    pickupLocation: "KKIA Terminal 5",
    dropoffLocation: "KAFD Hotel",
    scheduledAt: "2026-11-24T12:00:00Z",
    deadlineAt: "2026-11-24T12:30:00Z",
    guest: {
      id: "gst_1",
      userId: "u_gst_1",
      user: {
        id: "u_gst_1",
        name: "Dr. Layla",
        email: "layla@example.sa",
        phone: "+966509998888",
        role: "GUEST",
        language: "en"
      }
    }
  }
] as unknown as Task[];

const event = {
  id: "evt_1",
  name: "Riyadh Hospitality Summit",
  tasks,
  guests: []
} as unknown as MidyafData["events"][number];

describe("TaskAssignmentBoard WhatsApp Handoff (PLAN_READY_1 Sprint 3)", () => {
  it("renders 1-tap wa.me links for both assigned captain and guest with safe target/rel attributes", () => {
    const html = renderToStaticMarkup(
      <TaskAssignmentBoard
        event={event}
        drivers={drivers}
        canManage={true}
        assignTask={vi.fn(async () => undefined)}
        updateTaskStatus={vi.fn(async () => undefined)}
      />
    );

    expect(html).toContain('data-whatsapp-handoff="captain"');
    expect(html).toContain('data-whatsapp-handoff="guest"');
    expect(html).toContain("https://wa.me/966501112222?text=");
    expect(html).toContain("https://wa.me/966509998888?text=");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("omits WhatsApp links cleanly when phone numbers are unavailable", () => {
    const noPhoneDrivers = [{ ...drivers[0], user: { ...drivers[0].user, phone: "" } }] as unknown as Driver[];
    const noPhoneEvent = {
      ...event,
      tasks: [{ ...tasks[0], guest: undefined }]
    } as unknown as MidyafData["events"][number];

    const html = renderToStaticMarkup(
      <TaskAssignmentBoard
        event={noPhoneEvent}
        drivers={noPhoneDrivers}
        canManage={false}
        assignTask={vi.fn(async () => undefined)}
        updateTaskStatus={vi.fn(async () => undefined)}
      />
    );

    expect(html).not.toContain("https://wa.me/");
  });
});
