import { z } from "zod";

/**
 * FULL-OVERHAUL-M2 shared contracts for the /workspace API: enum mirrors of
 * the Prisma schema, strict request schemas, the state machines and the
 * response DTO shapes consumed by the M3-M6 UI modules. Pure and
 * dependency-light so both the server and the client can import it.
 *
 * Request schemas are strict: server-owned fields (organization ownership,
 * plan approval, contract signature, privacy bypasses, provider ETAs, sender
 * roles) are rejected rather than ignored.
 */

// ---------------------------------------------------------------------------
// Enum mirrors (keep in sync with prisma/schema.prisma)
// ---------------------------------------------------------------------------

export const ORGANIZATION_KINDS = ["ORGANIZER_COMPANY", "VENDOR", "CLIENT"] as const;
export const ORGANIZATION_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export const MEMBERSHIP_STATUSES = ["ACTIVE", "REVOKED"] as const;
export const EVENT_MEMBER_ROLES = [
  "EXECUTIVE_VIEWER",
  "COORDINATOR",
  "PROJECT_MANAGER",
  "LOGISTICS_MANAGER",
  "OPERATIONS_MANAGER",
  "PRODUCTION_MANAGER",
  "FLEET_SUPERVISOR",
  "CAPTAIN",
  "CLIENT_VIEWER",
  "VENDOR"
] as const;
export const EVENT_SUBTEAMS = ["HOTELS", "AIRPORT", "VENUE", "TRANSPORT"] as const;
export const EVENT_PERMISSIONS = ["VIEW", "EDIT", "INVITE", "SCOPE"] as const;
export const OPERATIONAL_STATUSES = ["PLANNING", "ACTIVE", "COMPLETED"] as const;
export const PLANNING_MODES = ["MANUAL", "AI"] as const;
export const EVENT_PLAN_STATUSES = ["DRAFT", "APPROVED", "SUPERSEDED"] as const;
export const EVENT_PLAN_SOURCES = ["DETERMINISTIC_ADVISORY", "AI_PROVIDER", "MANUAL"] as const;
export const ONBOARDING_KINDS = ["VENDOR", "CLIENT"] as const;
export const ONBOARDING_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "CONTRACT_SIGNED",
  "ACTIVE"
] as const;
export const ONBOARDING_DOCUMENT_KINDS = [
  "LICENSE",
  "ACTIVITY_DOCUMENT",
  "COMMERCIAL_REGISTRATION",
  "TAX_CERTIFICATE",
  "IDENTITY",
  "SIGNED_CONTRACT",
  "OTHER"
] as const;
export const MESSAGE_CLASSES = ["INDIVIDUAL", "GROUP", "ALERT", "INQUIRY", "TASK"] as const;
export const TASK_SOURCES = ["CLIENT_TASK", "LOGISTICS_TEAM_TASK"] as const;
export const DISPATCH_FLOWS = [
  "GUEST_TO_LM",
  "GUEST_TO_SUPERVISOR",
  "GUEST_TO_CAPTAIN",
  "ORGANIZER_TO_LM",
  "LM_TO_SUPERVISOR",
  "LM_TO_CAPTAIN_EMERGENCY"
] as const;
export const VEHICLE_STATUSES = ["AVAILABLE", "ASSIGNED_TO_TASK", "WAITING", "OUT_OF_ZONE"] as const;
export const TRIP_STATUSES = ["SCHEDULED", "EN_ROUTE_TO_PICKUP", "ON_BOARD", "COMPLETED", "CANCELLED"] as const;
export const ETA_SOURCES = ["PROVIDER", "APPROXIMATE", "UNAVAILABLE"] as const;
export const FLIGHT_SCOPES = ["EVENT", "GENERAL"] as const;
export const FLIGHT_STATUSES = ["SCHEDULED", "DELAYED", "LANDED", "DEPARTED", "CANCELLED"] as const;
export const SHIFT_STATUSES = ["SCHEDULED", "ON_SHIFT", "OFF_SHIFT"] as const;
export const SUPPLIER_CATEGORIES = ["HOTEL", "CAR", "TICKET", "CATERING", "EQUIPMENT", "TOURISM"] as const;
export const TASK_TYPES = [
  "AIRPORT_PICKUP",
  "HOTEL_TRANSFER",
  "VENUE_TRANSFER",
  "RESTAURANT_PICKUP",
  "VIP_ESCORT"
] as const;

