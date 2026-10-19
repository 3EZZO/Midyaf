import { Router } from "express";
import {z} from 'zod';
import {dualEta,type Point} from '../services/operationalProviders.js';
import {
  EtaSource,
  EventMemberRole,
  EventPermission,
  FlightScope,
  MembershipStatus,
  Prisma,
  Role,
  TripStatus,
  VehicleStatus
} from "@prisma/client";
import {
  canTransitionTrip,
  densityCreateSchema,
  flightCreateSchema,
  shiftCreateSchema,
  shiftUpdateSchema,
  suppressDensity,
  telemetryQuerySchema,
  tripCreateSchema,
  tripUpdateSchema,
  vehicleCreateSchema,
  vehiclePositionSchema,
  vehicleUpdateSchema,
  type DensityDto,
  type FlightDto,
  type ShiftDto,
  type TelemetrySnapshotDto,
  type TripDto,
  type VehicleDto
} from "../../../shared/overhaul.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import {
  GUEST_CODE_SELECT,
  canViewGuestDetails,
  guestDtosFor,
  loadGuestViewer,
  type GuestViewer
} from "../utils/guestPrivacy.js";
import {
  FLEET_ROLES,
  OPERATIONS_ROLES,
  WORKSPACE_TRANSACTION,
  hasEventRole,
  loadEventAccess,
  lockRow,
  parseRouteId,
  requireEventOpen,
  requirePermission,
  requirePlanApproved,
  toWorkspaceHttpError,
  writeWorkspaceAudit,
  type EventAccess
} from "../utils/workspacePolicy.js";

/**
 * FULL-OVERHAUL-M2 telemetry (inside /workspace): vehicles, trips with
 * passengers and dual ETAs, event/general flights, captain shifts and
 * aggregate density. Locked until the plan is approved (423).
 *
 * - Read: organization admins, operations event roles and support (audited)
 *   see the event; a captain sees only its own vehicle, trips and shifts.
 *   Passengers are privacy DTOs and a vehicle carrying a masked passenger
 *   the viewer may not see has its position withheld. Density below the
 *   threshold is suppressed.
 * - Write: fleet roles (LM, fleet supervisor) or organization admins with
 *   EDIT manage vehicles, trips and shifts; operations roles add event
 *   flights and density; a captain updates its own position and trips.
 *   General (non-event) flights are platform data written by SUPER_ADMIN.
 * - Typed ETAs are stored as APPROXIMATE; PROVIDER values are reserved for
 *   the server-side provider integration (M6). Nothing here fabricates a
 *   live value.
 */

const router = Router();
router.use(requireAuth);
router.get('/events/:eventId/fleet-captains',asyncHandler(async(req:AuthRequest,res)=>{
 const access=await loadTelemetryAccess(req,req.params.eventId);requireFleetManager(access);
 const members=await prisma.eventMembership.findMany({where:{eventId:access.event.id,role:EventMemberRole.CAPTAIN,status:MembershipStatus.ACTIVE},select:{userId:true},take:500});
 const captains=await prisma.driver.findMany({where:{userId:{in:members.map(m=>m.userId)},active:true},select:{id:true,user:{select:{name:true}}},take:500});
 res.json({captains:captains.map(c=>({id:c.id,name:c.user.name}))});
}));

router.get('/events/:eventId/my-journey',asyncHandler(async(req:AuthRequest,res)=>{
 const access=await loadEventAccess(req,req.params.eventId);requirePlanApproved(access);
 if(!access.guestId)throw new HttpError(403,'This endpoint is for the event guest');
 const guest=await prisma.eventGuest.findFirst({where:{eventId:access.event.id,guestId:access.guestId},select:GUEST_CODE_SELECT});
 if(!guest)throw new HttpError(404,'Guest roster record not found');
 const viewer=await loadGuestViewer(prisma,access),ownViewer={...viewer,grantedGuestIds:new Set([...viewer.grantedGuestIds,guest.id])};
 const trips=await prisma.trip.findMany({where:{eventId:access.event.id,passengers:{some:{eventGuestId:guest.id}}},select:TRIP_SELECT,orderBy:{scheduledAt:'desc'},take:20});
 res.json({guest:(await guestDtosFor(prisma,access.event.id,[guest],ownViewer))[0],trips:await toTripDtos(access.event.id,trips,ownViewer)});
}));

const OPEN_TRIPS: TripStatus[] = [TripStatus.SCHEDULED, TripStatus.EN_ROUTE_TO_PICKUP, TripStatus.ON_BOARD];

type TelemetryScope = "FULL" | "CAPTAIN_SELF";

