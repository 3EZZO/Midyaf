import type { Prisma, PrismaClient } from "@prisma/client";
import {createHash} from 'node:crypto';
import {
  APPLICATION_MODELS,
  DEMO_ACCOUNTS,
  DEMO_SCHEMA,
  DemoProvisioningError,
  TRANSACTION_OPTIONS,
  accountBaselineFingerprint,
  assertExpectedHost,
  assertRepositoryRoot,
  extractAccountBaselineArgs,
  loadTargetUrl,
  matchesAccountBaseline,
  validateTargetUrl,
  type AccountBaseline,
  type DemoAccountKey,
  type DemoTarget
} from "./demoProvisioning.js";
import { buildAdvisoryPlan } from "./workspacePolicy.js";

/**
 * FULL-OVERHAUL-M2 namespaced synthetic fixture for the organization/event
 * workspace. Dry run is the default and never writes.
 *
 * - Every new row id starts with `ovh2_`; organization slugs start with
 *   `ovh2-`. The fixture inserts rows and then sets the approved plan of
 *   its own events; nothing outside the namespace is written. Old scripted
 *   War Room data, accounts, passwords and legacy events are never touched.
 *   Fixture events keep the legacy status DRAFT so legacy "live event"
 *   pickers do not select them.
 * - No account or credential is created. Existing certified demo personas
 *   (DEMO_ACCOUNTS) are used through their stored roles; the two extra
 *   GUEST accounts are not used.
 * - `--apply` needs the pinned target (host, database, schema) and the
 *   ORIGINAL full-account count and fingerprint; it re-checks everything
 *   inside one serialized transaction. A rerun after success is a no-op;
 *   a partial or conflicting namespace is refused, never overwritten.
 * - `--verify` is read-only.
 *
 * Output: host, database, schema, counts, the account fingerprint and the
 * namespaced ids. Never URLs, credentials, emails or guest details.
 */

export const OVERHAUL_NAMESPACE = "ovh2";

const ns = (suffix: string) => `${OVERHAUL_NAMESPACE}_${suffix}`;

export const OVERHAUL_FAILURES = {
  "args-invalid":
    "Usage: provisionOverhaulDemo --expected-host <host> --expected-database <db> --expected-schema midyaf [--apply | --verify] [--expected-account-count <n> --expected-account-fingerprint <sha256>]",
  "baseline-required": "--apply needs --expected-account-count and --expected-account-fingerprint of the original accounts.",
  "expected-database-mismatch": "The target database does not match --expected-database.",
  "expected-schema-mismatch": "The target schema does not match --expected-schema.",
  "schema-incomplete": "The midyaf schema lacks FULL-OVERHAUL-002 objects; apply prisma/full-overhaul-002-additive.sql first.",
  "account-baseline-mismatch": "The accounts do not match the pinned original count and fingerprint.",
  "persona-missing": "A certified demo persona (or a captain's driver profile) is missing or has another stored role.",
  "fixture-partial": "Only part of the ovh2 namespace exists; refusing to continue.",
  "fixture-conflict": "An ovh2 record or slug exists with different content; refusing to overwrite.",
  "database-error": "A database query failed (details withheld).",
  "transaction-failed": "The fixture transaction failed and was rolled back (details withheld)."
} as const;

export type OverhaulFailure = keyof typeof OVERHAUL_FAILURES;

export class OverhaulDemoError extends Error {
  constructor(readonly reason: OverhaulFailure) {
    super(OVERHAUL_FAILURES[reason]);
    this.name = "OverhaulDemoError";
  }
}

export function describeOverhaulFailure(error: unknown) {
  if (error instanceof OverhaulDemoError) return { reason: error.reason, message: error.message };
  if (error instanceof DemoProvisioningError) return { reason: error.reason, message: error.message };
  return { reason: "unexpected", message: "Unexpected failure (details withheld)." };
}

// ---------------------------------------------------------------------------
// Arguments and target
// ---------------------------------------------------------------------------

export type OverhaulMode = "dry-run" | "apply" | "verify";

export type OverhaulOptions = {
  mode: OverhaulMode;
  expectedHost: string;
  expectedDatabase: string;
  expectedSchema: string;
  accountBaseline?: AccountBaseline;
};

const HOST = /^[A-Za-z0-9.-]{1,253}$/;
const DATABASE = /^[A-Za-z0-9_-]{1,63}$/;
const SCHEMA = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export function parseOverhaulArgs(argv: string[]): OverhaulOptions {
  let extracted: ReturnType<typeof extractAccountBaselineArgs>;
  try {
    extracted = extractAccountBaselineArgs(argv);
  } catch {
    throw new OverhaulDemoError("args-invalid");
  }
  const rest = extracted.argv;
  let mode: OverhaulMode = "dry-run";
  let modeSet = false;
  const values = new Map<string, string>();

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if ((arg === "--apply" || arg === "--verify") && !modeSet) {
      mode = arg === "--apply" ? "apply" : "verify";
      modeSet = true;
    } else if (["--expected-host", "--expected-database", "--expected-schema"].includes(arg) && !values.has(arg)) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) throw new OverhaulDemoError("args-invalid");
      values.set(arg, value);
      index += 1;
    } else {
      throw new OverhaulDemoError("args-invalid");
    }
  }

  const expectedHost = values.get("--expected-host")?.toLowerCase();
  const expectedDatabase = values.get("--expected-database");
  const expectedSchema = values.get("--expected-schema");
  if (
    !expectedHost || !HOST.test(expectedHost) ||
    !expectedDatabase || !DATABASE.test(expectedDatabase) ||
    !expectedSchema || !SCHEMA.test(expectedSchema)
  ) {
    throw new OverhaulDemoError("args-invalid");
  }
  if (mode === "apply" && !extracted.accountBaseline) throw new OverhaulDemoError("baseline-required");
  return {
    mode,
    expectedHost,
    expectedDatabase,
    expectedSchema,
    ...(extracted.accountBaseline ? { accountBaseline: extracted.accountBaseline } : {})
  };
}