export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type EventMemberRole = (typeof EVENT_MEMBER_ROLES)[number];
export type EventSubteam = (typeof EVENT_SUBTEAMS)[number];
export type EventPermission = (typeof EVENT_PERMISSIONS)[number];
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];
export type PlanningMode = (typeof PLANNING_MODES)[number];
export type EventPlanStatus = (typeof EVENT_PLAN_STATUSES)[number];
export type EventPlanSource = (typeof EVENT_PLAN_SOURCES)[number];
export type OnboardingKind = (typeof ONBOARDING_KINDS)[number];
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];
export type OnboardingDocumentKind = (typeof ONBOARDING_DOCUMENT_KINDS)[number];
export type MessageClass = (typeof MESSAGE_CLASSES)[number];
export type TaskSource = (typeof TASK_SOURCES)[number];
export type DispatchFlow = (typeof DISPATCH_FLOWS)[number];
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export type TripStatus = (typeof TRIP_STATUSES)[number];
export type EtaSource = (typeof ETA_SOURCES)[number];
export type FlightScope = (typeof FLIGHT_SCOPES)[number];
export type FlightStatus = (typeof FLIGHT_STATUSES)[number];
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const WORKSPACE_LIMITS = {
  maxEventCount: 100_000,
  maxDocumentBytes: 1_048_576,
  maxDocumentsPerApplication: 10,
  maxPrivacyViewers: 50,
  maxDispatchRecipients: 10,
  maxVendorNotifications: 50,
  maxTripPassengers: 60,
  maxEtaMinutes: 1440,
  densityMinimumHeadcount: 5,
  defaultPage: 30,
  maxPage: 100
} as const;

