import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Inbox, Mail, PenSquare, RotateCcw, Search, Send } from "lucide-react";
import type {
  ConversationSummary,
  ConversationThread,
  MessagingContact,
  Session
} from "@shared/domain";
import { ApiError, apiFetch } from "../lib/api";
import { shortDate, shortTime } from "../lib/format";
import { allCurrent, createRequestGeneration } from "../lib/requestGeneration";
import { Badge, Button, Dialog, EmptyState, Field, Input, Surface, Textarea } from "./ui";
import { PortalHero } from "./ui/PortalHero";

/**
 * OPS-COLLAB-001 built-in messaging: every signed-in user has a private
 * inbox. Contacts show a name and role only; who may message whom is decided
 * by the server (utils/messagingPolicy.ts). The inbox refreshes itself over
 * HTTP while it is visible, so it also works for roles without realtime.
 */

const LIST_REFRESH_MS = 20_000;
const THREAD_REFRESH_MS = 10_000;

export type ComposeDraft = { recipients: MessagingContact[]; subject: string; body: string };

export function messagesCopy(isArabic: boolean) {
  const p = (en: string, ar: string) => (isArabic ? ar : en);
  return {
    badge: p("Messages", "الرسائل"),
    title: p("Your Midyaf inbox", "صندوق رسائلك في مضياف"),
    body: p(
      "Private conversations with the people you work with on this platform. Only participants can read a conversation.",
      "محادثات خاصة مع من تعمل معهم على المنصة. لا يقرأ المحادثة إلا المشاركون فيها."
    ),
    compose: p("New message", "رسالة جديدة"),
    loading: p("Loading conversations…", "جاري تحميل المحادثات…"),
    loadFailed: p("Your messages could not be loaded.", "تعذر تحميل رسائلك."),
    retry: p("Retry", "إعادة المحاولة"),
    empty: p("No conversations yet", "لا توجد محادثات بعد"),
    emptyBody: p("Start one with the New message button.", "ابدأ محادثة من زر رسالة جديدة."),
    pick: p("Select a conversation to read it", "اختر محادثة لقراءتها"),
    reply: p("Write a reply", "اكتب رداً"),
    send: p("Send", "إرسال"),
    to: p("To", "إلى"),
    subject: p("Subject", "الموضوع"),
    message: p("Message", "الرسالة"),
    searchPeople: p("Search people by name", "ابحث عن الأشخاص بالاسم"),
    noContacts: p("No one matches this search", "لا يوجد أحد يطابق البحث"),
    you: p("You", "أنت"),
    back: p("Back to inbox", "العودة للصندوق"),
    sendFailed: p("The message could not be sent. Try again.", "تعذر إرسال الرسالة. حاول مجدداً."),
    notAllowed: p("You cannot message one or more of these people.", "لا يمكنك مراسلة شخص أو أكثر من هؤلاء."),
    unavailable: p("This conversation is not available.", "هذه المحادثة غير متاحة."),
    olderHidden: p("Only the latest 200 messages are shown.", "تُعرض آخر 200 رسالة فقط."),
    close: p("Close", "إغلاق"),
    remove: p("Remove", "إزالة")
  };
}

const ROLE_NAMES: Record<string, { en: string; ar: string }> = {
  SUPER_ADMIN: { en: "Administrator", ar: "مدير النظام" },
  LOGISTICS_MANAGER: { en: "Logistics manager", ar: "مدير اللوجستيات" },
  ORGANIZER: { en: "Event manager", ar: "مدير الفعالية" },
  COORDINATOR: { en: "Coordinator", ar: "منسق" },
  COMPANY_ORGANIZER: { en: "Organizing company", ar: "الشركة المنظمة" },
  SUPPLIER: { en: "Supplier", ar: "مورد" },
  DRIVER: { en: "Captain", ar: "كابتن" },
  GUEST: { en: "Guest", ar: "ضيف" }
};

export function roleName(role: string, isArabic: boolean) {
  const known = ROLE_NAMES[role];
  return known ? (isArabic ? known.ar : known.en) : role;
}

