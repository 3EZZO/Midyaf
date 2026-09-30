# Midyaf AI-Agent Delivery Pack

This pack turns the founder-provided requirements and feedback into controlled context for an AI coding agent.

## Recommended workflow

1. Put this folder in the repository at `docs/ai/`.
2. Run the audit prompt first. The agent must not alter code during the audit.
3. Review the audit with the co-founder and update `DECISION_LOG.md`.
4. Run the planning prompt to create small approved tickets.
5. Implement one approved ticket at a time, then run QA and deployment review.

## Authority order

1. Written decisions marked `Approved` in `DECISION_LOG.md`.
2. Approved tickets in `IMPLEMENTATION_PLAN.md` or agent output.
3. `PRODUCT_REQUIREMENTS.md`.
4. `FEEDBACK_BACKLOG.md`.
5. Existing behavior only where it does not conflict with the above.

## Important guardrail

The feedback contains both requirements and proposals. The agent must never implement a proposal simply because it appears in these files. It must first be approved in `DECISION_LOG.md`.
