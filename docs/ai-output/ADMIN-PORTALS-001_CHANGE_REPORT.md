# ADMIN-PORTALS-001 change report: all role dashboards for Super Admin

Author: Claude Code (managed file-only worker). Reviewer: Codex.
Date: 2026-10-11. Authorization: D-024 and `docs/ai/tasks/ADMIN-PORTALS-001.md`.
State: **Ready for review**. Claims released.

All application changes are in the isolated worktree `scratch/admin-portals-001/release-worktree` (based on merged main `66d8a3c`). Nothing in the shared root checkout's application code was touched. No shell, Git, database, provider, commit, push or deployment action was taken.

## Files changed (worktree-relative)

| File | Change |
|---|---|
| `client/src/shell/rolePortals.ts` | `SUPER_ADMIN: [...PORTALS, SUPPLIER_PORTAL, MESSAGES_PORTAL]`. Comment updated. Every other role and every landing page is unchanged. SUPER_ADMIN still lands on `admin`, its first entry. |
| `client/src/shell/rolePortals.test.ts` | Expected SUPER_ADMIN set now includes `supplier`. The supplier-only test now reads "SUPPLIER and SUPER_ADMIN only". New test: SUPER_ADMIN has every PortalKey exactly once (8 shared + supplier + messages). |
| `shared/constants.ts` | Comment only: `SUPPLIER_PORTAL` stays out of `PORTALS`, so ORGANIZER does not get it, and it is added explicitly to SUPER_ADMIN. |
| `shared/domain.ts` | New types: `AdminSupplierDirectoryEntry`, `AdminSupplierDirectoryResponse`, `AdminSupplierQuoteView` (`Omit<SupplierOwnQuote, "unitPrice" \| "totalPrice" \| "taxInclusive"> & { policyPending: true }`), `AdminSupplierRequestView`, `AdminSupplierWorkspaceView`. |
| `client/src/App.tsx` | Lazy `AdminSupplierWorkspace`. The `supplier` case branches on `session.user.role`: SUPER_ADMIN gets `AdminSupplierWorkspace`, and the supplier still gets the unchanged `SupplierDashboard`. Other cases are unchanged, and `messages` is still the signed-in user's own `MessagesCenter`. |
| `client/src/components/AdminSupplierWorkspace.tsx` | New read-only bilingual administrative view (details below). |
| `client/src/components/AdminSupplierWorkspace.test.tsx` | New tests (details below). |
| `server/src/routes/suppliers.ts` | Two new SUPER_ADMIN-only GET routes, registered after `/me/*` and before `/` and `/:id`. The `/me/*`, `POST /`, `GET /` and `GET /:id` handlers are unchanged. |
| `server/src/routes/adminSupplierWorkspaces.test.ts` | New real-HTTP memoryPrisma tests (details below). |
| `docs/ai-output/ADMIN-PORTALS-001_CHANGE_REPORT.md` | Copy of this report. |

Root writes: this report and `docs/ai-output/CLAUDE_COORDINATION_REPLY.md`.

## Server design