/** The other participants' names, for a conversation's heading. */
export function conversationPeople(
  participants: MessagingContact[],
  meId: string,
  isArabic: boolean
) {
  const others = participants.filter((person) => person.id !== meId);
  if (!others.length) return messagesCopy(isArabic).you;
  return others.map((person) => person.name).join(isArabic ? "، " : ", ");
}

export function validateCompose(draft: ComposeDraft, isArabic: boolean) {
  if (!draft.recipients.length) return isArabic ? "اختر مستلماً واحداً على الأقل" : "Choose at least one recipient";
  if (draft.recipients.length > 10) return isArabic ? "عشرة مستلمين كحد أقصى" : "At most 10 recipients";
  const subject = draft.subject.trim();
  if (!subject || subject.length > 150 || /[\u0000-\u001f\u007f]/.test(subject)) {
    return isArabic ? "اكتب موضوعاً في سطر واحد حتى 150 حرفاً" : "Write a one-line subject up to 150 characters";
  }
  const body = draft.body.trim();
  if (!body || body.length > 5000) {
    return isArabic ? "اكتب رسالة حتى 5000 حرف" : "Write a message up to 5,000 characters";
  }
  return null;
}

export function sendErrorMessage(error: unknown, isArabic: boolean) {
  const copy = messagesCopy(isArabic);
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 403) return copy.notAllowed;
  if (status === 404) return copy.unavailable;
  return copy.sendFailed;
}

function when(value: string, isArabic: boolean) {
  const locale = isArabic ? "ar" : "en";
  return `${shortDate(value, locale)} ${shortTime(value, locale)}`;
}

function isVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export type InboxApi = {
  conversations: () => Promise<ConversationSummary[]>;
  thread: (id: string) => Promise<ConversationThread>;
  reply: (id: string, body: string) => Promise<void>;
  start: (payload: { recipientIds: string[]; subject: string; body: string }) => Promise<ConversationThread>;
};

export type InboxCallbacks = {
  list: (items: ConversationSummary[]) => void;
  listFailed: () => void;
  thread: (thread: ConversationThread) => void;
  threadFailed: (error: unknown) => void;
};

/**
 * The inbox's async rules, independent of React. Only the latest list load
 * and the latest load of the CURRENTLY selected thread may paint; switching
 * threads, signing out or unmounting (`reset`) makes everything in flight
 * stale, and a reply or new conversation only refreshes the session it was
 * sent from.
 */
export function createInboxController(api: InboxApi, on: InboxCallbacks) {
  const session = createRequestGeneration();
  const lists = createRequestGeneration();
  const threads = createRequestGeneration();
  let selected: string | null = null;

  async function loadList() {
    const current = allCurrent(session.capture(), lists.begin());
    try {
      const items = await api.conversations();
      if (current()) on.list(items);
    } catch {
      if (current()) on.listFailed();
    }
  }

  async function loadThread(id: string) {
    if (id !== selected) return;
    const current = allCurrent(session.capture(), threads.begin());
    const stillShown = () => current() && selected === id;
    try {
      const thread = await api.thread(id);
      if (stillShown()) on.thread(thread);
    } catch (error) {
      if (stillShown()) on.threadFailed(error);
    }
  }

  function select(id: string | null) {
    selected = id;
    threads.invalidate();
  }

  /** Errors propagate to the caller; refreshes stay within the session. */
  async function reply(id: string, body: string) {
    const scope = session.capture();
    await api.reply(id, body);
    if (!scope()) return false;
    await Promise.all([selected === id ? loadThread(id) : Promise.resolve(), loadList()]);
    return true;
  }

  async function start(payload: Parameters<InboxApi["start"]>[0]) {
    const scope = session.capture();
    const thread = await api.start(payload);
    if (!scope()) return null;
    await loadList();
    return scope() ? thread : null;
  }

  function reset() {
    session.invalidate();
    lists.invalidate();
    threads.invalidate();
    selected = null;
  }

  return { loadList, loadThread, select, reply, start, reset };
}

