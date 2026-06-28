import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { toAuditJson } from "./auditLog.js";

describe("audit log serialization", () => {
  it("serializes dates and drops undefined object fields", () => {
    expect(
      toAuditJson({
        id: "record-1",
        at: new Date("2026-06-17T10:00:00.000Z"),
        skipped: undefined
      })
    ).toEqual({
      id: "record-1",
      at: "2026-06-17T10:00:00.000Z"
    });
  });

  it("uses a JSON null sentinel for missing snapshots", () => {
    expect(toAuditJson(undefined)).toBe(Prisma.JsonNull);
  });
});
