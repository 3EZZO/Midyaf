import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { AuthenticatedUser as FullActor } from "../types/auth.js";
type AuthenticatedUser = Pick<FullActor, "id" | "role">;
import type { Harness } from "../testing/httpHarness.js";

/**
 * FULL-OVERHAUL-M2 onboarding through the real workspace router: applicant
 * roles, the SUBMITTED -> UNDER_REVIEW -> APPROVED/REJECTED ->
 * CONTRACT_SIGNED -> ACTIVE state machine, reviewer separation, private
 * bounded documents and atomic activation.
 */

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const { buildWorkspaceTestWorld } = await import("../testing/memoryPrisma.js");
const workspaceRouter = (await import("./workspace.js")).default;
const { decodeDocument, organizationSlug } = await import("./onboarding.js");

const { actors, seed } = buildWorkspaceTestWorld();
let http: Harness;

beforeAll(async () => {
  http = await startHarness([["/api/workspace", workspaceRouter]]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  memory.current.seed(structuredClone(seed));
});

const BASE = "/api/workspace/onboarding/applications";
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic document body")]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const vendorApplication = {
  kind: "VENDOR",
  companyName: "Synthetic Vendor Co",
  vendorCategory: "CAR",
  contactName: "Synthetic Contact",
  contactEmail: "Contact@Example.test",
  contactPhone: "+966 500 000 000"
};

function document(kind: string, bytes = PDF, fileName = "registration.pdf", mimeType = "application/pdf") {
  return { kind, fileName, mimeType, contentBase64: bytes.toString("base64") };
}

async function submitVendor() {
  const { status, body } = await http.post(BASE, actors.vendorCar, vendorApplication);
  expect(status).toBe(201);
  return body.application.id as string;
}

async function transition(id: string, to: string, extra: Record<string, unknown> = {}, actor: AuthenticatedUser = actors.sa) {
  return http.post(`${BASE}/${id}/transitions`, actor, { to, ...extra });
}

describe("submission", () => {
  it("accepts a vendor application from a SUPPLIER account with an initial transition", async () => {
    const id = await submitVendor();
    const row = memory.current.rows("onboardingApplication").find((item) => item.id === id);
    expect(row).toMatchObject({ status: "SUBMITTED", applicantUserId: "u_vendor_car", contactEmail: "contact@example.test" });
    expect(memory.current.rows("onboardingTransition")).toEqual([
      expect.objectContaining({ applicationId: id, fromStatus: null, toStatus: "SUBMITTED" })
    ]);
  });

  it("refuses the wrong account type, a second open application and server-owned fields", async () => {
    expect((await http.post(BASE, actors.guest, vendorApplication)).status).toBe(403);
    expect((await http.post(BASE, actors.vendorCar, { ...vendorApplication, kind: "CLIENT", vendorCategory: undefined })).status).toBe(403);
    expect((await http.post(BASE, actors.vendorCar, { ...vendorApplication, status: "ACTIVE" })).status).toBe(400);
    expect((await http.post(BASE, actors.vendorCar, { ...vendorApplication, vendorCategory: undefined })).status).toBe(400);
    await submitVendor();
    expect((await http.post(BASE, actors.vendorCar, vendorApplication)).status).toBe(409);
  });

  it("lets a company organizer apply as a client", async () => {
    const { status } = await http.post(BASE, actors.client, {
      kind: "CLIENT",
      companyName: "Synthetic Client Co",
      contactName: "Synthetic Contact",
      contactEmail: "client@example.test",
      contactPhone: "+966500000001"
    });
    expect(status).toBe(201);
  });
});

describe("visibility", () => {
  it("shows an application to its applicant and reviewers only", async () => {
    const id = await submitVendor();
    expect((await http.get(`${BASE}/${id}`, actors.vendorCar)).status).toBe(200);
    expect((await http.get(`${BASE}/${id}`, actors.sa)).status).toBe(200);
    expect((await http.get(`${BASE}/${id}`, actors.vendor)).status).toBe(404);
    expect((await http.get(`${BASE}/${id}`, actors.owner)).status).toBe(404);
    expect((await http.get(BASE, actors.vendor)).body.applications).toEqual([]);
    expect((await http.get(BASE, actors.sa)).body.applications).toHaveLength(1);
  });
});

