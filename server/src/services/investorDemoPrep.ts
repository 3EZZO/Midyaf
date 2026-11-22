import type { Prisma } from "@prisma/client";
import { DEMO_ACCOUNTS } from "../utils/demoProvisioning.js";
import { OVERHAUL_IDS, overhaulEventScope } from "../utils/overhaulDemo.js";
import { HttpError } from "../utils/http.js";
import { buildAdvisoryPlan, WORKSPACE_EVENT_SELECT } from "../utils/workspacePolicy.js";
import { contentWithRfq, rfqForPlan } from "../utils/workspacePlanRfq.js";

/**
 * SIX-TASKS #6 investor-demo readiness, idempotent. The certified ovh2 fixture
 * gives the client persona the completed and active events only, so its
 * "Plans awaiting approval" queue is empty: the only draft plan belongs to the
 * planning event. This adds exactly what the pitch needs, outside the ovh2
 * namespace (the fixture's own verification stays untouched):
 *  - client persona: CLIENT_VIEWER (VIEW) on the planning event;
 *  - company persona: ADMIN of the demo organizing company (as granted live
 *    for ORG-MEMBERS), so it can create and edit events during the pitch;
 *  - the planning event back in PLANNING with its certified scope, only if
 *    it was moved on (see reopenPlanningEvent);
 *  - a DRAFT plan on the planning event for the client to approve, only if
 *    none exists (see ensurePlanningDraft).
 * No account, password or financial record is created or changed.
 */
export type DemoPrepChange =
  | "client-planning-membership"
  | "company-org-admin"
  | "planning-event-reopened"
  | "planning-draft-plan";

const emailOf = (key: string) => DEMO_ACCOUNTS.find((account) => account.key === key)!.email;

export async function prepareInvestorDemo(tx: Prisma.TransactionClient, actorId: string): Promise<DemoPrepChange[]> {
  const [client, company, eventLead] = await Promise.all(
    ["client", "company", "eventLead"].map((key) => tx.user.findUnique({ where: { email: emailOf(key) }, select: { id: true } }))
  );
  const planning = await tx.event.findUnique({ where: { id: OVERHAUL_IDS.events.planning }, select: { id: true } });
  const org = await tx.organization.findUnique({ where: { id: OVERHAUL_IDS.organizerOrg }, select: { id: true } });
  if (!client || !company || !planning || !org) {
    throw new HttpError(409, "The demo fixture is not present in this database");
  }
  const changes: DemoPrepChange[] = [];

  const membership = await tx.eventMembership.findUnique({
    where: { eventId_userId: { eventId: planning.id, userId: client.id } },
    select: { id: true, role: true, status: true }
  });
  if (!membership) {
    await tx.eventMembership.create({
      data: {
        id: "demo_em_planning_client",
        eventId: planning.id,
        userId: client.id,
        role: "CLIENT_VIEWER",
        permissions: ["VIEW"],
        status: "ACTIVE",
        grantedById: eventLead?.id ?? actorId
      }
    });
    changes.push("client-planning-membership");
  } else if (membership.role !== "CLIENT_VIEWER" || membership.status !== "ACTIVE") {
    throw new HttpError(409, "The client persona already has another role on the planning event");
  }

  if (await reopenPlanningEvent(tx, actorId)) changes.push("planning-event-reopened");
  if (await ensurePlanningDraft(tx, company.id)) changes.push("planning-draft-plan");

  const orgRole = await tx.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: company.id } },
    select: { role: true, status: true }
  });
  if (!orgRole) {
    await tx.organizationMembership.create({
      data: { id: "demo_om_company_admin", organizationId: org.id, userId: company.id, role: "ADMIN", status: "ACTIVE", grantedById: actorId }
    });
    changes.push("company-org-admin");
  }
  return changes;
}

