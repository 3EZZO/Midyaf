# SUPPLIER-001 change report

Author: Claude Code (interactive terminal), 2026-10-11
Assignment: `docs/ai/tasks/SUPPLIER-001.md` (D-009, D-018, D-019, D-020). Release instruction: product owner, 2026-10-11 ("everything is approved proceed to finish commit push and open pr").
Companion: `OPS-COLLAB-001_CHANGE_REPORT.md` (task handover and messaging, delivered in the same branch).
State: implementation complete. Reviewer acceptance (Codex) is still pending.

## Summary

Suppliers get a dedicated bilingual workspace: their own profile, services and bookings, sanitized open demand for the allow-listed synthetic demo request matching their **stored** category, one immutable sealed initial quotation, append-only notes, and their own quotation status. Logistics see each submission's origin, item, quantity, status and notes, but never its price, and can reject it with an audit entry. D-011 stays Pending, so approval, contracts and vault unlock fail closed for supplier-owned quotes. Every alternate path a SUPPLIER token could use is denied or empty.

## Changes by area

**Schema (`prisma/schema.prisma`, `prisma/supplier-001-additive.sql`)**
- Nullable `VendorQuote.supplierId` → `Supplier` (RESTRICT), with an index and the unique key `(supplierId, intakeId, category)`. Legacy quotes stay NULL; there is no backfill.
- `SupplierRequestNote` with real `ActivityIntake`, `Supplier` and author `User` relations (RESTRICT) and bounded text.
- The guarded, idempotent additive SQL is prepared and **not applied**.

**Policy (`server/src/utils/supplierPortal.ts`)**
- Non-secret allow-list: event `cmuz7p9vp000gyk9kvl1cq2zd`, intake `cmuz7ped70016yk9kubg3628s`, code `DEMO-SUMMIT-01`.
- Eligibility requires all of:
  - the intake is allow-listed;
  - it is still linked to the listed event, and that event exists;
  - its status is `QUOTING`;
  - its source counts are valid;
  - the supplier's stored category has positive demand under the existing `buildAiPlanFromIntake` rules: HOTEL=hotelRooms (15), CAR=vipCars+shuttleVehicles (9), TICKET=first-class+normal tickets (24). Other categories show nothing.
- Strict bodies:
  - quote: `{item, quantity, unitPrice}`; item 2–200 chars of plain text; quantity an integer 1–1,000,000; unit price 0–9,999,999.99 with at most two decimals;
  - note: `{text}`, 1–2,000 chars;
  - unknown and privileged fields are rejected.
- Terms are computed in integer cents. A total above Decimal(12,2) gets 422. Commission comes only from the supplier's stored percentage within 10–15, otherwise 409.
- DTOs carry opaque `EVT-`/`REQ-` references. The supplier's own quote DTO has no score, commission or vendor name. The logistics DTO has no price.
- Every mutation runs in a transaction that row-locks the intake (`SELECT … FOR UPDATE`, schema taken from `DATABASE_URL`), re-checks eligibility and status, and writes a metadata-only audit in the same transaction: a failed audit rolls the mutation back.

**Supplier API (`server/src/routes/suppliers.ts`)**, SUPPLIER only, registered before `/:id`:
- `GET /suppliers/me/dashboard`, `GET /suppliers/me/requests`, `GET /suppliers/me/quotes` (cursor-paginated, at most 100, owned by `supplierId`, never matched by `vendorName`).
- `POST /suppliers/me/requests/:intakeId/quotes`: 201 on success, 409 for a duplicate (also under concurrency, through the transaction plus the unique key), 404 for any inaccessible, closed or malformed id.
- `POST /suppliers/me/requests/:intakeId/notes`: append-only.
- SUPPLIER is denied `GET /suppliers`, `GET /suppliers/:id` and `POST /suppliers`. Managers' directory and create behaviour is unchanged, apart from the removed supplier self-create branch.

**Alternate producers**
- `bootstrap.ts`: an early SUPPLIER branch before any generic or rider query. Every restricted collection is empty; only the supplier's own identity, the city and the zones are returned. Both `/api/bootstrap` and `/bootstrap` are covered.
- `bookings.ts`: GET is denied (403) for SUPPLIER.
- `events.ts`: no events for SUPPLIER (empty list, 404 detail).
- `tasks.ts`: no tasks for SUPPLIER.
- `socketAuthorization.ts`: the SUPPLIER handshake is refused before any room (`role_not_permitted`). `App.tsx` also disables the socket for SUPPLIER.

**Logistics containment (`server/src/routes/operations.ts`)**
- Supplier-owned rows are kept out of `GET /vendor-quotes` and the bootstrap `vendorQuotes` array.
- For a supplier-owned quote, `PUT` / `DELETE` / `approve` on `/vendor-quotes` and the contract create/update/approve paths return 409.
- Manual `PUT` now authorizes both the current and the proposed intake when re-parenting.
- Vault `GET`, `authorize` and `reset` require a logistics role plus access to the intake's event. `GET` no longer creates sessions. `roleName` is accepted but ignored; key labels are fixed.
- `authorize` returns 409 for the allow-listed demo intake and for any intake with supplier-owned quotes. A full unlock unseals legacy quotes only.
- `reset` writes an audit entry.
- Deleting an intake that holds supplier submissions or notes returns 409.
- New `GET /supplier-submissions?intakeId=` and `POST /supplier-submissions/:id/reject`: logistics role plus intake/event ownership; LM and SA keep the documented legacy scope. Rejection is transactional and audited (optional reason, at most 500 chars) and changes status only.

