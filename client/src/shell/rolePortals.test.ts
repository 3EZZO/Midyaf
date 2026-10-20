import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PORTALS } from "@shared/constants";
import type { PortalKey, Role } from "@shared/domain";
import { COMMAND_ITEMS } from "../lib/commandItems";
import { portalCategory, portalIcons, portalMeta } from "./portalMeta";
import { initialPortalForRole, portalsByRole } from "./rolePortals";

/**
 * VIS-03: only the organizer's landing page changes. SUPPLIER-001 gives
 * suppliers their own workspace instead of the company dashboard.
 * ADMIN-PORTALS-001 also opens it to SUPER_ADMIN (read-only admin view), so
 * the super admin sees every dashboard; no other role gains it.
 * OPS-COLLAB-001 adds the messages inbox to every role. Every other portal
 * stays exactly as before.
 */

/**
 * RADAR-ORGANIZER-001: the standalone "intake" portal is retired for every
 * role, SUPER_ADMIN included; event setup lives only in the company workspace.
 */
const ALL_PORTAL_KEYS: PortalKey[] = [
  "admin",
  "company",
  "client",
  "sila_operations",
  "guest",
  "captain",
  "coordinator",
  "supplier",
  "messages"
];

const SHARED_PORTALS: PortalKey[] = [
  "admin",
  "company",
  "client",
  "sila_operations",
  "guest",
  "captain",
  "coordinator"
];

const EXPECTED_ALLOWED: Record<Role, PortalKey[]> = {
  GUEST: ["guest", "messages"],
  DRIVER: ["captain", "messages"],
  ORGANIZER: [...SHARED_PORTALS, "messages"],
  SUPPLIER: ["supplier", "messages"],
  SUPER_ADMIN: [...SHARED_PORTALS, "supplier", "messages"],
  COORDINATOR: ["coordinator", "messages"],
  LOGISTICS_MANAGER: ["sila_operations", "company", "coordinator", "messages"],
  COMPANY_ORGANIZER: ["company", "client", "sila_operations", "messages"],
  EVENT_MANAGER: ["sila_operations", "coordinator", "messages"],
  CLIENT: ["client", "messages"]
};

const EXPECTED_INITIAL: Record<Role, PortalKey> = {
  GUEST: "guest",
  DRIVER: "captain",
  ORGANIZER: "company",
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

  it("gives the supplier workspace to SUPPLIER and SUPER_ADMIN only", () => {
    for (const role of ROLES) {
      expect(portalsByRole[role].includes("supplier")).toBe(
        role === "SUPPLIER" || role === "SUPER_ADMIN"
      );
    }
    expect(portalsByRole.SUPPLIER).not.toContain("company");
  });

  it("gives SUPER_ADMIN every dashboard exactly once", () => {
    const keys = portalsByRole.SUPER_ADMIN;
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...ALL_PORTAL_KEYS].sort());
  });

  it("gives every role the messages inbox", () => {
    for (const role of ROLES) expect(portalsByRole[role]).toContain("messages");
  });

  it("opens no second event-creation portal for any role", () => {
    for (const role of ROLES) expect(portalsByRole[role] as string[]).not.toContain("intake");
    expect(portalsByRole.SUPER_ADMIN).toContain("company");
  });

  it("keeps Sila reachable for the operations roles that create events from it", () => {
    for (const role of ["ORGANIZER", "SUPER_ADMIN", "LOGISTICS_MANAGER", "COMPANY_ORGANIZER", "EVENT_MANAGER"] as const) {
      expect(portalsByRole[role]).toContain("sila_operations");
    }
  });
});

/**
 * SILA-INTAKE-002: the standalone intake portal is deleted, not just hidden.
 * Its key, metadata, icon, category, render case, palette entries and share
 * links are gone; event setup is Sila → Intake or the company workspace.
 */
describe("retired intake portal", () => {
  it("is no longer a portal key or shell metadata entry", () => {
    expect(PORTALS as readonly string[]).not.toContain("intake");
    for (const record of [portalMeta, portalIcons, portalCategory]) {
      expect(Object.keys(record)).not.toContain("intake");
      expect(Object.keys(record).sort()).toEqual([...ALL_PORTAL_KEYS].sort());
    }
  });

  it("has no command palette entry", () => {
    const retired = COMMAND_ITEMS.filter(
      (item) => String(item.portalTarget) === "intake" || item.sectionId?.startsWith("section-intake")
    );
    expect(retired.map((item) => item.id)).toEqual([]);
  });

  it("has no render case, page import or share link", () => {
    const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const app = read("client/src/App.tsx");
    expect(app).not.toMatch(/case "intake"|ActivityIntakePage/);
    const share = read("client/src/lib/planExport.ts");
    expect(share).not.toContain("portal=intake");
    expect(share).toContain("portal=sila_operations");
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
