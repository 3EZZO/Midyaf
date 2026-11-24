import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DemoStatusDto } from "@shared/demo";
import {
  DEMO_GUIDE_HINT_KEY,
  isJwtExpired,
  loadDemoStatusIfFresh,
  readDemoGuideHint,
  shouldFetchDemoStatus,
  writeDemoGuideHint
} from "./demoGuideHint";
import {
  InvestorStoryGuide,
  InvestorStoryGuidePlaceholder
} from "../shell/InvestorStoryGuide";

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.sig`;
}

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    }
  };
}

const activeDemoStatus: DemoStatusDto = {
  enabled: true,
  canSwitch: true,
  canReset: true,
  activePersona: "admin",
  origin: null,
  personas: [],
  baselineCapturedAt: null,
  lastResetAt: null
};

describe("demoGuideHint + expired-token demo/status guard", () => {
  it("persists and clears midyaf.demoGuideHint cleanly", () => {
    const storage = makeStorage();
    expect(readDemoGuideHint(storage)).toBe(false);

    writeDemoGuideHint(true, storage);
    expect(storage.getItem(DEMO_GUIDE_HINT_KEY)).toBe("1");
    expect(readDemoGuideHint(storage)).toBe(true);

    writeDemoGuideHint(false, storage);
    expect(storage.getItem(DEMO_GUIDE_HINT_KEY)).toBeNull();
    expect(readDemoGuideHint(storage)).toBe(false);
  });

  it("detects expired JWTs with clock skew while allowing valid or stub tokens", () => {
    const nowMs = 1_800_000_000_000;
    const nowSec = Math.floor(nowMs / 1000);

    expect(isJwtExpired(makeJwt({ exp: nowSec - 60 }), nowMs)).toBe(true);
    expect(isJwtExpired(makeJwt({ exp: nowSec + 3 }), nowMs)).toBe(true); // within 5s skew
    expect(isJwtExpired(makeJwt({ exp: nowSec + 600 }), nowMs)).toBe(false);
    expect(isJwtExpired("plain-test-token", nowMs)).toBe(false);
    expect(isJwtExpired("not.valid-json.sig", nowMs)).toBe(false);
  });

  it("skips GET /api/demo/status when the stored access token is expired without clearing the hint", async () => {
    const nowMs = 1_800_000_000_000;
    const expiredJwt = makeJwt({ exp: Math.floor(nowMs / 1000) - 120 });
    const storage = makeStorage({ [DEMO_GUIDE_HINT_KEY]: "1" });
    const fetcher = vi.fn(async () => activeDemoStatus);

    const session = {
      accessToken: expiredJwt,
      user: { onboardingPending: false }
    } as Parameters<typeof shouldFetchDemoStatus>[0];

    expect(shouldFetchDemoStatus(session, nowMs)).toBe(false);

    const outcome = await loadDemoStatusIfFresh(session, fetcher, { nowMs, storage });
    expect(outcome).toEqual({ skipped: true });
    expect(fetcher).not.toHaveBeenCalled();
    // Hint stays preserved so the collapsed placeholder holds layout space until refresh completes.
    expect(readDemoGuideHint(storage)).toBe(true);
  });

  it("calls GET /api/demo/status once with a fresh token, sets hint when enabled, and clears when disabled", async () => {
    const nowMs = 1_800_000_000_000;
    const freshJwt = makeJwt({ exp: Math.floor(nowMs / 1000) + 900 });
    const storage = makeStorage();
    const session = {
      accessToken: freshJwt,
      user: { onboardingPending: false }
    } as Parameters<typeof shouldFetchDemoStatus>[0];

    const fetcherEnabled = vi.fn(async () => activeDemoStatus);
    const enabledRes = await loadDemoStatusIfFresh(session, fetcherEnabled, { nowMs, storage });
    expect(fetcherEnabled).toHaveBeenCalledTimes(1);
    expect(enabledRes).toEqual({
      skipped: false,
      status: activeDemoStatus,
      activeGuide: true
    });
    expect(readDemoGuideHint(storage)).toBe(true);

    // When server returns 404 (null -> DEMO_MODE off), hint is cleared.
    const fetcherDisabled = vi.fn(async () => null);
    const disabledRes = await loadDemoStatusIfFresh(session, fetcherDisabled, { nowMs, storage });
    expect(fetcherDisabled).toHaveBeenCalledTimes(1);
    expect(disabledRes).toEqual({
      skipped: false,
      status: null,
      activeGuide: false
    });
    expect(readDemoGuideHint(storage)).toBe(false);
  });

  it("keeps structural parity between collapsed InvestorStoryGuide and InvestorStoryGuidePlaceholder", () => {
    for (const isArabic of [true, false]) {
      const liveHtml = renderToStaticMarkup(
        <InvestorStoryGuide
          status={activeDemoStatus}
          portal="admin"
          isArabic={isArabic}
          onSwitchPersona={() => {}}
          onSelectPortal={() => {}}
          onOpenShortcuts={() => {}}
        />
      );
      const placeholderHtml = renderToStaticMarkup(
        <InvestorStoryGuidePlaceholder isArabic={isArabic} />
      );

      expect(placeholderHtml).toContain("data-investor-story-guide-placeholder");
      expect(placeholderHtml).toContain('aria-hidden="true"');
      expect(placeholderHtml).toContain("inert");

      const sharedClasses = [
        "border-b border-hairline bg-surface-1/95 px-4 py-1.5 text-xs lg:px-6",
        "mx-auto max-w-7xl",
        "flex flex-wrap items-center justify-between gap-2",
        "inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-semibold",
        "hidden items-center gap-1.5 rounded-md border border-hairline bg-surface-2 px-2 py-1 text-xs font-medium"
      ];
      for (const cls of sharedClasses) {
        expect(liveHtml).toContain(cls);
        expect(placeholderHtml).toContain(cls);
      }

      const expectedLabel = isArabic ? "دليل عرض المستثمرين" : "Investor Story Guide";
      const expectedSubtitle = isArabic ? "· 4 خطوات تفاعلية" : "· 4 guided chapters";
      expect(liveHtml).toContain(expectedLabel);
      expect(placeholderHtml).toContain(expectedLabel);
      expect(liveHtml).toContain(expectedSubtitle);
      expect(placeholderHtml).toContain(expectedSubtitle);
    }
  });
});
