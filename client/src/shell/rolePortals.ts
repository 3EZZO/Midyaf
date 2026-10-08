import { PORTALS } from "@shared/constants";
import type { PortalKey, Role } from "@shared/domain";

/** Portals each role may open in the shell. Server routes enforce access separately. */
export const portalsByRole: Record<Role, PortalKey[]> = {
  GUEST: ["guest"],
  DRIVER: ["captain"],
  ORGANIZER: [...PORTALS],
  SUPPLIER: ["company"],
  SUPER_ADMIN: [...PORTALS],
  COORDINATOR: ["coordinator"],
  LOGISTICS_MANAGER: ["sila_operations", "company", "coordinator", "intake"],
  COMPANY_ORGANIZER: ["company", "client", "intake", "sila_operations"],
  EVENT_MANAGER: ["sila_operations", "coordinator"],
  CLIENT: ["client"]
};

/**
 * The portal a role lands on after signing in. Only the landing page differs
 * from the first allowed portal: an organizer (event manager) starts in
 * operations rather than the owners' admin page, without changing what it may
 * open.
 */
export function initialPortalForRole(role: Role): PortalKey {
  if (role === "ORGANIZER") return "sila_operations";
  return portalsByRole[role][0];
}
