import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";
import ExcelJS from "exceljs";
import { GUEST_COLUMNS } from "../utils/guestWorkbook.js";
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

const rosterRow = (id: string) => memory.current.rows("eventGuest").find(g => g.id === id)!;
const revokeGrant = (id: string) => { const grants = memory.current.rows("guestPrivacyGrant"); grants.splice(grants.findIndex(g => g.id === id), 1); };
it("refuses a group privacy change when a guest the actor cannot see is moved in mid-request", async () => {
  rosterRow("eg_g01").privacyGroup = "ops";
  // A concurrent move commits between the route's pre-checks and its transaction.
  memory.current.beforeNext("$raw", "$queryRaw", () => { rosterRow("eg_g03").privacyGroup = "ops"; });
  const response = await http.put("/w/events/evt_a/guest-groups/ops/privacy", a.lm, { masked: true, viewerUserIds: [a.sup.id] });
  expect(response.status).toBe(403);
  expect(rosterRow("eg_g01")).toMatchObject({ privacyMasked: false, privacyGroup: "ops" });
  expect(rosterRow("eg_g03")).toMatchObject({ privacyMasked: true });
  expect(memory.current.rows("guestPrivacyGrant").map(g => g.id).sort()).toEqual(["pg_g02_lm", "pg_press_pm"]);
  expect(memory.current.rows("auditLog").some(r => r.action === "workspace.guest_group.privacy")).toBe(false);
  // Without the concurrent move the same request is authorized.
  rosterRow("eg_g03").privacyGroup = "press";
  expect((await http.put("/w/events/evt_a/guest-groups/ops/privacy", a.lm, { masked: true, viewerUserIds: [a.sup.id] })).status).toBe(200);
  expect(rosterRow("eg_g01").privacyMasked).toBe(true);
});
it.each([
  ["grant revoked", () => revokeGrant("pg_g02_lm")],
  ["EDIT removed", () => { memory.current.rows("eventMembership").find(m => m.id === "em_evt_a_u_lm")!.permissions = ["VIEW"]; }]
])("re-checks current grants and role for group and guest privacy (%s in flight)", async (_label, change) => {
  rosterRow("eg_g02").privacyGroup = "ops";
  memory.current.beforeNext("$raw", "$queryRaw", change);
  expect((await http.put("/w/events/evt_a/guest-groups/ops/privacy", a.lm, { masked: false, viewerUserIds: [] })).status).toBe(403);
  expect(rosterRow("eg_g02").privacyMasked).toBe(true);
  memory.current.seed(structuredClone(seed));
  memory.current.beforeNext("$raw", "$queryRaw", change);
  expect((await http.put(`${base}/eg_g02/privacy`, a.lm, { masked: false, viewerUserIds: [] })).status).toBe(403);
  expect(rosterRow("eg_g02").privacyMasked).toBe(true);
  expect(memory.current.rows("auditLog").some(r => String(r.action).startsWith("workspace.guest"))).toBe(false);
});
it("re-authorizes a guest group move under the Event and guest locks", async () => {
  memory.current.beforeNext("$raw", "$queryRaw", () => revokeGrant("pg_press_pm"));
  expect((await http.patch(`${base}/eg_g03`, a.pm, { privacyGroup: "ops" })).status).toBe(403);
  expect(rosterRow("eg_g03").privacyGroup).toBe("press");
  memory.current.seed(structuredClone(seed));
  expect((await http.patch(`${base}/eg_g03`, a.pm, { privacyGroup: "ops" })).status).toBe(200);
  expect(rosterRow("eg_g03").privacyGroup).toBe("ops");
});
it.each([
  ["current grant revoked", "eg_g02", () => revokeGrant("pg_g02_lm")],
  ["unmasked guest masked without a grant", "eg_g01", () => { rosterRow("eg_g01").privacyMasked = true; }],
  ["EDIT removed", "eg_g02", () => { memory.current.rows("eventMembership").find(m => m.id === "em_evt_a_u_lm")!.permissions = ["VIEW"]; }]
])("re-authorizes an ordinary detail edit under the Event and guest locks (%s in flight)", async (_label, id, change) => {
  const before = { ...rosterRow(id) };
  memory.current.beforeNext("$raw", "$queryRaw", change);
  const response = await http.patch(`${base}/${id}`, a.lm, { fullName: "Changed in flight" });
  expect(response.status).toBe(403);
  expect(JSON.stringify(response.body)).not.toContain(String(before.fullName));
  expect(rosterRow(id).fullName).toBe(before.fullName);
  expect(memory.current.rows("auditLog").some(r => r.action === "workspace.guest.update")).toBe(false);
});
it("still applies an unchanged, currently granted detail edit", async () => {
  const response = await http.patch(`${base}/eg_g02`, a.lm, { fullName: "Synthetic person G02 edited" });
  expect(response.status).toBe(200);
  expect(response.body.guest).toMatchObject({ id: "eg_g02", fullName: "Synthetic person G02 edited" });
  expect(rosterRow("eg_g02").fullName).toBe("Synthetic person G02 edited");
  expect(memory.current.rows("auditLog").filter(r => r.action === "workspace.guest.update")).toHaveLength(1);
});

async function importBytes(rows: unknown[][]) {
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Guests');sheet.addRow([...GUEST_COLUMNS]);for(const row of rows)sheet.addRow(row);return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
}
it('validates the complete workbook before an atomic import and handles duplicate retries',async()=>{
 const path='/w/events/evt_a/guest-workbook/import',before=memory.current.rows('eventGuest').length;
 const row=['Synthetic imported guest','+966500000002','Twin','2026-11-01T09:00','2026-11-02T12:00','0009','Jeddah','Riyadh','Riyadh','G50'];
 const invalid=await importBytes([row,[...row.slice(0,9),'G50']]);
 expect((await http.post(path,a.owner,{contentBase64:invalid,apply:true})).status).toBe(422);
 expect(memory.current.rows('eventGuest')).toHaveLength(before);
 const valid=await importBytes([row]);
 expect((await http.post(path,a.owner,{contentBase64:valid,apply:false})).body).toMatchObject({applied:false,count:1});
 expect(memory.current.rows('eventGuest')).toHaveLength(before);
 const results=await Promise.all([http.post(path,a.owner,{contentBase64:valid,apply:true}),http.post(path,a.owner,{contentBase64:valid,apply:true})]);
 expect(results.map(r=>r.status).sort()).toEqual([200,422]);expect(memory.current.rows('eventGuest')).toHaveLength(before+1);
 expect((await http.post(path,a.cap,{contentBase64:valid,apply:true})).status).toBe(403);
});
it('exports only permitted workbook fields and audits authorized private reads',async()=>{
 for(const [actor,canSee] of [[a.owner,false],[a.lm,true]] as const){
  const response=await http.raw('/w/events/evt_a/guest-workbook/export',actor);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
  const book=new ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(response.bytes).buffer);const sheet=book.worksheets[0];let name:unknown;
  sheet.eachRow(row=>{if(row.getCell(10).value==='G02')name=row.getCell(1).value;});expect(name).toBe(canSee?'Synthetic person G02':'');
 }
 expect(memory.current.rows('auditLog').some(row=>row.action==='workspace.guest.private_read')).toBe(true);
});