function telemetryScope(access: EventAccess): TelemetryScope {
  if (access.isOrgAdmin || access.support) return "FULL";
  if (access.permissions.has(EventPermission.VIEW) && hasEventRole(access, OPERATIONS_ROLES)) return "FULL";
  if (access.permissions.has(EventPermission.VIEW) && hasEventRole(access, [EventMemberRole.CAPTAIN])) return "CAPTAIN_SELF";
  throw new HttpError(403, "Your role in this event has no telemetry access");
}

function requireFleetManager(access: EventAccess) {
  if (access.support) throw new HttpError(403, "Support access cannot change telemetry");
  requirePermission(access, EventPermission.EDIT);
  if (!access.isOrgAdmin && !hasEventRole(access, FLEET_ROLES)) {
    throw new HttpError(403, "Only fleet roles manage vehicles, trips and shifts");
  }
}

function requireOperationsWriter(access: EventAccess) {
  if (access.support) throw new HttpError(403, "Support access cannot change telemetry");
  requirePermission(access, EventPermission.EDIT);
  if (!access.isOrgAdmin && !hasEventRole(access, OPERATIONS_ROLES)) {
    throw new HttpError(403, "Only operations roles record flights and density");
  }
}

async function loadTelemetryAccess(req: AuthRequest, eventId: unknown) {
  const access = await loadEventAccess(req, eventId);
  requirePlanApproved(access);
  requirePermission(access, EventPermission.VIEW);
  return access;
}

/** The actor's own driver profile (captain self-scope). */
async function ownDriverId(access: EventAccess) {
  const driver = await prisma.driver.findUnique({ where: { userId: access.actor.id }, select: { id: true } });
  return driver?.id ?? null;
}

/** A driver usable in this event: active profile and ACTIVE CAPTAIN member. */
async function assertEventCaptain(eventId: string, driverId: string, db: Prisma.TransactionClient = prisma) {
  const driver = await db.driver.findUnique({
    where: { id: driverId },
    select: { id: true, userId: true, active: true }
  });
  const member = driver
    ? await db.eventMembership.findUnique({
        where: { eventId_userId: { eventId, userId: driver.userId } },
        select: { role: true, status: true }
      })
    : null;
  if (!driver || !driver.active || member?.role !== EventMemberRole.CAPTAIN || member.status !== MembershipStatus.ACTIVE) {
    throw new HttpError(400, "The driver must be an active captain of this event");
  }
  return driver;
}

const personOfDriver = { select: { id: true, user: { select: { id: true, name: true } } } } as const;

function iso(value: Date | null) {
  return value ? new Date(value).toISOString() : null;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

const VEHICLE_SELECT = {
  id: true,
  plateNumber: true,
  label: true,
  capacity: true,
  status: true,
  lastLat: true,
  lastLng: true,
  lastSeenAt: true,
  inZone: true,
  driver: personOfDriver
} satisfies Prisma.VehicleSelect;

const TRIP_SELECT = {
  id: true,
  status: true,
  vehicleId: true,
  originLabel: true,
  originLat: true,
  originLng: true,
  destinationLabel: true,
  destinationLat: true,
  destinationLng: true,
  routePolyline: true,
  inZone: true,
  captainEtaMinutes: true,
  destinationEtaMinutes: true,
  etaSource: true,
  etaUpdatedAt: true,
  scheduledAt: true,
  driver: personOfDriver,
  passengers: { select: { eventGuest: { select: GUEST_CODE_SELECT } }, orderBy: { createdAt: "asc" } }
} satisfies Prisma.TripSelect;

type TripRow = Prisma.TripGetPayload<{ select: typeof TRIP_SELECT }>;
type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof VEHICLE_SELECT }>;

function protectedTrip(trip: TripRow, viewer: GuestViewer) {
  return trip.passengers.some(seat => seat.eventGuest.privacyMasked && !canViewGuestDetails(seat.eventGuest, viewer));
}

async function toTripDtos(eventId: string, trips: TripRow[], viewer: GuestViewer): Promise<TripDto[]> {
  const passengers = trips.flatMap((trip) => trip.passengers.map((seat) => seat.eventGuest));
  const unique = [...new Map(passengers.map((guest) => [guest.id, guest])).values()];
  const dtos = new Map((await guestDtosFor(prisma, eventId, unique, viewer)).map((dto) => [dto.id, dto]));
  return trips.map((trip) => ({
    id: trip.id,
    status: trip.status,
    movementWithheld: trip.passengers.some(seat => seat.eventGuest.privacyMasked && !canViewGuestDetails(seat.eventGuest, viewer)),
    vehicleId: protectedTrip(trip, viewer) ? null : trip.vehicleId,
    driver: protectedTrip(trip, viewer) ? null : trip.driver ? trip.driver.user : null,
    passengers: trip.passengers.map((seat) => dtos.get(seat.eventGuest.id)!),
    origin: protectedTrip(trip, viewer) ? null : { label: trip.originLabel, lat: trip.originLat, lng: trip.originLng },
    destination: protectedTrip(trip, viewer) ? null : { label: trip.destinationLabel, lat: trip.destinationLat, lng: trip.destinationLng },
    routePolyline: protectedTrip(trip, viewer) ? null : trip.routePolyline,
    inZone: protectedTrip(trip, viewer) ? null : trip.inZone,
    eta: {
      captainToGuestMinutes: protectedTrip(trip, viewer) ? null : trip.captainEtaMinutes,
      guestToDestinationMinutes: protectedTrip(trip, viewer) ? null : trip.destinationEtaMinutes,
      source: protectedTrip(trip, viewer) ? "UNAVAILABLE" : trip.etaSource,
      live: !protectedTrip(trip, viewer) && trip.etaSource === EtaSource.PROVIDER,
      updatedAt: protectedTrip(trip, viewer) ? null : iso(trip.etaUpdatedAt)
    },
    scheduledAt: new Date(trip.scheduledAt).toISOString()
  }));
}

