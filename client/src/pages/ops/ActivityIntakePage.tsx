// Former standalone event intake workflow (RADAR-ORGANIZER-001).
//
// Event setup, advisory planning, plan approval and RFQ drafting now live
// only in the company workspace, under «إدخال وتجهيز فعالية جديدة». This
// module stays as a redirect so any old deep link (?portal=intake, the
// command palette, bookmarks) lands on that single path instead of a second
// creation form with browser-local plan state. The legacy activity-intake
// and vendor-quote APIs remain protected on the server; nothing here calls them.
import { CompanyDashboard } from "./CompanyDashboard";
import type { PortalProps } from "../types";

export function ActivityIntakePage(props: PortalProps) {
  return <CompanyDashboard {...props} />;
}
