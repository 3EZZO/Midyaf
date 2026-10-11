import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConversationSummary, ConversationThread } from "@shared/domain";
import { ApiError } from "../lib/api";
import {
  ConversationListView,
  ThreadView,
  conversationPeople,
  createInboxController,
  roleName,
  sendErrorMessage,
  validateCompose
} from "./MessagesCenter";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

/** OPS-COLLAB-001 inbox views and helpers (react-dom/server, no DOM). */

const me = { id: "usr_me", name: "Synthetic Me", role: "COORDINATOR" as const };
const lm = { id: "usr_lm", name: "Synthetic Manager", role: "LOGISTICS_MANAGER" as const };
const guest = { id: "usr_guest", name: "Synthetic Guest", role: "GUEST" as const };

const summary: ConversationSummary = {
  id: "c1",
  subject: "Arrival wave",
  lastMessageAt: "2026-10-11T08:00:00.000Z",
  participants: [me, lm],
  lastMessage: { preview: "Gate 3 please", sender: lm, createdAt: "2026-10-11T08:00:00.000Z" },
  unreadCount: 2
};

const thread: ConversationThread = {
  id: "c1",
  subject: "Arrival wave",
  lastMessageAt: "2026-10-11T08:00:00.000Z",
  participants: [me, lm],
  messages: [
    { id: "m1", body: "Gate 3 please", createdAt: "2026-10-11T07:59:00.000Z", sender: lm, mine: false },
    { id: "m2", body: "<b>On it</b>", createdAt: "2026-10-11T08:00:00.000Z", sender: me, mine: true }
  ],
  truncated: false
};

describe("ConversationListView", () => {
  it("lists subject, other people, preview and unread count", () => {
    const html = renderToStaticMarkup(
      <ConversationListView items={[summary]} meId="usr_me" selectedId={null} isArabic={false} onSelect={() => {}} />
    );
    expect(html).toContain("Arrival wave");
    expect(html).toContain("Synthetic Manager");
    expect(html).toContain("Synthetic Manager: Gate 3 please");
    expect(html).toContain(">2<");
  });

  it("has an honest empty state in both languages", () => {
    const render = (isArabic: boolean) =>
      renderToStaticMarkup(
        <ConversationListView items={[]} meId="usr_me" selectedId={null} isArabic={isArabic} onSelect={() => {}} />
      );
    expect(render(false)).toContain("No conversations yet");
    expect(render(true)).toContain("لا توجد محادثات بعد");
  });
});

