/**
 * Vendor Registry - Resolves provider instances based on environment configuration
 *
 * Environment variables:
 *   WORKER_VENDOR  = 'claude' | 'codex'        (default: 'claude')
 *   CHAT_VENDOR    = 'claude' | 'openai' | 'moonshot' | 'custom' (default: 'claude')
 *   CHAT_MODEL     = model name for chat completions (overrides MODEL for chat calls)
 *   LLM_BASE_URL   = custom base URL for OpenAI-compatible APIs
 *   LLM_API_KEY    = generic API key fallback
 *   MODEL          = default model (backward compatible, used by worker + chat)
 *
 * Vendor-specific API keys:
 *   OPENAI_API_KEY    = OpenAI / Codex
 *   MOONSHOT_API_KEY  = Kimi K2.5 (Moonshot AI)
 *   CODEX_API_KEY     = OpenAI Codex (falls back to OPENAI_API_KEY)
 *
 * Examples:
 *   # Use Claude for workers, Kimi K2.5 for breakdown/diagnosis:
 *   WORKER_VENDOR=claude
 *   CHAT_VENDOR=moonshot
 *   CHAT_MODEL=kimi-k2.5
 *   MOONSHOT_API_KEY=sk-...
 *
 *   # Use Codex for workers, OpenAI for breakdown/diagnosis:
 *   WORKER_VENDOR=codex
 *   CHAT_VENDOR=openai
 *   CHAT_MODEL=gpt-4o
 *   OPENAI_API_KEY=sk-...
 *
 *   # Use Kimi Wire for workers (bidirectional), Kimi for chat:
 *   WORKER_VENDOR=kimi
 *   KIMI_MODE=wire              # 'wire' (default, SDK) or 'cli' (--print stream-json)
 *   CHAT_VENDOR=moonshot
 *   CHAT_MODEL=kimi-k2.5
 *   MOONSHOT_API_KEY=sk-...
 *
 *   # All Claude (existing behavior, no config needed):
 *   MODEL=claude-sonnet-4-5
 */

import type {
  AgentWorkerProvider,
  ChatCompletionProvider,
  AgentWorkerVendor,
  ChatVendor,
} from './types.js';
import { ClaudeAgentWorkerProvider, ClaudeChatProvider } from './claude-agent-provider.js';
import { CodexAgentWorkerProvider } from './codex-agent-provider.js';
import { KimiWireAgentProvider } from './kimi-wire-provider.js';
import { KimiCliAgentProvider } from './kimi-cli-provider.js';
import { OpenAIChatProvider } from './openai-chat-provider.js';

// ── Singleton Instances (lazy-initialized) ──────────────────────

let _agentProvider: AgentWorkerProvider | null = null;
let _chatProvider: ChatCompletionProvider | null = null;

/**
 * Get the configured agentic worker provider.
 * Reads WORKER_VENDOR env var on first call and caches the instance.
 */
export function getAgentWorkerProvider(): AgentWorkerProvider {
  if (!_agentProvider) {
    const vendor = (process.env.WORKER_VENDOR || 'claude') as AgentWorkerVendor;
    _agentProvider = createAgentWorkerProvider(vendor);
    console.log(`[Vendor] Agent worker provider: ${_agentProvider.vendorName} (${_agentProvider.vendorId})`);
  }
  return _agentProvider;
}

/**
 * Get the configured chat completion provider.
 * Reads CHAT_VENDOR env var on first call and caches the instance.
 */
export function getChatCompletionProvider(): ChatCompletionProvider {
  if (!_chatProvider) {
    const vendor = (process.env.CHAT_VENDOR || 'claude') as ChatVendor;
    _chatProvider = createChatCompletionProvider(vendor);
    console.log(`[Vendor] Chat completion provider: ${_chatProvider.vendorName} (${_chatProvider.vendorId})`);
  }
  return _chatProvider;
}

/**
 * Resolve the model name for worker execution.
 * Checks MODEL env var with vendor-appropriate defaults.
 */
export function resolveWorkerModel(): string {
  const vendor = (process.env.WORKER_VENDOR || 'claude') as AgentWorkerVendor;
  const model = process.env.MODEL;

  if (model) return model;

  // Vendor-specific defaults
  switch (vendor) {
    case 'codex':
      return ''; // Let Codex CLI use its default (ChatGPT auth doesn't support all models)
    case 'kimi':
      return ''; // Let kimi CLI use its configured default model
    case 'claude':
    default:
      return 'claude-sonnet-4-5';
  }
}

