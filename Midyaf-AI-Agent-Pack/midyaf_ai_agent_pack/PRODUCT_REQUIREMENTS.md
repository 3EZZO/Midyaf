# Consolidated Product Requirements

## Status labels

- `Baseline`: Derived from the original engineer requirements.
- `Candidate`: From founder feedback; requires approval before development.
- `Deferred`: Explicitly not to be programmed now.

## Global

| ID | Baseline requirement |
|---|---|
| G-01 | Hierarchical roles and permissions; delegation only within granted authority |
| G-02 | Views restricted to authorized events, records, and fields |
| G-03 | Metrics provide summary then detail drill-down |
| G-04 | Common task system: owner, deadline, status, feedback, escalation/history |
| G-05 | Relevant parties are notified of material task/schedule changes and acknowledge them |
| G-06 | Post-event feedback survey for relevant user groups |
| G-07 | Permission-controlled translated chat for guest/transport workflows |
| G-08 | Confidential guests are code-only with heightened reveal controls |
| G-09 | Reports and operational changes preserve accountability and history |

## Organizing company

| ID | Requirement |
|---|---|
| ORG-01 | View active, historical, financial, and operational event status |
| ORG-02 | Appoint project/logistics managers and permit controlled team formation |
| ORG-03 | Create events in two stages: basics, then guest-file upload |
| ORG-04 | Capture venue, guest classification, hotel classification, and transport model |
| ORG-05 | Generate AI-assisted plan requiring approval before execution |
| ORG-06 | Define supplier conditions and route RFQs only to matching suppliers |
| ORG-07 | Enforce at least two-day RFQ response window unless approved exception |
| ORG-08 | Compare quotations and route selection/signature through configured approvers |
| ORG-09 | Preserve original supplier quotations and all revisions |
| ORG-10 | View supplier/field-team evaluation, guest satisfaction, reports, lessons learned |

## Supplier

| ID | Requirement |
|---|---|
| SUP-01 | Receive RFQs and submit tax-inclusive quotations with supplier profile |
| SUP-02 | View assigned events, schedules, contracts, deadlines, and performance |
| SUP-03 | Preserve first quotation permanently and version later revisions |
| SUP-04 | Alert when quotation is outside approved range without replacing submitted values |
| SUP-05 | Support offers, discounts, tasks, complaints, objections, and approved communication |
| SUP-06 | Hotels act as suppliers and may receive relevant lobby/vehicle instructions |

## Client

| ID | Requirement |
|---|---|
| CLI-01 | View permitted event information, logistics scope, schedules, approved reports |
| CLI-02 | Submit permitted requests, questions, schedule changes, complaints, and incidents |
| CLI-03 | See task owner and status for permitted requests |
| CLI-04 | Client reports require logistics-manager approval before release |

## Event management and logistics manager

| ID | Requirement |
|---|---|
| OPS-01 | Manage teams, supervisors, deputies, shifts, delegation, tasks, escalations |
| OPS-02 | Control logistics plan, schedules, side events, and authorized visibility |
| OPS-03 | Assign requests to accountable owners with deadlines and feedback |
| OPS-04 | Prepare/approve daily and final reports before distribution |
| OPS-05 | Approve/reject authorized private-trip requests with recorded decision |
| OPS-06 | View event-relevant weather and flight status only |
| OPS-07 | Request controlled AI analysis of an event/process |
| OPS-08 | Request current location confirmation from authorized teams |

## Guest

| ID | Requirement |
|---|---|
| GST-01 | Maintain appropriate profile: code, itinerary, hotel, arrival/departure, schedule |
| GST-02 | Arrival flow: arrival, immigration, baggage count, terminal/gate, assigned vehicle/captain, ETA, pickup location |
| GST-03 | Shared guest/captain status updates for pickup and movement |
| GST-04 | Dedicated-car and shuttle workflows according to permissions |
| GST-05 | Shuttle dispatch by capacity or ten minutes after first request, with controlled override |
| GST-06 | Permission-controlled translated communication with transport operations/captain |
| GST-07 | Authorized private-trip request, review, decision, assignment |
| GST-08 | Automated departure planning/notifications based on flight and configurable peak rules |
| GST-09 | Confidential guests are code-only outside restricted workflow |

## Captain / driver

| ID | Requirement |
|---|---|
| CAP-01 | View own shift, permitted tasks, vehicle profile, authorized schedule details |
| CAP-02 | Supervisor assigns trips using proximity, completed trips, shift, and eligibility |
| CAP-03 | Vehicle map states include assigned, break, available |
| CAP-04 | Calculate/display route and ETA; alert destination coordinator |
| CAP-05 | Translated authorized communication with guests and operations |
| CAP-06 | Record en-route stop; alert after configurable threshold |
| CAP-07 | Confidential guest identity remains code-only |

## Field coordinator

| ID | Requirement |
|---|---|
| FLD-01 | View profile, location, responsibility, shift, tasks, feedback, support requests |
| FLD-02 | Record handover between shifts |
| FLD-03 | Receive relevant guest movement and ETA alerts |
| FLD-04 | Support authorized location-confirmation request |

## Radar

| ID | Requirement |
|---|---|
| RAD-01 | Restricted live view for logistics management and authorized supervisors |
| RAD-02 | Vehicles/directions, requests, relevant weather/flights, team status, tasks, complaints/incidents |
| RAD-03 | Separate VIP/confidential workflows with restricted visibility |
| RAD-04 | Filters for all, vehicles, coordinators, and authorized individual entities |
| RAD-05 | Heat-map/demand signal only after privacy, accuracy, and data requirements are approved |

## Onboarding

| ID | Requirement |
|---|---|
| ONB-01 | Login page includes controlled join request for new clients/suppliers |
| ONB-02 | Request captures company information, location, contacts, company email |
| ONB-03 | Request becomes routed task for customer/supplier management |

## Deferred

- Real-time fuel integration and fuel-station partnership.
- Airport executive lounge and airport-parking services.
- Monetizing private trips beyond recording demand.
