# Midyaf Delivery Plan

## Principle

Deliver safety and correctness first, then core workflows, field execution, live operations, and finally advanced intelligence/monetization. Do not begin a phase until the previous phase is accepted or an exception is approved in writing.

## Phase 0: Audit only

### Required outputs

- Architecture map: frontend, backend, mobile, APIs, database, queues, integrations, auth, deployment.
- Actual role/permission matrix.
- Route/API inventory with authorization evidence.
- Requirement traceability: requirement ID, status, evidence, gap, risk.
- Tenant-isolation assessment.
- Sensitive-data inventory/data-flow map.
- Security findings: Critical, High, Medium, Low.
- Backup/migration/rollback/monitoring assessment.
- Recommended Phase 1 tickets sized Small/Medium/Large.

### Exit criteria

No confirmed Critical issue is ignored; product owner approves the Phase 1 ticket list.

## Phase 1: Foundation, security, data integrity

| Ticket | Deliverable |
|---|---|
| P1-01 | Tenant context and organization-membership enforcement |
| P1-02 | Server-side role/permission policies plus tests |
| P1-03 | Event-level access/assignment checks |
| P1-04 | Immutable audit log and critical-action instrumentation |
| P1-05 | Confidential-guest masking and controlled reveal workflow |
| P1-06 | Supplier quotation versioning/original-quote preservation/approval trace |
| P1-07 | Production configuration, secrets, monitoring, backup/restore, rollback checklist |

### Exit criteria

Cross-tenant and unauthorized API tests fail safely; critical changes are auditable; confidential identity is protected; first quote remains intact after revisions.

## Phase 2: Event and procurement workflow

- Event creation wizard and validation.
- Guest spreadsheet upload, validation report, correction flow.
- Supplier eligibility, RFQ routing, response window, controlled exceptions.
- Quote comparison, approved weighted evaluation, approval/signature workflow.
- Tasks, deadlines, change acknowledgement, escalation, history.
- Report draft/review/approval/publish workflow.
- Live budget: planned, committed, actual, variance, approved changes.

## Phase 3: Guest and field execution

- Guest itinerary, permissions, invitation/pre-registration design.
- Arrival workflow and transport assignment.
- Captain shifts, vehicle state, tasks, ETA, destination notifications.
- Dedicated-car/shuttle rules with override.
- Shared guest/captain updates and translated communication.
- Departure automation.
- Field-coordinator tasks, handovers, support, escalation.
- Transport exceptions/emergency playbooks.
- Offline/degraded-network support.

## Phase 4: Live operations and integrations

- Restricted radar.
- Live vehicle/team/task state and filters.
- Relevant flight/weather integration.
- Critical-alert routing.
- Hotel, mapping, and enterprise API framework.
- Readiness score/event health report.

## Phase 5: Scale, intelligence, monetization

- Demand forecasting/fleet recommendations.
- AI-assisted planning with approval/explainability.
- Supplier verified-performance program.
- Tourism guide/partner offers.
- Private-trip commercial workflow.
- Sustainability reporting.

## Ticket template

```md
# [Ticket ID] Title

## Business goal
## Roles affected
## Approved requirement/backlog IDs
## Scope
## Non-scope
## User flow
## Data model / migrations
## Authorization and tenant rules
## Audit events
## API/UI changes
## Edge cases/failure handling
## Acceptance criteria
## Tests
## Rollback plan
## Risks/open decisions
```

## Definition of done

Approved scope only; server authorization and tenant boundaries tested; sensitive data protected; relevant UI works; success/denial/validation/edge cases tested; migration/rollback documented; checks pass; change report delivered.