export function resolveOverhaulTarget(root: string, options: OverhaulOptions, readFile?: (file: string) => string): DemoTarget {
  assertRepositoryRoot(root);
  const target = validateTargetUrl(loadTargetUrl(root, readFile));
  assertExpectedHost(target, options.expectedHost);
  if (target.database !== options.expectedDatabase) throw new OverhaulDemoError("expected-database-mismatch");
  if (target.schema !== options.expectedSchema) throw new OverhaulDemoError("expected-schema-mismatch");
  return target;
}

// ---------------------------------------------------------------------------
// Personas and fixture plan
// ---------------------------------------------------------------------------

/** Certified personas the fixture uses (by DEMO_ACCOUNTS key). */
export const OVERHAUL_PERSONAS = [
  "admin",
  "company",
  "logistics",
  "eventLead",
  "client",
  "driver",
  "driverTwo",
  "guestVip",
  "guest",
  "supplier",
  "coordinator"
] as const satisfies ReadonlyArray<DemoAccountKey>;

export type OverhaulPersona = (typeof OVERHAUL_PERSONAS)[number];

export type PersonaIds = Record<OverhaulPersona, string> & { drivers: { driver: string; driverTwo: string } };

export type OverhaulFixture = {
  onboardingApplications: Prisma.OnboardingApplicationCreateManyInput[];
  onboardingDocuments: Prisma.OnboardingDocumentCreateManyInput[];
  onboardingTransitions: Prisma.OnboardingTransitionCreateManyInput[];
  organizations: Prisma.OrganizationCreateManyInput[];
  organizationMemberships: Prisma.OrganizationMembershipCreateManyInput[];
  events: Prisma.EventCreateManyInput[];
  eventPlans: Prisma.EventPlanCreateManyInput[];
  approvedPlans: Array<{ eventId: string; planId: string; approvedAt: Date }>;
  eventMemberships: Prisma.EventMembershipCreateManyInput[];
  guests: Prisma.GuestCreateManyInput[];
  eventGuests: Prisma.EventGuestCreateManyInput[];
  guestPrivacyGrants: Prisma.GuestPrivacyGrantCreateManyInput[];
  vehicles: Prisma.VehicleCreateManyInput[];
  conversations: Prisma.ConversationCreateManyInput[];
  conversationParticipants: Prisma.ConversationParticipantCreateManyInput[];
  conversationMessages: Prisma.ConversationMessageCreateManyInput[];
  tasks: Prisma.TaskCreateManyInput[];
  dispatchRecords: Prisma.DispatchRecordCreateManyInput[];
  trips: Prisma.TripCreateManyInput[];
  tripPassengers: Prisma.TripPassengerCreateManyInput[];
  flights: Prisma.FlightCreateManyInput[];
  captainShifts: Prisma.CaptainShiftCreateManyInput[];
  densitySamples: Prisma.DensitySampleCreateManyInput[];
};

export type FixtureTable = Exclude<keyof OverhaulFixture, "approvedPlans">;

const at = (value: string) => new Date(value);

type EventSpec = {
  key: "completed" | "active" | "planning";
  name: string;
  operationalStatus: "PLANNING" | "ACTIVE" | "COMPLETED";
  start: string;
  end: string;
  vip: number;
  regular: number;
  cars: number;
  signed: boolean;
};

const EVENTS: EventSpec[] = [
  { key: "completed", name: "Overhaul Demo Forum 2026 (Synthetic)", operationalStatus: "COMPLETED", start: "2026-09-14T06:00:00.000Z", end: "2026-09-16T18:00:00.000Z", vip: 4, regular: 30, cars: 12, signed: true },
  { key: "active", name: "Overhaul Demo Summit (Synthetic)", operationalStatus: "ACTIVE", start: "2026-10-18T06:00:00.000Z", end: "2026-10-22T18:00:00.000Z", vip: 6, regular: 40, cars: 16, signed: true },
  { key: "planning", name: "Overhaul Demo Expo (Synthetic)", operationalStatus: "PLANNING", start: "2026-12-06T06:00:00.000Z", end: "2026-12-08T18:00:00.000Z", vip: 3, regular: 20, cars: 6, signed: false }
];

export const OVERHAUL_IDS = {
  organizerOrg: ns("org_events"),
  vendorOrg: ns("org_vendor"),
  events: { completed: ns("evt_completed"), active: ns("evt_active"), planning: ns("evt_planning") }
} as const;

