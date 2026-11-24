import { describe, expect, it, vi } from "vitest";
import { clearLogoutSessionStorage } from "./logoutCleanup";
import { logoutSession } from "./api";

function makeMemoryStorage(initial: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    removeItem(k: string) {
      map.delete(k);
    },
    keys() {
      return Array.from(map.keys());
    }
  };
}

describe("logoutCleanup + logoutSession (Audit Batch A2 & A3)", () => {
  it("removes current and stale midyaf_data_* snapshots and midyaf.demoPersonas while keeping unrelated keys", () => {
    const storage = makeMemoryStorage({
      midyaf_data_u_1: '{"users":[]}',
      midyaf_data_u_2: '{"auditLogs":[]}',
      "midyaf.demoPersonas": "1",
      other_app_key: "keep"
    });

    clearLogoutSessionStorage(storage, "u_1");

    expect(storage.getItem("midyaf_data_u_1")).toBeNull();
    expect(storage.getItem("midyaf_data_u_2")).toBeNull();
    expect(storage.getItem("midyaf.demoPersonas")).toBeNull();
    expect(storage.getItem("other_app_key")).toBe("keep");
  });

  it("posts POST /api/auth/logout with bearer token and never throws on network error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await logoutSession("test-access-jwt");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: { Authorization: "Bearer test-access-jwt" }
      })
    );

    fetchSpy.mockRejectedValueOnce(new Error("offline"));
    await expect(logoutSession("test-access-jwt")).resolves.toBeUndefined();
    fetchSpy.mockRestore();
  });
});
