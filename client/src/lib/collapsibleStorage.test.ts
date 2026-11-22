import { describe, expect, it } from "vitest";
import {
  RAIL_STORAGE_KEY,
  navGroupStorageKey,
  readCollapsed,
  sectionStorageKey,
  toggleCollapsed,
  writeCollapsed,
  type StorageLike
} from "./collapsibleStorage";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    }
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("SecurityError: storage disabled");
    },
    setItem: () => {
      throw new Error("QuotaExceededError: private mode");
    }
  };
}

describe("collapsibleStorage keys", () => {
  it("builds stable namespaced keys for rail, sections and nav groups", () => {
    expect(RAIL_STORAGE_KEY).toBe("midyaf.nav.rail");
    expect(sectionStorageKey("admin-tabs")).toBe("midyaf.section.admin-tabs");
    expect(sectionStorageKey("  section / weird id!!  ")).toBe("midyaf.section.section-weird-id");
    expect(sectionStorageKey("   ")).toBe("midyaf.section.default");
    expect(navGroupStorageKey("event-tabs")).toBe("midyaf.nav.event-tabs");
  });
});

describe("collapsibleStorage read/write/toggle", () => {
  it("reads persisted collapsed and expanded values and falls back on missing or invalid entries", () => {
    const storage = memoryStorage({
      "midyaf.nav.rail": "collapsed",
      "midyaf.section.open": "expanded",
      "midyaf.section.boolTrue": "true",
      "midyaf.section.boolFalse": "0",
      "midyaf.section.corrupt": "unexpected-value"
    });

    expect(readCollapsed("midyaf.nav.rail", false, storage)).toBe(true);
    expect(readCollapsed("midyaf.section.open", true, storage)).toBe(false);
    expect(readCollapsed("midyaf.section.boolTrue", false, storage)).toBe(true);
    expect(readCollapsed("midyaf.section.boolFalse", true, storage)).toBe(false);
    expect(readCollapsed("midyaf.section.corrupt", true, storage)).toBe(true);
    expect(readCollapsed("midyaf.section.missing", false, storage)).toBe(false);
    expect(readCollapsed("", true, storage)).toBe(true);
  });

  it("writes and toggles state cleanly in storage", () => {
    const storage = memoryStorage();

    expect(writeCollapsed(RAIL_STORAGE_KEY, true, storage)).toBe(true);
    expect(storage.store.get(RAIL_STORAGE_KEY)).toBe("collapsed");
    expect(readCollapsed(RAIL_STORAGE_KEY, false, storage)).toBe(true);

    const next = toggleCollapsed(RAIL_STORAGE_KEY, true, storage);
    expect(next).toBe(false);
    expect(storage.store.get(RAIL_STORAGE_KEY)).toBe("expanded");
    expect(readCollapsed(RAIL_STORAGE_KEY, true, storage)).toBe(false);
  });

  it("handles SSR (null storage) and private browsing (throwing storage) without throwing", () => {
    expect(readCollapsed(RAIL_STORAGE_KEY, false, null)).toBe(false);
    expect(readCollapsed(RAIL_STORAGE_KEY, true, null)).toBe(true);
    expect(writeCollapsed(RAIL_STORAGE_KEY, true, null)).toBe(false);
    expect(toggleCollapsed(RAIL_STORAGE_KEY, false, null)).toBe(true);

    const blocked = throwingStorage();
    expect(readCollapsed(RAIL_STORAGE_KEY, false, blocked)).toBe(false);
    expect(readCollapsed(RAIL_STORAGE_KEY, true, blocked)).toBe(true);
    expect(writeCollapsed(RAIL_STORAGE_KEY, true, blocked)).toBe(false);
    expect(toggleCollapsed(RAIL_STORAGE_KEY, false, blocked)).toBe(true);
  });

  it("resolves safely in Node SSR without window", () => {
    expect(readCollapsed(RAIL_STORAGE_KEY, false)).toBe(false);
    expect(writeCollapsed(RAIL_STORAGE_KEY, true)).toBe(false);
  });
});
