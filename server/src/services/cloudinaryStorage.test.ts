import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildCloudinaryPrivateDownloadUrl,
  buildSignedLocalContentUrl,
  encodeCloudinaryKey,
  parseCloudinaryKey,
  resolveCloudinaryConfig,
  resolveSignedFileAssetUrl,
  resourceTypeForMime,
  signCloudinaryParams,
  uploadFileToCloudinary,
  verifySignedLocalContentParams
} from "./cloudinaryStorage.js";

describe("cloudinaryStorage (PLAN_READY_1 Sprint 2)", () => {
  it("parses CLOUDINARY_URL or separate env vars and stays inert when unset", () => {
    expect(resolveCloudinaryConfig({})).toBeNull();
    expect(resolveCloudinaryConfig({ CLOUDINARY_URL: "https://not-cloudinary.test" })).toBeNull();

    expect(
      resolveCloudinaryConfig({ CLOUDINARY_URL: "cloudinary://123456:s3cr3t@vshaqdxu" })
    ).toEqual({
      cloudName: "vshaqdxu",
      apiKey: "123456",
      apiSecret: "s3cr3t"
    });

    expect(
      resolveCloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: "vshaqdxu",
        CLOUDINARY_API_KEY: "k1",
        CLOUDINARY_API_SECRET: "s1"
      })
    ).toEqual({
      cloudName: "vshaqdxu",
      apiKey: "k1",
      apiSecret: "s1"
    });
  });

  it("maps MIME types safely (PDFs and SVGs as raw, raster images as image, video as video)", () => {
    expect(resourceTypeForMime("image/jpeg")).toBe("image");
    expect(resourceTypeForMime("image/png")).toBe("image");
    expect(resourceTypeForMime("image/svg+xml")).toBe("raw");
    expect(resourceTypeForMime("application/pdf")).toBe("raw");
    expect(resourceTypeForMime("video/mp4")).toBe("video");
  });

  it("signs Cloudinary uploads server-side under midyaf/uploads/ with type=authenticated (zero unsigned presets)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-cld-"));
    const samplePath = path.join(tmp, "visa.pdf");
    fs.writeFileSync(samplePath, "%PDF-1.4 synthetic visa");

    const config = { cloudName: "vshaqdxu", apiKey: "test-key", apiSecret: "test-secret" };
    const captured: { url?: string; form?: FormData } = {};
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured.url = String(url);
      captured.form = init?.body as FormData;
      return new Response(
        JSON.stringify({
          public_id: `midyaf/uploads/visa/${captured.form.get("public_id")}`,
          bytes: 23,
          type: "authenticated"
        }),
        { status: 200 }
      );
    });

    try {
      const uploaded = await uploadFileToCloudinary(
        {
          filePath: samplePath,
          mimeType: "application/pdf",
          assetType: "VISA",
          originalName: "vip visa.pdf"
        },
        config,
        fetcher as unknown as typeof fetch,
        1_764_000_000_000
      );

      expect(captured.url).toBe("https://api.cloudinary.com/v1_1/vshaqdxu/raw/upload");
      expect(captured.form?.get("type")).toBe("authenticated");
      expect(captured.form?.get("folder")).toBe("midyaf/uploads/visa");
      expect(captured.form?.get("upload_preset")).toBeNull();
      expect(captured.form?.get("api_key")).toBe("test-key");
      const expectedSig = signCloudinaryParams(
        {
          folder: "midyaf/uploads/visa",
          public_id: String(captured.form?.get("public_id")),
          timestamp: 1_764_000_000,
          type: "authenticated"
        },
        config.apiSecret
      );
      expect(captured.form?.get("signature")).toBe(expectedSig);
      expect(uploaded.key.startsWith("cloudinary:raw:midyaf/uploads/visa/")).toBe(true);
      expect(parseCloudinaryKey(uploaded.key)).toEqual({
        resourceType: "raw",
        publicId: uploaded.publicId
      });
      // Reject keys outside midyaf/uploads/
      expect(parseCloudinaryKey("cloudinary:image:midyaf/brand/logo")).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("mints short-lived Cloudinary private download URLs and verifies HMAC local signed URLs", () => {
    const config = { cloudName: "vshaqdxu", apiKey: "k1", apiSecret: "s1" };
    const nowMs = 1_764_000_000_000;
    const key = encodeCloudinaryKey("raw", "midyaf/uploads/visa/doc1");
    const cldSigned = buildCloudinaryPrivateDownloadUrl(config, "raw", "midyaf/uploads/visa/doc1", 300, nowMs);
    expect(cldSigned.url).toContain("https://api.cloudinary.com/v1_1/vshaqdxu/raw/download?");
    expect(cldSigned.url).toContain("type=authenticated");
    expect(cldSigned.url).toContain("expires_at=1764000300");
    expect(cldSigned.url).not.toContain("s1");

    expect(
      resolveSignedFileAssetUrl({ id: "fa_1", key, url: "/api/file-assets/protected" }, { config, nowMs }).storage
    ).toBe("cloudinary");

    // Local signed HMAC URL verification
    const localSigned = buildSignedLocalContentUrl("fa_local", 300, nowMs, "secret-key");
    const params = new URL(`http://localhost${localSigned.url}`).searchParams;
    expect(
      verifySignedLocalContentParams("fa_local", params.get("exp"), params.get("sig"), nowMs + 10_000, "secret-key")
    ).toBe(true);
    // Expired
    expect(
      verifySignedLocalContentParams("fa_local", params.get("exp"), params.get("sig"), nowMs + 301_000, "secret-key")
    ).toBe(false);
    // Wrong asset ID
    expect(
      verifySignedLocalContentParams("fa_other", params.get("exp"), params.get("sig"), nowMs + 10_000, "secret-key")
    ).toBe(false);
    // Tampered signature
    expect(
      verifySignedLocalContentParams("fa_local", params.get("exp"), "0".repeat(64), nowMs + 10_000, "secret-key")
    ).toBe(false);
  });
});
