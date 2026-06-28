import { describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import { requireRole } from "./auth.js";

describe("role permissions", () => {
  it("allows LOGISTICS_MANAGER when included in an operations guard", () => {
    const next = vi.fn();
    const middleware = requireRole([Role.LOGISTICS_MANAGER]);

    middleware(
      {
        user: {
          id: "user_1",
          email: "manager@midyaf.local",
          role: Role.LOGISTICS_MANAGER
        }
      } as never,
      {} as never,
      next
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a role that is not included in the guard", () => {
    const next = vi.fn();
    const middleware = requireRole([Role.LOGISTICS_MANAGER]);

    expect(() =>
      middleware(
        {
          user: {
            id: "user_2",
            email: "guest@midyaf.local",
            role: Role.GUEST
          }
        } as never,
        {} as never,
        next
      )
    ).toThrow("Insufficient permissions");
    expect(next).not.toHaveBeenCalled();
  });
});
