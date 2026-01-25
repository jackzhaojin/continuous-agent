/**
 * Adhoc test for Step Parsing from goals.md
 * 
 * Run with: npx tsx tests/adhoc/test-step-parsing.ts
 * 
 * This test uses a sample goals file with steps to validate
 * that the parser correctly extracts step information.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import type { WorkItem, WorkStep } from '../../../src/types.js';

// ANSI colors
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
// Parser functions (copied from work-selector for isolated testing)
// ============================================================

function parseStepStatus(statusText: string): WorkStep['status'] {
  const lower = statusText.toLowerCase().trim();
  if (lower.includes('complete') || lower.includes('done')) {
    return 'complete';
  } else if (lower.includes('block')) {
    return 'blocked';
  } else if (lower.includes('in progress') || lower.includes('wip')) {
    return 'in_progress';
  }
  return 'pending';
}

function parseDependencies(depsText: string): number[] {
  const deps: number[] = [];
  const matches = depsText.match(/\d+/g);
  if (matches) {
    for (const m of matches) {
      deps.push(parseInt(m, 10) - 1);
    }
  }
  return deps;
}

function parseEstimatedTurns(turnsText: string): number | undefined {
  const rangeMatch = turnsText.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
  }
  const singleMatch = turnsText.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }
  return undefined;
}

function parseSteps(lines: string[], startIndex: number): { steps: WorkStep[]; endIndex: number } {
  const steps: WorkStep[] = [];
  let i = startIndex;
  let stepNumber = 0;
  let currentStep: Partial<WorkStep> | null = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Stop if we hit another task (###) or priority section (##)
    if (trimmedLine.match(/^#{1,3}\s+(?!Step\b|step\b)/i) && !trimmedLine.match(/^####/)) {
      break;
    }

    // Check for step headers
    const stepMatch = trimmedLine.match(/^####\s+(?:Step\s+)?(\d+[a-z]?)[:.]?\s*(.+)$/i);
    if (stepMatch) {
      if (currentStep && currentStep.title) {
        steps.push(currentStep as WorkStep);
      }
      stepNumber++;
      currentStep = {
        step_number: stepNumber - 1,
        title: stepMatch[2].trim(),
        description: '',
        status: 'pending',
        dependencies: [],
      };
      i++;
      continue;
    }

    // Parse step metadata
    if (currentStep) {
      const statusMatch = trimmedLine.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
      if (statusMatch) {
        currentStep.status = parseStepStatus(statusMatch[1]);
        i++;
        continue;
      }

      const descMatch = trimmedLine.match(/^[-*]\s*\*\*Description:\*\*\s*(.+)$/i);
      if (descMatch) {
        currentStep.description = descMatch[1].trim();
        i++;
        continue;
      }

      const depsMatch = trimmedLine.match(/^[-*]\s*\*\*Dependencies?:\*\*\s*(.+)$/i);
      if (depsMatch) {
        currentStep.dependencies = parseDependencies(depsMatch[1]);
        i++;
        continue;
      }

      const turnsMatch = trimmedLine.match(/^[-*]\s*\*\*Est\.?\s*(?:Turns|Duration):\*\*\s*(.+)$/i);
      if (turnsMatch) {
        currentStep.estimated_turns = parseEstimatedTurns(turnsMatch[1]);
        i++;
        continue;
      }

      const outputMatch = trimmedLine.match(/^[-*]\s*\*\*Output:\*\*\s*(.+)$/i);
      if (outputMatch) {
        currentStep.output_path = outputMatch[1].trim();
        i++;
        continue;
      }

      const completedMatch = trimmedLine.match(/^[-*]\s*\*\*Completed:\*\*\s*(.+)$/i);
      if (completedMatch) {
        currentStep.completed_at = completedMatch[1].trim();
        i++;
        continue;
      }

      const startedMatch = trimmedLine.match(/^[-*]\s*\*\*Started:\*\*\s*(.+)$/i);
      if (startedMatch) {
        currentStep.started_at = startedMatch[1].trim();
        i++;
        continue;
      }
    }

    i++;
  }

  if (currentStep && currentStep.title) {
    steps.push(currentStep as WorkStep);
  }

  return { steps, endIndex: i };
}

function parseGoalsFile(content: string): WorkItem[] {
  const items: WorkItem[] = [];
  const lines = content.split('\n');

  let currentPriority: 'P1' | 'P2' | 'P3' | null = null;
  let currentItem: Partial<WorkItem> | null = null;
  let itemCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Priority sections
    if (trimmedLine.match(/^#{1,2}\s*P1\b/i)) {
      if (currentItem && currentItem.title && currentPriority) {
        items.push(currentItem as WorkItem);
      }
      currentPriority = 'P1';
      currentItem = null;
      continue;
    }
    if (trimmedLine.match(/^#{1,2}\s*P2\b/i)) {
      if (currentItem && currentItem.title && currentPriority) {
        items.push(currentItem as WorkItem);
      }
      currentPriority = 'P2';
      currentItem = null;
      continue;
    }
    if (trimmedLine.match(/^#{1,2}\s*P3\b/i)) {
      if (currentItem && currentItem.title && currentPriority) {
        items.push(currentItem as WorkItem);
      }
      currentPriority = 'P3';
      currentItem = null;
      continue;
    }

    // Archive section
    if (trimmedLine.match(/^#{1,2}\s*(Archive|Completed|Done)\b/i)) {
      if (currentItem && currentItem.title && currentPriority) {
        items.push(currentItem as WorkItem);
      }
      currentPriority = null;
      currentItem = null;
      continue;
    }

    if (!currentPriority) continue;

    // Task headers
    const goalMatch = trimmedLine.match(/^###\s+(.+)$/);
    if (goalMatch) {
      if (currentItem && currentItem.title) {
        items.push(currentItem as WorkItem);
      }

      itemCounter++;
      currentItem = {
        id: `work-${itemCounter}`,
        priority: currentPriority,
        title: goalMatch[1].trim(),
        description: '',
        status: 'pending'
      };

      // Parse steps
      const { steps, endIndex } = parseSteps(lines, i + 1);
      if (steps.length > 0) {
        currentItem.steps = steps;
        const completedSteps = steps.filter(s => s.status === 'complete').length;
        const firstIncomplete = steps.findIndex(s => s.status !== 'complete' && s.status !== 'blocked');
        currentItem.current_step = firstIncomplete >= 0 ? firstIncomplete : undefined;
        currentItem.progress_pct = Math.round((completedSteps / steps.length) * 100);
        i = endIndex - 1;
      }
      continue;
    }

    // Task metadata
    if (currentItem) {
      const statusMatch = trimmedLine.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
      if (statusMatch) {
        const statusText = statusMatch[1].toLowerCase().trim();
        if (statusText.includes('complete') || statusText.includes('done')) {
          currentItem.status = 'complete';
        } else if (statusText.includes('block')) {
          currentItem.status = 'blocked';
        } else if (statusText.includes('not started') || statusText === 'pending') {
          currentItem.status = 'pending';
        } else if (statusText.includes('in progress') || statusText.includes('wip')) {
          currentItem.status = 'in_progress';
        } else {
          currentItem.status = 'pending';
        }
        continue;
      }

      const descMatch = trimmedLine.match(/^[-*]\s*\*\*Description:\*\*\s*(.+)$/i);
      if (descMatch) {
        currentItem.description = descMatch[1].trim();
        continue;
      }
    }
  }

  if (currentItem && currentItem.title && currentPriority) {
    items.push(currentItem as WorkItem);
  }

  return items;
}

// ============================================================
// Tests
// ============================================================

async function runTests() {
  console.log(`\n${CYAN}╔═══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}║       Step Parsing Validation - Test Goals File           ║${RESET}`);
  console.log(`${CYAN}╚═══════════════════════════════════════════════════════════╝${RESET}`);
  
  section('Loading Test Goals File');
  
  const testFilePath = path.join(process.cwd(), 'tests/adhoc/2026-01-25-incremental-execution/test-goals-with-steps.md');
  const content = await readFile(testFilePath, 'utf-8');
  info(`Loaded ${content.length} bytes from test file`);
  
  section('Parsing Goals with Steps');
  
  const items = parseGoalsFile(content);
  
  if (items.length === 0) {
    fail('No items parsed from test file');
    return;
  }
  
  pass(`Parsed ${items.length} work items`);
  
  // Find the multi-step task
  const multiStepTask = items.find(i => i.steps && i.steps.length > 0);
  
  if (!multiStepTask) {
    fail('No multi-step task found');
    return;
  }
  
  pass(`Found multi-step task: "${multiStepTask.title}"`);
  info(`  Priority: ${multiStepTask.priority}`);
  info(`  Status: ${multiStepTask.status}`);
  info(`  Steps: ${multiStepTask.steps!.length}`);
  info(`  Current step: ${multiStepTask.current_step !== undefined ? multiStepTask.current_step + 1 : 'N/A'}`);
  info(`  Progress: ${multiStepTask.progress_pct}%`);
  
  section('Validating Step Details');
  
  const steps = multiStepTask.steps!;
  const expectedSteps = [
    { title: 'Research and Planning', status: 'complete', deps: [], turns: undefined },
    { title: 'Core Implementation', status: 'in_progress', deps: [0], turns: 120 },
    { title: 'Testing', status: 'pending', deps: [1], turns: 80 },
    { title: 'Documentation', status: 'pending', deps: [0, 1, 2], turns: 60 },
  ];
  
  let allPassed = true;
  
  for (let i = 0; i < expectedSteps.length; i++) {
    const step = steps[i];
    const expected = expectedSteps[i];
    
    info(`\n  Step ${i + 1}: ${step.title}`);
    
    // Check title
    if (step.title.includes(expected.title.split(' ')[0])) {
      pass(`    Title matches`);
    } else {
      fail(`    Title mismatch: got "${step.title}", expected to contain "${expected.title}"`);
      allPassed = false;
    }
    
    // Check status
    if (step.status === expected.status) {
      pass(`    Status: ${step.status}`);
    } else {
      fail(`    Status mismatch: got "${step.status}", expected "${expected.status}"`);
      allPassed = false;
    }
    
    // Check dependencies
    const depsMatch = JSON.stringify(step.dependencies || []) === JSON.stringify(expected.deps);
    if (depsMatch) {
      pass(`    Dependencies: [${(step.dependencies || []).map(d => d + 1).join(', ') || 'none'}]`);
    } else {
      fail(`    Dependencies mismatch: got [${(step.dependencies || []).join(', ')}], expected [${expected.deps.join(', ')}]`);
      allPassed = false;
    }
    
    // Check estimated turns
    if (expected.turns !== undefined) {
      if (step.estimated_turns === expected.turns) {
        pass(`    Estimated turns: ${step.estimated_turns}`);
      } else {
        fail(`    Turns mismatch: got ${step.estimated_turns}, expected ${expected.turns}`);
        allPassed = false;
      }
    }
    
    // Check other metadata
    if (step.status === 'complete' && step.completed_at) {
      pass(`    Completed at: ${step.completed_at}`);
    }
    if (step.status === 'in_progress' && step.started_at) {
      pass(`    Started at: ${step.started_at}`);
    }
    if (step.output_path) {
      pass(`    Output path: ${step.output_path}`);
    }
  }
  
  section('Validating Single-Step Task');
  
  const singleStepTask = items.find(i => !i.steps || i.steps.length === 0);
  if (singleStepTask) {
    pass(`Found single-step task: "${singleStepTask.title}"`);
    info(`  Priority: ${singleStepTask.priority}`);
    info(`  Status: ${singleStepTask.status}`);
    info(`  Has no steps: ${!singleStepTask.steps || singleStepTask.steps.length === 0}`);
  } else {
    fail('No single-step task found');
    allPassed = false;
  }
  
  section('Summary');
  
  if (allPassed) {
    console.log(`${GREEN}All step parsing tests passed!${RESET}\n`);
  } else {
    console.log(`${YELLOW}Some tests failed - see above for details${RESET}\n`);
  }
}

runTests().catch(console.error);
