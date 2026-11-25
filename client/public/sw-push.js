/* eslint-disable no-restricted-globals */
/**
 * PLAN_READY_1 Sprint 3: Native Web Push Service Worker handler.
 * Imported by the Workbox-generated service worker via `workbox.importScripts`.
 * Works on Android Chrome PWAs and iOS 16.4+ Home Screen PWAs.
 */

self.addEventListener("push", (event) => {
  let payload = {
    title: "Midyaf Operations",
    body: "You have a new operational update.",
    url: "/",
    tag: "midyaf-ops",
    icon: "/icons/pwa-192x192-v2.png",
    badge: "/icons/pwa-192x192-v2.png"
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = {
          title: typeof parsed.title === "string" && parsed.title ? parsed.title : payload.title,
          body: typeof parsed.body === "string" && parsed.body ? parsed.body : payload.body,
          url:
            typeof parsed.url === "string" &&
            parsed.url.startsWith("/") &&
            !parsed.url.startsWith("//")
              ? parsed.url
              : "/",
          tag: typeof parsed.tag === "string" && parsed.tag ? parsed.tag : payload.tag,
          icon: payload.icon,
          badge: payload.badge
        };
      }
    } catch {
      const text = event.data.text();
      if (text) payload.body = text.slice(0, 280);
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification && event.notification.data && event.notification.data.url;
  const targetPath =
    typeof rawUrl === "string" && rawUrl.startsWith("/") && !rawUrl.startsWith("//")
      ? rawUrl
      : "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetPath);
        }
        return undefined;
      })
  );
});
