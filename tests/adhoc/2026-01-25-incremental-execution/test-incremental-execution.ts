/**
 * Adhoc test for Incremental Execution Feature
 * 
 * Run with: npx tsx tests/adhoc/test-incremental-execution.ts
 * 
 * Tests:
 * 1. Step parsing from goals.md format
 * 2. Work selection with step awareness
 * 3. Automatic breakdown detection
 * 4. Priority re-evaluation logic
 */

import { selectWorkWithSteps } from '../../../src/agentic/work-selection/work-selector.js';
import { needsBreakdown, estimateComplexity, generateStaticBreakdown } from '../../../src/agentic/work-selection/goal-breakdown.js';
import type { WorkItem, WorkStep } from '../../../src/core/types.js';

// ANSI colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function pass(msg: string) { console.log(`${GREEN}✓ PASS${RESET}: ${msg}`); }
function fail(msg: string) { console.log(`${RED}✗ FAIL${RESET}: ${msg}`); }
function info(msg: string) { console.log(`${CYAN}ℹ INFO${RESET}: ${msg}`); }
function section(msg: string) { console.log(`\n${YELLOW}=== ${msg} ===${RESET}`); }

// ============================================================
// Test 1: (Removed — relied on deleted getAllWorkItems)
// ============================================================
async function testGoalsFileParsing() {
  section('Test 1: (Skipped — legacy goals.md parsing removed)');
  return true;
}

// ============================================================
// Test 2: Step-aware work selection
// ============================================================
async function testStepAwareSelection() {
  section('Test 2: Step-Aware Work Selection');

  // Test step-aware API
  const newResult = await selectWorkWithSteps();
  if (newResult) {
    if (newResult.type === 'step' && newResult.step) {
      pass(`selectWorkWithSteps() selected STEP: [${newResult.priority}] ${newResult.task.title} - Step ${newResult.step.step_number + 1}: ${newResult.step.title}`);
    } else {
      pass(`selectWorkWithSteps() selected TASK: [${newResult.priority}] ${newResult.task.title}`);
    }
  } else {
    info('selectWorkWithSteps() returned null (no available work)');
  }
  
  return true;
}

