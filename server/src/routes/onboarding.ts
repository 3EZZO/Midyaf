import { createHash } from "node:crypto";
import { Router } from "express";
import {
  MembershipStatus,
  OnboardingDocumentKind,
  OnboardingKind,
  OnboardingStatus,
  OrganizationRole,
  Prisma,
  Role
} from "@prisma/client";
import { z } from "zod";
import {
  DOCUMENT_MIME_TYPES,
  ONBOARDING_KINDS,
  ONBOARDING_STATUSES,
  ONBOARDING_TRANSITIONS,
  WORKSPACE_LIMITS,
  canTransitionOnboarding,
  onboardingCreateSchema,
  onboardingDocumentSchema,
  onboardingTransitionSchema,
  type DocumentMimeType,
  type OnboardingApplicationDto
} from "../../../shared/overhaul.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest, AuthenticatedUser } from "../types/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import {
  WORKSPACE_TRANSACTION,
  lockRow,
  parseRouteId,
  toWorkspaceHttpError,
  writeWorkspaceAudit
} from "../utils/workspacePolicy.js";

/**
 * FULL-OVERHAUL-M2 vendor/client onboarding, mounted inside /workspace.
 *
 * - Applicants: a SUPPLIER account applies as VENDOR, a COMPANY_ORGANIZER or
 *   ORGANIZER account as CLIENT; one open application per account and kind.
 * - Review: SUPER_ADMIN only, never on its own application. The state
 *   machine is SUBMITTED -> UNDER_REVIEW -> APPROVED | REJECTED, then
 *   APPROVED -> CONTRACT_SIGNED (manual attestation with a stored
 *   SIGNED_CONTRACT document) -> ACTIVE, which creates the organization and
 *   the applicant's OWNER membership in the same transaction.
 * - Documents: PDF/PNG/JPEG up to 1 MiB, magic bytes checked, stored as
 *   private bytes in the database and served only to the applicant and
 *   reviewers with no-store/attachment headers. No public URL exists.
 *
 * Every transition compares and sets the current status, so a concurrent
 * reviewer cannot apply a stale transition.
 */

const router = Router();
router.use(requireAuth);

const APPLICANT_ROLES: Record<OnboardingKind, readonly Role[]> = {
  VENDOR: [Role.SUPPLIER],
  CLIENT: [Role.COMPANY_ORGANIZER, Role.ORGANIZER]
};

const CLOSED_STATUSES: readonly OnboardingStatus[] = [OnboardingStatus.REJECTED, OnboardingStatus.ACTIVE];
const DOCUMENT_UPLOAD_STATUSES: readonly OnboardingStatus[] = [OnboardingStatus.SUBMITTED, OnboardingStatus.UNDER_REVIEW];

const listQuerySchema = z
  .object({
    status: z.enum(ONBOARDING_STATUSES).optional(),
    kind: z.enum(ONBOARDING_KINDS).optional()
  })
  .strict();

const APPLICATION_SELECT = {
  id: true,
  kind: true,
  status: true,
  applicantUserId: true,
  companyName: true,
  registrationNumber: true,
  vendorCategory: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  city: true,
  notes: true,
  decisionNote: true,
  organizationId: true,
  submittedAt: true,
  contractSignedAt: true,
  activatedAt: true,
  applicant: { select: { id: true, name: true } },
  documents: {
    select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  },
  transitions: {
    select: { fromStatus: true, toStatus: true, createdAt: true, note: true, actor: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  }
} satisfies Prisma.OnboardingApplicationSelect;

type ApplicationRow = Prisma.OnboardingApplicationGetPayload<{ select: typeof APPLICATION_SELECT }>;

function iso(value: Date | null) {
  return value ? new Date(value).toISOString() : null;
}

function toApplicationDto(row: ApplicationRow, viewer: AuthenticatedUser): OnboardingApplicationDto {
  const reviewer = isReviewer(viewer) && row.applicantUserId !== viewer.id;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    companyName: row.companyName,
    registrationNumber: row.registrationNumber,
    vendorCategory: row.vendorCategory,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    city: row.city,
    notes: row.notes,
    decisionNote: row.decisionNote,
    organizationId: row.organizationId,
    applicant: row.applicant,
    submittedAt: new Date(row.submittedAt).toISOString(),
    contractSignedAt: iso(row.contractSignedAt),
    activatedAt: iso(row.activatedAt),
    allowedTransitions: reviewer ? [...ONBOARDING_TRANSITIONS[row.status]] : [],
    documents: row.documents.map((document) => ({
      id: document.id,
      kind: document.kind,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      sha256: document.sha256,
      createdAt: new Date(document.createdAt).toISOString()
    })),
    transitions: row.transitions.map((transition) => ({
      from: transition.fromStatus,
      to: transition.toStatus,
      at: new Date(transition.createdAt).toISOString(),
      actor: transition.actor,
      note: transition.note
    }))
  };
}