describe("ThreadView", () => {
  it("renders messages as text, never as HTML", () => {
    const html = renderToStaticMarkup(
      <ThreadView thread={thread} meId="usr_me" isArabic={false} onBack={() => {}} onReply={async () => null} />
    );
    expect(html).toContain("Gate 3 please");
    expect(html).toContain("&lt;b&gt;On it&lt;/b&gt;");
    expect(html).not.toContain("<b>On it</b>");
    expect(html).toContain("Synthetic Manager (Logistics manager)");
    expect(html).toContain("You");
  });
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A controller whose API calls stay pending until each test settles them. */
function inboxHarness() {
  const threadCalls = new Map<string, Array<Deferred<ConversationThread>>>();
  const listCalls: Array<Deferred<ConversationSummary[]>> = [];
  const replyCalls: Array<Deferred<void>> = [];
  const startCalls: Array<Deferred<ConversationThread>> = [];
  const painted = { threads: [] as string[], threadErrors: [] as string[], lists: 0, listErrors: 0 };
  const controller = createInboxController(
    {
      conversations: () => {
        const call = deferred<ConversationSummary[]>();
        listCalls.push(call);
        return call.promise;
      },
      thread: (id) => {
        const call = deferred<ConversationThread>();
        threadCalls.set(id, [...(threadCalls.get(id) ?? []), call]);
        return call.promise;
      },
      reply: () => {
        const call = deferred<void>();
        replyCalls.push(call);
        return call.promise;
      },
      start: () => {
        const call = deferred<ConversationThread>();
        startCalls.push(call);
        return call.promise;
      }
    },
    {
      list: () => {
        painted.lists += 1;
      },
      listFailed: () => {
        painted.listErrors += 1;
      },
      thread: (loaded) => painted.threads.push(`${loaded.id}:${loaded.subject}`),
      threadFailed: (error) => painted.threadErrors.push(String(error))
    }
  );
  return { controller, threadCalls, listCalls, replyCalls, startCalls, painted };
}

const threadFor = (id: string, subject = id): ConversationThread => ({ ...thread, id, subject });

describe("createInboxController", () => {
  it("never paints a slow thread A over the selected thread B", async () => {
    const { controller, threadCalls, painted } = inboxHarness();
    controller.select("A");
    const loadA = controller.loadThread("A");
    controller.select("B");
    const loadB = controller.loadThread("B");

    threadCalls.get("B")![0].resolve(threadFor("B"));
    await loadB;
    threadCalls.get("A")![0].resolve(threadFor("A"));
    await loadA;
    expect(painted.threads).toEqual(["B:B"]);

    // A late failure of A is equally ignored.
    controller.select("A");
    const failing = controller.loadThread("A");
    controller.select("B");
    threadCalls.get("A")![1].reject(new Error("offline"));
    await failing;
    expect(painted.threadErrors).toEqual([]);
  });

  it("keeps the newest poll of the same thread when replies arrive in reverse", async () => {
    const { controller, threadCalls, painted } = inboxHarness();
    controller.select("A");
    const older = controller.loadThread("A");
    const newer = controller.loadThread("A");
    threadCalls.get("A")![1].resolve(threadFor("A", "newer"));
    await newer;
    threadCalls.get("A")![0].resolve(threadFor("A", "older"));
    await older;
    expect(painted.threads).toEqual(["A:newer"]);
  });

  it("drops list and thread results after logout or unmount", async () => {
    const { controller, threadCalls, listCalls, painted } = inboxHarness();
    controller.select("A");
    const thread = controller.loadThread("A");
    const list = controller.loadList();
    controller.reset();
    listCalls[0].resolve([summary]);
    threadCalls.get("A")![0].resolve(threadFor("A"));
    await Promise.all([list, thread]);
    expect(painted).toMatchObject({ threads: [], lists: 0 });
    // A thread that is no longer selected is not even requested.
    await controller.loadThread("A");
    expect(threadCalls.get("A")).toHaveLength(1);
  });

  it("refreshes after a reply only within the same session and selection", async () => {
    const { controller, threadCalls, listCalls, replyCalls, painted } = inboxHarness();
    controller.select("A");
    const sending = controller.reply("A", "Synthetic reply");
    controller.select("B");
    replyCalls[0].resolve();
    await flush();
    // The list refreshes, but thread A is not reloaded over B.
    expect(threadCalls.get("A")).toBeUndefined();
    listCalls[0].resolve([summary]);
    expect(await sending).toBe(true);
    expect(painted.lists).toBe(1);

    const afterLogout = controller.reply("B", "Another reply");
    controller.reset();
    replyCalls[1].resolve();
    expect(await afterLogout).toBe(false);
    expect(listCalls).toHaveLength(1);
  });

  it("does not open a new conversation in a session that ended", async () => {
    const { controller, startCalls, listCalls } = inboxHarness();
    const starting = controller.start({ recipientIds: ["usr_lm"], subject: "s", body: "b" });
    controller.reset();
    startCalls[0].resolve(threadFor("C"));
    expect(await starting).toBeNull();
    expect(listCalls).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("names the other participants", () => {
    expect(conversationPeople([me, lm, guest], "usr_me", false)).toBe("Synthetic Manager, Synthetic Guest");
    expect(conversationPeople([me], "usr_me", true)).toBe("أنت");
    expect(roleName("DRIVER", true)).toBe("كابتن");
  });

  it("validates a new message like the server", () => {
    const ok = { recipients: [lm], subject: "Hello", body: "Body" };
    expect(validateCompose(ok, false)).toBeNull();
    expect(validateCompose({ ...ok, recipients: [] }, false)).toMatch(/recipient/);
    expect(validateCompose({ ...ok, subject: "a\nb" }, false)).toMatch(/subject/);
    expect(validateCompose({ ...ok, body: " " }, false)).toMatch(/message/);
    expect(validateCompose({ ...ok, recipients: Array.from({ length: 11 }, () => lm) }, false)).toMatch(/10/);
  });

  it("explains refusals", () => {
    expect(sendErrorMessage(new ApiError("x", 403), false)).toMatch(/cannot message/);
    expect(sendErrorMessage(new ApiError("x", 404), false)).toMatch(/not available/);
    expect(sendErrorMessage(new Error("offline"), false)).toMatch(/could not be sent/);
  });
});
