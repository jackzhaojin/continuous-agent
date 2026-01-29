#!/usr/bin/env npx tsx
/**
 * Migration Script: Convert existing ## Steps in PROMPT.md → TASKS.json
 *
 * Scans all goal bundles for PROMPT.md files with a ## Steps section
 * but no TASKS.json, and generates a TASKS.json from the parsed steps.
 *
 * Also creates an initial PROGRESS_LOG.md with a migration entry.
 *
 * IDEMPOTENT: Safe to re-run. Skips bundles that already have TASKS.json.
 * Does NOT remove ## Steps from PROMPT.md (kept during transition).
 *
 * Usage:
 *   npx tsx scripts/migrate-steps-to-tasks-json.ts [--dry-run]
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');
const DRY_RUN = process.argv.includes('--dry-run');

interface ParsedStep {
  number: number;
  title: string;
  description: string;
  status: string;
  estimated_turns?: number;
}

function parseStepsFromBody(body: string): ParsedStep[] {
  const steps: ParsedStep[] = [];
  const lines = body.split('\n');
  let inStepsSection = false;
  let currentStep: ParsedStep | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.match(/^##\s+Steps$/i)) {
      inStepsSection = true;
      continue;
    }

    if (inStepsSection && trimmed.match(/^##\s+[^#]/)) {
      inStepsSection = false;
      if (currentStep) steps.push(currentStep);
      break;
    }

    if (!inStepsSection) continue;

    const stepMatch = trimmed.match(/^#{3,4}\s+(?:Step\s+)?(\d+)[:.]\s*(.+)$/i);
    if (stepMatch) {
      if (currentStep) steps.push(currentStep);
      currentStep = {
        number: parseInt(stepMatch[1], 10),
        title: stepMatch[2].trim(),
        description: '',
        status: 'pending',
      };
      continue;
    }

    if (currentStep) {
      const statusMatch = trimmed.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/i);
      if (statusMatch) {
        const statusText = statusMatch[1].toLowerCase().trim();
        if (statusText.includes('complete') || statusText.includes('done')) {
          currentStep.status = 'complete';
        } else if (statusText.includes('block')) {
          currentStep.status = 'blocked';
        } else if (statusText.includes('in progress') || statusText.includes('in_progress')) {
          currentStep.status = 'in_progress';
        } else {
          currentStep.status = 'pending';
        }
        continue;
      }

      const descMatch = trimmed.match(/^[-*]\s*\*\*Description:\*\*\s*(.+)$/i);
      if (descMatch) {
        currentStep.description = descMatch[1].trim();
        continue;
      }

      const turnsMatch = trimmed.match(/^[-*]\s*\*\*Est\.\s*Turns:\*\*\s*(\d+)/i);
      if (turnsMatch) {
        currentStep.estimated_turns = parseInt(turnsMatch[1], 10);
        continue;
      }
    }
  }

  if (currentStep) steps.push(currentStep);
  return steps;
}

async function listGoalDirs(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) return [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => path.join(dirPath, e.name));
  } catch {
    return [];
  }
}

async function migrate(): Promise<void> {
  console.log(`Migration: ## Steps → TASKS.json${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  const allBundleDirs: string[] = [];

  // Collect all bundle directories
  for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4']) {
    const dirs = await listGoalDirs(path.join(WORKSPACE_DIR, 'in-progress', priority));
    allBundleDirs.push(...dirs);
  }
  allBundleDirs.push(...await listGoalDirs(path.join(WORKSPACE_DIR, 'blocked')));
  allBundleDirs.push(...await listGoalDirs(path.join(WORKSPACE_DIR, 'ondeck')));
  allBundleDirs.push(...await listGoalDirs(path.join(WORKSPACE_DIR, 'drafts')));

  let migrated = 0;
  let skipped = 0;
  let noSteps = 0;

  for (const bundleDir of allBundleDirs) {
    const slug = path.basename(bundleDir);
    const promptPath = path.join(bundleDir, 'PROMPT.md');
    const tasksJsonPath = path.join(bundleDir, 'TASKS.json');
    const progressLogPath = path.join(bundleDir, 'PROGRESS_LOG.md');

    if (!existsSync(promptPath)) continue;

    // Skip if TASKS.json already exists (idempotent)
    if (existsSync(tasksJsonPath)) {
      console.log(`  SKIP  ${slug} (TASKS.json already exists)`);
      skipped++;
      continue;
    }

    const content = await readFile(promptPath, 'utf-8');

    // Check if ## Steps section exists
    if (!/^##\s+Steps$/im.test(content)) {
      console.log(`  SKIP  ${slug} (no ## Steps section)`);
      noSteps++;
      continue;
    }

    const parsedSteps = parseStepsFromBody(content);
    if (parsedSteps.length === 0) {
      console.log(`  SKIP  ${slug} (## Steps section found but no steps parsed)`);
      noSteps++;
      continue;
    }

    // Build TASKS.json
    const now = new Date().toISOString();
    const tasksFile = {
      version: 1,
      created_at: now,
      trigger: 'auto' as const,
      revision: 1,
      steps: parsedSteps.map((ps, _idx) => ({
        id: `step-${ps.number - 1}`,
        order: ps.number - 1,
        title: ps.title,
        description: ps.description || '',
        status: ps.status as 'pending' | 'in_progress' | 'complete' | 'blocked',
        dependencies: ps.number > 1 ? [`step-${ps.number - 2}`] : [] as string[],
        estimated_turns: ps.estimated_turns || 100,
        ...(ps.status === 'complete' ? { completed_at: now } : {}),
        ...(ps.status === 'in_progress' ? { started_at: now } : {}),
      })),
    };

    if (DRY_RUN) {
      console.log(`  WOULD MIGRATE  ${slug} (${parsedSteps.length} steps)`);
      for (const s of parsedSteps) {
        console.log(`    Step ${s.number}: ${s.title} [${s.status}]`);
      }
    } else {
      // Write TASKS.json
      await writeFile(tasksJsonPath, JSON.stringify(tasksFile, null, 2) + '\n', 'utf-8');

      // Create PROGRESS_LOG.md if it doesn't exist
      if (!existsSync(progressLogPath)) {
        const completedCount = parsedSteps.filter(s => s.status === 'complete').length;
        const logContent = `# Progress Log

## ${now} | Migration
Migrated ${parsedSteps.length} steps from PROMPT.md ## Steps section to TASKS.json.
${completedCount} steps already completed at time of migration.

`;
        await writeFile(progressLogPath, logContent, 'utf-8');
      }

      console.log(`  MIGRATED  ${slug} (${parsedSteps.length} steps)`);
    }

    migrated++;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Summary: ${migrated} migrated, ${skipped} skipped (already done), ${noSteps} no steps`);
  if (DRY_RUN) {
    console.log('(DRY RUN - no files were written)');
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
