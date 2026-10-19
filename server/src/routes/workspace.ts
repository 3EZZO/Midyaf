import { Router } from "express";
import type { Request } from "express";
import { MembershipStatus, OrganizationRole, Prisma, Role } from "@prisma/client";
import {
  organizationCreateSchema,
  organizationMemberCreateSchema,
  organizationMemberUpdateSchema,
  type OrganizationDto,
  type OrganizationMemberDto
} from "../../../shared/overhaul.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest, AuthenticatedUser } from "../types/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import {
  WORKSPACE_TRANSACTION,
  isOrgAdminRole,
  organizationRoleOf,
  parseRouteId,
  toWorkspaceHttpError,
  writeWorkspaceAudit
} from "../utils/workspacePolicy.js";
import onboardingRouter from "./onboarding.js";
import workspaceEventsRouter from "./workspaceEvents.js";
import workspaceGuestsRouter from "./workspaceGuests.js";
import workspaceDispatchRouter from "./workspaceDispatch.js";
import workspaceTelemetryRouter from "./workspaceTelemetry.js";

/**
 * FULL-OVERHAUL-M2 workspace API, mounted at /api/workspace and /workspace.
 * Every route requires a verified token. This file owns organizations and
 * their memberships and composes the onboarding, event, guest, dispatch and
 * telemetry routers. See utils/workspacePolicy.ts for the access model.
 *
 * Organizations: SUPER_ADMIN provisions organizer companies (vendor/client
 * organizations come from onboarding activation). OWNER/ADMIN manage
 * members; an ADMIN cannot grant or change OWNER, nobody changes their own
 * membership, and the last active OWNER cannot be removed or demoted.
 */

const router = Router();
router.use(requireAuth);

function organizationNotFound() {
  return new HttpError(404, "Organization not found");
}

const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  slug: true,
  kind: true,
  vendorCategory: true
} satisfies Prisma.OrganizationSelect;

type OrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof ORGANIZATION_SELECT }>;

function toOrganizationDto(row: OrganizationRow, myRole: OrganizationRole | null): OrganizationDto {
  return { ...row, myRole };
}

const MEMBER_SELECT = {
  id: true,
  role: true,
  status: true,
  user: { select: { id: true, name: true } }
} satisfies Prisma.OrganizationMembershipSelect;

function toMemberDto(row: Prisma.OrganizationMembershipGetPayload<{ select: typeof MEMBER_SELECT }>): OrganizationMemberDto {
  return { id: row.id, user: row.user, role: row.role, status: row.status };
}

type OrganizationAccess = { organization: OrganizationRow; role: OrganizationRole | null; support: boolean };

/**
 * Members of an organization and SUPER_ADMIN (audited support access) may
 * read it; everyone else gets the same 404 as a missing organization.
 */
async function loadOrganization(req: Request, user: AuthenticatedUser, idRaw: unknown): Promise<OrganizationAccess> {
  const id = parseRouteId(idRaw, organizationNotFound);
  const organization = await prisma.organization.findUnique({ where: { id }, select: ORGANIZATION_SELECT });
  if (!organization) throw organizationNotFound();
  const role = await organizationRoleOf(user.id, id);
  if (role) return { organization, role, support: false };
  if (user.role !== Role.SUPER_ADMIN) throw organizationNotFound();
  await writeWorkspaceAudit(prisma, req, {
    action: "workspace.support_access",
    entityType: "ORGANIZATION",
    entityId: id
  });
  return { organization, role: null, support: true };
}

function requireOrganizationManager(access: OrganizationAccess) {
  if (!access.support && !isOrgAdminRole(access.role)) {
    throw new HttpError(403, "Only organization owners and admins can manage members");
  }
}

router.get(
  "/organizations",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      select: { role: true, organization: { select: ORGANIZATION_SELECT } },
      take: 200
    });
    const mine = new Map(memberships.map((membership) => [membership.organization.id, membership]));

    if (user.role === Role.SUPER_ADMIN) {
      const all = await prisma.organization.findMany({
        select: ORGANIZATION_SELECT,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 500
      });
      await writeWorkspaceAudit(prisma, req, {
        action: "workspace.support_access",
        entityType: "ORGANIZATION",
        entityId: "*",
        metadata: { listed: all.length }
      });
      res.json({
        organizations: all.map((row) => toOrganizationDto(row, mine.get(row.id)?.role ?? null))
      });
      return;
    }

    res.json({
      organizations: memberships
        .map((membership) => toOrganizationDto(membership.organization, membership.role))
        .sort((a, b) => a.name.localeCompare(b.name))
    });
  })
);