function isReviewer(user: AuthenticatedUser) {
  return user.role === Role.SUPER_ADMIN;
}

function applicationNotFound() {
  return new HttpError(404, "Application not found");
}

/** Applicant or reviewer; anyone else gets the same 404 as a missing id. */
async function loadVisibleApplication(user: AuthenticatedUser, idRaw: unknown) {
  const id = parseRouteId(idRaw, applicationNotFound);
  const row = await prisma.onboardingApplication.findUnique({ where: { id }, select: APPLICATION_SELECT });
  if (!row) throw applicationNotFound();
  if (row.applicantUserId !== user.id && !isReviewer(user)) throw applicationNotFound();
  return row;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const MAGIC: Record<DocumentMimeType, readonly number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff]
};

const EXTENSIONS: Record<DocumentMimeType, RegExp> = {
  "application/pdf": /\.pdf$/i,
  "image/png": /\.png$/i,
  "image/jpeg": /\.jpe?g$/i
};

/** Decodes and validates an upload; throws 400/413 on any mismatch. */
export function decodeDocument(input: { mimeType: DocumentMimeType; fileName: string; contentBase64: string }) {
  if (!DOCUMENT_MIME_TYPES.includes(input.mimeType) || !EXTENSIONS[input.mimeType].test(input.fileName)) {
    throw new HttpError(400, "The file name does not match the document type");
  }
  const content = Buffer.from(input.contentBase64, "base64");
  if (content.length === 0) throw new HttpError(400, "The document is empty");
  if (content.length > WORKSPACE_LIMITS.maxDocumentBytes) {
    throw new HttpError(413, "The document exceeds the 1 MiB limit");
  }
  const magic = MAGIC[input.mimeType];
  if (content.length < magic.length || magic.some((byte, index) => content[index] !== byte)) {
    throw new HttpError(400, "The document content does not match its type");
  }
  return { content, sha256: createHash("sha256").update(content).digest("hex") };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post(
  "/onboarding/applications",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const body = onboardingCreateSchema.parse(req.body);
    if (!APPLICANT_ROLES[body.kind].includes(user.role)) {
      throw new HttpError(403, "Your account cannot apply for this onboarding type");
    }

    const created = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "User", user.id);
        // One open application per account and kind, serialized by applicant.
        const open = await tx.onboardingApplication.findFirst({
          where: { applicantUserId: user.id, kind: body.kind, status: { notIn: [...CLOSED_STATUSES] } },
          select: { id: true }
        });
        if (open) throw new HttpError(409, "You already have an open application of this type");

        const application = await tx.onboardingApplication.create({
          data: {
            kind: body.kind,
            applicantUserId: user.id,
            companyName: body.companyName,
            registrationNumber: body.registrationNumber ?? null,
            vendorCategory: body.vendorCategory ?? null,
            contactName: body.contactName,
            contactEmail: body.contactEmail,
            contactPhone: body.contactPhone,
            city: body.city ?? null,
            notes: body.notes ?? null,
            transitions: {
              create: { fromStatus: null, toStatus: OnboardingStatus.SUBMITTED, actorUserId: user.id }
            }
          },
          select: { id: true }
        });
        await writeWorkspaceAudit(tx, req, {
          action: "onboarding.submit",
          entityType: "ONBOARDING_APPLICATION",
          entityId: application.id,
          metadata: { kind: body.kind }
        });
        return application;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    const row = await loadVisibleApplication(user, created.id);
    res.status(201).json({ application: toApplicationDto(row, user) });
  })
);

