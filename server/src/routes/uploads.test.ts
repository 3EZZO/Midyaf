import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { FileAssetType, Role } from "@prisma/client";
import { ZodError } from "zod";
import { signTokens } from "../middleware/auth.js";
import { HttpError } from "../utils/http.js";

const mockDb = vi.hoisted(() => ({
  fileAsset: {
    findMany: vi.fn(async () => []),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "fa_test_1",
      createdAt: new Date("2026-11-24T00:00:00Z"),
      ...data
    }))
  },
  auditLog: {
    create: vi.fn(async () => ({ id: "aud_1" }))
  }
}));

vi.mock("../db.js", () => ({ prisma: mockDb }));
vi.mock("../services/notificationDelivery.js", () => ({ sendNotification: vi.fn(async () => ({ id: "n1" })) }));

const uploadsRouter = (await import("./uploads.js")).default;

let server: Server;
let base = "";
const createdFiles: string[] = [];

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/", uploadsRouter);
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ error: { message: "Validation failed" } });
    if (error instanceof HttpError) return res.status(error.status).json({ error: { message: error.message } });
    return res.status(500).json({ error: { message: "Internal server error" } });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const filename of createdFiles) {
    fs.rmSync(path.resolve(process.cwd(), "uploads", filename), { force: true });
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /uploads honest verification metadata (PLAN_READY_1 Sprint 1)", () => {
  it("returns UPLOADED / PENDING_REVIEW metadata and never fabricates AI OCR approval", async () => {
    const { accessToken } = signTokens({ id: "u_guest_1", email: "guest@example.test", role: Role.GUEST });
    const form = new FormData();
    form.append("type", FileAssetType.OTHER);
    form.append("file", new Blob(["synthetic-doc"], { type: "application/pdf" }), "id-card.pdf");

    const res = await fetch(`${base}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, any>;
    if (json.fileAsset?.key) {
      createdFiles.push(String(json.fileAsset.key));
    }
    expect(json.verification).toEqual({
      status: "UPLOADED",
      reviewStatus: "PENDING_REVIEW",
      verified: false,
      documentType: FileAssetType.OTHER
    });
    expect(json).not.toHaveProperty("aiOcrVerification");
    expect(JSON.stringify(json)).not.toContain("0.98");
    expect(JSON.stringify(json)).not.toContain("APPROVED");
  });
});
