import { describe, expect, it } from "vitest";
import { ActivityStatus, QuoteStatus, SupplierCategory, TicketProfile } from "@prisma/client";
import {
  SUPPLIER_DEMO_REQUESTS,
  centsToDecimalString,
  computeQuoteTerms,
  databaseSchemaName,
  deriveSupplierDemand,
  evaluateSupplierRequest,
  lockIntake,
  opaqueReference,
  supplierNoteBodySchema,
  supplierQuoteBodySchema,
  toOwnQuoteDto,
  toSubmissionReviewDto,
  toSupplierBookingDto,
  toSupplierRequestDto
} from "./supplierPortal.js";

/** SUPPLIER-001 policy unit tests. All records are synthetic. */

const demo = SUPPLIER_DEMO_REQUESTS[0];

// The live synthetic intake's shape: 24 visitors, 6 VIP, 18 standard.
const intake = {
  id: demo.intakeId,
  eventId: demo.eventId,
  status: ActivityStatus.QUOTING,
  visitorCount: 24,
  vipVisitorCount: 6,
  normalVisitorCount: 18,
  ticketType: TicketProfile.MIXED
};
const event = {
  id: demo.eventId,
  date: new Date("2026-11-02T06:00:00Z"),
  currency: "SAR",
  timezone: "Asia/Riyadh"
};

describe("deriveSupplierDemand", () => {
  it("reproduces the deterministic HOTEL=15, CAR=9, TICKET=24 estimates", () => {
    expect(deriveSupplierDemand(intake, SupplierCategory.HOTEL)).toEqual({
      scope: "HOTEL_ROOMS",
      unit: "ROOM",
      estimatedQuantity: 15
    });
    expect(deriveSupplierDemand(intake, SupplierCategory.CAR)?.estimatedQuantity).toBe(9);
    expect(deriveSupplierDemand(intake, SupplierCategory.TICKET)?.estimatedQuantity).toBe(24);
  });

  it("returns no demand for unsupported categories instead of inventing it", () => {
    for (const category of [
      SupplierCategory.CATERING,
      SupplierCategory.EQUIPMENT,
      SupplierCategory.TOURISM
    ]) {
      expect(deriveSupplierDemand(intake, category)).toBeNull();
    }
  });

  it("rejects malformed or empty source counts", () => {
    expect(deriveSupplierDemand({ ...intake, vipVisitorCount: -1 }, SupplierCategory.HOTEL)).toBeNull();
    expect(deriveSupplierDemand({ ...intake, normalVisitorCount: 1.5 }, SupplierCategory.HOTEL)).toBeNull();
    expect(
      deriveSupplierDemand({ ...intake, visitorCount: Number.NaN }, SupplierCategory.HOTEL)
    ).toBeNull();
    expect(
      deriveSupplierDemand(
        { ...intake, visitorCount: 0, vipVisitorCount: 0, normalVisitorCount: 0 },
        SupplierCategory.HOTEL
      )
    ).toBeNull();
  });
});

describe("evaluateSupplierRequest", () => {
  it("admits only the allow-listed, linked, QUOTING intake", () => {
    const eligible = evaluateSupplierRequest(intake, event, SupplierCategory.HOTEL);
    expect(eligible).toMatchObject({
      intakeId: demo.intakeId,
      eventCode: "DEMO-SUMMIT-01",
      currency: "SAR",
      demand: { estimatedQuantity: 15 }
    });
  });

  it("denies other intakes, unlinked intakes, other events and closed statuses", () => {
    expect(evaluateSupplierRequest({ ...intake, id: "other" }, event, SupplierCategory.HOTEL)).toBeNull();
    expect(evaluateSupplierRequest({ ...intake, eventId: null }, event, SupplierCategory.HOTEL)).toBeNull();
    expect(evaluateSupplierRequest({ ...intake, eventId: "evt_x" }, { ...event, id: "evt_x" }, SupplierCategory.HOTEL)).toBeNull();
    expect(evaluateSupplierRequest(intake, null, SupplierCategory.HOTEL)).toBeNull();
    for (const status of [
      ActivityStatus.DRAFT,
      ActivityStatus.AI_PLANNING,
      ActivityStatus.PLAN_CONFIRMED,
      ActivityStatus.CONTRACTING,
      ActivityStatus.OPERATIONS_OPEN
    ]) {
      expect(evaluateSupplierRequest({ ...intake, status }, event, SupplierCategory.HOTEL)).toBeNull();
    }
    expect(evaluateSupplierRequest(intake, event, SupplierCategory.CATERING)).toBeNull();
  });
});

