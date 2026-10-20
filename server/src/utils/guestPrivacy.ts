import { EventMemberRole, MembershipStatus, Prisma } from "@prisma/client";
import type { GuestCodeOnlyDto, GuestDetailDto, GuestDto } from "../../../shared/overhaul.js";
import { HttpError } from "./http.js";
import type { EventAccess } from "./workspacePolicy.js";

/**
 * FULL-OVERHAUL-M2 guest privacy. A roster record is shown with details
 * (name, contact, room, hotel, travel) only to an allowed viewer; everyone
 * else with event access receives the guest code alone. Details are read
 * from the database only for records the viewer may see, so code-only
 * answers never carry the hidden fields, not even transiently in a DTO.
 *
 * - Unmasked guest: detail-tier event roles (PM/LM/Operations/Production/
 *   Fleet supervisor), organization OWNER/ADMIN and explicit grantees.
 * - Masked guest (privacyMasked): organization OWNER/ADMIN and explicit
 *   grantees of that guest or of its privacy group only.
 * - Support access, guests, captains, vendors and client viewers are
 *   code-only unless explicitly granted.
 *
 * Grants name validated ACTIVE event members, never the granting actor, and
 * every change is audited by the route. There is no request flag that
 * bypasses this.
 */

export const GUEST_DETAIL_ROLES: readonly EventMemberRole[] = [
  EventMemberRole.PROJECT_MANAGER,
  EventMemberRole.LOGISTICS_MANAGER,
  EventMemberRole.OPERATIONS_MANAGER,
  EventMemberRole.PRODUCTION_MANAGER,
  EventMemberRole.FLEET_SUPERVISOR
];

export type GuestViewer = {
  role?: EventAccess["actor"]["role"];
  userId: string;
  detailTier: boolean;
  orgAdmin: boolean;
  grantedGuestIds: ReadonlySet<string>;
  grantedGroups: ReadonlySet<string>;
};

export type MessageRedactions={terms:Array<{text:string;code:string}>;users:Map<string,string>};
/** Protect historical message text and user labels after a guest enables privacy. */
export async function loadMessageRedactions(db:Prisma.TransactionClient,access:EventAccess):Promise<MessageRedactions>{
 const viewer=await loadGuestViewer(db,access);
 const guests=await db.eventGuest.findMany({where:{eventId:access.event.id,privacyMasked:true},select:{...GUEST_CODE_SELECT,fullName:true,hotelName:true,contactEmail:true,contactPhone:true,guest:{select:{user:{select:{id:true,name:true}}}}},take:2001});
 if(guests.length>2000)throw new HttpError(503,'Private message boundary capacity exceeded');
 const terms:MessageRedactions['terms']=[],users=new Map<string,string>();
 for(const guest of guests){if(canViewGuestDetails(guest,viewer)||guest.guest?.user.id===access.actor.id)continue;
  if(guest.guest?.user)users.set(guest.guest.user.id,guest.guestCode);
  for(const text of [guest.fullName,guest.hotelName,guest.contactEmail,guest.contactPhone,guest.guest?.user.name])if(text&&text.trim().length>=2)terms.push({text,code:guest.guestCode});
 }
 terms.sort((a,b)=>b.text.length-a.text.length);return{terms,users};
}
export function redactMessagePayload<T>(payload:T,privacy:MessageRedactions):T{
 const text=(value:string)=>privacy.terms.reduce((result,term)=>result.replace(new RegExp(term.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),term.code),value);
 function visit(value:unknown,depth:number):unknown{
  if(depth>25)return null;
  if(!value||typeof value!=='object'||value instanceof Date||Buffer.isBuffer(value))return value;
  if(Array.isArray(value))return value.map(item=>visit(item,depth+1));
  const row=Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,typeof entry==='string'&&['name','subject','body','preview'].includes(key)?text(entry):visit(entry,depth+1)]));
  if(typeof row.id==='string'&&privacy.users.has(row.id)&&'name'in row)row.name=privacy.users.get(row.id);
  return row;
 }
 return visit(payload,0) as T;
}

export const GUEST_CODE_SELECT = {
  id: true,
  guestCode: true,
  isVip: true,
  privacyMasked: true,
  privacyGroup: true
} satisfies Prisma.EventGuestSelect;

export const GUEST_DETAIL_SELECT = {
  ...GUEST_CODE_SELECT,
  locationConsent: true,
  lastLat: true,
  lastLng: true,
  lastSeenAt: true,
  fullName: true,
  contactPhone: true,
  contactEmail: true,
  roomType: true,
  hotelName: true,
  arrivalAt: true,
  departureAt: true,
  ticketNumber: true,
  originCity: true,
  arrivalCity: true,
  departureCity: true
} satisfies Prisma.EventGuestSelect;

export type GuestCodeRow = Prisma.EventGuestGetPayload<{ select: typeof GUEST_CODE_SELECT }>;
export type GuestDetailRow = Prisma.EventGuestGetPayload<{ select: typeof GUEST_DETAIL_SELECT }>;

type GuestDb = Pick<Prisma.TransactionClient, "eventGuest" | "guestPrivacyGrant" | "eventMembership">;

