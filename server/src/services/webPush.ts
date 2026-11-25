import * as webpush from "web-push";
import { EventPermission, MembershipStatus, OrganizationRole, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";

/**
 * PLAN_READY_1 Sprint 3: Native Web Push (VAPID via `web-push`, $0 forever).
 *
 * - Completely inert when `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY` is unset.
 * - Supports Android Chrome PWAs and iOS 16.4+ Home Screen PWAs.
 * - Enforces HTTPS-only push endpoints (blocks non-HTTPS / private SSRF targets).
 * - Automatically prunes 404/410 expired subscriptions.
 * - Never logs private keys, endpoints, or sensitive user data.
 */

export const MAX_SUBSCRIPTIONS_PER_USER = 10;

/**
 * The server POSTs to whatever endpoint a browser registers, so only the real
 * browser push services are accepted (allowlist, not a blocklist): this closes
 * blind SSRF to private ranges (10/8, 192.168/16, 169.254.169.254 metadata, ...).
 * Chrome/Edge/Android -> FCM, Safari/iOS -> Apple, Firefox -> Mozilla,
 * legacy Edge -> WNS.
 */
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "web.push.apple.com"];
const PUSH_SERVICE_SUFFIXES = [".push.apple.com", ".push.services.mozilla.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== "443") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      PUSH_SERVICE_HOSTS.includes(host) ||
      host === "push.services.mozilla.com" ||
      PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

export const pushSubscriptionInputSchema = z
  .object({
    endpoint: z
      .string()
      .trim()
      .min(16)
      .max(1024)
      .refine(isAllowedPushEndpoint, "Push endpoint must belong to a known browser push service"),
    keys: z
      .object({
        p256dh: z.string().trim().regex(/^[A-Za-z0-9_-]{20,256}=*$/, "Invalid p256dh key"),
        auth: z.string().trim().regex(/^[A-Za-z0-9_-]{10,128}=*$/, "Invalid auth key")
      })
      .strict()
  })
  .strict();

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export type WebPushPayload = {
  title: string;
  body: string;
  titleAr?: string;
  bodyAr?: string;
  url?: string;
  tag?: string;
};

export type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function resolveWebPushConfig(source: Partial<typeof env> = env): PushConfig | null {
  const publicKey = source.VAPID_PUBLIC_KEY?.trim();
  const privateKey = source.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = source.VAPID_SUBJECT?.trim() || "mailto:ops@midyaf.sa";
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(source: Partial<typeof env> = env): boolean {
  return resolveWebPushConfig(source) !== null;
}

export function getVapidPublicKey(source: Partial<typeof env> = env): string | null {
  return resolveWebPushConfig(source)?.publicKey ?? null;
}

export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
  userAgent?: string
) {
  const safeUa = userAgent ? userAgent.slice(0, 255) : null;
  const saved = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: safeUa
    },
    update: {
      userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: safeUa
    },
    select: { id: true }
  });

  // Cap per-user device subscriptions so stale devices cannot grow unbounded.
  const all = await prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { id: true }
  });
  if (all.length > MAX_SUBSCRIPTIONS_PER_USER) {
    const staleIds = all.slice(MAX_SUBSCRIPTIONS_PER_USER).map((row) => row.id);
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: staleIds }, userId }
    });
  }

  return saved;
}

export async function removePushSubscription(userId: string, endpoint: string) {
  const deleted = await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint }
  });
  return { deletedCount: deleted.count };
}

type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: webpush.RequestOptions
) => Promise<unknown>;

function sanitizeRelativeUrl(url?: string): string {
  // Same-origin paths only; a backslash (e.g. "/\\evil.example") is treated as "//" by browsers.
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return "/";
  return url;
}

/**
 * Best-effort lock-screen Web Push fanout to all registered devices for `userId`.
 * Inert when VAPID keys are unset; auto-prunes 404/410 expired subscriptions.
 */
export async function sendWebPushToUser(
  userId: string,
  payload: WebPushPayload,
  options: {
    config?: PushConfig | null;
    sender?: PushSender;
  } = {}
): Promise<{ enabled: boolean; sent: number; pruned: number }> {
  const config = options.config !== undefined ? options.config : resolveWebPushConfig();
  if (!config) {
    return { enabled: false, sent: 0, pruned: 0 };
  }

  let subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
  try {
    subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
      take: MAX_SUBSCRIPTIONS_PER_USER
    });
  } catch {
    return { enabled: true, sent: 0, pruned: 0 };
  }

  // Defense in depth: never POST to a stored endpoint outside the push-service allowlist.
  subscriptions = subscriptions.filter((sub) => isAllowedPushEndpoint(sub.endpoint));
  if (subscriptions.length === 0) {
    return { enabled: true, sent: 0, pruned: 0 };
  }

  let useArabic = false;
  if (payload.titleAr || payload.bodyAr) {
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: userId },
        select: { language: true }
      });
      useArabic = (recipient?.language ?? "ar").toLowerCase().startsWith("ar");
    } catch {
      useArabic = false;
    }
  }
  const localizedTitle = useArabic && payload.titleAr ? payload.titleAr : payload.title;
  const localizedBody = useArabic && payload.bodyAr ? payload.bodyAr : payload.body;

  const sender: PushSender =
    options.sender ??
    ((sub, body, reqOpts) => webpush.sendNotification(sub, body, reqOpts));

  const message = JSON.stringify({
    title: localizedTitle.slice(0, 120),
    body: localizedBody.slice(0, 280),
    url: sanitizeRelativeUrl(payload.url),
    tag: (payload.tag ?? "midyaf-ops").slice(0, 120),
    icon: "/icons/pwa-192x192-v2.png",
    badge: "/icons/pwa-192x192-v2.png"
  });

  const reqOpts: webpush.RequestOptions = {
    TTL: 3600,
    urgency: "high",
    vapidDetails: {
      subject: config.subject,
      publicKey: config.publicKey,
      privateKey: config.privateKey
    }
  };

  let sent = 0;
  const expiredIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await sender(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
          reqOpts
        );
        sent++;
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: unknown }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id);
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { id: { in: expiredIds }, userId } })
      .catch(() => undefined);
  }

  return { enabled: true, sent, pruned: expiredIds.length };
}

