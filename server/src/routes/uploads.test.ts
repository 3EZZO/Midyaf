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

type StoredAsset = {
  id: string;
  type: FileAssetType;
  key: string;
  url: string;
  mimeType: string;
  size: number;
  userId?: string | null;
  guestId?: string | null;
  driverId?: string | null;
  eventId?: string | null;
  createdAt: Date;
};

const mockState = vi.hoisted(() => ({
  assets: new Map<string, StoredAsset>()
}));

const mockDb = vi.hoisted(() => ({
  fileAsset: {
    findMany: vi.fn(async () => [...mockState.assets.values()]),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mockState.assets.get(where.id) ?? null),
    findFirst: vi.fn(async ({ where }: { where: { AND?: Array<Record<string, unknown>> } }) => {
      const clauses = where.AND ?? [];
      const idClause = clauses.find((c) => typeof c.id === "string");
      const asset = idClause ? mockState.assets.get(String(idClause.id)) ?? null : null;
      if (!asset) return null;
      const vis = clauses[1] ?? {};
      if (vis.id === "__no_file_access__") return null;
      if (typeof vis.userId === "string" && asset.userId !== vis.userId) return null;
      if (Array.isArray(vis.OR)) {
        const allowed = vis.OR.some((branch: Record<string, unknown>) => branch.userId && branch.userId === asset.userId);
        if (!allowed) return null;
      }
      return asset;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const created: StoredAsset = {
        id: `fa_test_${mockState.assets.size + 1}`,
        createdAt: new Date("2026-11-24T00:00:00Z"),
        ...(data as Omit<StoredAsset, "id" | "createdAt">)
      };
      mockState.assets.set(created.id, created);
      return created;
    })
  },
  guest: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null)
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
  app.use("/api", uploadsRouter);
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
  mockState.assets.clear();
  vi.clearAllMocks();
});

describe("POST /api/uploads & protected file-asset delivery (PLAN_READY_1 Sprint 1+2)", () => {
  it("returns UPLOADED / PENDING_REVIEW metadata and a short-lived signed content URL (never public /uploads)", async () => {
    const { accessToken } = signTokens({ id: "u_guest_1", email: "guest@example.test", role: Role.GUEST });
    const form = new FormData();
    form.append("type", FileAssetType.OTHER);
    form.append("file", new Blob(["synthetic-doc"], { type: "application/pdf" }), "id-card.pdf");

    const res = await fetch(`${base}/api/uploads`, {
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
    expect(json.fileAsset.url).toMatch(/^\/api\/file-assets\/fa_test_1\/content\?exp=\d+&sig=[a-f0-9]{64}$/);

    // 1. Unauthenticated access without signature is denied (401)
    const anon = await fetch(`${base}/api/file-assets/fa_test_1/content`);
    expect(anon.status).toBe(401);

    // 2. Signed short-lived URL serves the file with private no-store headers
    const signedRes = await fetch(`${base}${json.fileAsset.url}`);
    expect(signedRes.status).toBe(200);
    expect(signedRes.headers.get("cache-control")).toContain("no-store");
    expect(signedRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await signedRes.text()).toBe("synthetic-doc");

    // 3. Another guest cannot request a signed URL for someone else's document (404)
    const otherGuest = signTokens({ id: "u_guest_2", email: "other@example.test", role: Role.GUEST });
    const forbiddenSigned = await fetch(`${base}/api/file-assets/fa_test_1/signed-url`, {
      headers: { Authorization: `Bearer ${otherGuest.accessToken}` }
    });
    expect(forbiddenSigned.status).toBe(404);

    // 4. The owning guest CAN mint a fresh signed URL
    const ownSigned = await fetch(`${base}/api/file-assets/fa_test_1/signed-url`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    expect(ownSigned.status).toBe(200);
    const ownJson = (await ownSigned.json()) as { url: string; storage: string };
    expect(ownJson.storage).toBe("local");
    expect(ownJson.url).toContain("/api/file-assets/fa_test_1/content?exp=");
  });

  it("never renders hostile uploads inline on our origin (HTML forced to attachment + sandbox CSP)", async () => {
    const { accessToken } = signTokens({ id: "u_guest_1", email: "guest@example.test", role: Role.GUEST });
    const upload = async (body: string, mime: string, name: string) => {
      const form = new FormData();
      form.append("type", FileAssetType.OTHER);
      form.append("file", new Blob([body], { type: mime }), name);
      const res = await fetch(`${base}/api/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      });
      expect(res.status).toBe(201);
      const json = (await res.json()) as Record<string, any>;
      createdFiles.push(String(json.fileAsset.key));
      return fetch(`${base}${json.fileAsset.url}`);
    };

    const hostile = await upload("<script>alert(1)</script>", "text/html", "passport.html");
    expect(hostile.status).toBe(200);
    expect(hostile.headers.get("content-type")).toContain("application/octet-stream");
    expect(hostile.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(hostile.headers.get("content-security-policy")).toContain("sandbox");

    const svg = await upload("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml", "logo.svg");
    expect(svg.headers.get("content-type")).toContain("application/octet-stream");
    expect(svg.headers.get("content-disposition")).toMatch(/^attachment;/);

    const pdf = await upload("%PDF-1.4 synthetic", "application/pdf", "ticket.pdf");
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(pdf.headers.get("content-disposition")).toMatch(/^inline;/);
  });

  it("cleans up the temp upload file when target validation rejects a forbidden guest upload", async () => {
    const uploadDir = path.resolve(process.cwd(), "uploads");
    const before = new Set(fs.readdirSync(uploadDir));
    const { accessToken } = signTokens({ id: "u_guest_1", email: "guest@example.test", role: Role.GUEST });
    const form = new FormData();
    form.append("type", FileAssetType.VISA); // Guests cannot self-upload VISA
    form.append("file", new Blob(["forbidden"], { type: "application/pdf" }), "rejected.pdf");

    const res = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
    expect(res.status).toBe(403);
    const after = fs.readdirSync(uploadDir).filter((name) => !before.has(name));
    expect(after).toEqual([]);
  });
});
