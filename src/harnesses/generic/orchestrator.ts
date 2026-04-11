/**
 * Generic harness orchestrator — native TypeScript port.
 *
 * Faithful port of generic-harness-v2026-01-v2/src/orchestrator.js. Key
 * deviations from the JS original:
 *
 *   1. Runs against AgentWorkerProvider (not `query()` from Claude SDK) via
 *      runHarnessAgent(), so Claude/Codex/Kimi all share one codepath.
 *   2. Emits HarnessEvents through a HarnessEventBus instead of writing to
 *      console.log. The CLI re-renders to stdout; the executive routes events
 *      into STEPS.json.
 *   3. Drops legacy 'refresh-spec' and 'overwrite' modes — the new lifecycle
 *      is bootstrap | adopt | extend | extend-deep | resume (matching
 *      HarnessModeType).
 *   4. No Playwright MCP injection. The Claude provider uses SDK auto-discovery
 *      (Playwright MCP is configured in Claude Code settings). Codex/Kimi
 *      fall back to `Bash npx playwright test` in validate prompts.
 *
 * Schemas (STATUS.json, TASKS.json, task packet.md, TASKS/<id>/ layout) are
 * byte-compatible with the JS harness — resume paths must work against bundles
 * that were last touched by the JS orchestrator.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { HarnessEventBus } from '../core/harness-event-bus.js';
import {
  runHarnessAgent,
  didAgentPass,
  type HarnessAgentResult,
} from '../core/harness-agent-runner.js';
import type {
  HarnessEvent,
  HarnessRunConfig,
  HarnessModeType,
} from '../core/types.js';
import type { AgentWorkerMessage } from '../../core/vendor/types.js';
import {
  GENERIC_AGENT_CONFIGS,
  resolveAgentModel,
  resolveMaxTurns,
  type GenericAgentName,
} from './model-defaults.js';
import { loadPrompt } from './prompt-loader.js';
import {
  appendProgress,
  loadState,
  saveState,
  loadTasks,
  saveTasks,
  INITIAL_STATE,
  type GenericHarnessState,
  type GenericTask,
} from './state-store.js';
import {
  detectSpecGaps,
  detectScenario,
  isDirEmpty,
} from './mode-detector.js';

const execAsync = promisify(exec);

const TASK_ID_PATTERN = /^\d+(?:\.\d+)*$/;

// ── Public entrypoint — drives the HarnessEventBus ──────────────

export function runGenericOrchestrator(config: HarnessRunConfig): AsyncIterable<HarnessEvent> {
  const bus = new HarnessEventBus();

  (async () => {
    try {
      bus.emit({
        type: 'run_start',
        harness: 'generic',
        mode: config.mode.type,
        target: config.targetDir,
        at: new Date().toISOString(),
      });
      await orchestrate(config, bus);
      bus.emit({
        type: 'run_complete',
        success: true,
        at: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      bus.emit({
        type: 'run_failed',
        error: msg,
        at: new Date().toISOString(),
      });
      bus.emit({
        type: 'run_complete',
        success: false,
        errors: [msg],
        at: new Date().toISOString(),
      });
    } finally {
      bus.close();
    }
  })();

  return bus;
}

// ── Orchestrate ──────────────────────────────────────────────────

async function orchestrate(config: HarnessRunConfig, bus: HarnessEventBus): Promise<void> {
  const targetDir = config.targetDir;
  const docsDir = join(targetDir, 'ai-docs');
  const codeDir = targetDir;

  const specStatus = detectSpecGaps(docsDir);
  const scenario = await detectScenario(docsDir, codeDir);

  // Resolve effective mode. config.mode.type is a hint from detectMode(); the
  // orchestrator double-checks because STATUS.json may have changed since.
  let mode: HarnessModeType = config.mode.type;
  if (specStatus.hasStatus && !specStatus.missing.length) {
    const existing = await loadState(docsDir);
    if (existing.phase === 'PAUSED' || existing.phase === 'EXECUTING') {
      mode = 'resume';
    }
  } else if (!specStatus.hasStatus) {
    // No STATUS.json — override to scenario.mode (resume not possible)
    mode = scenario.mode;
  }

  if (mode === 'resume' && !specStatus.hasStatus) {
    throw new Error('Cannot resume: STATUS.json missing. Expected bootstrap/adopt mode.');
  }

  const docsEmpty = await isDirEmpty(docsDir);
  const codeEmpty = await isDirEmpty(codeDir);
  const _targetHasContent = !(docsEmpty && codeEmpty);

  let state = await loadState(docsDir);
  if (mode === 'bootstrap') {
    state = { ...INITIAL_STATE };
  }
  state.mode = mode;

  // Phase correction: COMPLETE but pending tasks → EXECUTING
  if (state.phase === 'COMPLETE' && state.tasks?.length) {
    const incomplete = state.tasks.filter(
      (t) => t.status === 'pending' || t.status === 'needs_subtask',
    );
    if (incomplete.length > 0) {
      state.phase = 'EXECUTING';
      mode = 'resume';
      state.mode = 'resume';
      await appendProgress(
        docsDir,
        `Corrected phase from COMPLETE to EXECUTING (${incomplete.length} incomplete tasks)`,
      );
    }
  }

  // Promote parent tasks if all subtasks complete
  if (state.tasks) {
    const promoted: string[] = [];
    for (const task of state.tasks) {
      if (task.status === 'needs_subtask' && task.subtasks?.length) {
        const allDone = task.subtasks.every((subId) => {
          const sub = state.tasks.find((t) => t.id === subId);
          return sub && sub.status === 'complete';
        });
        if (allDone) {
          task.status = 'complete';
          promoted.push(task.id);
        }
      }
    }
    if (promoted.length > 0) {
      recomputeCounts(state);
      await appendProgress(
        docsDir,
        `Promoted ${promoted.length} parent task(s) to complete: ${promoted.join(', ')}`,
      );
    }
  }

  await appendProgress(docsDir, '═'.repeat(60));
  await appendProgress(docsDir, 'ORCHESTRATION STARTED');
  await appendProgress(
    docsDir,
    `Mode: ${mode} (Scenario ${scenario.scenario}: ${scenario.description})`,
  );
  await appendProgress(docsDir, `Docs: ${docsDir}`);
  await appendProgress(docsDir, `Code: ${codeDir}`);
  await appendProgress(docsDir, `Vendor: ${config.vendor}`);
  await appendProgress(docsDir, `Resuming from phase: ${state.phase}`);
  if (specStatus.missing.length > 0) {
    await appendProgress(docsDir, `Missing spec files: ${specStatus.missing.join(', ')}`);
  }
  await appendProgress(docsDir, '═'.repeat(60));

  // ── Git branch (if PROMPT.md has a branch: entry) ─────────────
  const promptContent = existsSync(config.promptFile)
    ? await readFile(config.promptFile, 'utf-8')
    : '';
  if (promptContent) {
    const branchResult = await ensureGitBranch(codeDir, promptContent, docsDir, mode);
    await appendProgress(docsDir, branchResult.message);
  }

  const promptYaml = parsePromptConfig(promptContent);
  const incrementalE2E = resolveIncrementalE2E(promptYaml);

  // ── Phase 1: spec refresh (bootstrap/adopt/extend/extend-deep) ─
  if (mode === 'bootstrap' || mode === 'adopt' || mode === 'extend' || mode === 'extend-deep') {
    bus.emit({ type: 'phase_start', phase: 'SPEC', at: new Date().toISOString() });
    await runSpecRefresh({
      docsDir,
      codeDir,
      promptFile: config.promptFile,
      state,
      config,
      specMode: mode,
      bus,
    });
    state.phase = 'EXECUTING';
    await saveState(docsDir, state);
    bus.emit({ type: 'phase_complete', phase: 'SPEC', success: true, at: new Date().toISOString() });
  }

  if (!state.currentStateSummary) {
    state.currentStateSummary = await captureCurrentStateSummary(codeDir, docsDir);
  }

  // Resume pause/execution states
  if (state.phase === 'PAUSED') {
    await appendProgress(docsDir, `Resuming from PAUSED state (was: ${state.pauseReason})`);
    state.phase = 'EXECUTING';
    state.pauseReason = null;
    await saveState(docsDir, state);
  }

  if (state.phase === 'EXECUTING' && state.currentTaskId) {
    await appendProgress(docsDir, `Recovering: was working on task ${state.currentTaskId}`);
    const currentTask = state.tasks.find((t) => t.id === state.currentTaskId);
    if (currentTask && currentTask.status === 'in_progress') {
      currentTask.status = 'pending';
      await appendProgress(docsDir, `Reset task ${state.currentTaskId} to pending for retry`);
    }
    await saveState(docsDir, state);
  }

  // INIT-mode resume path
  if (state.phase === 'INIT' && mode === 'resume') {
    const tasksData = await loadTasks(docsDir);
    if (tasksData.tasks?.length) {
      state.tasks = tasksData.tasks;
      state.phase = 'EXECUTING';
      state.startedAt = state.startedAt || new Date().toISOString();
      recomputeCounts(state);
      await saveState(docsDir, state);
      await appendProgress(
        docsDir,
        `STATUS.json was INIT but tasks exist. Resuming with ${state.tasks.length} tasks.`,
      );
    }
  }

  // ── Task execution loop ───────────────────────────────────────
  const maxTasks = Number.isFinite((config as unknown as { maxTasks?: number }).maxTasks)
    ? (config as unknown as { maxTasks?: number }).maxTasks!
    : Infinity;
  const maxBuildAttempts = 3;
  const maxValidateAttempts = 2;
  let iterations = 0;

  while (state.phase === 'EXECUTING') {
    iterations++;
    if (iterations > maxTasks) {
      state.phase = 'PAUSED';
      state.pauseReason = `Max tasks (${maxTasks}) reached`;
      state.currentTaskId = null;
      await saveState(docsDir, state);
      await appendProgress(docsDir, `Max tasks (${maxTasks}) reached. Pausing for resume.`);
      break;
    }

    await syncTasksFromDisk(state, docsDir);

    const task = selectNextTask(state.tasks);
    if (!task) {
      state.phase = 'COMPLETE';
      state.currentTaskId = null;
      await appendProgress(docsDir, 'All tasks complete!');
      break;
    }

    state.currentTaskId = task.id;
    task.status = 'in_progress';
    await saveState(docsDir, state);

    await appendProgress(docsDir, '─'.repeat(60));
    await appendProgress(docsDir, `Task ${task.id}: ${task.title}`);
    await appendProgress(docsDir, '─'.repeat(60));

    await createPacket(task, docsDir);

    const packetContent = await readFile(join(docsDir, 'TASKS', task.id, 'packet.md'), 'utf-8');
    const priorHandoffs = summarizeHandoffs(await getRecentHandoffs(docsDir, 5, task.id));
    const priorProgress = await detectTaskProgress(docsDir, task.id);

    // RESEARCH
    if (priorProgress.skipResearch) {
      await appendProgress(docsDir, 'Phase: RESEARCH skipped (completed on prior run)');
    } else {
      bus.emit({ type: 'phase_start', phase: 'RESEARCH', agent: 'research', at: new Date().toISOString() });
      await appendProgress(docsDir, 'Phase: RESEARCH');
      const e2eTests = incrementalE2E
        ? await discoverExistingE2ETests(codeDir)
        : 'Incremental E2E disabled for this project.';

      const researchResult = await runAgent({
        agent: 'research',
        sessionId: `task/${task.id}/research`,
        context: {
          TASK_ID: task.id,
          PACKET_CONTENT: packetContent,
          TARGET_DIR: codeDir,
          DOCS_DIR: docsDir,
          CURRENT_STATE_SUMMARY: state.currentStateSummary || '',
          PRIOR_HANDOFFS: priorHandoffs,
          RESUME_CONTEXT: '',
          EXISTING_E2E_TESTS: e2eTests,
        },
        config,
        bus,
        outputDir: docsDir,
        workDir: codeDir,
      });

      const scope = (researchResult.handoff as { scope?: { level?: string; rationale?: string } } | null)?.scope;
      if (!state.scopeClassification && scope?.level) {
        state.scopeClassification = { level: scope.level, rationale: scope.rationale || '' };
        await appendProgress(
          docsDir,
          `Scope classified as ${scope.level} by research (rationale: ${scope.rationale || 'n/a'})`,
        );
        await saveState(docsDir, state);
      }
      bus.emit({
        type: 'phase_complete',
        phase: 'RESEARCH',
        success: didAgentPass(researchResult),
        at: new Date().toISOString(),
      });
    }

    // BUILD (with retries)
    let buildPassed = false;
    if (priorProgress.skipBuild) {
      buildPassed = true;
      await appendProgress(docsDir, 'Phase: BUILD skipped (passed on prior run)');
    } else {
      bus.emit({ type: 'phase_start', phase: 'BUILD', agent: 'build', at: new Date().toISOString() });
      await appendProgress(docsDir, 'Phase: BUILD');
    }

    for (
      let attempt = priorProgress.buildStartAttempt;
      attempt <= maxBuildAttempts && !buildPassed;
      attempt++
    ) {
      await appendProgress(docsDir, `Build attempt ${attempt}/${maxBuildAttempts}`);
      if (attempt > 1) {
        bus.emit({
          type: 'retry_scheduled',
          agent: 'build',
          attempt,
          max: maxBuildAttempts,
          reason: 'previous build attempt failed',
          at: new Date().toISOString(),
        } as HarnessEvent);
      }

      let researchContent = '';
      try {
        researchContent = await readFile(
          join(docsDir, 'TASKS', task.id, 'research.md'),
          'utf-8',
        );
      } catch {}
      const e2eTests = incrementalE2E
        ? await discoverExistingE2ETests(codeDir)
        : 'Incremental E2E disabled for this project.';

      const buildResult = await runAgent({
        agent: 'build',
        sessionId: `task/${task.id}/build/${attempt}`,
        context: {
          TASK_ID: task.id,
          ATTEMPT: String(attempt),
          PACKET_CONTENT: packetContent,
          RESEARCH_CONTENT: researchContent,
          TARGET_DIR: codeDir,
          DOCS_DIR: docsDir,
          CURRENT_STATE_SUMMARY: state.currentStateSummary || '',
          PRIOR_HANDOFFS: priorHandoffs,
          EXISTING_E2E_TESTS: e2eTests,
        },
        config,
        bus,
        outputDir: docsDir,
        workDir: codeDir,
      });

      buildPassed = didAgentPass(buildResult);
      await appendProgress(docsDir, buildPassed ? 'Build PASSED' : 'Build FAILED');
    }
    bus.emit({
      type: 'phase_complete',
      phase: 'BUILD',
      success: buildPassed,
      at: new Date().toISOString(),
    });

    if (!buildPassed) {
      task.status = 'blocked';
      task.blockReason = 'Build failed after max attempts';
      state.currentTaskId = null;
      recomputeCounts(state);
      await saveState(docsDir, state);
      await appendProgress(docsDir, `Task ${task.id} BLOCKED (build failures)`);
      continue;
    }

    // VALIDATE (with retries)
    bus.emit({ type: 'phase_start', phase: 'VALIDATE', agent: 'validate', at: new Date().toISOString() });
    await appendProgress(docsDir, 'Phase: VALIDATE');
    let validatePassed = false;
    let validateResult: HarnessAgentResult | null = null;
    const validateAttempts: Array<Record<string, unknown>> = [];

    for (
      let attempt = priorProgress.validateStartAttempt;
      attempt <= maxValidateAttempts && !validatePassed;
      attempt++
    ) {
      await appendProgress(docsDir, `Validate attempt ${attempt}/${maxValidateAttempts}`);
      if (attempt > 1) {
        bus.emit({
          type: 'retry_scheduled',
          agent: 'validate',
          attempt,
          max: maxValidateAttempts,
          reason: 'previous validate attempt failed',
          at: new Date().toISOString(),
        } as HarnessEvent);
      }
      const e2eTests = incrementalE2E
        ? await discoverExistingE2ETests(codeDir)
        : 'Incremental E2E disabled for this project.';

      validateResult = await runAgent({
        agent: 'validate',
        sessionId: `task/${task.id}/validate/${attempt}`,
        context: {
          TASK_ID: task.id,
          ATTEMPT: String(attempt),
          PACKET_CONTENT: packetContent,
          TARGET_DIR: codeDir,
          DOCS_DIR: docsDir,
          CURRENT_STATE_SUMMARY: state.currentStateSummary || '',
          PRIOR_HANDOFFS: priorHandoffs,
          EXISTING_E2E_TESTS: e2eTests,
        },
        config,
        bus,
        outputDir: docsDir,
        workDir: codeDir,
      });

      validatePassed = didAgentPass(validateResult);
      const issues = (validateResult.handoff as { issues?: Array<Record<string, unknown>> } | null)?.issues;
      if (!validatePassed && issues?.[0]) {
        validateAttempts.push(issues[0]);
      }
      await appendProgress(docsDir, validatePassed ? 'Validate PASSED' : 'Validate FAILED');
    }
    bus.emit({
      type: 'phase_complete',
      phase: 'VALIDATE',
      success: validatePassed,
      at: new Date().toISOString(),
    });

    if (validatePassed) {
      task.status = 'complete';
      state.currentTaskId = null;
      recomputeCounts(state);
      await appendProgress(docsDir, `Task ${task.id} COMPLETE`);

      if (task.parentId) {
        const parent = state.tasks.find((t) => t.id === task.parentId);
        if (parent && parent.status === 'needs_subtask') {
          const allSubtasksComplete = (parent.subtasks || []).every((subId) => {
            const sub = state.tasks.find((t) => t.id === subId);
            return sub && sub.status === 'complete';
          });
          if (allSubtasksComplete) {
            parent.status = 'complete';
            recomputeCounts(state);
            await appendProgress(
              docsDir,
              `Parent task ${parent.id} promoted to complete (all subtasks done)`,
            );
          }
        }
      }
    } else {
      // Subtask creation path — failed validation
      const preSync = await syncTasksFromDisk(state, docsDir);
      const validatorCreated = preSync.added.filter(
        (t) => t.parentId === task.id,
      );

      if (validatorCreated.length > 0) {
        task.status = 'needs_subtask';
        task.subtasks = task.subtasks || [];
        for (const sub of validatorCreated) {
          if (!task.subtasks.includes(sub.id)) task.subtasks.push(sub.id);
        }
        state.currentTaskId = null;
        recomputeCounts(state);
        await appendProgress(
          docsDir,
          `Task ${task.id} FAILED validation. Using validator-created subtask(s): ${validatorCreated
            .map((s) => s.id)
            .join(', ')}`,
        );
      } else {
        const issue =
          ((validateResult?.handoff as { issues?: Array<Record<string, unknown>> } | null)?.issues?.[0] as
            | { title?: string; criterion?: string; description?: string; evidence?: string }
            | undefined) || {
            title: 'Validation failed',
            criterion: 'Fix validation issues',
          };
        const subtask = await createSubtask(task, issue, docsDir, state.tasks, validateAttempts);
        state.tasks.push(subtask);
        task.status = 'needs_subtask';
        task.subtasks = task.subtasks || [];
        task.subtasks.push(subtask.id);
        state.currentTaskId = null;
        recomputeCounts(state);
        bus.emit({
          type: 'subtask_created',
          subtask_id: subtask.id,
          parent: task.id,
          reason: issue.title || 'validation failed',
          at: new Date().toISOString(),
        } as HarnessEvent);
        await appendProgress(
          docsDir,
          `Task ${task.id} FAILED validation. Created subtask ${subtask.id}`,
        );
      }
    }

    await saveState(docsDir, state);
    const tasksData = await loadTasks(docsDir);
    tasksData.tasks = state.tasks;
    await saveTasks(docsDir, tasksData);
    await writeTasksMarkdown(docsDir, state.tasks);
  }

  await appendProgress(docsDir, '═'.repeat(60));
  await appendProgress(docsDir, 'ORCHESTRATION COMPLETE');
  await appendProgress(docsDir, `Phase: ${state.phase}`);
  await appendProgress(docsDir, `Completed: ${state.completedCount}`);
  await appendProgress(docsDir, `Failed: ${state.failedCount}`);
  await appendProgress(docsDir, '═'.repeat(60));

  await saveState(docsDir, state);

  if (state.phase === 'COMPLETE') {
    await commitHarnessFinalization(codeDir, docsDir, state);
  }
}

// ── Spec refresh pipeline (WHY → WHAT → HOW → WHEN) ─────────────

interface SpecRefreshArgs {
  docsDir: string;
  codeDir: string;
  promptFile: string;
  state: GenericHarnessState;
  config: HarnessRunConfig;
  specMode: HarnessModeType;
  bus: HarnessEventBus;
}

async function runSpecRefresh(args: SpecRefreshArgs): Promise<void> {
  const { docsDir, codeDir, promptFile, state, config, specMode, bus } = args;

  if (!existsSync(promptFile)) {
    throw new Error(`Prompt not found for refresh: ${promptFile}`);
  }

  const existingTasksData = await loadTasks(docsDir);
  const promptContent = await readFile(promptFile, 'utf-8');
  const currentStateSummary = await captureCurrentStateSummary(codeDir, docsDir);
  state.currentStateSummary = currentStateSummary;

  await mkdir(join(docsDir, 'SPEC'), { recursive: true });
  await writeFile(join(docsDir, 'SPEC', 'CURRENT_STATE.md'), currentStateSummary);
  await writeFile(join(docsDir, 'SPEC', 'PROMPT.md'), promptContent);
  await appendProgress(docsDir, 'Copied original prompt to SPEC/PROMPT.md');

  if (specMode === 'extend' || specMode === 'extend-deep') {
    const buildHistory = await generateBuildHistory(docsDir);
    await writeFile(join(docsDir, 'SPEC', 'BUILD_HISTORY.md'), buildHistory);
    await appendProgress(docsDir, 'Generated BUILD_HISTORY.md (compressed prior context)');
  }

  const modeLabel = specMode.toUpperCase();
  await appendProgress(docsDir, `Phase: ${modeLabel}`);

  const existingConstitution = existsSync(join(docsDir, 'SPEC/CONSTITUTION.md'))
    ? await readFile(join(docsDir, 'SPEC/CONSTITUTION.md'), 'utf-8')
    : '';
  const existingWhyWhat = existsSync(join(docsDir, 'SPEC/WHY_WHAT.md'))
    ? await readFile(join(docsDir, 'SPEC/WHY_WHAT.md'), 'utf-8')
    : '';
  const existingHow = existsSync(join(docsDir, 'SPEC/HOW.md'))
    ? await readFile(join(docsDir, 'SPEC/HOW.md'), 'utf-8')
    : '';

  // WHY
  if (specMode === 'bootstrap' || specMode === 'adopt') {
    await appendProgress(docsDir, 'WHY Agent: Generating CONSTITUTION.md...');
    const result = await runAgent({
      agent: 'spec-why',
      sessionId: `${specMode}/spec-why`,
      context: {
        PROMPT_CONTENT: promptContent,
        SPEC_MODE: specMode,
        TARGET_DIR: docsDir,
        DOCS_DIR: docsDir,
        CODE_DIR: codeDir,
        EXISTING_CONSTITUTION: existingConstitution,
      },
      config,
      bus,
      outputDir: docsDir,
      workDir: codeDir,
    });
    if (!didAgentPass(result)) {
      await appendProgress(
        docsDir,
        `WHY Agent failed: ${result.errors[0] || 'agent reported failure'}`,
      );
      throw new Error('WHY Agent (CONSTITUTION) failed');
    }
    await appendProgress(docsDir, 'WHY Agent: CONSTITUTION.md generated');
  } else {
    await appendProgress(docsDir, 'WHY Agent: SKIP (CONSTITUTION is immutable)');
  }

  const constitutionContent = existsSync(join(docsDir, 'SPEC/CONSTITUTION.md'))
    ? await readFile(join(docsDir, 'SPEC/CONSTITUTION.md'), 'utf-8')
    : '';

  // WHAT
  await appendProgress(docsDir, 'WHAT Agent: Generating/updating WHY_WHAT.md...');
  const whatResult = await runAgent({
    agent: 'spec-what',
    sessionId: `${specMode}/spec-what`,
    context: {
      PROMPT_CONTENT: promptContent,
      CONSTITUTION_CONTENT: constitutionContent,
      EXISTING_WHY_WHAT: existingWhyWhat,
      SPEC_MODE: specMode,
      TARGET_DIR: docsDir,
      DOCS_DIR: docsDir,
      CODE_DIR: codeDir,
    },
    config,
    bus,
    outputDir: docsDir,
    workDir: codeDir,
  });
  if (!didAgentPass(whatResult)) {
    await appendProgress(
      docsDir,
      `WHAT Agent failed: ${whatResult.errors[0] || 'agent reported failure'}`,
    );
    throw new Error('WHAT Agent (WHY_WHAT) failed');
  }
  await appendProgress(docsDir, 'WHAT Agent: WHY_WHAT.md generated');

  const whyWhatContent = existsSync(join(docsDir, 'SPEC/WHY_WHAT.md'))
    ? await readFile(join(docsDir, 'SPEC/WHY_WHAT.md'), 'utf-8')
    : '';

  // HOW
  let howDepth: 'full' | 'skip' | 'review' = 'skip';
  if (specMode === 'bootstrap' || specMode === 'adopt') howDepth = 'full';
  else if (specMode === 'extend-deep') howDepth = 'review';

  if (howDepth !== 'skip') {
    await appendProgress(docsDir, `HOW Agent (${howDepth}): Generating/reviewing HOW.md...`);
    const howResult = await runAgent({
      agent: 'spec-how',
      sessionId: `${specMode}/spec-how`,
      context: {
        CONSTITUTION_CONTENT: constitutionContent,
        WHY_WHAT_CONTENT: whyWhatContent,
        EXISTING_HOW: existingHow,
        SPEC_MODE: specMode,
        HOW_DEPTH: howDepth,
        TARGET_DIR: docsDir,
        DOCS_DIR: docsDir,
        CODE_DIR: codeDir,
      },
      config,
      bus,
      outputDir: docsDir,
      workDir: codeDir,
    });
    if (!didAgentPass(howResult)) {
      await appendProgress(
        docsDir,
        `HOW Agent failed: ${howResult.errors[0] || 'agent reported failure'}`,
      );
      throw new Error('HOW Agent (HOW) failed');
    }
    await appendProgress(
      docsDir,
      `HOW Agent: HOW.md ${howDepth === 'review' ? 'reviewed' : 'generated'}`,
    );
  } else {
    await appendProgress(docsDir, 'HOW Agent: SKIP (using existing patterns)');
  }

  const howContent = existsSync(join(docsDir, 'SPEC/HOW.md'))
    ? await readFile(join(docsDir, 'SPEC/HOW.md'), 'utf-8')
    : '';

  // WHEN
  await appendProgress(docsDir, 'WHEN Agent: Generating TASKS.json...');
  const whenResult = await runAgent({
    agent: 'spec-when',
    sessionId: `${specMode}/spec-when`,
    context: {
      CONSTITUTION_CONTENT: constitutionContent,
      WHY_WHAT_CONTENT: whyWhatContent,
      HOW_CONTENT: howContent,
      EXISTING_TASKS: JSON.stringify(existingTasksData),
      SPEC_MODE: specMode,
      TARGET_DIR: docsDir,
      DOCS_DIR: docsDir,
      CODE_DIR: codeDir,
    },
    config,
    bus,
    outputDir: docsDir,
    workDir: codeDir,
  });
  if (!didAgentPass(whenResult)) {
    await appendProgress(
      docsDir,
      `WHEN Agent failed: ${whenResult.errors[0] || 'agent reported failure'}`,
    );
    throw new Error('WHEN Agent (TASKS) failed');
  }
  await appendProgress(docsDir, 'WHEN Agent: TASKS.json generated');

  const refreshed = await loadTasks(docsDir);
  const reconciled = reconcileTasks(existingTasksData.tasks, refreshed.tasks);
  refreshed.tasks = reconciled;
  await saveTasks(docsDir, refreshed);
  await writeTasksMarkdown(docsDir, reconciled);

  state.tasks = reconciled;
  state.startedAt = state.startedAt || new Date().toISOString();
  recomputeCounts(state);
  await saveState(docsDir, state);
  await appendProgress(docsDir, `Spec refresh complete. ${state.tasks.length} tasks reconciled.`);
}

// ── Agent runner wrapper — loads prompt, calls runHarnessAgent, persists ──

interface RunAgentArgs {
  agent: GenericAgentName;
  sessionId: string;
  context: Record<string, string>;
  config: HarnessRunConfig;
  bus: HarnessEventBus;
  outputDir: string;
  workDir: string;
}

async function runAgent(args: RunAgentArgs): Promise<HarnessAgentResult> {
  const { agent, sessionId, context, config, bus, outputDir, workDir } = args;
  const agentConfig = GENERIC_AGENT_CONFIGS[agent];
  const promptMarkdown = await loadPrompt(agentConfig.prompt, context);
  const model = resolveAgentModel(agent, config.modelOverrides);
  const maxTurns = resolveMaxTurns(config.vendor, config.maxTurnsPerAgent);

  const outputPath = sessionToPath(sessionId, outputDir);
  await mkdir(join(outputPath, '..'), { recursive: true });

  bus.emit({
    type: 'agent_start',
    agent,
    model,
    vendor: config.vendor,
    at: new Date().toISOString(),
  });

  const result = await runHarnessAgent({
    agentName: agent,
    promptMarkdown,
    model,
    cwd: workDir,
    allowedTools: agentConfig.tools,
    maxTurns,
    provider: config.provider,
    vendor: config.vendor,
    abortSignal: config.abortSignal,
  });

  // Emit each captured message so transcripts survive when executor hooks it up
  for (const msg of result.messages) {
    bus.emit({
      type: 'agent_message',
      agent,
      role: toRole(msg),
      text: msg.text,
      raw: msg.raw,
    } as HarnessEvent);
  }

  bus.emit({
    type: 'agent_complete',
    agent,
    success: didAgentPass(result),
    errors: result.errors,
    duration_ms: result.durationMs,
  } as HarnessEvent);

  // Persist output + handoff JSON (mirrors JS harness file layout)
  await writeFile(outputPath, result.output || '');
  const handoffPath = outputPath.replace(/\.md$/, '_handoff.json');
  await writeFile(
    handoffPath,
    JSON.stringify(
      {
        agentName: agent,
        sessionId,
        timestamp: new Date().toISOString(),
        success: didAgentPass(result),
        modelUsed: result.modelUsed,
        vendor: config.vendor,
        errors: result.errors,
        handoff: result.handoff,
      },
      null,
      2,
    ),
  );
  bus.emit({ type: 'status_written', path: handoffPath } as HarnessEvent);

  return result;
}

function toRole(msg: AgentWorkerMessage): 'assistant' | 'user' | 'system' {
  if (msg.type === 'assistant') return 'assistant';
  if (msg.type === 'user') return 'user';
  return 'system';
}

function sessionToPath(sessionId: string, outputDir: string): string {
  const parts = sessionId.split('/');
  if (parts[0] === 'bootstrap') {
    return join(outputDir, 'SPEC', 'bootstrap.md');
  }
  if (parts[0] === 'task') {
    const [, taskId, phase, attempt] = parts;
    if (attempt) {
      return join(outputDir, 'TASKS', taskId, `${phase}_attempt_${attempt}.md`);
    }
    return join(outputDir, 'TASKS', taskId, `${phase}.md`);
  }
  // spec agents: <mode>/<agent>
  const [mode, agent] = parts;
  return join(outputDir, 'SPEC', `${mode}_${agent}.md`);
}

// ── Helpers ported inline (state surgery, file I/O, task selection) ──

function recomputeCounts(state: GenericHarnessState): void {
  state.completedCount = state.tasks.filter((t) => t.status === 'complete').length;
  state.failedCount = state.tasks.filter((t) =>
    ['blocked', 'needs_subtask'].includes(t.status),
  ).length;
}

function reconcileTasks(existing: GenericTask[] = [], refreshed: GenericTask[] = []): GenericTask[] {
  const existingMap = new Map(existing.map((t) => [t.id, t]));
  const merged: GenericTask[] = [];
  for (const task of refreshed) {
    const prev = existingMap.get(task.id);
    merged.push({
      ...prev,
      ...task,
      status: prev?.status || task.status || 'pending',
      acceptanceCriteria: task.acceptanceCriteria || prev?.acceptanceCriteria || [],
      dependencies: task.dependencies || prev?.dependencies || [],
      subtasks: prev?.subtasks || task.subtasks || [],
      parentId: prev?.parentId ?? task.parentId ?? null,
    });
    existingMap.delete(task.id);
  }
  for (const leftover of existingMap.values()) {
    merged.push(leftover);
  }
  return merged;
}

function selectNextTask(tasks: GenericTask[]): GenericTask | undefined {
  const subtasks = tasks.filter((t) => t.id.includes('.') && t.status === 'pending');
  if (subtasks.length) {
    return subtasks.sort((a, b) => a.id.localeCompare(b.id))[0];
  }
  const ready = tasks.filter((t) => {
    if (t.status !== 'pending') return false;
    const deps = t.dependencies || [];
    return deps.every((depId) => {
      const dep = tasks.find((d) => d.id === depId);
      return dep && dep.status === 'complete';
    });
  });
  return ready.sort((a, b) => parseFloat(a.id) - parseFloat(b.id))[0];
}

async function createPacket(task: GenericTask, docsDir: string): Promise<void> {
  const taskDir = join(docsDir, 'TASKS', task.id);
  await mkdir(taskDir, { recursive: true });
  const packetPath = join(taskDir, 'packet.md');
  if (existsSync(packetPath)) return;

  const playwrightLine = task.requiredChecks?.playwright
    ? `- [ ] Playwright: ${task.requiredChecks.playwright}`
    : '';
  const content = `# Task ${task.id}: ${task.title}

## Goal
${task.description || ''}

## Acceptance Criteria
${(task.acceptanceCriteria || []).map((c) => `- [ ] ${c}`).join('\n')}

## Required Checks
- [ ] Smoke: App loads without errors
${playwrightLine}

## Constraints
- Follow patterns from SPEC/HOW.md
`;
  await writeFile(packetPath, content);
}

async function writeTasksMarkdown(docsDir: string, tasks: GenericTask[]): Promise<void> {
  const lines = ['# Tasks', ''];
  for (const task of tasks) {
    const box = task.status === 'complete' ? 'x' : ' ';
    lines.push(`- [${box}] Task ${task.id}: ${task.title}`);
  }
  await mkdir(join(docsDir, 'SPEC'), { recursive: true });
  await writeFile(join(docsDir, 'SPEC', 'TASKS.md'), lines.join('\n'));
}

async function syncTasksFromDisk(
  state: GenericHarnessState,
  docsDir: string,
): Promise<{ added: GenericTask[]; updatedParents: string[] }> {
  const tasksDir = join(docsDir, 'TASKS');
  if (!existsSync(tasksDir)) return { added: [], updatedParents: [] };

  const entries = await readdir(tasksDir, { withFileTypes: true });
  const existingIds = new Set(state.tasks.map((t) => t.id));
  const added: GenericTask[] = [];
  const updatedParents = new Set<string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const taskId = entry.name;
    if (!TASK_ID_PATTERN.test(taskId)) continue;
    if (existingIds.has(taskId)) continue;

    const packetPath = join(tasksDir, taskId, 'packet.md');
    if (!existsSync(packetPath)) continue;

    let packetContent = '';
    try {
      packetContent = await readFile(packetPath, 'utf-8');
    } catch {}

    const parentId = taskId.includes('.')
      ? taskId.split('.').slice(0, -1).join('.')
      : null;
    const parentTask = parentId ? state.tasks.find((t) => t.id === parentId) : null;

    const task: GenericTask = {
      id: taskId,
      title: extractPacketTitle(packetContent, taskId),
      description:
        extractPacketSection(packetContent, 'Goal') ||
        extractPacketSection(packetContent, 'Problem'),
      acceptanceCriteria: extractAcceptanceCriteria(packetContent),
      dependencies: parentTask?.dependencies || [],
      parentId,
      status: 'pending',
    };

    state.tasks.push(task);
    existingIds.add(taskId);
    added.push(task);

    if (parentTask) {
      parentTask.subtasks = parentTask.subtasks || [];
      if (!parentTask.subtasks.includes(taskId)) parentTask.subtasks.push(taskId);
      if (parentTask.status !== 'needs_subtask') parentTask.status = 'needs_subtask';
      updatedParents.add(parentId!);
    }
  }

  if (added.length || updatedParents.size) {
    recomputeCounts(state);
  }
  return { added, updatedParents: [...updatedParents] };
}

function extractPacketTitle(content: string, taskId: string): string {
  if (!content) return `Task ${taskId}`;
  const firstLine = content.split('\n')[0] || '';
  let match = firstLine.match(/^#\s*Task\s+[^:]+:\s*(.+)\s*$/);
  if (match?.[1]) return match[1].trim();
  match = firstLine.match(/^#\s*(.+)$/);
  if (match?.[1]) return match[1].trim();
  return `Task ${taskId}`;
}

function extractPacketSection(content: string, heading: string): string {
  if (!content) return '';
  const re = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`, 'i');
  const match = content.match(re);
  return match?.[1]?.trim() || '';
}

function extractAcceptanceCriteria(content: string): string[] {
  const section = extractPacketSection(content, 'Acceptance Criteria');
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- \[[x ]\]\s?/, '').replace(/^- /, '').trim())
    .filter(Boolean);
}

async function collectExistingSubtaskNumbers(parentId: string, docsDir: string): Promise<number[]> {
  const tasksDir = join(docsDir, 'TASKS');
  const numbers: number[] = [];
  try {
    const entries = await readdir(tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(`${parentId}.`)) {
        const n = parseInt(entry.name.split('.').pop()!, 10);
        if (!Number.isNaN(n)) numbers.push(n);
      }
    }
  } catch {}
  return numbers;
}

async function getNextSubtaskId(
  parentId: string,
  existingTasks: GenericTask[],
  docsDir: string,
): Promise<string> {
  const existingSub = existingTasks
    .filter((t) => t.id.startsWith(`${parentId}.`))
    .map((t) => parseInt(t.id.split('.').pop()!, 10))
    .filter((n) => !Number.isNaN(n));
  const onDisk = await collectExistingSubtaskNumbers(parentId, docsDir);
  const all = [...existingSub, ...onDisk];
  const max = all.length > 0 ? Math.max(...all) : 0;
  return `${parentId}.${max + 1}`;
}

async function createSubtask(
  parent: GenericTask,
  issue: { title?: string; description?: string; criterion?: string; evidence?: string },
  docsDir: string,
  existingTasks: GenericTask[],
  previousAttempts: Array<Record<string, unknown>> = [],
): Promise<GenericTask> {
  const subtaskId = await getNextSubtaskId(parent.id, existingTasks, docsDir);
  const taskDir = join(docsDir, 'TASKS', subtaskId);
  await mkdir(taskDir, { recursive: true });

  const attemptHistory =
    previousAttempts.length > 0
      ? `\n## Previous Attempts\n${previousAttempts
          .map(
            (a, i) =>
              `### Attempt ${i + 1}\n- Issue: ${
                (a as { title?: string }).title || 'Unknown'
              }\n- What was tried: ${(a as { attempted?: string }).attempted || 'See previous task folder'}`,
          )
          .join('\n')}\n`
      : '';

  const content = `# Task ${subtaskId}: Fix - ${issue.title || 'Validation failure'}

## Goal
${issue.description || issue.criterion || ''}

## Context
- Parent task: ${parent.id}
- Evidence: ${issue.evidence || 'See parent validation'}
- Attempt number: ${subtaskId.split('.').pop()}
${attemptHistory}
## Acceptance Criteria
- [ ] ${issue.criterion || 'Original criterion passes'}
- [ ] Regression tests still pass

## Required Checks
- [ ] Original failing check now passes
`;
  await writeFile(join(taskDir, 'packet.md'), content);

  return {
    id: subtaskId,
    title: `Fix: ${issue.title || 'Validation issue'}`,
    description: issue.description || issue.criterion || '',
    acceptanceCriteria: [issue.criterion || 'Fix the issue'],
    dependencies: parent.dependencies || [],
    parentId: parent.id,
    status: 'pending',
  };
}

async function detectTaskProgress(
  docsDir: string,
  taskId: string,
): Promise<{
  skipResearch: boolean;
  skipBuild: boolean;
  buildStartAttempt: number;
  validateStartAttempt: number;
}> {
  const taskDir = join(docsDir, 'TASKS', taskId);
  const progress = {
    skipResearch: false,
    skipBuild: false,
    buildStartAttempt: 1,
    validateStartAttempt: 1,
  };

  try {
    const data = JSON.parse(
      await readFile(join(taskDir, 'research_handoff.json'), 'utf-8'),
    ) as { handoff?: { result?: unknown; success?: unknown }; success?: unknown };
    if (didPassFromDisk(data)) progress.skipResearch = true;
  } catch {
    return progress;
  }

  for (let i = 1; i <= 10; i++) {
    try {
      const data = JSON.parse(
        await readFile(join(taskDir, `build_attempt_${i}_handoff.json`), 'utf-8'),
      ) as { handoff?: { result?: unknown; success?: unknown }; success?: unknown };
      if (didPassFromDisk(data)) {
        progress.skipBuild = true;
        break;
      }
      progress.buildStartAttempt = i + 1;
    } catch {
      break;
    }
  }

  if (progress.skipBuild) {
    for (let i = 1; i <= 10; i++) {
      try {
        JSON.parse(
          await readFile(join(taskDir, `validate_attempt_${i}_handoff.json`), 'utf-8'),
        );
        progress.validateStartAttempt = i + 1;
      } catch {
        break;
      }
    }
  }
  return progress;
}

function didPassFromDisk(data: {
  handoff?: { result?: unknown; success?: unknown };
  success?: unknown;
}): boolean {
  if (!data) return false;
  const r = data.handoff?.result;
  if (typeof r === 'string') {
    if (r.toLowerCase() === 'fail') return false;
    if (r.toLowerCase() === 'pass') return true;
  }
  if (r === true) return true;
  if (data.handoff?.success === true) return true;
  if (data.success === true) return true;
  return false;
}

async function getRecentHandoffs(
  docsDir: string,
  limit: number,
  excludeTaskId: string | null,
): Promise<Array<{ taskId: string; role: string; result: unknown; issues: unknown[] }>> {
  const tasksDir = join(docsDir, 'TASKS');
  if (!existsSync(tasksDir)) return [];
  const files: Array<{ path: string; mtime: Date }> = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('_handoff.json')) {
        const st = await stat(full);
        files.push({ path: full, mtime: st.mtime });
      }
    }
  }
  await walk(tasksDir);

  const recent = files
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    .slice(0, limit);
  const results: Array<{ taskId: string; role: string; result: unknown; issues: unknown[] }> = [];
  for (const file of recent) {
    try {
      const content = await readFile(file.path, 'utf-8');
      const data = JSON.parse(content) as {
        sessionId?: string;
        agentName?: string;
        success?: unknown;
        handoff?: { task?: string; role?: string; result?: unknown; issues?: unknown[] };
      };
      if (excludeTaskId && data.sessionId?.includes(`/task/${excludeTaskId}/`)) continue;
      results.push({
        taskId: data.handoff?.task || data.sessionId?.split('/')[1] || 'unknown',
        role: data.agentName || data.handoff?.role || 'unknown',
        result: data.handoff?.result ?? data.success,
        issues: data.handoff?.issues || [],
      });
    } catch {}
  }
  return results;
}

function summarizeHandoffs(
  handoffs: Array<{ taskId: string; role: string; result: unknown; issues: unknown[] }>,
): string {
  if (!handoffs.length) return '';
  return handoffs
    .map((h) => {
      const first = (h.issues[0] as { title?: string } | undefined)?.title;
      const issueSummary = first ? ` Issues: ${first}` : '';
      return `- Task ${h.taskId} (${h.role}) → ${h.result || 'unknown'}${issueSummary}`;
    })
    .join('\n');
}

async function captureCurrentStateSummary(codeDir: string, docsDir: string): Promise<string> {
  const summary: string[] = [];
  const sampled = new Set<string>();

  async function addSnippet(label: string, path: string, max = 1200): Promise<void> {
    if (sampled.has(path)) return;
    try {
      const content = await readFile(path, 'utf-8');
      summary.push(`${label} (${path})\n${content.slice(0, max)}`);
      sampled.add(path);
    } catch {}
  }

  await addSnippet('CONSTITUTION', join(docsDir, 'SPEC/CONSTITUTION.md'));
  await addSnippet('WHY_WHAT', join(docsDir, 'SPEC/WHY_WHAT.md'));
  await addSnippet('HOW', join(docsDir, 'SPEC/HOW.md'));

  try {
    const tasksData = await loadTasks(docsDir);
    if (tasksData.tasks?.length) {
      summary.push(
        `Existing tasks (${tasksData.tasks.length}):\n${tasksData.tasks
          .map((t) => `${t.id} - ${t.title} [${t.status || 'pending'}]`)
          .join('\n')}`,
      );
    }
  } catch {}

  async function buildTree(
    root: string,
    depth = 0,
    maxDepth = 2,
    lines: string[] = [],
    prefix = '',
  ): Promise<string[]> {
    if (depth > maxDepth || lines.length > 120) return lines;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return lines;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (['node_modules', '.git', 'output'].includes(entry.name)) continue;
      const line = `${prefix}${entry.isDirectory() ? '📂' : '📄'} ${entry.name}`;
      lines.push(line);
      if (entry.isDirectory()) {
        await buildTree(join(root, entry.name), depth + 1, maxDepth, lines, prefix + '  ');
      }
      if (lines.length > 120) break;
    }
    return lines;
  }

  const treeLines = await buildTree(codeDir);
  if (treeLines.length) {
    summary.push(`File tree (depth 2)\n${treeLines.join('\n')}`);
  }

  try {
    const pkgPath = join(codeDir, 'package.json');
    const pkgContent = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent) as {
      name?: string;
      scripts?: Record<string, string>;
      main?: string;
      module?: string;
    };
    const scripts = pkg.scripts ? Object.keys(pkg.scripts).slice(0, 6).join(', ') : 'none';
    summary.push(`package.json (name: ${pkg.name || 'unknown'}, scripts: ${scripts})`);
    await addSnippet('package.json excerpt', pkgPath, 600);
  } catch {}

  return summary.join('\n\n') || 'No existing code context found.';
}

async function discoverExistingE2ETests(codeDir: string): Promise<string> {
  const e2eDir = join(codeDir, 'tests', 'e2e');
  try {
    const entries = await readdir(e2eDir, { withFileTypes: true });
    const testFiles = entries
      .filter((e) => e.isFile() && /\.(spec|test)\.(ts|js)$/.test(e.name))
      .map((e) => `tests/e2e/${e.name}`)
      .sort();
    if (testFiles.length === 0) {
      return 'No E2E tests yet. tests/e2e/ directory exists but contains no test files.';
    }
    return `Existing E2E test files (${testFiles.length}):\n${testFiles.map((f) => `- ${f}`).join('\n')}`;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'No E2E tests yet. tests/e2e/ directory does not exist.';
    }
    return `No E2E tests yet (error scanning: ${(err as Error).message}).`;
  }
}

async function generateBuildHistory(docsDir: string): Promise<string> {
  const tasksDir = join(docsDir, 'TASKS');
  const lines: string[] = [
    '# Build History',
    '',
    'Compressed summary of completed tasks for context.',
    '',
    '| Task | Status | Files Modified | Summary |',
    '|------|--------|----------------|---------|',
  ];
  try {
    const taskDirs = await readdir(tasksDir, { withFileTypes: true });
    for (const taskDir of taskDirs.filter((d) => d.isDirectory())) {
      const taskPath = join(tasksDir, taskDir.name);
      const files = await readdir(taskPath).catch(() => [] as string[]);
      const handoffFiles = files.filter((f) => f.endsWith('_handoff.json')).sort().reverse();
      if (handoffFiles.length === 0) continue;
      try {
        const handoffPath = join(taskPath, handoffFiles[0]);
        const data = JSON.parse(await readFile(handoffPath, 'utf-8')) as {
          handoff?: { task?: string; result?: string; filesModified?: string[]; filesCreated?: string[]; handoffNotes?: string; planSummary?: string };
          task?: string;
          result?: string;
        };
        const handoff = data.handoff || data;
        const taskId = (handoff as { task?: string }).task || taskDir.name;
        const status = (handoff as { result?: string }).result || 'unknown';
        const filesModified =
          ((handoff as { filesModified?: string[] }).filesModified ||
            (handoff as { filesCreated?: string[] }).filesCreated ||
            [])
            .slice(0, 3)
            .join(', ') || '-';
        const summary =
          ((handoff as { handoffNotes?: string }).handoffNotes ||
            (handoff as { planSummary?: string }).planSummary ||
            '')
            .slice(0, 80) || '-';
        lines.push(`| ${taskId} | ${status} | ${filesModified} | ${summary} |`);
      } catch {}
    }
  } catch {
    lines.push('| - | - | - | No task history found |');
  }
  lines.push('');
  lines.push('*Note: For full details, see individual task files in TASKS/*');
  return lines.join('\n');
}

// ── Git helpers ─────────────────────────────────────────────────

function parsePromptConfig(content: string): Record<string, string> | null {
  const match = content.match(/```yaml\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  const out: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function resolveIncrementalE2E(yaml: Record<string, string> | null): boolean {
  if (!yaml) return false;
  if (typeof yaml.incremental_e2e === 'string') return yaml.incremental_e2e === 'true';
  return yaml.playwright_testing === 'true';
}

async function ensureGitBranch(
  codeDir: string,
  promptContent: string,
  docsDir: string,
  mode: HarnessModeType,
): Promise<{ created: boolean; message: string }> {
  const config = parsePromptConfig(promptContent);
  if (!config || !config.branch) {
    return { created: false, message: 'No branch specified in PROMPT.md' };
  }

  try {
    await execAsync('git rev-parse --git-dir', { cwd: codeDir });
    const { stdout: currentBranch } = await execAsync('git branch --show-current', { cwd: codeDir });
    let targetBranch = config.branch;

    if (mode === 'bootstrap' || mode === 'adopt') {
      const now = new Date();
      const datePrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-`;
      targetBranch = datePrefix + targetBranch;
    }
    const baselineBranch = config.baseline_branch || 'main';

    const { stdout: branches } = await execAsync('git branch --list', { cwd: codeDir });
    const branchExists = branches
      .split('\n')
      .some((b) => b.trim().replace('* ', '') === targetBranch);

    if (mode === 'bootstrap' || mode === 'adopt') {
      if (branchExists) {
        throw new Error(
          `Branch ${targetBranch} already exists. Choose different branch name or delete manually.`,
        );
      }
      await execAsync(`git checkout -b ${targetBranch} ${baselineBranch}`, { cwd: codeDir });
      await appendProgress(docsDir, `Created new branch: ${targetBranch} (from ${baselineBranch})`);
      return { created: true, message: `Created branch ${targetBranch} from ${baselineBranch}` };
    }

    if (currentBranch.trim() === targetBranch) {
      return { created: false, message: `Already on branch ${targetBranch}` };
    }
    if (branchExists) {
      await execAsync(`git checkout ${targetBranch}`, { cwd: codeDir });
      return { created: false, message: `Switched to existing branch ${targetBranch}` };
    }
    await execAsync(`git checkout -b ${targetBranch} ${baselineBranch}`, { cwd: codeDir });
    return { created: true, message: `Created branch ${targetBranch} from ${baselineBranch}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) throw err;
    return { created: false, message: `Git branch creation skipped: ${msg}` };
  }
}

async function commitHarnessFinalization(
  codeDir: string,
  docsDir: string,
  state: GenericHarnessState,
): Promise<void> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: codeDir });
  } catch {
    return;
  }
  try {
    const { stdout: dirty } = await execAsync('git status --porcelain -- ai-docs', { cwd: codeDir });
    if (!dirty.trim()) return;
    await execAsync('git add -A -- ai-docs', { cwd: codeDir });
    const { stdout: staged } = await execAsync('git diff --cached --name-only -- ai-docs', { cwd: codeDir });
    if (!staged.trim()) return;
    const msg = `chore(harness): finalize run (phase=${state.phase}, completed=${state.completedCount || 0}, failed=${state.failedCount || 0})`;
    await execAsync(`git commit --no-verify -m ${JSON.stringify(msg)}`, { cwd: codeDir });
    await appendProgress(docsDir, 'Committed finalization state to harness branch');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[orchestrator] Finalization commit failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
