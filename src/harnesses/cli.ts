/**
 * Unified Harness CLI — v2.2 D2 entry point.
 *
 * Runs a harness standalone, outside the executive loop. No PM2, no goal
 * bundles, no queue.
 *
 *   npm run harness -- --name <generic|eds|study> --prompt <path> [flags]
 *
 * Flags:
 *   --name <harness>        (required) generic | eds | study
 *   --prompt <path>         (required) absolute or relative path to PROMPT.md
 *   --target <dir>          target working directory (default: derived)
 *   --vendor <name>         claude | codex | kimi | kimi-cli | kimi-wire
 *                           (default: $WORKER_VENDOR or 'claude')
 *   --mode <mode>           auto|bootstrap|adopt|extend|extend-deep|resume
 *   --max-turns <n>         maxTurnsPerAgent override
 *   --list                  print registered harnesses and exit
 *   --help                  print usage and exit
 *
 * Env:
 *   CLAUDE_CODE_OAUTH_TOKEN — required for Claude vendor
 *   WORKER_VENDOR           — default vendor if --vendor omitted
 *   MODEL_<AGENT>           — per-agent model overrides (e.g. MODEL_SPEC_WHY=opus)
 *
 * Zero third-party deps: parses argv manually. Commander can be added later
 * once a richer flag surface is needed.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as dotenv from 'dotenv';

// ── Load env tiers ───────────────────────────────────────────────
// The continuous-agent repo uses three-tier credential separation
// (.env.executive → .env.worker → .env). Standalone harness runs only
// need Tier 2 (worker) secrets — CLAUDE_CODE_OAUTH_TOKEN, model strings,
// vendor API keys. Load .env.worker first (highest precedence), then
// fall back to .env. dotenv doesn't overwrite existing keys by default,
// so the first file's values win.
const envCandidates = ['.env.worker', '.env'];
for (const candidate of envCandidates) {
  const full = path.resolve(process.cwd(), candidate);
  if (fs.existsSync(full)) dotenv.config({ path: full });
}

import { getHarness, listHarnesses } from './core/harness-registry.js';
import { getAgentWorkerProviderForVendor } from '../core/vendor/vendor-registry.js';
import { parsePromptMd } from '../deterministic/prompt-md-parser.js';
import type { AgentWorkerVendor } from '../core/vendor/types.js';
import type {
  HarnessEvent,
  HarnessModeType,
  HarnessRunConfig,
} from './core/types.js';
import {
  ensureWorktreeTarget,
  resolveBuildTargetType,
  resolveExistingTargetDir,
  resolveHarnessDefaultTarget,
} from '../agentic/execution/build-target-resolver.js';

interface ParsedArgs {
  name?: string;
  prompt?: string;
  target?: string;
  vendor?: string;
  mode?: string;
  maxTurns?: number;
  list?: boolean;
  help?: boolean;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--list') out.list = true;
    else if (arg === '--name') out.name = argv[++i];
    else if (arg === '--prompt') out.prompt = argv[++i];
    else if (arg === '--target') out.target = argv[++i];
    else if (arg === '--vendor') out.vendor = argv[++i];
    else if (arg === '--mode') out.mode = argv[++i];
    else if (arg === '--max-turns') out.maxTurns = Number(argv[++i]);
    else if (arg.startsWith('--')) {
      console.error(`[harness] unknown flag: ${arg}`);
      process.exit(2);
    } else {
      out.positional.push(arg);
    }
  }
  return out;
}

function printUsage(): void {
  const registered = listHarnesses().join(' | ');
  process.stdout.write(
    `\nUsage: npm run harness -- --name <${registered}> --prompt <path> [flags]\n\n` +
      `Flags:\n` +
      `  --name <harness>     Required. One of: ${registered}\n` +
      `  --prompt <path>      Required. Path to PROMPT.md\n` +
      `  --target <dir>       Target working dir (default: derived from prompt)\n` +
      `  --vendor <name>      claude | codex | kimi | kimi-cli | kimi-wire\n` +
      `  --mode <mode>        auto | bootstrap | adopt | extend | extend-deep | resume\n` +
      `  --max-turns <n>      Max turns per agent call\n` +
      `  --list               List registered harnesses and exit\n` +
      `  --help               Print this message\n\n` +
      `Env:\n` +
      `  CLAUDE_CODE_OAUTH_TOKEN  Required for claude vendor\n` +
      `  WORKER_VENDOR            Default vendor if --vendor omitted\n` +
      `  MODEL_<AGENT>            Per-agent model override (e.g. MODEL_SPEC_WHY=opus)\n\n`,
  );
}

function readModelEnvOverrides(): Record<string, string> {
  const out: Record<string, string> = {};
  const prefix = 'MODEL_';
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (key === 'MODEL') continue; // that's the global default
    if (key.startsWith(prefix)) {
      out[key.slice(prefix.length).toLowerCase()] = value;
    }
  }
  return out;
}

async function resolveTargetDir(
  promptFile: string,
  harnessName: string,
  overrideTarget?: string,
): Promise<string> {
  if (overrideTarget) return path.resolve(overrideTarget);

  const prompt = await parsePromptMd(promptFile);
  const frontmatter = prompt.frontmatter;
  const workItem = {
    id: `goal-${frontmatter.slug || path.basename(path.dirname(promptFile))}`,
    title: frontmatter.title,
    description: '',
    priority: 'P3' as const,
    status: 'pending' as const,
    build_target: frontmatter.build_target,
    target_dir: typeof frontmatter.target_dir === 'string' ? frontmatter.target_dir : undefined,
    target_branch: typeof frontmatter.target_branch === 'string' ? frontmatter.target_branch : undefined,
  };

  const buildTarget = resolveBuildTargetType(workItem);
  if (buildTarget === 'existing') {
    if (!workItem.target_dir) {
      throw new Error('build_target=existing requires target_dir in PROMPT.md');
    }
    return resolveExistingTargetDir(workItem.target_dir);
  }
  if (buildTarget === 'worktree') {
    return ensureWorktreeTarget(workItem, frontmatter.slug || 'harness-run');
  }
  return resolveHarnessDefaultTarget(harnessName, frontmatter.slug || 'harness-run');
}

function resolveVendor(flag: string | undefined): AgentWorkerVendor {
  const raw = (flag ?? process.env.WORKER_VENDOR ?? 'claude').toLowerCase();
  if (raw === 'kimi') return 'kimi';
  if (raw === 'kimi-cli' || raw === 'kimi_cli') return 'kimi-cli';
  if (raw === 'kimi-wire' || raw === 'kimi_wire') return 'kimi-wire';
  if (raw === 'codex') return 'codex';
  if (raw === 'claude') return 'claude';
  console.error(`[harness] unknown vendor: ${raw}`);
  process.exit(2);
}

function coerceMode(flag: string | undefined): HarnessModeType | undefined {
  if (!flag || flag === 'auto') return undefined;
  const allowed: HarnessModeType[] = [
    'bootstrap',
    'adopt',
    'extend',
    'extend-deep',
    'resume',
  ];
  if ((allowed as string[]).includes(flag)) return flag as HarnessModeType;
  console.error(`[harness] unknown --mode: ${flag}`);
  process.exit(2);
}

function makeSigintAbort(): AbortSignal {
  const ac = new AbortController();
  let triggered = false;
  const handler = () => {
    if (triggered) {
      process.stderr.write('\n[harness] second SIGINT — exiting immediately\n');
      process.exit(130);
    }
    triggered = true;
    process.stderr.write(
      '\n[harness] SIGINT received — requesting graceful shutdown (press Ctrl+C again to force)\n',
    );
    ac.abort();
  };
  process.on('SIGINT', handler);
  return ac.signal;
}

function renderEvent(evt: HarnessEvent): void {
  const ts = 'at' in evt ? evt.at : new Date().toISOString();
  const prefix = `[${ts.slice(11, 19)}]`;
  switch (evt.type) {
    case 'run_start':
      process.stdout.write(
        `${prefix} 🚀 run_start ${evt.harness} mode=${evt.mode} target=${evt.target}\n`,
      );
      break;
    case 'phase_start':
      process.stdout.write(`${prefix} ▶ phase_start ${evt.phase}\n`);
      break;
    case 'phase_complete':
      process.stdout.write(
        `${prefix} ${evt.success ? '✔' : '✗'} phase_complete ${evt.phase}\n`,
      );
      break;
    case 'agent_start':
      process.stdout.write(
        `${prefix}   ↪ agent_start ${evt.agent} (${evt.vendor}/${evt.model})\n`,
      );
      break;
    case 'agent_message':
      if (evt.text) {
        for (const line of evt.text.split('\n')) {
          if (line.trim()) process.stdout.write(`${prefix}     ${line}\n`);
        }
      }
      break;
    case 'agent_complete':
      process.stdout.write(
        `${prefix}   ${evt.success ? '✔' : '✗'} agent_complete ${evt.agent} (${evt.duration_ms}ms)\n`,
      );
      break;
    case 'subtask_created':
      process.stdout.write(
        `${prefix}   + subtask_created ${evt.subtask_id} (parent=${evt.parent}): ${evt.reason}\n`,
      );
      break;
    case 'retry_scheduled':
      process.stdout.write(
        `${prefix}   ↻ retry_scheduled ${evt.agent} attempt=${evt.attempt}/${evt.max}: ${evt.reason}\n`,
      );
      break;
    case 'status_written':
      // quiet — happens every poll cycle in shellout mode
      break;
    case 'run_complete':
      process.stdout.write(
        `${prefix} ${evt.success ? '✅' : '❌'} run_complete success=${evt.success}\n`,
      );
      if (evt.errors?.length) {
        for (const e of evt.errors) process.stdout.write(`${prefix}   error: ${e}\n`);
      }
      break;
    case 'run_failed':
      process.stdout.write(`${prefix} ❌ run_failed: ${evt.error}\n`);
      break;
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return 0;
  }
  if (args.list) {
    for (const h of listHarnesses()) process.stdout.write(`${h}\n`);
    return 0;
  }
  if (!args.name) {
    console.error('[harness] --name is required');
    printUsage();
    return 2;
  }
  if (!args.prompt) {
    console.error('[harness] --prompt is required');
    printUsage();
    return 2;
  }

  const promptFile = path.resolve(args.prompt);
  if (!fs.existsSync(promptFile)) {
    console.error(`[harness] prompt file not found: ${promptFile}`);
    return 2;
  }

  const targetDir = await resolveTargetDir(promptFile, args.name, args.target);
  const vendor = resolveVendor(args.vendor);
  const modeOverride = coerceMode(args.mode);

  const harness = getHarness(args.name);
  const provider = getAgentWorkerProviderForVendor(vendor);

  const auth = provider.validateAuth();
  if (!auth.valid) {
    // Codex CLI login stores auth in ~/.codex/auth.json, not env vars.
    // The provider's validateAuth() only checks env vars, so fall back
    // to checking the CLI auth file before rejecting.
    let cliAuthValid = false;
    if (vendor === 'codex') {
      try {
        const authPath = path.join(os.homedir(), '.codex', 'auth.json');
        if (fs.existsSync(authPath)) {
          const cliAuth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
          cliAuthValid = !!(cliAuth.OPENAI_API_KEY || cliAuth.tokens);
        }
      } catch { /* fall through */ }
    }
    if (!cliAuthValid) {
      console.error(
        `[harness] vendor '${vendor}' auth invalid: ${auth.error ?? 'unknown error'}`,
      );
      return 1;
    }
  }

  const detected = await harness.detectMode(targetDir, promptFile);
  const mode = modeOverride
    ? { type: modeOverride, reason: `--mode ${modeOverride}` }
    : detected;

  const config: HarnessRunConfig = {
    promptFile,
    targetDir,
    mode,
    provider,
    vendor,
    modelOverrides: readModelEnvOverrides(),
    maxTurnsPerAgent: args.maxTurns,
    abortSignal: makeSigintAbort(),
  };

  let success = true;
  let hadFailure = false;
  for await (const evt of harness.run(config)) {
    renderEvent(evt);
    if (evt.type === 'run_complete') success = evt.success;
    if (evt.type === 'run_failed') {
      success = false;
      hadFailure = true;
    }
  }

  return success && !hadFailure ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[harness] fatal: ${err}`);
    process.exit(1);
  });
