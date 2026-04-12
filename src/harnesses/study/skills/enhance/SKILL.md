---
name: enhance
description: Parse and classify enhancement specifications, then dispatch to the right specialist agents
---

# Enhancement Orchestration Skill

Parse enhancement specifications, classify each by type, and dispatch to the appropriate specialist agent. This skill is for the enhance orchestrator — it does NOT do implementation or testing directly.

## Inputs

- `{{TARGET_DIR}}` — path to the generated study app
- `{{HARNESS_ROOT}}` — path to the harness repo
- `{{ENHANCEMENT_SPECS}}` — JSON array of enhancement spec objects

## Enhancement Spec Schema

Each spec object has:
```json
{
  "id": "string — unique identifier",
  "title": "string — human-readable title",
  "priority": "number — lower = higher priority",
  "description": "string — what this enhancement does",
  "targets": [
    { "path": "relative/to/target", "action": "create|modify", "description": "what to do" }
  ],
  "requirements": ["string — functional requirement"],
  "references": ["path — files to read for context"],
  "acceptance_criteria": ["string — how to verify"]
}
```

## Classification Rules

Classify each enhancement based on its `targets` paths:

| Target paths contain | Type | Delegate to |
|---------------------|------|-------------|
| `src/components/`, `src/pages/`, `src/lib/`, any `.jsx`/`.tsx`/`.css` file | **ui** | `jack-web-build-v1` agent via Task (has Playwright MCP for browser testing) |
| `.claude/skills/`, `.claude/agents/`, `.md` prompt files | **prompt** | Handle directly with Read/Write/Edit |
| `package.json`, config files, build scripts | **config** | Handle directly with Bash |

If an enhancement has targets spanning multiple types, use the most capable agent — UI enhancements that also touch config should go to `jack-web-build-v1`.

## Dispatch Protocol

### For UI enhancements

Build a Task prompt that includes:
1. The full enhancement spec (id, title, description, targets, requirements, acceptance_criteria)
2. Resolved reference paths (prefix with `{{TARGET_DIR}}/` for app files, `{{HARNESS_ROOT}}/` for harness files)
3. Clear instructions to: read references → read existing code → implement → build → test in browser → fix → screenshot

The Task agent (`jack-web-build-v1`) already has Playwright MCP tools. Tell it to:
- Start the dev server after build
- Navigate to the page and interact with the feature
- Mock external API calls via `browser_evaluate` if needed
- Verify each acceptance criterion in the browser
- Take screenshots as proof
- Fix issues found during testing (up to 3 iterations)
- Write results to `{{TARGET_DIR}}/ai-docs/phases/ENHANCE/changes-{id}.md`

### For prompt/config enhancements

Handle directly — these don't need browser testing. Read, modify, verify.

## After All Enhancements

1. Verify final build: `cd {{TARGET_DIR}} && npm run build 2>&1`
2. Merge per-enhancement change files into `{{TARGET_DIR}}/ai-docs/phases/ENHANCE/changes.md`
3. Report summary: what was applied, what was tested, any issues

## Known Pitfalls

### Claude API JSON Responses
When the enhancement involves code that calls the Claude API and expects JSON: Claude often wraps JSON in markdown fences (` ```json ... ``` `) even when told to return raw JSON. Any `JSON.parse()` on Claude API responses MUST strip fences first:
```javascript
rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
```

### Use Deposited Skills as Source of Truth
If the target project has deposited skills in `.claude/skills/` (e.g., `score-explanation`, `evaluate-rationale`), the enhancement MUST read those skills and use their output schema — not invent a simplified one.

## Key Principle

**Reuse existing agents.** The `jack-web-build-v1` agent already knows how to build React apps and test with Playwright. Don't duplicate that capability — delegate to it.
