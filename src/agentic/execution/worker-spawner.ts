/**
 * Worker Spawner - Core Agent SDK integration
 *
 * Spawns worker agents using the Claude Agent SDK to execute
 * task contracts. This is the bridge between the executive loop
 * and actual AI-powered task execution.
 */

import { mkdirSync, existsSync, copyFileSync, cpSync, createWriteStream, readFileSync, writeFileSync } from 'fs';
import { execSync, execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import type { WorkerContract, WorkerResult, WorkItem, ExecutionPattern } from '../../core/types.js';
import { buildIntelligentPrompt } from '../intelligence/prompt-builder.js';
import { selectStrategy } from '../intelligence/strategy-selector.js';
import { findProjectBySlug } from '../../deterministic/project-registry.js';
import { getAvailableAppCredentialNames, checkWorkerEnvForLeaks } from '../../deterministic/credential-tiers.js';
import { resolveBuildTarget, getLegacyMonorepoWorktreePath } from '../../deterministic/build-target-resolver.js';
import type { BuildTarget } from '../../core/types.js';
import {
  getAgentWorkerProviderForVendor,
  resolveWorkerModelForVendor,
  type AgentWorkerMessage,
} from '../../core/vendor/index.js';
import yaml from 'js-yaml';
import { BUILD_INFO } from '../../core/executive-loop.js';

// Agent outputs directory — anchor for monorepo-mode project paths and the
// centralized `.env` / `.claude/` / `CLAUDE.md` setup. Post-rebaseline this
// points at the `monorepo/legacy-v2.2` worktree so monorepo-mode goals land
// inside legacy. Worktree-mode workers (v2.3 default) get a parallel setup
// inside their own worktree via `setupWorktreeProject()` and cwd directly
// into the worktree — they do NOT use AGENT_OUTPUTS_BASE as their cwd.
const AGENT_OUTPUTS_BASE = process.env.AGENT_OUTPUTS_PATH || getLegacyMonorepoWorktreePath();

// Worker timeout: wall-clock limit to prevent indefinite hangs (default 45 min)
const WORKER_TIMEOUT_MS = parseInt(process.env.WORKER_TIMEOUT_MS || '2700000', 10);

// Template directory for project setup files (lives in agent repo, not outputs)
const AGENT_BASE = process.env.AGENT_PATH || path.join(os.homedir(), 'dev', 'continuous-agent');
const TEMPLATES_DIR = path.join(AGENT_BASE, 'templates');
const LEDGERS_DIR = path.join(AGENT_BASE, 'ledgers');

// Worker-facing Claude files (skills + agents) — copied to ai-sandbox root (not per-project)
const CLAUDE_FILES_DIR = path.join(AGENT_BASE, 'claude-files-to-output');

/**
 * Create a logger for a specific worker contract
 * Logs are organized by date: ledgers/{yyyy-mm-dd}/worker-{contract-id}.log
 */
function createWorkerLogger(contractId: string): { log: (msg: string) => void; close: () => void } {
  // Create date-based subdirectory
  const today = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
  const dateDir = path.join(LEDGERS_DIR, today);

  if (!existsSync(dateDir)) {
    mkdirSync(dateDir, { recursive: true });
  }

  const logFile = path.join(dateDir, `worker-${contractId}.log`);
  const stream = createWriteStream(logFile, { flags: 'a' });

  return {
    log: (msg: string) => {
      const line = `[${new Date().toISOString()}] ${msg}`;
      console.log(`[Worker ${contractId}] ${msg}`);
      stream.write(line + '\n');
    },
    close: () => stream.end(),
  };
}

/**
 * Detect project category from task goal
 */
function detectCategory(goal: string): string {
  const goalLower = goal.toLowerCase();
  if (goalLower.includes('next.js') || goalLower.includes('nextjs')) {
    return 'nextjs';
  } else if (goalLower.includes('react')) {
    return 'react';
  } else if (goalLower.includes('node')) {
    return 'node';
  } else if (goalLower.includes('python')) {
    return 'python';
  }
  return 'misc';
}

/**
 * Generate a project directory path based on task metadata
 * Structure: projects/{category}/{date}/{slug}
 */
function generateProjectPath(contract: WorkerContract): { path: string; category: string } {
  const today = new Date().toISOString().split('T')[0]; // 2025-01-25
  const category = detectCategory(contract.prompt);
  const slug = contract.id.replace('contract-', '');

  return {
    path: path.join(AGENT_OUTPUTS_BASE, 'projects', category, today, slug),
    category,
  };
}

/**
 * Set up project directory with appropriate .gitignore
 * This MUST happen before the worker starts to prevent committing junk
 */
function setupProjectDirectory(projectPath: string, category: string): void {
  // Create directory if needed
  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
    console.log(`[Worker] Created project directory: ${projectPath}`);
  }

  // Copy universal .gitignore template (covers all technologies)
  // This ensures Python, Node, etc. are all covered regardless of category
  const gitignoreDest = path.join(projectPath, '.gitignore');
  if (!existsSync(gitignoreDest)) {
    const universalFile = path.join(TEMPLATES_DIR, 'gitignore-universal');
    const fallbackFile = path.join(TEMPLATES_DIR, 'gitignore-misc');

    const sourceFile = existsSync(universalFile) ? universalFile : fallbackFile;

    if (existsSync(sourceFile)) {
      copyFileSync(sourceFile, gitignoreDest);
      console.log(`[Worker] Created .gitignore from universal template`);
    } else {
      console.log(`[Worker] Warning: No .gitignore template found for ${category}`);
    }
  }

  // Copy .env into project directory so worker scripts can access API keys
  const envSource = path.join(AGENT_BASE, '.env');
  const envDest = path.join(projectPath, '.env');
  if (existsSync(envSource) && !existsSync(envDest)) {
    copyFileSync(envSource, envDest);
    console.log(`[Worker] Copied .env to project directory`);
  }

  // CRITICAL: Ensure git is clean before starting new work
  // This prevents verifier failures due to uncommitted changes from previous work
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: projectPath,
      encoding: 'utf-8'
    }).trim();

    const gitStatus = execSync('git status --porcelain', {
      cwd: gitRoot,
      encoding: 'utf-8'
    }).trim();

    if (gitStatus) {
      console.log(`[Worker] Auto-committing existing work in ${gitRoot} before starting new task...`);
      execSync('git add -A', { cwd: gitRoot, stdio: 'inherit' });
      execSync(`git commit -m "Auto-commit: Clean workspace before new task\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"`, {
        cwd: gitRoot,
        stdio: 'inherit'
      });
      console.log(`[Worker] Git workspace is now clean`);
    }
  } catch (error) {
    console.log(`[Worker] Warning: Could not auto-commit git changes: ${error}`);
  }
}

