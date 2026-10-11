# SUPPLIER-001 and OPS-COLLAB-001 release runbook

Prepared: 2026-10-11 by Claude Code (interactive). Nothing in this runbook has been executed against any database or deployment.

## What must happen, in order

The application release queries new columns and tables. Startup never changes the schema (T-01), so **the additive SQL must be applied to the live database before the pull request is merged**. Render auto-deploys `3EZZO/Midyaf` `main`, so merging is the deployment.

| Step | Action | Writes? | Needs approval |
|---|---|---|---|
| 1 | Review the pull request (code, tests, these SQL files) | No | — |
| 2 | Optional safety point: create a Neon branch or restore point of the demo production branch | Provider | Yes (provider operation) |
| 3 | Apply `prisma/supplier-001-additive.sql` | Additive DDL | Yes (live schema) |
| 4 | Apply `prisma/ops-collab-001-additive.sql` | Additive DDL | Yes (live schema) |
| 5 | Optional: supplier fixture dry run, then `--apply` | 1 quote, 1 note, 2 audits | Yes (live data) |
| 6 | Merge the pull request (Render deploys) | Release | Yes (release) |
| 7 | Verify: health, `demo:verify`, `verifySupplierDemo`, browser checks | No | — |

Steps 3 and 4 are backward compatible with the currently deployed code (`20a9be9`): it never selects the new nullable column or tables, and the new unique index ignores rows with a NULL `supplierId`. Applying the SQL first and deploying later is safe; the reverse order is not.

## Target

- The existing Free Neon demo project's production branch, database `neondb`, schema `midyaf`. The exact project and branch identifiers are in the local coordination record `SUPPLIER-001_EVIDENCE.md`; they are deliberately not repeated in this public repository.
- Use the **direct** (non-pooled) connection string with `sslmode=require`. Keep credentials outside OneDrive; never paste them into chat, logs or reports.
- Confirm the host before running anything. Both SQL files refuse to run unless schema `midyaf` and the base tables exist with the expected shape.

## Steps 3 and 4: additive SQL

```bash
psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/supplier-001-additive.sql
psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/ops-collab-001-additive.sql
```

Each file runs in one transaction with `lock_timeout=5s`, creates only missing objects, and ends with a post-check that raises (and rolls back) if anything is incomplete. A rerun is a no-op. There is no `DROP`, no data rewrite and no `vendorName` backfill.

Objects created:

- SUPPLIER-001: `VendorQuote.supplierId` (nullable) with index, the unique `(supplierId, intakeId, category)` initial-quote key, the FK to `Supplier` (RESTRICT), and table `SupplierRequestNote` with FKs to `ActivityIntake`, `Supplier` and `User` (all RESTRICT).
- OPS-COLLAB-001: enum `TaskHandoverKind`, `Task.responsibleUserId`/`delegateUserId` (nullable, SET NULL) with indexes, and tables `TaskHandover`, `Conversation`, `ConversationParticipant` and `ConversationMessage`.

The DDL was generated offline by `prisma migrate diff` from the previous and new `schema.prisma`, so names match Prisma's.

Read-only check afterwards:

```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'midyaf'
   AND table_name IN ('SupplierRequestNote','TaskHandover','Conversation','ConversationParticipant','ConversationMessage');
-- expect 5 rows
```

## Step 5: optional synthetic supplier fixture

The fixture adds exactly one sealed `RECEIVED` quote ("Synthetic supplier hotel offer", 15 × SAR 1,200, total SAR 18,000, VAT included) from the **existing** linked HOTEL supplier and one clearly synthetic recommendation note, each with a metadata-only audit entry. It creates no account, profile, service, booking, event or intake, never touches the two legacy quotes, and never confirms a plan or unlocks the vault.

```bash
# DATABASE_URL in .env.neon.local (direct URL, schema=midyaf) is the only target it reads.
npx tsx server/src/scripts/provisionSupplierDemo.ts --expected-host <host> --expected-database neondb
npx tsx server/src/scripts/provisionSupplierDemo.ts --expected-host <host> --expected-database neondb --apply
npx tsx server/src/scripts/verifySupplierDemo.ts    --expected-host <host> --expected-database neondb
```

The dry run connects read-only and refuses on any of these:

- the additive tables are missing;
- the account count is not exactly 11 (an account fingerprint is printed);
- the demo event or intake is missing, unlinked, or not `QUOTING` with HOTEL demand;
- there is not exactly one linked HOTEL supplier;
- the legacy quote count is not 2;
- an existing supplier quote or note differs from the fixture.

`--apply` repeats every check inside one transaction with the intake row locked. A rerun writes nothing. Output never includes the URL, credentials, emails or prices.

Skipping step 5 is fine: the HOTEL supplier can submit live from the portal instead.

## Step 7: verification after deploy

- `GET /api/health` returns `ok`.
- `npm run demo:verify -- --expected-host <host>`: its supplier bootstrap expectation now requires the empty SUPPLIER-001 branch. The schema-completeness check now includes the 5 new tables.
- `verifySupplierDemo.ts` (read-only).
- Browser, Arabic and English, installed PWA:
  - supplier lands on **Supplier Workspace**: profile, HOTEL request with a 15-room estimate, quote form or own sealed quote, notes, services, bookings;
  - logistics manager or the owning organizer → Activity Intake → quotes section: **Supplier portal submissions** shows origin, item, quantity, status and notes, no price; rejecting one updates the supplier's view after refresh;
  - vault authorize on the demo intake answers "pending policy" (D-011);
  - operations dashboard → Event Tasks: **Hand over** delegates or transfers a task, and the coordinator's app shows it under "Tasks handed to me";
  - **Messages** for every role: new message, reply, unread badge;
  - the War Room demo, the other personas' landings and the existing quotes and vault visuals are unchanged.

## Rollback

Roll back the application only: redeploy the previous commit (`20a9be9`) or revert the merge. Keep the additive schema and any submitted quotes, notes, handovers, messages and audit rows. The previous code runs on the extended schema. Dropping tables or resetting the database is never part of rollback.

Known operational effects of the new foreign keys:

- deleting an intake that holds supplier notes or owned quotes is refused (409 in the API, RESTRICT in SQL);
- a destructive reseed (`db:seed`, dev/test only) would need supplier notes removed first;
- deleting a user removes their conversations, messages and handover actor rows (CASCADE), while supplier notes keep RESTRICT.