/** Whether any private trip of this vehicle hides its position from the viewer. */
async function vehicleWithheld(eventId: string, vehicleId: string, viewer: GuestViewer, db: Prisma.TransactionClient = prisma) {
  const trips = await db.trip.findMany({
    where: { eventId, vehicleId, passengers: { some: { eventGuest: { privacyMasked: true } } } },
    select: TRIP_SELECT,
    take: 5001
  });
  if (trips.length > 5000) throw new HttpError(503, "Private-trip boundary capacity exceeded");
  return trips.some((trip) => protectedTrip(trip, viewer));
}

function toVehicleDto(vehicle: VehicleRow, withheld: boolean): VehicleDto {
  const hasPosition = vehicle.lastLat !== null && vehicle.lastLng !== null;
  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    label: vehicle.label,
    capacity: vehicle.capacity,
    status: vehicle.status,
    driver: vehicle.driver ? vehicle.driver.user : null,
    position:
      hasPosition && !withheld
        ? { lat: vehicle.lastLat as number, lng: vehicle.lastLng as number, at: iso(vehicle.lastSeenAt) }
        : null,
    positionWithheld: hasPosition && withheld,
    inZone: vehicle.inZone
  };
}

router.get(
  "/events/:eventId/telemetry",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    const scope = telemetryScope(access);
    const query = telemetryQuerySchema.parse(req.query);
    const eventId = access.event.id;
    const driverId = scope === "CAPTAIN_SELF" ? await ownDriverId(access) : null;
    if (scope === "CAPTAIN_SELF" && !driverId) throw new HttpError(403, "No driver profile is linked to you");
    const own: { driverId?: string } = driverId ? { driverId } : {};

    const [vehicles, trips, flights, shifts, density, viewer] = await Promise.all([
      prisma.vehicle.findMany({
        where: { eventId, ...own, ...(query.vehicleStatus ? { status: query.vehicleStatus } : {}) },
        select: VEHICLE_SELECT,
        orderBy: [{ plateNumber: "asc" }, { id: "asc" }],
        take: 500
      }),
      prisma.trip.findMany({
        where: { eventId, ...own },
        select: TRIP_SELECT,
        orderBy: [{ scheduledAt: "desc" }, { id: "asc" }],
        take: 200
      }),
      prisma.flight.findMany({
        where:
          query.flightScope === "EVENT"
            ? { scope: FlightScope.EVENT, eventId }
            : query.flightScope === "GENERAL"
              ? { scope: FlightScope.GENERAL }
              : { OR: [{ scope: FlightScope.EVENT, eventId }, { scope: FlightScope.GENERAL }] },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        take: 300
      }),
      prisma.captainShift.findMany({
        where: { eventId, ...own },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          available: true,
          zoneLabel: true,
          driver: personOfDriver
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 300
      }),
      prisma.densitySample.findMany({
        where: { eventId },
        orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
        take: 500
      }),
      loadGuestViewer(prisma, access)
    ]);

    // Position of a vehicle carrying a masked guest hidden from this viewer.
    const withheld = new Set<string>();
    for (const trip of trips) {
      if (!trip.vehicleId || !OPEN_TRIPS.includes(trip.status)) continue;
      if (trip.passengers.some((seat) => seat.eventGuest.privacyMasked && !canViewGuestDetails(seat.eventGuest, viewer))) {
        withheld.add(trip.vehicleId);
      }
    }

    // Also withhold stale vehicle observations from older private trips outside the page.
    const privateTrips = await prisma.trip.findMany({
      where: { eventId, vehicleId: { not: null }, passengers: { some: { eventGuest: { privacyMasked: true } } } },
      select: TRIP_SELECT, take: 5001
    });
    if(privateTrips.length>5000)throw new HttpError(503,'Private-trip boundary capacity exceeded');
    for (const trip of privateTrips) if (trip.vehicleId && protectedTrip(trip, viewer)) withheld.add(trip.vehicleId);
    const latestByZone = new Map<string, (typeof density)[number]>();
    for (const sample of density) if (!latestByZone.has(sample.zoneKey)) latestByZone.set(sample.zoneKey, sample);
    const densityDtos: DensityDto[] = [...latestByZone.values()].map((sample) => ({
      zoneKey: sample.zoneKey,
      capturedAt: new Date(sample.capturedAt).toISOString(),
      ...suppressDensity(sample.headcount),
      capacity: sample.capacity
    }));

    const snapshot: TelemetrySnapshotDto = {
      eventId,
      vehicles: vehicles.map((vehicle) => toVehicleDto(vehicle, withheld.has(vehicle.id))),
      trips: await toTripDtos(eventId, trips, viewer),
      flights: flights.map(
        (flight): FlightDto => ({
          id: flight.id,
          scope: flight.scope,
          flightNumber: flight.flightNumber,
          airline: flight.airline,
          originCode: flight.originCode,
          destinationCode: flight.destinationCode,
          scheduledAt: new Date(flight.scheduledAt).toISOString(),
          estimatedAt: iso(flight.estimatedAt),
          status: flight.status,
          dataSource: flight.dataSource
        })
      ),
      shifts: shifts.map(
        (shift): ShiftDto => ({
          id: shift.id,
          driver: shift.driver.user,
          startsAt: new Date(shift.startsAt).toISOString(),
          endsAt: new Date(shift.endsAt).toISOString(),
          status: shift.status,
          available: shift.available,
          zoneLabel: shift.zoneLabel
        })
      ),
      density: densityDtos,
      guests: scope === 'FULL' ? await guestDtosFor(prisma,eventId,await prisma.eventGuest.findMany({where:{eventId},select:GUEST_CODE_SELECT,take:2000}),viewer) : [],
      observedAt: new Date().toISOString(),
      weather: {available:false,source:'No weather feed configured',observedAt:null},
      scope
    };
    res.json({ telemetry: snapshot });
  })
);

