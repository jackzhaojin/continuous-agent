/**
 * Vendor Adapter — Post-processes composed prompts for vendor-specific needs.
 *
 * Claude: Lightest prompt. SDK auto-discovers skills and CLAUDE.md.
 * Kimi (CLI/Wire): Heaviest prompt. All instructions must be inline.
 * Codex: Similar to Kimi. Prompt-only delivery.
 */

import type { AgentWorkerVendor } from '../../core/vendor/types.js';

/** Tool name mappings for non-Claude vendors */
const KIMI_TOOL_MAP: Record<string, string> = {
  'Bash': 'Shell',
  'Read': 'ReadFile',
  'Write': 'WriteFile',
  'Edit': 'StrReplaceFile',
};

const CODEX_TOOL_MAP: Record<string, string> = {
  // Codex uses its own tool naming — placeholder until investigated
  'Bash': 'shell',
  'Read': 'read_file',
  'Write': 'write_file',
  'Edit': 'apply_diff',
};

interface SkillBody {
  name: string;
  body: string;
}

interface AdaptOptions {
  /** Skill bodies to inject for non-Claude vendors */
  skillBodies?: SkillBody[];
  /** CLAUDE.md content to inject for non-Claude vendors */
  claudeMdContent?: string;
}

/**
 * Adapt a composed prompt for a specific vendor.
 *
 * - Claude: Returns prompt as-is (SDK auto-provides skills + CLAUDE.md)
 * - Kimi/Codex: Injects skill bodies, CLAUDE.md content, and tool name mappings
 */
export function adaptPromptForVendor(
  prompt: string,
  vendor: AgentWorkerVendor,
  options?: AdaptOptions,
): string {
  // Claude: SDK auto-discovers skills and CLAUDE.md — lightweight prompt
  if (vendor === 'claude') {
    return prompt;
  }

  const sections: string[] = [prompt];

  // Inject skill bodies for non-Claude vendors
  if (options?.skillBodies && options.skillBodies.length > 0) {
    for (const skill of options.skillBodies) {
      sections.push(`---\n\n## Worker Skill: ${skill.name}\n\n${skill.body.trim()}`);
    }
  }

  // Inject CLAUDE.md content for non-Claude vendors
  if (options?.claudeMdContent) {
    sections.push(`---\n\n## Project Context (from CLAUDE.md)\n\n${options.claudeMdContent.trim()}`);
  }

  // Apply tool name mappings
  const toolMap = getToolMap(vendor);
  if (toolMap) {
    const mappingLines = Object.entries(toolMap)
      .map(([from, to]) => `- Instead of "${from}", use "${to}"`)
      .join('\n');

    sections.push(`---\n\n## Tool Name Mappings\n\nIn this environment, use these tool names:\n${mappingLines}`);

    // Also translate any tool references in the prompt itself
    let adapted = sections.join('\n\n');
    for (const [from, to] of Object.entries(toolMap)) {
      // Replace backtick-quoted tool references: `Bash` -> `Shell`
      adapted = adapted.replace(new RegExp('`' + from + '`', 'g'), '`' + to + '`');
    }
    return adapted;
  }

  return sections.join('\n\n');
}

/**
 * Get the tool name mapping for a vendor, or null if none needed.
 */
function getToolMap(vendor: AgentWorkerVendor): Record<string, string> | null {
  switch (vendor) {
    case 'kimi':
    case 'kimi-cli':
    case 'kimi-wire':
      return KIMI_TOOL_MAP;
    case 'codex':
      return CODEX_TOOL_MAP;
    default:
      return null;
  }
}
