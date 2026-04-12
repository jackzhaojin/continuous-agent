# V2.5 Goal: Cloud Observability Unification (With Local Monitor Parity)

**Status:** Planned

## Theme

V2.5 is about **observability without regressions**.

Now that the system has moved to cloud-backed data, this version focuses on making the executive layer, worker layer, dashboard, and streaming logs all read from and write to the same cloud source of truth, while preserving compatibility with local monitoring workflows.

## Vision

After the database migration is complete, the agent should avoid disconnected visibility tools. Operational visibility should be unified, but local monitor signals should still exist as first-class outputs:

- **Write path:** runtime events and communication events are persisted to cloud storage/datastores
- **Mirror path:** critical events are mirrored locally in append-only monitor-friendly artifacts
- **Read path:** dashboards and log viewers read from the same cloud-backed records
- **Operator visibility:** humans can clearly see what the system is doing, what it attempted, what succeeded/failed, and what is currently in-flight

In short: move from “components that each work” to “one observable system with end-to-end traceability,” without breaking local AI monitor capabilities.

## Problem Statement

The previous placeholder for v2.3 emphasized generic integration wiring. That is no longer the primary need.

The current need is **operational hardening in cloud mode**:

- Visibility is fragmented across logs, ledgers, and ad hoc outputs
- Communication activity (especially outbound/inbound email operations) is not surfaced clearly enough in one place
- Dashboard and streaming logs need deeper alignment with runtime events and cloud data availability

## V2.5 Objectives

### 1) Unified Cloud Data Contract for Observability
Define and standardize the event/record model used by:

- executive loop phases
- worker execution lifecycle
- communication channels (email now, extensible later)
- dashboard and log consumers

This ensures all surfaces describe the same underlying events with consistent identifiers, timestamps, and status fields.

### 2) Executive-Layer Observability
Expose clear lifecycle visibility for each goal and loop pass, including:

- selected work
- phase transitions
- retries/failures/blocks
- validation outcomes
- state updates and publish steps

Operators should be able to answer “what happened and why?” without manually stitching together multiple raw files.

### 3) Worker-Layer Observability
Capture worker-level telemetry that is useful for operations, not just debugging:

- session starts/stops
- tool usage summaries
- execution outcomes and failure categories
- progress signals tied back to contract/goal IDs

This should preserve traceability from executive decision → worker execution → persisted result.

### 4) Communication Observability (Executive Priority)
Make communication flows first-class in observability:

- what messages were sent
- what is queued/trying to send
- send success/failure status
- delivery attempts and error reasons
- volume metrics (e.g., number of emails sent over time)

The dashboard should provide quick operational answers to communication health and throughput.

### 5) Dashboard + Streaming Logs Convergence
Dashboard views and streaming logs should represent the same reality:

- live stream for “what is happening now”
- aggregated dashboard for “what has happened recently”
- shared record IDs/links so operators can pivot between summary and detail

No separate sidecar app architecture for now—this should be integrated into the continuous-agent runtime and data model.

### 6) Cloud Hardening and Reliability
Treat observability infrastructure as production-critical:

- resilient writes (including retries/backpressure behavior)
- explicit degraded-mode behavior when cloud services are unavailable
- clear operator signals for stale/missing telemetry
- safeguards against silent observability failures

### 7) Local Monitor Compatibility (Claude OOTB / Skill-Friendly)
Ensure local monitoring remains viable:

- maintain stable local event mirror files and/or local stream endpoints
- preserve enough semantic detail for out-of-the-box monitor skills
- define an adapter contract so monitor skills can read either local mirror or cloud view
- include drift and lag indicators between cloud canonical records and local mirror artifacts

## Scope

### In Scope

- Observability model and event taxonomy for executive + worker + communication layers
- Cloud-backed write/read integration for telemetry consumed by dashboard and logs
- Dashboard improvements oriented around operational visibility and communication monitoring
- Streaming log alignment with persisted observability records
- Reliability improvements for telemetry pipeline behavior in cloud mode
- Local monitor parity layer (file mirror and/or adapter) to avoid observability regressions for AI operators

### Out of Scope (for v2.5)

- Re-architecting the whole product into an independent observability web app
- Large UX redesign unrelated to observability outcomes
- New communication channels beyond what is needed to establish the core observability pattern
- Replacing Claude's out-of-the-box monitor/skill patterns with a custom-only solution

## Success Criteria

V2.5 is successful when an operator can, from the integrated UI/log surfaces and local monitor surfaces:

1. See what the executive is doing right now and what happened in recent runs
2. Trace a goal from selection to worker execution to completion/failure
3. Inspect communication activity (sent, pending, failed, retrying) with counts and status
4. Trust that displayed data is cloud-backed and consistent across dashboard and stream views
5. Detect when observability itself is degraded and understand impact quickly
6. Continue to monitor key activity locally (via mirror/adapter) even when cloud telemetry is degraded

## Deliverables

1. **V2.5 Observability spec** (events, schemas, IDs, retention assumptions, cloud↔local parity contract)
2. **Executive + worker telemetry integration plan** tied to existing loop phases
3. **Communication observability plan** with metrics definitions (including email volume)
4. **Dashboard/log view requirements** for executive and worker operational insight
5. **Cloud hardening checklist** for telemetry write/read reliability and failure handling

## Priority

**High.** This is a core hardening release after cloud migration: the system must be observable, operable, and diagnosable end-to-end.