export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const MULTI_LINE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export function plainText(min: number, max: number, multiline = false) {
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

export const isoDateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const countSchema = z.number().int().min(0).max(WORKSPACE_LIMITS.maxEventCount);
const latSchema = z.number().finite().min(-90).max(90);
const lngSchema = z.number().finite().min(-180).max(180);
const phoneSchema = z.string().trim().regex(/^\+?[0-9 ()-]{6,32}$/);
const emailSchema = z.string().trim().toLowerCase().email().max(254);

function uniqueArray<T extends z.ZodTypeAny>(item: T, min: number, max: number) {
  return z
    .array(item)
    .min(min)
    .max(max)
    .refine((values) => new Set(values).size === values.length, "Values must be distinct");
}

function atLeastOneKey(value: Record<string, unknown>) {
  return Object.values(value).some((entry) => entry !== undefined);
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export const organizationCreateSchema = z
  .object({
    name: plainText(2, 160),
    slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/),
    kind: z.enum(ORGANIZATION_KINDS),
    vendorCategory: z.enum(SUPPLIER_CATEGORIES).optional(),
    ownerUserId: idSchema
  })
  .strict()
  .refine((value) => value.kind !== "VENDOR" || value.vendorCategory, {
    message: "A vendor organization needs a vendor category",
    path: ["vendorCategory"]
  });

export const organizationMemberCreateSchema = z
  .object({ userId: idSchema, role: z.enum(ORGANIZATION_ROLES) })
  .strict();

export const organizationMemberUpdateSchema = z
  .object({
    role: z.enum(ORGANIZATION_ROLES).optional(),
    status: z.enum(MEMBERSHIP_STATUSES).optional()
  })
  .strict()
  .refine(atLeastOneKey, "Nothing to update");

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Fields whose change alters vendor-facing scope (blocked once signed). */
export const EVENT_SCOPE_FIELDS = [
  "locationLabel",
  "venue",
  "venueLat",
  "venueLng",
  "hotelZone",
  "vipGuestCount",
  "regularGuestCount",
  "carCount",
  "startAt",
  "endAt",
  "arrivalStartAt",
  "departureEndAt"
] as const;
export type EventScopeField = (typeof EVENT_SCOPE_FIELDS)[number];

/** Descriptive fields an EDIT holder may change. */
export const EVENT_DESCRIPTIVE_FIELDS = ["name", "brief", "planningMode"] as const;

const eventFieldShape = {
  name: plainText(2, 160),
  brief: plainText(1, 2000, true).nullable(),
  planningMode: z.enum(PLANNING_MODES),
  locationLabel: plainText(2, 200),
  venue: plainText(2, 200),
  venueLat: latSchema.nullable(),
  venueLng: lngSchema.nullable(),
  hotelZone: plainText(2, 120).nullable(),
  vipGuestCount: countSchema,
  regularGuestCount: countSchema,
  carCount: countSchema,
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  arrivalStartAt: isoDateSchema.nullable(),
  departureEndAt: isoDateSchema.nullable()
};

export type EventWindow = {
  startAt: Date | null;
  endAt: Date | null;
  arrivalStartAt: Date | null;
  departureEndAt: Date | null;
};

/** Window ordering: arrival <= start <= end <= departure (nulls skipped). */
export function eventWindowProblem(window: EventWindow): string | null {
  const { startAt, endAt, arrivalStartAt, departureEndAt } = window;
  if (startAt && endAt && endAt < startAt) return "endAt must not be before startAt";
  if (arrivalStartAt && startAt && arrivalStartAt > startAt) return "arrivalStartAt must not be after startAt";
  if (departureEndAt && endAt && departureEndAt < endAt) return "departureEndAt must not be before endAt";
  return null;
}

export const eventCreateSchema = z
  .object({
    organizationId: idSchema,
    name: eventFieldShape.name,
    brief: eventFieldShape.brief.optional(),
    planningMode: eventFieldShape.planningMode.default("MANUAL"),
    locationLabel: eventFieldShape.locationLabel,
    venue: eventFieldShape.venue.optional(),
    venueLat: eventFieldShape.venueLat.optional(),
    venueLng: eventFieldShape.venueLng.optional(),
    hotelZone: eventFieldShape.hotelZone.optional(),
    vipGuestCount: countSchema,
    regularGuestCount: countSchema,
    carCount: countSchema,
    startAt: isoDateSchema,
    endAt: isoDateSchema,
    arrivalStartAt: eventFieldShape.arrivalStartAt.optional(),
    departureEndAt: eventFieldShape.departureEndAt.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const problem = eventWindowProblem({
      startAt: value.startAt,
      endAt: value.endAt,
      arrivalStartAt: value.arrivalStartAt ?? null,
      departureEndAt: value.departureEndAt ?? null
    });
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

export const eventUpdateSchema = z
  .object({
    name: eventFieldShape.name.optional(),
    brief: eventFieldShape.brief.optional(),
    planningMode: eventFieldShape.planningMode.optional(),
    locationLabel: eventFieldShape.locationLabel.optional(),
    venue: eventFieldShape.venue.optional(),
    venueLat: eventFieldShape.venueLat.optional(),
    venueLng: eventFieldShape.venueLng.optional(),
    hotelZone: eventFieldShape.hotelZone.optional(),
    vipGuestCount: countSchema.optional(),
    regularGuestCount: countSchema.optional(),
    carCount: countSchema.optional(),
    startAt: isoDateSchema.optional(),
    endAt: isoDateSchema.optional(),
    arrivalStartAt: eventFieldShape.arrivalStartAt.optional(),
    departureEndAt: eventFieldShape.departureEndAt.optional()
  })
  .strict()
  .refine(atLeastOneKey, "Nothing to update");

export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

export const eventStatusSchema = z
  .object({ operationalStatus: z.enum(OPERATIONAL_STATUSES) })
  .strict();

/** Explicit human signature of the event contract (locks scope). */
export const eventContractSignSchema = z
  .object({ confirm: z.literal(true), reference: plainText(2, 120) })
  .strict();

export const OPERATIONAL_TRANSITIONS: Record<OperationalStatus, readonly OperationalStatus[]> = {
  PLANNING: ["ACTIVE"],
  ACTIVE: ["COMPLETED"],
  COMPLETED: []
};

export function canTransitionOperational(from: OperationalStatus, to: OperationalStatus) {
  return OPERATIONAL_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const manualPlanItemSchema = z
  .object({
    category: z.enum(["VEHICLES", "HOTEL_ROOMS", "TICKETS", "STAFF", "OTHER"]),
    quantity: z.number().int().min(0).max(WORKSPACE_LIMITS.maxEventCount),
    note: plainText(1, 300).optional()
  })
  .strict();

export const planGenerateSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ADVISORY") }).strict(),
  z
    .object({
      mode: z.literal("MANUAL"),
      summary: plainText(2, 2000, true),
      items: z.array(manualPlanItemSchema).min(1).max(40)
    })
    .strict()
]);

export const planApproveSchema = z.object({ confirm: z.literal(true) }).strict();

// ---------------------------------------------------------------------------
// Event memberships
// ---------------------------------------------------------------------------

const permissionList = uniqueArray(z.enum(EVENT_PERMISSIONS), 1, EVENT_PERMISSIONS.length).refine(
  (values) => values.includes("VIEW"),
  "VIEW is required"
);

export const eventMemberCreateSchema = z
  .object({
    userId: idSchema,
    role: z.enum(EVENT_MEMBER_ROLES),
    subteam: z.enum(EVENT_SUBTEAMS).nullable().optional(),
    workScope: z.string().trim().max(2000).nullable().optional(),
    permissions: permissionList,
    clientVisible: z.boolean().optional(),
    canReceive: z.boolean().optional(),
    available: z.boolean().optional()
  })
  .strict();

export const eventMemberUpdateSchema = z
  .object({
    role: z.enum(EVENT_MEMBER_ROLES).optional(),
    subteam: z.enum(EVENT_SUBTEAMS).nullable().optional(),
    workScope: z.string().trim().max(2000).nullable().optional(),
    permissions: permissionList.optional(),
    clientVisible: z.boolean().optional(),
    canReceive: z.boolean().optional(),
    available: z.boolean().optional(),
    status: z.enum(MEMBERSHIP_STATUSES).optional()
  })
  .strict()
  .refine(atLeastOneKey, "Nothing to update");

/** Availability is the member's own toggle (supervisor/captain on duty). */
export const memberAvailabilitySchema = z.object({ available: z.boolean() }).strict();

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const onboardingCreateSchema = z
  .object({
    kind: z.enum(ONBOARDING_KINDS),
    companyName: plainText(2, 160),
    registrationNumber: z.string().trim().regex(/^[A-Za-z0-9-]{4,60}$/).optional(),
    vendorCategory: z.enum(SUPPLIER_CATEGORIES).optional(),
    contactName: plainText(2, 120),
    contactEmail: emailSchema,
    contactPhone: phoneSchema,
    city: plainText(2, 80).optional(),
    notes: plainText(1, 2000, true).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "VENDOR" && !value.vendorCategory) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vendorCategory"], message: "Required for vendors" });
    }
    if (value.kind === "CLIENT" && value.vendorCategory) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vendorCategory"], message: "Only vendors have a category" });
    }
  });