/** The full deterministic plan. Only `personas` varies between databases. */
export function buildOverhaulFixture(p: PersonaIds): OverhaulFixture {
  const ev = OVERHAUL_IDS.events;
  const f: OverhaulFixture = {
    onboardingApplications: [],onboardingDocuments: [],onboardingTransitions: [],
    organizations: [
      { id: OVERHAUL_IDS.organizerOrg, name: "Overhaul Demo Events Co (Synthetic)", slug: "ovh2-demo-events", kind: "ORGANIZER_COMPANY", createdById: p.admin, createdAt: at("2026-09-01T08:00:00.000Z") },
      { id: OVERHAUL_IDS.vendorOrg, name: "Overhaul Demo Hotel Vendor (Synthetic)", slug: "ovh2-demo-vendor", kind: "VENDOR", vendorCategory: "HOTEL", createdById: p.admin, createdAt: at("2026-09-01T08:00:00.000Z") }
    ],
    organizationMemberships: [
      { id: ns("om_events_owner"), organizationId: OVERHAUL_IDS.organizerOrg, userId: p.eventLead, role: "OWNER", status: "ACTIVE", grantedById: p.admin },
      { id: ns("om_vendor_owner"), organizationId: OVERHAUL_IDS.vendorOrg, userId: p.supplier, role: "OWNER", status: "ACTIVE", grantedById: p.admin }
    ],
    events: [],
    eventPlans: [],
    approvedPlans: [],
    eventMemberships: [],
    guests: [],
    eventGuests: [],
    guestPrivacyGrants: [],
    vehicles: [],
    conversations: [],
    conversationParticipants: [],
    conversationMessages: [],
    tasks: [],
    dispatchRecords: [],
    trips: [],
    tripPassengers: [],
    flights: [],
    captainShifts: [],
    densitySamples: []
  };

  for (const spec of EVENTS) {
    const id = ev[spec.key];
    const start = at(spec.start);
    const end = at(spec.end);
    const arrival = new Date(start.getTime() - 24 * 3600_000);
    const departure = new Date(end.getTime() + 24 * 3600_000);
    f.events.push({
      id,
      organizationId: OVERHAUL_IDS.organizerOrg,
      organizerId: p.eventLead,
      name: spec.name,
      date: start,
      venue: "Overhaul Demo Convention Hall (Synthetic)",
      venueLat: 24.7642,
      venueLng: 46.6406,
      status: "DRAFT",
      brief: "Synthetic FULL-OVERHAUL showcase event. No real guests, drivers, vendors or documents.",
      operationalStatus: spec.operationalStatus,
      planningMode: "AI",
      locationLabel: "Riyadh, north business district (synthetic)",
      hotelZone: "Olaya hotel zone (synthetic)",
      vipGuestCount: spec.vip,
      regularGuestCount: spec.regular,
      carCount: spec.cars,
      startAt: start,
      endAt: end,
      arrivalStartAt: arrival,
      departureEndAt: departure,
      contractSignedAt: spec.signed ? new Date(start.getTime() - 10 * 24 * 3600_000) : null,
      contractSignedById: spec.signed ? p.eventLead : null
    });

    const advisory = buildAdvisoryPlan({
      vipGuestCount: spec.vip,
      regularGuestCount: spec.regular,
      carCount: spec.cars,
      hotelZone: "Olaya hotel zone (synthetic)",
      locationLabel: "Riyadh, north business district (synthetic)",
      venue: "Overhaul Demo Convention Hall (Synthetic)",
      startAt: start,
      endAt: end,
      arrivalStartAt: arrival,
      departureEndAt: departure
    });
    const generatedAt = new Date(start.getTime() - 30 * 24 * 3600_000);
    const approvedAt = new Date(start.getTime() - 25 * 24 * 3600_000);
    if (spec.key === "active") {
      f.eventPlans.push({ id: ns(`plan_${spec.key}_v1`), eventId: id, version: 1, status: "SUPERSEDED", source: "DETERMINISTIC_ADVISORY", advisory: true, summary: advisory.summary, content: advisory.content, generatedById: p.company, createdAt: generatedAt });
      f.eventPlans.push({ id: ns(`plan_${spec.key}_v2`), eventId: id, version: 2, status: "APPROVED", source: "MANUAL", advisory: false, summary: "Manual revision: two extra shuttles for the press group (synthetic).", content: { generator: "manual", logistics:["Synthetic airport arrivals and venue transfers"], hotelDistribution:["26 estimated rooms across the synthetic hotel zone"], vehicleRequirements:["16 estimated vehicles; two additional press shuttles"], teamRequirements:["Project lead, logistics manager and four operational subteams"], scopeOfWork:["Airport reception, hotel transfers, venue operations and departures"], items: [{ category: "VEHICLES", quantity: 16, note: "Two extra shuttles (synthetic)" }, { category: "HOTEL_ROOMS", quantity: 26, note: null }] }, generatedById: p.company, approvedById: p.eventLead, approvedAt, createdAt: generatedAt });
      f.approvedPlans.push({ eventId: id, planId: ns(`plan_${spec.key}_v2`), approvedAt });
    } else if (spec.key === "completed") {
      f.eventPlans.push({ id: ns(`plan_${spec.key}_v1`), eventId: id, version: 1, status: "APPROVED", source: "DETERMINISTIC_ADVISORY", advisory: true, summary: advisory.summary, content: advisory.content, generatedById: p.company, approvedById: p.eventLead, approvedAt, createdAt: generatedAt });
      f.approvedPlans.push({ eventId: id, planId: ns(`plan_${spec.key}_v1`), approvedAt });
    } else {
      f.eventPlans.push({ id: ns(`plan_${spec.key}_v1`), eventId: id, version: 1, status: "DRAFT", source: "DETERMINISTIC_ADVISORY", advisory: true, summary: advisory.summary, content: advisory.content, generatedById: p.company, createdAt: generatedAt });
    }
  }

  const member = (
    eventKey: EventSpec["key"],
    persona: OverhaulPersona,
    role: Prisma.EventMembershipCreateManyInput["role"],
    permissions: Array<"VIEW" | "EDIT" | "INVITE" | "SCOPE">,
    extra: Partial<Prisma.EventMembershipCreateManyInput> = {}
  ) => {
    f.eventMemberships.push({
      id: ns(`em_${eventKey}_${persona}`),
      eventId: ev[eventKey],
      userId: p[persona],
      role,
      permissions,
      status: "ACTIVE",
      grantedById: p.eventLead,
      ...extra
    });
  };
  for (const key of ["completed", "active"] as const) {
    member(key, "company", "PROJECT_MANAGER", ["VIEW", "EDIT", "INVITE", "SCOPE"], { clientVisible: true });
    member(key, "logistics", "LOGISTICS_MANAGER", ["VIEW", "EDIT", "INVITE"], { subteam: "TRANSPORT", clientVisible: true });
    member(key, "coordinator", "FLEET_SUPERVISOR", ["VIEW", "EDIT"], { subteam: "TRANSPORT", available: true });
    member(key, "driver", "CAPTAIN", ["VIEW"], { subteam: "TRANSPORT" });
    member(key, "driverTwo", "CAPTAIN", ["VIEW"], { subteam: "AIRPORT" });
    member(key, "client", "CLIENT_VIEWER", ["VIEW"]);
    member(key, "supplier", "VENDOR", ["VIEW"], { subteam: "HOTELS" });
  }
  member("planning", "company", "PROJECT_MANAGER", ["VIEW", "EDIT", "INVITE", "SCOPE"], { clientVisible: true });
  member("planning", "logistics", "LOGISTICS_MANAGER", ["VIEW", "EDIT", "INVITE"], { subteam: "TRANSPORT" });
  member("planning", "supplier", "VENDOR", ["VIEW"], { subteam: "HOTELS" });

  // Login guests of the active event (new Guest rows; old ones untouched).
  f.guests.push(
    { id: ns("gst_active_vip"), userId: p.guestVip, eventId: ev.active, rsvpStatus: "CONFIRMED", isVIP: true, tier: "vip", qrCode: "OVH2-ACTIVE-GV01" },
    { id: ns("gst_active_std"), userId: p.guest, eventId: ev.active, rsvpStatus: "CONFIRMED", isVIP: false, tier: "standard", qrCode: "OVH2-ACTIVE-G01" }
  );

  const roster = (eventKey: EventSpec["key"], code: string, extra: Partial<Prisma.EventGuestCreateManyInput> = {}) => {
    const isVip = code.startsWith("GV");
    f.eventGuests.push({
      id: ns(`eg_${eventKey}_${code.toLowerCase()}`),
      eventId: ev[eventKey],
      guestCode: code,
      isVip,
      fullName: `${isVip ? "VIP" : "Guest"} ${code} (Synthetic)`,
      roomType: isVip ? "Suite" : "Deluxe",
      hotelName: "Overhaul Demo Hotel (Synthetic)",
      originCity: "Jeddah",
      arrivalCity: "Riyadh",
      departureCity: "Riyadh",
      ticketNumber: `OVH2-${eventKey.toUpperCase()}-${code}`,
      ...extra
    });
  };
  const activeStart = at("2026-10-18T06:00:00.000Z");
  roster("active", "GV01", { guestId: ns("gst_active_vip"), arrivalAt: new Date(activeStart.getTime() - 20 * 3600_000), departureAt: at("2026-10-23T10:00:00.000Z") });
  roster("active", "GV02", { privacyMasked: true, arrivalAt: new Date(activeStart.getTime() - 18 * 3600_000) });
  roster("active", "G01", { guestId: ns("gst_active_std") });
  roster("active", "G02");
  roster("active", "G03");
  roster("active", "G04", { privacyMasked: true, privacyGroup: "press" });
  roster("active", "G05", { privacyMasked: true, privacyGroup: "press" });
  roster("completed", "GV01");
  roster("completed", "G01");
  roster("completed", "G02");
  roster("planning", "GV01");
  roster("planning", "G01");

  f.guestPrivacyGrants.push(
    { id: ns("pg_active_gv02_company"), eventId: ev.active, eventGuestId: ns("eg_active_gv02"), viewerUserId: p.company, grantedById: p.eventLead },
    { id: ns("pg_active_press_logistics"), eventId: ev.active, groupKey: "press", viewerUserId: p.logistics, grantedById: p.eventLead }
  );

  f.vehicles.push(
    { id: ns("veh_active_1"), eventId: ev.active, plateNumber: "OVH2-101", label: "VIP sedan 1 (synthetic)", capacity: 3, status: "ASSIGNED_TO_TASK", driverId: p.drivers.driver, lastLat: 24.7712, lastLng: 46.6531, lastSeenAt: at("2026-10-19T08:00:00.000Z"), inZone: true },
    { id: ns("veh_active_2"), eventId: ev.active, plateNumber: "OVH2-102", label: "Shuttle 1 (synthetic)", capacity: 12, status: "AVAILABLE", driverId: p.drivers.driverTwo, lastLat: 24.7601, lastLng: 46.6402, lastSeenAt: at("2026-10-19T08:00:00.000Z"), inZone: true },
    { id: ns("veh_active_3"), eventId: ev.active, plateNumber: "OVH2-103", label: "Shuttle 2 (synthetic)", capacity: 12, status: "WAITING", lastLat: 24.7655, lastLng: 46.6449, lastSeenAt: at("2026-10-19T07:55:00.000Z"), inZone: true },
    { id: ns("veh_active_4"), eventId: ev.active, plateNumber: "OVH2-104", label: "Standby SUV (synthetic)", capacity: 6, status: "OUT_OF_ZONE", lastLat: 24.9576, lastLng: 46.6988, lastSeenAt: at("2026-10-19T07:40:00.000Z"), inZone: false }
  );

  // Dispatch threads for four flows (guest->LM, organizer->LM with a
  // client task, LM->supervisor with a team task, LM->captain emergency
  // with the supervisor alert).
  const sentAt = (minute: number) => new Date(at("2026-10-19T07:00:00.000Z").getTime() + minute * 60_000);
  const thread = (
    key: string,
    subject: string,
    messageClass: Prisma.ConversationCreateManyInput["messageClass"],
    flow: Prisma.ConversationCreateManyInput["dispatchFlow"],
    sender: OverhaulPersona,
    recipients: OverhaulPersona[],
    body: string,
    minute: number
  ) => {
    const id = ns(`conv_${key}`);
    const when = sentAt(minute);
    f.conversations.push({ id, subject, createdById: p[sender], lastMessageAt: when, createdAt: when, eventId: ev.active, messageClass, dispatchFlow: flow });
    f.conversationParticipants.push(
      { id: ns(`cp_${key}_${sender}`), conversationId: id, userId: p[sender], lastReadAt: when, joinedAt: when },
      ...recipients.map((recipient) => ({ id: ns(`cp_${key}_${recipient}`), conversationId: id, userId: p[recipient], joinedAt: when }))
    );
    f.conversationMessages.push({ id: ns(`msg_${key}_1`), conversationId: id, senderId: p[sender], body, createdAt: when });
    return id;
  };

  const guestInquiry = thread("guest_lm", "Late check-in request (synthetic)", "INQUIRY", "GUEST_TO_LM", "guestVip", ["logistics"], "Synthetic: my flight lands late; can the hotel hold my room?", 0);
  const clientThread = thread("org_lm", "Extra shuttle for press group (synthetic)", "TASK", "ORGANIZER_TO_LM", "company", ["logistics"], "Synthetic: please add a shuttle for the press group at 14:00.", 5);
  const teamThread = thread("lm_sup", "Stage shuttles at gate B (synthetic)", "TASK", "LM_TO_SUPERVISOR", "logistics", ["coordinator"], "Synthetic: stage two shuttles at gate B before the keynote.", 10);
  const emergencyThread = thread("lm_cap", "Emergency VIP pickup (synthetic)", "TASK", "LM_TO_CAPTAIN_EMERGENCY", "logistics", ["driver"], "Synthetic: urgent pickup of GV01 at the hotel lobby.", 15);
  const alertThread = thread("lm_cap_alert", "Emergency dispatch: Emergency VIP pickup (synthetic)", "ALERT", "LM_TO_CAPTAIN_EMERGENCY", "logistics", ["coordinator"], "Synthetic: emergency task dispatched to captain one.", 15);

  f.tasks.push(
    { id: ns("task_client_shuttle"), eventId: ev.active, type: "VENUE_TRANSFER", status: "PENDING", pickupLocation: "Overhaul Demo Hotel (Synthetic)", dropoffLocation: "Overhaul Demo Convention Hall (Synthetic)", scheduledAt: at("2026-10-19T11:00:00.000Z"), responsibleUserId: p.logistics, source: "CLIENT_TASK", createdById: p.company, conversationId: clientThread },
    { id: ns("task_team_staging"), eventId: ev.active, type: "VENUE_TRANSFER", status: "PENDING", pickupLocation: "Fleet yard (synthetic)", dropoffLocation: "Gate B (synthetic)", scheduledAt: at("2026-10-19T09:30:00.000Z"), responsibleUserId: p.coordinator, source: "LOGISTICS_TEAM_TASK", createdById: p.logistics, conversationId: teamThread },
    { id: ns("task_emergency_pickup"), eventId: ev.active, type: "VIP_ESCORT", status: "ASSIGNED", pickupLocation: "Overhaul Demo Hotel lobby (Synthetic)", dropoffLocation: "Overhaul Demo Convention Hall (Synthetic)", scheduledAt: sentAt(20), driverId: p.drivers.driver, responsibleUserId: p.logistics, source: "LOGISTICS_TEAM_TASK", createdById: p.logistics, conversationId: emergencyThread }
  );

  f.dispatchRecords.push(
    { id: ns("dsp_guest_lm"), eventId: ev.active, flow: "GUEST_TO_LM", senderUserId: p.guestVip, senderEventRole: "GUEST", recipientUserId: p.logistics, conversationId: guestInquiry, createdAt: sentAt(0) },
    { id: ns("dsp_org_lm"), eventId: ev.active, flow: "ORGANIZER_TO_LM", senderUserId: p.company, senderEventRole: "PROJECT_MANAGER", recipientUserId: p.logistics, conversationId: clientThread, taskId: ns("task_client_shuttle"), createdAt: sentAt(5) },
    { id: ns("dsp_lm_sup"), eventId: ev.active, flow: "LM_TO_SUPERVISOR", senderUserId: p.logistics, senderEventRole: "LOGISTICS_MANAGER", recipientUserId: p.coordinator, conversationId: teamThread, taskId: ns("task_team_staging"), createdAt: sentAt(10) },
    { id: ns("dsp_lm_cap"), eventId: ev.active, flow: "LM_TO_CAPTAIN_EMERGENCY", senderUserId: p.logistics, senderEventRole: "LOGISTICS_MANAGER", recipientUserId: p.driver, supervisorUserId: p.coordinator, conversationId: emergencyThread, alertConversationId: alertThread, taskId: ns("task_emergency_pickup"), emergency: true, createdAt: sentAt(15) }
  );

  f.trips.push(
    { id: ns("trip_active_vip"), eventId: ev.active, vehicleId: ns("veh_active_1"), driverId: p.drivers.driver, taskId: ns("task_emergency_pickup"), status: "EN_ROUTE_TO_PICKUP", originLabel: "Overhaul Demo Hotel lobby (Synthetic)", originLat: 24.6907, originLng: 46.6851, destinationLabel: "Overhaul Demo Convention Hall (Synthetic)", destinationLat: 24.7642, destinationLng: 46.6406, inZone: true, captainEtaMinutes: 7, destinationEtaMinutes: 18, etaSource: "APPROXIMATE", etaUpdatedAt: sentAt(21), scheduledAt: sentAt(20), startedAt: sentAt(20) },
    { id: ns("trip_active_shuttle"), eventId: ev.active, vehicleId: ns("veh_active_2"), driverId: p.drivers.driverTwo, status: "SCHEDULED", originLabel: "Overhaul Demo Hotel (Synthetic)", destinationLabel: "Overhaul Demo Convention Hall (Synthetic)", etaSource: "UNAVAILABLE", scheduledAt: at("2026-10-19T11:00:00.000Z") },
    { id: ns("trip_active_done"), eventId: ev.active, vehicleId: ns("veh_active_2"), driverId: p.drivers.driverTwo, status: "COMPLETED", originLabel: "King Khalid Intl. Airport (synthetic stop)", destinationLabel: "Overhaul Demo Hotel (Synthetic)", etaSource: "UNAVAILABLE", scheduledAt: at("2026-10-18T05:00:00.000Z"), startedAt: at("2026-10-18T05:05:00.000Z"), completedAt: at("2026-10-18T05:50:00.000Z") }
  );
  f.tripPassengers.push(
    { id: ns("tp_vip_gv01"), tripId: ns("trip_active_vip"), eventGuestId: ns("eg_active_gv01") },
    { id: ns("tp_shuttle_g01"), tripId: ns("trip_active_shuttle"), eventGuestId: ns("eg_active_g01") },
    { id: ns("tp_shuttle_g04"), tripId: ns("trip_active_shuttle"), eventGuestId: ns("eg_active_g04") },
    { id: ns("tp_done_gv02"), tripId: ns("trip_active_done"), eventGuestId: ns("eg_active_gv02") }
  );

  f.flights.push(
    { id: ns("flt_active_arrival"), scope: "EVENT", eventId: ev.active, flightNumber: "OV2101", airline: "Overhaul Demo Air (synthetic)", originCode: "JED", destinationCode: "RUH", scheduledAt: at("2026-10-19T09:10:00.000Z"), estimatedAt: at("2026-10-19T09:25:00.000Z"), status: "DELAYED", dataSource: "MANUAL" },
    { id: ns("flt_active_departure"), scope: "EVENT", eventId: ev.active, flightNumber: "OV2102", airline: "Overhaul Demo Air (synthetic)", originCode: "RUH", destinationCode: "JED", scheduledAt: at("2026-10-23T12:00:00.000Z"), status: "SCHEDULED", dataSource: "MANUAL" },
    { id: ns("flt_general_1"), scope: "GENERAL", flightNumber: "OV2900", airline: "Overhaul Demo Air (synthetic)", originCode: "DXB", destinationCode: "RUH", scheduledAt: at("2026-10-19T10:00:00.000Z"), status: "SCHEDULED", dataSource: "MANUAL" }
  );

  f.captainShifts.push(
    { id: ns("shift_active_driver"), eventId: ev.active, driverId: p.drivers.driver, startsAt: at("2026-10-19T05:00:00.000Z"), endsAt: at("2026-10-19T15:00:00.000Z"), status: "ON_SHIFT", available: false, zoneLabel: "Olaya (synthetic)" },
    { id: ns("shift_active_driver_two"), eventId: ev.active, driverId: p.drivers.driverTwo, startsAt: at("2026-10-19T08:00:00.000Z"), endsAt: at("2026-10-19T18:00:00.000Z"), status: "ON_SHIFT", available: true, zoneLabel: "Airport corridor (synthetic)" }
  );

  f.densitySamples.push(
    { id: ns("den_active_hall"), eventId: ev.active, zoneKey: "venue-main-hall", capturedAt: at("2026-10-19T08:00:00.000Z"), headcount: 180, capacity: 400, source: "MANUAL" },
    { id: ns("den_active_lobby"), eventId: ev.active, zoneKey: "hotel-lobby", capturedAt: at("2026-10-19T08:00:00.000Z"), headcount: 42, capacity: 120, source: "MANUAL" },
    { id: ns("den_active_lounge"), eventId: ev.active, zoneKey: "vip-lounge", capturedAt: at("2026-10-19T08:00:00.000Z"), headcount: 3, capacity: 20, source: "MANUAL" }
  );

  // Clearly synthetic executive-review examples, never real legal evidence.
  for(const kind of ['VENDOR','CLIENT'] as const){
    const id=ns(`onboarding_${kind.toLowerCase()}`),applicantUserId=kind==='VENDOR'?p.supplier:p.company;
    f.onboardingApplications.push({id,kind,status:kind==='VENDOR'?'UNDER_REVIEW':'APPROVED',applicantUserId,companyName:`Synthetic ${kind} application — demonstration only`,registrationNumber:'SYNTHETIC-NOT-LEGAL',vendorCategory:kind==='VENDOR'?'HOTEL':null,contactName:'Synthetic authorized person',contactEmail:'synthetic@example.test',contactPhone:'+966500000000',city:'Riyadh',notes:'Synthetic fixture. Not a real application or legal approval.',reviewerUserId:p.admin,submittedAt:at('2026-10-18T08:00:00Z'),reviewStartedAt:at('2026-10-19T08:00:00Z')});
    f.onboardingTransitions.push({id:ns(`onboard_${kind}_submitted`),applicationId:id,fromStatus:null,toStatus:'SUBMITTED',actorUserId:applicantUserId,note:'Synthetic demonstration request',createdAt:at('2026-10-18T08:00:00Z')},{id:ns(`onboard_${kind}_review`),applicationId:id,fromStatus:'SUBMITTED',toStatus:'UNDER_REVIEW',actorUserId:p.admin,note:'Synthetic review stage',createdAt:at('2026-10-19T08:00:00Z')});
    if(kind==='CLIENT')f.onboardingTransitions.push({id:ns('onboard_CLIENT_approved'),applicationId:id,fromStatus:'UNDER_REVIEW',toStatus:'APPROVED',actorUserId:p.admin,note:'Synthetic demonstration status; not a legal approval',createdAt:at('2026-10-19T09:00:00Z')});
    const bytes=Buffer.from('%PDF-1.4\nSYNTHETIC SAMPLE. NOT A REAL ID, LICENSE OR LEGAL DOCUMENT.');
    for(const doc of ['COMMERCIAL_REGISTRATION','IDENTITY','LICENSE',...(kind==='VENDOR'?['ACTIVITY_DOCUMENT'] as const:[])] as const)f.onboardingDocuments.push({id:ns(`onboard_${kind}_${doc}`),applicationId:id,kind:doc,fileName:'synthetic-sample.pdf',mimeType:'application/pdf',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),content:bytes,uploadedById:applicantUserId});
  }
  return f;
}

