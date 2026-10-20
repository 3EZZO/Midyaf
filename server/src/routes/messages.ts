import { assertMessagingAllowed, loadEventAccess, requirePermission, requirePlanApproved } from "../utils/workspacePolicy.js";
import { EventPermission } from "@prisma/client";
import {loadMessageRedactions,redactMessagePayload,type MessageRedactions} from '../utils/guestPrivacy.js';
import {markScopedMessageResponse} from '../utils/legacyWorkspaceBoundary.js';
import { Router } from "express";
import { Role, Prisma } from "@prisma/client";
import { databaseSchemaName } from "../utils/supplierPortal.js";
import type { Server } from "socket.io";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import type { AuthRequest, AuthenticatedUser } from "../types/auth.js";
import {
  MAX_CONTACTS,
  MAX_THREAD_MESSAGES,
  MESSAGE_NOTIFICATION_KIND,
  MESSAGING_STAFF_ROLES,
  canMessage,
  contactQuerySchema,
  conversationCreateSchema,
  conversationIdSchema,
  conversationListQuerySchema,
  countUnread,
  isMessagingStaff,
  messageCreateSchema,
  observedReadCutoff,
  previewText
} from "../utils/messagingPolicy.js";

/**
 * OPS-COLLAB-001 built-in messaging (see utils/messagingPolicy.ts). Mounted
 * at /api/messages and /messages. Every route acts only for the verified
 * token subject; conversations are visible to their participants only.
 */

const router = Router();
router.use(requireAuth);
const requestPrivacy=new WeakMap<object,Map<string,MessageRedactions>>();
router.use((req,res,next)=>{
 const privacy=new Map<string,MessageRedactions>();requestPrivacy.set(req,privacy);
 const send=res.json.bind(res);res.json=(body)=>{let result=body;for(const redactions of privacy.values())result=redactMessagePayload(result,redactions);return send(result);};next();
});

const personSelect = { select: { id: true, name: true, role: true } } as const;
const UNREAD_SCAN_LIMIT = 2000;
// Concurrent participants may queue on the row lock over a remote database.
// Keep that wait bounded without expiring at Prisma’s short default.
const CONVERSATION_TRANSACTION = { maxWait: 20_000, timeout: 30_000 };
type ThreadDb = Pick<Prisma.TransactionClient, "conversation" | "conversationParticipant">;

// Readers and writers share this lock. A reply queued before a read but
// committed afterwards receives a timestamp beyond the observed cutoff.
async function lockConversation(tx: Prisma.TransactionClient, id: string) {
  const schema = databaseSchemaName();
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${schema}"."Conversation"`)} WHERE "id" = ${id} FOR UPDATE`);
}

/** Users a stored task links this actor to (guest <-> assigned captain). */
async function linkedCounterparts(user: AuthenticatedUser) {
  if (user.role === Role.GUEST) {
    const tasks = await prisma.task.findMany({
      where: { guest: { userId: user.id }, driverId: { not: null } },
      select: { driver: { select: { userId: true } } },
      take: 200
    });
    return new Set(tasks.map((task) => task.driver?.userId).filter((id): id is string => Boolean(id)));
  }
  if (user.role === Role.DRIVER) {
    const tasks = await prisma.task.findMany({
      where: { driver: { userId: user.id }, guestId: { not: null } },
      select: { guest: { select: { userId: true } } },
      take: 200
    });
    return new Set(tasks.map((task) => task.guest?.userId).filter((id): id is string => Boolean(id)));
  }
  return new Set<string>();
}

/** Participant check: anyone else gets the same 404 as a missing thread. */
async function requireParticipation(conversationIdRaw: unknown, userId: string, req: AuthRequest) {
  const parsed = conversationIdSchema.safeParse(conversationIdRaw);
  if (!parsed.success) throw new HttpError(404, "Conversation not found");
  const membership = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: parsed.data, userId } },
    select: { id: true, conversationId: true, lastReadAt: true }
  });
  if (!membership) throw new HttpError(404, "Conversation not found");
  await guardScopedConversation(req, membership.conversationId);
  return membership;
}

