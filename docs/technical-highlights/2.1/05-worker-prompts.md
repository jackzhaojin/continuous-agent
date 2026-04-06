# Technical Highlight 5: Skill-Based Prompt Composition

**File:** [`src/agentic/intelligence/prompt-builder.ts`](../../../src/agentic/intelligence/prompt-builder.ts)

## What It Does

Worker prompts are composed from **skill files** at spawn time, not hardcoded in TypeScript. The prompt builder loads SKILL.md files from `claude-files-to-output/skills/`, renders template variables, and applies vendor-specific adaptation -- producing a tailored prompt for each worker regardless of which LLM backend runs it.

```
claude-files-to-output/skills/
  worker-base/SKILL.md      Constitution, monorepo rules, execution guidelines
  web-testing/SKILL.md       Playwright-cli visual verification protocol
  project-architect/SKILL.md Architecture planning
  calibration-nextjs/SKILL.md Next.js patterns
  ...10 skills total

claude-files-to-output/templates/
  ai-sandbox-claude-md.md   Generated CLAUDE.md for ai-sandbox root
```

## Prompt Composition Pipeline

The prompt builder assembles sections from skill libraries and runtime context:

```
1. Objective        Task title, description, priority, contract, project path
2. Constraints      Tools allowed, max turns, Definition of Done
3. Worker-base      Constitution limits, monorepo rules, execution guidelines
4. Exec pattern     Plan-then-execute, loop-until-progress, plan-mode, etc.
5. Playbook         Matched from playbooks/ directory (if any)
6. Skill refs       From playbook's composes_skills list
7. Web testing      Playwright-cli protocol (auto-loaded for web projects)
8. Validation       Definition of Done as checklist
9. Vendor adapt     Tool name mappings for non-Claude vendors
```

## Vendor Adaptation

The same skill content serves all vendors. A post-composition adapter layer (`vendor-adapter.ts`) handles the differences:

| Vendor | Reads CLAUDE.md? | Reads Skills? | Adaptation |
|--------|-----------------|---------------|------------|
| Claude | Yes (SDK) | Yes (Skill tool) | Lighter prompt -- SDK provides context |
| Kimi | No | No | Full prompt + tool mappings (Bash->Shell, Read->ReadFile, etc.) |
| Codex | No | No | Full prompt + tool mappings |

For Kimi and Codex, everything must be in the prompt string -- they can't discover `.claude/skills/` on their own. The adapter translates backtick-quoted tool references and appends a mapping section.

## Template Variables

Skills use `{{VARIABLE}}` placeholders rendered at composition time:

```markdown
## Project Context (Monorepo)
Your Project Directory: {{PROJECT_PATH}}

### Navigate and Assess First
cd {{PROJECT_PATH}}
git log --oneline -10
```

## Talk Points

- Zero hardcoded instruction text in TypeScript -- the prompt builder is a thin composer
- Change worker behavior by editing a SKILL.md file, not redeploying code
- Vendor adaptation is post-composition: write skills once, adapt per vendor automatically
- The worker-base skill encodes the Constitution into every worker session -- safety is structural
