import type { NextFunction, Request, Response } from "express";
import type { HelmetOptions } from "helmet";

/**
 * Audit Batch A (Security Hardening):
 * - Enforced Content-Security-Policy (no inline scripts; RTL init moved to /rtl-init.js).
 * - Explicit allowlist for Esri ArcGIS map tiles, Cloudinary signed assets, and WebSocket realtime.
 * - Clickjacking lockdown via both `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
 * - Permissions-Policy restricting unused hardware APIs while preserving `geolocation=(self)` for Captains.
 * - `Cache-Control: no-store` on API responses so sensitive JSON never sits in shared/browser caches.
 */

export const PERMISSIONS_POLICY =
  "geolocation=(self), camera=(), microphone=(), payment=()";

export function buildHelmetOptions(): HelmetOptions {
  return {
    frameguard: { action: "deny" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://server.arcgisonline.com",
          "https://services.arcgisonline.com"
        ],
        fontSrc: ["'self'", "data:"],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          "https://server.arcgisonline.com",
          "https://services.arcgisonline.com",
          "https://res.cloudinary.com"
        ],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  };
}

export function permissionsPolicyMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  next();
}

export function apiNoStoreMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (!res.getHeader("Cache-Control")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
}
