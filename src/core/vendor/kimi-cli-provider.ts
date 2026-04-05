/**
 * Kimi CLI Agent Provider
 *
 * Spawns `kimi --print --output-format=stream-json` as a child process
 * and parses the JSONL output stream. This is a simpler alternative to
 * the Wire protocol provider — no SDK dependency required.
 *
 * Compared to Wire mode:
 * - Simpler: just spawns a CLI process, reads JSONL lines
 * - No bidirectional communication (no external tools, no steering)
 * - No session persistence / resume
 * - Good observability: assistant messages, tool_calls, tool results all visible
 *
 * Switch between wire and CLI via KIMI_MODE env var:
 *   KIMI_MODE=cli   → KimiCliAgentProvider (default, this file, no SDK needed)
 *   KIMI_MODE=wire  → KimiWireAgentProvider (uses @moonshot-ai/kimi-agent-sdk)
 *
 * Environment variables:
 *   KIMI_EXECUTABLE  = Path to kimi CLI (default: 'kimi')
 *   KIMI_MODEL       = Model override (default: CLI config default)
 *   KIMI_YOLO_MODE   = Auto-approve all tool calls (default: 'true' for workers)
 */

import { spawn } from 'child_process';
import * as readline from 'readline';
import type {
  AgentWorkerProvider,
  AgentWorkerConfig,
  AgentWorkerMessage,
  AuthValidation,
} from './types.js';

// JSONL message shape from `kimi --print --output-format=stream-json`
interface KimiJsonlMessage {
  role: 'assistant' | 'tool' | 'user' | 'system';
  content?: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export class KimiCliAgentProvider implements AgentWorkerProvider {
  readonly vendorId = 'kimi' as const;
  readonly vendorName = 'Kimi CLI (stream-json)';

  async *spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage> {
    const executable = process.env.KIMI_EXECUTABLE || 'kimi';
    const yoloMode = process.env.KIMI_YOLO_MODE !== 'false';

    // Build CLI arguments
    const args = ['--print', '-p', config.prompt, '--output-format=stream-json'];

    if (config.model) {
      args.push('--model', config.model);
    } else if (process.env.KIMI_MODEL) {
      args.push('--model', process.env.KIMI_MODEL);
    }

    if (yoloMode) {
      args.push('--yolo');
    }

    const proc = spawn(executable, args, {
      cwd: config.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const rl = readline.createInterface({
      input: proc.stdout!,
      crlfDelay: Infinity,
    });

    let lineCount = 0;

    // Collect stderr for error reporting
    let stderrBuf = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;
        lineCount++;

        try {
          const msg: KimiJsonlMessage = JSON.parse(line);
          const normalized = normalizeJsonlMessage(msg, lineCount);
          if (normalized) {
            yield normalized;
          }
        } catch {
          // Non-JSON line — yield as raw text
          yield {
            type: 'other',
            text: `[raw] ${line.slice(0, 300)}`,
            raw: line,
          };
        }
      }
    } finally {
      // Ensure process is cleaned up
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    }

    // Wait for process exit
    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('close', resolve);
      // If already exited
      if (proc.exitCode !== null) resolve(proc.exitCode);
    });

    const success = exitCode === 0;
    yield {
      type: 'result',
      text: `Kimi CLI exited with code ${exitCode} (${lineCount} JSONL messages)`,
      resultSuccess: success,
      resultErrors: success ? undefined : [
        `Kimi CLI exit code ${exitCode}`,
        ...(stderrBuf.trim() ? [`stderr: ${stderrBuf.trim().slice(0, 500)}`] : []),
      ],
      raw: { exitCode, lineCount, stderr: stderrBuf.slice(0, 1000) },
    };
  }

  validateAuth(): AuthValidation {
    // Kimi CLI handles its own authentication via `kimi login`.
    const apiKey = process.env.MOONSHOT_API_KEY;
    return {
      valid: true,
      method: apiKey ? 'Moonshot API Key' : 'Kimi CLI Login',
      error: null,
    };
  }
}

// ── JSONL Message Normalization ────────────────────────────────

function normalizeJsonlMessage(
  msg: KimiJsonlMessage,
  lineNum: number,
): AgentWorkerMessage | null {
  if (msg.role === 'assistant') {
    const parts: string[] = [];

    // Extract content
    if (msg.content) {
      if (typeof msg.content === 'string') {
        parts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            parts.push(block.text);
          } else if (block.type === 'thinking' && block.text) {
            parts.push(`[thinking] ${block.text}`);
          }
        }
      }
    }

    // Extract tool calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        parts.push(`[tool_call] ${tc.function.name}(${tc.function.arguments.slice(0, 200)})`);
      }
    }

    return {
      type: 'assistant',
      text: parts.join('\n') || `[assistant message #${lineNum}]`,
      raw: msg,
    };
  }

  if (msg.role === 'tool') {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    return {
      type: 'assistant',
      text: `[tool_result] ${content.slice(0, 500)}`,
      raw: msg,
    };
  }

  // system/user messages — pass through
  return {
    type: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'other',
    text: typeof msg.content === 'string' ? msg.content : undefined,
    raw: msg,
  };
}