/**
 * The pitch starts from the planning stage. On the live demo database the
 * planning event had been walked through its whole lifecycle on 2026-11-10
 * (scope changed, plan approved, ACTIVE, dates moved, COMPLETED), which blocks
 * approval, editing and the RFQ. When it is no longer PLANNING, restore the
 * certified scope and status, and supersede its approved plan so operations
 * are locked again until the client approves the new draft. Plans, guests and
 * history are kept; the before and after values are audited.
 */
async function reopenPlanningEvent(tx: Prisma.TransactionClient, actorId: string): Promise<boolean> {
  const planningId = OVERHAUL_IDS.events.planning;
  const event = await tx.event.findUnique({
    where: { id: planningId },
    select: {
      operationalStatus: true, vipGuestCount: true, regularGuestCount: true, carCount: true, startAt: true, endAt: true,
      arrivalStartAt: true, departureEndAt: true, approvedPlanId: true, planApprovedAt: true, contractSignedAt: true
    }
  });
  if (!event) throw new HttpError(409, "The demo fixture is not present in this database");
  if (event.operationalStatus === "PLANNING") return false;
  if (event.contractSignedAt) throw new HttpError(409, "The demo planning event has a signed contract; restore the demo fixture instead");
  const scope = overhaulEventScope("planning");
  const superseded = await tx.eventPlan.updateMany({ where: { eventId: planningId, status: "APPROVED" }, data: { status: "SUPERSEDED" } });
  await tx.event.update({ where: { id: planningId }, data: { ...scope, approvedPlanId: null, planApprovedAt: null } });
  await tx.auditLog.create({
    data: {
      actorUserId: actorId,
      actorRole: "SUPER_ADMIN",
      action: "demo.prepare.reopen_event",
      entityType: "EVENT",
      entityId: planningId,
      eventId: planningId,
      beforeData: JSON.parse(JSON.stringify(event)),
      afterData: JSON.parse(JSON.stringify({ ...scope, approvedPlanId: null, planApprovedAt: null })),
      metadata: { supersededPlans: superseded.count }
    }
  });
  return true;
}

/**
 * The fixture's planning event starts with its advisory plan as a DRAFT, but
 * anyone who approved it (as happened on the live demo database on
 * 2026-11-10) leaves the client with nothing to approve. When the planning
 * event has no DRAFT, add the next version: a fresh rules-based advisory plan
 * built exactly like "Generate plan" does (same generator and RFQ derivation,
 * no AI provider call). The approved plan stays operational until the client
 * approves the new draft.
 */
async function ensurePlanningDraft(tx: Prisma.TransactionClient, generatedById: string): Promise<boolean> {
  const planningId = OVERHAUL_IDS.events.planning;
  const draft = await tx.eventPlan.findFirst({ where: { eventId: planningId, status: "DRAFT" }, select: { id: true } });
  if (draft) return false;
  const row = await tx.event.findUnique({ where: { id: planningId }, select: WORKSPACE_EVENT_SELECT });
  if (!row?.organizationId) throw new HttpError(409, "The demo planning event is not a workspace event");
  const event = { ...row, organizationId: row.organizationId };
  if (event.operationalStatus === "COMPLETED") {
    throw new HttpError(409, "The demo planning event is closed; restore the demo fixture first");
  }
  const latest = await tx.eventPlan.findFirst({ where: { eventId: planningId }, select: { version: true }, orderBy: { version: "desc" } });
  const advisory = buildAdvisoryPlan(event);
  const version = (latest?.version ?? 0) + 1;
  const plan = { id: `demo_plan_planning_v${version}`, version, source: "DETERMINISTIC_ADVISORY" as const, content: advisory.content };
  await tx.eventPlan.create({
    data: {
      id: plan.id,
      eventId: planningId,
      version,
      source: plan.source,
      status: "DRAFT",
      advisory: true,
      summary: advisory.summary.slice(0, 2000),
      content: contentWithRfq(advisory.content, rfqForPlan(event, plan, new Date())),
      generatedById
    }
  });
  return true;
}
