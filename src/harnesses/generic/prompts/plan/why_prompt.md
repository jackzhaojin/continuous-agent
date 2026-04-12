# WHY Agent - CONSTITUTION Generator

Establish the foundational "why" for this project.

## Your Working Directory

Docs dir: `{{DOCS_DIR}}` (write SPEC files here)
Code dir (read-only for context): `{{CODE_DIR}}`

All SPEC files MUST be written using ABSOLUTE PATHS rooted at `{{DOCS_DIR}}`.

## Mode: `{{SPEC_MODE}}`

## MANDATORY OUTPUT

You MUST call the Write tool to create:
- `{{DOCS_DIR}}/SPEC/CONSTITUTION.md`

**DO NOT describe what you would write. CALL THE WRITE TOOL.**

## Mode-Specific Behavior

### Mode: bootstrap
Generate new CONSTITUTION.md from the user prompt.

**Process:**
1. Extract the core "why" from user prompt
2. Identify non-negotiable principles from requirements
3. If vibe/style provided in prompt, incorporate directly
4. If no vibe, derive from domain best practices
5. Define clear out-of-scope boundaries

### Mode: adopt
Reverse-engineer CONSTITUTION.md from existing code.

**Process:**
1. Analyze codebase structure and patterns in `{{CODE_DIR}}`
2. Infer principles from code organization
3. Identify constraints from dependencies (package.json, requirements.txt, etc.)
4. Extract style/approach from existing code patterns
5. Merge with any new principles from prompt
6. Document what the code "believes" (its implicit constitution)

### Mode: extend
**SKIP** - CONSTITUTION is immutable.

Output a brief confirmation that existing CONSTITUTION.md is sufficient, then exit. Do NOT modify the file.

### Mode: extend-deep
**SKIP** - CONSTITUTION is immutable.

Output a brief confirmation that existing CONSTITUTION.md is sufficient, then exit. Do NOT modify the file.

## Input

- User prompt: `{{PROMPT_CONTENT}}`
- Spec mode: `{{SPEC_MODE}}`
- Code directory: `{{CODE_DIR}}`
- Existing CONSTITUTION (if any): `{{EXISTING_CONSTITUTION}}`

## CONSTITUTION.md Structure

```markdown
# Project Constitution

## Mission
[One sentence: what problem does this solve and for whom]

## Immutable Principles
1. [Principle 1 - non-negotiable constraint]
2. [Principle 2 - non-negotiable constraint]
3. [Principle 3 - non-negotiable constraint]
...

## Vibe / Style Guide
[Derived or provided style/approach guidance]
- Tone: [playful/professional/minimal/etc.]
- Complexity preference: [simple/sophisticated]
- User experience priority: [speed/beauty/accessibility/etc.]

## Constraints
- [Hard technical constraint]
- [Hard business constraint]
- [Hard user constraint]

## Out of Scope
- [What this project explicitly does NOT do]
- [What will NOT be built]
```

## Vibe Handling

**If vibe/style provided in prompt:**
Incorporate directly into the Vibe section.

**If no vibe provided:**
Derive appropriate style from:
- Domain conventions (e.g., productivity app = clean/minimal)
- Code patterns (if adopt mode)
- Prompt language and tone

## Quality Checklist

- [ ] Mission is one clear sentence
- [ ] Principles are truly non-negotiable (not preferences)
- [ ] Vibe is actionable (guides decisions)
- [ ] Constraints are real limits (not suggestions)
- [ ] Out-of-scope is explicit (prevents scope creep)

## Handoff

At the end of your response, output a handoff JSON block:

```json
{
  "agent": "spec-why",
  "mode": "{{SPEC_MODE}}",
  "action": "generated | skipped",
  "output": "SPEC/CONSTITUTION.md",
  "principleCount": 4,
  "vibeSource": "provided | derived",
  "handoffNotes": "Constitution established. Ready for WHAT agent."
}
```

## Example Output (Bootstrap Mode)

**Input prompt:**
```markdown
Build a personal finance tracker. I want to see where my money goes
without complicated charts. Keep it simple.
```

**Output CONSTITUTION.md:**
```markdown
# Project Constitution

## Mission
Help individuals understand their spending patterns through a simple, distraction-free interface.

## Immutable Principles
1. Simplicity over features - if it needs explanation, it's too complex
2. Privacy first - all data stays local, no cloud sync
3. Mobile-friendly - works on phone without app install
4. Instant value - useful within 30 seconds of first use

## Vibe / Style Guide
- Tone: Calm, encouraging, non-judgmental about spending
- Complexity: Minimal - one screen does 80% of the work
- UX Priority: Speed and clarity over visual flourish

## Constraints
- No backend server (static hosting only)
- No user accounts or authentication
- Browser localStorage only (no external database)
- Must work offline after first load

## Out of Scope
- Budgeting or goal-setting features
- Bank account integration
- Investment tracking
- Multi-currency support
- Shared/family accounts
```

Now process the input prompt.
