import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@shared/domain";
import type { PortalProps } from "../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

// The unified workspace is the only destination; its own behaviour is tested in OrganizerWorkspace.test.tsx.
vi.mock("../../components/OrganizerWorkspace", () => ({
  OrganizerWorkspace: ({ session, isArabic }: { session?: Session | null; isArabic: boolean }) => (
    <div data-unified-workspace={session?.user.role ?? "none"} data-arabic={String(isArabic)} />
  )
}));

import { ActivityIntakePage } from "./ActivityIntakePage";
import { CompanyDashboard } from "./CompanyDashboard";

/**
 * RADAR-ORGANIZER-001: one event-creation path. The company portal and the
 * retired intake page both render the unified organizer workspace for every
 * role, in demo mode too.
 */
const session = (role: Session["user"]["role"]) =>
  ({
    accessToken: "synthetic",
    refreshToken: "synthetic",
    user: { id: "synthetic", role, name: "Synthetic", email: "synthetic@example.test", phone: "", language: "en" }
  }) as Session;

const props = (over: Partial<PortalProps>) => ({ data: {}, isDemoMode: false, ...over }) as unknown as PortalProps;

describe("single organizer entry path", () => {
  for (const role of ["SUPER_ADMIN", "ORGANIZER", "COMPANY_ORGANIZER", "LOGISTICS_MANAGER"] as const) {
    for (const isDemoMode of [false, true]) {
      it(`renders the unified workspace for ${role}${isDemoMode ? " in demo mode" : ""}`, () => {
        for (const Page of [CompanyDashboard, ActivityIntakePage]) {
          const html = renderToStaticMarkup(<Page {...props({ session: session(role), isDemoMode })} />);
          expect(html).toContain(`data-unified-workspace="${role}"`);
          expect(html).not.toContain("<form");
        }
      });
    }
  }

  it("keeps no browser-local plan approval or legacy intake calls in the entry modules", () => {
    for (const file of ["ActivityIntakePage.tsx", "CompanyDashboard.tsx"]) {
      const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/ops", file), "utf8");
      expect(source).not.toMatch(/localPlanApproved|saveActivityIntake|analyzeActivityIntake|localStorage|\/activity-intakes/);
      expect(source).not.toMatch(/isDemoMode\s*\?/);
    }
  });
});