export const ONBOARDING_TRANSITIONS: Record<OnboardingStatus, readonly OnboardingStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["CONTRACT_SIGNED"],
  REJECTED: [],
  CONTRACT_SIGNED: ["ACTIVE"],
  ACTIVE: []
};

export function canTransitionOnboarding(from: OnboardingStatus, to: OnboardingStatus) {
  return ONBOARDING_TRANSITIONS[from].includes(to);
}

/**
 * CONTRACT_SIGNED is a manual, human attestation: it needs an explicit
 * confirmation flag and a stored SIGNED_CONTRACT document (checked server
 * side). Nothing else in the body can set signed state.
 */
export const onboardingTransitionSchema = z
  .object({
    to: z.enum(ONBOARDING_STATUSES),
    note: plainText(1, 1000, true).optional(),
    confirmSignedContract: z.literal(true).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.to === "CONTRACT_SIGNED" && value.confirmSignedContract !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmSignedContract"],
        message: "Confirm the manually signed contract"
      });
    }
    if (value.to !== "CONTRACT_SIGNED" && value.confirmSignedContract !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmSignedContract"], message: "Not applicable" });
    }
    if (value.to === "REJECTED" && !value.note) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "A rejection reason is required" });
    }
  });

export const onboardingDocumentSchema = z
  .object({
    kind: z.enum(ONBOARDING_DOCUMENT_KINDS),
    fileName: z
      .string()
      .trim()
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,150}\.(pdf|png|jpe?g)$/iu),
    mimeType: z.enum(DOCUMENT_MIME_TYPES),
    contentBase64: z
      .string()
      .max(Math.ceil((WORKSPACE_LIMITS.maxDocumentBytes * 4) / 3) + 4)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  })
  .strict();

// ---------------------------------------------------------------------------
// Guests and privacy
// ---------------------------------------------------------------------------

export const GUEST_CODE_PATTERN = /^GV?[0-9]{2,4}$/;
export const PRIVACY_GROUP_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** Next free code for the category: G01.. for regular, GV01.. for VIP. */
export function nextGuestCode(existingCodes: Iterable<string>, isVip: boolean) {
  const prefix = isVip ? "GV" : "G";
  const pattern = isVip ? /^GV([0-9]{2,4})$/ : /^G([0-9]{2,4})$/;
  let highest = 0;
  for (const code of existingCodes) {
    const match = pattern.exec(code);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  const next = highest + 1;
  if (next > 9999) return null;
  return `${prefix}${String(next).padStart(2, "0")}`;
}

export function guestCodeMatchesTier(code: string, isVip: boolean) {
  return GUEST_CODE_PATTERN.test(code) && code.startsWith("GV") === isVip;
}

const guestFieldShape = {
  fullName: plainText(1, 160),
  contactPhone: phoneSchema.nullable(),
  contactEmail: emailSchema.nullable(),
  roomType: plainText(1, 60).nullable(),
  hotelName: plainText(1, 160).nullable(),
  arrivalAt: isoDateSchema.nullable(),
  departureAt: isoDateSchema.nullable(),
  ticketNumber: z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/).nullable(),
  originCity: plainText(1, 80).nullable(),
  arrivalCity: plainText(1, 80).nullable(),
  departureCity: plainText(1, 80).nullable(),
  privacyGroup: z.string().regex(PRIVACY_GROUP_PATTERN).nullable()
};

