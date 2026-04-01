---
paths:
  - "capabilities/**"
  - "src/agentic/learning/**"
  - "src/agentic/calibration/**"
  - "src/deterministic/skill-loader.ts"
  - "src/deterministic/playbook-loader.ts"
  - "src/deterministic/skill-updater.ts"
---

# Capabilities & Skills System

## Capability Types

- **Technical** -- Tool operations: `git.commit`, `npm.install`, `docker.build`
- **Delivery** -- End-to-end outcomes: `deliver.nextjs.app`, `deliver.eds.site`
- **Functional** -- Cross-cutting: `reason.debugging`, `research.documentation`

## YAML Registries (`capabilities/`)

- `technical-capabilities.yml` -- Tool operation capabilities
- `delivery-capabilities.yml` -- End-to-end delivery outcomes
- `functional-capabilities.yml` -- Cross-cutting abilities
- `sdk-registry.yml` -- Agent SDK capability mappings
- `project-memory.yml` -- Completed projects with capabilities, features, lessons
- `services-registry.yml` -- External services (Supabase, Vercel, etc.)

Confidence scoring: +10 on PASS, -15 on FAIL (via `capability-updater.ts`).

## Skills & Playbooks (v2.0)

**Skills** (`skills/**/SKILL.md`) -- Atomic tool/API knowledge. Category: `skill`. No goals, pure how-to.

**Playbooks** (`playbooks/**/SKILL.md`) -- Goal-oriented workflows composing skills.
- Categories: `executive`, `worker`, `domain`, `pipeline`
- Can declare `execution_pattern` and `pipeline_steps`

**Track Record** (v2.0, `skill-updater.ts`):
- Confidence: +10 on PASS (cap 100), -15 on FAIL (floor 0)
- Maturity: Declared -> Demonstrated (>=1 success) -> Reliable (>=3 success, <20% failure)
- Review flag after 3+ consecutive failures
- Persisted in SKILL.md frontmatter `track_record` field

## Self-Improvement

- `self-improvement-triggers.ts` -- Detects when practice/retrospective should occur
- `self-improvement-task-generator.ts` -- Generates practice opportunities when idle
- `retrospective.ts` -- Weekly analysis of ledgers, calibrates confidence, generates recommendations
- State tracked in `workspace/self-improvement-state.json`
