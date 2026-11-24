import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().default("dev-access-secret"),
  JWT_REFRESH_SECRET: z.string().default("dev-refresh-secret"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OSRM_BASE_URL: z.string().url().optional(),
  WEATHER_BASE_URL: z.string().url().optional(),
  // Reverse-proxy hops in front of Express. Measured live on Render (2026-11-24):
  // socket + 2 proxies + client, so 3 hops yields the real client IP on every call
  // while a client-supplied X-Forwarded-For prefix is never trusted (4 would be).
  // Override in Render only if the platform topology changes.
  TRUST_PROXY_HOPS: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(5).default(3)),
  // Plan Ready 1 · Sprint 2: transactional email (Brevo). Inert unless both are set.
  // Empty strings (e.g. a blank Render value) count as unset so they never crash boot.
  BREVO_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  MAIL_FROM_EMAIL: z.preprocess(blankToUndefined, z.string().email().optional()),
  MAIL_FROM_NAME: z.preprocess(blankToUndefined, z.string().default("Midyaf")),
  // Public origin for links in emails; defaults to the first CLIENT_ORIGIN.
  PUBLIC_APP_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  ENABLE_CITY: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  DEFAULT_CITY: z.string().default("riyadh"),
  COMMISSION_DEFAULT_PERCENT: z.coerce.number().default(12),
  AWS_REGION: z.string().default("me-south-1"),
  AWS_S3_BUCKET: z.string().default("midyaf-assets"),
  // PLAN_READY_1 Sprint 2: optional dedicated least-privilege Cloudinary credentials
  // (configured in Render; inert local-disk fallback when unset).
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  HYPERPAY_ENTITY_ID: z.string().optional(),
  HYPERPAY_ACCESS_TOKEN: z.string().optional(),
  HYPERPAY_BASE_URL: z.string().default("https://eu-test.oppwa.com"),
  // PLAN_READY_1 Sprint 4: optional Sentry Free DSN (inert when unset or blank).
  SENTRY_DSN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional()
  ),
  // PLAN_READY_1 Sprint 3: optional VAPID keys for $0 Native Web Push (inert when unset).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:ops@midyaf.sa"),
  // SIX-TASKS #6: one-click investor demo (persona switching + reset). Off
  // unless explicitly "true"; switching still needs a signed-in Super Admin.
  DEMO_MODE_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value === "true")
});

export const env = schema.parse(process.env);