export const guestCreateSchema = z
  .object({
    guestCode: z.string().regex(GUEST_CODE_PATTERN).optional(),
    isVip: z.boolean(),
    fullName: guestFieldShape.fullName,
    contactPhone: guestFieldShape.contactPhone.optional(),
    contactEmail: guestFieldShape.contactEmail.optional(),
    roomType: guestFieldShape.roomType.optional(),
    hotelName: guestFieldShape.hotelName.optional(),
    arrivalAt: guestFieldShape.arrivalAt.optional(),
    departureAt: guestFieldShape.departureAt.optional(),
    ticketNumber: guestFieldShape.ticketNumber.optional(),
    originCity: guestFieldShape.originCity.optional(),
    arrivalCity: guestFieldShape.arrivalCity.optional(),
    departureCity: guestFieldShape.departureCity.optional(),
    privacyGroup: guestFieldShape.privacyGroup.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.guestCode && !guestCodeMatchesTier(value.guestCode, value.isVip)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guestCode"], message: "Code does not match the guest tier" });
    }
    if (value.arrivalAt && value.departureAt && value.departureAt < value.arrivalAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["departureAt"], message: "Departure precedes arrival" });
    }
  });

/** Roster edits; privacy and code changes use their own endpoints. */
export const guestUpdateSchema = z
  .object({
    fullName: guestFieldShape.fullName.optional(),
    contactPhone: guestFieldShape.contactPhone.optional(),
    contactEmail: guestFieldShape.contactEmail.optional(),
    roomType: guestFieldShape.roomType.optional(),
    hotelName: guestFieldShape.hotelName.optional(),
    arrivalAt: guestFieldShape.arrivalAt.optional(),
    departureAt: guestFieldShape.departureAt.optional(),
    ticketNumber: guestFieldShape.ticketNumber.optional(),
    originCity: guestFieldShape.originCity.optional(),
    arrivalCity: guestFieldShape.arrivalCity.optional(),
    departureCity: guestFieldShape.departureCity.optional(),
    privacyGroup: guestFieldShape.privacyGroup.optional()
  })
  .strict()
  .refine(atLeastOneKey, "Nothing to update");

export const guestPrivacySchema = z
  .object({
    masked: z.boolean(),
    viewerUserIds: uniqueArray(idSchema, 0, WORKSPACE_LIMITS.maxPrivacyViewers)
  })
  .strict();

export const groupPrivacySchema = z
  .object({ masked: z.boolean(), viewerUserIds: uniqueArray(idSchema, 0, WORKSPACE_LIMITS.maxPrivacyViewers) })
  .strict();

export const guestListQuerySchema = z
  .object({
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(WORKSPACE_LIMITS.maxPage).default(WORKSPACE_LIMITS.defaultPage)
  })
  .strict();

// ---------------------------------------------------------------------------
// Dispatch and inbox
// ---------------------------------------------------------------------------

export type DispatchSenderKind = "GUEST" | "ORGANIZER" | "LOGISTICS_MANAGER";

export type DispatchFlowSpec = {
  sender: DispatchSenderKind;
  recipientRole: EventMemberRole;
  /** Recipients allowed in one dispatch (more than one makes a GROUP). */
  maxRecipients: number;
  /** Whether a task may / must be attached, and its source. */
  task: "forbidden" | "optional" | "required";
  taskSource: TaskSource | null;
  emergency: boolean;
};