router.post('/events/:eventId/trips/:tripId/eta',asyncHandler(async(req:AuthRequest,res)=>{
 z.object({}).strict().parse(req.body);
 const access=await loadTelemetryAccess(req,req.params.eventId),scope=telemetryScope(access);
 const id=parseRouteId(req.params.tripId,()=>new HttpError(404,'Trip not found'));
 const result=await prisma.$transaction(async tx=>{
  await lockRow(tx,'Event',access.event.id);
  const current=await loadEventAccess(req,access.event.id,tx);requirePlanApproved(current);const currentScope=telemetryScope(current);
  await lockRow(tx,'Trip',id);
  let trip=await tx.trip.findFirst({where:{id,eventId:access.event.id},select:TRIP_SELECT});
  if(!trip||(currentScope==='CAPTAIN_SELF'&&trip.driver?.user.id!==current.actor.id))throw new HttpError(404,'Trip not found');
  for(const guestId of trip.passengers.map(p=>p.eventGuest.id).sort())await lockRow(tx,'EventGuest',guestId);
  trip=await tx.trip.findFirst({where:{id,eventId:access.event.id},select:TRIP_SELECT});
  if(!trip)throw new HttpError(404,'Trip not found');
  if(current.support)throw new HttpError(403,'Support access cannot refresh route estimates');
  if(protectedTrip(trip,await loadGuestViewer(tx,current)))throw new HttpError(403,'Passenger privacy restricts this route');
  const vehicle=trip.vehicleId?await tx.vehicle.findUnique({where:{id:trip.vehicleId},select:{lastLat:true,lastLng:true,lastSeenAt:true}}):null;
  const point=(lat:number|null|undefined,lng:number|null|undefined):Point|null=>lat!=null&&lng!=null?{lat,lng}:null;
  const captain=vehicle?.lastSeenAt&&Date.now()-vehicle.lastSeenAt.getTime()<120000?point(vehicle.lastLat,vehicle.lastLng):null;
  const eta=await dualEta(captain,point(trip.originLat,trip.originLng),point(trip.destinationLat,trip.destinationLng));
  const legs=[eta.captainToGuest,eta.guestToDestination];
  const source=legs.every(leg=>leg.source==='PROVIDER')?EtaSource.PROVIDER:legs.some(leg=>leg.minutes!==null)?EtaSource.APPROXIMATE:EtaSource.UNAVAILABLE;
  const points=eta.guestToDestination.route,count=Math.min(400,points.length);
  const route=Array.from({length:count},(_,i)=>{const p=points[Math.round(i*(points.length-1)/Math.max(1,count-1))];return{lat:Number(p.lat.toFixed(6)),lng:Number(p.lng.toFixed(6))};});
  await tx.trip.update({where:{id:trip.id},data:{captainEtaMinutes:eta.captainToGuest.minutes,destinationEtaMinutes:eta.guestToDestination.minutes,etaSource:source,etaUpdatedAt:new Date(),routePolyline:route.length?JSON.stringify(route):null}});
  await writeWorkspaceAudit(tx,req,{action:'workspace.trip.eta',entityType:'TRIP',entityId:trip.id,eventId:access.event.id,metadata:{source,captainSource:legs[0].source,destinationSource:legs[1].source}});
  return eta;
 },WORKSPACE_TRANSACTION).catch((error:unknown)=>{throw toWorkspaceHttpError(error);});
 res.json({eta:result});
}));

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