/**
 * Copy source project files into the new project directory (V1.2)
 * Uses rsync to efficiently copy, excluding .git, node_modules, .env
 */
function copySourceProject(sourcePath: string, targetPath: string): boolean {
  try {
    if (!existsSync(sourcePath)) {
      console.log(`[Worker] Source project not found: ${sourcePath}`);
      return false;
    }

    // Ensure target exists
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }

    // Use rsync to copy files, excluding build artifacts and secrets
    execSync(
      `rsync -a --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='.claude' --exclude='dist' --exclude='.next' --exclude='__pycache__' "${sourcePath}/" "${targetPath}/"`,
      { stdio: 'pipe' }
    );

    console.log(`[Worker] Copied source project from ${sourcePath} to ${targetPath}`);
    return true;
  } catch (error) {
    console.log(`[Worker] Warning: Failed to copy source project: ${error}`);
    return false;
  }
}

/**
 * Set up ai-sandbox root with centralized CLAUDE.md, .claude/, and .env (worker env).
 *
 * Instead of copying skills/agents/env into every project directory (which clutters
 * each project), we place them once at the ai-sandbox root. The Agent SDK's cwd
 * is set to ai-sandbox/, so it reads CLAUDE.md and discovers .claude/skills/ from there.
 *
 * This is called before each worker spawn to ensure files are fresh.
 * Skipped for self-enhance/skill-build workers (they use the agent repo directly).
 */
