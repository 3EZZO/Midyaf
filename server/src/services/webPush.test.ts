import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));
vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const {
  isWebPushConfigured,
  pushSubscriptionInputSchema,
  resolveWebPushConfig,
  savePushSubscription,
  sendWebPushToUser
} = await import("./webPush.js");
const notificationsRouter = (await import("../routes/notifications.js")).default;

const actors = {
  cap: { id: "u_cap", email: "cap@example.test", role: Role.DRIVER },
  guest: { id: "u_guest", email: "guest@example.test", role: Role.GUEST }
};

let http: Harness;

beforeAll(async () => {
  http = await startHarness([["/notifications", notificationsRouter]]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  memory.current.seed({
    user: [
      { id: "u_cap", name: "Captain", email: "cap@example.test", phone: "+966500000001", role: Role.DRIVER, language: "en", avatar: null, passwordHash: "x", onboardingPending: false, onboardingKind: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "u_guest", name: "Guest", email: "guest@example.test", phone: "+966500000002", role: Role.GUEST, language: "en", avatar: null, passwordHash: "x", onboardingPending: false, onboardingKind: null, createdAt: new Date(), updatedAt: new Date() }
    ],
    pushSubscription: [],
    notification: []
  });
});

describe("Web Push VAPID service & routes (PLAN_READY_1 Sprint 3)", () => {
  it("stays completely inert when VAPID keys are unset", async () => {
    expect(resolveWebPushConfig({})).toBeNull();
    expect(isWebPushConfigured({})).toBe(false);

    const configRes = await http.get("/notifications/push/config", actors.cap);
    expect(configRes.status).toBe(200);
    expect(configRes.body).toEqual({ enabled: false, publicKey: null });

    const subRes = await http.post("/notifications/push/subscribe", actors.cap, {
      endpoint: "https://fcm.googleapis.com/fcm/send/sample",
      keys: { p256dh: "B".repeat(65), auth: "A".repeat(22) }
    });
    expect(subRes.status).toBe(503);

    const sent = await sendWebPushToUser("u_cap", { title: "Trip", body: "Ready" }, { config: null });
    expect(sent).toEqual({ enabled: false, sent: 0, pruned: 0 });
  });

  it("rejects non-HTTPS, credential-bearing, and localhost push endpoints (SSRF guard)", () => {
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://localhost/push",
      "https://127.0.0.1/push",
      "https://user:pass@fcm.googleapis.com/send/abc",
      "https://internal.service.local/push",
      // Allowlist, not blocklist: private ranges, cloud metadata and arbitrary public hosts are refused.
      "https://10.0.0.5/push",
      "https://192.168.1.10/push",
      "https://169.254.169.254/latest/meta-data",
      "https://attacker.example/push",
      "https://fcm.googleapis.com.attacker.example/push",
      "https://fcm.googleapis.com:8443/fcm/send/abc"
    ]) {
      expect(
        pushSubscriptionInputSchema.safeParse({
          endpoint: bad,
          keys: { p256dh: "B".repeat(65), auth: "A".repeat(22) }
        }).success
      ).toBe(false);
    }

    for (const good of [
      "https://web.push.apple.com/QBSomeEndpoint123",
      "https://fcm.googleapis.com/fcm/send/abc123",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-db5p.notify.windows.com/w/?token=abc"
    ]) {
      expect(
        pushSubscriptionInputSchema.safeParse({
          endpoint: good,
          keys: { p256dh: "B".repeat(65), auth: "A".repeat(22) }
        }).success
      ).toBe(true);
    }
  });

  it("fans out notifications, auto-prunes 410 Gone subscriptions, and enforces per-user delete ownership", async () => {
    await savePushSubscription("u_cap", {
      endpoint: "https://fcm.googleapis.com/fcm/send/active-device",
      keys: { p256dh: "B".repeat(65), auth: "A".repeat(22) }
    });
    await savePushSubscription("u_cap", {
      endpoint: "https://fcm.googleapis.com/fcm/send/expired-device",
      keys: { p256dh: "C".repeat(65), auth: "D".repeat(22) }
    });

    const sender = vi.fn(async (sub: { endpoint: string }, _body: string) => {
      if (sub.endpoint.includes("expired-device")) {
        const err = Object.assign(new Error("Gone"), { statusCode: 410 });
        throw err;
      }
      return { statusCode: 201 };
    });

    const outcome = await sendWebPushToUser(
      "u_cap",
      { title: "New trip assigned", body: "KKIA Terminal 5 -> Four Seasons", url: "https://evil.example" },
      {
        config: { publicKey: "pub", privateKey: "priv", subject: "mailto:ops@midyaf.sa" },
        sender
      }
    );

    expect(outcome).toEqual({ enabled: true, sent: 1, pruned: 1 });
    // External URL was sanitized to relative "/"
    const sentPayload = JSON.parse(String(sender.mock.calls[0][1])) as { url: string; icon: string };
    expect(sentPayload.url).toBe("/");
    expect(sentPayload.icon).toBe("/icons/pwa-192x192-v2.png");
    // Expired 410 subscription was automatically pruned
    expect(memory.current.rows("pushSubscription")).toHaveLength(1);

    // Another user cannot delete Captain's subscription
    const otherDelete = await http.post("/notifications/push/unsubscribe", actors.guest, {
      endpoint: "https://fcm.googleapis.com/fcm/send/active-device"
    });
    expect(otherDelete.status).toBe(200);
    expect(otherDelete.body.removed).toBe(0);
    expect(memory.current.rows("pushSubscription")).toHaveLength(1);

    // Owner CAN delete their own subscription
    const ownDelete = await http.post("/notifications/push/unsubscribe", actors.cap, {
      endpoint: "https://fcm.googleapis.com/fcm/send/active-device"
    });
    expect(ownDelete.status).toBe(200);
    expect(ownDelete.body.removed).toBe(1);
    expect(memory.current.rows("pushSubscription")).toHaveLength(0);
  });
});
