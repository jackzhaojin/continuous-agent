/**
 * OpenAI Codex SDK Provider
 *
 * Wraps the @openai/codex-sdk to implement the AgentWorkerProvider interface.
 * Codex SDK provides agentic coding capabilities similar to Claude Agent SDK
 * but using OpenAI's model infrastructure.
 *
 * Key differences from Claude Agent SDK:
 * - Uses thread-based execution (startThread → run)
 * - Streaming via runStreamed() with event-based iteration
 * - Model selection handled via Codex config, not per-query
 * - Authentication via CODEX_API_KEY / OPENAI_API_KEY
 * - Working directory must be a git repo (or skipGitRepoCheck: true)
 */

import type {
  AgentWorkerProvider,
  AgentWorkerConfig,
  AgentWorkerMessage,
  AuthValidation,
} from './types.js';

export class CodexAgentWorkerProvider implements AgentWorkerProvider {
  readonly vendorId = 'codex' as const;
  readonly vendorName = 'OpenAI Codex SDK';

  async *spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage> {
    // Dynamic import to avoid requiring the package if not used
    let CodexSDK: typeof import('@openai/codex-sdk');
    try {
      CodexSDK = await import('@openai/codex-sdk');
    } catch (e) {
      throw new Error(
        'Codex SDK not installed. Run: npm install @openai/codex-sdk\n' +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const { Codex } = CodexSDK;

    // Build Codex configuration
    // Only pass model if explicitly set and non-empty — ChatGPT auth doesn't support
    // all models (e.g., 'o3' requires API key). Omitting lets Codex use its default.
    const codexConfig: Record<string, string> = {};
    if (config.model) {
      codexConfig['model'] = config.model;
    }

    const codex = new Codex({
      config: codexConfig,
    });

    const thread = codex.startThread({
      workingDirectory: config.cwd,
      skipGitRepoCheck: true, // Workers may operate in non-git directories
    });

    // Use streaming API if available, otherwise fall back to run()
    try {
      const { events } = await thread.runStreamed(config.prompt);

      for await (const event of events) {
        yield normalizeCodexEvent(event);
      }
    } catch {
      // Fall back to non-streaming run() if runStreamed is not available
      console.log('[Codex] runStreamed not available, falling back to run()');
      const result = await thread.run(config.prompt);

      // Yield the result as a single message
      yield {
        type: 'result',
        text: typeof result === 'string' ? result : JSON.stringify(result),
        resultSuccess: true,
        raw: result,
      };
    }
  }

  validateAuth(): AuthValidation {
    const codexKey = process.env.CODEX_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (codexKey) {
      return { valid: true, method: 'Codex API Key', error: null };
    }
    if (openaiKey) {
      return { valid: true, method: 'OpenAI API Key', error: null };
    }
    return {
      valid: false,
      method: null,
      error: 'No Codex authentication found. Set CODEX_API_KEY or OPENAI_API_KEY.',
    };
  }
}

// ── Event Normalization ─────────────────────────────────────────

interface CodexStreamEvent {
  type: string;
  item?: { type: string; [key: string]: unknown };
  usage?: unknown;
  [key: string]: unknown;
}

function normalizeCodexEvent(event: CodexStreamEvent): AgentWorkerMessage {
  if (event.type === 'item.completed' && event.item) {
    const item = event.item;
    const itemType = item.type;

    // Extract structured text based on item type
    if (itemType === 'agent_message') {
      const text = typeof item.content === 'string'
        ? item.content
        : Array.isArray(item.content)
          ? (item.content as Array<{ text?: string }>).map(c => c.text || '').join('')
          : JSON.stringify(item);
      return { type: 'assistant', text, raw: event };
    }

    if (itemType === 'reasoning') {
      const summary = typeof item.summary === 'string' ? item.summary : JSON.stringify(item);
      return { type: 'assistant', text: `[thinking] ${summary}`, raw: event };
    }

    if (itemType === 'command_execution') {
      const cmd = (item.command || item.args || '') as string;
      const exit = item.exit_code ?? item.exitCode ?? '?';
      const output = ((item.output || '') as string).slice(0, 300);
      return {
        type: 'assistant',
        text: `[tool_call] shell(${cmd})\n[tool_result] exit=${exit} ${output}`,
        raw: event,
      };
    }

    if (itemType === 'file_change') {
      const action = item.action || item.status || 'change';
      const file = item.path || item.file || 'unknown';
      return {
        type: 'assistant',
        text: `[tool_call] file_${action}(${file})`,
        raw: event,
      };
    }

    // Fallback for other item types (mcp_tool_call, web_search, etc.)
    return {
      type: 'assistant',
      text: `[${itemType}] ${JSON.stringify(item).slice(0, 300)}`,
      raw: event,
    };
  }

  if (event.type === 'turn.completed') {
    const usage = event.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    const usageText = usage
      ? ` (input=${usage.input_tokens || 0} output=${usage.output_tokens || 0})`
      : '';
    return {
      type: 'result',
      text: `Turn completed${usageText}`,
      resultSuccess: true,
      raw: event,
    };
  }

  if (event.type === 'turn.failed') {
    return {
      type: 'result',
      resultSuccess: false,
      resultErrors: [`Codex turn failed: ${JSON.stringify(event).slice(0, 500)}`],
      raw: event,
    };
  }

  // Unknown event type
  return {
    type: 'other',
    raw: event,
  };
}
