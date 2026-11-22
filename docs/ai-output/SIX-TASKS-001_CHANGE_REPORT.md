# SIX-TASKS-001 change report

Date: 2026-11-22 (Riyadh)
Branch: `feat/six-tasks` (integration of `feat/six-tasks-backend` by Brace/Claude and `feat/six-tasks-ui` by Lux/Antigravity), based on `origin/main` d08d2db (live).
Authorization: direct product-owner instruction in the interactive terminal. The owner asked for Codex not to be used this round. The owner's decisions on 2026-11-22: approval must be the easiest path, with every authorized party able to approve; audit the whole supplier lifecycle so a full investor cycle works; test on a Neon dev branch, then live only after a separate go-ahead.

Nothing is committed to `main`, pushed, deployed, or applied to Neon by this work.

## 1. Plans awaiting approval belong to the client

- `POST /api/workspace/events/:eventId/plans/:planId/approve` can now be used by the event's client (`CLIENT_VIEWER`), the organizing company's admins, the project manager with EDIT, and the Super Admin (support access, audited). Vendors can never approve. The audit records `approverKind`.
- New endpoint `GET /api/workspace/plans/awaiting-approval` returns the latest DRAFT plan of each open event the viewer may approve. Suppliers, captains and guests always get an empty list.
- `EventPlanDto` gains `viewerCanApprove`, `viewerCanEdit` and `edited`, all computed by the server for the current viewer.
- UI (Lux): the client dashboard has a "خطط بانتظار الاعتماد / Plans awaiting approval" queue with one-click approval. The Admin attention tile uses the same endpoint. There is no approval action in supplier views.

## 2. Collapsible navigation (UI, Lux)

The icon rail switches between icon-only and icon-with-label. Sections, tab navs and the jump dock collapse too. All have aria-expanded and aria-controls, work from the keyboard, show tooltips when collapsed, and respect reduced motion. The state is stored in guarded `localStorage` (`midyaf.nav.rail`, `midyaf.section.<id>`) and works in RTL and LTR.

## 3. Supplier and client registration is independent of the organizing company

- UI (Lux): the "تسجيل الموردين والعملاء" panel is removed from `OrganizerWorkspace`. New standalone `/register/supplier` and `/register/client` pages are linked from two login-page buttons, and pending applicants see a standalone frame. Application review stays with the Super Admin, now also in demo mode.
- Backend: an approved **client** applicant now gets the new `CLIENT` role and lands on the client portal. Before this change it got `COMPANY_ORGANIZER`, an Organizing Company role. Vendors still become `SUPPLIER`. Linking to events afterwards uses the existing invitation flow.
- Schema: one additive enum value, in `prisma/six-tasks-001-additive.sql` (`ALTER TYPE midyaf."Role" ADD VALUE IF NOT EXISTS 'CLIENT'`).

## 4. Inline "Edit AI Plan"

- New endpoint `PATCH /api/workspace/events/:eventId/plans/:planId`, with the body defined in `shared/planEditing.ts` (`editablePlanSchema`: summary, hotel distribution, fleet, teams, schedule, scope, line items).
  - A DRAFT plan is updated in place.
  - An APPROVED or SUPERSEDED plan produces a new DRAFT version, and the approved plan stays operational until the new draft is approved.
- Provenance (generator, disclaimer, warnings) is kept, and `content.edited` records who edited it, when, and from which version. The RFQ draft is rebuilt from the edited quantities in the same transaction.
- UI (Lux): an in-place editor prefilled by `editablePlanFromContent`. The plan never resets to a blank manual form. Badges read "AI-Generated (Edited)" / "مولدة بالذكاء الاصطناعي (معدّلة)".

## 5. Supplier problem: root cause and fix

**Root cause 1, registered suppliers were invisible.** `legacyWorkspaceBoundary` treats every self-registered account (`onboardingKind` set) as a protected workspace user. It removes any legacy row carrying that user's `id` or `userId`, and returns 404 for any request that names it. Onboarding activation deliberately creates a legacy `Supplier` profile for each approved vendor. So the profile was stripped from `/suppliers` and from the bootstrap lists, and the supplier's own identity was stripped from its own portal. The seeded demo supplier worked only because it never went through registration. This is reproduced by `sixTasksSuppliers.test.ts` against the original boundary: the Super Admin's supplier list comes back as `[]`.

**Root cause 2, suppliers could see only one request.** `GET /suppliers/me/requests` and the quote and note routes iterated a hardcoded allow-list containing one demo intake (`SUPPLIER_DEMO_REQUESTS`). That containment dates from before D-011 was approved.

**Root cause 3, no path from new events to suppliers.** Since SILA-INTAKE-002, events are created as workspace events whose RFQ drafts are never sent. The supplier quote → vault → contract pipeline runs only on legacy intakes in QUOTING.