function setupAgentOutputsRoot(): void {
  // Best-effort cleanup of stale local dev servers from previous worker sessions.
  // Prevents port collisions (3000, 3001, ...) across step retries.
  // Scoped to processes rooted under AGENT_OUTPUTS_BASE so we don't nuke the
  // user's unrelated local dev servers.
  try {
    const psOutput = execSync('ps -eo pid,command', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const devServerPattern = /(next-server|next dev|vite|react-scripts start)/;
    for (const line of psOutput.split('\n')) {
      if (!line.includes(AGENT_OUTPUTS_BASE)) continue;
      if (!devServerPattern.test(line)) continue;
      const pid = parseInt(line.trim().split(/\s+/)[0], 10);
      if (!pid || pid === process.pid) continue;
      try { process.kill(pid); } catch { /* already gone */ }
    }
  } catch {
    // Non-blocking: cleanup is best effort.
  }

  // Create root if needed
  if (!existsSync(AGENT_OUTPUTS_BASE)) {
    mkdirSync(AGENT_OUTPUTS_BASE, { recursive: true });
    console.log(`[Worker] Created ai-sandbox root: ${AGENT_OUTPUTS_BASE}`);
  }

  // Copy worker env to ai-sandbox root (always refresh in case keys change)
  const envSources = [path.join(AGENT_BASE, '.env.worker'), path.join(AGENT_BASE, '.env')];
  const envDest = path.join(AGENT_OUTPUTS_BASE, '.env');
  const envSource = envSources.find((candidate) => existsSync(candidate));
  if (envSource) {
    copyFileSync(envSource, envDest);

    // Validate: warn if executive keys leaked into the worker env
    const leakCheck = checkWorkerEnvForLeaks(envDest);
    if (!leakCheck.clean) {
      console.warn(`[Worker] WARNING: Executive-tier keys found in worker env:`);
      for (const leak of leakCheck.leaks) {
        console.warn(`[Worker]   ${leak.key} (belongs to ${leak.belongsToTier})`);
      }
    }
  }

  // Copy .env.app to ai-sandbox root if it exists (Tier 3 transfer file)
  const appEnvSource = path.join(AGENT_BASE, '.env.app');
  const appEnvDest = path.join(AGENT_OUTPUTS_BASE, '.env.app');
  if (existsSync(appEnvSource)) {
    copyFileSync(appEnvSource, appEnvDest);
  }

  // Copy .claude/ (skills + agents) to ai-sandbox root
  if (existsSync(CLAUDE_FILES_DIR)) {
    const destDir = path.join(AGENT_OUTPUTS_BASE, '.claude');
    try {
      cpSync(CLAUDE_FILES_DIR, destDir, { recursive: true });
      console.log(`[Worker] Synced .claude/ skills and agents to ${destDir}`);
    } catch (error) {
      console.log(`[Worker] Warning: Failed to sync .claude/ to ai-sandbox root: ${error}`);
    }
  }

  // Generate CLAUDE.md at ai-sandbox root
  generateOutputsClaudeMd();
}

/**
 * Generate CLAUDE.md at the ai-sandbox root.
 * This is what the Agent SDK reads when cwd is set to ai-sandbox/.
 * Explains the monorepo structure and rules for workers.
 */
function generateOutputsClaudeMd(): void {
  // Check for available app credentials to include in worker instructions
  const appEnvPath = path.join(AGENT_OUTPUTS_BASE, '.env.app');
  const appCredNames = existsSync(appEnvPath) ? getAvailableAppCredentialNames(appEnvPath) : [];
  const appCredsSection = appCredNames.length > 0
    ? `\n## Available App Credentials (Tier 3)\n\nThe following application credentials are available in \`.env.app\` at the workspace root:\n${appCredNames.map(n => `- \`${n}\``).join('\n')}\n\nThese have been stripped of the \`APP_\` prefix. Inject them into your project in whatever format it needs:\n- **Node.js/Python**: Copy to project \`.env\` or use dotenv\n- **Docker**: Add to \`docker-compose.yml\` environment block\n- **Shell scripts**: Source as \`export KEY="value"\`\n- **Other platforms**: Convert to the appropriate config format\n`
    : '';

  // Read services registry to tell workers what cloud services are available
  let servicesSection = '';
  const servicesRegistryPath = path.join(AGENT_BASE, 'capabilities', 'services-registry.yml');
  if (existsSync(servicesRegistryPath)) {
    try {
      const registryContent = readFileSync(servicesRegistryPath, 'utf-8');
      const registry = yaml.load(registryContent) as { services?: Array<{ id: string; name: string; description: string; replaces?: string[]; tier: number[]; env_vars?: Record<string, string[]> }> };
      if (registry?.services && registry.services.length > 0) {
        // Only show services available to workers (tier 2 or 3)
        const workerServices = registry.services.filter(s => s.tier.includes(2) || s.tier.includes(3));
        if (workerServices.length > 0) {
          const serviceLines = workerServices.map(s => {
            const envVars = s.env_vars?.worker || s.env_vars?.app || [];
            const envNote = envVars.length > 0 ? ` (env: ${envVars.join(', ')})` : '';
            return `- **${s.name}**${envNote}: ${s.description}`;
          });
          const replaceLines = workerServices
            .filter(s => s.replaces && s.replaces.length > 0)
            .flatMap(s => (s.replaces || []).map(r => `- Instead of **${r}** → use **${s.name}**`));

          servicesSection = `\n## Available Cloud Services

**Use these services by default** unless the task explicitly requires something else.

${serviceLines.join('\n')}
${replaceLines.length > 0 ? `\n### Do NOT use local alternatives when a cloud service exists\n\n${replaceLines.join('\n')}\n` : ''}`;
        }
      }
    } catch {
      // Non-fatal: skip services section if registry can't be read
    }
  }

  // Load CLAUDE.md template and render with dynamic sections
  const claudeMdPath = path.join(AGENT_OUTPUTS_BASE, 'CLAUDE.md');
  const templatePath = path.join(AGENT_BASE, 'claude-files-to-output', 'templates', 'ai-sandbox-claude-md.md');
  let templateBody: string;
  try {
    templateBody = readFileSync(templatePath, 'utf-8').trim();
  } catch {
    console.warn(`[Worker] Warning: Could not load CLAUDE.md template from ${templatePath}`);
    return;
  }

  const content = templateBody
    .replace('{{SERVICES_SECTION}}', servicesSection)
    .replace('{{APP_CREDS_SECTION}}', appCredsSection);

  // Only write if content actually changed (avoid unnecessary disk writes)
  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    if (existing === content) return;
  }

  writeFileSync(claudeMdPath, content, 'utf-8');
  console.log(`[Worker] Updated CLAUDE.md at ${claudeMdPath}`);
}

/**
 * Set up a v2.3 worktree project: copy .env / .env.app / .claude/ into the
 * worktree root and write a worktree-specific CLAUDE.md. The worker's cwd
 * will be the worktree itself (not AGENT_OUTPUTS_BASE), so all the files
 * the worker needs must live alongside it.
 *
 * This is parallel to setupAgentOutputsRoot() which targets the legacy
 * monorepo. Both can run in the same loop iteration without conflict.
 */
