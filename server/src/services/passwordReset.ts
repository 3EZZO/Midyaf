import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError } from "../utils/http.js";
import { WORKSPACE_TRANSACTION, lockRow } from "../utils/workspacePolicy.js";
import type { Request } from "express";

export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_ISSUED_ACTION = "auth.password_reset.issued";
export const PASSWORD_RESET_CONSUMED_ACTION = "auth.password_reset.consumed";

const INVALID_RESET_MESSAGE = "Invalid or expired password reset token";

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeHexEqual(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Generates a single-use, 15-minute password reset link for `target`.
 * Only the SHA-256 hash of the 256-bit secret is persisted; the raw token is
 * returned once to the Super Admin so it can be shared out-of-band (e.g., WhatsApp).
 */
export async function issuePasswordResetLink(
  req: AuthRequest,
  target: { id: string; name: string; email: string }
) {
  const secret = randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(secret);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  const issued = await prisma.auditLog.create({
    data: {
      actorUserId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
      action: PASSWORD_RESET_ISSUED_ACTION,
      entityType: "USER",
      entityId: target.id,
      metadata: {
        tokenHash,
        expiresAt: expiresAt.toISOString()
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    },
    select: { id: true }
  });

  const token = `${issued.id}.${secret}`;
  return {
    userId: target.id,
    userName: target.name,
    userEmail: target.email,
    token,
    expiresAt: expiresAt.toISOString(),
    // Fragment (#resetToken=...) stays client-side and is never sent to HTTP servers or access logs.
    resetPath: `/#resetToken=${encodeURIComponent(token)}`
  };
}

/**
 * Atomically verifies and consumes a single-use password reset token, updating
 * the user's bcrypt hash and recording the consumption inside one transaction.
 */
export async function redeemPasswordResetToken(
  req: Request,
  rawToken: string,
  newPassword: string
) {
  const parts = rawToken.split(".");
  if (parts.length !== 2) {
    throw new HttpError(400, INVALID_RESET_MESSAGE);
  }
  const [issueId, secret] = parts;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(issueId) || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) {
    throw new HttpError(400, INVALID_RESET_MESSAGE);
  }

  const issued = await prisma.auditLog.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      createdAt: true
    }
  });

  if (!issued || issued.action !== PASSWORD_RESET_ISSUED_ACTION || issued.entityType !== "USER") {
    throw new HttpError(400, INVALID_RESET_MESSAGE);
  }

  const meta = readRecord(issued.metadata);
  const storedHash = typeof meta?.tokenHash === "string" ? meta.tokenHash : "";
  const expiresAtMs = typeof meta?.expiresAt === "string" ? Date.parse(meta.expiresAt) : Number.NaN;

  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    throw new HttpError(400, INVALID_RESET_MESSAGE);
  }

  const candidateHash = sha256Hex(secret);
  if (!safeHexEqual(storedHash, candidateHash)) {
    throw new HttpError(400, INVALID_RESET_MESSAGE);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "User", issued.entityId);

    const target = await tx.user.findUnique({
      where: { id: issued.entityId },
      select: { id: true, email: true, role: true }
    });
    if (!target) {
      throw new HttpError(400, INVALID_RESET_MESSAGE);
    }

    const history = await tx.auditLog.findMany({
      where: {
        entityType: "USER",
        entityId: target.id,
        action: { in: [PASSWORD_RESET_ISSUED_ACTION, PASSWORD_RESET_CONSUMED_ACTION] }
      },
      select: { id: true, action: true, metadata: true, createdAt: true }
    });

    const alreadyConsumed = history.some((row) => {
      if (row.action !== PASSWORD_RESET_CONSUMED_ACTION) return false;
      const rowMeta = readRecord(row.metadata);
      return rowMeta?.issueId === issueId;
    });
    if (alreadyConsumed) {
      throw new HttpError(400, INVALID_RESET_MESSAGE);
    }

    const issuedAtMs = new Date(issued.createdAt).getTime();
    const superseded = history.some(
      (row) =>
        row.action === PASSWORD_RESET_ISSUED_ACTION &&
        row.id !== issueId &&
        new Date(row.createdAt).getTime() > issuedAtMs
    );
    if (superseded) {
      throw new HttpError(400, INVALID_RESET_MESSAGE);
    }

    await tx.user.update({
      where: { id: target.id },
      // Bump tokenVersion so every refresh token issued before the reset stops working.
      data: { passwordHash, tokenVersion: { increment: 1 } }
    });

    await tx.auditLog.create({
      data: {
        actorUserId: target.id,
        actorRole: target.role,
        action: PASSWORD_RESET_CONSUMED_ACTION,
        entityType: "USER",
        entityId: target.id,
        metadata: { issueId },
        ipAddress: req.ip,
        userAgent: req.get("user-agent")
      }
    });

    return { userId: target.id, email: target.email };
  }, WORKSPACE_TRANSACTION);
}
