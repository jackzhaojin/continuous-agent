/**
 * Adhoc tests for the V2.0 deterministic pipeline executor.
 *
 * Tests:
 * - Pipeline step parsing from playbook frontmatter
 * - Output chaining (step N output -> step N+1 input)
 * - Retry behavior
 * - Overall pipeline result aggregation
 * - Ledger event emission
 *
 * Does NOT actually spawn workers — uses a mock spawnWorkerFn.
 */

import assert from 'node:assert/strict';
import { parsePipelineSteps } from '../../src/harness/pipeline-types.js';
import { executePipeline } from '../../src/harness/pipeline-executor.js';
import type { PipelineLedgerEvent } from '../../src/harness/pipeline-executor.js';
import type { WorkItem, WorkerContract, WorkerResult } from '../../src/core/types.js';
import type { PlaybookDefinition } from '../../src/deterministic/library-loader-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'goal-test-1',
    priority: 'P2',
    title: 'Test Pipeline Goal',
    description: 'Build something via pipeline',
    status: 'pending',
    ...overrides,
  };
}

function makePlaybookDef(pipelineStepsRaw: unknown[], overrides: Partial<PlaybookDefinition> = {}): PlaybookDefinition {
  return {
    name: 'test-pipeline',
    version: '1.0.0',
    category: 'pipeline',
    description: 'Test pipeline playbook',
    goal: 'Test goal',
    context_requires: [],
    context_optional: [],
    composes_skills: [],
    composes_playbooks: [],
    execution_pattern: 'deterministic-pipeline',
    tags: [],
    track_record: {
      total_executions: 0,
      successes: 0,
      failures: 0,
      last_executed: null,
      confidence: 0,
      maturity: 'Declared',
    },
    source_path: '/tmp/test/SKILL.md',
    body: '# Test pipeline',
    pipeline_steps: parsePipelineSteps(pipelineStepsRaw),
    ...overrides,
  };
}

function makeSuccessResult(output = 'step output', outputPath = '/tmp/project'): WorkerResult {
  return {
    success: true,
    output,
    artifacts: [],
    errors: [],
    duration_ms: 100,
    output_path: outputPath,
  };
}

function makeFailResult(error = 'step failed'): WorkerResult {
  return {
    success: false,
    output: '',
    artifacts: [],
    errors: [error],
    duration_ms: 50,
  };
}

// ---------------------------------------------------------------------------
// Test: Pipeline step parsing
// ---------------------------------------------------------------------------

async function testParsePipelineSteps(): Promise<void> {
  // Valid steps
  const raw = [
    { step: 1, name: 'research', playbook: 'worker/research', worker_type: 'research', output: 'research.md' },
    { step: 2, name: 'build', playbook: 'worker/build', worker_type: 'build', retries: 3, output: 'code_changes' },
    { step: 3, name: 'validate', playbook: 'worker/validate', worker_type: 'validate', retries: 1, output: 'result' },
  ];

  const steps = parsePipelineSteps(raw);
  assert.equal(steps.length, 3, 'should parse 3 steps');
  assert.equal(steps[0].name, 'research');
  assert.equal(steps[0].retries, 2, 'default retries should be 2');
  assert.equal(steps[1].retries, 3, 'explicit retries should be preserved');
  assert.equal(steps[2].worker_type, 'validate');

  // Invalid: non-array
  assert.equal(parsePipelineSteps(null).length, 0);
  assert.equal(parsePipelineSteps('not an array').length, 0);
  assert.equal(parsePipelineSteps(undefined).length, 0);

  // Invalid: missing playbook field (required)
  const badSteps = [
    { step: 1, name: 'no-playbook', worker_type: 'build', output: 'x' },
  ];
  assert.equal(parsePipelineSteps(badSteps).length, 0, 'steps without playbook should be skipped');

  // Condition field
  const withCondition = [
    { step: 1, name: 'conditional', playbook: 'worker/spec', worker_type: 'research', condition: 'bootstrap_or_adopt', output: 'spec.md' },
  ];
  const condSteps = parsePipelineSteps(withCondition);
  assert.equal(condSteps[0].condition, 'bootstrap_or_adopt');

  console.log('  PASS testParsePipelineSteps');
}

// ---------------------------------------------------------------------------
// Test: Output chaining
// ---------------------------------------------------------------------------