describe("input schemas", () => {
  it("accepts a well-formed quote and trims the item", () => {
    expect(
      supplierQuoteBodySchema.parse({ item: "  Synthetic hotel offer ", quantity: 15, unitPrice: 1200 })
    ).toEqual({ item: "Synthetic hotel offer", quantity: 15, unitPrice: 1200 });
  });

  it.each([
    ["supplierId", { supplierId: "sup_other" }],
    ["vendorName", { vendorName: "Someone else" }],
    ["category", { category: "CAR" }],
    ["status", { status: "APPROVED" }],
    ["score", { score: 100 }],
    ["commissionPercent", { commissionPercent: 1 }],
    ["totalPrice", { totalPrice: 1 }],
    ["isVaultSealed", { isVaultSealed: false }],
    ["intakeId", { intakeId: "x" }],
    ["roleName", { roleName: "Midyaf Compliance Auditor" }]
  ])("rejects the privileged field %s", (_name, extra) => {
    expect(
      supplierQuoteBodySchema.safeParse({ item: "Rooms", quantity: 1, unitPrice: 1, ...extra }).success
    ).toBe(false);
  });

  it("enforces quantity, price and text bounds", () => {
    const base = { item: "Rooms", quantity: 1, unitPrice: 1 };
    expect(supplierQuoteBodySchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(supplierQuoteBodySchema.safeParse({ ...base, quantity: 1.5 }).success).toBe(false);
    expect(supplierQuoteBodySchema.safeParse({ ...base, quantity: 1_000_001 }).success).toBe(false);
    expect(supplierQuoteBodySchema.safeParse({ ...base, unitPrice: -1 }).success).toBe(false);
    expect(supplierQuoteBodySchema.safeParse({ ...base, unitPrice: 10.555 }).success).toBe(false);
    expect(supplierQuoteBodySchema.safeParse({ ...base, unitPrice: 10_000_000 }).success).toBe(false);
    expect(supplierQuoteBodySchema.safeParse({ ...base, unitPrice: 10.55 }).success).toBe(true);
    expect(supplierQuoteBodySchema.safeParse({ ...base, item: "x" }).success).toBe(false);
    expect(supplierQuoteBodySchema.safeParse({ ...base, item: "a\u0000b" }).success).toBe(false);
    expect(supplierQuoteBodySchema.safeParse({ ...base, item: "x".repeat(201) }).success).toBe(false);
  });

  it("keeps notes as bounded plain text with line breaks", () => {
    expect(supplierNoteBodySchema.parse({ text: " Line one\nLine two " })).toEqual({
      text: "Line one\nLine two"
    });
    expect(supplierNoteBodySchema.safeParse({ text: "   " }).success).toBe(false);
    expect(supplierNoteBodySchema.safeParse({ text: "x".repeat(2001) }).success).toBe(false);
    expect(supplierNoteBodySchema.safeParse({ text: "ok", supplierId: "s" }).success).toBe(false);
  });
});

describe("computeQuoteTerms", () => {
  it("computes exact tax-inclusive totals and commission in cents", () => {
    expect(computeQuoteTerms(15, 1200, "12.00")).toEqual({
      unitPrice: "1200.00",
      totalPrice: "18000.00",
      commissionPercent: "12.00",
      commissionAmount: "2160.00"
    });
    expect(computeQuoteTerms(3, 0.1, 10).totalPrice).toBe("0.30");
  });

  it("refuses totals that do not fit Decimal(12,2)", () => {
    expect(() => computeQuoteTerms(1_000_000, 9_999_999.99, 12)).toThrow(
      expect.objectContaining({ status: 422 })
    );
    expect(computeQuoteTerms(1_000_000, 9_999.99, 12).totalPrice).toBe("9999990000.00");
  });

  it("fails closed when the stored commission is outside the 10-15 bounds", () => {
    for (const percent of [null, "abc", 9.99, 15.01, Number.POSITIVE_INFINITY]) {
      expect(() => computeQuoteTerms(1, 1, percent)).toThrow(
        expect.objectContaining({ status: 409 })
      );
    }
  });

  it("formats cents without floating-point drift", () => {
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(999_999_999_999)).toBe("9999999999.99");
  });
});

