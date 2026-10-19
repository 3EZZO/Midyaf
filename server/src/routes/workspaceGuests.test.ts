import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";
const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));
vi.mock("../db.js", async () => { const { createMemoryPrisma } = await import("../testing/memoryPrisma.js"); memory.current = createMemoryPrisma(); return { prisma: memory.current.prisma }; });
const { startHarness } = await import("../testing/httpHarness.js");
const { buildWorkspaceTestWorld } = await import("../testing/memoryPrisma.js");
const router = (await import("./workspace.js")).default;
const { actors: a, seed } = buildWorkspaceTestWorld(); let http: Harness;
beforeAll(async () => { http = await startHarness([["/w", router]]); });
afterAll(async () => { await http.close(); });
beforeEach(() => { memory.current.seed(structuredClone(seed)); });
const base = "/w/events/evt_a/guests";
it("returns code-only masked guests even to an organization owner or platform support", async () => {
  for (const actor of [a.owner, a.sa, a.cap]) {
    const response = await http.get(`${base}/eg_g02`, actor);
    expect(response.status).toBe(200);
    expect(response.body.guest).toEqual({ id: "eg_g02", guestCode: "G02", isVip: false, masked: true });
  }
  expect((await http.get(`${base}/eg_g02`, a.lm)).body.guest.fullName).toBe("Synthetic person G02");
});
it("masks individually and validates allowed viewers and self-grants", async () => {
  expect((await http.put(`${base}/eg_g01/privacy`, a.owner, { masked: true, viewerUserIds: [a.owner.id] })).status).toBe(403);
  expect((await http.put(`${base}/eg_g01/privacy`, a.owner, { masked: true, viewerUserIds: [a.capB.id] })).status).toBe(400);
  expect((await http.put(`${base}/eg_g01/privacy`, a.owner, { masked: true, viewerUserIds: [a.lm.id] })).status).toBe(200);
  expect((await http.get(`${base}/eg_g01`, a.owner)).body.guest.masked).toBe(true);
  expect((await http.get(`${base}/eg_g01`, a.lm)).body.guest.masked).toBe(false);
});
it("collects opt-in location only from its linked guest and clears it on opt-out", async () => {
  expect((await http.put(`${base}/eg_gv01/position`, a.owner, { consent: true, lat: 24.7, lng: 46.6 })).status).toBe(403);
  expect((await http.put(`${base}/eg_gv01/position`, a.guest, { consent: true, lat: 24.7, lng: 46.6 })).status).toBe(200);
  expect((await http.get(`${base}/eg_gv01`, a.owner)).body.guest.position).toMatchObject({ lat: 24.7 });
  expect((await http.put(`${base}/eg_gv01/position`, a.guest, { consent: false })).status).toBe(200);
  expect(memory.current.rows("eventGuest").find(g => g.id === "eg_gv01")?.lastLat).toBeNull();
});
it("never leaks a protected passenger's hotel, movement, ETAs or vehicle link", async () => {
  const trip = memory.current.rows("trip").find(t => t.id === "trip_2")!;
  Object.assign(trip, { originLabel: "PRIVATE HOTEL MARKER", originLat: 12.34567, originLng: 76.54321, routePolyline: "PRIVATE_POLYLINE", captainEtaMinutes: 7 });
  const response = await http.get("/w/events/evt_a/telemetry", a.owner);
  expect(response.status).toBe(200);
  const hidden = response.body.telemetry.trips.find((t: {id:string}) => t.id === "trip_2");
  expect(hidden).toMatchObject({ movementWithheld: true, origin: null, destination: null, vehicleId: null, routePolyline: null });
  expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE HOTEL MARKER|12\.34567|PRIVATE_POLYLINE/);
  expect(response.body.telemetry.vehicles.find((v: {id:string}) => v.id === "veh_2").position).toBeNull();
});
