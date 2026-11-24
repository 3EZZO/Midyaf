import path from "node:path";
import express, { type Express } from "express";

const NO_CACHE_BASENAMES = new Set([
  "index.html",
  "sw.js",
  "sw-push.js",
  "manifest.webmanifest",
  "rtl-init.js"
]);

/**
 * Audit Batch C1:
 * - Content-hashed Vite files under `/assets/*` are immutable for 1 year so
 *   browsers and Cloudflare edge cache them without revalidating on every visit.
 * - Entrypoints (`index.html`, `sw.js`, `sw-push.js`, `manifest.webmanifest`)
 *   stay `no-cache` so deployments and PWA updates propagate immediately.
 */
export function mountClientStatic(app: Express, clientDist: string): void {
  app.use(
    "/assets",
    express.static(path.join(clientDist, "assets"), {
      maxAge: "1y",
      immutable: true
    })
  );

  app.use(
    express.static(clientDist, {
      maxAge: "1d",
      setHeaders: (res, filePath) => {
        if (NO_CACHE_BASENAMES.has(path.basename(filePath))) {
          res.setHeader("Cache-Control", "no-cache");
        }
      }
    })
  );

  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}
