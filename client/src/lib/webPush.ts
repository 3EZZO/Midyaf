import { apiFetch } from "./api";

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
  const registration = await navigator.serviceWorker.ready;
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