router.post(
  "/events/:eventId/vehicles",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireFleetManager(access);
    requireEventOpen(access);
    const body = vehicleCreateSchema.parse(req.body);
    if (body.driverId) await assertEventCaptain(access.event.id, body.driverId);

    const vehicle = await prisma
      .$transaction(async (tx) => {
        const created = await tx.vehicle.create({
          data: {
            eventId: access.event.id,
            plateNumber: body.plateNumber,
            label: body.label,
            capacity: body.capacity,
            driverId: body.driverId ?? null
          },
          select: VEHICLE_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.vehicle.create",
          entityType: "VEHICLE",
          entityId: created.id,
          eventId: access.event.id,
          after: { plateNumber: created.plateNumber, driverId: body.driverId ?? null }
        });
        return created;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error, "A vehicle with this plate is already registered for the event");
      });

    res.status(201).json({ vehicle: toVehicleDto(vehicle, false) });
  })
);

function vehicleNotFound() {
  return new HttpError(404, "Vehicle not found");
}

/**
 * Locks the Event first (the order of the dispatch, ETA and team paths) and
 * re-evaluates the actor's current access, plan approval and open state
 * inside the transaction, so a membership revoked or changed while the
 * request was in flight cannot still write fleet data.
 */
async function lockedTelemetryAccess(req: AuthRequest, tx: Prisma.TransactionClient, eventId: string) {
  await lockRow(tx, "Event", eventId);
  const current = await loadEventAccess(req, eventId, tx);
  requirePlanApproved(current);
  requirePermission(current, EventPermission.VIEW);
  requireEventOpen(current);
  return current;
}

/**
 * Mirrors a vehicle's reported zone onto its open trips. Completed and
 * cancelled trips keep their historical value. This is a reported
 * observation, not a computed geofence.
 */
async function syncOpenTripZone(tx: Prisma.TransactionClient, eventId: string, vehicleId: string, inZone: boolean) {
  await tx.trip.updateMany({ where: { eventId, vehicleId, status: { in: OPEN_TRIPS } }, data: { inZone } });
}

router.patch(
  "/events/:eventId/vehicles/:vehicleId",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireFleetManager(access);
    requireEventOpen(access);
    const vehicleId = parseRouteId(req.params.vehicleId, vehicleNotFound);
    const body = vehicleUpdateSchema.parse(req.body);

    const vehicle = await prisma
      .$transaction(async (tx) => {
        const current = await lockedTelemetryAccess(req, tx, access.event.id);
        requireFleetManager(current);
        if (body.driverId) await assertEventCaptain(current.event.id, body.driverId, tx);
        await lockRow(tx, "Vehicle", vehicleId);
        const before = await tx.vehicle.findFirst({
          where: { id: vehicleId, eventId: current.event.id },
          select: { id: true, status: true, driverId: true, label: true, capacity: true, inZone: true }
        });
        if (!before) throw vehicleNotFound();
        // A manual OUT_OF_ZONE report marks the vehicle out of zone; moving
        // it to another status reports its return to the zone.
        const inZone =
          body.status === VehicleStatus.OUT_OF_ZONE
            ? false
            : body.status !== undefined && before.status === VehicleStatus.OUT_OF_ZONE
              ? true
              : undefined;
        const updated = await tx.vehicle.update({
          where: { id: before.id },
          data: {
            ...(body.label !== undefined ? { label: body.label } : {}),
            ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.driverId !== undefined ? { driverId: body.driverId } : {}),
            ...(inZone !== undefined ? { inZone } : {})
          },
          select: VEHICLE_SELECT
        });
        if (inZone !== undefined) await syncOpenTripZone(tx, current.event.id, before.id, inZone);
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.vehicle.update",
          entityType: "VEHICLE",
          entityId: before.id,
          eventId: current.event.id,
          before,
          after: { ...body, ...(inZone !== undefined ? { inZone } : {}) }
        });
        // The stored position of a vehicle carrying a private passenger stays
        // withheld here exactly as in the telemetry snapshot, for the
        // viewer's grants as they are now.
        const withheld = await vehicleWithheld(current.event.id, updated.id, await loadGuestViewer(tx, current), tx);
        return toVehicleDto(updated, withheld);
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ vehicle });
  })
);