async function guardScopedConversation(req: AuthRequest, id: string, db: Prisma.TransactionClient = prisma, writing = false) {
  const conversation = await db.conversation.findUnique({ where: { id }, select: { eventId: true, messageClass: true } });
  if (!conversation?.eventId) return;
  const event = await db.event.findUnique({ where: { id: conversation.eventId }, select: { organizationId: true } });
  if (!event?.organizationId) return;
  const access = await loadEventAccess(req, conversation.eventId, db);
  requirePlanApproved(access);
  if (!access.guestId) requirePermission(access, EventPermission.VIEW);
  const privacy=requestPrivacy.get(req);
  if(privacy&&(!privacy.has(conversation.eventId)||db!==prisma))privacy.set(conversation.eventId,await loadMessageRedactions(db,access));
  if(req.params.id===id)markScopedMessageResponse(req);
  if (writing) {
    // Visibility observers do not turn an individual conversation into a group.
    assertMessagingAllowed(access, conversation.messageClass === "GROUP" ? ["recipient-one", "recipient-two"] : ["recipient"]);
  }
}

router.get(
  "/contacts",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const { search } = contactQuerySchema.parse(req.query);
    const nameFilter: Prisma.UserWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {};

    const audience: Prisma.UserWhereInput = isMessagingStaff(user.role)
      ? {}
      : {
          OR: [
            { role: { in: MESSAGING_STAFF_ROLES } },
            { id: { in: [...(await linkedCounterparts(user))] } }
          ]
        };

    const contacts = await prisma.user.findMany({
      where: { AND: [{ id: { not: user.id } }, audience, nameFilter] },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_CONTACTS
    });

    res.json({ contacts });
  })
);

