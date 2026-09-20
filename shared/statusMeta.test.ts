import { describe, expect, it } from "vitest";
import { STATUS_META, statusLabel, statusMeta, statusTone, type StatusMeta } from "./statusMeta.js";

const DOMAIN_ENUMS = [
  // TaskStatus
  "PENDING", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "PICKED_UP", "COMPLETED", "DELAYED", "CANCELLED",
  // Driver
  "OFFLINE", "AVAILABLE", "BUSY",
  // Guest / journey
  "INVITED", "CONFIRMED", "DECLINED", "PRE_ARRIVAL", "PASSPORT", "LUGGAGE", "GATE",
  // Event
  "DRAFT", "PUBLISHED", "LIVE",
  // Intake
  "AI_PLANNING", "PLAN_CONFIRMED", "QUOTING", "CONTRACTING", "OPERATIONS_OPEN",
  // Quotes / contracts
  "REQUESTED", "RECEIVED", "RECOMMENDED", "APPROVED", "REJECTED", "UNDER_REVIEW", "SIGNED", "ACTIVE", "PENDING_SIGNATURE",
  // Complaints / coordinator / reports
  "NEW", "OPEN", "IN_REVIEW", "RESOLVED", "SENT_TO_SUPERVISOR", "CLOSED", "MANAGER_CONFIRMED", "SENT_TO_COMPANY",
  // Team / delegation
  "ON_MISSION", "BREAK", "ACKNOWLEDGED", "IN_PROGRESS",
  // Severity / priority
  "LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL", "VIP"
];

describe("statusMeta", () => {
  it("covers every enum value used in shared/domain.ts", () => {
    const missing = DOMAIN_ENUMS.filter((k) => !(k in STATUS_META));
    expect(missing).toEqual([]);
  });

  it("has bilingual labels for every entry", () => {
    for (const [key, meta] of Object.entries(STATUS_META) as [string, StatusMeta][]) {
      expect(meta.en, key).toBeTruthy();
      expect(meta.ar, key).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it("is case-insensitive and falls back gracefully", () => {
    expect(statusMeta("completed").tone).toBe("ok");
    expect(statusTone("DELAYED")).toBe("danger");
    expect(statusLabel("EN_ROUTE", true)).toBe("في الطريق");
    expect(statusLabel("EN_ROUTE", false)).toBe("En route");
    expect(statusMeta("NOT_A_STATUS").en).toBe("NOT_A_STATUS");
    expect(statusMeta(undefined).tone).toBe("neutral");
  });

  it("marks terminal and attention states consistently", () => {
    expect(statusMeta("COMPLETED").terminal).toBe(true);
    expect(statusMeta("CANCELLED").terminal).toBe(true);
    expect(statusMeta("DELAYED").attention).toBe(true);
    expect(statusMeta("LIVE").attention).toBe(true);
    expect(statusMeta("PENDING").attention).toBeUndefined();
  });
});