Fixes:
- An activated vendor that has its legacy `Supplier` profile is no longer a protected workspace user. Pending applicants and clients remain protected. A user's own identity is never stripped from that user's own responses.
- Every QUOTING intake linked to an event reaches the suppliers whose stored category has demand. Suppliers see an opaque `EVT-…` code and aggregate quantities only; the demo intake keeps `DEMO-SUMMIT-01`.
- New endpoints `POST /api/workspace/events/:eventId/rfq/send` (idempotent; needs an approved plan and EDIT) and `GET …/rfq/dispatch`. Sending opens one supplier request for the event and notifies matching verified suppliers with generic text and an opaque reference.
  - Those rows are visible only to the Super Admin (the D-011 key holder) and to the supplier's own `/suppliers/me` routes.
  - Logistics managers stay walled off, per D-001.
  - The existing vault, approval and contract pipeline then applies unchanged.
- UI (Lux): a "Send RFQ to suppliers / إرسال طلب التسعير للموردين" button and a dispatch status badge.

## 6. One-click Investor Demo

- Contract in `shared/demo.ts`; router in `server/src/routes/demo.ts`. Every route returns 404 unless `DEMO_MODE_ENABLED=true`.
- `POST /api/demo/switch {persona}` issues a session for one of nine certified synthetic personas. The caller must be the signed-in Super Admin, or a switched session whose origin is re-checked to still be `SUPER_ADMIN`. The token carries `demoOrigin`, and refresh keeps it. The presenter signs in once; switching then needs no logout and no credentials. A passwordless public entry point was deliberately not built, because the site and repository are public.
- `POST /api/demo/prepare` is an idempotent readiness step. It makes the client persona a viewer of the planning event, which the fixture had omitted and which left the client approval queue empty. It also ensures the company persona is an admin of the demo organizing company. These rows live outside the `ovh2_` namespace.
  - If the planning event is no longer PLANNING (on live it had been taken to COMPLETED on 2026-11-10), prepare restores its certified fixture scope and status, supersedes the stale approved plan and writes a `demo.prepare.reopen_event` audit row with the before and after values. An event with a signed contract is refused.
  - If the planning event has no DRAFT, prepare adds the next version: a rules-based advisory plan with its RFQ draft, built like "Generate plan" (`demo_plan_planning_v<n>`).
- `POST /api/demo/baseline` saves the current state into the `<schema>_demo_baseline` schema. `POST /api/demo/reset` restores it in a single transaction: it truncates the tables, re-inserts parent-first, and fills nullable cyclic foreign keys afterwards (for example `Event.approvedPlanId`). Turning on demo mode therefore declares the database disposable.
- UI (Lux): a "Launch Live Demo" button on the login page, a persona switcher in the top bar, and save-start-point and reset dialogs. The UI refreshes on the `demo:reset` socket event.

## Evidence

| Check | Result |
|---|---|
| `npm run check` (integration) | PASS |
| `npx vitest run` (integration, after the Neon fixes) | 1400 passed, 1 skipped (pre-existing) |
| `npm run build:server` + `build:client` (integration) | PASS. `npm run build`'s `prisma generate` hit an EPERM because a local server held the engine DLL in the shared node_modules; this was environmental and the generated client was current. |
| Real-PostgreSQL API smoke, local throwaway DB provisioned with the live fixture writers (`scratch/six-tasks/smoke.mjs`) | 34/34 across all six workflows, including reset |
| Browser verification AR/RTL + EN/LTR (Lux), production build, fresh profile, service workers blocked | Pass 1 found 4 UI defects and 0 API defects, all fixed in 97da78d: mobile switcher clipped, reload reset the Super Admin portal, a spurious bootstrap 403 for applicants, and Badge dropped data attributes. Final pass on merge 84dd73e: 28/28, plus top-up 8/8, so **36/36 PASS** across all six workflows in AR/RTL and EN/LTR at 1440 and 390 px. 0 page errors; the only console 401 was the deliberate check that the wiped test account can no longer sign in. |
| Neon review branch `six-tasks-001-review-20261122` of `midyaf-demo` production (copy of live data) | Additive SQL applied; the `midyaf` schema then matches the integration Prisma schema exactly (`prisma migrate diff`: empty). The first smoke run found 2 defects that the local fixture could not show, and Lux's browser pass found a slow reset (see below). After the fixes, the branch was reset to a fresh copy of production and the whole run repeated: **34/34**, with save start point 4.6 s and Reset Demo Data 8.2 s over a WAN link (was 72 s). After reset, all 47 tables match the saved start point row for row; the only extra row is the reset's own `demo.reset` audit entry. Branch-only throwaway persona passwords were used; live passwords were not touched. |
| Browser verification on the Neon review branch (Lux) | 12/12 PASS in AR/RTL and EN/LTR: client queue and one-click approval of the v2 draft, Edit AI Plan, Send RFQ, supplier sealed quote, cross-organization isolation with the extra live rows (a second workspace event, the legacy DEMO-SUMMIT-01 event), and Reset Demo Data. 0 console, page or network errors. Re-check after the reset rewrite (7274615): 3/3 PASS (AR/RTL 1440, EN/LTR 390); `POST /api/demo/reset` 9.1 s and 9.5 s. |

