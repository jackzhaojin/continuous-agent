---
name: skill-builder
description: |
  Build new Claude Code skills from scratch. Use when creating a new skill,
  improving an existing skill, or building a skill that includes scripts,
  templates, or reference materials. Triggers on "build a skill", "create a skill",
  "new skill for...", or any task prefixed with [SKILL-BUILD].
---

# Skill Builder

Build, test, and iterate on Claude Code skills until they work end-to-end.

## What Is a Claude Code Skill

A skill is a reusable instruction set that Claude loads on demand via the `Skill` tool. Skills live in `.claude/skills/{skill-name}/SKILL.md` and can include supporting files (scripts, templates, references).

### Anatomy of a Skill

```
.claude/skills/{skill-name}/
  SKILL.md              # Required: frontmatter + instructions
  scripts/              # Optional: executable scripts the skill references
  templates/            # Optional: file templates the skill uses
  references/           # Optional: example files, docs, patterns
  examples/             # Optional: example invocations and expected outputs
```

### SKILL.md Format

```markdown
---
name: {skill-id}          # Required. Lowercase + hyphens, max 64 chars
description: |             # Required. Max 1024 chars.
  What this skill does and WHEN to use it.
  Include trigger phrases so Claude auto-selects this skill.
---

# {Skill Title}

{Full instructions that Claude follows when invoking this skill.}

## When to Use
- Trigger condition 1
- Trigger condition 2

## Steps
1. Step one with clear instructions
2. Step two with expected outputs

## Success Criteria
- Criterion 1
- Criterion 2

## On Failure
- What to check when things go wrong
```

### Key Rules

1. **`name`** must be lowercase, hyphens only, max 64 characters
2. **`description`** must include trigger phrases for auto-discovery (max 1024 chars)
3. **Instructions** should be self-contained — the skill reader has no prior context
4. **Scripts** must be executable (`chmod +x`) and referenced with relative paths
5. **Skills load from two locations:**
   - User: `~/.claude/skills/{name}/SKILL.md` (personal, all projects)
   - Project: `.claude/skills/{name}/SKILL.md` (shared, committed to git)

## Workflow: Build → Test → Fix → Iterate

### Phase 1: Research & Design

1. **Study existing skills** as references:
   ```
   .claude/skills/calibration-nextjs/   — Simple calibration skill
   .claude/skills/task-breakdown/       — Process-oriented skill
   .claude/skills/prd-writer/           — Skill with reference templates
   .claude/skills/validator/            — Verification-focused skill
   .claude/skills/reference-intake/     — Multi-mode skill with decision logic
   ```

2. **Identify the skill's purpose:**
   - What problem does it solve?
   - What are the inputs (trigger phrases)?
   - What are the outputs (files, artifacts, actions)?
   - What tools does it need (Bash, Write, WebFetch, etc.)?

3. **Check for similar existing skills** to avoid duplication:
   ```bash
   ls .claude/skills/
   ```

### Phase 2: Build the Skill

1. **Create the directory structure:**
   ```bash
   mkdir -p .claude/skills/{skill-name}
   ```

2. **Write SKILL.md** with proper frontmatter and comprehensive instructions.

3. **Add supporting files** if needed:
   - Scripts in `scripts/` — make them executable
   - Templates in `templates/` — parameterized file templates
   - References in `references/` — example patterns, documentation

4. **Validate the format:**
   - Frontmatter has `name` and `description`
   - `name` is lowercase with hyphens, ≤64 chars
   - `description` includes trigger phrases, ≤1024 chars
   - Instructions are clear and self-contained
   - No external dependencies without fallbacks

### Phase 3: Test the Skill

**Testing happens in two stages:**

#### Stage A: Format Validation
```bash
# Check SKILL.md exists and has valid frontmatter
cat .claude/skills/{skill-name}/SKILL.md | head -20

# Verify name field
grep "^name:" .claude/skills/{skill-name}/SKILL.md

# Verify description field
grep "^description:" .claude/skills/{skill-name}/SKILL.md

# Check scripts are executable (if any)
ls -la .claude/skills/{skill-name}/scripts/ 2>/dev/null
```

