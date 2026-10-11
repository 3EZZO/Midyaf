import { createHash } from "node:crypto";
import { ActivityStatus, Prisma, QuoteStatus, SupplierCategory } from "@prisma/client";
import type { ActivityIntake } from "@prisma/client";
import { z } from "zod";
import { buildAiPlanFromIntake } from "../services/logisticsRules.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { HttpError } from "./http.js";

/**
 * SUPPLIER-001 policy (D-018/D-019/D-020). Suppliers see only their own
 * profile, services and bookings, plus sanitized demand for the explicitly
 * allow-listed synthetic demo intake while it is QUOTING and matches their
 * STORED category. Nothing a caller sends (category, names, ids of other
 * events) can widen that. D-011 is unresolved, so supplier terms are always
 * sealed and never approved, unlocked or contracted here.
 */

/** Non-secret synthetic showcase allow-list (D-019). */
export const SUPPLIER_DEMO_REQUESTS = [
  {
    intakeId: "cmuz7ped70016yk9kubg3628s",
    eventId: "cmuz7p9vp000gyk9kvl1cq2zd",
    eventCode: "DEMO-SUMMIT-01"
  }
] as const;

export const SUPPLIER_REQUEST_CURRENCY = "SAR";
export const MAX_SUPPLIER_PAGE_SIZE = 100;
export const DEFAULT_SUPPLIER_PAGE_SIZE = 50;
export const SUPPLIER_COMMISSION_BOUNDS = { min: 10, max: 15 } as const;
/** Largest value a Decimal(12,2) column holds. */
export const MAX_DECIMAL_12_2_CENTS = 999_999_999_999;
export const MAX_UNIT_PRICE = 9_999_999.99;
export const MAX_QUOTE_QUANTITY = 1_000_000;

export function isAllowlistedIntake(intakeId: string) {
  return SUPPLIER_DEMO_REQUESTS.some((entry) => entry.intakeId === intakeId);
}

export function allowlistEntry(intakeId: string) {
  return SUPPLIER_DEMO_REQUESTS.find((entry) => entry.intakeId === intakeId);
}

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------

export type SupplierDemandScope = "HOTEL_ROOMS" | "VEHICLES" | "TICKETS";
export type SupplierDemandUnit = "ROOM" | "VEHICLE" | "TICKET";

type PlanCounts = ReturnType<typeof buildAiPlanFromIntake>;
type DemandRule = {
  scope: SupplierDemandScope;
  unit: SupplierDemandUnit;
  fields: Array<keyof Pick<PlanCounts, "hotelRooms" | "vipCars" | "shuttleVehicles" | "firstClassTickets" | "normalTickets">>;
};

/** Stored DB category -> deterministic logistics rule fields (D-019). */
const DEMAND_RULES: Partial<Record<SupplierCategory, DemandRule>> = {
  [SupplierCategory.HOTEL]: { scope: "HOTEL_ROOMS", unit: "ROOM", fields: ["hotelRooms"] },
  [SupplierCategory.CAR]: { scope: "VEHICLES", unit: "VEHICLE", fields: ["vipCars", "shuttleVehicles"] },
  [SupplierCategory.TICKET]: {
    scope: "TICKETS",
    unit: "TICKET",
    fields: ["firstClassTickets", "normalTickets"]
  }
};

export type SupplierDemand = {
  scope: SupplierDemandScope;
  unit: SupplierDemandUnit;
  estimatedQuantity: number;
};

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Demo estimate for one stored supplier category from the existing
 * deterministic rules. Unsupported categories, malformed source counts and
 * zero demand all return null: no fabricated demand, no free text, no AI.
 */
export function deriveSupplierDemand(
  intake: Pick<
    ActivityIntake,
    "visitorCount" | "vipVisitorCount" | "normalVisitorCount" | "ticketType"
  >,
  category: SupplierCategory
): SupplierDemand | null {
  const rule = DEMAND_RULES[category];
  if (!rule) return null;
  if (
    !isCount(intake.visitorCount) ||
    !isCount(intake.vipVisitorCount) ||
    !isCount(intake.normalVisitorCount)
  ) {
    return null;
  }

  const plan = buildAiPlanFromIntake(intake as ActivityIntake);
  let total = 0;
  for (const field of rule.fields) {
    const value = plan[field];
    if (!isCount(value)) return null;
    total += value;
  }

  if (!Number.isSafeInteger(total) || total <= 0) return null;
  return { scope: rule.scope, unit: rule.unit, estimatedQuantity: total };
}

