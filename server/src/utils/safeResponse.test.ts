import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  driverResponseOmit,
  findSensitiveFieldPaths,
  safeUserSelect,
  stripSensitiveFields
} from "./safeResponse.js";

describe("safe response projections", () => {
  it("selects every User column except passwordHash", () => {
    const expected = Object.values(Prisma.UserScalarFieldEnum)
      .filter((field) => field !== "passwordHash")
      .sort();

    expect(Object.keys(safeUserSelect).sort()).toEqual(expected);
    expect(safeUserSelect).not.toHaveProperty("passwordHash");
  });

  it("omits only the national ID from Driver", () => {
    expect(driverResponseOmit).toEqual({ nationalIdIqama: true });
    expect(Object.values(Prisma.DriverScalarFieldEnum)).toContain(
      "nationalIdIqama"
    );
  });
});

describe("stripSensitiveFields", () => {
  it("removes sensitive keys at any depth and keeps everything else", () => {
    const stored = {
      id: "drv_1",
      licenseNo: "LIC-1",
      nationalIdIqama: "1098765432",
      user: { id: "usr_1", name: "Captain", passwordHash: "hash-sentinel" },
      tasks: [{ id: "tsk_1", guest: { user: { passwordHash: "hash-sentinel" } } }]
    };

    expect(stripSensitiveFields(stored)).toEqual({
      id: "drv_1",
      licenseNo: "LIC-1",
      user: { id: "usr_1", name: "Captain" },
      tasks: [{ id: "tsk_1", guest: { user: {} } }]
    });
    expect(stored.nationalIdIqama).toBe("1098765432");
  });

  it("returns Dates, Decimals, primitives and null unchanged", () => {
    const createdAt = new Date("2026-10-03T00:00:00Z");
    const earnings = new Prisma.Decimal("12.50");
    const result = stripSensitiveFields({ createdAt, earnings, note: null });

    expect(result.createdAt).toBe(createdAt);
    expect(result.earnings).toBe(earnings);
    expect(result.note).toBeNull();
    expect(stripSensitiveFields(null)).toBeNull();
    expect(stripSensitiveFields("text")).toBe("text");
  });
});

describe("findSensitiveFieldPaths", () => {
  it("reports nested paths and nothing for clean payloads", () => {
    expect(
      findSensitiveFieldPaths({
        events: [{ tasks: [{ driver: { nationalIdIqama: "x", user: { passwordHash: "y" } } }] }]
      })
    ).toEqual([
      "$.events[0].tasks[0].driver.nationalIdIqama",
      "$.events[0].tasks[0].driver.user.passwordHash"
    ]);
    expect(findSensitiveFieldPaths({ user: { name: "Guest" } })).toEqual([]);
  });
});