export type NotifyWebPushOptions = {
  excludeUserId?: string;
  config?: PushConfig | null;
  sender?: PushSender;
};

/**
 * Post-commit fire-and-forget Web Push fanout to multiple recipients.
 * Call ONLY after DB transactions commit — never inside `prisma.$transaction`.
 * Completely inert when VAPID is unset; swallows errors so responses never fail.
 */
export function notifyUsersByWebPush(
  userIds: ReadonlyArray<string | null | undefined>,
  payload: WebPushPayload,
  options: NotifyWebPushOptions = {}
): void {
  const recipients = [
    ...new Set(
      userIds.filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && id !== options.excludeUserId
      )
    )
  ];
  if (recipients.length === 0) return;

  const config = options.config !== undefined ? options.config : resolveWebPushConfig();
  if (!config) return;

  void Promise.allSettled(
    recipients.map((userId) =>
      sendWebPushToUser(userId, payload, { config, sender: options.sender })
    )
  ).catch(() => undefined);
}

/**
 * Restricts event-scoped push candidates to users who STILL hold active access
 * to `eventId` (active event member with VIEW, active org OWNER/ADMIN, linked
 * event guest, or SUPER_ADMIN), preventing push alerts to revoked members.
 */
export async function filterActiveEventPushRecipients(
  eventId: string,
  candidateUserIds: ReadonlyArray<string>
): Promise<string[]> {
  const uniqueIds = [...new Set(candidateUserIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (uniqueIds.length === 0) return [];

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizationId: true }
  });
  if (!event) return [];

  const [eventMembers, orgAdmins, eventGuests, superAdmins] = await Promise.all([
    prisma.eventMembership.findMany({
      where: {
        eventId,
        userId: { in: uniqueIds },
        status: MembershipStatus.ACTIVE,
        permissions: { has: EventPermission.VIEW }
      },
      select: { userId: true }
    }),
    event.organizationId
      ? prisma.organizationMembership.findMany({
          where: {
            organizationId: event.organizationId,
            userId: { in: uniqueIds },
            status: MembershipStatus.ACTIVE,
            role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] }
          },
          select: { userId: true }
        })
      : Promise.resolve([]),
    // Matches workspacePolicy.ts loadEventAccess: event guests are authorized via
    // Guest{ eventId, userId }, including guests created without an EventGuest row.
    prisma.guest.findMany({
      where: { eventId, userId: { in: uniqueIds } },
      select: { userId: true }
    }),
    prisma.user.findMany({
      where: { id: { in: uniqueIds }, role: Role.SUPER_ADMIN },
      select: { id: true }
    })
  ]);

  const allowed = new Set<string>([
    ...eventMembers.map((m) => m.userId),
    ...orgAdmins.map((m) => m.userId),
    ...eventGuests.map((g) => g.userId),
    ...superAdmins.map((u) => u.id)
  ]);

  return uniqueIds.filter((id) => allowed.has(id));
}

/**
 * Post-commit fire-and-forget Web Push fanout for event-scoped threads/tasks.
 * Inert when VAPID is unset (zero extra DB queries); when configured, verifies
 * active event visibility before delivering generic lock-screen alerts.
 */
export function notifyEventUsersByWebPush(
  eventId: string,
  userIds: ReadonlyArray<string | null | undefined>,
  payload: WebPushPayload,
  options: NotifyWebPushOptions = {}
): void {
  const candidates = [
    ...new Set(
      userIds.filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && id !== options.excludeUserId
      )
    )
  ];
  if (candidates.length === 0) return;

  const config = options.config !== undefined ? options.config : resolveWebPushConfig();
  if (!config) return;

  void filterActiveEventPushRecipients(eventId, candidates)
    .then((activeIds) => {
      if (activeIds.length === 0) return;
      return Promise.allSettled(
        activeIds.map((userId) =>
          sendWebPushToUser(userId, payload, { config, sender: options.sender })
        )
      );
    })
    .catch(() => undefined);
}
