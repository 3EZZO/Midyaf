import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// sanitizeLegacyPayload is pure; the database client is never used here.
vi.mock("../db.js", () => ({ prisma: {} }));

const { sanitizeLegacyPayload } = await import("./legacyWorkspaceBoundary.js");
type Boundary = Parameters<typeof sanitizeLegacyPayload>[1];

function boundary(): Boundary {
  return {
    ids: new Set(["evt_ws_private", "quote_ws_private"]),
    workspaceUsers: new Set(["usr_ws_member"]),
    users: new Map([["usr_masked_guest", "GST-0042"]]),
    drivers: new Set(["drv_ws_captain"]),
    replacements: new Map([["PRIVATE HOTEL", "GST-0042"]])
  };
}

/** What the browser receives: the sanitized body after Express's JSON.stringify. */
function wire(value: unknown, b: Boundary = boundary()) {
  return JSON.parse(JSON.stringify(sanitizeLegacyPayload(value, b)));
}

describe("legacy boundary keeps actual Prisma.Decimal values as JSON scalars", () => {
  it("serializes a Decimal exactly like Express would without the boundary", () => {
    const commission = new Prisma.Decimal("1250.75");
    const sanitized = sanitizeLegacyPayload({ commission }, boundary()) as Record<string, unknown>;

    expect(sanitized.commission).toBe("1250.75");
    expect(JSON.stringify(sanitized)).toBe(JSON.stringify({ commission }));
    expect(Number(wire({ commission }).commission)).toBe(1250.75);
  });

  it("keeps the exact digits of high-precision, negative and small values", () => {
    const values = ["98765432109876.543210987654321", "-0.000123", "0", "1234567.891234567891"];
    const out = wire({ values: values.map((v) => new Prisma.Decimal(v)) });

    expect(out.values).toEqual(values);
    for (const [index, text] of values.entries()) {
      expect(new Prisma.Decimal(out.values[index]).equals(new Prisma.Decimal(text))).toBe(true);
    }
    // No internal decimal.js fields reach the client.
    expect(JSON.stringify(out)).not.toMatch(/"[des]":/);
  });

  it("converts Decimals inside nested arrays and records, and leaves Dates as Dates", () => {
    const createdAt = new Date("2026-11-02T08:30:00.000Z");
    const payload = {
      quotes: [
        { id: "quote_legacy", commission: new Prisma.Decimal("310.5"), terms: { defaultPercent: new Prisma.Decimal("12.5") }, createdAt },
        { id: "quote_legacy_2", commission: new Prisma.Decimal("0.01"), history: [[new Prisma.Decimal("7"), new Prisma.Decimal("8.25")]] }
      ],
      totals: { byCategory: { HOTEL: new Prisma.Decimal("310.51") } }
    };
    const sanitized = sanitizeLegacyPayload(payload, boundary()) as { quotes: Array<Record<string, any>> };

    expect(sanitized.quotes[0].createdAt).toBe(createdAt);
    expect(wire(payload)).toEqual({
      quotes: [
        { id: "quote_legacy", commission: "310.5", terms: { defaultPercent: "12.5" }, createdAt: "2026-11-02T08:30:00.000Z" },
        { id: "quote_legacy_2", commission: "0.01", history: [["7", "8.25"]] }
      ],
      totals: { byCategory: { HOTEL: "310.51" } }
    });
    const finite = wire(payload).quotes.map((quote: { commission: string }) => Number(quote.commission));
    expect(finite.every(Number.isFinite)).toBe(true);
  });
});

describe("Decimal handling does not weaken privacy redaction", () => {
  it("still removes workspace rows with their amounts and masks guest identities", () => {
    const out = wire({
      events: [
        { id: "evt_ws_private", commission: new Prisma.Decimal("999.99") },
        { id: "evt_legacy", commission: new Prisma.Decimal("40.15") }
      ],
      quotes: [{ id: "q_legacy", quoteId: "quote_ws_private", amount: new Prisma.Decimal("5000") }],
      users: [
        { id: "usr_ws_member", name: "Workspace member", balance: new Prisma.Decimal("1") },
        { id: "usr_masked_guest", name: "PRIVATE FULL NAME", email: "private@example.test", role: "GUEST", balance: new Prisma.Decimal("75.5") }
      ],
      note: "Booked at PRIVATE HOTEL"
    });

    expect(out.events).toEqual([{ id: "evt_legacy", commission: "40.15" }]);
    expect(out.quotes).toEqual([]);
    expect(out.users).toEqual([{ id: "usr_masked_guest", name: "GST-0042", email: "", phone: "", role: "GUEST" }]);
    expect(out.note).toBe("Booked at GST-0042");
    const text = JSON.stringify(out);
    for (const secret of ["999.99", "5000", "PRIVATE", "private@example.test", "usr_ws_member", "evt_ws_private", "quote_ws_private", "75.5"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("nulls workspace-driver positions even when they are Decimals and drops the driver id", () => {
    const out = wire({ drivers: [{ id: "drv_ws_captain", currentLat: new Prisma.Decimal("24.765432"), currentLng: new Prisma.Decimal("46.654321"), rating: new Prisma.Decimal("4.5") }] });

    expect(out.drivers).toEqual([{ currentLat: null, currentLng: null, rating: "4.5" }]);
    expect(JSON.stringify(out)).not.toMatch(/drv_ws_captain|24\.765432|46\.654321/);
  });

  it("does not let a plain object's toJSON replace the redacted output", () => {
    const leakyNote = { label: "kept", toJSON: () => ({ leaked: "evt_ws_private at PRIVATE HOTEL", amount: "999.99" }) };
    const leakyRow = { id: "evt_ws_private", toJSON: () => ({ id: "looks-safe" }) };
    const sanitized = sanitizeLegacyPayload({ note: leakyNote, rows: [leakyRow] }, boundary()) as Record<string, any>;

    expect(Object.prototype.hasOwnProperty.call(sanitized.note, "toJSON")).toBe(false);
    expect(wire({ note: leakyNote, rows: [leakyRow] })).toEqual({ note: { label: "kept" }, rows: [] });
    expect(JSON.stringify(sanitized)).not.toMatch(/leaked|looks-safe|evt_ws_private|PRIVATE HOTEL|999\.99/);
  });

  it("treats a duck-typed Decimal look-alike as an ordinary record, not as a trusted scalar", () => {
    const forged = { toStringTag: "[object Decimal]", d: [1], e: 0, s: 1, toString: () => "evt_ws_private" };
    const forgedRow = { toStringTag: "[object Decimal]", d: [1], e: 0, s: 1, id: "evt_ws_private" };
    const out = wire({ forged, rows: [forgedRow] });

    expect(out.forged).toEqual({ toStringTag: "[object Decimal]", d: [1], e: 0, s: 1 });
    expect(out.rows).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("evt_ws_private");
  });

  it("applies the ordinary string redaction to a Decimal's string form", () => {
    // A masked value that happens to equal a Decimal's text is replaced, just
    // like any other string; the boundary never exempts converted scalars.
    const b = boundary();
    b.replacements.set("4242.42", "GST-0042");
    const out = wire({ price: new Prisma.Decimal("4242.42"), other: new Prisma.Decimal("10") }, b);

    expect(out).toEqual({ price: "GST-0042", other: "10" });
  });
});