function setupWorktreeProject(worktreePath: string, slug: string): void {
  if (!existsSync(worktreePath)) return;

  // Copy worker .env (synced from .env.worker or .env)
  const envSources = [path.join(AGENT_BASE, '.env.worker'), path.join(AGENT_BASE, '.env')];
  const envSource = envSources.find((c) => existsSync(c));
  if (envSource) {
    copyFileSync(envSource, path.join(worktreePath, '.env'));
  }

  // Copy .env.app (Tier 3 transfer file) if it exists
  const appEnvSource = path.join(AGENT_BASE, '.env.app');
  if (existsSync(appEnvSource)) {
    copyFileSync(appEnvSource, path.join(worktreePath, '.env.app'));
  }

  // Copy .claude/ (skills + agents) into the worktree
  if (existsSync(CLAUDE_FILES_DIR)) {
    try {
      cpSync(CLAUDE_FILES_DIR, path.join(worktreePath, '.claude'), { recursive: true });
    } catch (error) {
      console.log(`[Worker] Warning: Failed to sync .claude/ into worktree: ${error}`);
    }
  }

  // Write a worktree-specific CLAUDE.md (do NOT reuse the monorepo template —
  // it would tell the worker it's in a monorepo, which it isn't).
  const appEnvDest = path.join(worktreePath, '.env.app');
  const appCredNames = existsSync(appEnvDest) ? getAvailableAppCredentialNames(appEnvDest) : [];
  const appCredsSection = appCredNames.length > 0
    ? `\n## Available App Credentials (Tier 3)\n\nAvailable in \`.env.app\` at this worktree root:\n${appCredNames.map(n => `- \`${n}\``).join('\n')}\n\nThese are stripped of the \`APP_\` prefix. Inject into your project format (\`.env.local\`, dotenv, docker-compose, etc.) as needed.\n`
    : '';

  const content = `# Worktree Project Workspace

You are working in a per-project git worktree at \`${worktreePath}\` on branch \`proj/${slug}\`, forked from the immutable \`base\` branch of the parent ai-sandbox repo. This is the v2.3 default build target.

## Layout

- \`.env\` — Worker env (do not modify)
- \`.env.app\` — App credentials (Tier 3, \`APP_\` prefix stripped; read-only)
- \`.claude/\` — Shared skills and agents (do not modify; use via Skill/Task tools)
- \`LICENSE\`, \`.gitignore\` — Inherited from \`base\` (do not modify)
- All other files: yours to create / modify

## Rules

1. **Stay in this worktree.** Do not \`cd\` to \`~/dev/ai-sandbox/\` or to any other worktree. Your assigned project path IS this directory.
2. **Do NOT run \`git init\`.** This worktree shares the parent ai-sandbox repo's git database. \`git add\` / \`git commit\` from here commits to the \`proj/${slug}\` branch.
3. **Branch is \`proj/${slug}\`** off the immutable \`base\` branch. Don't switch branches; commit your work directly here.
4. **Do NOT create a nested \`.claude/\`** — the one at this worktree root is shared by Skill/Task tools.
5. **Projects CAN have their own CLAUDE.md** — it inherits from this root file and adds project-specific context.
${appCredsSection}`;

  const claudeMdPath = path.join(worktreePath, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    if (existing === content) return;
  }
  writeFileSync(claudeMdPath, content, 'utf-8');
  console.log(`[Worker] Wrote worktree CLAUDE.md at ${claudeMdPath}`);
}

/**
 * Retry context for intelligent prompts
 */
export interface WorkerRetryContext {
  attempts: number;
  maxRetries: number;
  triedStrategies: string[];
  lastError?: string;
  existingProjectPath?: string; // Reuse same project path across retries
}

/**
 * Build prompt for self-enhancement tasks
 * Instructs the worker to delegate to the self-enhancer subagent
 * Handles both new tasks and resuming existing work on a branch
 */
function buildSelfEnhancePrompt(contract: WorkerContract, workItem: WorkItem): string {
  // Use existing branch if tracked, otherwise generate new one
  const isResume = !!workItem.branch;
  const branchName = workItem.branch || `self-enhance/${contract.id.replace('contract-', '')}`;

  const resumeInstructions = isResume
    ? `## RESUMING EXISTING WORK

**This task has already started.** A branch exists: \`${branchName}\`

The self-enhancer MUST:
1. Check out the existing branch: \`git checkout ${branchName}\`
2. Review what work has already been done (check git log, current files)
3. Continue from where the previous work left off
4. Do NOT create a new branch - continue on the existing one

`
    : `## STARTING NEW WORK

This is a new self-enhancement task. The self-enhancer will:
1. Create branch: \`${branchName}\`
2. Make the required changes
3. Run typecheck and build validation
4. Commit changes with clear message
5. Report back for human review

`;

  return `# Self-Enhancement Task: ${workItem.title}

You are executing a **self-enhancement task** - modifying the continuous-agent system itself.

## Task Details
- **Priority:** ${workItem.priority}
- **Contract:** ${contract.id}
- **Branch:** ${branchName}
- **Status:** ${isResume ? 'RESUMING existing work' : 'NEW task'}

## Description
${workItem.description || 'No description provided'}

## Definition of Done
${contract.definition_of_done.map((item, i) => `${i + 1}. ${item}`).join('\n')}

${resumeInstructions}
## Instructions

**Use the self-enhancer subagent to complete this task.**

Delegate to the self-enhancer agent using the Task tool:
\`\`\`
Use the self-enhancer subagent to: ${workItem.title}

Branch: ${branchName}
Resume: ${isResume ? 'YES - continue existing work' : 'NO - start fresh'}

${workItem.description || ''}
\`\`\`

## CRITICAL REMINDERS
- The self-enhancer works in the agent codebase (continuous-agent)
- It CANNOT modify workspace/constitution.md
- All changes must pass typecheck and build
- Changes are staged on a branch for human review before merge
${isResume ? '- This is RESUMING work - check the existing branch first!' : '- This is NEW work - create the branch first'}

## Output
Report the self-enhancer's results:
- Branch name: ${branchName}
- Summary of changes
- Validation status (typecheck/build)
- Any issues or concerns
`;
}

