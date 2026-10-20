import type { WorkspaceEventDto } from "@shared/overhaul";
export const workspaceTabs = ["overview", "plan", "guests", "vendors", "teams", "permissions", "inbox", "radar"] as const;
export type WorkspaceTab = typeof workspaceTabs[number];
export function tabUnlocked(event: Pick<WorkspaceEventDto, "planApproved">, tab: WorkspaceTab) {
  return ["overview", "plan", "guests"].includes(tab) || event.planApproved;
}
export function categorizeEvents(events: WorkspaceEventDto[]) {
  return { PLANNING: events.filter(e => e.operationalStatus === "PLANNING"), ACTIVE: events.filter(e => e.operationalStatus === "ACTIVE"), COMPLETED: events.filter(e => e.operationalStatus === "COMPLETED") };
}