async function testOutputChaining(): Promise<void> {
  const promptsReceived: string[] = [];

  const mockSpawn = async (contract: WorkerContract): Promise<WorkerResult> => {
    promptsReceived.push(contract.prompt);
    return makeSuccessResult(`output from ${contract.prompt.includes('Step 1') ? 'step1' : 'step2'}`);
  };

  const playbookDef = makePlaybookDef([
    { step: 1, name: 'research', playbook: 'worker/research', worker_type: 'research', output: 'research.md' },
    { step: 2, name: 'build', playbook: 'worker/build', worker_type: 'build', output: 'code_changes' },
  ]);

  const result = await executePipeline(makeWorkItem(), playbookDef, {
    spawnWorkerFn: mockSpawn,
  });

  assert.equal(result.success, true, 'pipeline should succeed');
  assert.equal(result.step_results.length, 2, 'should have 2 step results');

  // Step 2's prompt should contain step 1's output
  assert.ok(promptsReceived.length === 2, 'should have spawned 2 workers');
  assert.ok(
    promptsReceived[1].includes('output from step1'),
    'step 2 prompt should include step 1 output (output chaining)',
  );

  // Step 1's prompt should NOT contain "Previous Step Output"
  assert.ok(
    !promptsReceived[0].includes('Previous Step Output'),
    'step 1 prompt should not have previous step output section',
  );

  console.log('  PASS testOutputChaining');
}

// ---------------------------------------------------------------------------
// Test: Retry behavior
// ---------------------------------------------------------------------------

async function testRetryBehavior(): Promise<void> {
  let callCount = 0;

  const mockSpawn = async (_contract: WorkerContract): Promise<WorkerResult> => {
    callCount++;
    // Fail first 2 calls, succeed on 3rd
    if (callCount <= 2) {
      return makeFailResult(`attempt ${callCount} failed`);
    }
    return makeSuccessResult('finally worked');
  };

  const playbookDef = makePlaybookDef([
    { step: 1, name: 'flaky-step', playbook: 'worker/flaky', worker_type: 'build', retries: 3, output: 'result' },
  ]);

  const result = await executePipeline(makeWorkItem(), playbookDef, {
    spawnWorkerFn: mockSpawn,
  });

  assert.equal(result.success, true, 'pipeline should succeed after retries');
  assert.equal(result.step_results[0].attempts, 3, 'should have taken 3 attempts');
  assert.equal(callCount, 3, 'spawnWorker should have been called 3 times');

  console.log('  PASS testRetryBehavior');
}

// ---------------------------------------------------------------------------
// Test: Retry exhaustion (all retries fail)
// ---------------------------------------------------------------------------

async function testRetryExhaustion(): Promise<void> {
  let callCount = 0;

  const mockSpawn = async (_contract: WorkerContract): Promise<WorkerResult> => {
    callCount++;
    return makeFailResult(`always fails (attempt ${callCount})`);
  };

  const playbookDef = makePlaybookDef([
    { step: 1, name: 'always-fails', playbook: 'worker/broken', worker_type: 'build', retries: 2, output: 'nope' },
    { step: 2, name: 'never-reached', playbook: 'worker/skip', worker_type: 'build', output: 'skip' },
  ]);

  const result = await executePipeline(makeWorkItem(), playbookDef, {
    spawnWorkerFn: mockSpawn,
  });

  assert.equal(result.success, false, 'pipeline should fail');
  assert.equal(result.step_results.length, 1, 'should only have result for failed step (pipeline aborts)');
  assert.equal(result.step_results[0].success, false);
  assert.equal(result.step_results[0].attempts, 3, 'should attempt 1 + 2 retries = 3');
  assert.equal(callCount, 3, 'should not proceed to step 2');

  console.log('  PASS testRetryExhaustion');
}

// ---------------------------------------------------------------------------
// Test: Pipeline result aggregation
// ---------------------------------------------------------------------------

async function testResultAggregation(): Promise<void> {
  let stepIndex = 0;

  const mockSpawn = async (_contract: WorkerContract): Promise<WorkerResult> => {
    stepIndex++;
    return makeSuccessResult(`output-${stepIndex}`, `/tmp/project/step-${stepIndex}`);
  };

  const playbookDef = makePlaybookDef([
    { step: 1, name: 'alpha', playbook: 'worker/a', worker_type: 'research', output: 'a.md' },
    { step: 2, name: 'beta', playbook: 'worker/b', worker_type: 'build', output: 'b' },
    { step: 3, name: 'gamma', playbook: 'worker/c', worker_type: 'validate', output: 'c' },
  ]);

  const result = await executePipeline(makeWorkItem(), playbookDef, {
    spawnWorkerFn: mockSpawn,
  });

  assert.equal(result.success, true);
  assert.equal(result.step_results.length, 3);
  assert.equal(result.pipeline_name, 'test-pipeline');
  assert.ok(result.duration_ms >= 0, 'duration should be non-negative');
  assert.equal(result.output_path, '/tmp/project/step-3', 'output_path should be from last successful step');

  // Verify each step result has correct names
  assert.equal(result.step_results[0].name, 'alpha');
  assert.equal(result.step_results[1].name, 'beta');
  assert.equal(result.step_results[2].name, 'gamma');

  console.log('  PASS testResultAggregation');
}

