import { describe, expect, it } from "vitest";
import type { PortalKey, Role } from "@shared/domain";
import { initialPortalForRole, portalsByRole } from "./rolePortals";

/**
 * VIS-03: only the organizer's landing page changes. Every role keeps exactly
 * the portals it could open before.
 */

const ALL_PORTALS: PortalKey[] = [
  "admin",
  "company",
  "client",
  "sila_operations",
  "intake",
  "guest",
  "captain",
  "coordinator"
];

const EXPECTED_ALLOWED: Record<Role, PortalKey[]> = {
  GUEST: ["guest"],
  DRIVER: ["captain"],
  ORGANIZER: ALL_PORTALS,
  SUPPLIER: ["company"],
  SUPER_ADMIN: ALL_PORTALS,
  COORDINATOR: ["coordinator"],
  LOGISTICS_MANAGER: ["sila_operations", "company", "coordinator", "intake"],
  COMPANY_ORGANIZER: ["company", "client", "intake", "sila_operations"],
  EVENT_MANAGER: ["sila_operations", "coordinator"],
  CLIENT: ["client"]
};

const EXPECTED_INITIAL: Record<Role, PortalKey> = {
  GUEST: "guest",
  DRIVER: "captain",
  ORGANIZER: "sila_operations",
  SUPPLIER: "company",
  SUPER_ADMIN: "admin",
  COORDINATOR: "coordinator",
  LOGISTICS_MANAGER: "sila_operations",
  COMPANY_ORGANIZER: "company",
  EVENT_MANAGER: "sila_operations",
  CLIENT: "client"
};

const ROLES = Object.keys(EXPECTED_ALLOWED) as Role[];

describe("portalsByRole", () => {
  it("keeps the exact allowed portal list for every role", () => {
    expect(portalsByRole).toEqual(EXPECTED_ALLOWED);
    expect(Object.keys(portalsByRole).sort()).toEqual([...ROLES].sort());
  });
});

describe("initialPortalForRole", () => {
  for (const role of ROLES) {
    it(`lands ${role} on ${EXPECTED_INITIAL[role]}`, () => {
      expect(initialPortalForRole(role)).toBe(EXPECTED_INITIAL[role]);
    });
  }

  it("always lands on a portal the role is allowed to open", () => {
    for (const role of ROLES) {
      expect(portalsByRole[role]).toContain(initialPortalForRole(role));
    }
  });

  it("moves the organizer off the owners' admin page without removing admin access", () => {
    expect(initialPortalForRole("ORGANIZER")).not.toBe("admin");
    expect(portalsByRole.ORGANIZER).toContain("admin");
    expect(initialPortalForRole("SUPER_ADMIN")).toBe("admin");
  });
});