- `requireAuth` (router-wide) plus `requireRole([Role.SUPER_ADMIN])`. Unauthenticated requests get 401. Every other role gets 403, including SUPPLIER, ORGANIZER and LOGISTICS_MANAGER.
- **`GET /api/suppliers/admin/workspaces`**: a strict empty query schema, so any query parameter gets 400. It selects only `id, name, category, userId`, ordered `[name asc, id asc]` and limited to 101 rows. It returns up to 100 entries `{ id, name, category, accountLinked }` plus `truncated`. `userId` is used only for the boolean and is never returned.
- **`GET /api/suppliers/admin/workspaces/:supplierId`**:
  - The id must match the existing `idParamSchema`; a bad id gets 404 "Supplier not found". The query must be empty or the request gets 400.
  - The supplier is looked up by its database id only. An unknown id gets 404.
  - Profile, services and bookings use the existing `toSupplierProfileDto`, `toSupplierServiceDto` and `toSupplierBookingDto`, with the same selects, ordering and 100-row limit as `/me/dashboard`.
  - A booking whose service or event row is missing is left out rather than filled in.
  - Requests reuse `SUPPLIER_DEMO_REQUESTS` and `evaluateSupplierRequest` with the supplier's **stored** category, exactly like `/me/requests`.
  - Notes are those of the selected supplier only (`supplierId` + `intakeId`, asc, limit 100). The request's quote is found by `supplierId` + `intakeId` + stored category.
  - The quote list is `where { supplierId }`, `[createdAt desc, id desc]`, limit 100.
  - Quote reads use `adminQuoteSelect = { id, intakeId, category, item, quantity, status, createdAt }`. Prices, commission, score and vendor contact are **never selected**. Tests assert the select keys of every `vendorQuote` call.
  - `toAdminQuoteDto` returns `{ id, requestReference, intakeId, category, item, quantity, currency, status, sealed: true, policyPending: true, submittedAt }`. `toAdminRequestDto` mirrors the supplier request DTO, but has `quote` instead of `ownQuote` and nothing price-related.
  - The response is `{ accountLinked, profile, services, bookings, requests, quotes, policyPending: true }`.
- Both routes are GET only. They make no writes, add no audit rows, and never call approve, contract or vault code. D-011 stays Pending.
- The admin DTO builders live in `suppliers.ts` because `supplierPortal.ts` is outside the write scope. They reuse its exported `opaqueReference`, `toOwnNoteDto`, `idParamSchema`, `EligibleRequest`, `OwnNoteRow`, `SupplierBookingRow` and `SUPPLIER_REQUEST_CURRENCY`.

## Client design

- **`createAdminSupplierController`**: a React-free controller.
  - It uses three `createRequestGeneration` counters: session, directory loads and workspace loads.
  - `loadDirectory()` and `select(id)` report loading synchronously. For `select`, that clears the previous supplier's data at once.
  - Only the latest directory load or selection that started in the current session can paint data or show an error.
  - `retryWorkspace()` reloads the current selection, never an older one.
  - `reset()` (on logout, token change or unmount) invalidates everything and clears the selection.
- **`AdminSupplierWorkspace`**: a thin React wrapper. On an access-token change it resets, clears both states and reloads the directory. It resets again on unmount.
- **`AdminSupplierWorkspaceView`**: a pure view.
  - A hero with a "Read-only administrative view" badge, and text saying the admin is not signed in as any supplier and nothing can be submitted.
  - A directory list: one button per supplier, with `aria-pressed`, the category and a linked/not-linked badge. It also covers the "first 100" notice and the loading, error-with-retry and empty states.
  - A workspace panel with idle ("choose a supplier"), loading and error-with-retry states, then the details:
    - profile, verified state and account-link badge, plus an explanation when no account is linked
    - stat tiles
    - eligible demo requests, each with the sealed quote summary or "no quotation" and the supplier's notes
    - supplier quotations
    - services with their listed price, and bookings with their booked total (existing manager-readable values)
  - Labels use "Supplier …", never "My …". There are **no forms, inputs, textareas or submit buttons**.
  - Sealed copy: "Sealed: the quoted price is not shown to administrators. Opening rules are still pending approval." It also shows an "Opening policy pending" badge. No quote price field exists to display.
  - All copy is in Arabic and English. Formatting helpers (`sar`, `categoryLabel`, `scopeLabel`, `estimateLabel`, `quoteStatusLabel`) are imported from `SupplierDashboard`. That file is unchanged.

## Tests added or changed (all Not run by Claude)

- `client/src/shell/rolePortals.test.ts`: exact sets for every role, SUPPLIER/SUPER_ADMIN-only supplier access, SUPER_ADMIN with every key exactly once, landings unchanged.
- `client/src/components/AdminSupplierWorkspace.test.tsx`:
  - Directory: loading, error/retry, empty, linked and unlinked entries, truncated notice, a single pressed selection.
  - Workspace: idle, loading, error/retry, full detail with no price keys, an unlinked profile with empty collections.
  - Arabic rendering. Every render is checked for no `<form>`, `<input>`, `<textarea>`, `type="submit"`, submit/add-note copy or "My".
  - Error mapping.
  - Controller with deferred responses:
    - the latest directory wins when replies arrive in reverse order
    - switching suppliers clears at once and drops the late reply for A
    - a late failure for an older selection is dropped
    - retry uses the current selection
    - reset drops in-flight directory and workspace replies and clears the selection
    - a late directory failure after reset is dropped
