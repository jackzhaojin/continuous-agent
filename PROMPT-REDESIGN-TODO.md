# Prompt System Redesign - Comprehensive TODO

## Research Summary

Based on industry best practices research:
- **Individual prompt versioning** (not global versions)
- **Markdown with YAML frontmatter** (like Claude Skills)
- **Simple variable replacement** with `{{VARIABLE}}` syntax
- **Immutable prompts** (new version = new file)
- **Separate from code** for easier testing and updates

## Proposed Structure

```
src/agentic/prompts/
├── README.md                           # Documentation
├── loader.ts                           # Load & render prompts with variables
│
├── worker/                             # Worker agent prompts
│   ├── worker-base-v1.0.0.md          # Base worker prompt
│   ├── worker-base-v1.1.0.md          # Updated version
│   └── worker-base.md -> worker-base-v1.1.0.md  # Symlink to current
│
├── research/                           # Research phase prompts
│   ├── research-phase-v1.0.0.md
│   └── research-phase.md -> research-phase-v1.0.0.md
│
├── retry/                              # Retry/persistence prompts
│   ├── retry-context-v1.0.0.md
│   └── retry-context.md -> retry-context-v1.0.0.md
│
├── strategy/                           # Strategy-specific guidance
│   ├── strategy-simplify-v1.0.0.md
│   ├── strategy-research-v1.0.0.md
│   ├── strategy-breakdown-v1.0.0.md
│   └── strategy-tools-v1.0.0.md
│
├── diagnosis/                          # Diagnostic agent prompts
│   ├── diagnosis-failure-v1.0.0.md
│   └── diagnosis-failure.md -> diagnosis-failure-v1.0.0.md
│
├── intelligence/                       # Intelligence layer prompts
│   ├── intent-classification-v1.0.0.md
│   ├── task-breakdown-v1.0.0.md
│   └── capability-assessment-v1.0.0.md
│
├── validation/                         # Validation interpretation prompts
│   ├── validation-interpret-v1.0.0.md
│   └── validation-interpret.md -> validation-interpret-v1.0.0.md
│
└── communication/                      # Human communication prompts
    ├── needs-you-blocker-v1.0.0.md
    └── needs-you-blocker.md -> needs-you-blocker-v1.0.0.md
```

## Phase 1: Core Infrastructure (2-3 hours)

### 1.1 Create Prompt Loader Module
- [ ] Create `src/agentic/prompts/loader.ts`
- [ ] Implement `loadPrompt(category, name)` - loads current version via symlink
- [ ] Implement `renderPrompt(template, variables)` - simple {{VARIABLE}} replacement
- [ ] Add error handling for missing prompts/variables
- [ ] Add tests for loader

### 1.2 Define Prompt Categories
- [ ] Create directory structure (worker/, research/, retry/, etc.)
- [ ] Create README.md with versioning guidelines
- [ ] Document variable naming conventions
- [ ] Document when to create new version vs new prompt

## Phase 2: Extract Existing Prompts from Code (3-4 hours)

### 2.1 Worker Prompts
- [ ] Extract from `prompt-builder.ts` → `worker/worker-base-v1.0.0.md`
  - Variables: TASK_TITLE, PRIORITY, CONTRACT_ID, PROJECT_PATH, TOOLS_ALLOWED, MAX_TURNS
  - Include: Constitution limits, project context, execution guidelines
  - Frontmatter: name, description, version, variables (list)

### 2.2 Research Phase Prompts
- [ ] Extract research guidance → `research/research-phase-v1.0.0.md`
  - Variables: INTENT_TYPE, CONFIDENCE, REASONING, RESEARCH_QUESTIONS
  - Include: Claude Code skills list, research steps
  - Reference skills: prd-writer, project-architect, task-breakdown, project-analysis