**Client**
- `SupplierDashboard.tsx`: the supplier workspace (Arabic and English) with loading, error and retry, unlinked, empty, quote-form, sealed-quote and notes states. It refreshes over HTTP after each action.
- `SupplierSubmissions.tsx`: the logistics panel in `QuotesAndContracts.tsx`, shown only to logistics roles and never in rehearsal mode. It states that these submissions are not in the legacy totals.
- Portal wiring: `PortalKey` gains `supplier`; `SUPPLIER_PORTAL` lives outside the `PORTALS` spread; SUPPLIER gets `["supplier", "messages"]` and lands on `supplier`. Every other role keeps its previous portals, plus the messages inbox added by OPS-COLLAB-001.

**Fixture (prepared, not run)**: `server/src/utils/supplierDemo.ts`, `server/src/scripts/provisionSupplierDemo.ts`, `server/src/scripts/verifySupplierDemo.ts`. See the runbook.

**Verifier alignment**: `demoProvisioning.ts` `BOOTSTRAP_EXPECTATIONS.supplier` now expects the empty supplier branch (otherwise the live `demo:verify` would report a false failure). Its model-count test is 29.

## Files

New:
- `prisma/supplier-001-additive.sql`
- `server/src/utils/supplierPortal.ts` (+ test)
- `server/src/utils/supplierDemo.ts` (+ test)
- `server/src/scripts/provisionSupplierDemo.ts`, `server/src/scripts/verifySupplierDemo.ts`
- `server/src/routes/suppliers.authorization.test.ts`, `server/src/routes/supplierQuotes.authorization.test.ts`
- `server/src/testing/memoryPrisma.ts`, `server/src/testing/httpHarness.ts` (shared test doubles)
- `client/src/components/SupplierDashboard.tsx` (+ test), `client/src/components/SupplierSubmissions.tsx` (+ test)
- `docs/ai-output/SUPPLIER-001_RUNBOOK.md`, this report

Modified:
- `prisma/schema.prisma`
- `shared/domain.ts`, `shared/constants.ts`
- Server routes: `server/src/routes/suppliers.ts`, `bootstrap.ts`, `bookings.ts`, `events.ts`, `operations.ts`, `tasks.ts`
- Server services and utils: `server/src/services/socketAuthorization.ts` (+ unit and integration tests), `server/src/utils/demoProvisioning.ts` (+ test), `server/src/routes/visibility.test.ts`
- Client: `client/src/App.tsx`, `client/src/shell/rolePortals.ts` (+ test), `client/src/shell/portalMeta.ts`, `client/src/i18n/index.ts`, `client/src/pages/ops/ActivityIntakePage.tsx`, `client/src/pages/ops/QuotesAndContracts.tsx`

The manifest extras beyond the original 33 paths (`tasks.ts`, `visibility.test.ts`, `socket.integration.test.ts`, `demoProvisioning.ts`/`.test.ts`, and the test doubles) were required to close the supplier task leak and keep the existing tests and the live verifier truthful. They are covered by the product owner's 2026-10-11 approval.

## Checks (run by Claude in this checkout, 2026-10-11)

| Check | Result |
|---|---|
| `npm run test` | **Pass**: 52 files (51 passed, 1 skipped), 850 tests passed, 1 skipped |
| `npm run check` (server tsc, client tsc, kpi-literals) | **Pass** |
| `npm run build` (prisma generate, server tsc, vite build, PWA) | **Pass** |
| `prisma validate`; offline `prisma migrate diff` (old → new schema) | **Pass**; DDL purely additive |
| Additive SQL executed on PostgreSQL | **Not run**: no local PostgreSQL; Docker daemon not running; no live operation authorized |
| Fixture run on a database | **Not run** (only against the in-memory double in tests) |
| Browser / installed-PWA checks (AR/EN supplier, logistics panel, other personas, War Room) | **Not run** |
| Live `demo:verify` / deployed checks | **Not run** (requires the SQL first, then the release) |

## Limits and open items

- D-011 (vault key holders, approval rules) is still Pending: supplier prices cannot be revealed, approved or contracted. That is intended.
- The demand view is a synthetic showcase exception for one allow-listed intake. It is not RFQ routing, organization isolation (D-001) or SUP-01/SUP-02 compliance.
- The broader legacy vault defect (one operator can turn all three keys on legacy intakes) remains documented and is not redesigned here.
- An HTTP submission/rejection smoke test against a live target needs its own reviewed mode and approval.
- Codex has not reviewed this work. `DECISION_LOG.md` and the task board have not recorded the 2026-10-11 approval; Codex owns both.
