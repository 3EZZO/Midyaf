import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { AuthRequest } from "../types/auth.js";

export type AuditEntityType =
  | "ACTIVITY_INTAKE"
  | "AI_PLAN"
  | "BOOKING"
  | "COMPANY_REPORT"
  | "CONTRACT"
  | "COORDINATOR_REQUEST"
  | "DRIVER"
  | "EVENT"
  | "FILE_ASSET"
  | "GUEST"
  | "GUEST_JOURNEY"
  | "SUPPLIER"
  | "TASK"
  | "USER"
  | "VENDOR_QUOTE";

type RecordAuditLogInput = {
  req: Request;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  eventId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

export async function recordAuditLog(input: RecordAuditLogInput) {
  const actor = (input.req as AuthRequest).user;

  if (!actor) {
    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        actorRole: actor.role,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        eventId: input.eventId ?? null,
        beforeData: toAuditJson(input.before),
        afterData: toAuditJson(input.after),
        metadata: toAuditJson({
          ...(isPlainObject(input.metadata) ? input.metadata : {}),
          metadata:
            input.metadata === undefined || isPlainObject(input.metadata)
              ? undefined
              : input.metadata,
          method: input.req.method,
          path: input.req.originalUrl
        }),
        ipAddress: input.req.ip,
        userAgent: input.req.get("user-agent") ?? null
      }
    });
  } catch (error) {
    console.warn("Audit log write failed", error);
  }
}

export function toAuditJson(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}