/**
 * Build prompt for skill-build tasks
 * Instructs the worker to delegate to the skill-builder subagent
 * and then test the skill via the Skill tool in a build→test→fix loop
 */
function buildSkillBuildPrompt(contract: WorkerContract, workItem: WorkItem): string {
  // Use existing branch if tracked, otherwise generate new one
  const isResume = !!workItem.branch;
  const branchName = workItem.branch || `skill-build/${contract.id.replace('contract-', '')}`;

  const resumeInstructions = isResume
    ? `## RESUMING EXISTING WORK

**This skill build has already started.** A branch exists: \`${branchName}\`

You MUST:
1. Check out the existing branch: \`git checkout ${branchName}\`
2. Review what skill files have already been created (check git log, .claude/skills/)
3. Continue from where the previous work left off
4. Do NOT create a new branch - continue on the existing one

`
    : `## STARTING NEW SKILL BUILD

This is a new skill build task. You will:
1. Create branch: \`${branchName}\`
2. Build the skill using the skill-builder subagent
3. Test the skill using the Skill tool
4. Fix and iterate until the skill works end-to-end
5. Commit and report for human review

`;

  return `# Skill Build Task: ${workItem.title}

You are building a **new Claude Code skill** — a reusable instruction set that lives in \`.claude/skills/\`.

## Task Details
- **Priority:** ${workItem.priority}
- **Contract:** ${contract.id}
- **Branch:** ${branchName}
- **Status:** ${isResume ? 'RESUMING existing work' : 'NEW skill build'}

## Description
${workItem.description || 'No description provided'}

## Definition of Done
${contract.definition_of_done.map((item, i) => `${i + 1}. ${item}`).join('\n')}

${resumeInstructions}
## Build → Test → Fix Loop

Follow this iterative process:

### 1. BUILD: Delegate to the skill-builder subagent

Use the Task tool to delegate skill creation:
\`\`\`
Use the skill-builder subagent to: ${workItem.title}

Branch: ${branchName}
Resume: ${isResume ? 'YES - continue existing work' : 'NO - start fresh'}

${workItem.description || ''}
\`\`\`

The skill-builder will:
- Research existing skills as references
- Create the SKILL.md with proper frontmatter
- Add any supporting files (scripts, templates, references)
- Run format validation
- Commit the skill to the branch

### 2. TEST: Invoke the newly created skill

After the skill-builder finishes, test the skill yourself:

1. **Load the skill** using the Skill tool — invoke it by name
2. **Follow the skill's instructions** for a minimal test case
3. **Verify the outputs** match expectations
4. **Check edge cases** and error handling

### 3. FIX: Iterate if the test failed

If the skill doesn't work:
1. Identify what failed and why
2. Delegate back to the skill-builder with specific feedback:
   \`\`\`
   Use the skill-builder to fix the {skill-name} skill:

   Issue: {what failed}
   Expected: {what should happen}
   Actual: {what happened}
   \`\`\`
3. Re-test after the fix
4. Repeat up to 5 iterations

### 4. FINALIZE: Once the skill passes

After the skill works end-to-end:
1. Ensure all files are committed
2. Verify the branch has clean git status
3. Report results

## CRITICAL REMINDERS
- Skills live in \`.claude/skills/{name}/SKILL.md\` in the agent codebase
- You are working in the agent codebase (continuous-agent), NOT ai-sandbox
- The skill-builder subagent handles file creation; you handle testing
- Test the skill YOURSELF using the Skill tool after creation
- Maximum 5 build→test→fix iterations before reporting a blocker
- NEVER modify workspace/constitution.md

## Output
Report:
- Branch name: ${branchName}
- Skill name and path
- Test results (format + functional)
- Number of iterations needed
- Summary of what the skill does
`;
}

/**
 * Build the system prompt for a worker agent.
 * Uses V2 skill-based prompt composition with vendor adaptation.
 */
async function buildWorkerPrompt(
  contract: WorkerContract,
  projectPath: string,
  workItem?: WorkItem,
  retryContext?: WorkerRetryContext,
  vendor?: string,
): Promise<string> {
  const resolvedVendor = (vendor || process.env.WORKER_VENDOR || 'claude') as import('../../core/vendor/types.js').AgentWorkerVendor;

  if (workItem) {
    return await buildIntelligentPrompt(contract, workItem, projectPath, retryContext, resolvedVendor);
  }

  // Fallback: create a minimal work item from contract for the prompt builder
  const minimalItem: WorkItem = {
    id: contract.id,
    title: contract.prompt,
    description: '',
    priority: 'P2',
    status: 'in_progress',
  };
  return await buildIntelligentPrompt(contract, minimalItem, projectPath, retryContext, resolvedVendor);
}

