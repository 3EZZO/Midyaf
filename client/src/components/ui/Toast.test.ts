import { describe, expect, it, vi } from "vitest";

vi.mock("virtual:pwa-register", () => ({
  registerSW: vi.fn()
}));

import {
  isPersistentToast,
  retainPersistentToasts,
  upsertToastList,
  type ToastItem
} from "./Toast";
import { PWA_UPDATE_TOAST_ID, pwaUpdateToastCopy } from "../PwaUpdateBanner";

describe("Toast deduplication and locale-switch lifecycle", () => {
  it("replaces an existing toast with the same id in place instead of stacking", () => {
    const initial: ToastItem[] = [
      { id: "demo-role-switch", title: "Switched demo role", message: "Client", type: "success", duration: 2500 },
      { id: "other", title: "Saved", type: "info", duration: 3400 }
    ];

    const updated = upsertToastList(initial, {
      id: "demo-role-switch",
      title: "Switched demo role",
      message: "Captains",
      type: "success",
      duration: 2500
    });

    expect(updated).toHaveLength(2);
    expect(updated[0].message).toBe("Captains");
    expect(updated[1].id).toBe("other");
  });

  it("caps transient toasts to 4 while preserving persistent toasts", () => {
    const pwaToast: ToastItem = {
      id: PWA_UPDATE_TOAST_ID,
      title: "New Operational Build Ready",
      type: "info",
      duration: 0,
      persistent: true
    };
    let list: ToastItem[] = [pwaToast];
    for (let i = 1; i <= 5; i++) {
      list = upsertToastList(list, {
        id: `t-${i}`,
        title: `Notice ${i}`,
        type: "info",
        duration: 3400
      });
    }
    expect(list).toHaveLength(4);
    expect(list.some((t) => t.id === PWA_UPDATE_TOAST_ID)).toBe(true);
    expect(list.map((t) => t.id)).toEqual([PWA_UPDATE_TOAST_ID, "t-3", "t-4", "t-5"]);
  });

  it("clears transient opposite-language toasts while keeping persistent PWA update toasts", () => {
    const mixed: ToastItem[] = [
      { id: "demo-role-switch", title: "تم تبديل دور العرض", type: "success", duration: 2500 },
      { id: PWA_UPDATE_TOAST_ID, title: "New Operational Build Ready", type: "info", duration: 0, persistent: true },
      { id: "demo-data-reset", title: "Demo data reset", type: "success", duration: 3400 }
    ];

    expect(isPersistentToast(mixed[0])).toBe(false);
    expect(isPersistentToast(mixed[1])).toBe(true);
    expect(isPersistentToast({ duration: 0 })).toBe(true);

    const remaining = retainPersistentToasts(mixed);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(PWA_UPDATE_TOAST_ID);
  });

  it("provides bilingual PWA update prompt copy for locale re-rendering", () => {
    expect(pwaUpdateToastCopy(false).title).toBe("New Operational Build Ready");
    expect(pwaUpdateToastCopy(false).actionLabel).toBe("Update Now");
    expect(pwaUpdateToastCopy(true).title).toBe("تحديث تشغيلي فوري متاح");
    expect(pwaUpdateToastCopy(true).actionLabel).toBe("تحديث الآن");
  });
});
