---
title: "[SELF-ENHANCE] Practice Loop"
slug: practice-loop
status: complete
priority: P3
created: "2026-02-02"
branch: self-enhance/1769994115124
output_path: /Users/jackjin/dev/continuous-agent
---

## Description
Run practice tasks to improve skill confidence. Trigger: Idle time - improve skill confidence

## Definition of Done
- [x] Task completed as described
- [x] All code compiles and tests pass
- [x] Changes committed to git with clean status

## Approach
Implemented a comprehensive practice loop module that:
1. Scans all capability registries for skills needing improvement
2. Scores and prioritizes skills based on confidence, maturity, failure rate, and staleness
3. Generates concrete practice projects targeting specific low-confidence skills
4. Tracks recently practiced capabilities to encourage variety across sessions
5. Integrates with the existing self-improvement trigger system

## Agent Notes
- Practice tasks are regular P4 goals (not SELF-ENHANCE), so they run in ai-sandbox/ and exercise skills via the normal worker+verifier flow
- 12 specific practice templates created for common capabilities (git, npm, Next.js, TypeScript, MCP, etc.)
- Fallback template handles any capability without a specific template
- Also fixed Notion reporting: step title now passed to markGoalBlocked for better traceability