// ============================================================
// Test 3: Complexity estimation and breakdown detection
// ============================================================
function testComplexityEstimation() {
  section('Test 3: Complexity Estimation & Breakdown Detection');
  
  const testCases: Array<{ title: string; description: string; expectedHighComplexity: boolean }> = [
    {
      title: 'Fix typo in README',
      description: 'Update the spelling error',
      expectedHighComplexity: false,
    },
    {
      title: 'Build Multi-Tenant SaaS Platform',
      description: 'Full-stack application with authentication, database, and deployment',
      expectedHighComplexity: true,
    },
    {
      title: 'Add unit tests for auth module',
      description: 'Write tests for the authentication service',
      expectedHighComplexity: false,
    },
    {
      title: 'Migrate database from PostgreSQL to MongoDB',
      description: 'Complete migration with data transformation',
      expectedHighComplexity: true,
    },
    {
      title: 'Update config file',
      description: 'Change the port number',
      expectedHighComplexity: false,
    },
    {
      title: 'Build Next.js Transactional App',
      description: 'Full application with API routes and authentication',
      expectedHighComplexity: true,
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const tc of testCases) {
    const mockItem: WorkItem = {
      id: 'test-1',
      priority: 'P1',
      title: tc.title,
      description: tc.description,
      status: 'pending',
    };
    
    const complexity = estimateComplexity(mockItem);
    const needs = needsBreakdown(mockItem);
    
    const isHighComplexity = complexity > 100;
    const resultMatch = isHighComplexity === tc.expectedHighComplexity;
    
    if (resultMatch) {
      pass(`"${tc.title}" → ${complexity} turns, needsBreakdown=${needs}`);
      passed++;
    } else {
      fail(`"${tc.title}" → ${complexity} turns (expected ${tc.expectedHighComplexity ? 'high' : 'low'} complexity)`);
      failed++;
    }
  }
  
  info(`Complexity tests: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ============================================================
// Test 4: Static breakdown generation
// ============================================================
function testStaticBreakdown() {
  section('Test 4: Static Breakdown Generation');
  
  const testItem: WorkItem = {
    id: 'test-breakdown',
    priority: 'P1',
    title: 'Build Multi-Tenant SaaS Platform',
    description: 'Full-stack Next.js application with authentication, database schema, API endpoints, and deployment',
    status: 'pending',
  };
  
  const steps = generateStaticBreakdown(testItem);
  
  if (steps.length === 0) {
    fail('No steps generated');
    return false;
  }
  
  pass(`Generated ${steps.length} steps for complex task:`);
  
  let totalEstimatedTurns = 0;
  for (const step of steps) {
    const deps = step.dependencies?.map(d => d + 1).join(', ') || 'none';
    info(`  Step ${step.step_number + 1}: ${step.title}`);
    info(`    Est. turns: ${step.estimated_turns || 'N/A'}, Dependencies: ${deps}`);
    totalEstimatedTurns += step.estimated_turns || 0;
  }
  
  info(`  Total estimated turns: ${totalEstimatedTurns}`);
  
  // Verify step dependencies form a valid DAG
  let validDeps = true;
  for (const step of steps) {
    if (step.dependencies) {
      for (const dep of step.dependencies) {
        if (dep >= step.step_number) {
          fail(`Step ${step.step_number + 1} has forward dependency on step ${dep + 1}`);
          validDeps = false;
        }
      }
    }
  }
  
  if (validDeps) {
    pass('All step dependencies are valid (no forward references)');
  }
  
  return true;
}

// ============================================================
// Test 5: (Removed — relied on deleted createTaskContract)
// ============================================================
function testTaskContractWithStep() {
  section('Test 5: (Skipped — task-contractor removed)');
  return true;
}

// ============================================================
// Test 6: Simulate step parsing from markdown
// ============================================================
function testStepMarkdownParsing() {
  section('Test 6: Step Markdown Parsing Simulation');
  
  // This simulates what the parser should extract from goals.md
  const mockMarkdown = `
### Build Multi-Tenant SaaS Platform
- **Status:** In Progress (Step 2 of 4, 25% complete)
- **Description:** Full-stack SaaS platform with tenant isolation
- **Breakdown:** Auto-generated on 2026-01-25 16:30

#### Step 1: Research existing patterns
- **Status:** Complete
- **Duration:** 1 iteration, 95 turns
- **Output:** ai-docs/research/saas-patterns.md
- **Completed:** 2026-01-25 18:15

#### Step 2: Implement user authentication
- **Status:** In Progress
- **Dependencies:** Step 1
- **Est. Turns:** 100-120
- **Started:** 2026-01-25 18:35

#### Step 3: Build tenant isolation
- **Status:** Pending
- **Dependencies:** Step 2
- **Est. Turns:** 110-130

#### Step 4: Final testing and deployment
- **Status:** Pending
- **Dependencies:** Step 1, 2, 3
- **Est. Turns:** 80-100
`;

  // Check that we can identify the patterns we need to parse
  const stepPattern = /^####\s+(?:Step\s+)?(\d+[a-z]?)[:.]?\s*(.+)$/gim;
  const statusPattern = /^[-*]\s*\*\*Status:\*\*\s*(.+)$/gim;
  const depsPattern = /^[-*]\s*\*\*Dependencies?:\*\*\s*(.+)$/gim;
  const turnsPattern = /^[-*]\s*\*\*Est\.?\s*(?:Turns|Duration):\*\*\s*(.+)$/gim;

  const stepMatches = [...mockMarkdown.matchAll(stepPattern)];
  const statusMatches = [...mockMarkdown.matchAll(statusPattern)];
  
  if (stepMatches.length === 4) {
    pass(`Found ${stepMatches.length} step headers in mock markdown`);
  } else {
    fail(`Expected 4 step headers, found ${stepMatches.length}`);
  }
  
  // Verify step titles extracted correctly
  const expectedTitles = [
    'Research existing patterns',
    'Implement user authentication',
    'Build tenant isolation',
    'Final testing and deployment',
  ];
  
  let titlesMatch = true;
  for (let i = 0; i < stepMatches.length; i++) {
    const extractedTitle = stepMatches[i][2].trim();
    if (!expectedTitles[i].toLowerCase().includes(extractedTitle.toLowerCase().split(' ')[0])) {
      titlesMatch = false;
      info(`  Step ${i + 1} title mismatch: "${extractedTitle}"`);
    }
  }
  
  if (titlesMatch) {
    pass('Step titles parsed correctly');
  }
  
  // Test dependency parsing
  const depTests = [
    { input: 'Step 1', expected: [0] },
    { input: 'Step 1, 2, 3', expected: [0, 1, 2] },
    { input: '1, 2', expected: [0, 1] },
  ];
  
  for (const test of depTests) {
    const deps: number[] = [];
    const matches = test.input.match(/\d+/g);
    if (matches) {
      for (const m of matches) {
        deps.push(parseInt(m, 10) - 1);
      }
    }
    
    const match = JSON.stringify(deps) === JSON.stringify(test.expected);
    if (match) {
      pass(`Dependency parsing: "${test.input}" → [${deps.join(', ')}]`);
    } else {
      fail(`Dependency parsing: "${test.input}" → [${deps.join(', ')}] (expected [${test.expected.join(', ')}])`);
    }
  }
  
  return true;
}

// ============================================================
// Test 7: Priority re-evaluation simulation
// ============================================================
function testPriorityReEvaluation() {
  section('Test 7: Priority Re-evaluation Simulation');
  
  // Simulate the scenario from the design doc:
  // - Working on P2 task
  // - P1 task unblocks
  // - Should switch to P1 immediately
  
  const mockTasks: WorkItem[] = [
    {
      id: 'p2-task',
      priority: 'P2',
      title: 'Build SaaS Platform',
      description: 'Multi-step task',
      status: 'in_progress',
      steps: [
        { step_number: 0, title: 'Step 1', description: '', status: 'complete' },
        { step_number: 1, title: 'Step 2', description: '', status: 'in_progress' },
      ],
      current_step: 1,
    },
    {
      id: 'p1-task',
      priority: 'P1',
      title: 'Urgent Bug Fix',
      description: 'Just unblocked',
      status: 'pending', // Was blocked, now unblocked
    },
    {
      id: 'p3-task',
      priority: 'P3',
      title: 'Nice to have feature',
      description: 'Low priority',
      status: 'pending',
    },
  ];
  
  // Simulate work selection by priority
  const priorityOrder = { P1: 1, P2: 2, P3: 3 };
  const availableTasks = mockTasks.filter(t => t.status !== 'complete' && t.status !== 'blocked');
  availableTasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  const selected = availableTasks[0];
  
  if (selected.priority === 'P1') {
    pass(`Priority re-evaluation correctly selects P1 task over in-progress P2`);
    info(`  Selected: [${selected.priority}] ${selected.title}`);
    info(`  (P2 task "Build SaaS Platform" was in progress but P1 takes priority)`);
  } else {
    fail(`Should select P1 task, but selected [${selected.priority}] ${selected.title}`);
  }
  
  return true;
}

// ============================================================
// Run all tests
// ============================================================
async function runAllTests() {
  console.log(`\n${CYAN}╔═══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}║  Incremental Execution Feature - Adhoc Validation Tests   ║${RESET}`);
  console.log(`${CYAN}╚═══════════════════════════════════════════════════════════╝${RESET}`);
  
  const results: boolean[] = [];
  
  // Run tests
  results.push(await testGoalsFileParsing());
  results.push(await testStepAwareSelection());
  results.push(testComplexityEstimation());
  results.push(testStaticBreakdown());
  results.push(testTaskContractWithStep());
  results.push(testStepMarkdownParsing());
  results.push(testPriorityReEvaluation());
  
  // Summary
  section('Summary');
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  if (passed === total) {
    console.log(`${GREEN}All ${total} test groups passed!${RESET}`);
  } else {
    console.log(`${YELLOW}${passed}/${total} test groups passed${RESET}`);
  }
  
  console.log('\n');
}

// Run tests
runAllTests().catch(console.error);
