import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { env } from "../env.js";

/**
 * PLAN_READY_1 Sprint 2: Server-side signed Cloudinary storage & short-lived
 * authenticated delivery URLs (zero unsigned presets, zero new npm packages).
 *
 * Security guarantees:
 * - Uses a dedicated least-privilege Cloudinary API key from Render env vars
 *   (`CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` +
 *   `CLOUDINARY_API_SECRET`). Falls back cleanly to protected local disk when unset.
 * - All uploads land under `midyaf/uploads/` (never touching `midyaf/brand/`).
 * - All application files use `type: "authenticated"` (never public delivery URLs).
 * - Delivery URLs are short-lived (default 300s) and minted ONLY after RBAC passes.
 * - Never echoes or logs `CLOUDINARY_API_SECRET` or `CLOUDINARY_URL`.
 */

export const SIGNED_URL_TTL_SECONDS = 300;
export const CLOUDINARY_UPLOAD_FOLDER_ROOT = "midyaf/uploads";
export type CloudinaryResourceType = "image" | "video" | "raw";

export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export type ParsedCloudinaryKey = {
  resourceType: CloudinaryResourceType;
  publicId: string;
};

const CLOUDINARY_KEY_PREFIX = "cloudinary:";

/** Parses `cloudinary://<api_key>:<api_secret>@<cloud_name>` or individual env vars. */
export function resolveCloudinaryConfig(source: Partial<typeof env> = env): CloudinaryConfig | null {
  const rawUrl = source.CLOUDINARY_URL?.trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (
        parsed.protocol === "cloudinary:" &&
        parsed.hostname &&
        parsed.username &&
        parsed.password
      ) {
        return {
          cloudName: decodeURIComponent(parsed.hostname),
          apiKey: decodeURIComponent(parsed.username),
          apiSecret: decodeURIComponent(parsed.password)
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  const cloudName = source.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = source.CLOUDINARY_API_KEY?.trim();
  const apiSecret = source.CLOUDINARY_API_SECRET?.trim();
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret };
  }
  return null;
}

export function isCloudinaryConfigured(source: Partial<typeof env> = env): boolean {
  return resolveCloudinaryConfig(source) !== null;
}

/**
 * Cloudinary Free restricts PDF image delivery by default, so PDFs and arbitrary
 * documents are stored as `raw`; images as `image`; videos as `video`.
 */
export function resourceTypeForMime(mimeType: string): CloudinaryResourceType {
  const normalized = mimeType.toLowerCase().trim();
  if (normalized.startsWith("image/") && normalized !== "image/svg+xml") {
    return "image";
  }
  if (normalized.startsWith("video/")) {
    return "video";
  }
  return "raw";
}

export function encodeCloudinaryKey(resourceType: CloudinaryResourceType, publicId: string): string {
  return `${CLOUDINARY_KEY_PREFIX}${resourceType}:${publicId}`;
}

export function parseCloudinaryKey(key: string): ParsedCloudinaryKey | null {
  if (!key.startsWith(CLOUDINARY_KEY_PREFIX)) return null;
  const rest = key.slice(CLOUDINARY_KEY_PREFIX.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx <= 0) return null;
  const resourceType = rest.slice(0, colonIdx);
  const publicId = rest.slice(colonIdx + 1);
  if (
    (resourceType !== "image" && resourceType !== "video" && resourceType !== "raw") ||
    !publicId ||
    !publicId.startsWith(`${CLOUDINARY_UPLOAD_FOLDER_ROOT}/`)
  ) {
    return null;
  }
  return { resourceType, publicId };
}

/** Cloudinary API v1_1 SHA-1 request signature over sorted non-empty parameters. */
export function signCloudinaryParams(
  params: Record<string, string | number | boolean | undefined>,
  apiSecret: string
): string {
  const canonical = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return createHash("sha1").update(`${canonical}${apiSecret}`).digest("hex");
}

/**
 * Mints a short-lived server-signed Cloudinary private download URL (enforced
 * by Cloudinary via `expires_at` + `signature`).
 */
