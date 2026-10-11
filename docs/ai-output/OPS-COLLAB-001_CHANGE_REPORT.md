# OPS-COLLAB-001 change report: task delegation/transfer and built-in messaging

Author: Claude Code (interactive terminal), 2026-10-11
Authorization: direct product-owner instruction, 2026-10-11:

> "people responsible in operation could delegate the tasks to someone else or move them to someone else just in case something happens so they have this option, also add a built in dedicated mail or messaging profile for users of the platform so they could communicate effectively. everything is approved proceed to finish commit push and open pr and finish all"

This is not yet recorded in `DECISION_LOG.md` or on the task board; Codex owns both. Delivered in the same branch as SUPPLIER-001.
State: implementation complete. Reviewer acceptance (Codex) is still pending.

## 1. Task delegation and transfer

**Model.** A task can now carry an accountable operations user (`Task.responsibleUserId`) and an optional temporary delegate (`Task.delegateUserId`). Every change is appended to `TaskHandover` with the kind, who it came from, who it went to, the actor, an optional reason (at most 500 chars) and the time. The existing captain assignment and `ownerName` label are unchanged.

- **Delegate**: someone else acts on the task while the responsible person stays accountable. If nobody was responsible yet, the person delegating becomes responsible.
- **Transfer**: responsibility moves to someone else for good, and any delegate is cleared.
- **Return**: the delegate hands the task back.

**Who may do what** (server-enforced, `server/src/utils/taskDelegation.ts`):
- LM and SA may delegate, transfer and return any task (the documented legacy global scope).
- An ORGANIZER may do the same, but only on its own events. Other organizers get 404, so they learn nothing.
- The current responsible person may delegate, transfer or return their task.
- The current delegate may re-delegate or return, but not transfer.
- Recipients must be LM, SA, COORDINATOR, or the event's own ORGANIZER. Guests, captains, suppliers and company users cannot receive a task.
- Completed and cancelled tasks cannot be handed over (409). A no-op is refused (409).

**API** (`server/src/routes/tasks.ts`, registered before `/:id`):
- `GET /tasks/handover-candidates?eventId=`: eligible people, name and role only.
- `GET /tasks/:id/handovers`: history, newest first.
- `POST /tasks/:id/handover` with `{mode: "DELEGATE"|"TRANSFER", toUserId, reason?}`, strict body.
- `POST /tasks/:id/handover/return` with `{reason?}`.

**How a handover is written.** One transaction does a compare-and-set on the responsible and delegate columns against the state the decision was made on; a concurrent change gives 409 "changed meanwhile". The same transaction appends the history row, creates an in-app notification for the recipient, and writes a metadata-only audit (no reason text); a failed audit rolls everything back. Afterwards a `task:assigned` realtime hint goes to the recipient's own `user:` room. Task reads (REST and bootstrap) now include `responsibleUser` and `delegateUser` as `{id, name, role}` only.

**UI**
- `client/src/components/TaskHandover.tsx` provides the handover dialog (Delegate/Transfer choice, eligible people, reason, Return, history), responsibility badges, and a "Tasks handed to me" list. Arabic and English.
- Operations dashboard → Event Tasks: each card shows the responsible person and the delegate, plus a **Hand over** button for operations roles (hidden in rehearsal mode).
- Coordinators app: new "Tasks handed to me" section, since coordinators cannot open the operations dashboard.

## 2. Built-in messaging (every user's inbox)

**Model:**
- `Conversation`: subject (at most 150 chars), creator, last-message time.
- `ConversationParticipant`: unique per conversation and user, with a per-reader `lastReadAt`.
- `ConversationMessage`: plain text, at most 5,000 chars.

The pre-existing, unused `Message` table is untouched.

**Who may message whom** (`server/src/utils/messagingPolicy.ts`):
- Operations staff (SA, LM, ORGANIZER, COORDINATOR) may message anyone, and anyone may message staff.
- A guest and a captain may message each other only while a stored task links them.
- Every other pair (guest–guest, supplier–guest, company–supplier, and so on) is refused.
- The contacts directory lists only people the user may message, by name and role only (never email or phone), with search, at most 50.
- Only participants can read or reply. Anyone else gets the same 404 as a missing conversation.

**API** (`server/src/routes/messages.ts`, mounted at `/api/messages` and `/messages`):
- `GET /contacts?search=`, `GET /conversations` (cursor, newest first, unread counts, preview), `GET /unread-count`.
- `POST /conversations` with `{recipientIds (1–10, distinct), subject, body}`: creates the conversation, its participants and the first message in one transaction, plus an in-app notification per recipient.
- `GET /conversations/:id`: the latest 200 messages; also marks the conversation read.
- `POST /conversations/:id/messages` and `POST /conversations/:id/read`.
- Bodies are strict and trimmed; control characters are rejected.

**UI.** `client/src/components/MessagesCenter.tsx` is a **Messages** portal for every role. It has an inbox with unread badges, a thread view (mine/theirs, rendered as text, never HTML), a reply box, a compose dialog with contact search and recipient chips, a mobile single-pane layout, and Arabic and English copy. It refreshes over HTTP (list every 20 s, open thread every 10 s, only while visible), so it also works for suppliers, who have no socket. The server additionally emits a `message:new` hint to recipients' own rooms.

## Schema

`prisma/ops-collab-001-additive.sql`: guarded, idempotent and purely additive, with Prisma-exact names. It is prepared and **not applied**. Apply it before releasing (see `SUPPLIER-001_RUNBOOK.md`).

## Files

New:
- `prisma/ops-collab-001-additive.sql`
- Server: `server/src/utils/taskDelegation.ts` (+ test), `server/src/utils/messagingPolicy.ts` (+ test), `server/src/routes/messages.ts` (+ test), `server/src/routes/taskDelegation.test.ts`
- Client: `client/src/components/TaskHandover.tsx` (+ test), `client/src/components/MessagesCenter.tsx` (+ test)

Modified:
- `prisma/schema.prisma`, `shared/domain.ts`, `shared/constants.ts`
- `server/src/index.ts` (mount only), `server/src/routes/tasks.ts`, `server/src/routes/bootstrap.ts` (task includes)
- Client: `client/src/App.tsx`, `client/src/components/SilaOperationsDashboard.tsx`, `client/src/pages/ops/CoordinatorsApp.tsx`, `client/src/shell/rolePortals.ts` (+ test), `client/src/shell/portalMeta.ts`, `client/src/i18n/index.ts`

## Checks

Shared with SUPPLIER-001. `npm run test` passed (850 tests, 1 skipped), as did `npm run check` and `npm run build`. Covered by the new suites:
- Server HTTP: 22 handover tests, including compare-and-set conflict and audit rollback; 16 messaging tests.
- Client: views and helpers.

**Not run:** PostgreSQL execution of the SQL, browser/PWA checks, and live checks.

## Limits

- Both features follow the existing role model. There is no organization membership yet (D-001), so LM and SA have global scope, and the staff directory spans the platform.
- No email, SMS or WhatsApp delivery; messages are in-app only (D-006 deferred). Notifications are in-app rows.
- No attachments, editing or deletion of messages; no adding participants after a conversation starts.
- Coordinators have no event-assignment model, so they act only on tasks handed to them.