router.post(
  "/organizations",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    if (user.role !== Role.SUPER_ADMIN) {
      throw new HttpError(403, "Only platform administrators can create organizations");
    }
    const body = organizationCreateSchema.parse(req.body);
    if (body.ownerUserId === user.id) {
      throw new HttpError(403, "You cannot make yourself the owner of a new organization");
    }
    const owner = await prisma.user.findUnique({ where: { id: body.ownerUserId }, select: { id: true } });
    if (!owner) throw new HttpError(400, "The owner must be an existing user");

    const organization = await prisma
      .$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: {
            name: body.name,
            slug: body.slug,
            kind: body.kind,
            vendorCategory: body.vendorCategory ?? null,
            createdById: user.id,
            memberships: {
              create: {
                userId: owner.id,
                role: OrganizationRole.OWNER,
                status: MembershipStatus.ACTIVE,
                grantedById: user.id
              }
            }
          },
          select: ORGANIZATION_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "organization.create",
          entityType: "ORGANIZATION",
          entityId: created.id,
          after: { kind: created.kind, slug: created.slug, ownerUserId: owner.id }
        });
        return created;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error, "An organization with this slug already exists");
      });

    res.status(201).json({ organization: toOrganizationDto(organization, null) });
  })
);

router.get(
  "/organizations/:organizationId/members",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadOrganization(req, req.user!, req.params.organizationId);
    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: access.organization.id },
      select: MEMBER_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500
    });
    res.json({
      organization: toOrganizationDto(access.organization, access.role),
      members: members.map(toMemberDto)
    });
  })
);

router.post(
  "/organizations/:organizationId/members",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const access = await loadOrganization(req, user, req.params.organizationId);
    requireOrganizationManager(access);
    const body = organizationMemberCreateSchema.parse(req.body);
    if (body.userId === user.id) throw new HttpError(403, "You cannot change your own membership");
    if (body.role === OrganizationRole.OWNER && access.role !== OrganizationRole.OWNER && !access.support) {
      throw new HttpError(403, "Only an owner can grant ownership");
    }
    const target = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
    if (!target) throw new HttpError(400, "The member must be an existing user");

    const member = await prisma
      .$transaction(async (tx) => {
        const created = await tx.organizationMembership.create({
          data: {
            organizationId: access.organization.id,
            userId: target.id,
            role: body.role,
            status: MembershipStatus.ACTIVE,
            grantedById: user.id
          },
          select: MEMBER_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "organization.member.add",
          entityType: "ORGANIZATION_MEMBERSHIP",
          entityId: created.id,
          after: { organizationId: access.organization.id, userId: target.id, role: body.role },
          metadata: { support: access.support }
        });
        return created;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error, "This user is already a member; update the membership instead");
      });

    res.status(201).json({ member: toMemberDto(member) });
  })
);

router.patch(
  "/organizations/:organizationId/members/:membershipId",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const access = await loadOrganization(req, user, req.params.organizationId);
    requireOrganizationManager(access);
    const membershipId = parseRouteId(req.params.membershipId, () => new HttpError(404, "Membership not found"));
    const body = organizationMemberUpdateSchema.parse(req.body);

    const member = await prisma
      .$transaction(async (tx) => {
        const current = await tx.organizationMembership.findFirst({
          where: { id: membershipId, organizationId: access.organization.id },
          select: { id: true, userId: true, role: true, status: true }
        });
        if (!current) throw new HttpError(404, "Membership not found");
        if (current.userId === user.id) throw new HttpError(403, "You cannot change your own membership");
        const ownerInvolved = current.role === OrganizationRole.OWNER || body.role === OrganizationRole.OWNER;
        if (ownerInvolved && access.role !== OrganizationRole.OWNER && !access.support) {
          throw new HttpError(403, "Only an owner can change ownership");
        }

        const nextRole = body.role ?? current.role;
        const nextStatus = body.status ?? current.status;
        const losesOwner =
          current.role === OrganizationRole.OWNER &&
          current.status === MembershipStatus.ACTIVE &&
          (nextRole !== OrganizationRole.OWNER || nextStatus !== MembershipStatus.ACTIVE);
        if (losesOwner) {
          const owners = await tx.organizationMembership.count({
            where: {
              organizationId: access.organization.id,
              role: OrganizationRole.OWNER,
              status: MembershipStatus.ACTIVE
            }
          });
          if (owners <= 1) throw new HttpError(409, "An organization needs at least one active owner");
        }

        const changed = await tx.organizationMembership.updateMany({
          where: { id: current.id, role: current.role, status: current.status },
          data: { role: nextRole, status: nextStatus, grantedById: user.id }
        });
        if (changed.count !== 1) throw new HttpError(409, "The membership changed; refresh and try again");

        await writeWorkspaceAudit(tx, req, {
          action: "organization.member.update",
          entityType: "ORGANIZATION_MEMBERSHIP",
          entityId: current.id,
          before: { role: current.role, status: current.status },
          after: { role: nextRole, status: nextStatus },
          metadata: { organizationId: access.organization.id, support: access.support }
        });
        return tx.organizationMembership.findUniqueOrThrow({ where: { id: current.id }, select: MEMBER_SELECT });
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ member: toMemberDto(member) });
  })
);

router.use(onboardingRouter);
router.use(workspaceEventsRouter);
router.use(workspaceGuestsRouter);
router.use(workspaceDispatchRouter);
router.use(workspaceTelemetryRouter);

export default router;
