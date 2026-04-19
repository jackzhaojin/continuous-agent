/**
 * I0 — Prompt packet must inject API surface, last gate count, and project markers.
 *
 * v2.1.6 retro: every worker ran with no situational context about what
 * existed on disk, so they reinvented API contracts and built UI against
 * hardcoded mock data. v2.4 adds a "Current System State" section built
 * directly from disk so every step sees the same deterministic snapshot.
 *
 * Run: npx tsx tests/adhoc/i0-prompt-builder-enrichment.adhoc.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { buildCurrentSystemStateSection } from '../../src/agentic/intelligence/prompt-builder.js';
import { createStepsFile, writeStepsJson } from '../../src/deterministic/steps-json-handler.js';
import type { WorkItem, WorkStep } from '../../src/core/types.js';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg);
    failures++;
  } else {
    console.log('  ✓', msg);
  }
}

async function main() {
  console.log('[I0] Prompt packet enrichment tests\n');

  const root = mkdtempSync(path.join(tmpdir(), 'i0-prompt-'));
  try {
    // Build a fake Next.js project under `project/`
    const projectPath = path.join(root, 'project');
    mkdirSync(path.join(projectPath, 'app', 'api', 'health'), { recursive: true });
    mkdirSync(path.join(projectPath, 'app', 'api', 'quote'), { recursive: true });
    writeFileSync(
      path.join(projectPath, 'app', 'api', 'health', 'route.ts'),
      'export async function GET() { return Response.json({ ok: true }); }\n',
    );
    writeFileSync(
      path.join(projectPath, 'app', 'api', 'quote', 'route.ts'),
      [
        'export async function GET() { /* ... */ }',
        'export async function POST() { /* ... */ }',
      ].join('\n'),
    );
    writeFileSync(path.join(projectPath, 'package.json'), '{}');
    writeFileSync(path.join(projectPath, 'next.config.js'), 'module.exports = {};');

    // Build a goal bundle with one completed gate step
    const bundlePath = path.join(root, 'bundle');
    mkdirSync(bundlePath);
    const steps: WorkStep[] = [
      {
        id: 'step-5', order: 5, step_number: 5,
        title: '[GATE] Journey checkpoint 1',
        description: '',
        status: 'complete',
        dependencies: [],
        kind: 'integration_gate',
        handoff: {
          journey_blocks_added: 3,
          what_i_built: 'Blocks 1-3',
          what_connects: 'tests',
          what_i_verified: 'ran',
          known_gaps: '',
          next_step_should_know: '',
        },
      },
    ];
    await writeStepsJson(bundlePath, createStepsFile(steps));

    const item: WorkItem = {
      id: 'my-goal',
      title: 'Build the checkout flow',
      priority: 'P2',
      status: 'in_progress',
      description: '',
      source_path: bundlePath,
      output_path: projectPath,
      definition_of_done_journey: 'x',
    };

    console.log('[1] API surface is detected');
    const section = await buildCurrentSystemStateSection(projectPath, item);
    assert(section !== null, 'section produced');
    assert(section!.includes('Current System State'), 'title present');
    assert(section!.includes('GET /api/health'), 'GET /api/health detected');
    assert(section!.includes('GET /api/quote'), 'GET /api/quote detected');
    assert(section!.includes('POST /api/quote'), 'POST /api/quote detected');

    console.log('\n[2] Last gate count present');
    assert(section!.includes('3 block(s)'), 'last gate count 3 present');
    assert(section!.includes('regression defect'), 'regression warning present');

    console.log('\n[3] Project markers detected');
    assert(section!.includes('`package.json` present'), 'package.json marker');
    assert(section!.includes('Next.js project'), 'Next.js marker');

    console.log('\n[4] No project path → no section');
    const emptyItem = { ...item, source_path: undefined };
    const empty = await buildCurrentSystemStateSection('/nonexistent/path', emptyItem);
    // No endpoints + no markers + no source_path → no useful content
    assert(empty === null || !empty.includes('GET '), 'no API list when project absent');

    console.log('\n[5] Project without API routes shows fallback message');
    const bareProject = path.join(root, 'bare');
    mkdirSync(bareProject);
    writeFileSync(path.join(bareProject, 'package.json'), '{}');
    const bareItem = { ...item, source_path: undefined, output_path: bareProject };
    const bareSection = await buildCurrentSystemStateSection(bareProject, bareItem);
    assert(bareSection !== null, 'section still produced for bare project');
    assert(bareSection!.includes('No API routes detected'), 'fallback API message present');
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log('');
  if (failures > 0) {
    console.error(`[I0] ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log('[I0] all assertions passed');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
