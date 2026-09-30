# Prompts for Claude Code

You are using Claude Code in the VS Code terminal. Replace `[TICKET_ID]` where shown. Do not let Claude modify code before you review the audit.

## Prompt 1 — Audit only (run first)

```text
You are the lead engineer auditing an existing production logistics and event-hospitality application called Midyaf.

Read these files before doing anything:
- docs/ai/PROJECT_CONTEXT.md
- docs/ai/PRODUCT_REQUIREMENTS.md
- docs/ai/FEEDBACK_BACKLOG.md
- docs/ai/SECURITY_AND_DATA_RULES.md
- docs/ai/IMPLEMENTATION_PLAN.md
- docs/ai/DECISION_LOG.md
- docs/ai/ACCEPTANCE_TESTS.md

Your task is AUDIT ONLY. Do not edit source code, database schema, configuration, infrastructure, or deployment files. Do not install dependencies. Do not send data to third parties.

Inspect the repository and create:
- docs/ai-output/ARCHITECTURE_AUDIT.md
- docs/ai-output/REQUIREMENT_TRACEABILITY.md
- docs/ai-output/SECURITY_AND_TENANCY_AUDIT.md
- docs/ai-output/PHASE_1_RECOMMENDATIONS.md

For every requirement in PRODUCT_REQUIREMENTS.md classify it as Implemented, Partially implemented, Missing, Conflicting, or Cannot verify. Cite exact evidence: routes, API endpoints, components, services, models/tables, middleware/policies, migrations, and tests.

Specifically audit tenant separation, server-side authorization, confidential guest masking/reveal, original quotation preservation/revision history, critical audit logging, secret handling, sensitive-data flows, backups/migrations/rollback/monitoring, and test gaps.

Rank findings Critical, High, Medium, Low. For each Critical/High item give minimally invasive remediation, files/data affected, tests needed, and rollback concerns.

Do not infer implementation from UI names or screenshots; verify in code or database behavior. Clearly mark uncertainty. Finish with the five most important co-founder decisions needed.
```

## Prompt 2 — Create tickets after audit

```text
Read docs/ai/ and docs/ai-output/. Do not modify application code.

Create docs/ai-output/PHASE_1_TICKETS.md with a prioritized set of small, independently deployable Phase 1 tickets only for findings confirmed by code evidence and approved in docs/ai/DECISION_LOG.md, except verified critical security remediation.

For every ticket include: ID/title, risk/business impact, roles/tenants affected, approved IDs, scope/non-scope, expected files/services/schema changes, authorization and tenant checks, audit events, migration/backfill/rollback plan, acceptance tests, manual QA, complexity, dependencies, unresolved decisions.

Prefer the smallest safe sequence. Do not group unrelated work. Do not plan unapproved strategic features.
```

## Prompt 3 — Implement one approved ticket

```text
Implement only ticket [TICKET_ID] from docs/ai-output/PHASE_1_TICKETS.md.

Before editing, restate scope, non-scope, acceptance criteria, authorization rules, tenant rules, and rollback plan. List expected changed files and data models. Stop and ask before any destructive migration, external paid service, production-secret access, new product decision, or confidential-data policy change.

Follow docs/ai/SECURITY_AND_DATA_RULES.md. Enforce authorization server-side and tenant/event scope on every affected query/mutation. Do not expose secrets or real guest data. Preserve backward compatibility unless explicitly approved. Preserve original quotes and audit history.

Add tests for success, denied access, validation, tenant isolation, and relevant edge cases. Use reversible migrations and document backfill/rollback.

Run relevant tests, lint, type checks, and build. Create docs/ai-output/[TICKET_ID]_CHANGE_REPORT.md with changed files, behavior, tests/results, migration, rollback, manual QA, limitations, and decisions needed. Do not start another ticket.
```

## Prompt 4 — QA without code changes

```text
Act as Midyaf QA lead. Read docs/ai/ACCEPTANCE_TESTS.md and inspect the current implementation. Do not modify application code.

Create docs/ai-output/ROLE_BASED_QA_REPORT.md. Test or trace executive admin, organizer, supplier, client, logistics manager, guest, captain, field coordinator, and unauthorized user.

For each scenario state Pass, Fail, Blocked, or Cannot verify; include role/data assumptions, evidence, impact, and regression risk. Prioritize tenant leakage, privilege escalation, confidential-guest exposure, quote alteration, report-approval bypass, lost acknowledgements, and transport exceptions.
```

## Prompt 5 — Co-founder decision brief

```text
Read docs/ai/FEEDBACK_BACKLOG.md, docs/ai/DECISION_LOG.md, and all audit/ticket outputs. Do not modify application code.

Create docs/ai-output/COFOUNDER_DECISION_BRIEF.md. For each pending decision, explain the business issue, risk of no action, 2-3 realistic options, your recommendation, complexity/cost level, dependencies, and exact approval required. Separate release blockers from later opportunities.
```

## Prompt 6 — Deployment review

```text
Review ticket [TICKET_ID] before deployment. Do not deploy and do not modify code.

Create docs/ai-output/[TICKET_ID]_DEPLOYMENT_REVIEW.md with preconditions/environment variables, migration order/duration, backup checkpoint, staged rollout/feature flags, post-deploy smoke tests, metrics/logs/alerts, rollback triggers, exact rollback procedure, and release blockers. Confirm no secrets, production data, or unsafe debug configuration are exposed.
```