### 2.3 Retry/Persistence Prompts
- [ ] Extract retry context → `retry/retry-context-v1.0.0.md`
  - Variables: CURRENT_ATTEMPT, MAX_RETRIES, STRATEGIES_TRIED, LAST_ERROR, REMAINING_MESSAGE
  - Include: Persistence encouragement, strategy switching guidance

### 2.4 Strategy Prompts
- [ ] Create `strategy/strategy-simplify-v1.0.0.md`
- [ ] Create `strategy/strategy-research-v1.0.0.md`
- [ ] Create `strategy/strategy-breakdown-v1.0.0.md`
- [ ] Create `strategy/strategy-tools-v1.0.0.md`
  - Each has variables: TASK_CONTEXT, PREVIOUS_APPROACH, REASON_FAILED

### 2.5 Diagnostic Prompts
- [ ] Extract from `agentic-diagnosis.ts` → `diagnosis/diagnosis-failure-v1.0.0.md`
  - Variables: TASK_TITLE, ERROR_MESSAGE, ATTEMPTS, OUTPUT_PATH
  - Include: Investigation questions, root cause analysis steps

## Phase 3: Intelligence Layer Prompts (2-3 hours)

### 3.1 Intent Classification
- [ ] Create `intelligence/intent-classification-v1.0.0.md`
  - Variables: RAW_INPUT, CONTEXT
  - Output format: intent_type, confidence, reasoning
  - Include: Examples of each intent type

### 3.2 Task Breakdown
- [ ] Create `intelligence/task-breakdown-v1.0.0.md`
  - Variables: TASK_TITLE, TASK_DESCRIPTION, COMPLEXITY_ESTIMATE
  - Include: Step generation guidelines, dependency identification

### 3.3 Capability Assessment
- [ ] Create `intelligence/capability-assessment-v1.0.0.md`
  - Variables: TASK_REQUIREMENTS, CAPABILITY_REGISTRY
  - Include: Confidence threshold checking, blocker identification

## Phase 4: Validation & Communication Prompts (1-2 hours)

### 4.1 Validation Interpretation
- [ ] Create `validation/validation-interpret-v1.0.0.md`
  - Variables: VERIFIER_RESULTS, DEFINITION_OF_DONE
  - Include: Capability confidence update logic

### 4.2 Human Communication
- [ ] Create `communication/needs-you-blocker-v1.0.0.md`
  - Variables: BLOCKER_TYPE, ERROR_DETAILS, ATTEMPTS, WHAT_TRIED
  - Include: Clear ask, context, urgency level

## Phase 5: Migrate Code to Use New System (3-4 hours)

### 5.1 Update prompt-builder.ts
- [ ] Replace string concatenation with `loadPrompt()` calls
- [ ] Use `renderPrompt()` for variable substitution
- [ ] Remove hardcoded prompt strings
- [ ] Add error handling for missing prompts

### 5.2 Update worker-spawner.ts
- [ ] Use prompt loader for worker prompts
- [ ] Compose prompts (base + research + retry as needed)

### 5.3 Update intelligence modules
- [ ] `intent-classifier.ts` - use intent-classification prompt
- [ ] `strategy-selector.ts` - use strategy prompts
- [ ] Update all modules to use new prompt system

### 5.4 Update diagnosis module
- [ ] `agentic-diagnosis.ts` - use diagnosis prompts

## Phase 6: Testing & Validation (2-3 hours)

### 6.1 Unit Tests
- [ ] Test prompt loader with all categories
- [ ] Test variable rendering
- [ ] Test error handling for missing prompts/variables
- [ ] Test symlink following for current versions

### 6.2 Integration Tests
- [ ] Test worker spawning with new prompts
- [ ] Test research phase prompt composition
- [ ] Test retry context prompt composition
- [ ] Test strategy prompt selection

### 6.3 End-to-End Test
- [ ] Run full executive loop iteration
- [ ] Verify all prompts load correctly
- [ ] Verify variable substitution works
- [ ] Check logs for any prompt-related errors

## Phase 7: Documentation & Cleanup (1-2 hours)

