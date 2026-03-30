/**
 * Vendor Abstraction Layer
 *
 * Multi-vendor support for LLM interactions. Allows the agent to use
 * different model providers for different roles:
 *
 * - **Worker execution**: Claude Agent SDK or OpenAI Codex SDK
 * - **Chat completions**: Claude, OpenAI, Kimi K2.5, or any OpenAI-compatible API
 *
 * Configure via environment variables:
 *   WORKER_VENDOR = 'claude' | 'codex'
 *   CHAT_VENDOR   = 'claude' | 'openai' | 'moonshot' | 'custom'
 *   CHAT_MODEL    = model for chat completions
 *   LLM_BASE_URL  = custom API base URL
 *   LLM_API_KEY   = generic API key fallback
 */

// Types
export type {
  AgentWorkerConfig,
  AgentWorkerMessage,
  AgentWorkerProvider,
  ChatCompletionConfig,
  ChatCompletionResult,
  ChatCompletionProvider,
  ChatMessage,
  AuthValidation,
  AgentWorkerVendor,
  ChatVendor,
} from './types.js';

// Providers
export { ClaudeAgentWorkerProvider, ClaudeChatProvider } from './claude-agent-provider.js';
export { CodexAgentWorkerProvider } from './codex-agent-provider.js';
export { OpenAIChatProvider } from './openai-chat-provider.js';

// Registry
export {
  getAgentWorkerProvider,
  getChatCompletionProvider,
  resolveWorkerModel,
  resolveChatModel,
  validateAllVendors,
  resetProviders,
} from './vendor-registry.js';
