import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrganizationDto, OrganizationMemberDto } from "@shared/overhaul";

/** ORG-MEMBERS: who may manage members, and what the panel offers. */

const resource = vi.hoisted(() => ({
  value: { data: undefined as { members: OrganizationMemberDto[] } | undefined, error: undefined as string | undefined }
}));
vi.mock("../lib/workspaceApi", () => ({ useWorkspaceResource: () => resource.value, workspaceRequest: vi.fn() }));

const { OrganizationMembers, canManageMembers, roleLabel } = await import("./OrganizationMembers");

const organization: OrganizationDto = {
  id: "org_demo",
  name: "Synthetic Events Co",
  slug: "synthetic-events",
  kind: "ORGANIZER_COMPANY",
  vendorCategory: null,
  myRole: null
};

const render = (isArabic = false) =>
  renderToStaticMarkup(<OrganizationMembers token="t" organization={organization} isArabic={isArabic} />);

describe("canManageMembers", () => {
  it("allows the Super Admin and the organization's owners and admins only", () => {
    expect(canManageMembers({ myRole: null }, true)).toBe(true);
    expect(canManageMembers({ myRole: "OWNER" }, false)).toBe(true);
    expect(canManageMembers({ myRole: "ADMIN" }, false)).toBe(true);
    expect(canManageMembers({ myRole: "MEMBER" }, false)).toBe(false);
    expect(canManageMembers({ myRole: null }, false)).toBe(false);
  });
});

describe("OrganizationMembers", () => {
  it("offers add-by-email with Admin as the default role and lists members", () => {
    resource.value = {
      data: {
        members: [
          { id: "om1", user: { id: "u1", name: "Synthetic Owner" }, role: "OWNER", status: "ACTIVE" },
          { id: "om2", user: { id: "u2", name: "Synthetic Organizer" }, role: "MEMBER", status: "REVOKED" }
        ]
      },
      error: undefined
    };
    const html = render();
    expect(html).toContain("Organization members · Synthetic Events Co");
    expect(html).toContain('type="email"');
    expect(html).toMatch(/<option value="ADMIN" selected="">Admin \(can create events\)<\/option>/);
    expect(html).toContain("Synthetic Owner");
    expect(html).toContain("Make Admin (can create events)");
    expect(html).toContain("Synthetic Organizer");
    expect(html).toContain("Revoked");
    expect(html).toContain("Restore");
  });

  it("has loading, error and Arabic states", () => {
    resource.value = { data: undefined, error: undefined };
    expect(render()).toContain("Loading");
    resource.value = { data: undefined, error: "Organization not found" };
    expect(render()).toContain("Organization not found");
    resource.value = { data: { members: [] }, error: undefined };
    expect(render(true)).toContain("أعضاء المؤسسة");
    expect(roleLabel("ADMIN", true)).toBe("مدير (يمكنه إنشاء الفعاليات)");
  });
});
