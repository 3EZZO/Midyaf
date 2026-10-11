import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConversationSummary, ConversationThread } from "@shared/domain";
import { ApiError } from "../lib/api";
import {
  ConversationListView,
  ThreadView,
  conversationPeople,
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
