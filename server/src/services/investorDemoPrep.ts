import type { Prisma } from "@prisma/client";
import { DEMO_ACCOUNTS } from "../utils/demoProvisioning.js";
import { OVERHAUL_IDS } from "../utils/overhaulDemo.js";
import { HttpError } from "../utils/http.js";

/**
 * SIX-TASKS #6 investor-demo readiness, idempotent. The certified ovh2 fixture
 * gives the client persona the completed and active events only, so its
 * "Plans awaiting approval" queue is empty: the only draft plan belongs to the
 * planning event. This adds exactly what the pitch needs, outside the ovh2
 * namespace (the fixture's own verification stays untouched):
 *  - client persona: CLIENT_VIEWER (VIEW) on the planning event;
 *  - company persona: ADMIN of the demo organizing company (as granted live
 *    for ORG-MEMBERS), so it can create and edit events during the pitch.
 * No account, password, plan or financial record is created or changed.
 */
export type DemoPrepChange = "client-planning-membership" | "company-org-admin";

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