/** Fleet managers, or the vehicle's currently assigned captain with an active driver profile. */
async function assertPositionReporter(access: EventAccess, vehicleDriverId: string | null, db: Prisma.TransactionClient) {
  const manager = !access.support && access.permissions.has(EventPermission.EDIT) &&
    (access.isOrgAdmin || hasEventRole(access, FLEET_ROLES));
  if (manager) return;
  const driver = hasEventRole(access, [EventMemberRole.CAPTAIN])
    ? await db.driver.findUnique({ where: { userId: access.actor.id }, select: { id: true, active: true } })
    : null;
  if (!driver?.active || vehicleDriverId !== driver.id) {
    throw new HttpError(403, "Only the assigned captain or fleet roles report this position");
  }
}

router.post(
  "/events/:eventId/vehicles/:vehicleId/position",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireEventOpen(access);
    const vehicleId = parseRouteId(req.params.vehicleId, vehicleNotFound);
    const body = vehiclePositionSchema.parse(req.body);

    const vehicle = await prisma
      .$transaction(async (tx) => {
        const current = await lockedTelemetryAccess(req, tx, access.event.id);
        await lockRow(tx, "Vehicle", vehicleId);
        const before = await tx.vehicle.findFirst({
          where: { id: vehicleId, eventId: current.event.id },
          select: { id: true, status: true, driverId: true }
        });
        if (!before) throw vehicleNotFound();
        // Access and the actual assignment are checked under the locks.
        await assertPositionReporter(current, before.driverId, tx);

        // Leaving the zone flags the vehicle; returning makes it available again.
        const status = !body.inZone
          ? VehicleStatus.OUT_OF_ZONE
          : before.status === VehicleStatus.OUT_OF_ZONE
            ? VehicleStatus.AVAILABLE
            : before.status;
        const updated = await tx.vehicle.update({
          where: { id: before.id },
          data: { lastLat: body.lat, lastLng: body.lng, lastSeenAt: new Date(), inZone: body.inZone, status },
          select: VEHICLE_SELECT
        });
        await syncOpenTripZone(tx, current.event.id, before.id, body.inZone);
        const withheld = await vehicleWithheld(current.event.id, updated.id, await loadGuestViewer(tx, current), tx);
        return toVehicleDto(updated, withheld);
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ vehicle });
  })
);

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

function tripNotFound() {
  return new HttpError(404, "Trip not found");
}

router.post(
  "/events/:eventId/trips",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireFleetManager(access);
    requireEventOpen(access);
    const body = tripCreateSchema.parse(req.body);
    const eventId = access.event.id;

    if (body.driverId) await assertEventCaptain(eventId, body.driverId);
    if (body.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({ where: { id: body.vehicleId, eventId }, select: { id: true } });
      if (!vehicle) throw new HttpError(400, "The vehicle does not belong to this event");
    }
    if (body.passengerGuestIds.length > 0) {
      const found = await prisma.eventGuest.count({ where: { eventId, id: { in: body.passengerGuestIds } } });
      if (found !== body.passengerGuestIds.length) throw new HttpError(400, "Passengers must be guests of this event");
    }

    const trip = await prisma
      .$transaction(async (tx) => {
        const created = await tx.trip.create({
          data: {
            eventId,
            vehicleId: body.vehicleId ?? null,
            driverId: body.driverId ?? null,
            originLabel: body.originLabel,
            originLat: body.originLat ?? null,
            originLng: body.originLng ?? null,
            destinationLabel: body.destinationLabel,
            destinationLat: body.destinationLat ?? null,
            destinationLng: body.destinationLng ?? null,
            scheduledAt: body.scheduledAt,
            etaSource: EtaSource.UNAVAILABLE,
            passengers: { create: body.passengerGuestIds.map((eventGuestId) => ({ eventGuestId })) }
          },
          select: TRIP_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.trip.create",
          entityType: "TRIP",
          entityId: created.id,
          eventId,
          after: {
            vehicleId: body.vehicleId ?? null,
            driverId: body.driverId ?? null,
            passengers: body.passengerGuestIds.length
          }
        });
        return created;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    const [dto] = await toTripDtos(eventId, [trip], await loadGuestViewer(prisma, access));
    res.status(201).json({ trip: dto });
  })
);

