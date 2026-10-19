import { Role } from "@prisma/client";
import { z } from "zod";

/**
 * OPS-COLLAB-001 built-in messaging. Every signed-in user has an inbox.
 *
 * - Operations staff (SA, LM, ORGANIZER, COORDINATOR) may message anyone.
 * - Everyone else may message operations staff.
 * - A guest and a captain may message each other only while a stored task
 *   links them.
 * - Other pairs (guest-guest, supplier-guest, supplier-supplier, ...) are
 *   refused: the directory never lists them and the API rejects them.
 *
 * Only participants can read or reply to a conversation. Contacts expose a
 * name and role, never email or phone. There is no organization membership
 * model yet, so this is not organization isolation (D-001).
 */

export const MESSAGING_STAFF_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.COORDINATOR
];

export const MAX_RECIPIENTS = 10;
export const MAX_SUBJECT = 150;
export const MAX_MESSAGE = 5000;
export const MAX_THREAD_MESSAGES = 200;
export const MAX_CONTACTS = 50;
export const DEFAULT_CONVERSATION_PAGE = 30;
export const MAX_CONVERSATION_PAGE = 50;
export const PREVIEW_LENGTH = 140;

export type MessagingParty = { id: string; role: Role };

export function isMessagingStaff(role: Role) {
  return MESSAGING_STAFF_ROLES.includes(role);
}

/**
 * Whether `sender` may start a conversation with `recipient`.
 * `linkedUserIds` holds the counterparts a stored task links the sender to
 * (assigned captains for a guest, assigned guests for a captain).
 */
export function canMessage(
  sender: MessagingParty,
  recipient: MessagingParty,
  linkedUserIds: ReadonlySet<string>
) {
  if (sender.id === recipient.id) return false;
  if (isMessagingStaff(sender.role) || isMessagingStaff(recipient.role)) return true;

  const guestCaptainPair =
    (sender.role === Role.GUEST && recipient.role === Role.DRIVER) ||
    (sender.role === Role.DRIVER && recipient.role === Role.GUEST);
  return guestCaptainPair && linkedUserIds.has(recipient.id);
}

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const MULTI_LINE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function text(max: number, multiline: boolean) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        .refine(
          (value) => !(multiline ? MULTI_LINE_CONTROL : SINGLE_LINE_CONTROL).test(value),
          "Text contains unsupported characters"
        )
    );
}

export const conversationCreateSchema = z
  .object({
    recipientIds: z
      .array(ID)
      .min(1)
      .max(MAX_RECIPIENTS)
      .refine((ids) => new Set(ids).size === ids.length, "Recipients must be distinct"),
    subject: text(MAX_SUBJECT, false),
    body: text(MAX_MESSAGE, true)
  })
  .strict();

export const messageCreateSchema = z.object({ body: text(MAX_MESSAGE, true), clientRequestId:z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional() }).strict();

export const conversationListQuerySchema = z
  .object({
    cursor: ID.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_CONVERSATION_PAGE)
      .default(DEFAULT_CONVERSATION_PAGE)
  })
  .strict();

export const contactQuerySchema = z
  .object({ search: z.string().trim().max(80).optional() })
  .strict();

export const conversationIdSchema = ID;

export function previewText(body: string) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

/** Marker stored in the metadata of private-message notifications. */
export const MESSAGE_NOTIFICATION_KIND = "MESSAGE";

/**
 * Standalone vendor scope-change notifications written before scope alerts
 * became scoped ALERT threads. Their text names a tenant event.
 */
export const LEGACY_SCOPE_CHANGE_KIND = "EVENT_SCOPE_CHANGE";

function notificationKind(notification: { metadata?: unknown }) {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

/**
 * Whether a notification belongs to private messaging: the new marker, or a
 * conversation reference written before the marker existed, or a legacy
 * tenant scope-change alert. Such notifications carry a subject, sender or
 * tenant event, so only their recipient may see or update them; operational
 * notifications keep their legacy visibility.
 */
export function isPrivateMessageNotification(notification: { metadata?: unknown }) {
  const record = notificationKind(notification);
  if (!record) return false;
  return (
    record.kind === MESSAGE_NOTIFICATION_KIND ||
    record.kind === LEGACY_SCOPE_CHANGE_KIND ||
    record.conversationId !== undefined
  );
}

/** A legacy scope-change notification shows generic text only, even to its recipient. */
export function opaqueLegacyScopeNotification<T extends { body: string; metadata?: unknown }>(notification: T): T {
  return notificationKind(notification)?.kind === LEGACY_SCOPE_CHANGE_KIND
    ? { ...notification, body: "Open your event inbox to review the change." }
    : notification;
}

/** A viewer sees a notification when it is theirs or not a private message. */
export function canSeeNotification(
  notification: { userId: string; metadata?: unknown },
  viewerId: string
) {
  return notification.userId === viewerId || !isPrivateMessageNotification(notification);
}

/**
 * The read mark a reader may claim after being shown `messages`: the newest
 * one actually delivered, not "now", so a message stored while the thread
 * was loading stays unread. Null when nothing was shown.
 */
export function observedReadCutoff(messages: ReadonlyArray<{ createdAt: Date | string }>) {
  let newest: Date | null = null;
  for (const message of messages) {
    const at = new Date(message.createdAt);
    if (!Number.isNaN(at.getTime()) && (!newest || at > newest)) newest = at;
  }
  return newest;
}

/**
 * Unread messages per conversation: messages from someone else newer than
 * the reader's lastReadAt (all of them when it was never read).
 */
export function countUnread(
  messages: Array<{ conversationId: string; createdAt: Date }>,
  lastReadAt: ReadonlyMap<string, Date | null>
) {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (!lastReadAt.has(message.conversationId)) continue;
    const read = lastReadAt.get(message.conversationId);
    if (read && message.createdAt <= read) continue;
    counts.set(message.conversationId, (counts.get(message.conversationId) ?? 0) + 1);
  }
  return counts;
}
