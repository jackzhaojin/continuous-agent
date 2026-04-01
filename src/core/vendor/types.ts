/**
 * Vendor Abstraction Types
 *
 * Defines vendor-agnostic interfaces for LLM interactions.
 * Two distinct use cases:
 *
 * 1. **Agentic Workers** — Full agent execution with tool use, file editing,
 *    code execution. Supported by Claude Agent SDK and OpenAI Codex SDK.
 *
 * 2. **Simple LLM Calls** — Text in / text out for breakdown, diagnosis, etc.
 *    Supported by any OpenAI-compatible chat API (OpenAI, Kimi K2.5, etc.)
 */

// ── Agentic Worker Provider ─────────────────────────────────────

/**
 * Configuration for spawning an agentic worker session.
 * Vendor providers translate this into their SDK-specific calls.
 */
export interface AgentWorkerConfig {
  prompt: string;
  model: string;
  maxTurns: number;
  cwd: string;
  allowedTools: string[];
  /** Claude-specific: enables skill/agent loading from filesystem */
  settingSources?: readonly string[];
}

/**
 * Streaming message from an agentic worker.
 * Normalized across vendors.
 */
export interface AgentWorkerMessage {
  type: 'assistant' | 'result' | 'system' | 'user' | 'other';
  /** Text content extracted from the message */
  text?: string;
  /** For result messages: whether execution succeeded */
  resultSuccess?: boolean;
  /** For result messages: error details */
  resultErrors?: string[];
  /** Raw vendor-specific message for logging */
  raw: unknown;
}

/**
 * Interface for agentic worker providers (Claude Agent SDK, Codex SDK).
 * These spawn autonomous agents that can use tools, edit files, run code.
 */
export interface AgentWorkerProvider {
  readonly vendorId: string;
  readonly vendorName: string;

  /**
   * Spawn an agentic worker and return an async iterable of messages.
   */
  spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage>;

  /**
   * Validate that authentication is configured for this provider.
   */
  validateAuth(): AuthValidation;
}

// ── Simple LLM Chat Provider ────────────────────────────────────

/**
 * Configuration for a simple LLM chat completion call.
 * Used for goal breakdown, diagnosis, and other non-agentic LLM tasks.
 */
export interface ChatCompletionConfig {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Result from a simple LLM chat completion.
 */
export interface ChatCompletionResult {
  text: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Interface for simple LLM chat providers.
 * These make text-in/text-out API calls (no tool use or file access).
 * Supports any OpenAI-compatible API: OpenAI, Kimi K2.5, local models, etc.
 */
export interface ChatCompletionProvider {
  readonly vendorId: string;
  readonly vendorName: string;

  /**
   * Make a chat completion call.
   */
  complete(config: ChatCompletionConfig): Promise<ChatCompletionResult>;

  /**
   * Validate that authentication is configured for this provider.
   */
  validateAuth(): AuthValidation;
}

// ── Shared Types ────────────────────────────────────────────────

export interface AuthValidation {
  valid: boolean;
  method: string | null;
  error: string | null;
}

/**
 * Supported agentic worker vendors.
 * 'claude'    = Claude Agent SDK (default)
 * 'codex'     = OpenAI Codex SDK
 * 'kimi'      = Kimi (mode determined by KIMI_MODE env: 'wire' or 'cli')
 * 'kimi-cli'  = Kimi CLI print mode (explicit per-goal override)
 * 'kimi-wire' = Kimi Wire Protocol via @moonshot-ai/kimi-agent-sdk (explicit per-goal override)
 */
export type AgentWorkerVendor = 'claude' | 'codex' | 'kimi' | 'kimi-cli' | 'kimi-wire';

/**
 * Supported chat completion vendors.
 * 'claude'   = Claude Agent SDK (single-turn query, existing behavior)
 * 'openai'   = OpenAI Chat Completions API
 * 'moonshot' = Kimi K2.5 via OpenAI-compatible API
 * 'custom'   = Any OpenAI-compatible API with custom base URL
 */
export type ChatVendor = 'claude' | 'openai' | 'moonshot' | 'custom';