export function buildCloudinaryPrivateDownloadUrl(
  config: CloudinaryConfig,
  resourceType: CloudinaryResourceType,
  publicId: string,
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
  nowMs = Date.now()
): { url: string; expiresAt: string } {
  const timestamp = Math.floor(nowMs / 1000);
  const expiresAtSec = timestamp + Math.max(30, Math.min(3600, ttlSeconds));
  const signedParams = {
    attachment: "false",
    expires_at: expiresAtSec,
    public_id: publicId,
    timestamp,
    type: "authenticated"
  };
  const signature = signCloudinaryParams(signedParams, config.apiSecret);
  const query = new URLSearchParams({
    api_key: config.apiKey,
    attachment: "false",
    expires_at: String(expiresAtSec),
    public_id: publicId,
    signature,
    timestamp: String(timestamp),
    type: "authenticated"
  });
  return {
    url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/${resourceType}/download?${query.toString()}`,
    expiresAt: new Date(expiresAtSec * 1000).toISOString()
  };
}

/** Uploads a file buffer/path to Cloudinary under `midyaf/uploads/<subdir>` with `type: "authenticated"`. */
export async function uploadFileToCloudinary(
  input: {
    filePath: string;
    mimeType: string;
    assetType: string;
    originalName: string;
  },
  config: CloudinaryConfig,
  fetcher: typeof fetch = fetch,
  nowMs = Date.now()
): Promise<{ key: string; resourceType: CloudinaryResourceType; publicId: string; bytes: number }> {
  const resourceType = resourceTypeForMime(input.mimeType);
  const safeSubdir = input.assetType.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "other";
  const folder = `${CLOUDINARY_UPLOAD_FOLDER_ROOT}/${safeSubdir}`;
  const leafId = `${nowMs}-${randomUUID()}`;
  const timestamp = Math.floor(nowMs / 1000);

  const signedFields = {
    folder,
    public_id: leafId,
    timestamp,
    type: "authenticated"
  };
  const signature = signCloudinaryParams(signedFields, config.apiSecret);

  const buffer = await fs.promises.readFile(input.filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: input.mimeType }), input.originalName.replace(/[^a-zA-Z0-9._-]/g, "_"));
  form.append("api_key", config.apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", leafId);
  form.append("type", "authenticated");
  form.append("signature", signature);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/${resourceType}/upload`;
    const response = await fetcher(endpoint, {
      method: "POST",
      body: form,
      signal: controller.signal,
      redirect: "error"
    });
    if (!response.ok) {
      throw new Error(`Cloudinary upload rejected with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      public_id?: unknown;
      bytes?: unknown;
      type?: unknown;
    };
    const returnedPublicId =
      typeof payload.public_id === "string" && payload.public_id.startsWith(`${CLOUDINARY_UPLOAD_FOLDER_ROOT}/`)
        ? payload.public_id
        : `${folder}/${leafId}`;
    return {
      key: encodeCloudinaryKey(resourceType, returnedPublicId),
      resourceType,
      publicId: returnedPublicId,
      bytes: typeof payload.bytes === "number" ? payload.bytes : buffer.byteLength
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Short-lived server HMAC signing for local-disk fallback & protected proxy
// ---------------------------------------------------------------------------

function signLocalContentPayload(assetId: string, expSec: number, secret = env.JWT_ACCESS_SECRET): string {
  return createHmac("sha256", secret).update(`midyaf:file-asset:${assetId}:${expSec}`).digest("hex");
}

export function buildSignedLocalContentUrl(
  assetId: string,
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
  nowMs = Date.now(),
  secret = env.JWT_ACCESS_SECRET
): { url: string; expiresAt: string } {
  const expSec = Math.floor(nowMs / 1000) + Math.max(30, Math.min(3600, ttlSeconds));
  const sig = signLocalContentPayload(assetId, expSec, secret);
  return {
    url: `/api/file-assets/${encodeURIComponent(assetId)}/content?exp=${expSec}&sig=${sig}`,
    expiresAt: new Date(expSec * 1000).toISOString()
  };
}

export function verifySignedLocalContentParams(
  assetId: string,
  expRaw: unknown,
  sigRaw: unknown,
  nowMs = Date.now(),
  secret = env.JWT_ACCESS_SECRET
): boolean {
  if (typeof expRaw !== "string" || typeof sigRaw !== "string") return false;
  if (!/^\d{9,12}$/.test(expRaw) || !/^[a-f0-9]{64}$/i.test(sigRaw)) return false;
  const expSec = Number(expRaw);
  if (!Number.isFinite(expSec) || Math.floor(nowMs / 1000) > expSec) return false;
  const expected = signLocalContentPayload(assetId, expSec, secret);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sigRaw.toLowerCase(), "hex"));
}

/**
 * Resolves a short-lived signed delivery URL for an already-authorized FileAsset.
 * External/demo static paths (not `/uploads/` or `/api/file-assets/`) stay untouched.
 */
export function resolveSignedFileAssetUrl(
  asset: { id: string; key: string; url: string },
  options: {
    config?: CloudinaryConfig | null;
    ttlSeconds?: number;
    nowMs?: number;
    secret?: string;
  } = {}
): { url: string; expiresAt: string | null; storage: "cloudinary" | "local" | "external" } {
  const ttlSeconds = options.ttlSeconds ?? SIGNED_URL_TTL_SECONDS;
  const nowMs = options.nowMs ?? Date.now();
  const parsedCloud = parseCloudinaryKey(asset.key);
  if (parsedCloud) {
    const config = options.config !== undefined ? options.config : resolveCloudinaryConfig();
    if (config) {
      const signed = buildCloudinaryPrivateDownloadUrl(
        config,
        parsedCloud.resourceType,
        parsedCloud.publicId,
        ttlSeconds,
        nowMs
      );
      return { ...signed, storage: "cloudinary" };
    }
    // Cloudinary key stored, but server has no key in this environment: fall back to protected content route.
    const signed = buildSignedLocalContentUrl(asset.id, ttlSeconds, nowMs, options.secret);
    return { ...signed, storage: "cloudinary" };
  }

  // Keep external or non-upload static demo assets (e.g., /icons/... or https://...) untouched.
  if (
    asset.url &&
    !asset.url.startsWith("/uploads/") &&
    !asset.url.startsWith("/api/file-assets/")
  ) {
    return { url: asset.url, expiresAt: null, storage: "external" };
  }

  const signed = buildSignedLocalContentUrl(asset.id, ttlSeconds, nowMs, options.secret);
  return { ...signed, storage: "local" };
}

export function hydrateSignedFileAsset<T extends { id: string; key: string; url: string }>(
  asset: T,
  options?: Parameters<typeof resolveSignedFileAssetUrl>[1]
): T {
  const resolved = resolveSignedFileAssetUrl(asset, options);
  return {
    ...asset,
    url: resolved.url
  };
}
