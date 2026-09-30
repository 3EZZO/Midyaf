# Security, Data, and Engineering Rules

## Non-negotiable rules

1. Enforce authorization on server/API for every read and write; frontend hiding is not authorization.
2. Scope tenant-owned records by organization and validate membership on every request.
3. Scope event data to authorized organization, event, role, and assignment.
4. Never expose secrets, credentials, tokens, guest data, location history, or production dumps in prompts, logs, commits, screenshots, or client bundles.
5. Use least privilege for users, services, database accounts, and integrations.
6. Preserve append-only audit records for authentication, role changes, visibility changes, guest/schedule changes, quotations/revisions, approvals, contracts, finance, report publication, confidential-data access, and deletion.
7. Preserve quotation versions; never overwrite the first submitted quotation.
8. Treat identity, passport/visa, itinerary, hotel, flight, location, and confidential status as sensitive data.
9. Confidential guest identity is masked by default; elevated reveal requires approved server-side workflow and audit event.
10. Define consent, retention, deletion, and export decisions before expanding sensitive-data collection.
11. Human approval is mandatory for contracts, payments, financial commitments, confidential-data disclosure, and high-impact AI recommendations.
12. Validate uploads; restrict size/type and do not trust spreadsheet content.
13. Use rate limiting, input validation, safe error handling, secure sessions/tokens, and CSRF protections where applicable.
14. Use encrypted transport, secure password handling, and production-safe environment configuration.
15. Before schema migration, provide migration, backfill, rollback, and data-impact plan.
16. Before deployment, run tests, lint/type/build checks, smoke tests, and rollback verification.

## AI-specific rules

- AI output is advisory; it cannot auto-approve quotes, disclose confidential data, commit funds, or make unapproved operational assignments.
- Log high-impact AI input category, actor, output, and resulting human approval without retaining unnecessary sensitive content.
- Provide a non-AI fallback for every critical workflow.