export function MessagesCenter({ session, isArabic }: { session?: Session; isArabic: boolean }) {
  const copy = messagesCopy(isArabic);
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;
  const isArabicRef = useRef(isArabic);
  isArabicRef.current = isArabic;
  const [list, setList] = useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; items: ConversationSummary[] }
  >({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const [controller] = useState(() => {
    const token = () => {
      const value = tokenRef.current;
      if (!value) throw new ApiError("Not signed in", 401);
      return value;
    };
    return createInboxController(
      {
        conversations: async () =>
          (await apiFetch<{ conversations: ConversationSummary[] }>("/messages/conversations", token()))
            .conversations,
        thread: async (id) =>
          (
            await apiFetch<{ conversation: ConversationThread }>(
              `/messages/conversations/${encodeURIComponent(id)}`,
              token()
            )
          ).conversation,
        reply: async (id, body) => {
          await apiFetch(`/messages/conversations/${encodeURIComponent(id)}/messages`, token(), {
            method: "POST",
            body: JSON.stringify({ body })
          });
        },
        start: async (payload) =>
          (
            await apiFetch<{ conversation: ConversationThread }>("/messages/conversations", token(), {
              method: "POST",
              body: JSON.stringify(payload)
            })
          ).conversation
      },
      {
        list: (items) => setList({ status: "ready", items }),
        listFailed: () => setList((current) => (current.status === "ready" ? current : { status: "error" })),
        thread: (loaded) => {
          setThread(loaded);
          setThreadError(null);
          // Opening a thread marks what it shows as read: refresh the badge.
          setList((current) =>
            current.status === "ready"
              ? {
                  status: "ready",
                  items: current.items.map((item) => (item.id === loaded.id ? { ...item, unreadCount: 0 } : item))
                }
              : current
          );
        },
        threadFailed: (error) => setThreadError(sendErrorMessage(error, isArabicRef.current))
      }
    );
  });

  useEffect(() => {
    controller.reset();
    setList({ status: "loading" });
    setSelectedId(null);
    setThread(null);
    if (!session?.accessToken) return;
    void controller.loadList();
    const timer = window.setInterval(() => {
      if (isVisible()) void controller.loadList();
    }, LIST_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      // Logout, account switch or unmount: nothing in flight may paint.
      controller.reset();
    };
  }, [session?.accessToken, controller]);

  useEffect(() => {
    controller.select(selectedId);
    setThread(null);
    setThreadError(null);
    if (!selectedId) return;
    void controller.loadThread(selectedId);
    const timer = window.setInterval(() => {
      if (isVisible()) void controller.loadThread(selectedId);
    }, THREAD_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [selectedId, controller]);

  if (!session) return null;

  // Only the thread that belongs to the current selection is ever shown, and
  // a reply always goes to the thread on screen.
  const shownThread = thread && thread.id === selectedId ? thread : null;

  async function reply(threadId: string, body: string) {
    try {
      await controller.reply(threadId, body);
      return null;
    } catch (error) {
      return sendErrorMessage(error, isArabic);
    }
  }

  async function searchContacts(search: string) {
    const token = tokenRef.current;
    if (!token) return [];
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    const response = await apiFetch<{ contacts: MessagingContact[] }>(`/messages/contacts${query}`, token);
    return response.contacts;
  }

  async function send(draft: ComposeDraft) {
    try {
      const created = await controller.start({
        recipientIds: draft.recipients.map((person) => person.id),
        subject: draft.subject.trim(),
        body: draft.body.trim()
      });
      if (created) {
        setComposeOpen(false);
        setSelectedId(created.id);
      }
      return null;
    } catch (error) {
      return sendErrorMessage(error, isArabic);
    }
  }

  return (
    <div className="space-y-5">
      <PortalHero
        badge={copy.badge}
        title={copy.title}
        body={copy.body}
        action={
          <Button variant="gold" onClick={() => setComposeOpen(true)} leadingIcon={<PenSquare className="size-4" aria-hidden />}>
            {copy.compose}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className={selectedId ? "hidden lg:block" : ""}>
          {list.status === "loading" ? (
            <Surface aria-busy className="text-sm text-ink-muted">
              {copy.loading}
            </Surface>
          ) : list.status === "error" ? (
            <Surface role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
              {copy.loadFailed}
              <Button size="sm" variant="outline" onClick={() => void controller.loadList()} leadingIcon={<RotateCcw className="size-3.5" aria-hidden />}>
                {copy.retry}
              </Button>
            </Surface>
          ) : (
            <ConversationListView
              items={list.items}
              meId={session.user.id}
              selectedId={selectedId}
              isArabic={isArabic}
              onSelect={setSelectedId}
            />
          )}
        </div>

        <div className={selectedId ? "" : "hidden lg:block"}>
          {selectedId ? (
            shownThread ? (
              <ThreadView
                key={shownThread.id}
                thread={shownThread}
                meId={session.user.id}
                isArabic={isArabic}
                onBack={() => setSelectedId(null)}
                onReply={(body) => reply(shownThread.id, body)}
              />
            ) : threadError ? (
              <Surface role="alert" className="text-sm text-danger">
                {threadError}
              </Surface>
            ) : (
              <Surface aria-busy className="text-sm text-ink-muted">
                {copy.loading}
              </Surface>
            )
          ) : (
            <Surface>
              <EmptyState compact icon={<Mail className="size-4" />} title={copy.pick} />
            </Surface>
          )}
        </div>
      </div>

      <Dialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        title={copy.compose}
        closeLabel={copy.close}
      >
        {composeOpen ? (
          <ComposeForm isArabic={isArabic} onSearch={searchContacts} onSend={send} />
        ) : null}
      </Dialog>
    </div>
  );
}

export function ConversationListView({
  items,
  meId,
  selectedId,
  isArabic,
  onSelect
}: {
  items: ConversationSummary[];
  meId: string;
  selectedId: string | null;
  isArabic: boolean;
  onSelect: (id: string) => void;
}) {
  const copy = messagesCopy(isArabic);
  if (!items.length) {
    return (
      <Surface>
        <EmptyState compact icon={<Inbox className="size-4" />} title={copy.empty} description={copy.emptyBody} />
      </Surface>
    );
  }
  return (
    <ul className="space-y-2" aria-label={copy.badge}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={item.id === selectedId ? "true" : undefined}
            className={`w-full rounded-lg border px-3 py-2.5 text-start transition-colors ${
              item.id === selectedId
                ? "border-gold-500/50 bg-gold-500/10"
                : "border-hairline bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={`truncate text-sm ${item.unreadCount ? "font-bold text-ink" : "font-semibold text-ink-muted"}`}>
                {item.subject}
              </p>
              {item.unreadCount ? <Badge tone="gold">{item.unreadCount}</Badge> : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {conversationPeople(item.participants, meId, isArabic)}
            </p>
            {item.lastMessage ? (
              <p className="mt-1 truncate text-xs text-ink-faint">
                {item.lastMessage.sender.id === meId ? `${copy.you}: ` : `${item.lastMessage.sender.name}: `}
                {item.lastMessage.preview}
              </p>
            ) : null}
            <p className="mt-1 font-tnum text-[11px] text-ink-faint">{when(item.lastMessageAt, isArabic)}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ThreadView({
  thread,
  meId,
  isArabic,
  onBack,
  onReply
}: {
  thread: ConversationThread;
  meId: string;
  isArabic: boolean;
  onBack: () => void;
  onReply: (body: string) => Promise<string | null>;
}) {
  const copy = messagesCopy(isArabic);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const BackIcon = isArabic ? ArrowRight : ArrowLeft;

  return (
    <Surface className="flex flex-col gap-4">
      <div className="flex items-start gap-3 border-b border-hairline pb-3">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={onBack} aria-label={copy.back}>
          <BackIcon className="size-4" aria-hidden />
        </Button>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">{thread.subject}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {thread.participants
              .map((person) =>
                person.id === meId ? copy.you : `${person.name} (${roleName(person.role, isArabic)})`
              )
              .join(isArabic ? "، " : ", ")}
          </p>
        </div>
      </div>

      {thread.truncated ? <p className="text-xs text-ink-faint">{copy.olderHidden}</p> : null}
      <ol className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto" aria-live="polite">
        {thread.messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              message.mine
                ? "self-end bg-gold-500/15 text-ink"
                : "self-start border border-hairline bg-surface-1 text-ink"
            }`}
          >
            <p className="text-[11px] font-semibold text-ink-muted">
              {message.mine ? copy.you : message.sender.name}
            </p>
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
            <p className="mt-1 font-tnum text-[11px] text-ink-faint">{when(message.createdAt, isArabic)}</p>
          </li>
        ))}
      </ol>

      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmed = body.trim();
          if (!trimmed || trimmed.length > 5000) {
            setError(isArabic ? "اكتب رسالة حتى 5000 حرف" : "Write a message up to 5,000 characters");
            return;
          }
          setPending(true);
          const failure = await onReply(trimmed);
          setPending(false);
          setError(failure);
          if (!failure) setBody("");
        }}
      >
        <Field label={copy.reply} error={error ?? undefined}>
          <Textarea rows={3} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="gold" loading={pending} leadingIcon={<Send className="size-4" aria-hidden />}>
            {copy.send}
          </Button>
        </div>
      </form>
    </Surface>
  );
}