### 7.1 Documentation
- [ ] Update `src/agentic/prompts/README.md`
  - Versioning guidelines
  - How to create new prompt
  - How to update existing prompt
  - Variable naming conventions
  - Testing procedures

### 7.2 Cleanup
- [ ] Delete old `src/agentic/prompts/versions/` directory
- [ ] Delete unused `/strategies/prompts/` directory
- [ ] Update `src/README.md` to reflect new structure
- [ ] Add examples to README

### 7.3 Git Housekeeping
- [ ] Commit new prompt system
- [ ] Create git tag for v1.0.0 of each prompt
- [ ] Update .gitignore if needed

## Phase 8: Prompt Content Audit (CRITICAL - 4-5 hours)

### 8.1 Analyze PRD for All Prompt Needs
Based on PRD sections, we need prompts for:

#### Executive Loop Phases (8 phases)
- [ ] Phase 1: Health Check - **NO PROMPT** (deterministic checks)
- [ ] Phase 2: Input Processing - **NO PROMPT** (markdown parsing)
- [ ] Phase 3: Work Selection - **PROMPT NEEDED** for priority reasoning
- [ ] Phase 4: Task Contract - **PROMPT NEEDED** for contract creation
- [ ] Phase 5: Execute - **WORKER PROMPTS** (already covered)
- [ ] Phase 6: Validate - **VALIDATION PROMPTS** (already covered)
- [ ] Phase 7: State Update - **NO PROMPT** (file I/O)
- [ ] Phase 8: Diagnosis - **DIAGNOSIS PROMPTS** (already covered)

#### Worker Execution Modes
- [ ] **Base worker prompt** - DONE (Phase 2.1)
- [ ] **Research mode** - DONE (Phase 2.2)
- [ ] **Retry mode** - DONE (Phase 2.3)
- [ ] **Strategy-specific** - DONE (Phase 2.4)
- [ ] **Incremental execution** - NEW PROMPT NEEDED for step-by-step execution

#### Intelligence & Classification
- [ ] **Intent classification** - DONE (Phase 3.1)
- [ ] **Task breakdown** - DONE (Phase 3.2)
- [ ] **Capability assessment** - DONE (Phase 3.3)
- [ ] **Risk assessment** - NEW PROMPT NEEDED (for task contract)
- [ ] **Definition of Done creation** - NEW PROMPT NEEDED (for task contract)

#### Communication & Reporting
- [ ] **needs-you.md blocker** - DONE (Phase 4.2)
- [ ] **needs-you.md question** - NEW PROMPT NEEDED (asking for clarification)
- [ ] **needs-you.md approval** - NEW PROMPT NEEDED (constitutional limits hit)
- [ ] **Work ledger updates** - **NO PROMPT** (structured logging)
- [ ] **Capability ledger updates** - **NO PROMPT** (structured logging)

#### Calibration & Practice
- [ ] **Calibration task prompt** - NEW PROMPT NEEDED
- [ ] **Practice task generation** - NEW PROMPT NEEDED (idle time)
- [ ] **Retrospective analysis** - NEW PROMPT NEEDED (weekly)

### 8.2 Create Missing Prompts

#### work-selection/
- [ ] `work-selection-priority-v1.0.0.md`
  - Variables: GOALS_CONTENT, QUEUE_CONTENT, CAPABILITY_REGISTRY, RETRY_TRACKER
  - Output: Selected work item with reasoning

#### contracts/
- [ ] `contract-creation-v1.0.0.md`
  - Variables: RAW_INPUT, INTENT_TYPE, PREFERENCES_CONTENT
  - Output: Complete task contract (JSON)

- [ ] `risk-assessment-v1.0.0.md`
  - Variables: TASK_DESCRIPTION, SCOPE, CAPABILITIES_REQUIRED
  - Output: Risk level, factors, mitigation

- [ ] `dod-creation-v1.0.0.md`
  - Variables: TASK_TITLE, APPROACH, VERIFIERS_AVAILABLE
  - Output: Definition of Done criteria list