router.get(
  "/onboarding/applications",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const query = listQuerySchema.parse(req.query);
    const rows = await prisma.onboardingApplication.findMany({
      where: {
        ...(isReviewer(user) ? {} : { applicantUserId: user.id }),
        ...(query.status ? { status: query.status } : {}),
        ...(query.kind ? { kind: query.kind } : {})
      },
      select: APPLICATION_SELECT,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: 200
    });
    res.json({ applications: rows.map((row) => toApplicationDto(row, user)) });
  })
);

router.get(
  "/onboarding/applications/:applicationId",
  asyncHandler(async (req: AuthRequest, res) => {
    const row = await loadVisibleApplication(req.user!, req.params.applicationId);
    res.json({ application: toApplicationDto(row, req.user!) });
  })
);

router.post(
  "/onboarding/applications/:applicationId/transitions",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const current = await loadVisibleApplication(user, req.params.applicationId);
    if (!isReviewer(user)) throw new HttpError(403, "Only reviewers can change an application status");
    if (current.applicantUserId === user.id) {
      throw new HttpError(403, "You cannot review your own application");
    }
    const body = onboardingTransitionSchema.parse(req.body);

    await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "OnboardingApplication", current.id);
        const fresh = await tx.onboardingApplication.findUnique({
          where: { id: current.id },
          select: {
            id: true,
            status: true,
            kind: true,
            companyName: true,
            vendorCategory: true,
            applicantUserId: true,
            documents: { select: { kind: true } }
          }
        });
        if (!fresh) throw applicationNotFound();
        if (!canTransitionOnboarding(fresh.status, body.to)) {
          throw new HttpError(409, `Cannot move an application from ${fresh.status} to ${body.to}`);
        }
        if (body.to === OnboardingStatus.APPROVED &&
            !fresh.documents.some((document) => document.kind !== OnboardingDocumentKind.SIGNED_CONTRACT)) {
          throw new HttpError(409, "Approval needs at least one company document");
        }
        if (body.to === OnboardingStatus.CONTRACT_SIGNED &&
            !fresh.documents.some((document) => document.kind === OnboardingDocumentKind.SIGNED_CONTRACT)) {
          throw new HttpError(409, "Upload the manually signed contract before recording the signature");
        }

        const now = new Date();
        const data: Prisma.OnboardingApplicationUpdateManyMutationInput = { status: body.to };
        switch (body.to) {
          case OnboardingStatus.UNDER_REVIEW:
            Object.assign(data, { reviewStartedAt: now });
            break;
          case OnboardingStatus.APPROVED:
          case OnboardingStatus.REJECTED:
            Object.assign(data, { decidedAt: now, decisionNote: body.note ?? null });
            break;
          case OnboardingStatus.CONTRACT_SIGNED:
            Object.assign(data, { contractSignedAt: now });
            break;
          case OnboardingStatus.ACTIVE:
            Object.assign(data, { activatedAt: now });
            break;
          default:
            break;
        }

        // Compare-and-set on the observed status.
        const updated = await tx.onboardingApplication.updateMany({
          where: { id: fresh.id, status: fresh.status },
          data
        });
        if (updated.count !== 1) throw new HttpError(409, "The application changed; refresh and try again");

        const relations: Prisma.OnboardingApplicationUncheckedUpdateInput = { reviewerUserId: user.id };
        if (body.to === OnboardingStatus.CONTRACT_SIGNED) relations.contractSignedById = user.id;

        let organizationId: string | null = null;
        if (body.to === OnboardingStatus.ACTIVE) {
          const organization = await tx.organization.create({
            data: {
              name: fresh.companyName,
              slug: organizationSlug(fresh.companyName, fresh.id),
              kind: fresh.kind === OnboardingKind.VENDOR ? "VENDOR" : "CLIENT",
              vendorCategory: fresh.vendorCategory,
              createdById: user.id,
              memberships: {
                create: {
                  userId: fresh.applicantUserId,
                  role: OrganizationRole.OWNER,
                  status: MembershipStatus.ACTIVE,
                  grantedById: user.id
                }
              }
            },
            select: { id: true }
          });
          organizationId = organization.id;
          relations.organizationId = organization.id;
        }
        await tx.onboardingApplication.update({ where: { id: fresh.id }, data: relations });

        await tx.onboardingTransition.create({
          data: {
            applicationId: fresh.id,
            fromStatus: fresh.status,
            toStatus: body.to,
            actorUserId: user.id,
            note: body.note ?? null
          }
        });
        await tx.notification.create({
          data: {
            userId: fresh.applicantUserId,
            title: "Onboarding update",
            body: `Your ${fresh.kind.toLowerCase()} application is now ${body.to.replace(/_/g, " ").toLowerCase()}.`,
            metadata: { kind: "ONBOARDING", applicationId: fresh.id, status: body.to }
          }
        });
        await writeWorkspaceAudit(tx, req, {
          action: `onboarding.transition.${body.to.toLowerCase()}`,
          entityType: "ONBOARDING_APPLICATION",
          entityId: fresh.id,
          before: { status: fresh.status },
          after: { status: body.to, organizationId }
        });
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    const row = await loadVisibleApplication(user, current.id);
    res.json({ application: toApplicationDto(row, user) });
  })
);