/**
 * The viewer's privacy context in this event. Grants only count while the
 * viewer is an ACTIVE event member or organization admin; support access
 * never uses grants.
 */
export async function loadGuestViewer(db: GuestDb, access: EventAccess): Promise<GuestViewer> {
  const orgAdmin = access.isOrgAdmin;
  const detailTier = orgAdmin || Boolean(access.membership && GUEST_DETAIL_ROLES.includes(access.membership.role));
  const grantedGuestIds = new Set<string>();
  const grantedGroups = new Set<string>();

  if (!access.support && (orgAdmin || access.membership)) {
    const grants = await db.guestPrivacyGrant.findMany({
      where: { eventId: access.event.id, viewerUserId: access.actor.id },
      select: { eventGuestId: true, groupKey: true },
      take: 5000
    });
    for (const grant of grants) {
      if (grant.eventGuestId) grantedGuestIds.add(grant.eventGuestId);
      if (grant.groupKey) grantedGroups.add(grant.groupKey);
    }
  }

  return { role: access.actor.role, userId: access.actor.id, detailTier, orgAdmin, grantedGuestIds, grantedGroups };
}

export function canViewGuestDetails(
  guest: Pick<GuestCodeRow, "id" | "privacyMasked" | "privacyGroup">,
  viewer: GuestViewer
) {
  const explicit =
    viewer.grantedGuestIds.has(guest.id) ||
    Boolean(guest.privacyGroup && viewer.grantedGroups.has(guest.privacyGroup));
  if (guest.privacyMasked) return explicit;
  return viewer.detailTier || explicit;
}

function iso(value: Date | null) {
  return value ? new Date(value).toISOString() : null;
}

export function toCodeOnlyGuestDto(row: Pick<GuestCodeRow, "id" | "guestCode" | "isVip">): GuestCodeOnlyDto {
  return { id: row.id, guestCode: row.guestCode, isVip: row.isVip, masked: true };
}

export function toGuestDetailDto(row: GuestDetailRow): GuestDetailDto {
  return {
    id: row.id,
    guestCode: row.guestCode,
    isVip: row.isVip,
    masked: false,
    privacyMasked: row.privacyMasked,
    privacyGroup: row.privacyGroup,
    position: row.locationConsent && row.lastSeenAt && Date.now() - row.lastSeenAt.getTime() < 300_000 && row.lastLat != null && row.lastLng != null
      ? { lat: row.lastLat, lng: row.lastLng, at: row.lastSeenAt.toISOString() } : null,
    fullName: row.fullName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    roomType: row.roomType,
    hotelName: row.hotelName,
    arrivalAt: iso(row.arrivalAt),
    departureAt: iso(row.departureAt),
    ticketNumber: row.ticketNumber,
    originCity: row.originCity,
    arrivalCity: row.arrivalCity,
    departureCity: row.departureCity
  };
}

/**
 * DTOs for the given code rows, in their order: details are selected in a
 * second query restricted to the ids this viewer may see.
 */
export async function guestDtosFor(
  db: Pick<Prisma.TransactionClient, "eventGuest" | "auditLog">,
  eventId: string,
  rows: readonly GuestCodeRow[],
  viewer: GuestViewer
): Promise<GuestDto[]> {
  const visibleIds = rows.filter((row) => canViewGuestDetails(row, viewer)).map((row) => row.id);
  const revealed = rows.filter(row => row.privacyMasked && visibleIds.includes(row.id));
  if (revealed.length) await db.auditLog.create({ data: { actorUserId: viewer.userId, actorRole: viewer.role ?? null, action: "workspace.guest.private_read", entityType: "EVENT", entityId: eventId, eventId, metadata: { count: revealed.length } } });
  const details = visibleIds.length
    ? await db.eventGuest.findMany({
        where: { eventId, id: { in: visibleIds } },
        select: GUEST_DETAIL_SELECT
      })
    : [];
  const byId = new Map(details.map((detail) => [detail.id, detail]));
  return rows.map((row) => {
    const detail = byId.get(row.id);
    return detail ? toGuestDetailDto(detail) : toCodeOnlyGuestDto(row);
  });
}

/**
 * Validates allowed-viewer ids for a privacy grant: distinct, never the
 * acting user (no self-grant), and each an ACTIVE member of this event.
 */
export async function validatePrivacyViewers(
  db: Pick<Prisma.TransactionClient, "eventMembership">,
  eventId: string,
  actorId: string,
  viewerUserIds: readonly string[]
) {
  if (viewerUserIds.includes(actorId)) {
    throw new HttpError(403, "You cannot grant yourself guest privacy access");
  }
  if (viewerUserIds.length === 0) return [];
  const members = await db.eventMembership.findMany({
    where: { eventId, userId: { in: [...viewerUserIds] }, status: MembershipStatus.ACTIVE },
    select: { userId: true }
  });
  const found = new Set(members.map((member) => member.userId));
  if (viewerUserIds.some((id) => !found.has(id))) {
    throw new HttpError(400, "Allowed viewers must be active members of this event");
  }
  return [...viewerUserIds];
}
