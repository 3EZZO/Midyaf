import { describe, expect, it } from "vitest";
import type { PortalKey, Role } from "@shared/domain";
import { initialPortalForRole, portalsByRole } from "./rolePortals";

/**
 * VIS-03: only the organizer's landing page changes. SUPPLIER-001 gives
 * suppliers their own workspace instead of the company dashboard, without
 * adding it to any other role. OPS-COLLAB-001 adds the messages inbox to
 * every role. Every other portal stays exactly as before.
 */

const SHARED_PORTALS: PortalKey[] = [
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
  GUEST: ["guest", "messages"],
  DRIVER: ["captain", "messages"],
  ORGANIZER: [...SHARED_PORTALS, "messages"],
  SUPPLIER: ["supplier", "messages"],
  SUPER_ADMIN: [...SHARED_PORTALS, "messages"],
  COORDINATOR: ["coordinator", "messages"],
  LOGISTICS_MANAGER: ["sila_operations", "company", "coordinator", "intake", "messages"],
  COMPANY_ORGANIZER: ["company", "client", "intake", "sila_operations", "messages"],
  EVENT_MANAGER: ["sila_operations", "coordinator", "messages"],
  CLIENT: ["client", "messages"]
};

const EXPECTED_INITIAL: Record<Role, PortalKey> = {
  GUEST: "guest",
  DRIVER: "captain",
  ORGANIZER: "sila_operations",
  SUPPLIER: "supplier",
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

  it("gives the supplier workspace to suppliers only", () => {
    for (const role of ROLES) {
      expect(portalsByRole[role].includes("supplier")).toBe(role === "SUPPLIER");
    }
    expect(portalsByRole.SUPPLIER).not.toContain("company");
  });

  it("gives every role the messages inbox", () => {
    for (const role of ROLES) expect(portalsByRole[role]).toContain("messages");
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
