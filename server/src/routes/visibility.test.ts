import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  buildTaskStatusUpdateWhere,
  buildTaskVisibilityWhere
} from "./tasks.js";
import {
  buildDriverLocationUpdateWhere,
  buildDriverVisibilityWhere
} from "./drivers.js";
import { buildBookingVisibilityWhere } from "./bookings.js";

const authUser = (role: Role, id = "user_1") => ({
  id,
  email: `${role.toLowerCase()}@midyaf.local`,
  role
});

describe("role-specific data visibility", () => {
  it("scopes guest task reads to the guest profile and blocks task status writes", () => {
    expect(buildTaskVisibilityWhere(authUser(Role.GUEST))).toEqual({
      guest: { userId: "user_1" }
    });
    expect(buildTaskStatusUpdateWhere(authUser(Role.GUEST))).toEqual({
      id: "__no_task_status_access__"
    });
  });

  it("scopes captain task and driver reads to the captain account", () => {
    expect(buildTaskVisibilityWhere(authUser(Role.DRIVER))).toEqual({
      driver: { userId: "user_1" }
    });
    expect(buildDriverVisibilityWhere(authUser(Role.DRIVER))).toEqual({
      userId: "user_1"
    });
    expect(buildDriverLocationUpdateWhere(authUser(Role.DRIVER))).toEqual({
      userId: "user_1"
    });
  });

  it("allows operations roles to read operational records without a per-user filter", () => {
    expect(buildTaskVisibilityWhere(authUser(Role.LOGISTICS_MANAGER))).toBeUndefined();
    expect(buildDriverVisibilityWhere(authUser(Role.COORDINATOR))).toBeUndefined();
  });

  it("limits supplier booking data to the supplier profile", () => {
    expect(buildBookingVisibilityWhere(authUser(Role.SUPPLIER))).toEqual({
      supplier: { userId: "user_1" }
    });
    expect(buildBookingVisibilityWhere(authUser(Role.COMPANY_ORGANIZER))).toEqual({
      id: "__no_booking_access__"
    });
  });
});