/**
 * Resolve the model name for chat completion (breakdown, diagnosis).
 * CHAT_MODEL takes precedence over BREAKDOWN_MODEL and MODEL.
 */
export function resolveChatModel(overrideEnvVar?: string): string {
  // Allow caller-specific override (e.g., BREAKDOWN_MODEL)
  if (overrideEnvVar && process.env[overrideEnvVar]) {
    return process.env[overrideEnvVar]!;
  }

  const chatModel = process.env.CHAT_MODEL;
  if (chatModel) return chatModel;

  const model = process.env.MODEL;
  if (model) return model;

  // Vendor-specific defaults
  const vendor = (process.env.CHAT_VENDOR || 'claude') as ChatVendor;
  switch (vendor) {
    case 'openai':
      return 'gpt-4o';
    case 'moonshot':
      return 'kimi-k2.5';
    case 'custom':
      return 'default';  // Custom endpoints must configure CHAT_MODEL
    case 'claude':
    default:
      return 'claude-sonnet-4-5';
  }
}

/**
 * Validate authentication for all configured vendors.
 * Returns an overall status and individual vendor results.
 */
export function validateAllVendors(): {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  results: Array<{ vendor: string; role: string; valid: boolean; error?: string }>;
} {
  const agent = getAgentWorkerProvider();
  const chat = getChatCompletionProvider();

  const agentAuth = agent.validateAuth();
  const chatAuth = chat.validateAuth();

  const results = [
    { vendor: agent.vendorId, role: 'worker', valid: agentAuth.valid, error: agentAuth.error || undefined },
    { vendor: chat.vendorId, role: 'chat', valid: chatAuth.valid, error: chatAuth.error || undefined },
  ];

  // Deduplicate if same vendor for both roles
  const deduped = results.filter((r, i, arr) =>
    i === arr.findIndex(x => x.vendor === r.vendor)
  );

  const allValid = deduped.every(r => r.valid);
  const anyValid = deduped.some(r => r.valid);

  return {
    overall: allValid ? 'healthy' : anyValid ? 'degraded' : 'unhealthy',
    results: deduped,
  };
}

/**
 * Get a worker provider for a specific vendor, bypassing the cached singleton.
 * Used for per-goal vendor overrides from PROMPT.md frontmatter.
 * Priority: goalVendor > WORKER_VENDOR env > 'claude' default.
 */
export function getAgentWorkerProviderForVendor(goalVendor?: AgentWorkerVendor): AgentWorkerProvider {
  if (goalVendor) {
    const provider = createAgentWorkerProvider(goalVendor);
    console.log(`[Vendor] Per-goal worker provider: ${provider.vendorName} (${provider.vendorId})`);
    return provider;
  }
  // Fall back to the cached global provider
  return getAgentWorkerProvider();
}

/**
 * Resolve the model name for a specific vendor.
 * Used alongside per-goal vendor overrides.
 */
export function resolveWorkerModelForVendor(goalVendor?: AgentWorkerVendor): string {
  const vendor = goalVendor || (process.env.WORKER_VENDOR || 'claude') as AgentWorkerVendor;

  switch (vendor) {
    case 'codex':
      return ''; // Let Codex CLI use its default — MODEL env is Claude-specific
    case 'kimi':
    case 'kimi-cli':
    case 'kimi-wire':
      return ''; // Let kimi CLI use its configured default — MODEL env is Claude-specific
    case 'claude':
    default:
      return process.env.MODEL || 'claude-sonnet-4-5';
  }
}

/**
 * Reset cached providers (useful for testing or config changes).
 */
export function resetProviders(): void {
  _agentProvider = null;
  _chatProvider = null;
}

// ── Factory Functions ───────────────────────────────────────────

function createAgentWorkerProvider(vendor: AgentWorkerVendor): AgentWorkerProvider {
  switch (vendor) {
    case 'codex':
      return new CodexAgentWorkerProvider();
    case 'kimi-cli':
      return new KimiCliAgentProvider();
    case 'kimi-wire':
      return new KimiWireAgentProvider();
    case 'kimi': {
      const kimiMode = process.env.KIMI_MODE || 'wire';
      if (kimiMode === 'cli') {
        return new KimiCliAgentProvider();
      }
      return new KimiWireAgentProvider();
    }
    case 'claude':
    default:
      return new ClaudeAgentWorkerProvider();
  }
}

function createChatCompletionProvider(vendor: ChatVendor): ChatCompletionProvider {
  switch (vendor) {
    case 'openai':
    case 'moonshot':
    case 'custom':
      return new OpenAIChatProvider(vendor);
    case 'claude':
    default:
      return new ClaudeChatProvider();
  }
}
