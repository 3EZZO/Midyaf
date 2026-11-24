import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PERMISSIONS_POLICY,
  apiNoStoreMiddleware,
  buildHelmetOptions,
  permissionsPolicyMiddleware
} from "./securityHeaders.js";

describe("Audit Batch A security headers (CSP, frameguard, Permissions-Policy, API no-store)", () => {
  let server: http.Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.use(helmet(buildHelmetOptions()));
    app.use(permissionsPolicyMiddleware);
    app.use("/api", apiNoStoreMiddleware);
    app.get("/", (_req, res) => res.type("html").send("<!doctype html><html></html>"));
    app.get("/api/ping", (_req, res) => res.json({ ok: true }));
    app.get("/api/custom-cache", (_req, res) => {
      res.setHeader("Cache-Control", "private, max-age=60");
      res.json({ ok: true });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("enforces strict CSP, X-Frame-Options DENY, and Permissions-Policy on HTML responses", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);

    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("https://res.cloudinary.com");
    expect(csp).toContain("https://server.arcgisonline.com");
    expect(csp).toContain("https://services.arcgisonline.com");
    expect(csp).toContain("wss:");

    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("permissions-policy")).toBe(PERMISSIONS_POLICY);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("sets Cache-Control: no-store on /api routes without clobbering route-specific headers", async () => {
    const apiRes = await fetch(`${baseUrl}/api/ping`);
    expect(apiRes.status).toBe(200);
    expect(apiRes.headers.get("cache-control")).toBe("no-store");
    expect(apiRes.headers.get("permissions-policy")).toBe(PERMISSIONS_POLICY);

    const customRes = await fetch(`${baseUrl}/api/custom-cache`);
    expect(customRes.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it("moves the RTL bootstrap script out of client/index.html so script-src 'self' holds", () => {
    const root = process.cwd();
    const html = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
    expect(html).toContain('<script src="/rtl-init.js"></script>');
    // Every <script> tag must have a src attribute (zero inline scripts).
    const scriptTags = [...html.matchAll(/<script\b([^>]*)>/gi)];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const match of scriptTags) {
      expect(match[1]).toMatch(/\bsrc=/i);
    }

    const rtlInit = fs.readFileSync(path.join(root, "client/public/rtl-init.js"), "utf8");
    expect(rtlInit).toContain('localStorage.getItem("midyaf.lang")');
    expect(rtlInit).toContain("root.dir");
  });
});