router.get(
  "/conversations",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const query = conversationListQuerySchema.parse(req.query);

    if (query.cursor) {
      await requireParticipation(query.cursor, user.id, req).catch(() => {
        throw new HttpError(400, "Invalid cursor");
      });
    }

    const rows = await prisma.conversation.findMany({
      where: { participants: { some: { userId: user.id } } },
      select: {
        id: true,
        subject: true,
        lastMessageAt: true,
        participants: {
          select: { userId: true, lastReadAt: true, user: personSelect }
        },
        messages: {
          select: { id: true, body: true, createdAt: true, sender: personSelect },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1
        }
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const visible = [];
    for (const row of rows) {
      try { await guardScopedConversation(req, row.id); visible.push(row); }
      catch (error) { if (!(error instanceof HttpError) || ![403,404,423].includes(error.status)) throw error; }
    }
    const page = visible.slice(0, query.limit);

    const readMarks = new Map<string, Date | null>();
    for (const conversation of page) {
      const mine = conversation.participants.find((p) => p.userId === user.id);
      readMarks.set(conversation.id, mine?.lastReadAt ?? null);
    }
    const unread = await unreadCounts(user.id, readMarks);

    res.json({
      conversations: page.map((conversation) => {
        const last = conversation.messages[0];
        return {
          id: conversation.id,
          subject: conversation.subject,
          lastMessageAt: conversation.lastMessageAt.toISOString(),
          participants: conversation.participants.map((p) => p.user),
          lastMessage: last
            ? {
                preview: previewText(last.body),
                sender: last.sender,
                createdAt: last.createdAt.toISOString()
              }
            : null,
          unreadCount: unread.get(conversation.id) ?? 0
        };
      }),
      nextCursor: rows.length > query.limit ? page[page.length - 1]?.id ?? null : null
    });
  })
);

router.get(
  "/unread-count",
  asyncHandler(async (req: AuthRequest, res) => {
    const memberships = await prisma.conversationParticipant.findMany({
      where: { userId: req.user!.id },
      select: { conversationId: true, lastReadAt: true },
      orderBy: { joinedAt: "desc" },
      take: 500
    });
    const visible = [];
    for (const member of memberships) {
      try { await guardScopedConversation(req, member.conversationId); visible.push(member); }
      catch (error) { if (!(error instanceof HttpError) || ![403,404,423].includes(error.status)) throw error; }
    }
    const marks = new Map(visible.map((m) => [m.conversationId, m.lastReadAt]));
    const counts = await unreadCounts(req.user!.id, marks);
    let total = 0;
    for (const count of counts.values()) total += count;
    res.json({ unread: total, conversations: counts.size });
  })
);

router.post(
  "/conversations",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const body = conversationCreateSchema.parse(req.body);
    if (body.recipientIds.includes(user.id)) {
      throw new HttpError(400, "You cannot message yourself");
    }

    const recipients = await prisma.user.findMany({
      where: { id: { in: body.recipientIds } },
      select: { id: true, name: true, role: true }
    });
    const linked = await linkedCounterparts(user);
    const allowed =
      recipients.length === body.recipientIds.length &&
      recipients.every((recipient) => canMessage(user, recipient, linked));
    if (!allowed) {
      // One answer for unknown and not-permitted recipients.
      throw new HttpError(403, "You cannot message one or more of these recipients");
    }

    const sender = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true }
    });

    const conversation = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const created = await tx.conversation.create({
        data: {
          subject: body.subject,
          createdById: user.id,
          lastMessageAt: now,
          participants: {
            create: [
              { userId: user.id, lastReadAt: now },
              ...recipients.map((recipient) => ({ userId: recipient.id }))
            ]
          },
          messages: { create: { senderId: user.id, body: body.body, createdAt: now } }
        },
        select: { id: true }
      });

      await tx.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.id,
          title: "New message",
          body: `${sender?.name ?? user.email}: ${body.subject}`,
          metadata: { kind: MESSAGE_NOTIFICATION_KIND, conversationId: created.id }
        }))
      });

      return created;
    });

    notifyParticipants(req, recipients.map((recipient) => recipient.id), conversation.id);
    res.status(201).json({ conversation: await loadThread(conversation.id, user.id) });
  })
);

router.get(
  "/conversations/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const membership = await requireParticipation(req.params.id, req.user!.id, req);
    const thread = await prisma.$transaction(async (tx) => {
      await lockConversation(tx, membership.conversationId);
      await guardScopedConversation(req, membership.conversationId, tx);
      const observed = await loadThread(membership.conversationId, req.user!.id, tx);
      await markReadUpTo(membership.id, observedReadCutoff(observed.messages), tx);
      return observed;
    }, CONVERSATION_TRANSACTION);
    res.json({ conversation: thread });
  })
);

router.post(
  "/conversations/:id/messages",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const membership = await requireParticipation(req.params.id, user.id, req);
    const body = messageCreateSchema.parse(req.body);

    const message = await prisma.$transaction(async (tx) => {
      await lockConversation(tx, membership.conversationId);
      await guardScopedConversation(req, membership.conversationId, tx, true);
      const conversation = await tx.conversation.findUnique({
        where: { id: membership.conversationId }, select: { lastMessageAt: true }
      });
      if (!conversation) throw new HttpError(404, "Conversation not found");
      if(body.clientRequestId) {
        const existing=await tx.conversationMessage.findUnique({where:{senderId_clientRequestId:{senderId:user.id,clientRequestId:body.clientRequestId}},select:{id:true,conversationId:true,body:true,createdAt:true,sender:personSelect}});
        if(existing) {
          if(existing.conversationId!==membership.conversationId||existing.body!==body.body)throw new HttpError(409,"This retry id was used for another reply");
          return {...existing,replayed:true};
        }
      }
      const now = new Date(Math.max(Date.now(), conversation.lastMessageAt.getTime() + 1));
      const created = await tx.conversationMessage.create({
        data: {
          conversationId: membership.conversationId,
          senderId: user.id,
          clientRequestId: body.clientRequestId,
          body: body.body,
          createdAt: now
        },
        select: { id: true, body: true, createdAt: true, sender: personSelect }
      });
      await tx.conversation.update({
        where: { id: membership.conversationId },
        data: { lastMessageAt: now }
      });
      // Sending does not read: earlier incoming messages the sender has not
      // been shown stay unread (own messages never count as unread).
      return {...created,replayed:false};
    }, CONVERSATION_TRANSACTION);

    const others = await prisma.conversationParticipant.findMany({
      where: { conversationId: membership.conversationId, userId: { not: user.id } },
      select: { userId: true }
    });
    if(!message.replayed)notifyParticipants(req, others.map((p) => p.userId), membership.conversationId);

    res.status(201).json({
      message: {
        id: message.id,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        sender: message.sender,
        mine: true
      }
    });
  })
);