/** Tools that are read-only (allowed in plan-mode) */
const PLAN_MODE_ALLOWED_TOOLS = ['Skill', 'Task', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

/**
 * Restrict tool set for plan-mode execution (read-only tools only).
 * Removes Write, Edit, Bash, and other write-capable tools.
 */
function restrictToolsForPlanMode(tools: string[]): string[] {
  return tools.filter(t => PLAN_MODE_ALLOWED_TOOLS.includes(t));
}

/**
 * Spawn a worker agent to execute a task contract
 *
 * @param contract - The task contract defining what the worker should do
 * @param workItem - Optional work item for intelligent prompt building
 * @param retryContext - Optional retry context for strategy selection
 * @param executionPattern - Optional V2.0 execution pattern (affects tool access and behavior)
 * @returns WorkerResult with success status, output, and any artifacts/errors
 */
export async function spawnWorker(
  contract: WorkerContract,
  workItem?: WorkItem,
  retryContext?: WorkerRetryContext,
  executionPattern?: ExecutionPattern,
): Promise<WorkerResult> {
  const startTime = Date.now();
  const outputs: string[] = [];
  const artifacts: string[] = [];
  const errors: string[] = [];

  // Create logger for this worker
  const logger = createWorkerLogger(contract.id);

  // Check if this is a self-enhancement or skill-build task
  const isSelfEnhance = workItem?.selfEnhance === true;
  const isSkillBuild = workItem?.skillBuild === true;

  // DEBUG: Log what we receive
  console.log(`[Worker] DEBUG: retryContext received:`, retryContext ? JSON.stringify(retryContext) : 'undefined');
  console.log(`[Worker] DEBUG: selfEnhance:`, isSelfEnhance, 'skillBuild:', isSkillBuild);

  // For retries, reuse existing project path to continue work on same project
  // For first attempt, generate new project path
  // EXCEPTION: Self-enhancement tasks always use AGENT_BASE
  let projectPath: string;
  let category: string;
  // Hoisted from the resolver block below so the cwd computation at the
  // bottom of spawnWorker can branch on the build target.
  let buildTargetMode: BuildTarget | undefined;
  let resolvedSlug: string | undefined;

  if (isSelfEnhance) {
    // Self-enhancement: work in the agent codebase itself
    projectPath = AGENT_BASE;
    category = 'self-enhance';
    logger.log(`SELF-ENHANCE: Working in agent codebase: ${projectPath}`);
    console.log(`[Worker] SELF-ENHANCE: Working in agent codebase: ${projectPath}`);
  } else if (isSkillBuild) {
    // Skill building: work in the agent codebase (skills live in .claude/skills/)
    projectPath = AGENT_BASE;
    category = 'skill-build';
    logger.log(`SKILL-BUILD: Working in agent codebase: ${projectPath}`);
    console.log(`[Worker] SKILL-BUILD: Working in agent codebase: ${projectPath}`);
  } else {
    // v2.3: Route through the unified build-target resolver. The resolver
    // honors retry context (existingProjectPath) by short-circuiting and
    // returning the persisted path, so the legacy retry branch is folded in.
    const slug = workItem?.id?.replace(/^goal-/, '') || contract.id.replace('contract-', '');
    resolvedSlug = slug;
    category = detectCategory(contract.prompt);
    const resolution = resolveBuildTarget({
      slug,
      build_target: workItem?.build_target,
      target_dir: workItem?.target_dir,
      target_branch: workItem?.target_branch,
      existingOutputPath: retryContext?.existingProjectPath || workItem?.output_path,
      // Monorepo path stays exactly where v2.2 put it (preserves backwards compat).
      resolveMonorepoPath: () => generateProjectPath(contract).path,
    });
    buildTargetMode = resolution.build_target;
    for (const w of resolution.warnings) {
      logger.log(w);
      console.warn(w);
    }
    projectPath = resolution.outputPath;
    logger.log(
      `BUILD_TARGET: mode=${resolution.build_target} path=${projectPath} ` +
        `branch=${resolution.branch ?? '(current)'} created=${resolution.created}`,
    );
    console.log(
      `[Worker] BUILD_TARGET: mode=${resolution.build_target} path=${projectPath}`,
    );

    // 'existing' target: respect the project as-is. Skip all scaffold (no
    // .gitignore injection, no .env copy, no auto-commit). The project owns
    // its own state. Source-project copy-in also doesn't apply.
    if (resolution.build_target !== 'existing') {
      // Worktree mode is ours — safe to scaffold. Monorepo is the legacy
      // path. Both share the same setup steps.
      setupProjectDirectory(projectPath, category);

      // v2.3: For worktree mode, mirror the centralized .env / .env.app /
      // .claude / CLAUDE.md into the worktree so the worker can cwd directly
      // into it instead of the legacy monorepo. Monorepo mode keeps using
      // the centralized AGENT_OUTPUTS_BASE setup unchanged.
      if (resolution.build_target === 'worktree') {
        setupWorktreeProject(projectPath, slug);
      }

      // V1.2: Copy-in from source project if specified
      if (workItem?.source_project) {
        const sourceEntry = findProjectBySlug(workItem.source_project);
        if (sourceEntry) {
          logger.log(`COPY-IN: Copying from source project "${sourceEntry.slug}" at ${sourceEntry.output_path}`);
          const copied = copySourceProject(sourceEntry.output_path, projectPath);
          if (copied) {
            logger.log(`COPY-IN: Source project copied successfully`);
          } else {
            logger.log(`COPY-IN: Warning - source project copy failed, starting fresh`);
          }
        } else {
          logger.log(`COPY-IN: Source project "${workItem.source_project}" not found in registry`);
        }
      }
    } else if (workItem?.source_project) {
      logger.log(
        `COPY-IN: skipped — build_target='existing' uses target_dir as-is`,
      );
    }

    // Optional branch checkout for existing mode when the frontmatter
    // explicitly requests one. Worktree mode already created its branch via
    // `git worktree add -b`. Monorepo mode is intentionally excluded: the
    // legacy worktree is pinned to `monorepo/legacy-v2.2` and switching
    // branches there would corrupt the archive. If a monorepo goal sets
    // `target_branch`, we log and ignore.
    if (
      resolution.branch &&
      resolution.build_target === 'monorepo'
    ) {
      logger.log(
        `BUILD_TARGET: ignoring target_branch=${resolution.branch} for monorepo ` +
          `mode — the legacy worktree is pinned to monorepo/legacy-v2.2`,
      );
    }
    if (
      resolution.branch &&
      resolution.build_target === 'existing'
    ) {
      // Use execFileSync with argv arrays (no shell) so user-supplied
      // target_branch from PROMPT.md can't shell-inject through quoting.
      const gitIn = (args: string[]): void => {
        execFileSync('git', ['-C', projectPath, ...args], { stdio: 'pipe' });
      };
      const gitProbe = (args: string[]): boolean => {
        try {
          gitIn(args);
          return true;
        } catch {
          return false;
        }
      };
      try {
        gitIn(['rev-parse', '--git-dir']);
        const exists = gitProbe(['rev-parse', '--verify', resolution.branch]);
        gitIn(exists
          ? ['checkout', resolution.branch]
          : ['checkout', '-b', resolution.branch]);
        logger.log(`BUILD_TARGET: checked out branch ${resolution.branch}`);
      } catch (err) {
        logger.log(
          `BUILD_TARGET: branch checkout failed for ${resolution.branch}: ${(err as Error).message}`,
        );
      }
    }
  }

  // Set up centralized CLAUDE.md, .claude/, and .env at AGENT_OUTPUTS_BASE
  // (the legacy monorepo worktree). v2.3: only run this for monorepo-mode
  // goals — worktree-mode goals get their own self-contained setup via
  // setupWorktreeProject() and don't read from the legacy root, so touching
  // it on every spawn just produces noisy diffs in the legacy worktree.
  // Self-enhance/skill-build also skip — they work in the agent repo which
  // already has .claude/.
  if (!isSelfEnhance && !isSkillBuild && buildTargetMode === 'monorepo') {
    setupAgentOutputsRoot();
  }

  // Compute the project path label that workers see in their prompts.
  // - self-enhance / skill-build: absolute path (cwd is the agent repo)
  // - worktree / existing (v2.3): absolute path; cwd already IS this dir, so
  //   `cd $PROJECT_PATH` is a no-op but keeps prompts uniform across modes
  // - monorepo (legacy): relative to AGENT_OUTPUTS_BASE (cwd is the legacy root)
  const projectIsInsideOutputs = projectPath.startsWith(AGENT_OUTPUTS_BASE + path.sep);
  const relativeProjectPath = (isSelfEnhance || isSkillBuild)
    ? projectPath
    : (buildTargetMode === 'worktree' || buildTargetMode === 'existing')
      ? projectPath
      : projectIsInsideOutputs
        ? path.relative(AGENT_OUTPUTS_BASE, projectPath)
        : projectPath;

  // Build prompt - use specialized prompts for self-enhance and skill-build tasks
  let prompt: string;
  if (isSelfEnhance && workItem) {
    prompt = buildSelfEnhancePrompt(contract, workItem);
  } else if (isSkillBuild && workItem) {
    prompt = buildSkillBuildPrompt(contract, workItem);
  } else {
    // Pass relative path so workers navigate from the ai-sandbox cwd
    const vendorId = workItem?.worker_vendor || process.env.WORKER_VENDOR || 'claude';
    prompt = await buildWorkerPrompt(contract, relativeProjectPath, workItem, retryContext, vendorId);
  }

  // Track which strategy we're using if retrying
  if (retryContext && workItem) {
    const strategySelection = selectStrategy(workItem, retryContext.triedStrategies);
    if (strategySelection) {
      logger.log(`Strategy: ${strategySelection.strategy.name} (${strategySelection.strategy.id})`);
    }
  }
  const model = resolveWorkerModelForVendor(workItem?.worker_vendor);

  // Determine allowed tools
  // Task is included by default for all workers (subagent delegation to task-researcher, code-validator).
  // This guard ensures it's present for self-enhance/skill-build even if default changes.
  let allowedTools = [...contract.scope.tools_allowed];
  if ((isSelfEnhance || isSkillBuild) && !allowedTools.includes('Task')) {
    allowedTools.push('Task');
  }

  // V2.0: Apply execution pattern restrictions
  if (executionPattern) {
    logger.log(`Execution Pattern: ${executionPattern}`);
    console.log(`[Worker] Execution Pattern: ${executionPattern}`);

    if (executionPattern === 'plan-mode') {
      // Plan-mode: restrict to read-only tools
      const originalCount = allowedTools.length;
      allowedTools = restrictToolsForPlanMode(allowedTools);
      logger.log(`Plan-mode: restricted tools from ${originalCount} to ${allowedTools.length} (read-only)`);
      console.log(`[Worker] Plan-mode: tools restricted to read-only: ${allowedTools.join(', ')}`);
    }

    // loop-until-progress — handled at executive-loop level (Phase 4 re-execution loop)
  }

  // Resolve vendor provider before logging so we can include vendor info.
  // v2.3: worktree/existing modes cwd directly into the project dir; monorepo
  // (legacy) keeps using the centralized AGENT_OUTPUTS_BASE root.
  const workerCwd = (isSelfEnhance || isSkillBuild)
    ? projectPath
    : (buildTargetMode === 'worktree' || buildTargetMode === 'existing')
      ? projectPath
      : AGENT_OUTPUTS_BASE;
  const provider = getAgentWorkerProviderForVendor(workItem?.worker_vendor);

  // Log worker start with full context
  logger.log(`=== WORKER START ===`);
  logger.log(`Build: ${BUILD_INFO.buildVersion}`);
  logger.log(`Task ID: ${contract.id}`);
  logger.log(`Project Path: ${projectPath}`);
  logger.log(`Relative Path: ${relativeProjectPath}`);
  logger.log(`CWD: ${workerCwd}`);
  logger.log(`Category: ${category}`);
  logger.log(`Vendor: ${provider.vendorName} (${provider.vendorId})`);
  logger.log(`Model: ${model || '(vendor default)'}`);
  logger.log(`Max Turns: ${contract.max_turns}`);
  logger.log(`Tools: ${allowedTools.join(', ')}`);
  logger.log(`--- PROMPT ---`);
  logger.log(prompt);
  logger.log(`--- END PROMPT ---`);

  try {
    const stream = provider.spawn({
      prompt,
      model,
      maxTurns: contract.max_turns,
      cwd: workerCwd,
      allowedTools: allowedTools,
      settingSources: ['user', 'project'],
    });

    // Process the streaming response with a wall-clock timeout.
    // Without this, a hung worker blocks the entire executive loop indefinitely.
    let turnCount = 0;

    const streamingWork = async () => {
      for await (const message of stream) {
        const msg: AgentWorkerMessage = message;

        // Log all messages for traceability
        logger.log(`[MSG] type=${msg.type} ${JSON.stringify(msg.raw).slice(0, 500)}`);

        // Handle different message types
        if (msg.type === 'assistant') {
          turnCount++;
          logger.log(`[TURN ${turnCount}] Assistant response`);
          if (msg.text) {
            outputs.push(msg.text);
          }
        } else if (msg.type === 'result') {
          if (msg.resultSuccess) {
            if (msg.text) {
              outputs.push(msg.text);
            }
          } else {
            // Handle error results
            if (msg.resultErrors) {
              errors.push(...msg.resultErrors);
            }
          }
        }
      }
    };

    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), WORKER_TIMEOUT_MS);
    });

    const raceResult = await Promise.race([
      streamingWork().then(() => 'done' as const),
      timeoutPromise,
    ]);

    if (raceResult === 'timeout') {
      const timeoutMin = Math.round(WORKER_TIMEOUT_MS / 60000);
      logger.log(`TIMEOUT: Worker exceeded ${timeoutMin} minute wall-clock limit`);
      errors.push(`Worker timed out after ${timeoutMin} minutes (${WORKER_TIMEOUT_MS}ms wall-clock limit)`);
    }

    const duration = Date.now() - startTime;
    const success = errors.length === 0;

    // Log completion
    logger.log(`=== WORKER COMPLETE ===`);
    logger.log(`Success: ${success}`);
    logger.log(`Duration: ${duration}ms`);
    logger.log(`Turns: ${turnCount}`);
    if (errors.length > 0) {
      logger.log(`Errors: ${errors.join(', ')}`);
    }
    logger.close();

    return {
      success,
      output: outputs.join('\n\n'),
      artifacts,
      errors,
      duration_ms: duration,
      output_path: projectPath,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';

    // Log error with full stack trace
    logger.log(`=== WORKER FAILED ===`);
    logger.log(`Error: ${errorMessage}`);
    logger.log(`Stack: ${stack}`);
    logger.log(`Duration: ${duration}ms`);
    logger.close();

    return {
      success: false,
      output: outputs.join('\n\n'),
      artifacts,
      errors: [`Worker execution failed: ${errorMessage}`],
      duration_ms: duration,
      output_path: projectPath,
    };
  }
}

/**
 * Validate that authentication is configured for the active worker vendor.
 * Delegates to the vendor provider's own auth validation.
 */
export function validateAuth(): { valid: boolean; method: string | null; error: string | null } {
  const provider = getAgentWorkerProviderForVendor();
  return provider.validateAuth();
}
