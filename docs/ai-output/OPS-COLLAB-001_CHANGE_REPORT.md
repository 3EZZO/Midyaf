# OPS-COLLAB-001 change report: task delegation/transfer and built-in messaging

Author: Claude Code (interactive terminal), 2026-10-11
Authorization: direct product-owner instruction, 2026-10-11:

> "people responsible in operation could delegate the tasks to someone else or move them to someone else just in case something happens so they have this option, also add a built in dedicated mail or messaging profile for users of the platform so they could communicate effectively. everything is approved proceed to finish commit push and open pr and finish all"

Codex has since recorded this approval as D-021, and end-to-end PR delivery as D-022. Delivered in the same branch as SUPPLIER-001.
State: implementation complete. Review corrections R2–R5 applied on 2026-10-11 (SUPPLIER-COLLAB-R1, see the end of this report). Reviewer acceptance (Codex) is still pending.

## 1. Task delegation and transfer

**Model.** A task can now carry an accountable operations user (`Task.responsibleUserId`) and an optional temporary delegate (`Task.delegateUserId`). Every change is appended to `TaskHandover` with the kind, who it came from, who it went to, the actor, an optional reason (at most 500 chars) and the time. The existing captain assignment and `ownerName` label are unchanged.

- **Delegate**: someone else acts on the task while the responsible person stays accountable. If nobody was responsible yet, the person delegating becomes responsible.
- **Transfer**: responsibility moves to someone else for good, and any delegate is cleared.
- **Return**: the delegate hands the task back.

**Who may do what** (server-enforced, `server/src/utils/taskDelegation.ts`):
- LM and SA may delegate, transfer and return any task (the documented legacy global scope).
- An ORGANIZER may do the same, but only on its own events. Another organizer's task or event gets 404 on every handover endpoint, so they learn nothing.
- A COORDINATOR may act only on a task they currently hold as responsible person or delegate. Any other coordinator gets 403.
- The current responsible person may delegate, transfer or return their task.
- The current delegate may re-delegate or return, but not transfer.
- Recipients must be LM, SA, COORDINATOR, or the event's own ORGANIZER. Guests, captains, suppliers and company users cannot receive a task.
- Access is checked first (404/403). Only after that does the caller learn that a task is closed (409) or has no delegate to return (409). A no-op is refused (409).

**API** (`server/src/routes/tasks.ts`, registered before `/:id`):
- `GET /tasks/handover-candidates?eventId=`: eligible people, name and role only. LM/SA: any event. ORGANIZER: own events only. COORDINATOR: only events where they hold an open task.
- `GET /tasks/:id/handovers`: history, newest first. LM/SA: any task. ORGANIZER: own events. COORDINATOR: only tasks they currently hold, including closed ones.
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
- `POST /conversations` with `{recipientIds (1–10, distinct), subject, body}`: creates the conversation, its participants and the first message in one transaction, plus an in-app notification per recipient. Each notification is marked `metadata.kind = "MESSAGE"`.
- `GET /conversations/:id`: the latest 200 messages. The reader's read mark moves forward to the newest message actually returned, never to "now" and never backwards.
- `POST /conversations/:id/messages`: sending a message does not change the sender's read mark, so earlier incoming messages they have not seen stay unread.
- `POST /conversations/:id/read`: moves the read mark forward to the conversation's newest stored message, and never backwards.
- Bodies are strict and trimmed; control characters are rejected.

**Notification privacy.** A message notification contains the conversation subject, the sender's name and the conversation id. Only its recipient can see it, in both bootstrap aliases and both `/notifications` aliases. Any non-owner, staff included, gets 404 from `PUT /notifications/:id/read`. Notifications created before the marker existed are recognised by their conversation reference. Operational notifications (tasks, drivers and so on) keep their legacy visibility for manager roles. Ordinary users can no longer list another user's notifications with `?userId=`; they get 403.

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
- `server/src/index.ts` (mount only), `server/src/routes/tasks.ts`, `server/src/routes/bootstrap.ts` (task includes; private-notification filter added by SUPPLIER-COLLAB-R1)
- Added by SUPPLIER-COLLAB-R1: `server/src/routes/notifications.ts`, `server/src/testing/memoryPrisma.ts` (empty bootstrap models); new `server/src/routes/notifications.privacy.test.ts`, `client/src/lib/requestGeneration.ts` (+ test)
- Client: `client/src/App.tsx`, `client/src/components/SilaOperationsDashboard.tsx`, `client/src/pages/ops/CoordinatorsApp.tsx`, `client/src/shell/rolePortals.ts` (+ test), `client/src/shell/portalMeta.ts`, `client/src/i18n/index.ts`

## Checks

Shared with SUPPLIER-001. At the original head `4eb6d1b`: `npm run test` passed (850 tests, 1 skipped), as did `npm run check` and `npm run build`. Codex independently re-ran all three on that candidate and got the same results. Counts for the new suites at that head (attribution corrected):
- Server HTTP: 12 handover tests (`taskDelegation.test.ts`), including compare-and-set conflict and audit rollback, and 10 messaging tests (`messages.test.ts`).
- Policy units, counted separately: 10 handover-policy tests (`utils/taskDelegation.test.ts`) and 6 messaging-policy tests (`utils/messagingPolicy.test.ts`).
- Client: views and helpers.

