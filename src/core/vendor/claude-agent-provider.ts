/**
 * Claude Agent SDK Provider
 *
 * Wraps the existing @anthropic-ai/claude-agent-sdk `query()` function
 * to implement the AgentWorkerProvider interface. This preserves the
 * exact existing behavior while making it swappable with other vendors.
 *
 * Also implements ChatCompletionProvider for simple LLM calls (breakdown,
 * diagnosis) using single-turn Agent SDK queries — the pre-existing approach.
 */

import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentWorkerProvider,
  AgentWorkerConfig,
  AgentWorkerMessage,
  ChatCompletionProvider,
  ChatCompletionConfig,
  ChatCompletionResult,
  AuthValidation,
} from './types.js';

// ── Agentic Worker Provider ─────────────────────────────────────

export class ClaudeAgentWorkerProvider implements AgentWorkerProvider {
  readonly vendorId = 'claude' as const;
  readonly vendorName = 'Claude Agent SDK';

  async *spawn(config: AgentWorkerConfig): AsyncIterable<AgentWorkerMessage> {
    const stream = query({
      prompt: config.prompt,
      options: {
        model: config.model,
        maxTurns: config.maxTurns,
        cwd: config.cwd,
        allowedTools: config.allowedTools,
        settingSources: (config.settingSources as ['user', 'project']) || ['user', 'project'],
      },
    });

    for await (const message of stream) {
      const msg = message as SDKMessage;
      yield normalizeClaudeMessage(msg);
    }
  }

  validateAuth(): AuthValidation {
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (oauthToken) {
      return { valid: true, method: 'OAuth Token', error: null };
    }
    if (apiKey) {
      return { valid: true, method: 'API Key', error: null };
    }
    return {
      valid: false,
      method: null,
      error: 'No Claude authentication found. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY.',
    };
  }
}

// ── Chat Completion Provider (via single-turn Agent SDK query) ──

export class ClaudeChatProvider implements ChatCompletionProvider {
  readonly vendorId = 'claude' as const;
  readonly vendorName = 'Claude Agent SDK (chat)';

  async complete(config: ChatCompletionConfig): Promise<ChatCompletionResult> {
    // Convert chat messages into a single prompt for the Agent SDK
    const prompt = config.messages
      .map(m => {
        if (m.role === 'system') return `<system>\n${m.content}\n</system>`;
        if (m.role === 'user') return m.content;
        return `<assistant>\n${m.content}\n</assistant>`;
      })
      .join('\n\n');

    const stream = query({
      prompt,
      options: {
        model: config.model,
        maxTurns: 1,
        allowedTools: [],
      },
    });

    let response = '';
    for await (const message of stream) {
      const msg = message as SDKMessage;
      if (msg.type === 'assistant') {
        if ('content' in msg && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && 'text' in block) {
              response += block.text;
            }
          }
        }
      } else if (msg.type === 'result') {
        const resultMsg = msg as SDKResultMessage;
        if (resultMsg.subtype === 'success' && 'result' in resultMsg && resultMsg.result) {
          response += String(resultMsg.result);
        }
      }
    }

    return {
      text: response,
      model: config.model,
    };
  }

  validateAuth(): AuthValidation {
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (oauthToken) return { valid: true, method: 'OAuth Token', error: null };
    if (apiKey) return { valid: true, method: 'API Key', error: null };
    return {
      valid: false,
      method: null,
      error: 'No Claude authentication found. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY.',
    };
  }
}

// ── Message Normalization ───────────────────────────────────────

function normalizeClaudeMessage(msg: SDKMessage): AgentWorkerMessage {
  if (msg.type === 'assistant') {
    const parts: string[] = [];
    if ('content' in msg && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && 'text' in block) {
          parts.push(block.text);
        } else if (block.type === 'thinking' && 'thinking' in block) {
          parts.push(`[thinking] ${(block as { thinking: string }).thinking}`);
        } else if (block.type === 'tool_use') {
          const tb = block as { name: string; input: unknown };
          parts.push(`[tool_call] ${tb.name}(${JSON.stringify(tb.input).slice(0, 200)})`);
        } else if (block.type === 'tool_result') {
          const tr = block as { content?: string; is_error?: boolean };
          parts.push(`[tool_result] ${tr.is_error ? 'ERROR: ' : ''}${(tr.content || '').slice(0, 200)}`);
        }
      }
    }
    return { type: 'assistant', text: parts.join('\n') || undefined, raw: msg };
  }

  if (msg.type === 'result') {
    const resultMsg = msg as SDKResultMessage;
    const success = resultMsg.subtype === 'success';
    let text: string | undefined;
    const errors: string[] = [];

    if (success && 'result' in resultMsg && resultMsg.result) {
      text = String(resultMsg.result);
    }
    if (!success) {
      errors.push(`Worker failed with: ${resultMsg.subtype}`);
      if ('errors' in resultMsg && Array.isArray(resultMsg.errors)) {
        errors.push(...resultMsg.errors.map(String));
      }
    }

    return {
      type: 'result',
      text,
      resultSuccess: success,
      resultErrors: errors.length > 0 ? errors : undefined,
      raw: msg,
    };
  }

  // system, user, or other message types — extract tool_result content blocks
  if (msg.type === 'user' && 'content' in msg && Array.isArray(msg.content)) {
    const parts: string[] = [];
    for (const block of msg.content) {
      if (block.type === 'tool_result') {
        const tr = block as { tool_use_id?: string; content?: string | Array<{ text?: string }>; is_error?: boolean };
        const content = typeof tr.content === 'string'
          ? tr.content
          : Array.isArray(tr.content)
            ? tr.content.map(c => c.text || '').join('')
            : '';
        parts.push(`[tool_result] ${tr.is_error ? 'ERROR: ' : ''}${content.slice(0, 500)}`);
      }
    }
    if (parts.length > 0) {
      return { type: 'assistant', text: parts.join('\n'), raw: msg };
    }
  }

  return { type: (msg.type as 'system' | 'user') || 'other', raw: msg };
}
