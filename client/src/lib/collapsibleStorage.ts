import { useCallback, useEffect, useState } from "react";

export type StorageLike = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem">>;

export const RAIL_STORAGE_KEY = "midyaf.nav.rail";

function sanitizeStorageSegment(id: string): string {
  const cleaned = id.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "default";
}

/** Namespaced localStorage key for a collapsible dashboard section or nav group. */
export function sectionStorageKey(id: string): string {
  return `midyaf.section.${sanitizeStorageSegment(id)}`;
}

/** Namespaced localStorage key for a collapsible navigation group. */
export function navGroupStorageKey(id: string): string {
  return `midyaf.nav.${sanitizeStorageSegment(id)}`;
}

/**
 * Safely resolves `window.localStorage`. Returns `null` during SSR or when
 * browser privacy settings block storage access.
 */
export function resolveLocalStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

/**
 * Reads a persisted collapsed boolean from storage.
 * Accepts "collapsed"/"expanded" as well as "true"/"false"/"1"/"0".
 * Falls back to `defaultCollapsed` when absent, invalid, or storage throws.
 */
export function readCollapsed(
  key: string,
  defaultCollapsed = false,
  storage: StorageLike | null | undefined = undefined
): boolean {
  if (!key) return defaultCollapsed;
  const target = storage === undefined ? resolveLocalStorage() : storage;
  if (!target) return defaultCollapsed;
  try {
    const raw = target.getItem(key);
    if (raw === null) return defaultCollapsed;
    const normalized = raw.trim().toLowerCase();
    if (normalized === "collapsed" || normalized === "true" || normalized === "1") return true;
    if (normalized === "expanded" || normalized === "false" || normalized === "0") return false;
    return defaultCollapsed;
  } catch {
    return defaultCollapsed;
  }
}

/**
 * Persists a collapsed boolean as "collapsed" or "expanded".
 * Returns true if the write succeeded, false if storage is unavailable or throws.
 */
export function writeCollapsed(
  key: string,
  collapsed: boolean,
  storage: StorageLike | null | undefined = undefined
): boolean {
  if (!key) return false;
  const target = storage === undefined ? resolveLocalStorage() : storage;
  if (!target) return false;
  try {
    target.setItem(key, collapsed ? "collapsed" : "expanded");
    return true;
  } catch {
    return false;
  }
}

/** Toggles collapsed state, persists it when possible, and returns the new state. */
export function toggleCollapsed(
  key: string,
  currentCollapsed: boolean,
  storage: StorageLike | null | undefined = undefined
): boolean {
  const next = !currentCollapsed;
  writeCollapsed(key, next, storage);
  return next;
}

/**
 * React state hook backed by guarded localStorage persistence.
 * Safe in SSR (`renderToStaticMarkup`) and private browsing mode.
 */
export function usePersistedCollapse(
  key: string | null | undefined,
  defaultCollapsed = false
) {
  const [collapsed, setCollapsedState] = useState<boolean>(() =>
    key ? readCollapsed(key, defaultCollapsed) : defaultCollapsed
  );

  useEffect(() => {
    if (!key) return;
    setCollapsedState(readCollapsed(key, defaultCollapsed));
  }, [key, defaultCollapsed]);

  const setCollapsed = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setCollapsedState((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        if (key) writeCollapsed(key, resolved);
        return resolved;
      });
    },
    [key]
  );

  const toggle = useCallback(() => {
    setCollapsed((current) => !current);
  }, [setCollapsed]);

  return { collapsed, setCollapsed, toggle } as const;
}
