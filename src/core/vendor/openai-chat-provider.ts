/**
 * OpenAI-Compatible Chat Completion Provider
 *
 * Implements ChatCompletionProvider using the OpenAI Chat Completions API.
 * This supports ANY OpenAI-compatible API endpoint:
 *
 * - **OpenAI** (GPT-4, GPT-5, o3, etc.) — baseURL: https://api.openai.com/v1
 * - **Kimi K2.5** (Moonshot AI) — baseURL: https://api.moonshot.ai/v1
 * - **Together AI** — baseURL: https://api.together.xyz/v1
 * - **Any local/custom endpoint** — set LLM_BASE_URL
 *
 * Used for non-agentic LLM calls: goal breakdown, failure diagnosis, etc.
 * For agentic worker execution, use ClaudeAgentWorkerProvider or CodexAgentWorkerProvider.
 */

import type {
  ChatCompletionProvider,
  ChatCompletionConfig,
  ChatCompletionResult,
  AuthValidation,
  ChatVendor,
} from './types.js';

/**
 * Known vendor configurations.
 * Maps vendor IDs to their default base URLs and API key env var names.
 */
const VENDOR_DEFAULTS: Record<string, { baseUrl: string; apiKeyEnvVar: string; displayName: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    displayName: 'OpenAI',
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.ai/v1',
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    displayName: 'Moonshot AI (Kimi)',
  },
  custom: {
    baseUrl: '',  // Must be set via LLM_BASE_URL
    apiKeyEnvVar: 'LLM_API_KEY',
    displayName: 'Custom OpenAI-compatible',
  },
};

export class OpenAIChatProvider implements ChatCompletionProvider {
  readonly vendorId: ChatVendor;
  readonly vendorName: string;

  private readonly baseUrl: string;
  private readonly apiKeyEnvVar: string;

  constructor(vendor: ChatVendor = 'openai') {
    if (vendor === 'claude') {
      throw new Error('Use ClaudeChatProvider for Claude vendor, not OpenAIChatProvider.');
    }

    this.vendorId = vendor;
    const defaults = VENDOR_DEFAULTS[vendor] || VENDOR_DEFAULTS.custom;
    this.vendorName = defaults.displayName;
    this.apiKeyEnvVar = defaults.apiKeyEnvVar;

    // Allow base URL override via environment
    this.baseUrl = process.env.LLM_BASE_URL || defaults.baseUrl;

    if (!this.baseUrl) {
      throw new Error(
        `No base URL configured for vendor "${vendor}". Set LLM_BASE_URL environment variable.`
      );
    }
  }

  async complete(config: ChatCompletionConfig): Promise<ChatCompletionResult> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error(
        `No API key found for ${this.vendorName}. Set ${this.apiKeyEnvVar} or LLM_API_KEY.`
      );
    }

    // Use the OpenAI SDK if available, otherwise fall back to raw fetch
    try {
      return await this.completeWithSDK(config, apiKey);
    } catch (sdkError) {
      // If SDK import fails (not installed), use raw fetch
      if (sdkError instanceof Error && sdkError.message.includes('Cannot find module')) {
        console.log(`[${this.vendorName}] OpenAI SDK not available, using raw fetch`);
        return await this.completeWithFetch(config, apiKey);
      }
      throw sdkError;
    }
  }

  validateAuth(): AuthValidation {
    const apiKey = this.resolveApiKey();
    if (apiKey) {
      return { valid: true, method: `${this.vendorName} API Key`, error: null };
    }
    return {
      valid: false,
      method: null,
      error: `No ${this.vendorName} API key found. Set ${this.apiKeyEnvVar} or LLM_API_KEY.`,
    };
  }

  // ── Internal Methods ────────────────────────────────────────────

  private resolveApiKey(): string | undefined {
    // Check vendor-specific key first, then generic fallback
    return process.env[this.apiKeyEnvVar] || process.env.LLM_API_KEY;
  }

  private async completeWithSDK(
    config: ChatCompletionConfig,
    apiKey: string,
  ): Promise<ChatCompletionResult> {
    const OpenAIModule = await import('openai');
    const OpenAI = OpenAIModule.default || OpenAIModule.OpenAI;

    const client = new OpenAI({
      apiKey,
      baseURL: this.baseUrl,
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages: config.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: config.maxTokens || 4096,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    });

    const choice = response.choices?.[0];
    const text = choice?.message?.content || '';

    return {
      text,
      model: response.model || config.model,
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0,
      } : undefined,
    };
  }

  private async completeWithFetch(
    config: ChatCompletionConfig,
    apiKey: string,
  ): Promise<ChatCompletionResult> {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: config.model,
      messages: config.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: config.maxTokens || 4096,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.vendorName} API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content || '';

    return {
      text,
      model: data.model || config.model,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens || 0,
        outputTokens: data.usage.completion_tokens || 0,
      } : undefined,
    };
  }
}