export const DISPATCH_FLOW_SPECS: Record<DispatchFlow, DispatchFlowSpec> = {
  GUEST_TO_LM: { sender: "GUEST", recipientRole: "LOGISTICS_MANAGER", maxRecipients: 1, task: "optional", taskSource: "CLIENT_TASK", emergency: false },
  GUEST_TO_SUPERVISOR: { sender: "GUEST", recipientRole: "FLEET_SUPERVISOR", maxRecipients: 1, task: "optional", taskSource: "CLIENT_TASK", emergency: false },
  GUEST_TO_CAPTAIN: { sender: "GUEST", recipientRole: "CAPTAIN", maxRecipients: 1, task: "optional", taskSource: "CLIENT_TASK", emergency: false },
  ORGANIZER_TO_LM: { sender: "ORGANIZER", recipientRole: "LOGISTICS_MANAGER", maxRecipients: WORKSPACE_LIMITS.maxDispatchRecipients, task: "optional", taskSource: "CLIENT_TASK", emergency: false },
  LM_TO_SUPERVISOR: { sender: "LOGISTICS_MANAGER", recipientRole: "FLEET_SUPERVISOR", maxRecipients: WORKSPACE_LIMITS.maxDispatchRecipients, task: "optional", taskSource: "LOGISTICS_TEAM_TASK", emergency: false },
  LM_TO_CAPTAIN_EMERGENCY: { sender: "LOGISTICS_MANAGER", recipientRole: "CAPTAIN", maxRecipients: 1, task: "required", taskSource: "LOGISTICS_TEAM_TASK", emergency: true }
};

/** Server-derived class: never chosen by the caller. */
export function deriveMessageClass(flow: DispatchFlow, recipientCount: number, hasTask: boolean): MessageClass {
  if (hasTask) return "TASK";
  if (DISPATCH_FLOW_SPECS[flow].sender === "GUEST") return "INQUIRY";
  return recipientCount > 1 ? "GROUP" : "INDIVIDUAL";
}

export const dispatchTaskSchema = z
  .object({
    type: z.enum(TASK_TYPES),
    pickupLocation: plainText(2, 200),
    dropoffLocation: plainText(2, 200),
    scheduledAt: isoDateSchema.optional()
  })
  .strict();

export const dispatchCreateSchema = z
  .object({
    flow: z.enum(DISPATCH_FLOWS),
    recipientUserIds: uniqueArray(idSchema, 1, WORKSPACE_LIMITS.maxDispatchRecipients),
    subject: plainText(1, 150),
    body: plainText(1, 5000, true),
    task: dispatchTaskSchema.optional(),
    supervisorUserId: idSchema.optional(),
    clientVisible: z.boolean().default(false),
    executiveVisible: z.boolean().default(false),
    clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const spec = DISPATCH_FLOW_SPECS[value.flow];
    if (value.recipientUserIds.length > spec.maxRecipients) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recipientUserIds"], message: "Too many recipients for this flow" });
    }
    if (spec.task === "forbidden" && value.task) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["task"], message: "This flow cannot create a task" });
    }
    if (spec.task === "required" && !value.task) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["task"], message: "This flow requires a task" });
    }
    if (!spec.emergency && value.supervisorUserId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supervisorUserId"], message: "Only for emergency dispatch" });
    }
  });

export const dispatchRecipientsQuerySchema = z.object({ flow: z.enum(DISPATCH_FLOWS) }).strict();

export const inboxQuerySchema = z
  .object({
    eventId: idSchema.optional(),
    messageClass: z.enum(MESSAGE_CLASSES).optional(),
    taskSource: z.enum(TASK_SOURCES).optional(),
    dispatchFlow: z.enum(DISPATCH_FLOWS).optional(),
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30)
  })
  .strict();

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export const TRIP_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  SCHEDULED: ["EN_ROUTE_TO_PICKUP", "CANCELLED"],
  EN_ROUTE_TO_PICKUP: ["ON_BOARD", "CANCELLED"],
  ON_BOARD: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
};

export function canTransitionTrip(from: TripStatus, to: TripStatus) {
  return TRIP_TRANSITIONS[from].includes(to);
}

export const vehicleCreateSchema = z
  .object({
    plateNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9 -]{2,20}$/),
    label: plainText(2, 80),
    capacity: z.number().int().min(1).max(100),
    driverId: idSchema.nullable().optional()
  })
  .strict();

export const vehicleUpdateSchema = z
  .object({
    label: plainText(2, 80).optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    status: z.enum(VEHICLE_STATUSES).optional(),
    driverId: idSchema.nullable().optional()
  })
  .strict()
  .refine(atLeastOneKey, "Nothing to update");

export const vehiclePositionSchema = z
  .object({ lat: latSchema, lng: lngSchema, inZone: z.boolean() })
  .strict();

const etaMinutes = z.number().int().min(0).max(WORKSPACE_LIMITS.maxEtaMinutes);

export const tripCreateSchema = z
  .object({
    vehicleId: idSchema.optional(),
    driverId: idSchema.optional(),
    passengerGuestIds: uniqueArray(idSchema, 0, WORKSPACE_LIMITS.maxTripPassengers),
    originLabel: plainText(2, 160),
    originLat: latSchema.optional(),
    originLng: lngSchema.optional(),
    destinationLabel: plainText(2, 160),
    destinationLat: latSchema.optional(),
    destinationLng: lngSchema.optional(),
    scheduledAt: isoDateSchema
  })
  .strict();