- `server/src/routes/adminSupplierWorkspaces.test.ts`: real routers, JWT and memoryPrisma.
  - Directory: exact body and ordering, 100 limit with deterministic id tie-break and `truncated`, 401 and 403 for every non-SA role (from `Object.values(Role)`), 400 on query parameters.
  - Workspace: exact profile, services and bookings; sealed quote metadata with the exact key set; quote `select` keys asserted; supplier isolation (hotel vs car notes/quotes, category demand CAR=9, CATERING none); an orphan booking left out; an unlinked profile; a closed request hidden; 404 for missing, malformed or over-long ids; 400 on query parameters; 401 and 403 for every non-SA role, including the supplier itself.
  - A leak check for prices, CR number, commission, score, user ids, password hash, venue and brief.
  - No mutations, audit rows or vault sessions after every admin GET. Quotes stay sealed. SA approval of a supplier quote is still 409.
  - SUPER_ADMIN gets 403 on every `/me` GET and on both `/me` POSTs, with no rows created. The supplier's own `/me/requests` still returns its own `unitPrice`/`totalPrice`.

## Review correction R1 (type check)

Codex reported that the full suite passed (940 passed, 1 skipped), but `npm run check` failed with TS2300 (duplicate identifier `AdminSupplierWorkspaceView`) and TS2693 in `client/src/components/AdminSupplierWorkspace.test.tsx`. The test imported both the shared DTO type and the view component under the same name.

The fix only touches that test file:
- The shared type import is now `AdminSupplierWorkspaceView as AdminSupplierWorkspaceDto`.
- Its four type uses now refer to `AdminSupplierWorkspaceDto`: the `workspace` fixture, the `workspaceLoads` deferred type, the `deferred<…>()` call in `loadWorkspace`, and the `workspaceFor` return type.
- The component value import (`AdminSupplierWorkspaceView` from `./AdminSupplierWorkspace`), the JSX, and every test assertion are unchanged. The only other edit is a spacing fix in `workspaceFor =`.

There are no runtime changes and no diagnostic suppressions. No other source file changed in this continuation.

## Checks

| Check | Result |
|---|---|
| `npm run test` (focused and full) | **Not run by Claude** (file-only worker). Codex reported 940 passed and 1 skipped before R1. Codex to re-run. |
| `npm run check` | **Not run by Claude**. Codex reported that it failed before R1, and R1 targets that failure. Codex to re-run. |
| `npm run build` | **Not run by Claude** |
| Deployed health, read-only admin view and ordinary supplier scope checks | **Not run by Claude** |
| Browser/PWA checks | Not run. The existing saved-domain browser permission remains blocked; no PWA pass is claimed. |

## Limitations and notes

- The client branch uses the stored session's role. The server independently enforces SUPER_ADMIN on both endpoints, so a changed client role cannot read data. A supplier client that renders the admin view gets 403.
- The directory is limited to 100 profiles with no paging or search. A `truncated` flag is shown when more exist.
- Requests only cover the existing allow-listed synthetic demo intake (D-019), the same as the supplier sees.
- Bookings with a missing service or event row are left out, not shown as partial. With the current required relations this should not occur in PostgreSQL.
- Listed service prices and booked totals are shown because they come from existing manager-readable DTOs. They are never substituted for quote terms.
- Query parameters, including `?token=`, are rejected on these two endpoints. The client sends the bearer header.
- There is no schema, SQL, seed, provisioning, account, environment, credential or paid-service change. The rollback is the app at `66d8a3c`.
- The content is public-safe: synthetic test data only, no secrets or personal data.