**Not run:** PostgreSQL execution of the SQL, browser/PWA checks, and live checks.

## Review corrections (SUPPLIER-COLLAB-R1, 2026-10-11)

These correct Codex review findings R2–R5 in `SUPPLIER-001_REVIEW.md`. R1 and R6 are in the SUPPLIER-001 report.

- **R2, notification privacy.** `canSeeNotification` and `isPrivateMessageNotification` were added to `messagingPolicy.ts`. `notifications.ts` gained `loadVisibleNotifications`, a bounded scan of at most 10 batches of 100 rows, so a long run of hidden rows cannot starve the page. `bootstrap.ts` uses it too. Read/update by a non-owner returns 404 for private-message notifications, and ordinary users cannot pass another `userId`. New tests in `notifications.privacy.test.ts` use real HTTP. They cover both bootstrap aliases, both notification aliases, staff and ordinary non-owners, notifications written before the marker, the legacy operational view, and a real conversation flow.
- **R3, stale client results.** A new dependency-free helper, `client/src/lib/requestGeneration.ts`, provides latest-request, scope-capture and invalidate guards. `MessagesCenter` uses a small controller: only the latest load of the currently selected thread may render, and a reply goes to the thread on screen. Logout and unmount invalidate everything in flight. A reply or new conversation refreshes only the session it was sent from. The thread view is keyed per conversation, so a draft cannot carry over to another conversation. The handover dialog scopes its people list, history and submission outcome to the task it was opened for, clears the previous task's data on open, and does not close or annotate a newer dialog. `SupplierDashboard` and `SupplierSubmissions` got the same protection (see the SUPPLIER-001 report). Tests use deferred promises that resolve in reverse order.
- **R4, handover scope.** `handoverTaskAccess` in `taskDelegation.ts` is the single gate: allowed, hidden (404) or forbidden (403). It runs before any closed or no-delegate state is disclosed. Coordinators see history only for tasks they currently hold, closed ones included. They see candidates only for events where they hold an open task. Organizers get 404 on every handover endpoint for foreign tasks and events. The client's `handoverOptions` hint matches. The legacy task REST and bootstrap visibility is unchanged and remains a separate documented limitation.
- **R5, read marks.** Thread GET claims only the newest message it returned (`observedReadCutoff`), through a monotonic `updateMany` guard. Sending a reply no longer marks anything read. Tests cover a message that arrives during the load, a stale read that must not move the mark back, and a reply while earlier incoming messages are unread.

Correction checks: **all Not run by Claude.** The managed worker has file tools only. Codex runs `npm run test`, `npm run check` and `npm run build` on the corrected branch. Counted by inspection and not executed, the correction adds 3 HTTP handover tests (15 total), 2 handover-policy tests (12), 3 HTTP messaging tests (13), 3 messaging-policy tests (9), and 12 notification-privacy HTTP tests. On the client it adds 4 helper tests and 3 controller tests each for messaging and handover, plus 1 hint test.

## Limits

- Both features follow the existing role model. There is no organization membership yet (D-001), so LM and SA have global scope, and the staff directory spans the platform.
- No email, SMS or WhatsApp delivery; messages are in-app only (D-006 deferred). Notifications are in-app rows.
- No attachments, editing or deletion of messages; no adding participants after a conversation starts.
- Coordinators have no event-assignment model, so they act only on tasks handed to them.

## Codex continuation under D-023

The owner explicitly reassigned remaining scoped corrections after the managed Claude continuation stopped at its session limit. Messages retry now calls the current controller. The actual handover submit orchestration discards stale success, refresh and pending effects. Thread GET, explicit read and reply transactions share a Conversation row lock; reply timestamps advance strictly beyond persisted lastMessageAt, and read marks advance only to the observed cutoff. Sending still does not clear earlier incoming unread messages.

Actual final correction checks by Codex: full suite 909 passed /1 skipped (53 files passed /1 skipped); npm run check passed. Prisma validate passed using a synthetic process-only URL; no database write. Build and PostgreSQL feature verification are recorded separately after they complete. Browser/PWA checks remain Not run because the saved site permission blocks access.

Final scoped verification: actual PostgreSQL feature run retained 148 successful checks before a verifier expectation was corrected (legacy coordinator notification access); targeted remaining run passed 21/21, covering manager/private notification separation, all 8 concurrent replies, distinct timestamps, queued read/late-write unread correctness, delegate/return/transfer and coordinator bootstrap visibility, and unchanged account baseline. Prisma P2028 under lock contention was reproduced and corrected with bounded 20-second acquisition and 30-second conversation transaction lifetime. Final full suite again passed 909 tests /1 skipped. The historical Claude-only Not run entries above remain author attribution, not the current operator status.

Final candidate: npm run test 909 passed /1 skipped (53 files passed /1 skipped), npm run check PASS, npm run build PASS (3088 modules; 57 PWA precache entries). Isolated fixture rerun created no additional quote or note. Public release scan checked 59 changed files with zero private-value matches. SQL was applied before merge; live fixture remains after healthy deployment. Installed-PWA visual checks are deferred under the owner’s explicit best-possible instruction because browser site permission remains blocked.
