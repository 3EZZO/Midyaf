import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mountClientStatic } from "./staticAssets.js";

describe("mountClientStatic (Audit Batch C1)", () => {
  let tempDist = "";
  let server: http.Server;
  let baseUrl = "";

  beforeAll(async () => {
    tempDist = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-static-test-"));
    fs.mkdirSync(path.join(tempDist, "assets"), { recursive: true });
    fs.writeFileSync(path.join(tempDist, "index.html"), "<!doctype html><html></html>", "utf8");
    fs.writeFileSync(path.join(tempDist, "sw.js"), "// sw", "utf8");
    fs.writeFileSync(path.join(tempDist, "manifest.webmanifest"), "{}", "utf8");
    fs.writeFileSync(path.join(tempDist, "assets", "index-abc123.js"), "console.log(1);", "utf8");

    const app = express();
    mountClientStatic(app, tempDist);

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
    fs.rmSync(tempDist, { recursive: true, force: true });
  });

  it("serves hashed /assets/* as immutable 1-year cache", async () => {
    const res = await fetch(`${baseUrl}/assets/index-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("keeps index.html, SPA fallback, sw.js, and manifest.webmanifest no-cache", async () => {
    for (const p of ["/", "/some-spa-route", "/sw.js", "/manifest.webmanifest"]) {
      const res = await fetch(`${baseUrl}${p}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-cache");
    }
  });
});
