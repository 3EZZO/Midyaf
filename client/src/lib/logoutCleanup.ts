import { DEMO_GUIDE_HINT_KEY } from "./demoGuideHint";

/**
 * Clears all session-scoped user caches on logout so a subsequent user sharing
 * the same device/browser tab cannot inspect prior operational snapshots.
 */
export function clearLogoutSessionStorage(
  storage: Pick<Storage, "length" | "key" | "removeItem"> | undefined,
  userId?: string | null
): void {
  if (!storage) return;
  try {
    if (userId) {
      storage.removeItem(`midyaf_data_${userId}`);
    }
    storage.removeItem("midyaf.demoPersonas");
    storage.removeItem(DEMO_GUIDE_HINT_KEY);

    // Sweep any stale per-user bootstrap snapshots (e.g. after demo persona switches).
    const staleKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith("midyaf_data_")) {
        staleKeys.push(k);
      }
    }
    for (const k of staleKeys) {
      storage.removeItem(k);
    }
  } catch {
    // Restricted storage contexts must never prevent logout.
  }
}
