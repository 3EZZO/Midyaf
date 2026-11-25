import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@shared/domain";
import { setApiUnauthorizedHandler } from "./api";
import {
  PUSH_PAUSED_ON_LOGOUT_KEY,
  consumePushPausedOnLogout,
  getActiveBrowserPushSubscription,
  subscribeToWebPush,
  unsubscribeWebPushOnSessionEnd,
  urlBase64ToUint8Array
} from "./webPush";
import { PushNotificationToggle, syncPushToggleState } from "../components/PushNotificationToggle";
import { TooltipProvider } from "../components/ui/Tooltip";

const session = {
  accessToken: "synthetic-token",
  refreshToken: "synthetic-refresh",
  user: {
    id: "u_cap",
    name: "Captain Fahad",
    email: "cap@midyaf.local",
    phone: "+966500000001",
    role: "DRIVER",
    language: "en"
  }
} as unknown as Session;

describe("client Web Push helpers & PushNotificationToggle (PLAN_READY_1 Sprint 3)", () => {
  it("decodes URL-safe base64 VAPID keys into Uint8Array", () => {
    const bytes = urlBase64ToUint8Array("SGVsbG8tV29ybGRf");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString("utf8")).toBe("Hello-World_");
  });

  it("stays hidden when disabled and renders bilingual accessible toggle when enabled", () => {
    expect(
      renderToStaticMarkup(
        <PushNotificationToggle session={session} isArabic={false} initialEnabled={false} />
      )
    ).toBe("");

    const en = renderToStaticMarkup(
      <TooltipProvider>
        <PushNotificationToggle session={session} isArabic={false} initialEnabled={true} />
      </TooltipProvider>
    );
    expect(en).toContain("data-web-push-toggle");
    expect(en).toContain('data-push-state="off"');
    expect(en).toContain("Enable lock-screen alerts");

    const ar = renderToStaticMarkup(
      <TooltipProvider>
        <PushNotificationToggle session={session} isArabic={true} initialEnabled={true} />
      </TooltipProvider>
    );
    expect(ar).toContain("تفعيل إشعارات الجهاز");
  });

  it("sw-push.js enables renotify so repeated/emergency alerts never stay silent", () => {
    const swSource = fs.readFileSync(path.join(process.cwd(), "client/public/sw-push.js"), "utf8");
    expect(swSource).toContain("renotify: true");
  });

  it("unsubscribeWebPushOnSessionEnd uses getRegistration(), always unsubscribes locally, and posts via raw keepalive fetch without apiFetch 401 retry", async () => {
    const unauthorizedHandler = vi.fn(async () => "refreshed-token");
    setApiUnauthorizedHandler(unauthorizedHandler);
    try {
      // No registration: resolves cleanly without hanging.
      const none = await unsubscribeWebPushOnSessionEnd("tok-1", {
        getRegistration: async () => undefined,
        fetchImpl: vi.fn() as unknown as typeof fetch
      });
      expect(none).toEqual({ localUnsubscribed: false, serverNotified: false });

      // Active subscription + server returns 401 (e.g. token already revoked):
      // local unsubscribe STILL succeeds, raw fetch uses keepalive:true, and apiFetch 401 retry NEVER fires.
      const store = new Map<string, string>();
      const fakeStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        }
      };
      const localUnsubscribe = vi.fn(async () => true);
      const fetchImpl = vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
      const on401 = await unsubscribeWebPushOnSessionEnd("expired-token", {
        getRegistration: async () =>
          ({
            pushManager: {
              getSubscription: async () =>
                ({
                  endpoint: "https://fcm.googleapis.com/fcm/send/shared-phone",
                  unsubscribe: localUnsubscribe
                }) as unknown as PushSubscription
            }
          }) as unknown as ServiceWorkerRegistration,
        fetchImpl,
        storage: fakeStorage
      });
      expect(on401).toEqual({ localUnsubscribed: true, serverNotified: false });
      expect(store.get(PUSH_PAUSED_ON_LOGOUT_KEY)).toBe("1");
      expect(consumePushPausedOnLogout(fakeStorage)).toBe(true);
      expect(consumePushPausedOnLogout(fakeStorage)).toBe(false);
      expect(localUnsubscribe).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit
      ];
      expect(url).toContain("/notifications/push/unsubscribe");
      expect(init.method).toBe("POST");
      expect(init.keepalive).toBe(true);
      expect(init.body).toBe(JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/shared-phone" }));
      expect(unauthorizedHandler).not.toHaveBeenCalled();

      // Missing token still unsubscribes locally without calling server.
      const localOnlyUnsub = vi.fn(async () => true);
      const fetchUnused = vi.fn() as unknown as typeof fetch;
      const noTok = await unsubscribeWebPushOnSessionEnd(null, {
        getRegistration: async () =>
          ({
            pushManager: {
              getSubscription: async () =>
                ({
                  endpoint: "https://fcm.googleapis.com/fcm/send/shared-phone",
                  unsubscribe: localOnlyUnsub
                }) as unknown as PushSubscription
            }
          }) as unknown as ServiceWorkerRegistration,
        fetchImpl: fetchUnused
      });
      expect(noTok).toEqual({ localUnsubscribed: true, serverNotified: false });
      expect(fetchUnused).not.toHaveBeenCalled();
    } finally {
      setApiUnauthorizedHandler(null);
    }
  });

  it("App.tsx wires unsubscribeWebPushOnSessionEnd into both handleLogout and handleSwitchDemoPersona, and webPush.ts never awaits serviceWorker.ready for logout", () => {
    const appSource = fs.readFileSync(path.join(process.cwd(), "client/src/App.tsx"), "utf8");
    const webPushSource = fs.readFileSync(path.join(process.cwd(), "client/src/lib/webPush.ts"), "utf8");
    expect(appSource).toMatch(/function handleLogout\(\)[\s\S]*?unsubscribeWebPushOnSessionEnd\(/);
    expect(appSource).toMatch(/async function handleSwitchDemoPersona[\s\S]*?unsubscribeWebPushOnSessionEnd\(/);
    const logoutFnSource = webPushSource.slice(webPushSource.indexOf("export function unsubscribeWebPushOnSessionEnd"));
    expect(logoutFnSource).not.toContain("serviceWorker.ready");
    expect(logoutFnSource).toContain("serviceWorker.getRegistration()");
  });

  it("R1: syncPushToggleState preserves subscribed ON across same-user token rotation and fetch failure, resetting only on user.id change", async () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/cap" } as unknown as PushSubscription;
    const initial = { userId: "u_cap", publicKey: "pub-key", subscribed: true };

    // Same-user token rotation with healthy fetch stays ON without flickering off.
    const rotated = await syncPushToggleState(initial, "u_cap", {
      fetchConfig: async () => ({ enabled: true, publicKey: "pub-key" }),
      getSubscription: async () => sub,
      consumePausedFlag: () => false
    });
    expect(rotated.next).toEqual({ userId: "u_cap", publicKey: "pub-key", subscribed: true });
    expect(rotated.showPausedReminder).toBe(false);

    // Same-user token rotation when fetchPushConfig fails (weak field signal) keeps subscribed ON.
    const failedFetch = await syncPushToggleState(initial, "u_cap", {
      fetchConfig: async () => {
        throw new Error("Network offline");
      },
      getSubscription: async () => sub,
      consumePausedFlag: () => false
    });
    expect(failedFetch.next).toEqual({ userId: "u_cap", publicKey: "pub-key", subscribed: true });

    // Switching to another user resets subscribed to OFF even if fetchPushConfig fails.
    const switchedUserFail = await syncPushToggleState(initial, "u_other", {
      fetchConfig: async () => {
        throw new Error("Network offline");
      },
      getSubscription: async () => null,
      consumePausedFlag: () => false
    });
    expect(switchedUserFail.next.userId).toBe("u_other");
    expect(switchedUserFail.next.subscribed).toBe(false);
  });

  it("R3: getActiveBrowserPushSubscription and subscribeToWebPush wait for in-flight teardown so a dying endpoint is never reused, and persona switch skips the sign-out toast flag", async () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      }
    };

    let releaseUnsub!: () => void;
    let activeSub: PushSubscription | null = {
      endpoint: "https://fcm.googleapis.com/fcm/send/dying-old-endpoint",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/dying-old-endpoint",
        keys: { p256dh: "B".repeat(65), auth: "A".repeat(22) }
      }),
      unsubscribe: () =>
        new Promise<boolean>((resolve) => {
          releaseUnsub = () => {
            activeSub = null;
            resolve(true);
          };
        })
    } as unknown as PushSubscription;

    const freshSub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/fresh-new-endpoint",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/fresh-new-endpoint",
        keys: { p256dh: "C".repeat(65), auth: "D".repeat(22) }
      })
    } as unknown as PushSubscription;

    const fakeReg = {
      pushManager: {
        getSubscription: vi.fn(async () => activeSub),
        subscribe: vi.fn(async () => {
          activeSub = freshSub;
          return freshSub;
        })
      }
    } as unknown as ServiceWorkerRegistration;

    // Persona switch starts deferred teardown with markPaused: false.
    const teardownPromise = unsubscribeWebPushOnSessionEnd("old-token", {
      getRegistration: async () => fakeReg,
      fetchImpl: vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
      storage: fakeStorage,
      markPaused: false
    });

    // While teardown is still in flight, start both getActiveBrowserPushSubscription and subscribeToWebPush.
    let activeResolved = false;
    const readPromise = getActiveBrowserPushSubscription({
      getRegistration: async () => fakeReg
    }).then((res) => {
      activeResolved = true;
      return res;
    });

    const registeredOnServer = vi.fn(async () => ({ subscribed: true }));
    const subscribePromise = subscribeToWebPush("new-token", "SGVsbG8tV29ybGRf", {
      getRegistration: async () => fakeReg,
      requestPermission: async () => "granted",
      registerOnServer: registeredOnServer
    });

    // Give microtasks a chance to run: read must still be waiting on deferred unsubscribe().
    await new Promise((r) => setTimeout(r, 15));
    expect(activeResolved).toBe(false);
    expect(registeredOnServer).not.toHaveBeenCalled();

    // Complete deferred teardown: read sees null (old sub gone), subscribe creates fresh endpoint!
    releaseUnsub();
    await teardownPromise;
    expect(await readPromise).toBeNull();
    const subResult = await subscribePromise;
    expect(subResult.endpoint).toBe("https://fcm.googleapis.com/fcm/send/fresh-new-endpoint");
    expect(registeredOnServer).toHaveBeenCalledWith({
      endpoint: "https://fcm.googleapis.com/fcm/send/fresh-new-endpoint",
      keys: { p256dh: "C".repeat(65), auth: "D".repeat(22) }
    });
    // Persona switch (markPaused: false) MUST NOT set the sign-out reminder flag.
    expect(store.has(PUSH_PAUSED_ON_LOGOUT_KEY)).toBe(false);
  });
});
