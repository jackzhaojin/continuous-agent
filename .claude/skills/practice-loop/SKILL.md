# Practice Loop Skill

Instructions for running practice tasks when idle.

## Purpose

When idle or blocked on primary work:
1. Identify highest-impact unproven skill needed by P1 goals
2. Generate a practice task to exercise that skill safely
3. Execute → Validate → Record evidence
4. Update confidence/maturity

## When to Practice

Practice when:
- No work items available (all Complete or Blocked)
- Waiting for human input
- Rate limited / in cooldown
- Scheduled practice time

## Practice Priority Order

1. **Skills blocking P1 goals** - Unblock critical path first
2. **Skills with confidence < 50%** - Most uncertain capabilities
3. **Skills with maturity = Declared** - Never tested
4. **Skills with high failure rate** - Need stabilization
5. **Skills unused > 30 days** - Prevent decay

## Identifying Practice Targets

### Step 1: Scan Goals
Read goals.md and identify required skills:
```
P1 Goal: "Build Next.js transactional app"
Required skills:
- nextjs.build.basic (confidence: 60%)
- nextjs.routing.app_router (confidence: 40%) ← LOW
- node.npm.install (confidence: 90%)
```

### Step 2: Check Skill Registry
For each required skill, check:
- Confidence level
- Maturity level
- Last validated date

### Step 3: Select Target
Pick the skill that is:
- Required by highest priority goal
- Has lowest confidence
- Has maturity = Declared

## Practice Task Templates

### For git.branch_commit
```yaml
task: Practice git operations
location: ~/dev/agent-outputs/practice/git-practice
steps:
  1. Create test repo (or use existing)
  2. Create branch
  3. Make 3 commits with meaningful messages
  4. Verify branch and commits exist
verifiers: [git_status_clean, commit_exists]
```

### For nextjs.build.basic
```yaml
task: Practice Next.js scaffold
location: ~/dev/agent-outputs/practice/nextjs-practice-{date}
steps:
  1. Run create-next-app
  2. Modify one component
  3. Run npm run build
  4. Verify build succeeds
verifiers: [node_install, node_build, docs_checklist]
```

### For reason.debugging
```yaml
task: Practice debugging discipline
location: ~/dev/agent-outputs/practice/debug-practice
steps:
  1. Create intentionally broken code
  2. Follow debugging protocol:
     - Reproduce
     - Isolate
     - Hypothesize
     - Fix
     - Verify
  3. Document the process
verifiers: [files_exist, node_build]
```

## Practice Execution

### Step 1: Create Practice Task
```yaml
practice_task:
  id: "practice-{skill_id}-{date}"
  target_skill: "nextjs.build.basic"
  reason: "Confidence 60%, blocking P1 goal"
  location: "~/dev/agent-outputs/practice/..."
  steps: [...]
  verifiers: [...]
```

### Step 2: Execute in Safe Location
- Use designated practice directory
- Don't affect real projects
- Create fresh environment

### Step 3: Run Verifiers
Execute all specified verifiers.
Record PASS/FAIL for each.

### Step 4: Update Skills
Based on results:
- PASS: confidence += 10
- FAIL: confidence -= 15
- Update maturity if applicable

### Step 5: Log to Ledger
```json
{
  "event": "PRACTICE_TASK_COMPLETE",
  "skill_id": "nextjs.build.basic",
  "result": "PASS",
  "confidence_delta": "+10",
  "location": "...",
  "duration_ms": 12345
}
```

## Practice vs Real Work

Practice tasks:
- Use designated practice directories
- Don't count toward goal completion
- Are explicitly logged as practice
- Update skill confidence same as real work
- Can be discarded after learning

## Anti-Patterns

DO NOT:
- Practice when real work is available
- Practice in production directories
- Skip validation after practice
- Practice skills already at 90%+
- Forget to log practice results
