import { useState } from "react";
import type { OrganizationDto, OrganizationMemberDto } from "@shared/overhaul";
import { Section } from "./Section";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";

/**
 * ORG-MEMBERS (2026-10-31): organization members for the Super Admin and the
 * organization's owners/admins. Adding a user as ADMIN is what gives an
 * organizing company's account (e.g. the Sila Organizer) the «new event»
 * button. The server enforces every rule (owner-only ownership changes, last
 * owner, no self-change); this panel only offers the actions.
 */

const ROLES = ["ADMIN", "MEMBER", "OWNER"] as const;
type Role = (typeof ROLES)[number];

const input = "rounded-md border border-hairline bg-surface-1 p-2 text-sm text-ink";
const button = "rounded-md border border-gold-500/40 bg-gold-500/10 px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-40";

export function roleLabel(role: string, ar: boolean) {
  const labels: Record<string, [string, string]> = {
    OWNER: ["Owner", "مالك"],
    ADMIN: ["Admin (can create events)", "مدير (يمكنه إنشاء الفعاليات)"],
    MEMBER: ["Member", "عضو"]
  };
  const label = labels[role];
  return label ? (ar ? label[1] : label[0]) : role;
}

/** Owners/admins of the organization, or the Super Admin, manage its members. */
export function canManageMembers(organization: Pick<OrganizationDto, "myRole">, isSuperAdmin: boolean) {
  return isSuperAdmin || organization.myRole === "OWNER" || organization.myRole === "ADMIN";
}

export function OrganizationMembers({
  token,
  organization,
  isArabic: ar
}: {
  token: string;
  organization: OrganizationDto;
  isArabic: boolean;
}) {
  const [revision, refresh] = useState(0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("ADMIN");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const members = useWorkspaceResource<{ members: OrganizationMemberDto[] }>(
    token,
    `/organizations/${encodeURIComponent(organization.id)}/members`,
    revision
  );

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "ok", text: success });
      refresh((n) => n + 1);
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Request failed" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const base = `/organizations/${encodeURIComponent(organization.id)}/members`;

  return (
    <Section
      title={ar ? `أعضاء المؤسسة · ${organization.name}` : `Organization members · ${organization.name}`}
      description={
        ar
          ? "أضف الحساب بالبريد الإلكتروني المستخدم لتسجيل الدخول. دور «مدير» يتيح إنشاء الفعاليات وتعديلها."
          : "Add an account by its sign-in email. The Admin role can create and edit this organization's events."
      }
    >
      <div data-organization-members className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await run(
              () => workspaceRequest(token, base, { email: email.trim(), role }),
              ar ? "تمت إضافة العضو" : "Member added"
            );
            if (ok) setEmail("");
          }}
        >
          <label className="flex flex-col text-sm">
            {ar ? "البريد الإلكتروني" : "Email"}
            <input
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={input}
              dir="ltr"
            />
          </label>
          <label className="flex flex-col text-sm">
            {ar ? "الدور" : "Role"}
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} className={input}>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {roleLabel(value, ar)}
                </option>
              ))}
            </select>
          </label>
          <button className={button} disabled={busy}>
            {ar ? "إضافة عضو" : "Add member"}
          </button>
        </form>

        {message ? (
          <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-red-500" : "text-sm text-gold-500"}>
            {message.text}
          </p>
        ) : null}
        {members.error ? <p role="alert" className="text-sm text-red-500">{members.error}</p> : null}
        {!members.data && !members.error ? <p role="status">{ar ? "جاري التحميل…" : "Loading…"}</p> : null}

        {members.data ? (
          <ul className="space-y-2">
            {members.data.members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline p-2 text-sm">
                <span>
                  <strong>{member.user.name}</strong> · {roleLabel(member.role, ar)}
                  {member.status === "REVOKED" ? (ar ? " · مُلغى" : " · Revoked") : ""}
                </span>
                <span className="flex flex-wrap gap-2">
                  {member.status === "ACTIVE"
                    ? ROLES.filter((value) => value !== member.role).map((value) => (
                        <button
                          key={value}
                          className={button}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => workspaceRequest(token, `${base}/${member.id}`, { role: value }, "PATCH"),
                              ar ? "تم تحديث الدور" : "Role updated"
                            )
                          }
                        >
                          {ar ? `جعله ${roleLabel(value, ar)}` : `Make ${roleLabel(value, ar)}`}
                        </button>
                      ))
                    : null}
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          workspaceRequest(
                            token,
                            `${base}/${member.id}`,
                            { status: member.status === "ACTIVE" ? "REVOKED" : "ACTIVE" },
                            "PATCH"
                          ),
                        ar ? "تم تحديث العضوية" : "Membership updated"
                      )
                    }
                  >
                    {member.status === "ACTIVE" ? (ar ? "إلغاء العضوية" : "Revoke") : ar ? "إعادة التفعيل" : "Restore"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Section>
  );
}