export type EligibleRequest = {
  intakeId: string;
  eventId: string;
  eventCode: string;
  eventDate: Date;
  currency: string;
  timezone: string;
  category: SupplierCategory;
  demand: SupplierDemand;
};

type IntakeForEligibility = Pick<
  ActivityIntake,
  | "id"
  | "eventId"
  | "status"
  | "visitorCount"
  | "vipVisitorCount"
  | "normalVisitorCount"
  | "ticketType"
>;

type EventForEligibility = {
  id: string;
  date: Date;
  currency: string;
  timezone: string;
};

/**
 * An intake is open to a supplier only when it is allow-listed, still linked
 * to its allow-listed event, that event exists, the intake is QUOTING and the
 * supplier's stored category has positive deterministic demand.
 */
export function evaluateSupplierRequest(
  intake: IntakeForEligibility | null | undefined,
  event: EventForEligibility | null | undefined,
  category: SupplierCategory
): EligibleRequest | null {
  if (!intake || !event) return null;
  const entry = allowlistEntry(intake.id);
  if (!entry) return null;
  if (intake.eventId !== entry.eventId || event.id !== entry.eventId) return null;
  if (intake.status !== ActivityStatus.QUOTING) return null;

  const demand = deriveSupplierDemand(intake, category);
  if (!demand) return null;

  return {
    intakeId: intake.id,
    eventId: event.id,
    eventCode: entry.eventCode,
    eventDate: event.date,
    currency: SUPPLIER_REQUEST_CURRENCY,
    timezone: event.timezone,
    category,
    demand
  };
}

/** Same denial for every inaccessible, closed, foreign or malformed id. */
export function requestNotFound() {
  return new HttpError(404, "Request not found");
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

// Plain text only: no control characters (notes may keep line breaks/tabs).
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const MULTI_LINE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function plainText(min: number, max: number, multiline: boolean) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .refine(
          (value) => !(multiline ? MULTI_LINE_CONTROL : SINGLE_LINE_CONTROL).test(value),
          "Text contains unsupported characters"
        )
    );
}

function hasAtMostTwoDecimals(value: number) {
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * Strict initial quote body. Ownership, category, status, score, commission,
 * totals and seal are server-set; any such field in the body is rejected.
 */
export const supplierQuoteBodySchema = z
  .object({
    item: plainText(2, 200, false),
    quantity: z.number().int().min(1).max(MAX_QUOTE_QUANTITY),
    unitPrice: z
      .number()
      .finite()
      .min(0)
      .max(MAX_UNIT_PRICE)
      .refine(hasAtMostTwoDecimals, "unitPrice allows at most two decimals")
  })
  .strict();

export const supplierNoteBodySchema = z
  .object({ text: plainText(1, 2000, true) })
  .strict();

export const submissionRejectBodySchema = z
  .object({ reason: plainText(1, 500, true).optional() })
  .strict();

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const idParamSchema = z.string().regex(ID_PATTERN);

export function parseIdParam(value: unknown) {
  const parsed = idParamSchema.safeParse(value);
  if (!parsed.success) throw requestNotFound();
  return parsed.data;
}

export const supplierListQuerySchema = z
  .object({
    cursor: idParamSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_SUPPLIER_PAGE_SIZE)
      .default(DEFAULT_SUPPLIER_PAGE_SIZE)
  })
  .strict();

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function toCents(value: number) {
  return Math.round(value * 100);
}