/**
 * Trip updates. ETAs typed here are always stored as APPROXIMATE; PROVIDER
 * values are written only by the server-side provider integration (M6).
 */
export const tripUpdateSchema = z
  .object({
    status: z.enum(TRIP_STATUSES).optional(),
    inZone: z.boolean().optional(),
    routePolyline: z.string().max(20_000).regex(/^[\x21-\x7e]*$/).nullable().optional(),
    captainEtaMinutes: etaMinutes.nullable().optional(),
    destinationEtaMinutes: etaMinutes.nullable().optional()
  })
  .strict()
  .refine(atLeastOneKey, "Nothing to update");

export const flightCreateSchema = z
  .object({
    flightNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,3}[0-9]{1,5}[A-Z]?$/),
    airline: plainText(2, 80).optional(),
    originCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3,4}$/),
    destinationCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3,4}$/),
    scheduledAt: isoDateSchema,
    estimatedAt: isoDateSchema.optional(),
    status: z.enum(FLIGHT_STATUSES).optional()
  })
  .strict();

export const shiftCreateSchema = z
  .object({
    driverId: idSchema,
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    zoneLabel: plainText(1, 80).optional()
  })
  .strict()
  .refine((value) => value.endsAt > value.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });

export const shiftUpdateSchema = z
  .object({ status: z.enum(SHIFT_STATUSES).optional(), available: z.boolean().optional() })
  .strict()
  .refine(atLeastOneKey, "Nothing to update");

export const densityCreateSchema = z
  .object({
    zoneKey: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    headcount: z.number().int().min(0).max(1_000_000),
    capacity: z.number().int().min(1).max(1_000_000).optional(),
    capturedAt: isoDateSchema.optional()
  })
  .strict();

export const telemetryQuerySchema = z
  .object({
    vehicleStatus: z.enum(VEHICLE_STATUSES).optional(),
    flightScope: z.enum(["EVENT", "GENERAL", "ALL"]).default("ALL")
  })
  .strict();