#### execution/
- [ ] `incremental-execution-v1.0.0.md`
  - Variables: STEP_NUMBER, TOTAL_STEPS, PREVIOUS_STEPS, NEXT_STEP, SHARED_OUTPUT_PATH
  - Include: Continuation guidance, progress tracking

#### communication/
- [ ] `needs-you-question-v1.0.0.md`
  - Variables: QUESTION, CONTEXT, DECISION_NEEDED
  - Include: Options presentation, default recommendation

- [ ] `needs-you-approval-v1.0.0.md`
  - Variables: ACTION, CONSTITUTIONAL_LIMIT, JUSTIFICATION
  - Include: Clear permission request

#### calibration/
- [ ] `calibration-task-v1.0.0.md`
  - Variables: CAPABILITY_ID, CALIBRATION_PROJECT, SUCCESS_CRITERIA
  - Include: Evidence collection guidance

- [ ] `practice-task-v1.0.0.md`
  - Variables: CAPABILITY_GAP, SAFE_SCOPE
  - Include: Safe experimentation guidelines

- [ ] `retrospective-v1.0.0.md`
  - Variables: TIME_PERIOD, WORK_LEDGER_SUMMARY, CAPABILITY_CHANGES
  - Include: Pattern identification, improvement recommendations

### 8.3 Prompt Composition Strategy
- [ ] Document how prompts compose (base + modifiers)
- [ ] Create composition examples in README
- [ ] Define composition order (base → research → retry → strategy)

## Phase 9: Performance & Observability (2-3 hours)

### 9.1 Prompt Metrics
- [ ] Add prompt version to work-ledger.jsonl entries
- [ ] Track which prompt versions were used per task
- [ ] Add prompt rendering time metrics
- [ ] Log prompt token counts

### 9.2 Evaluation Framework
- [ ] Create `prompts/evaluations/` directory
- [ ] Define evaluation metrics per prompt category
- [ ] Create baseline for current prompts
- [ ] Document how to run prompt evaluations

## Phase 10: Versioning Workflow (1 hour)

### 10.1 Create Versioning Tools
- [ ] Script to create new prompt version
- [ ] Script to update symlink to new version
- [ ] Script to rollback to previous version
- [ ] Git hooks for prompt versioning

### 10.2 Documentation
- [ ] Document semantic versioning rules for prompts
  - MAJOR: Breaking changes (variable changes, output format changes)
  - MINOR: New features (new sections, new guidance)
  - PATCH: Bug fixes (typos, clarifications)
- [ ] Document when to create new version
- [ ] Document rollback procedure

## Estimated Total Time: 22-30 hours

## Success Criteria

- [ ] All prompts are in Markdown with YAML frontmatter
- [ ] Each prompt has individual versioning (not global)
- [ ] Symlinks point to current versions
- [ ] All code uses prompt loader (no hardcoded strings)
- [ ] All prompts have clear variable lists in frontmatter
- [ ] README documents complete workflow
- [ ] Tests cover all prompt loading scenarios
- [ ] Can rollback any prompt to previous version
- [ ] Prompt versions logged in work-ledger.jsonl

## Next Steps After Completion

1. **Monitor prompt performance** - Track success rates per prompt version
2. **A/B testing** - Test new prompt versions against baselines
3. **Continuous improvement** - Update prompts based on evidence
4. **Community feedback** - Get feedback on prompt effectiveness

## References

- [Mastering Prompt Versioning](https://dev.to/kuldeep_paul/mastering-prompt-versioning-best-practices-for-scalable-llm-development-2mgm)
- [Prompt Versioning Best Practices](https://latitude-blog.ghost.io/blog/prompt-versioning-best-practices/)
- [Prompt Management Guide](https://launchdarkly.com/blog/prompt-versioning-and-management/)
- [Confident AI Prompt Versioning](https://documentation.confident-ai.com/docs/prompt-management/prompt-versioning)