export function centsToDecimalString(cents: number) {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export type ComputedQuoteTerms = {
  unitPrice: string;
  totalPrice: string;
  commissionPercent: string;
  commissionAmount: string;
};

/**
 * Tax-inclusive terms in exact integer cents. The total must fit
 * Decimal(12,2) without truncation; commission comes only from the
 * supplier's own stored percentage within the existing 10-15 bounds.
 */
export function computeQuoteTerms(
  quantity: number,
  unitPrice: number,
  storedCommissionPercent: unknown
): ComputedQuoteTerms {
  const unitCents = toCents(unitPrice);
  const totalCents = unitCents * quantity;
  if (!Number.isSafeInteger(totalCents) || totalCents > MAX_DECIMAL_12_2_CENTS) {
    throw new HttpError(422, "Quote total exceeds the supported maximum");
  }

  const percent = Number(storedCommissionPercent);
  if (
    !Number.isFinite(percent) ||
    percent < SUPPLIER_COMMISSION_BOUNDS.min ||
    percent > SUPPLIER_COMMISSION_BOUNDS.max
  ) {
    throw new HttpError(409, "Supplier commission is not configured for submissions");
  }

  const commissionCents = Math.round((totalCents * percent) / 100);
  return {
    unitPrice: centsToDecimalString(unitCents),
    totalPrice: centsToDecimalString(totalCents),
    commissionPercent: percent.toFixed(2),
    commissionAmount: centsToDecimalString(commissionCents)
  };
}

// ---------------------------------------------------------------------------
// References and DTOs (shapes mirrored in shared/domain.ts)
// ---------------------------------------------------------------------------

/** Opaque, stable reference: never the raw event name, venue or id. */
export function opaqueReference(prefix: "EVT" | "REQ", id: string) {
  const known = SUPPLIER_DEMO_REQUESTS.find((entry) =>
    prefix === "EVT" ? entry.eventId === id : entry.intakeId === id
  );
  if (known && prefix === "EVT") return known.eventCode;
  const digest = createHash("sha256").update(`${prefix}:${id}`).digest("hex");
  return `${prefix}-${digest.slice(0, 8).toUpperCase()}`;
}

function money(value: unknown) {
  if (value === null || value === undefined) return "0.00";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

export type SupplierProfileRow = {
  id: string;
  name: string;
  category: SupplierCategory;
  verified: boolean;
  city?: { code: string; nameEn: string; nameAr: string } | null;
};

export function toSupplierProfileDto(supplier: SupplierProfileRow) {
  return {
    id: supplier.id,
    name: supplier.name,
    category: supplier.category,
    verified: supplier.verified,
    city: supplier.city
      ? { code: supplier.city.code, nameEn: supplier.city.nameEn, nameAr: supplier.city.nameAr }
      : null
  };
}

export type SupplierServiceRow = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  available: boolean;
  price: unknown;
};

export function toSupplierServiceDto(service: SupplierServiceRow) {
  return {
    id: service.id,
    name: service.name,
    description: service.description ?? null,
    unit: service.unit,
    available: service.available,
    listedPrice: money(service.price)
  };
}

export type SupplierBookingRow = {
  id: string;
  quantity: number;
  totalPrice: unknown;
  status: string;
  service: { name: string; unit: string };
  event: { id: string; date: Date; currency: string; timezone: string };
};

export function toSupplierBookingDto(booking: SupplierBookingRow) {
  return {
    id: booking.id,
    serviceName: booking.service.name,
    serviceUnit: booking.service.unit,
    quantity: booking.quantity,
    totalPrice: money(booking.totalPrice),
    status: booking.status,
    event: {
      reference: opaqueReference("EVT", booking.event.id),
      date: iso(booking.event.date),
      currency: booking.event.currency,
      timezone: booking.event.timezone
    }
  };
}

export type OwnQuoteRow = {
  id: string;
  intakeId: string;
  category: string;
  item: string;
  quantity: number;
  unitPrice: unknown;
  totalPrice: unknown;
  status: QuoteStatus;
  createdAt: Date;
};

/** The supplier's own terms. Score and commission are never included. */
export function toOwnQuoteDto(quote: OwnQuoteRow) {
  return {
    id: quote.id,
    requestReference: opaqueReference("REQ", quote.intakeId),
    intakeId: quote.intakeId,
    category: quote.category,
    item: quote.item,
    quantity: quote.quantity,
    unitPrice: money(quote.unitPrice),
    totalPrice: money(quote.totalPrice),
    currency: SUPPLIER_REQUEST_CURRENCY,
    taxInclusive: true,
    status: quote.status,
    sealed: true,
    submittedAt: iso(quote.createdAt)
  };
}

export type OwnNoteRow = { id: string; text: string; createdAt: Date };

export function toOwnNoteDto(note: OwnNoteRow) {
  return { id: note.id, text: note.text, createdAt: iso(note.createdAt) };
}

export function toSupplierRequestDto(
  request: EligibleRequest,
  ownQuote: OwnQuoteRow | null,
  notes: OwnNoteRow[]
) {
  return {
    intakeId: request.intakeId,
    reference: opaqueReference("REQ", request.intakeId),
    eventCode: request.eventCode,
    category: request.category,
    scope: request.demand.scope,
    estimatedQuantity: request.demand.estimatedQuantity,
    unit: request.demand.unit,
    isEstimate: true,
    status: "QUOTING" as const,
    currency: request.currency,
    eventDate: iso(request.eventDate),
    timezone: request.timezone,
    ownQuote: ownQuote ? toOwnQuoteDto(ownQuote) : null,
    notes: notes.map(toOwnNoteDto)
  };
}

// ---------------------------------------------------------------------------
// Logistics review (no prices, scores or commission)
// ---------------------------------------------------------------------------

export type SubmissionReviewRow = {
  id: string;
  intakeId: string;
  category: string;
  item: string;
  quantity: number;
  status: QuoteStatus;
  isVaultSealed: boolean;
  createdAt: Date;
  supplier: { id: string; name: string; category: SupplierCategory } | null;
};

export function toSubmissionReviewDto(quote: SubmissionReviewRow) {
  return {
    quoteId: quote.id,
    source: "SUPPLIER_PORTAL" as const,
    supplier: quote.supplier
      ? { id: quote.supplier.id, name: quote.supplier.name, category: quote.supplier.category }
      : null,
    intakeId: quote.intakeId,
    category: quote.category,
    item: quote.item,
    quantity: quote.quantity,
    status: quote.status,
    submittedAt: iso(quote.createdAt),
    // Supplier terms are sealed regardless of any stored flag (D-011).
    sealed: true,
    policyPending: true
  };
}

export type ReviewNoteRow = {
  id: string;
  text: string;
  createdAt: Date;
  supplier: { id: string; name: string };
  author: { id: string; name: string };
};

export function toReviewNoteDto(note: ReviewNoteRow) {
  return {
    id: note.id,
    supplier: { id: note.supplier.id, name: note.supplier.name },
    author: { id: note.author.id, name: note.author.name },
    text: note.text,
    createdAt: iso(note.createdAt)
  };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type TransactionClient = Prisma.TransactionClient;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** The PostgreSQL schema named by DATABASE_URL (Prisma's `schema=`), else public. */
export function databaseSchemaName(url: string | undefined = process.env.DATABASE_URL) {
  if (!url) return "public";
  try {
    const schema = new URL(url).searchParams.get("schema");
    if (schema && IDENTIFIER.test(schema)) return schema;
    return "public";
  } catch {
    return "public";
  }
}

/**
 * Row-locks the intake for the rest of the transaction so eligibility and
 * status are re-read and written without a concurrent close or rejection
 * slipping in between. Routes use the server's own DATABASE_URL schema; a
 * tool connected to another validated target passes that target's schema.
 */
export async function lockIntake(
  tx: TransactionClient,
  intakeId: string,
  schema: string = databaseSchemaName()
) {
  if (!IDENTIFIER.test(schema)) throw new Error("Invalid schema name");
  const table = Prisma.raw(`"${schema}"."ActivityIntake"`);
  await tx.$queryRaw`SELECT "id" FROM ${table} WHERE "id" = ${intakeId} FOR UPDATE`;
}

export type AuditContext = {
  actor: AuthenticatedUser;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Metadata-only audit written in the SAME transaction as the mutation: a
 * failed audit rolls the mutation back. Never commercial terms or note text.
 */
export async function writeTransactionalAudit(
  tx: TransactionClient,
  context: AuditContext,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    eventId?: string | null;
    metadata: Record<string, string | number | boolean | null>;
  }
) {
  await tx.auditLog.create({
    data: {
      actorUserId: context.actor.id,
      actorRole: context.actor.role,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      eventId: entry.eventId ?? null,
      beforeData: Prisma.JsonNull,
      afterData: Prisma.JsonNull,
      metadata: entry.metadata,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null
    }
  });
}

export function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/**
 * Database conflicts become safe HTTP errors (no constraint names, SQL or
 * internals). Anything else is returned unchanged so the global handler logs
 * it and answers a generic 500.
 */
export function toSafeHttpError(
  error: unknown,
  conflictMessage = "The request conflicts with the current state; refresh and try again"
): unknown {
  if (error instanceof HttpError) return error;
  if (isUniqueViolation(error)) {
    return new HttpError(409, "An initial quote was already submitted for this request");
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return new HttpError(409, conflictMessage);
  }
  return error;
}