/** Aggregates below the threshold are withheld (k-anonymity style). */
export function suppressDensity(headcount: number) {
  return headcount < WORKSPACE_LIMITS.densityMinimumHeadcount
    ? { headcount: null, suppressed: true as const }
    : { headcount, suppressed: false as const };
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export type PersonDto = { id: string; name: string };

export type OrganizationDto = {
  id: string;
  name: string;
  slug: string;
  kind: OrganizationKind;
  vendorCategory: string | null;
  myRole: OrganizationRole | null;
};

export type OrganizationMemberDto = {
  id: string;
  user: PersonDto;
  role: OrganizationRole;
  status: MembershipStatus;
};

export type EventAccessDto = {
  permissions: EventPermission[];
  eventRole: EventMemberRole | null;
  organizationRole: OrganizationRole | null;
  support: boolean;
  guest: boolean;
};

export type WorkspaceEventDto = {
  id: string;
  organizationId: string;
  name: string;
  brief: string | null;
  venue: string;
  locationLabel: string | null;
  venueLat: number | null;
  venueLng: number | null;
  hotelZone: string | null;
  planningMode: PlanningMode;
  operationalStatus: OperationalStatus;
  vipGuestCount: number;
  regularGuestCount: number;
  carCount: number;
  startAt: string | null;
  endAt: string | null;
  arrivalStartAt: string | null;
  departureEndAt: string | null;
  planApproved: boolean;
  planApprovedAt: string | null;
  approvedPlanId: string | null;
  contractSigned: boolean;
  contractSignedAt: string | null;
  access: EventAccessDto;
};

export type EventPlanDto = {
  id: string;
  version: number;
  status: EventPlanStatus;
  source: EventPlanSource;
  advisory: boolean;
  /** Human-readable provenance, e.g. deterministic fallback, not AI output. */
  sourceLabel: string;
  summary: string;
  content: unknown;
  generatedBy: PersonDto;
  approvedBy: PersonDto | null;
  approvedAt: string | null;
  createdAt: string;
};

export type EventMemberDto = {
  id: string;
  user: PersonDto;
  role: EventMemberRole;
  subteam: EventSubteam | null;
  workScope: string | null;
  permissions: EventPermission[];
  clientVisible: boolean;
  canReceive: boolean;
  available: boolean;
  status: MembershipStatus;
};

export type OnboardingDocumentDto = {
  id: string;
  kind: OnboardingDocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export type OnboardingApplicationDto = {
  id: string;
  kind: OnboardingKind;
  status: OnboardingStatus;
  companyName: string;
  registrationNumber: string | null;
  vendorCategory: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  city: string | null;
  notes: string | null;
  decisionNote: string | null;
  organizationId: string | null;
  applicant: PersonDto;
  submittedAt: string;
  contractSignedAt: string | null;
  activatedAt: string | null;
  allowedTransitions: OnboardingStatus[];
  documents: OnboardingDocumentDto[];
  transitions: Array<{ from: OnboardingStatus | null; to: OnboardingStatus; at: string; actor: PersonDto; note: string | null }>;
};

export type GuestDetailDto = {
  id: string;
  guestCode: string;
  isVip: boolean;
  masked: false;
  privacyMasked: boolean;
  privacyGroup: string | null;
  position: { lat: number; lng: number; at: string } | null;
  fullName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  roomType: string | null;
  hotelName: string | null;
  arrivalAt: string | null;
  departureAt: string | null;
  ticketNumber: string | null;
  originCity: string | null;
  arrivalCity: string | null;
  departureCity: string | null;
};

/** What a viewer without detail rights receives: the code only. */
export type GuestCodeOnlyDto = { id: string; guestCode: string; isVip: boolean; masked: true };

export type GuestDto = GuestDetailDto | GuestCodeOnlyDto;

export type InboxItemDto = {
  unreadCount: number;
  conversationId: string;
  subject: string;
  eventId: string | null;
  taskSource: TaskSource | null;
  messageClass: MessageClass;
  dispatchFlow: DispatchFlow | null;
  lastMessageAt: string;
  participants: Array<PersonDto & { role: string }>;
  preview: string | null;
};

export type DispatchResultDto = {
  dispatchId: string;
  flow: DispatchFlow;
  conversationId: string;
  messageClass: MessageClass;
  taskId: string | null;
  taskSource: TaskSource | null;
  supervisorAlert: { userId: string; conversationId: string } | null;
  replayed: boolean;
};

export type VehicleDto = {
  id: string;
  plateNumber: string;
  label: string;
  capacity: number;
  status: VehicleStatus;
  driver: PersonDto | null;
  position: { lat: number; lng: number; at: string | null } | null;
  positionWithheld: boolean;
  inZone: boolean;
};

export type TripDto = {
  id: string;
  status: TripStatus;
  vehicleId: string | null;
  driver: PersonDto | null;
  passengers: GuestDto[];
  movementWithheld: boolean;
  origin: { label: string; lat: number | null; lng: number | null } | null;
  destination: { label: string; lat: number | null; lng: number | null } | null;
  routePolyline: string | null;
  inZone: boolean | null;
  eta: {
    captainToGuestMinutes: number | null;
    guestToDestinationMinutes: number | null;
    source: EtaSource;
    /** UI copy hint: APPROXIMATE and UNAVAILABLE are never live values. */
    live: boolean;
    updatedAt: string | null;
  };
  scheduledAt: string;
};

export type FlightDto = {
  id: string;
  scope: FlightScope;
  flightNumber: string;
  airline: string | null;
  originCode: string;
  destinationCode: string;
  scheduledAt: string;
  estimatedAt: string | null;
  status: FlightStatus;
  dataSource: string;
};

export type ShiftDto = {
  id: string;
  driver: PersonDto;
  startsAt: string;
  endsAt: string;
  status: ShiftStatus;
  available: boolean;
  zoneLabel: string | null;
};

export type DensityDto = {
  zoneKey: string;
  capturedAt: string;
  headcount: number | null;
  suppressed: boolean;
  capacity: number | null;
};

export type TelemetrySnapshotDto = {
  eventId: string;
  vehicles: VehicleDto[];
  trips: TripDto[];
  flights: FlightDto[];
  shifts: ShiftDto[];
  density: DensityDto[];
  scope: "FULL" | "CAPTAIN_SELF";
};

export const messagingPolicySchema = z.object({
  individualSenderIds: uniqueArray(idSchema,0,500), groupSenderIds: uniqueArray(idSchema,0,500),
  taskReceiverIds: uniqueArray(idSchema,0,500), clientVisible: z.boolean(), executiveVisible: z.boolean()
}).strict();
export type EventMessagingPolicy = z.infer<typeof messagingPolicySchema>;
export const eventInviteSchema = eventMemberCreateSchema.omit({ userId:true, available:true }).extend({ email:emailSchema });