#### Stage B: Functional Validation
Invoke the skill via the `Skill` tool and follow its instructions in a test scenario:

1. Use the `Skill` tool to load the skill: `Skill({skill-name})`
2. Follow the skill's instructions for a test case
3. Verify the outputs match expectations
4. Check that all referenced scripts/templates exist and work
5. Confirm error handling paths work (intentionally trigger edge cases)

### Phase 4: Fix & Iterate

If the skill fails:

1. **Diagnose the failure:**
   - Format issue? Fix frontmatter.
   - Instructions unclear? Rewrite the ambiguous section.
   - Script missing? Create or fix the script.
   - Edge case? Add handling instructions.

2. **Fix the SKILL.md** or supporting files.

3. **Re-test** (go back to Phase 3).

4. **Repeat until the skill passes all test scenarios.**

### Phase 5: Finalize

1. **Commit the skill:**
   ```bash
   git add .claude/skills/{skill-name}/
   git commit -m "feat: add {skill-name} skill"
   ```

2. **Document in CLAUDE.md** if the skill is significant enough to warrant it.

3. **Log the result:**
   ```json
   {"event": "SKILL_CREATED", "skill": "{skill-name}", "result": "PASS"}
   ```

## Skill Design Patterns

### Pattern: Simple Instruction Skill
For skills that are just a set of instructions (no scripts/templates):
```
.claude/skills/my-skill/
  SKILL.md    # Self-contained instructions
```

### Pattern: Script-Backed Skill
For skills that run scripts as part of their workflow:
```
.claude/skills/my-skill/
  SKILL.md
  scripts/
    setup.sh      # chmod +x
    validate.sh   # chmod +x
```
In SKILL.md, reference scripts with relative paths:
```markdown
Run the setup script:
\`\`\`bash
bash .claude/skills/my-skill/scripts/setup.sh
\`\`\`
```

### Pattern: Template Skill
For skills that generate files from templates:
```
.claude/skills/my-skill/
  SKILL.md
  templates/
    component.tsx.template
    test.tsx.template
```

### Pattern: Multi-Mode Skill
For skills with different execution paths based on context:
```markdown
## Mode Selection
- **Mode A:** When X → do Y
- **Mode B:** When P → do Q
```

### Pattern: Calibration Skill
For skills that validate a capability end-to-end:
```markdown
## Steps
1. Scaffold minimal project
2. Add custom modifications
3. Build/run
4. Validate with verifiers
5. Log to capability-ledger.jsonl
```

## Quality Checklist

Before declaring a skill complete, verify:

- [ ] `name` field: lowercase, hyphens, ≤64 chars
- [ ] `description` field: includes trigger phrases, ≤1024 chars
- [ ] Instructions are self-contained (no assumed context)
- [ ] All referenced files exist (scripts, templates, references)
- [ ] Scripts are executable (`chmod +x`)
- [ ] Error handling instructions included
- [ ] Success criteria clearly defined
- [ ] Tested with at least one real invocation
- [ ] Committed to git

## Existing Skills Reference

When building a new skill, study these existing skills for patterns:

| Skill | Type | Complexity | Good Example Of |
|-------|------|-----------|-----------------|
| `calibration-nextjs` | Calibration | Simple | Linear step-by-step |
| `calibration-eds` | Calibration | Simple | Known blockers section |
| `task-breakdown` | Process | Medium | Phase-based workflow |
| `prd-writer` | Process | Medium | Templates in references/ |
| `project-architect` | Process | Medium | Decision frameworks |
| `validator` | Verification | Medium | Evidence collection |
| `reference-intake` | Multi-mode | Complex | Mode A/B/C selection |
| `retrospective` | Analysis | Complex | Multi-source inputs |
| `practice-loop` | Orchestration | Complex | Priority-based selection |
| `executive-loop` | Orchestration | Complex | 8-phase loop |
