import { describe, expect, it } from "vitest";
import { Role, TaskHandoverKind, TaskStatus } from "@prisma/client";
import {
  handoverBodySchema,
  handoverRights,
  isEligibleRecipient,
  planHandover,
  type HandoverTaskState
} from "./taskDelegation.js";

/** OPS-COLLAB-001 handover policy unit tests (synthetic ids). */

const actor = (id: string, role: Role) => ({ id, email: `${id}@example.test`, role });
const LM = actor("usr_lm", Role.LOGISTICS_MANAGER);
const ORG = actor("usr_org", Role.ORGANIZER);
const OTHER_ORG = actor("usr_org2", Role.ORGANIZER);
const COORD = actor("usr_coord", Role.COORDINATOR);
const COORD2 = actor("usr_coord2", Role.COORDINATOR);
const GUEST = actor("usr_guest", Role.GUEST);

const task = (overrides: Partial<HandoverTaskState> = {}): HandoverTaskState => ({
  id: "tsk_1",
  status: TaskStatus.ASSIGNED,
  responsibleUserId: null,
  delegateUserId: null,
  ...overrides
});

describe("handoverRights", () => {
  it("lets LM/SA and the owning organizer delegate, transfer and return", () => {
    expect(handoverRights(LM, task(), "usr_org")).toEqual({
      canDelegate: true,
      canTransfer: true,
      canReturn: false
    });
    expect(handoverRights(ORG, task({ delegateUserId: "usr_coord", responsibleUserId: "usr_org" }), "usr_org")).toEqual({
      canDelegate: true,
      canTransfer: true,
      canReturn: true
    });
    expect(handoverRights(OTHER_ORG, task(), "usr_org").canDelegate).toBe(false);
  });

  it("lets the responsible person do everything and the delegate re-delegate or return", () => {
    const state = task({ responsibleUserId: "usr_coord", delegateUserId: "usr_coord2" });
    expect(handoverRights(COORD, state, "usr_org")).toEqual({
      canDelegate: true,
      canTransfer: true,
      canReturn: true
    });
    expect(handoverRights(COORD2, state, "usr_org")).toEqual({
      canDelegate: true,
      canTransfer: false,
      canReturn: true
    });
  });

  it("denies unrelated coordinators, non-operations roles and closed tasks", () => {
    expect(handoverRights(COORD, task(), "usr_org").canDelegate).toBe(false);
    expect(handoverRights(GUEST, task({ responsibleUserId: "usr_guest" }), "usr_org").canDelegate).toBe(false);
    for (const status of [TaskStatus.COMPLETED, TaskStatus.CANCELLED]) {
      expect(handoverRights(LM, task({ status }), "usr_org")).toEqual({
        canDelegate: false,
        canTransfer: false,
        canReturn: false
      });
    }
  });
});

describe("isEligibleRecipient", () => {
  it("accepts operations staff and only the event's own organizer", () => {
    expect(isEligibleRecipient({ id: "a", role: Role.COORDINATOR }, "usr_org")).toBe(true);
    expect(isEligibleRecipient({ id: "a", role: Role.LOGISTICS_MANAGER }, "usr_org")).toBe(true);
    expect(isEligibleRecipient({ id: "a", role: Role.SUPER_ADMIN }, "usr_org")).toBe(true);
    expect(isEligibleRecipient({ id: "usr_org", role: Role.ORGANIZER }, "usr_org")).toBe(true);
    expect(isEligibleRecipient({ id: "usr_org2", role: Role.ORGANIZER }, "usr_org")).toBe(false);
    for (const role of [Role.GUEST, Role.DRIVER, Role.SUPPLIER, Role.COMPANY_ORGANIZER]) {
      expect(isEligibleRecipient({ id: "a", role }, "usr_org")).toBe(false);
    }
  });
});

describe("planHandover", () => {
  it("makes the delegating actor accountable for an unowned task", () => {
    expect(planHandover(LM, task(), "DELEGATE", "usr_coord")).toEqual({
      kind: TaskHandoverKind.DELEGATE,
      fromUserId: "usr_lm",
      toUserId: "usr_coord",
      next: { responsibleUserId: "usr_lm", delegateUserId: "usr_coord" }
    });
  });

  it("keeps the responsible person when a delegate re-delegates", () => {
    const state = task({ responsibleUserId: "usr_coord", delegateUserId: "usr_coord2" });
    expect(planHandover(COORD2, state, "DELEGATE", "usr_lm")).toEqual({
      kind: TaskHandoverKind.DELEGATE,
      fromUserId: "usr_coord2",
      toUserId: "usr_lm",
      next: { responsibleUserId: "usr_coord", delegateUserId: "usr_lm" }
    });
  });

  it("moves responsibility on transfer and clears any delegate", () => {
    const state = task({ responsibleUserId: "usr_coord", delegateUserId: "usr_coord2" });
    expect(planHandover(COORD, state, "TRANSFER", "usr_lm")).toEqual({
      kind: TaskHandoverKind.TRANSFER,
      fromUserId: "usr_coord2",
      toUserId: "usr_lm",
      next: { responsibleUserId: "usr_lm", delegateUserId: null }
    });
  });

  it("returns a delegated task to its responsible person", () => {
    const state = task({ responsibleUserId: "usr_coord", delegateUserId: "usr_coord2" });
    expect(planHandover(COORD2, state, "RETURN")).toEqual({
      kind: TaskHandoverKind.RETURN,
      fromUserId: "usr_coord2",
      toUserId: "usr_coord",
      next: { responsibleUserId: "usr_coord", delegateUserId: null }
    });
  });

  it("refuses no-op and ambiguous handovers", () => {
    const owned = task({ responsibleUserId: "usr_coord" });
    expect(() => planHandover(LM, owned, "TRANSFER", "usr_coord")).toThrow(
      expect.objectContaining({ status: 409 })
    );
    expect(() => planHandover(LM, owned, "DELEGATE", "usr_coord")).toThrow(
      expect.objectContaining({ status: 409 })
    );
    const delegated = task({ responsibleUserId: "usr_coord", delegateUserId: "usr_coord2" });
    expect(() => planHandover(LM, delegated, "DELEGATE", "usr_coord2")).toThrow(
      expect.objectContaining({ status: 409 })
    );
    expect(() => planHandover(LM, owned, "RETURN")).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => planHandover(LM, owned, "DELEGATE")).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe("handoverBodySchema", () => {
  it("is strict and bounds the reason", () => {
    expect(handoverBodySchema.parse({ mode: "DELEGATE", toUserId: "usr_coord", reason: "  Cover  " })).toEqual({
      mode: "DELEGATE",
      toUserId: "usr_coord",
      reason: "Cover"
    });
    expect(handoverBodySchema.safeParse({ mode: "RETURN", toUserId: "x" }).success).toBe(false);
    expect(handoverBodySchema.safeParse({ mode: "DELEGATE", toUserId: "x", responsibleUserId: "y" }).success).toBe(false);
    expect(handoverBodySchema.safeParse({ mode: "DELEGATE", toUserId: "x", reason: "r".repeat(501) }).success).toBe(false);
    expect(handoverBodySchema.safeParse({ mode: "DELEGATE", toUserId: "bad id" }).success).toBe(false);
  });
});
