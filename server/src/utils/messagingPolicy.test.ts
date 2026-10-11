import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  canMessage,
  canSeeNotification,
  conversationCreateSchema,
  countUnread,
  isPrivateMessageNotification,
  messageCreateSchema,
  observedReadCutoff,
  previewText
} from "./messagingPolicy.js";

/** OPS-COLLAB-001 messaging policy unit tests (synthetic ids). */

const party = (id: string, role: Role) => ({ id, role });
const none = new Set<string>();

describe("canMessage", () => {
  it("lets operations staff message anyone and anyone message staff", () => {
    const staff = [Role.SUPER_ADMIN, Role.LOGISTICS_MANAGER, Role.ORGANIZER, Role.COORDINATOR];
    const others = [Role.GUEST, Role.DRIVER, Role.SUPPLIER, Role.COMPANY_ORGANIZER];
    for (const staffRole of staff) {
      for (const otherRole of [...staff, ...others]) {
        expect(canMessage(party("a", staffRole), party("b", otherRole), none)).toBe(true);
        expect(canMessage(party("b", otherRole), party("a", staffRole), none)).toBe(true);
      }
    }
  });

  it("allows guest and captain only when a task links them", () => {
    const guest = party("g", Role.GUEST);
    const captain = party("c", Role.DRIVER);
    expect(canMessage(guest, captain, none)).toBe(false);
    expect(canMessage(guest, captain, new Set(["c"]))).toBe(true);
    expect(canMessage(captain, guest, new Set(["g"]))).toBe(true);
  });

  it("refuses other non-staff pairs and self-messages", () => {
    const pairs: Array<[Role, Role]> = [
      [Role.GUEST, Role.GUEST],
      [Role.GUEST, Role.SUPPLIER],
      [Role.SUPPLIER, Role.SUPPLIER],
      [Role.SUPPLIER, Role.DRIVER],
      [Role.COMPANY_ORGANIZER, Role.GUEST],
      [Role.DRIVER, Role.DRIVER]
    ];
    for (const [from, to] of pairs) {
      expect(canMessage(party("a", from), party("b", to), new Set(["b"]))).toBe(false);
    }
    expect(canMessage(party("a", Role.SUPER_ADMIN), party("a", Role.SUPER_ADMIN), none)).toBe(false);
  });
});

describe("schemas", () => {
  it("validates a new conversation strictly", () => {
    expect(
      conversationCreateSchema.parse({ recipientIds: ["u1"], subject: " Hello ", body: " Line\nTwo " })
    ).toEqual({ recipientIds: ["u1"], subject: "Hello", body: "Line\nTwo" });
    expect(conversationCreateSchema.safeParse({ recipientIds: [], subject: "s", body: "b" }).success).toBe(false);
    expect(conversationCreateSchema.safeParse({ recipientIds: ["u1", "u1"], subject: "s", body: "b" }).success).toBe(false);
    expect(
      conversationCreateSchema.safeParse({ recipientIds: Array.from({ length: 11 }, (_, i) => `u${i}`), subject: "s", body: "b" }).success
    ).toBe(false);
    expect(conversationCreateSchema.safeParse({ recipientIds: ["u1"], subject: "a\nb", body: "b" }).success).toBe(false);
    expect(conversationCreateSchema.safeParse({ recipientIds: ["u1"], subject: "s", body: "b", senderId: "x" }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ body: "  " }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("flattens and truncates previews", () => {
    expect(previewText("Hello\n\n  world")).toBe("Hello world");
    const long = previewText("x".repeat(500));
    expect(long).toHaveLength(140);
    expect(long.endsWith("…")).toBe(true);
  });

  it("counts only messages newer than the reader's last read", () => {
    const t = (minutes: number) => new Date(Date.UTC(2026, 9, 11, 10, minutes));
    const counts = countUnread(
      [
        { conversationId: "a", createdAt: t(1) },
        { conversationId: "a", createdAt: t(5) },
        { conversationId: "b", createdAt: t(2) },
        { conversationId: "z", createdAt: t(9) }
      ],
      new Map([
        ["a", t(3)],
        ["b", null]
      ])
    );
    expect(counts.get("a")).toBe(1);
    expect(counts.get("b")).toBe(1);
    expect(counts.has("z")).toBe(false);
  });
});

describe("observedReadCutoff", () => {
  it("is the newest message actually shown, or null", () => {
    expect(
      observedReadCutoff([
        { createdAt: "2026-10-11T08:00:00.000Z" },
        { createdAt: new Date("2026-10-11T08:05:00.000Z") },
        { createdAt: "2026-10-11T08:01:00.000Z" }
      ])
    ).toEqual(new Date("2026-10-11T08:05:00.000Z"));
    expect(observedReadCutoff([])).toBeNull();
    expect(observedReadCutoff([{ createdAt: "not a date" }])).toBeNull();
  });
});

describe("notification privacy", () => {
  it("recognises marked and pre-marker message notifications only", () => {
    expect(isPrivateMessageNotification({ metadata: { kind: "MESSAGE", conversationId: "c1" } })).toBe(true);
    expect(isPrivateMessageNotification({ metadata: { conversationId: "c1" } })).toBe(true);
    expect(isPrivateMessageNotification({ metadata: { kind: "MESSAGE" } })).toBe(true);
    for (const metadata of [null, undefined, "text", ["conversationId"], { taskId: "t1", kind: "DELEGATE" }]) {
      expect(isPrivateMessageNotification({ metadata })).toBe(false);
    }
  });

  it("shows private messages to their recipient only and operational ones as before", () => {
    const message = { userId: "u1", metadata: { kind: "MESSAGE", conversationId: "c1" } };
    const operational = { userId: "u1", metadata: { taskId: "t1" } };
    expect(canSeeNotification(message, "u1")).toBe(true);
    expect(canSeeNotification(message, "u2")).toBe(false);
    expect(canSeeNotification(operational, "u2")).toBe(true);
  });
});