router.patch(
  "/events/:eventId/trips/:tripId",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireEventOpen(access);
    const tripId = parseRouteId(req.params.tripId, tripNotFound);
    const body = tripUpdateSchema.parse(req.body);
    const eventId = access.event.id;

    const manager = !access.support && access.permissions.has(EventPermission.EDIT) &&
      (access.isOrgAdmin || hasEventRole(access, FLEET_ROLES));
    const captainDriverId = !manager && hasEventRole(access, [EventMemberRole.CAPTAIN]) ? await ownDriverId(access) : null;
    if (!manager && !captainDriverId) throw new HttpError(403, "Only fleet roles and the trip's captain update trips");
    if (!manager && body.routePolyline !== undefined) {
      throw new HttpError(403, "Only fleet roles change the route");
    }

    const trip = await prisma
      .$transaction(async (tx) => {
        // Same Event -> Trip order as the ETA refresh; the writer is re-checked as it is now.
        const fresh = await lockedTelemetryAccess(req, tx, eventId);
        const freshManager = !fresh.support && fresh.permissions.has(EventPermission.EDIT) &&
          (fresh.isOrgAdmin || hasEventRole(fresh, FLEET_ROLES));
        if (manager && !freshManager) throw new HttpError(403, "Only fleet roles and the trip's captain update trips");
        if (!manager && !hasEventRole(fresh, [EventMemberRole.CAPTAIN])) {
          throw new HttpError(403, "Only fleet roles and the trip's captain update trips");
        }
        await lockRow(tx, "Trip", tripId);
        const current = await tx.trip.findFirst({
          where: { id: tripId, eventId },
          select: {
            id: true,
            status: true,
            driverId: true,
            captainEtaMinutes: true,
            destinationEtaMinutes: true,
            etaSource: true
          }
        });
        if (!current) throw tripNotFound();
        if (captainDriverId && current.driverId !== captainDriverId) throw tripNotFound();
        if (body.status && body.status !== current.status && !canTransitionTrip(current.status, body.status)) {
          throw new HttpError(409, `Cannot move a trip from ${current.status} to ${body.status}`);
        }

        const now = new Date();
        const data: Prisma.TripUncheckedUpdateInput = {};
        if (body.status && body.status !== current.status) {
          data.status = body.status;
          if (body.status === TripStatus.EN_ROUTE_TO_PICKUP) data.startedAt = now;
          if (body.status === TripStatus.COMPLETED || body.status === TripStatus.CANCELLED) data.completedAt = now;
        }
        if (body.inZone !== undefined) data.inZone = body.inZone;
        if (body.routePolyline !== undefined) data.routePolyline = body.routePolyline;

        const etaTouched = body.captainEtaMinutes !== undefined || body.destinationEtaMinutes !== undefined;
        if (etaTouched) {
          const captainEta = body.captainEtaMinutes !== undefined ? body.captainEtaMinutes : current.captainEtaMinutes;
          const destinationEta =
            body.destinationEtaMinutes !== undefined ? body.destinationEtaMinutes : current.destinationEtaMinutes;
          // A typed value is never a live provider value.
          data.captainEtaMinutes = captainEta;
          data.destinationEtaMinutes = destinationEta;
          data.etaSource = captainEta === null && destinationEta === null ? EtaSource.UNAVAILABLE : EtaSource.APPROXIMATE;
          data.etaUpdatedAt = now;
        }

        const updated = await tx.trip.update({ where: { id: current.id }, data, select: TRIP_SELECT });
        if (data.status !== undefined) {
          await writeWorkspaceAudit(tx, req, {
            action: "workspace.trip.status",
            entityType: "TRIP",
            entityId: current.id,
            eventId,
            before: { status: current.status },
            after: { status: data.status },
            metadata: { byCaptain: Boolean(captainDriverId) }
          });
        }
        return updated;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    const [dto] = await toTripDtos(eventId, [trip], await loadGuestViewer(prisma, access));
    res.json({ trip: dto });
  })
);

// ---------------------------------------------------------------------------
// Flights, shifts, density
// ---------------------------------------------------------------------------

router.post(
  "/events/:eventId/flights",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireOperationsWriter(access);
    requireEventOpen(access);
    const body = flightCreateSchema.parse(req.body);
    const flight = await prisma.$transaction(async (tx) => {
      const created = await tx.flight.create({
        data: {
          scope: FlightScope.EVENT,
          eventId: access.event.id,
          flightNumber: body.flightNumber,
          airline: body.airline ?? null,
          originCode: body.originCode,
          destinationCode: body.destinationCode,
          scheduledAt: body.scheduledAt,
          estimatedAt: body.estimatedAt ?? null,
          status: body.status ?? "SCHEDULED",
          dataSource: "MANUAL"
        }
      });
      await writeWorkspaceAudit(tx, req, {
        action: "workspace.flight.create",
        entityType: "FLIGHT",
        entityId: created.id,
        eventId: access.event.id,
        metadata: { flightNumber: created.flightNumber, scope: created.scope }
      });
      return created;
    }, WORKSPACE_TRANSACTION);
    res.status(201).json({ flight: { ...flight, scheduledAt: flight.scheduledAt.toISOString(), estimatedAt: iso(flight.estimatedAt) } });
  })
);