router.post(
  "/onboarding/applications/:applicationId/documents",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const current = await loadVisibleApplication(user, req.params.applicationId);
    const body = onboardingDocumentSchema.parse(req.body);
    const { content, sha256 } = decodeDocument(body);

    const isApplicant = current.applicantUserId === user.id;
    const contract = body.kind === OnboardingDocumentKind.SIGNED_CONTRACT;

    const document = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "OnboardingApplication", current.id);
        const fresh = await tx.onboardingApplication.findUnique({
          where: { id: current.id },
          select: { status: true }
        });
        if (!fresh) throw applicationNotFound();
        const allowed = contract
          ? fresh.status === OnboardingStatus.APPROVED && (isApplicant || isReviewer(user))
          : isApplicant && DOCUMENT_UPLOAD_STATUSES.includes(fresh.status);
        if (!allowed) throw new HttpError(409, "This document cannot be added at the current stage");

        const count = await tx.onboardingDocument.count({ where: { applicationId: current.id } });
        if (count >= WORKSPACE_LIMITS.maxDocumentsPerApplication) {
          throw new HttpError(409, "The application already holds the maximum number of documents");
        }
        const created = await tx.onboardingDocument.create({
          data: {
            applicationId: current.id,
            kind: body.kind,
            fileName: body.fileName,
            mimeType: body.mimeType,
            sizeBytes: content.length,
            sha256,
            content,
            uploadedById: user.id
          },
          select: { id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true }
        });
        await writeWorkspaceAudit(tx, req, {
          action: "onboarding.document.upload",
          entityType: "ONBOARDING_DOCUMENT",
          entityId: created.id,
          metadata: { applicationId: current.id, kind: body.kind, sizeBytes: content.length, sha256 }
        });
        return created;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.status(201).json({
      document: { ...document, createdAt: new Date(document.createdAt).toISOString() }
    });
  })
);

router.get(
  "/onboarding/applications/:applicationId/documents/:documentId/content",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const application = await loadVisibleApplication(user, req.params.applicationId);
    const documentId = parseRouteId(req.params.documentId, () => new HttpError(404, "Document not found"));
    const document = await prisma.onboardingDocument.findFirst({
      where: { id: documentId, applicationId: application.id },
      select: { id: true, fileName: true, mimeType: true, content: true }
    });
    if (!document) throw new HttpError(404, "Document not found");

    await writeWorkspaceAudit(prisma, req, {
      action: "onboarding.document.read",
      entityType: "ONBOARDING_DOCUMENT",
      entityId: document.id,
      metadata: { applicationId: application.id, reviewer: application.applicantUserId !== user.id }
    });

    const bytes = Buffer.from(document.content);
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Content-Disposition", `attachment; filename="${document.fileName.replace(/["\\]/g, "_")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.end(bytes);
  })
);

export function organizationSlug(companyName: string, applicationId: string) {
  const base = companyName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = applicationId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-8);
  return `${base || "org"}-${suffix || "x"}`;
}

export default router;
