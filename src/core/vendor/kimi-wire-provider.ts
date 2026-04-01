/**
 * Kimi Wire Agent Provider
 *
 * Wraps @moonshot-ai/kimi-agent-sdk to implement the AgentWorkerProvider interface
 * using the Kimi Code CLI Wire protocol (JSON-RPC 2.0 over stdin/stdout).
 *
 * This is the most feature-rich provider because the Wire protocol is fully
 * bidirectional:
 *
 * - **External Tools**: Register custom tools the agent can call back to your
 *   application. The handler runs in the executive process and returns results
 *   to the agent. This enables executive-to-worker callbacks.
 *
 * - **Steering**: Inject guidance mid-turn (`steer()`) without interrupting the
 *   agent's current work. Useful for providing real-time context updates.
 *
 * - **Approval Control**: Approve/reject tool calls programmatically, allowing
 *   the executive loop to enforce safety policies at the protocol level.
 *
 * - **Subagent Events**: Receive events from nested subagent instances, enabling
 *   visibility into hierarchical agent execution.
 *
 * - **Session Persistence**: Sessions persist to disk and can be resumed via
 *   sessionId, enabling multi-turn workflows across executive loop iterations.
 *
 * - **Plan Mode**: Toggle plan mode (read-only analysis) without restarting.
 *
 * Key differences from Claude Agent SDK / Codex SDK:
 * - Wire protocol is an open, documented JSON-RPC 2.0 spec (v1.7)
 * - Bidirectional: the agent can call back to the executive (external tools)
 * - Approval is explicit per-tool-call, not just a global permission mode
 * - Session state persists to ~/.kimi/sessions (resumable)
 * - Requires `kimi` CLI installed (or `kimi-agent` Rust binary)
 *
 * Environment variables:
 *   KIMI_MODEL         = Model to use (default: 'kimi-k2.5')
 *   KIMI_EXECUTABLE    = Path to kimi CLI (default: 'kimi')
 *   KIMI_THINKING      = Enable thinking mode (default: 'false')
 *   KIMI_YOLO_MODE     = Auto-approve all tool calls (default: 'true' for workers)
 *   MOONSHOT_API_KEY    = Moonshot AI API key
 */

import type {
  AgentWorkerProvider,
  AgentWorkerConfig,
  AgentWorkerMessage,
  AuthValidation,
} from './types.js';

export class KimiWireAgentProvider implements AgentWorkerProvider {
  readonly vendorId = 'kimi' as const;
  readonly vendorName = 'Kimi Wire Protocol';

  async *spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage> {
    // Dynamic import to avoid requiring the package if not used
    let KimiSDK: typeof import('@moonshot-ai/kimi-agent-sdk');
    try {
      KimiSDK = await import('@moonshot-ai/kimi-agent-sdk');
    } catch (e) {
      throw new Error(
        'Kimi Agent SDK not installed. Run: npm install @moonshot-ai/kimi-agent-sdk\n' +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const { createSession } = KimiSDK;

    // Resolve configuration from env + config
    // Omit model to use CLI default from ~/.config/kimi/config.toml
    const model = process.env.KIMI_MODEL || config.model || undefined;
    const executable = process.env.KIMI_EXECUTABLE || 'kimi';
    const thinking = process.env.KIMI_THINKING === 'true';
    // Workers auto-approve by default (equivalent to Claude's --dangerously-skip-permissions)
    const yoloMode = process.env.KIMI_YOLO_MODE !== 'false';

    // Build environment variables for the CLI subprocess
    const env: Record<string, string> = {};
    if (process.env.MOONSHOT_API_KEY) {
      env['MOONSHOT_API_KEY'] = process.env.MOONSHOT_API_KEY;
    }

    // Create session with full configuration
    const session = createSession({
      workDir: config.cwd,
      model,
      thinking,
      yoloMode,
      executable,
      env,
      clientInfo: {
        name: 'continuous-agent-executive',
        version: '2.1.0',
      },
    });

    let turnCount = 0;

    try {
      // Start the turn
      const turn = session.prompt(config.prompt);

      // Iterate over the streaming events
      for await (const event of turn) {
        const normalized = normalizeWireEvent(event, turnCount);
        if (normalized) {
          if (normalized.type === 'assistant') {
            turnCount++;
          }
          yield normalized;
        }
      }

      // Get the final result
      const result = await turn.result;

      yield {
        type: 'result',
        text: `Turn completed with status: ${result.status}${result.steps ? ` (${result.steps} steps)` : ''}`,
        resultSuccess: result.status === 'finished',
        resultErrors: result.status !== 'finished'
          ? [`Turn ended with status: ${result.status}`]
          : undefined,
        raw: result,
      };
    } finally {
      // Always close the session to clean up the subprocess
      await session.close();
    }
  }

  validateAuth(): AuthValidation {
    // Kimi CLI handles its own authentication via `kimi login`.
    // We trust the local login session — no API key required.
    const apiKey = process.env.MOONSHOT_API_KEY;
    return {
      valid: true,
      method: apiKey ? 'Moonshot API Key' : 'Kimi CLI Login',
      error: null,
    };
  }
}

// ── Kimi Wire Provider with External Tools ──────────────────────

/**
 * Extended Kimi Wire provider that supports registering external tools.
 * External tools allow the agent to call back into the executive process,
 * enabling bidirectional agent-to-application communication.
 *
 * Use case: The executive can expose tools like:
 * - "check_goal_status" — agent queries current goal state
 * - "request_human_input" — agent requests human interaction
 * - "read_capability_registry" — agent reads capability scores
 * - "update_progress" — agent reports progress back to executive
 */
export interface ExternalToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  handler: (params: Record<string, unknown>) => Promise<{ output: string; message: string }>;
}

export class KimiWireAgentProviderWithTools extends KimiWireAgentProvider {
  private externalTools: ExternalToolDefinition[];