const FIXTURE_TABLES: readonly FixtureTable[] = [
  "onboardingApplications","onboardingDocuments","onboardingTransitions",
  "organizations",
  "organizationMemberships",
  "events",
  "eventPlans",
  "eventMemberships",
  "guests",
  "eventGuests",
  "guestPrivacyGrants",
  "vehicles",
  "conversations",
  "conversationParticipants",
  "conversationMessages",
  "tasks",
  "dispatchRecords",
  "trips",
  "tripPassengers",
  "flights",
  "captainShifts",
  "densitySamples"
];

/** Fixture ids per table (all in the ovh2 namespace). */
export function fixtureIds(fixture: OverhaulFixture): Record<FixtureTable, string[]> {
  const out = {} as Record<FixtureTable, string[]>;
  for (const table of FIXTURE_TABLES) {
    const rows: ReadonlyArray<{ id?: string }> = fixture[table];
    out[table] = rows.map((row) => {
      if (!row.id || !row.id.startsWith(`${OVERHAUL_NAMESPACE}_`)) throw new Error("fixture id outside namespace");
      return row.id;
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

export type FixtureDb = Prisma.TransactionClient;
export type SchemaTables = (db: FixtureDb) => Promise<Set<string>>;

export const readSchemaTables: SchemaTables = async (db) => {
  const rows = await db.$queryRaw<Array<{ name: string }>>`
    SELECT table_name::text AS name
      FROM information_schema.tables
     WHERE table_schema::text = ${DEMO_SCHEMA}
       AND table_type = 'BASE TABLE'`;
  return new Set(rows.map((row) => row.name));
};

export type OverhaulState = {
  accountCount: number;
  accountFingerprint: string;
  personas: PersonaIds;
  fixture: OverhaulFixture;
  status: "absent" | "complete";
  present: Record<FixtureTable, number>;
};

async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OverhaulDemoError || error instanceof DemoProvisioningError) throw error;
    throw new OverhaulDemoError("database-error");
  }
}

async function countPresent(db: FixtureDb, ids: Record<FixtureTable, string[]>): Promise<Record<FixtureTable, number>> {
  const select = { id: true } as const;
  const where = (table: FixtureTable) => ({ id: { in: ids[table] } });
  const rows: Record<FixtureTable, Array<{ id: string }>> = {
    onboardingApplications: await db.onboardingApplication.findMany({where:where('onboardingApplications'),select}),
    onboardingDocuments: await db.onboardingDocument.findMany({where:where('onboardingDocuments'),select}),
    onboardingTransitions: await db.onboardingTransition.findMany({where:where('onboardingTransitions'),select}),
    organizations: await db.organization.findMany({ where: where("organizations"), select }),
    organizationMemberships: await db.organizationMembership.findMany({ where: where("organizationMemberships"), select }),
    events: await db.event.findMany({ where: where("events"), select }),
    eventPlans: await db.eventPlan.findMany({ where: where("eventPlans"), select }),
    eventMemberships: await db.eventMembership.findMany({ where: where("eventMemberships"), select }),
    guests: await db.guest.findMany({ where: where("guests"), select }),
    eventGuests: await db.eventGuest.findMany({ where: where("eventGuests"), select }),
    guestPrivacyGrants: await db.guestPrivacyGrant.findMany({ where: where("guestPrivacyGrants"), select }),
    vehicles: await db.vehicle.findMany({ where: where("vehicles"), select }),
    conversations: await db.conversation.findMany({ where: where("conversations"), select }),
    conversationParticipants: await db.conversationParticipant.findMany({ where: where("conversationParticipants"), select }),
    conversationMessages: await db.conversationMessage.findMany({ where: where("conversationMessages"), select }),
    tasks: await db.task.findMany({ where: where("tasks"), select }),
    dispatchRecords: await db.dispatchRecord.findMany({ where: where("dispatchRecords"), select }),
    trips: await db.trip.findMany({ where: where("trips"), select }),
    tripPassengers: await db.tripPassenger.findMany({ where: where("tripPassengers"), select }),
    flights: await db.flight.findMany({ where: where("flights"), select }),
    captainShifts: await db.captainShift.findMany({ where: where("captainShifts"), select }),
    densitySamples: await db.densitySample.findMany({ where: where("densitySamples"), select })
  };
  return Object.fromEntries(FIXTURE_TABLES.map((table) => [table, rows[table].length])) as Record<FixtureTable, number>;
}

/**
 * Read-only preflight shared by dry run, apply (inside the transaction) and
 * verify. Throws a fixed reason on any mismatch.
 */
export async function inspectOverhaul(
  db: FixtureDb,
  tables: Set<string>,
  options: { accountBaseline?: AccountBaseline; requireBaseline: boolean }
): Promise<OverhaulState> {
  if (APPLICATION_MODELS.some((model) => !tables.has(model))) throw new OverhaulDemoError("schema-incomplete");
  if (options.requireBaseline && !options.accountBaseline) throw new OverhaulDemoError("baseline-required");

  return guarded(async () => {
    const users = await db.user.findMany({
      select: { id: true, email: true, role: true, passwordHash: true },
      orderBy: { id: "asc" }
    });
    if (options.accountBaseline && !matchesAccountBaseline(users, options.accountBaseline)) {
      throw new OverhaulDemoError("account-baseline-mismatch");
    }
    const byEmail = new Map(users.map((user) => [user.email, user]));
    const personaIds = {} as Record<OverhaulPersona, string>;
    for (const key of OVERHAUL_PERSONAS) {
      const account = DEMO_ACCOUNTS.find((entry) => entry.key === key)!;
      const user = byEmail.get(account.email);
      if (!user || user.role !== account.role) throw new OverhaulDemoError("persona-missing");
      personaIds[key] = user.id;
    }
    const drivers = await db.driver.findMany({
      where: { userId: { in: [personaIds.driver, personaIds.driverTwo] } },
      select: { id: true, userId: true }
    });
    const driverOf = (userId: string) => drivers.find((driver) => driver.userId === userId)?.id;
    const driverOne = driverOf(personaIds.driver);
    const driverTwo = driverOf(personaIds.driverTwo);
    if (!driverOne || !driverTwo) throw new OverhaulDemoError("persona-missing");
    const personas: PersonaIds = { ...personaIds, drivers: { driver: driverOne, driverTwo } };

    const fixture = buildOverhaulFixture(personas);
    const ids = fixtureIds(fixture);
    const present = await countPresent(db, ids);
    const expected = FIXTURE_TABLES.reduce((sum, table) => sum + ids[table].length, 0);
    const found = FIXTURE_TABLES.reduce((sum, table) => sum + present[table], 0);

    // Slugs and the per-event guest uniqueness are the only keys an
    // unrelated row could already hold.
    const slugOwners = await db.organization.findMany({
      where: { slug: { in: fixture.organizations.map((org) => org.slug) } },
      select: { id: true, slug: true }
    });
    if (slugOwners.some((org) => !ids.organizations.includes(org.id))) throw new OverhaulDemoError("fixture-conflict");

    if (found === 0) {
      return { accountCount: users.length, accountFingerprint: accountBaselineFingerprint(users), personas, fixture, status: "absent", present };
    }
    if (found !== expected) throw new OverhaulDemoError("fixture-partial");

    // Complete: the stored key fields must equal the plan.
    const storedEvents = await db.event.findMany({
      where: { id: { in: ids.events } },
      select: { id: true, name: true, organizationId: true, organizerId: true, operationalStatus: true, approvedPlanId: true }
    });
    for (const planned of fixture.events) {
      const stored = storedEvents.find((event) => event.id === planned.id);
      const approval = fixture.approvedPlans.find((entry) => entry.eventId === planned.id);
      if (
        !stored ||
        stored.name !== planned.name ||
        stored.organizationId !== planned.organizationId ||
        stored.organizerId !== planned.organizerId ||
        stored.operationalStatus !== planned.operationalStatus ||
        stored.approvedPlanId !== (approval?.planId ?? null)
      ) {
        throw new OverhaulDemoError("fixture-conflict");
      }
    }
    const storedMembers = await db.eventMembership.findMany({
      where: { id: { in: ids.eventMemberships } },
      select: { id: true, userId: true, eventId: true, role: true }
    });
    for (const planned of fixture.eventMemberships) {
      const stored = storedMembers.find((row) => row.id === planned.id);
      if (!stored || stored.userId !== planned.userId || stored.eventId !== planned.eventId || stored.role !== planned.role) {
        throw new OverhaulDemoError("fixture-conflict");
      }
    }
    return { accountCount: users.length, accountFingerprint: accountBaselineFingerprint(users), personas, fixture, status: "complete", present };
  });
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/** Inserts the whole plan in dependency order (inside the caller's transaction). */
export async function writeOverhaulFixture(tx: FixtureDb, fixture: OverhaulFixture) {
  await tx.onboardingApplication.createMany({data:fixture.onboardingApplications});
  await tx.onboardingDocument.createMany({data:fixture.onboardingDocuments});
  await tx.onboardingTransition.createMany({data:fixture.onboardingTransitions});
  await tx.organization.createMany({ data: fixture.organizations });
  await tx.organizationMembership.createMany({ data: fixture.organizationMemberships });
  await tx.event.createMany({ data: fixture.events });
  await tx.eventPlan.createMany({ data: fixture.eventPlans });
  for (const approval of fixture.approvedPlans) {
    await tx.event.update({
      where: { id: approval.eventId },
      data: { approvedPlanId: approval.planId, planApprovedAt: approval.approvedAt }
    });
  }
  await tx.eventMembership.createMany({ data: fixture.eventMemberships });
  await tx.guest.createMany({ data: fixture.guests });
  await tx.eventGuest.createMany({ data: fixture.eventGuests });
  await tx.guestPrivacyGrant.createMany({ data: fixture.guestPrivacyGrants });
  await tx.vehicle.createMany({ data: fixture.vehicles });
  await tx.conversation.createMany({ data: fixture.conversations });
  await tx.conversationParticipant.createMany({ data: fixture.conversationParticipants });
  await tx.conversationMessage.createMany({ data: fixture.conversationMessages });
  await tx.task.createMany({ data: fixture.tasks });
  await tx.dispatchRecord.createMany({ data: fixture.dispatchRecords });
  await tx.trip.createMany({ data: fixture.trips });
  await tx.tripPassenger.createMany({ data: fixture.tripPassengers });
  await tx.flight.createMany({ data: fixture.flights });
  await tx.captainShift.createMany({ data: fixture.captainShifts });
  await tx.densitySample.createMany({ data: fixture.densitySamples });
  await tx.auditLog.create({
    data: {
      actorUserId: null,
      actorRole: null,
      action: "fixture.full_overhaul.apply",
      entityType: "FIXTURE",
      entityId: OVERHAUL_NAMESPACE,
      metadata: {
        source: "FULL-OVERHAUL-M2 synthetic fixture",
        rows: FIXTURE_TABLES.reduce((sum, table) => sum + fixture[table].length, 0)
      }
    }
  });
}

/** Serializes concurrent applies (transaction-scoped advisory lock). */
async function lockNamespace(tx: FixtureDb) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${OVERHAUL_NAMESPACE}))) AS l`;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export type OverhaulDeps = {
  root: string;
  readFile?: (file: string) => string;
  createClient: (url: string) => Promise<PrismaClient>;
  schemaTables?: SchemaTables;
  log: (line: string) => void;
};

export type OverhaulOutcome = {
  mode: OverhaulMode;
  status: "absent" | "complete" | "applied";
  written: boolean;
  checks?: { passed: number; failed: number };
};

function logIds(log: (line: string) => void, fixture: OverhaulFixture) {
  const ids = fixtureIds(fixture);
  for (const table of FIXTURE_TABLES) log(`ids ${table}: ${ids[table].join(",")}`);
}

export async function runOverhaulDemo(argv: string[], deps: OverhaulDeps): Promise<OverhaulOutcome> {
  const options = parseOverhaulArgs(argv);
  const target = resolveOverhaulTarget(deps.root, options, deps.readFile);
  const log = deps.log;
  log(`target: host=${target.host} database=${target.database} schema=${target.schema}`);
  log(`mode: ${options.mode === "apply" ? "APPLY" : options.mode === "verify" ? "VERIFY (read-only)" : "DRY RUN (no writes)"}`);

  const db = await guarded(() => deps.createClient(target.url));
  try {
    const tables = await guarded(() => (deps.schemaTables ?? readSchemaTables)(db));
    const state = await inspectOverhaul(db, tables, {
      accountBaseline: options.accountBaseline,
      requireBaseline: options.mode === "apply"
    });
    log(`preflight: accounts=${state.accountCount} fingerprint=${state.accountFingerprint}`);
    log(`preflight: namespace ${OVERHAUL_NAMESPACE} is ${state.status}`);

    if (options.mode === "verify") {
      const checks = [
        { name: "schema: every application table present", ok: true },
        { name: `accounts: ${state.accountCount} retained${options.accountBaseline ? " (pinned baseline)" : ""}`, ok: true },
        { name: "fixture: complete and matching", ok: state.status === "complete" }
      ];
      for (const check of checks) log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
      const passed = checks.filter((check) => check.ok).length;
      return { mode: "verify", status: state.status, written: false, checks: { passed, failed: checks.length - passed } };
    }

    if (options.mode === "dry-run") {
      const planned = FIXTURE_TABLES.map((table) => `${table}=${state.fixture[table].length}`).join(", ");
      log(`plan: ${state.status === "absent" ? planned : "nothing to write (already applied)"}`);
      logIds(log, state.fixture);
      log("status: dry run complete; nothing was written");
      return { mode: "dry-run", status: state.status, written: false };
    }

    if (state.status === "complete") {
      log("status: already applied; nothing was written");
      logIds(log, state.fixture);
      return { mode: "apply", status: "complete", written: false };
    }

    try {
      await db.$transaction(async (tx) => {
        await lockNamespace(tx);
        const fresh = await inspectOverhaul(tx, tables, {
          accountBaseline: options.accountBaseline,
          requireBaseline: true
        });
        if (fresh.status !== "absent") throw new OverhaulDemoError("fixture-partial");
        await writeOverhaulFixture(tx, fresh.fixture);
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof OverhaulDemoError || error instanceof DemoProvisioningError) throw error;
      throw new OverhaulDemoError("transaction-failed");
    }
    log("status: applied");
    logIds(log, state.fixture);
    return { mode: "apply", status: "applied", written: true };
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}