describe("state machine", () => {
  it("walks SUBMITTED -> ACTIVE and creates the organization and owner membership atomically", async () => {
    const id = await submitVendor();
    expect((await transition(id, "UNDER_REVIEW")).status).toBe(200);
    // Approval needs a company document first.
    expect((await transition(id, "APPROVED")).status).toBe(409);
    expect((await http.post(`${BASE}/${id}/documents`, actors.vendorCar, document("COMMERCIAL_REGISTRATION"))).status).toBe(201);
    expect((await transition(id, "APPROVED", { note: "Synthetic approval" })).status).toBe(200);

    // Signed state needs the explicit confirmation AND a stored signed contract.
    expect((await transition(id, "CONTRACT_SIGNED")).status).toBe(400);
    expect((await transition(id, "CONTRACT_SIGNED", { confirmSignedContract: true })).status).toBe(409);
    expect((await http.post(`${BASE}/${id}/documents`, actors.sa, document("SIGNED_CONTRACT", PDF, "contract.pdf"))).status).toBe(201);
    const signed = await transition(id, "CONTRACT_SIGNED", { confirmSignedContract: true });
    expect(signed.status).toBe(200);
    expect(signed.body.application.contractSignedAt).toEqual(expect.any(String));

    const active = await transition(id, "ACTIVE");
    expect(active.status).toBe(200);
    const organizationId = active.body.application.organizationId;
    expect(memory.current.rows("organization").find((org) => org.id === organizationId)).toMatchObject({
      kind: "VENDOR",
      vendorCategory: "CAR",
      name: "Synthetic Vendor Co"
    });
    expect(memory.current.rows("organizationMembership").find((row) => row.organizationId === organizationId)).toMatchObject({
      userId: "u_vendor_car",
      role: "OWNER",
      status: "ACTIVE"
    });
    expect(active.body.application.transitions.map((t: { to: string }) => t.to)).toEqual([
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "CONTRACT_SIGNED",
      "ACTIVE"
    ]);
    expect(memory.current.rows("notification").filter((n) => n.userId === "u_vendor_car")).toHaveLength(4);
  });

  it("refuses skipped, reversed and terminal transitions", async () => {
    const id = await submitVendor();
    expect((await transition(id, "APPROVED")).status).toBe(409);
    expect((await transition(id, "ACTIVE")).status).toBe(409);
    await transition(id, "UNDER_REVIEW");
    expect((await transition(id, "REJECTED")).status).toBe(400); // reason required
    expect((await transition(id, "REJECTED", { note: "Synthetic: incomplete" })).status).toBe(200);
    expect((await transition(id, "UNDER_REVIEW")).status).toBe(409);
    // A rejected application no longer blocks a new one.
    expect((await http.post(BASE, actors.vendorCar, vendorApplication)).status).toBe(201);
  });

  it("is reviewer-only and never self-reviewed", async () => {
    const id = await submitVendor();
    expect((await transition(id, "UNDER_REVIEW", {}, actors.vendorCar)).status).toBe(403);
    expect((await transition(id, "UNDER_REVIEW", {}, actors.owner)).status).toBe(404);
  });

  it("rolls the whole activation back when the audit write fails", async () => {
    const id = await submitVendor();
    await transition(id, "UNDER_REVIEW");
    await http.post(`${BASE}/${id}/documents`, actors.vendorCar, document("COMMERCIAL_REGISTRATION"));
    await transition(id, "APPROVED");
    await http.post(`${BASE}/${id}/documents`, actors.sa, document("SIGNED_CONTRACT", PDF, "contract.pdf"));
    await transition(id, "CONTRACT_SIGNED", { confirmSignedContract: true });
    const organizations = memory.current.rows("organization").length;

    memory.current.failNext("auditLog", "create", new Error("synthetic audit outage"));
    expect((await transition(id, "ACTIVE")).status).toBe(500);
    expect(memory.current.rows("organization")).toHaveLength(organizations);
    expect(memory.current.rows("onboardingApplication").find((row) => row.id === id)).toMatchObject({
      status: "CONTRACT_SIGNED",
      organizationId: null
    });
  });

  it("applies a transition once when two reviewers race", async () => {
    const id = await submitVendor();
    const results = await Promise.all([transition(id, "UNDER_REVIEW"), transition(id, "UNDER_REVIEW")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(memory.current.rows("onboardingTransition").filter((row) => row.toStatus === "UNDER_REVIEW")).toHaveLength(1);
  });
});

describe("documents", () => {
  it("validates type, magic bytes, size and stage", async () => {
    const id = await submitVendor();
    const post = (body: unknown, actor: AuthenticatedUser = actors.vendorCar) => http.post(`${BASE}/${id}/documents`, actor, body);
    expect((await post(document("IDENTITY", PNG, "id.png", "image/png"))).status).toBe(201);
    expect((await post(document("IDENTITY", PNG, "id.pdf", "application/pdf"))).status).toBe(400);
    expect((await post(document("IDENTITY", Buffer.from("not a pdf"), "x.pdf"))).status).toBe(400);
    expect((await post(document("IDENTITY", PDF, "x.exe", "application/pdf"))).status).toBe(400);
    const big = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(1_048_577)]);
    expect((await post(document("IDENTITY", big))).status).toBe(400); // over the encoded size bound
    // Contracts only once approved; other uploads only by the applicant.
    expect((await post(document("SIGNED_CONTRACT"))).status).toBe(409);
    expect((await post(document("OTHER"), actors.sa)).status).toBe(409);
    expect(memory.current.rows("onboardingDocument")).toHaveLength(1);
  });

  it("serves bytes privately to the applicant and reviewer with safe headers and an audit", async () => {
    const id = await submitVendor();
    const uploaded = await http.post(`${BASE}/${id}/documents`, actors.vendorCar, document("COMMERCIAL_REGISTRATION"));
    const docId = uploaded.body.document.id;
    const path = `${BASE}/${id}/documents/${docId}/content`;

    const own = await http.raw(path, actors.vendorCar);
    expect(own.status).toBe(200);
    expect(own.bytes.equals(PDF)).toBe(true);
    expect(own.headers.get("content-type")).toBe("application/pdf");
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect(own.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(own.headers.get("x-content-type-options")).toBe("nosniff");

    expect((await http.raw(path, actors.sa)).status).toBe(200);
    expect((await http.raw(path, actors.vendor)).status).toBe(404);
    expect((await http.raw(path)).status).toBe(401);
    expect(memory.current.rows("auditLog").filter((row) => row.action === "onboarding.document.read")).toHaveLength(2);

    // Listing never carries the bytes.
    const listed = await http.get(`${BASE}/${id}`, actors.vendorCar);
    expect(JSON.stringify(listed.body)).not.toContain(PDF.toString("base64"));
    expect(listed.body.application.documents[0]).not.toHaveProperty("content");
  });
});

describe("helpers", () => {
  it("decodes only matching bytes and computes a sha256", () => {
    const decoded = decodeDocument({ mimeType: "application/pdf", fileName: "a.pdf", contentBase64: PDF.toString("base64") });
    expect(decoded.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => decodeDocument({ mimeType: "image/png", fileName: "a.png", contentBase64: PDF.toString("base64") })).toThrow();
    const oversized = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(1_048_576)]);
    expect(() => decodeDocument({ mimeType: "application/pdf", fileName: "a.pdf", contentBase64: oversized.toString("base64") })).toThrow(
      /1 MiB/
    );
  });

  it("derives a stable, safe organization slug", () => {
    expect(organizationSlug("Synthetic Vendor Co!", "cmabc123XYZ")).toBe("synthetic-vendor-co-abc123xyz".slice(0, 60).replace(/-abc123xyz$/, "") + "-bc123xyz");
    expect(organizationSlug("شركة", "app_1")).toBe("org-app1");
  });
});
