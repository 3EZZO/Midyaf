import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceResourceCache,
  fetchWorkspaceResource,
  workspaceRequest
} from "./workspaceApi";
import { clearPushConfigCache, fetchPushConfig } from "./webPush";

afterEach(() => {
  clearWorkspaceResourceCache();
  clearPushConfigCache();
  vi.restoreAllMocks();
});

describe("Request deduplication (Audit Batch C4)", () => {
  it("coalesces concurrent and sequential /workspace/events reads and invalidates on revision or mutation", async () => {
    let calls = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      return new Response(JSON.stringify({ events: [{ id: `evt_${calls}` }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    // 3 concurrent consumers share 1 network call.
    const [a, b, c] = await Promise.all([
      fetchWorkspaceResource("tok_1", "/events", 0),
      fetchWorkspaceResource("tok_1", "/events", 0),
      fetchWorkspaceResource("tok_1", "/events", 0)
    ]);
    expect(calls).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);

    // Subsequent read within TTL reuses cached value.
    const d = await fetchWorkspaceResource("tok_1", "/events", 0);
    expect(calls).toBe(1);
    expect(d).toEqual(a);

    // Revision bump triggers a fresh fetch.
    await fetchWorkspaceResource("tok_1", "/events", 1);
    expect(calls).toBe(2);

    // A mutating workspaceRequest clears the cache so the next read fetches fresh.
    await workspaceRequest("tok_1", "/events/evt_1/status", { operationalStatus: "ACTIVE" });
    expect(calls).toBe(3);
    await fetchWorkspaceResource("tok_1", "/events", 1);
    expect(calls).toBe(4);

    fetchSpy.mockRestore();
  });

  it("memoizes fetchPushConfig per access token and evicts failed requests for retry", async () => {
    let calls = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { message: "temp error" } }), { status: 503 });
      }
      return new Response(JSON.stringify({ enabled: true, publicKey: "BP_KEY" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    // First call fails and is NOT cached.
    await expect(fetchPushConfig("tok_push")).rejects.toThrow();
    expect(calls).toBe(1);

    // Retry succeeds and subsequent calls reuse the memoized promise.
    const [r1, r2] = await Promise.all([
      fetchPushConfig("tok_push"),
      fetchPushConfig("tok_push")
    ]);
    const r3 = await fetchPushConfig("tok_push");
    expect(calls).toBe(2);
    expect(r1).toEqual({ enabled: true, publicKey: "BP_KEY" });
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);

    // Different token fetches independently.
    await fetchPushConfig("tok_other");
    expect(calls).toBe(3);

    fetchSpy.mockRestore();
  });
});
