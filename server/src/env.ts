import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

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
  ENABLE_CITY: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  DEFAULT_CITY: z.string().default("riyadh"),
  COMMISSION_DEFAULT_PERCENT: z.coerce.number().default(12),
  AWS_REGION: z.string().default("me-south-1"),
  AWS_S3_BUCKET: z.string().default("midyaf-assets"),
  HYPERPAY_ENTITY_ID: z.string().optional(),
  HYPERPAY_ACCESS_TOKEN: z.string().optional(),
  HYPERPAY_BASE_URL: z.string().default("https://eu-test.oppwa.com"),
  // PLAN_READY_1 Sprint 4: optional Sentry Free DSN (inert when unset or blank).
  SENTRY_DSN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional()
  ),
  // SIX-TASKS #6: one-click investor demo (persona switching + reset). Off
  // unless explicitly "true"; switching still needs a signed-in Super Admin.
  DEMO_MODE_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value === "true")
});

export const env = schema.parse(process.env);