router.post(
  "/flights",
  asyncHandler(async (req: AuthRequest, res) => {
    if (req.user!.role !== Role.SUPER_ADMIN) {
      throw new HttpError(403, "General flights are maintained by platform administrators");
    }
    const body = flightCreateSchema.parse(req.body);
    const flight = await prisma.$transaction(async (tx) => {
      const created = await tx.flight.create({
        data: {
          scope: FlightScope.GENERAL,
          eventId: null,
          flightNumber: body.flightNumber,
          airline: body.airline ?? null,
          originCode: body.originCode,
          destinationCode: body.destinationCode,
          scheduledAt: body.scheduledAt,
          estimatedAt: body.estimatedAt ?? null,
          status: body.status ?? "SCHEDULED",
          dataSource: "MANUAL"
        }
      });
      await writeWorkspaceAudit(tx, req, {
        action: "workspace.flight.create",
        entityType: "FLIGHT",
        entityId: created.id,
        metadata: { flightNumber: created.flightNumber, scope: created.scope }
      });
      return created;
    }, WORKSPACE_TRANSACTION);
    res.status(201).json({ flight: { ...flight, scheduledAt: flight.scheduledAt.toISOString(), estimatedAt: iso(flight.estimatedAt) } });
  })
);

router.post(
  "/events/:eventId/shifts",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireFleetManager(access);
    requireEventOpen(access);
    const body = shiftCreateSchema.parse(req.body);
    await assertEventCaptain(access.event.id, body.driverId);
    const shift = await prisma.$transaction(async (tx) => {
      const created = await tx.captainShift.create({
        data: {
          eventId: access.event.id,
          driverId: body.driverId,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          zoneLabel: body.zoneLabel ?? null
        },
        select: { id: true, startsAt: true, endsAt: true, status: true, available: true, zoneLabel: true, driver: personOfDriver }
      });
      await writeWorkspaceAudit(tx, req, {
        action: "workspace.shift.create",
        entityType: "CAPTAIN_SHIFT",
        entityId: created.id,
        eventId: access.event.id,
        metadata: { driverId: body.driverId }
      });
      return created;
    }, WORKSPACE_TRANSACTION);
    const dto: ShiftDto = {
      id: shift.id,
      driver: shift.driver.user,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      status: shift.status,
      available: shift.available,
      zoneLabel: shift.zoneLabel
    };
    res.status(201).json({ shift: dto });
  })
);

router.patch(
  "/events/:eventId/shifts/:shiftId",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireFleetManager(access);
    requireEventOpen(access);
    const shiftId = parseRouteId(req.params.shiftId, () => new HttpError(404, "Shift not found"));
    const body = shiftUpdateSchema.parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.captainShift.updateMany({
        where: { id: shiftId, eventId: access.event.id },
        data: {
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.available !== undefined ? { available: body.available } : {})
        }
      });
      if (changed.count !== 1) throw new HttpError(404, "Shift not found");
      await writeWorkspaceAudit(tx, req, {
        action: "workspace.shift.update",
        entityType: "CAPTAIN_SHIFT",
        entityId: shiftId,
        eventId: access.event.id,
        after: body
      });
      return tx.captainShift.findUniqueOrThrow({
        where: { id: shiftId },
        select: { id: true, startsAt: true, endsAt: true, status: true, available: true, zoneLabel: true, driver: personOfDriver }
      });
    }, WORKSPACE_TRANSACTION);
    const dto: ShiftDto = {
      id: updated.id,
      driver: updated.driver.user,
      startsAt: updated.startsAt.toISOString(),
      endsAt: updated.endsAt.toISOString(),
      status: updated.status,
      available: updated.available,
      zoneLabel: updated.zoneLabel
    };
    res.json({ shift: dto });
  })
);

router.post(
  "/events/:eventId/density",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadTelemetryAccess(req, req.params.eventId);
    requireOperationsWriter(access);
    requireEventOpen(access);
    const body = densityCreateSchema.parse(req.body);
    const sample = await prisma.densitySample.create({
      data: {
        eventId: access.event.id,
        zoneKey: body.zoneKey,
        headcount: body.headcount,
        capacity: body.capacity ?? null,
        capturedAt: body.capturedAt ?? new Date(),
        source: "MANUAL"
      }
    });
    const dto: DensityDto = {
      zoneKey: sample.zoneKey,
      capturedAt: sample.capturedAt.toISOString(),
      ...suppressDensity(sample.headcount),
      capacity: sample.capacity
    };
    res.status(201).json({ density: dto });
  })
);

export default router;
