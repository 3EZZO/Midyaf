# Cross-Role Acceptance Tests

## Tenant and authorization

- A user in Organizer A cannot view, search, export, update, or infer Organizer B data.
- Client users cannot see supplier quotations unless explicitly authorized.
- Captains cannot retrieve guest identity beyond allowed fields; confidential guests remain code-only.
- Field coordinators access only assigned event/location/shift data.
- Direct API calls are denied whenever UI access would be denied.

## Supplier quotations

- Matching supplier receives RFQ; non-matching supplier does not.
- Supplier submits first tax-inclusive quote.
- Revision preserves original quote in immutable history.
- Unauthorized users cannot approve.
- Authorized approval/rejection includes reason and audit time/actor.

## Events and tasks

- Organizer creates event, uploads guests, sees validation errors, corrects data, creates valid event.
- Logistics manager assigns task with owner/deadline.
- Schedule change notifies relevant users and records acknowledgement.
- Client report is draft until logistics-manager approval.

## Guest and field operations

- Guest arrival flow produces permitted captain/vehicle/ETA/pickup information.
- Guest/captain updates are consistent and time-stamped.
- Shuttle obeys capacity/time rule and logs override.
- Private-trip request follows authorization and records outcome.
- Departure workflow follows configured notifications.
- Captain sees permitted shift/task only; destination coordinator receives ETA alert.
- Field handover records outstanding tasks.
- Network interruption never silently loses critical update; retry/sync state is clear.

## Confidentiality and audit

- Confidential guest data is masked by default.
- Approved reveal creates audit record.
- Role, quote, schedule, guest, and report changes are auditable.
- Ordinary users cannot edit audit records.