Tests that changed on purpose: three SUPPLIER-001 allow-list assertions (`suppliers.authorization`, `supplierQuotes.authorization`, `supplierPortal`) now assert the new rule, keeping their privacy and denial checks. The activated-client role assertion in `onboarding.test.ts` now expects `CLIENT`. One SA-cannot-approve assertion in `workspaceEvents.test.ts` follows the owner's new rule.

## Defects found on the Neon review branch (fixed in b993093, 7006f36 and 7274615)

1. **Baseline and reset found no tables on Neon.** Neon does not apply Prisma's `search_path`, so `current_schema()` returned `public` instead of `midyaf`. Baseline and reset now take the schema from `DATABASE_URL`, like the app's other raw queries.
2. **The live demo was "used up".** On 2026-11-10 the company persona changed the planning event's scope to 50 VIP, 100 regular guests and 150 cars, approved its plan, made it ACTIVE, moved its dates and completed it. The client approval queue was empty, and editing and sending the RFQ were blocked. `prepare` now reopens the event as described in section 6.
3. **Reset Demo Data took 72 s** (found by Lux in the browser): about four round trips per table inside one transaction. Catalog reads and row counts are now single queries, and the truncate, inserts and deferred updates run server-side in one block in the same transaction: 8.2 s over the same link.

## Browser verification (Lux, final pass on 84dd73e)

| Workflow | Arabic / RTL | English / LTR |
|---|---|---|
| #6 Login + Launch Live Demo + persona switcher (9 personas) | 1440 PASS, 390 PASS (menu within viewport) | 1440 PASS, 390 PASS |
| #2 Collapsible rail and sections, persistence across reload | 1440 PASS (rail on the right edge), 390 PASS | 1440 PASS (256→72 px, title and aria-label on 9/9), 390 PASS |
| #4 Edit AI Plan (prefilled, PATCH 200, "(Edited)" badge, persists after reload) | 1440 PASS | 1440 PASS, 390 PASS |
| #1 Client "Plans awaiting approval" + one-click approve; supplier shows no approval UI | 1440 PASS, 390 PASS | 1440 PASS (supplier guard PASS) |
| #5 Send RFQ → supplier sees REQ/EVT code → sealed quote → admin vault and directory | 1440 PASS (badge and toast) | 1440 PASS (end to end) |
| #3 Standalone /register/client and /register/supplier, onboarding frame, admin review | 1440 PASS, 390 PASS | 1440 PASS |
| #6 Reset Demo Data (dialog, toast, queue restored, RFQ gone, test registration removed) | 1440 PASS, 390 dialog PASS | 1440 PASS |

Top-up pass (8/8): Arabic tooltips on the collapsed rail; Send RFQ badge AR 390; supplier portal and sealed quote in Arabic; /register/supplier EN 390; /register/client AR 390; reset AR 1440 and 390. **Total: 36/36 PASS**, 0 page errors. The server was left at the saved baseline.

## Go-live runbook (needs the owner's explicit go-ahead at each step)

1. Done on 2026-11-22: review branch `six-tasks-001-review-20261122`, SQL applied, smoke 34/34. Delete the branch once live is verified.
2. Apply the same SQL to the live database. It is additive and only adds an enum value.
3. Open a PR from `feat/six-tasks` and merge it to `main`. Render auto-deploys. Set `DEMO_MODE_ENABLED=true` on the Render service.
4. Signed in as the Super Admin: call `POST /api/demo/prepare`, check the pitch looks right, then use "Save current state as demo start point". Before each pitch, use "Reset Demo Data".
5. Reload the installed PWA, because the service worker caches the previous bundle.

## Known limits

- Timings above were measured from Riyadh against Neon us-west-2, so every query crossed a WAN link. After a reset the UI also reloads the Admin data before closing the dialog (about 25 s in total over that link). On Render the service and the database are both in Oregon (render.yaml sets no region, so Render's default; Neon us-west-2), so both should be much faster. Check this once in step 4 of the runbook.

- Supplier demand for a dispatched RFQ is the deterministic estimate from the guest counts, not the edited plan quantities. The RFQ draft does follow the edits.
- The approval queue for the Super Admin writes one support-audit row per listing that returns items.
- Legacy `/bootstrap` data for a `CLIENT`-role user is intentionally empty; its portal reads the workspace APIs.