router.post(
  "/conversations/:id/read",
  asyncHandler(async (req: AuthRequest, res) => {
    const membership = await requireParticipation(req.params.id, req.user!.id, req);
    await prisma.$transaction(async (tx) => {
      await lockConversation(tx, membership.conversationId);
      await guardScopedConversation(req, membership.conversationId, tx);
      const newest = await tx.conversationMessage.findFirst({
        where: { conversationId: membership.conversationId },
        select: { createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      });
      await markReadUpTo(membership.id, newest?.createdAt ?? null, tx);
    }, CONVERSATION_TRANSACTION);
    res.json({ ok: true });
  })
);

/**
 * Moves the reader's mark forward to `cutoff` and never backwards: a slow or
 * stale read cannot undo a newer one, and nothing after the cutoff is
 * claimed as read.
 */
async function markReadUpTo(membershipId: string, cutoff: Date | null, db: ThreadDb = prisma) {
  if (!cutoff) return;
  await db.conversationParticipant.updateMany({
    where: {
      id: membershipId,
      OR: [{ lastReadAt: null }, { lastReadAt: { lt: cutoff } }]
    },
    data: { lastReadAt: cutoff }
  });
}

async function loadThread(conversationId: string, userId: string, db: ThreadDb = prisma) {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      subject: true,
      lastMessageAt: true,
      participants: { select: { user: personSelect } },
      messages: {
        select: { id: true, body: true, createdAt: true, sender: personSelect },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_THREAD_MESSAGES
      }
    }
  });
  if (!conversation) throw new HttpError(404, "Conversation not found");

  return {
    id: conversation.id,
    subject: conversation.subject,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    participants: conversation.participants.map((p) => p.user),
    messages: [...conversation.messages].reverse().map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      sender: message.sender,
      mine: message.sender.id === userId
    })),
    truncated: conversation.messages.length === MAX_THREAD_MESSAGES
  };
}

export async function unreadCounts(userId: string, marks: Map<string, Date | null>) {
  if (marks.size === 0) return new Map<string, number>();
  const read = [...marks.values()];
  const oldest = read.some((value) => !value)
    ? undefined
    : new Date(Math.min(...read.map((value) => (value as Date).getTime())));

  const messages = await prisma.conversationMessage.findMany({
    where: {
      conversationId: { in: [...marks.keys()] },
      senderId: { not: userId },
      ...(oldest ? { createdAt: { gt: oldest } } : {})
    },
    select: { conversationId: true, createdAt: true },
    take: UNREAD_SCAN_LIMIT
  });
  return countUnread(messages, marks);
}

/** Realtime hint for open sessions; the inbox also refreshes on its own. */
function notifyParticipants(req: AuthRequest, userIds: string[], conversationId: string) {
  const io = req.app.get("io") as Server | undefined;
  for (const userId of userIds) {
    io?.to(`user:${userId}`).emit("message:new", { conversationId });
  }
}

export default router;