describe("DTOs and references", () => {
  it("uses the event code for the demo event and opaque hashes otherwise", () => {
    expect(opaqueReference("EVT", demo.eventId)).toBe("DEMO-SUMMIT-01");
    expect(opaqueReference("EVT", "evt_real_123")).toMatch(/^EVT-[0-9A-F]{8}$/);
    expect(opaqueReference("EVT", "evt_real_123")).not.toContain("evt_real_123");
    expect(opaqueReference("REQ", demo.intakeId)).toMatch(/^REQ-[0-9A-F]{8}$/);
  });

  it("never puts score, commission or vendor identity in the supplier's own quote", () => {
    const dto = toOwnQuoteDto({
      id: "q1",
      intakeId: demo.intakeId,
      category: "HOTEL",
      item: "Rooms",
      quantity: 15,
      unitPrice: "1200.00",
      totalPrice: "18000.00",
      status: QuoteStatus.RECEIVED,
      createdAt: new Date("2026-10-11T00:00:00Z"),
      // Extra columns a caller might pass by mistake are not copied.
      ...({ score: 0, commissionAmount: "2160.00", vendorName: "X" } as object)
    });
    expect(dto).toMatchObject({ totalPrice: "18000.00", sealed: true, taxInclusive: true });
    expect(JSON.stringify(dto)).not.toMatch(/score|commission|vendorName/);
  });

  it("gives logistics origin and status but no prices", () => {
    const dto = toSubmissionReviewDto({
      id: "q1",
      intakeId: demo.intakeId,
      category: "HOTEL",
      item: "Rooms",
      quantity: 15,
      status: QuoteStatus.RECEIVED,
      isVaultSealed: false,
      createdAt: new Date(),
      supplier: { id: "s1", name: "Synthetic Hotel", category: SupplierCategory.HOTEL }
    });
    expect(dto).toMatchObject({ source: "SUPPLIER_PORTAL", sealed: true, policyPending: true });
    expect(JSON.stringify(dto)).not.toMatch(/price|Price|commission|score/);
  });

  it("exposes only an opaque event reference on bookings and requests", () => {
    const booking = toSupplierBookingDto({
      id: "b1",
      quantity: 2,
      totalPrice: "100",
      status: "CONFIRMED",
      service: { name: "Suite", unit: "night" },
      event: { id: demo.eventId, date: event.date, currency: "SAR", timezone: "Asia/Riyadh" }
    });
    expect(booking.event).toEqual({
      reference: "DEMO-SUMMIT-01",
      date: event.date.toISOString(),
      currency: "SAR",
      timezone: "Asia/Riyadh"
    });

    const request = toSupplierRequestDto(
      evaluateSupplierRequest(intake, event, SupplierCategory.HOTEL)!,
      null,
      []
    );
    expect(request).toMatchObject({ estimatedQuantity: 15, isEstimate: true, status: "QUOTING" });
    expect(JSON.stringify(request)).not.toMatch(/activityName|activityPlace|venue|submittedBy/);
  });
});

describe("databaseSchemaName", () => {
  it("reads Prisma's schema parameter and refuses unsafe identifiers", () => {
    expect(databaseSchemaName("postgresql://u:p@h/db?schema=midyaf")).toBe("midyaf");
    expect(databaseSchemaName("postgresql://u:p@h/db")).toBe("public");
    expect(databaseSchemaName('postgresql://u:p@h/db?schema=a"b')).toBe("public");
    expect(databaseSchemaName(undefined)).toBe("public");
  });
});

describe("lockIntake", () => {
  function recordingTx() {
    const tables: string[] = [];
    const tx = {
      $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        tables.push((values[0] as { sql: string }).sql);
        return [];
      }
    };
    return { tx: tx as never, tables };
  }

  it("locks the explicitly named schema instead of the ambient one", async () => {
    const { tx, tables } = recordingTx();
    await lockIntake(tx, "int_1", "midyaf");
    expect(tables).toEqual(['"midyaf"."ActivityIntake"']);
  });

  it("refuses an unsafe explicit schema before querying", async () => {
    const { tx, tables } = recordingTx();
    await expect(lockIntake(tx, "int_1", 'a"b')).rejects.toThrow();
    expect(tables).toEqual([]);
  });
});
