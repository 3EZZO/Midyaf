// Organizing company dashboard.
import { useTranslation } from "react-i18next";
import { OrganizerWorkspace } from "../../components/OrganizerWorkspace";
import { isArabicLanguage } from "../../lib/localize";
import type { PortalProps } from "../types";

/**
 * RADAR-ORGANIZER-001: the company portal is the unified organizer workspace
 * for every role and in demo mode too. The former demo-only dashboard (local
 * intake summary, browser-stored client permissions) bypassed it and is
 * gone; the scripted War Room demo is unaffected. Event setup happens only
 * in the workspace's «إدخال وتجهيز فعالية جديدة» section.
 */
export function CompanyDashboard({ session }: PortalProps) {
  const { i18n } = useTranslation();
  return <OrganizerWorkspace session={session} isArabic={isArabicLanguage(i18n.language)} />;
}