export function ComposeForm({
  isArabic,
  onSearch,
  onSend
}: {
  isArabic: boolean;
  onSearch: (search: string) => Promise<MessagingContact[]>;
  onSend: (draft: ComposeDraft) => Promise<string | null>;
}) {
  const copy = messagesCopy(isArabic);
  const [draft, setDraft] = useState<ComposeDraft>({ recipients: [], subject: "", body: "" });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MessagingContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      onSearch(search)
        .then((contacts) => {
          if (active) setResults(contacts);
        })
        .catch(() => {
          if (active) setResults([]);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  const chosen = new Set(draft.recipients.map((person) => person.id));

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const invalid = validateCompose(draft, isArabic);
        if (invalid) {
          setError(invalid);
          return;
        }
        setPending(true);
        const failure = await onSend(draft);
        setPending(false);
        setError(failure);
      }}
    >
      <Field label={copy.to} required>
        <div className="space-y-2">
          {draft.recipients.length ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.recipients.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  aria-label={`${copy.remove} ${person.name}`}
                  onClick={() =>
                    setDraft({ ...draft, recipients: draft.recipients.filter((item) => item.id !== person.id) })
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-gold-500/40 bg-gold-500/10 px-2.5 py-0.5 text-xs text-gold-300"
                >
                  {person.name} ×
                </button>
              ))}
            </div>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <Input
              className="ps-9"
              value={search}
              placeholder={copy.searchPeople}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <ul className="max-h-44 space-y-1 overflow-y-auto">
            {results.filter((person) => !chosen.has(person.id)).length ? (
              results
                .filter((person) => !chosen.has(person.id))
                .map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, recipients: [...draft.recipients, person] })}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-start text-sm text-ink hover:bg-white/5"
                    >
                      <span>{person.name}</span>
                      <span className="text-xs text-ink-faint">{roleName(person.role, isArabic)}</span>
                    </button>
                  </li>
                ))
            ) : (
              <li className="px-3 py-1.5 text-xs text-ink-faint">{copy.noContacts}</li>
            )}
          </ul>
        </div>
      </Field>
      <Field label={copy.subject} required>
        <Input
          maxLength={150}
          value={draft.subject}
          onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
        />
      </Field>
      <Field label={copy.message} required>
        <Textarea
          rows={5}
          maxLength={5000}
          value={draft.body}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        />
      </Field>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="gold" loading={pending} leadingIcon={<Send className="size-4" aria-hidden />}>
          {copy.send}
        </Button>
      </div>
    </form>
  );
}