// ---------------------------------------------------------------------------
// Test: Ledger events
// ---------------------------------------------------------------------------

async function testLedgerEvents(): Promise<void> {
  const events: PipelineLedgerEvent[] = [];

  const mockSpawn = async (_contract: WorkerContract): Promise<WorkerResult> => {
    return makeSuccessResult('done');
  };

  const playbookDef = makePlaybookDef([
    { step: 1, name: 'only-step', playbook: 'worker/single', worker_type: 'build', output: 'output' },
  ]);

  await executePipeline(makeWorkItem(), playbookDef, {
    spawnWorkerFn: mockSpawn,
    onLedgerEvent: (e) => events.push(e),
  });

  const eventTypes = events.map(e => e.event);
  assert.ok(eventTypes.includes('PIPELINE_STARTED'), 'should emit PIPELINE_STARTED');
  assert.ok(eventTypes.includes('PIPELINE_STEP_STARTED'), 'should emit PIPELINE_STEP_STARTED');
  assert.ok(eventTypes.includes('PIPELINE_STEP_COMPLETED'), 'should emit PIPELINE_STEP_COMPLETED');
  assert.ok(eventTypes.includes('PIPELINE_COMPLETED'), 'should emit PIPELINE_COMPLETED');

  // Verify pipeline name is on all events
  for (const event of events) {
    assert.equal(event.pipeline_name, 'test-pipeline');
    assert.ok(event.timestamp, 'all events should have a timestamp');
  }

  console.log('  PASS testLedgerEvents');
}

// ---------------------------------------------------------------------------
// Test: Ledger events on failure
// ---------------------------------------------------------------------------

async function testLedgerEventsOnFailure(): Promise<void> {
  const events: PipelineLedgerEvent[] = [];

  const mockSpawn = async (_contract: WorkerContract): Promise<WorkerResult> => {
    return makeFailResult('boom');
  };

  const playbookDef = makePlaybookDef([
    { step: 1, name: 'fail-step', playbook: 'worker/fail', worker_type: 'build', retries: 0, output: 'x' },
  ]);

  await executePipeline(makeWorkItem(), playbookDef, {
    spawnWorkerFn: mockSpawn,
    onLedgerEvent: (e) => events.push(e),
  });

  const eventTypes = events.map(e => e.event);
  assert.ok(eventTypes.includes('PIPELINE_STEP_FAILED'), 'should emit PIPELINE_STEP_FAILED');
  assert.ok(eventTypes.includes('PIPELINE_FAILED'), 'should emit PIPELINE_FAILED');

  console.log('  PASS testLedgerEventsOnFailure');
}

// ---------------------------------------------------------------------------
// Test: Empty pipeline steps
// ---------------------------------------------------------------------------

async function testEmptyPipelineSteps(): Promise<void> {
  const mockSpawn = async (_contract: WorkerContract): Promise<WorkerResult> => {
    throw new Error('should not be called');
  };

  const playbookDef = makePlaybookDef([]);

  const result = await executePipeline(makeWorkItem(), playbookDef, {
    spawnWorkerFn: mockSpawn,
  });

  assert.equal(result.success, false, 'empty pipeline should fail');
  assert.equal(result.step_results.length, 0);

  console.log('  PASS testEmptyPipelineSteps');
}

// ---------------------------------------------------------------------------
// Test: Missing spawnWorkerFn throws
// ---------------------------------------------------------------------------

async function testMissingSpawnWorkerFnThrows(): Promise<void> {
  const playbookDef = makePlaybookDef([
    { step: 1, name: 'x', playbook: 'worker/x', worker_type: 'build', output: 'x' },
  ]);

  let threw = false;
  try {
    await executePipeline(makeWorkItem(), playbookDef, {});
  } catch (err) {
    threw = true;
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('spawnWorkerFn'));
  }
  assert.ok(threw, 'should throw when spawnWorkerFn is missing');

  console.log('  PASS testMissingSpawnWorkerFnThrows');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Running v2-pipeline-executor adhoc tests...\n');

  await testParsePipelineSteps();
  await testOutputChaining();
  await testRetryBehavior();
  await testRetryExhaustion();
  await testResultAggregation();
  await testLedgerEvents();
  await testLedgerEventsOnFailure();
  await testEmptyPipelineSteps();
  await testMissingSpawnWorkerFnThrows();

  console.log('\nPASS v2-pipeline-executor adhoc tests');
}

main().catch((error) => {
  console.error('\nFAIL v2-pipeline-executor adhoc tests');
  console.error(error);
  process.exit(1);
});
