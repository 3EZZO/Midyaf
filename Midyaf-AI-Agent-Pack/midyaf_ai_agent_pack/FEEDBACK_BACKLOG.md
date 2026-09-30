# Founder Feedback and Strategic Backlog

## Rule

All items below require a decision in `DECISION_LOG.md` before implementation.

## Priority 0: Audit immediately

| ID | Gap | Why it matters |
|---|---|---|
| FB-01 | Multi-tenant isolation | Prevents cross-company data leakage |
| FB-02 | Server-side authorization / role-scope review | UI-only permission control is unsafe |
| FB-03 | Personal-data controls for passport, flight, location, confidential guests | Sensitive data exposure risk |
| FB-04 | Immutable audit trail | Accountability and dispute handling |
| FB-05 | Confidential guest reveal controls | VIP/privacy risk |
| FB-06 | Backup, migration, monitoring, rollback readiness | Production resilience |

## Priority 1: Core operational reliability

| ID | Gap |
|---|---|
| FB-07 | Offline/poor-network support for drivers/coordinators |
| FB-08 | Emergency playbooks for delay, breakdown, absent captain, weather, evacuation |
| FB-09 | Transport exception workflows: no-show, baggage, companions, hotel change, capacity mismatch |
| FB-10 | Supplier verification and expiry/blacklist controls |
| FB-11 | Weighted quotation evaluation: price, quality, history, response time |
| FB-12 | Live budget: plan vs actual, overruns, change requests |
| FB-13 | Invitation/pre-registration: passport/visa, preferences, dietary/accessibility needs |
| FB-14 | Safety escalation: SOS, controlled location sharing, emergency contacts |
| FB-15 | Temporary delegation / absence coverage |
| FB-16 | Multi-language UI, reports, and notifications |
| FB-17 | Multi-channel critical alerts: push, SMS, WhatsApp, automated call |

## Priority 2: Operational extensions

| ID | Gap |
|---|---|
| FB-18 | SLA and penalty rules |
| FB-19 | Invoice dispute and collection workflow |
| FB-20 | Baggage tracking |
| FB-21 | Hotel room/arrival/departure integration |
| FB-22 | Event templates |
| FB-23 | Venue access and attendance checks |
| FB-24 | Traffic/weather/simultaneous-event data for ETA |
| FB-25 | Operational readiness score |
| FB-26 | Supplier opportunity marketplace |
| FB-27 | Enterprise/government integrations API |

## Future candidates

| ID | Candidate |
|---|---|
| FB-28 | Demand forecasting and fleet pre-positioning |
| FB-29 | Tourism guide and partner advertising |
| FB-30 | Private-trip commercial marketplace |
| FB-31 | Sustainability/carbon reporting |
| FB-32 | Advanced AI planning/optimization with human approval |

## Product positioning insight

Midyaf should prioritize credible hospitality and transport operations, verified supply, permissions, and accumulated performance data. AI is a supporting capability, not the product's substitute for reliable workflows.
