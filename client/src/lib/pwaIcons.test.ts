import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.join(CLIENT_ROOT, "public");

describe("PWA & phone home-screen icon assets (v2 cache-busted Open-Courtyard M)", () => {
  it("ships all versioned icon assets and multi-size favicon.ico matching the updated brand masters", () => {
    const pairs: Array<[string, string]> = [
      ["icons/apple-touch-icon-v2.png", "apple-touch-icon.png"],
      ["icons/pwa-192x192-v2.png", "pwa-192x192.png"],
      ["icons/pwa-512x512-v2.png", "pwa-512x512.png"],
      ["icons/pwa-maskable-512x512-v2.png", "pwa-maskable-512x512.png"],
      ["icons/favicon-v2.svg", "favicon.svg"],
      ["icons/favicon-v2.png", "favicon.png"]
    ];

    for (const [versioned, rootFallback] of pairs) {
      const vPath = path.join(PUBLIC_DIR, versioned);
      const rPath = path.join(PUBLIC_DIR, rootFallback);
      expect(fs.existsSync(vPath), `Missing ${versioned}`).toBe(true);
      expect(fs.existsSync(rPath), `Missing ${rootFallback}`).toBe(true);
      const vBytes = fs.readFileSync(vPath);
      const rBytes = fs.readFileSync(rPath);
      expect(vBytes.length).toBeGreaterThan(200);
      expect(vBytes.equals(rBytes)).toBe(true);
    }

    const icoPath = path.join(PUBLIC_DIR, "favicon.ico");
    expect(fs.existsSync(icoPath)).toBe(true);
    const icoHeader = fs.readFileSync(icoPath).subarray(0, 4);
    // Standard ICO magic header: 00 00 01 00
    expect([...icoHeader]).toEqual([0, 0, 1, 0]);
  });

  it("references versioned v2 icons in index.html and vite.config.ts PWA manifest", () => {
    const html = fs.readFileSync(path.join(CLIENT_ROOT, "index.html"), "utf8");
    expect(html).toContain('href="/icons/apple-touch-icon-v2.png"');
    expect(html).toContain('sizes="180x180"');
    expect(html).toContain('href="/icons/favicon-v2.svg"');
    expect(html).toContain('href="/icons/favicon-v2.png"');
    expect(html).toContain('href="/favicon.ico?v=2"');

    const viteCfg = fs.readFileSync(path.join(CLIENT_ROOT, "vite.config.ts"), "utf8");
    expect(viteCfg).toContain('src: "/icons/pwa-192x192-v2.png"');
    expect(viteCfg).toContain('src: "/icons/pwa-512x512-v2.png"');
    expect(viteCfg).toContain('src: "/icons/pwa-maskable-512x512-v2.png"');
    expect(viteCfg).toContain('purpose: "any"');
    expect(viteCfg).toContain('purpose: "maskable"');
  });
});
