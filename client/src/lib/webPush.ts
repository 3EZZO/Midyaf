import { apiFetch } from "./api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export const PUSH_PAUSED_ON_LOGOUT_KEY = "midyaf_push_paused_on_logout";

export function markPushPausedOnLogout(storage?: Pick<Storage, "setItem">): void {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    target?.setItem(PUSH_PAUSED_ON_LOGOUT_KEY, "1");
  } catch {
    // ignore storage restrictions
  }
}

/** Returns true once if a live push subscription was unsubscribed on the last sign-out. */
export function consumePushPausedOnLogout(storage?: Pick<Storage, "getItem" | "removeItem">): boolean {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!target || target.getItem(PUSH_PAUSED_ON_LOGOUT_KEY) !== "1") return false;
    target.removeItem(PUSH_PAUSED_ON_LOGOUT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * PLAN_READY_1 Sprint 3: Client Web Push (VAPID) subscription helpers.
 * Inert when the server reports `{ enabled: false }` (VAPID keys not set in Render).
 */

export type PushConfigResponse = {
  enabled: boolean;
  publicKey: string | null;
};

export function isBrowserPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Converts a URL-safe base64 VAPID public key into a Uint8Array for PushManager.subscribe. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

const MAX_PUSH_CONFIG_CACHE = 5;
const pushConfigCache = new Map<string, Promise<PushConfigResponse>>();

export function clearPushConfigCache(): void {
  pushConfigCache.clear();
}

/**
 * Memoized per access token so TopBar remounts and persona portal switches do
 * not refetch `/notifications/push/config` repeatedly. Evicts on error so a
 * transient failure can retry cleanly.
 */
export function fetchPushConfig(accessToken: string): Promise<PushConfigResponse> {
  const existing = pushConfigCache.get(accessToken);
  if (existing) return existing;

  if (pushConfigCache.size >= MAX_PUSH_CONFIG_CACHE) {
    const oldest = pushConfigCache.keys().next().value;
    if (oldest !== undefined) pushConfigCache.delete(oldest);
  }

  const req = apiFetch<PushConfigResponse>("/notifications/push/config", accessToken).catch(
    (err) => {
      pushConfigCache.delete(accessToken);
      throw err;
    }
  );
  pushConfigCache.set(accessToken, req);
  return req;
}

export async function getActiveBrowserPushSubscription(): Promise<PushSubscription | null> {
  if (!isBrowserPushSupported()) return null;
  // Use getRegistration() rather than .ready so pages without an active SW
  // never hang indefinitely waiting for a worker to register.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.pushManager) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToWebPush(
  accessToken: string,
  vapidPublicKey: string
): Promise<{ subscribed: boolean; endpoint: string }> {
  if (!isBrowserPushSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser returned an incomplete push subscription");
  }

  await apiFetch<{ subscribed: boolean }>("/notifications/push/subscribe", accessToken, {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth
      }
    })
  });

  return { subscribed: true, endpoint: json.endpoint };
}

export async function unsubscribeFromWebPush(accessToken: string): Promise<{ unsubscribed: boolean }> {
  const existing = await getActiveBrowserPushSubscription();
  if (!existing) return { unsubscribed: true };
  const endpoint = existing.endpoint;
  await existing.unsubscribe().catch(() => undefined);
  await apiFetch<{ unsubscribed: boolean }>("/notifications/push/unsubscribe", accessToken, {
    method: "POST",
    body: JSON.stringify({ endpoint })
  });
  return { unsubscribed: true };
}

type LogoutUnsubscribeDeps = {
  getRegistration?: () => Promise<Pick<ServiceWorkerRegistration, "pushManager"> | undefined>;
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, "setItem">;
};

/**
 * Best-effort Web Push teardown for logout, forced sign-out, and account/persona
 * switches on shared event devices.
 *
 * - Uses `serviceWorker.getRegistration()` (never `.ready`, which hangs forever
 *   when no service worker is registered).
 * - Always calls local `subscription.unsubscribe()` regardless of auth/network
 *   state so the device immediately stops receiving the previous user's alerts
 *   (and any stale server row is pruned on 404/410 as fallback).
 * - Uses raw `fetch(..., { keepalive: true })` instead of `apiFetch` so a 401
 *   on a session being cleared can never trigger `apiFetch`'s 401 refresh hook.
 */
export async function unsubscribeWebPushOnSessionEnd(
  accessToken: string | null | undefined,
  deps: LogoutUnsubscribeDeps = {}
): Promise<{ localUnsubscribed: boolean; serverNotified: boolean }> {
  let registration: Pick<ServiceWorkerRegistration, "pushManager"> | undefined;
  try {
    if (deps.getRegistration) {
      registration = await deps.getRegistration();
    } else if (isBrowserPushSupported()) {
      registration = await navigator.serviceWorker.getRegistration();
    }
  } catch {
    return { localUnsubscribed: false, serverNotified: false };
  }

  let existing: PushSubscription | null = null;
  try {
    existing = (await registration?.pushManager?.getSubscription()) ?? null;
  } catch {
    return { localUnsubscribed: false, serverNotified: false };
  }
  if (!existing) return { localUnsubscribed: false, serverNotified: false };

  const endpoint = existing.endpoint;
  let localUnsubscribed = false;
  try {
    localUnsubscribed = Boolean(await existing.unsubscribe());
  } catch {
    localUnsubscribed = false;
  }
  if (localUnsubscribed) {
    markPushPausedOnLogout(deps.storage);
  }

  let serverNotified = false;
  const fetchFn = deps.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (accessToken && endpoint && fetchFn) {
    try {
      const response = await fetchFn(`${API_BASE}/notifications/push/unsubscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ endpoint }),
        keepalive: true
      });
      serverNotified = response.ok;
    } catch {
      serverNotified = false;
    }
  }

  return { localUnsubscribed, serverNotified };
}
