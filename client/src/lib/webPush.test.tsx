import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@shared/domain";
import { setApiUnauthorizedHandler } from "./api";
import {
  PUSH_PAUSED_ON_LOGOUT_KEY,
  consumePushPausedOnLogout,
  unsubscribeWebPushOnSessionEnd,
  urlBase64ToUint8Array
} from "./webPush";
import { PushNotificationToggle } from "../components/PushNotificationToggle";
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
    const logoutFnSource = webPushSource.slice(webPushSource.indexOf("export async function unsubscribeWebPushOnSessionEnd"));
    expect(logoutFnSource).not.toContain("serviceWorker.ready");
    expect(logoutFnSource).toContain("serviceWorker.getRegistration()");
  });
});