  constructor(tools: ExternalToolDefinition[] = []) {
    super();
    this.externalTools = tools;
  }

  async *spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage> {
    let KimiSDK: typeof import('@moonshot-ai/kimi-agent-sdk');
    try {
      KimiSDK = await import('@moonshot-ai/kimi-agent-sdk');
    } catch (e) {
      throw new Error(
        'Kimi Agent SDK not installed. Run: npm install @moonshot-ai/kimi-agent-sdk\n' +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const { createSession } = KimiSDK;

    // Omit model to use CLI default from ~/.config/kimi/config.toml
    const model = process.env.KIMI_MODEL || config.model || undefined;
    const executable = process.env.KIMI_EXECUTABLE || 'kimi';
    const thinking = process.env.KIMI_THINKING === 'true';
    const yoloMode = process.env.KIMI_YOLO_MODE !== 'false';

    const env: Record<string, string> = {};
    if (process.env.MOONSHOT_API_KEY) {
      env['MOONSHOT_API_KEY'] = process.env.MOONSHOT_API_KEY;
    }

    // Convert our external tool definitions to SDK format
    const sdkTools = this.externalTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      handler: tool.handler,
    }));

    const session = createSession({
      workDir: config.cwd,
      model,
      thinking,
      yoloMode,
      executable,
      env,
      externalTools: sdkTools,
      clientInfo: {
        name: 'continuous-agent-executive',
        version: '2.1.0',
      },
    });

    let turnCount = 0;

    try {
      const turn = session.prompt(config.prompt);

      for await (const event of turn) {
        const normalized = normalizeWireEvent(event, turnCount);
        if (normalized) {
          if (normalized.type === 'assistant') {
            turnCount++;
          }
          yield normalized;
        }
      }

      const result = await turn.result;

      yield {
        type: 'result',
        text: `Turn completed with status: ${result.status}${result.steps ? ` (${result.steps} steps)` : ''}`,
        resultSuccess: result.status === 'finished',
        resultErrors: result.status !== 'finished'
          ? [`Turn ended with status: ${result.status}`]
          : undefined,
        raw: result,
      };
    } finally {
      await session.close();
    }
  }
}

// ── Event Normalization ─────────────────────────────────────────

// StreamEvent from the SDK has some `unknown` payload types in its union.
// We cast the event to a loose shape for normalization.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseEvent = { type: string; payload?: any; code?: string; message?: string; raw?: string };

function normalizeWireEvent(rawEvent: unknown, turnCount: number): AgentWorkerMessage | null {
  const event = rawEvent as LooseEvent;
  const type = event.type;

  // Content events → assistant messages
  if (type === 'ContentPart' && event.payload) {
    const payload = event.payload;
    if (payload.type === 'text' && payload.text) {
      return {
        type: 'assistant',
        text: payload.text,
        raw: event,
      };
    }
    if (payload.type === 'think' && payload.think) {
      // Thinking content — useful for debugging but not primary output
      return {
        type: 'assistant',
        text: `[thinking] ${payload.think}`,
        raw: event,
      };
    }
    return null;
  }

  // Tool calls — log as assistant activity
  if (type === 'ToolCall' && event.payload) {
    const fn = event.payload.function;
    return {
      type: 'assistant',
      text: `[tool_call] ${fn?.name || 'unknown'}(${fn?.arguments?.slice(0, 200) || ''})`,
      raw: event,
    };
  }

  // Tool results — log outcomes
  if (type === 'ToolResult' && event.payload) {
    const rv = event.payload.return_value;
    const isError = rv?.is_error;
    return {
      type: 'assistant',
      text: `[tool_result] ${isError ? 'ERROR: ' : ''}${rv?.message || String(rv?.output || '').slice(0, 200)}`,
      raw: event,
    };
  }

  // Subagent events — propagate nested agent activity
  if (type === 'SubagentEvent' && event.payload) {
    const nested = event.payload.event;
    return {
      type: 'assistant',
      text: `[subagent:${event.payload.task_tool_call_id || 'unknown'}] ${JSON.stringify(nested).slice(0, 300)}`,
      raw: event,
    };
  }

  // Approval requests — in yolo mode these are auto-handled by the SDK
  if (type === 'ApprovalRequest') {
    return {
      type: 'other',
      raw: event,
    };
  }

  // Step lifecycle
  if (type === 'StepBegin') {
    return {
      type: 'other',
      text: `[step ${event.payload?.n || turnCount}] begin`,
      raw: event,
    };
  }

  // Status updates (token usage, etc.)
  if (type === 'StatusUpdate') {
    return null; // Too noisy for main output
  }

  // Parse errors from the protocol
  if (type === 'error') {
    return {
      type: 'result',
      resultSuccess: false,
      resultErrors: [`Wire protocol error: ${event.message || event.code || 'unknown'}`],
      raw: event,
    };
  }

  // All other events — pass through as 'other'
  return {
    type: 'other',
    raw: event,
  };
}
