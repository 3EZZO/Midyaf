import { MESSAGES_PORTAL, PORTALS, SUPPLIER_PORTAL } from "@shared/constants";
import type { PortalKey, Role } from "@shared/domain";

/**
 * Portals each role may open in the shell. Server routes enforce access
 * separately. Every role also has its own messages inbox (OPS-COLLAB-001).
 * The supplier workspace (SUPPLIER-001) is open to SUPPLIER, where it replaces
 * the company dashboard, and to SUPER_ADMIN, which sees every dashboard and
 * gets a read-only administrative view of it (ADMIN-PORTALS-001).
 */
export const portalsByRole: Record<Role, PortalKey[]> = {
  GUEST: ["guest", MESSAGES_PORTAL],
  DRIVER: ["captain", MESSAGES_PORTAL],
  ORGANIZER: [...PORTALS, MESSAGES_PORTAL],
  SUPPLIER: [SUPPLIER_PORTAL, MESSAGES_PORTAL],
  SUPER_ADMIN: [...PORTALS, SUPPLIER_PORTAL, MESSAGES_PORTAL],
  COORDINATOR: ["coordinator", MESSAGES_PORTAL],
  LOGISTICS_MANAGER: ["sila_operations", "company", "coordinator", "intake", MESSAGES_PORTAL],
  COMPANY_ORGANIZER: ["company", "client", "intake", "sila_operations", MESSAGES_PORTAL],
  EVENT_MANAGER: ["sila_operations", "coordinator", MESSAGES_PORTAL],
  CLIENT: ["client", MESSAGES_PORTAL]
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
