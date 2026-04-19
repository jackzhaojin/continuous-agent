/**
 * Vendor Adapter — Post-processes composed prompts for vendor-specific needs.
 *
 * Claude: Lightest prompt. SDK auto-discovers skills and CLAUDE.md.
 * Kimi (CLI/Wire): Heaviest prompt. All instructions must be inline.
 * Codex: Similar to Kimi. Prompt-only delivery.
 */

import type { AgentWorkerVendor } from '../../core/vendor/types.js';

/** Tool name mappings for non-Claude vendors */
export const KIMI_TOOL_MAP: Record<string, string> = {
  'Bash': 'Shell',
  'Read': 'ReadFile',
  'Write': 'WriteFile',
  'Edit': 'StrReplaceFile',
};

export const CODEX_TOOL_MAP: Record<string, string> = {
  // Codex uses its own tool naming — placeholder until investigated
  'Bash': 'shell',
  'Read': 'read_file',
  'Write': 'write_file',
  'Edit': 'apply_diff',
};

/**
 * Translate a list of Claude-native tool names to the vendor's native names.
 * Returns the original array unchanged if the vendor has no mapping.
 * Tools not in the map pass through as-is.
 */
export function mapToolNames(tools: string[], vendor: AgentWorkerVendor): string[] {
  const toolMap = getToolMap(vendor);
  if (!toolMap) return tools;
  return tools.map((t) => toolMap[t] ?? t);
}

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
 * v2.4 A4 — extra preamble injected for Kimi variants. Kimi K2.5 in
 * particular has weak adherence to structured output without explicit
 * emphasis. Documentation-adherence cue goes at the TOP so the model
 * sees it before the main prompt body.
 */
const KIMI_DOC_ADHERENCE_PREAMBLE = `## Documentation Adherence (read before anything else)

You are running inside an autonomous multi-worker pipeline. Three hard rules:

1. **Structured handoff YAML is REQUIRED.** End your response with a fenced \`\`\`yaml block matching the schema under "Structured Handoff" in worker-base. Skip it and the downstream validator has no evidence your work is real — the step is rejected and the defect subtask counts against the retry budget.
2. **Read the Prior Step Handoff section verbatim.** Do not paraphrase it, do not assume — quote back the specific \`what_connects\` fact you are building on.
3. **Tool name mappings below are binding.** Use ReadFile, WriteFile, Shell, StrReplaceFile — not Read, Write, Bash, Edit. The harness will reject tool calls with the wrong name.

The next sections are your actual task. Apply these three rules to every step.

---

`;

/**
 * v2.4 A6 — HOW-phase cue for Codex. Codex tends to stream code before
 * planning; this preamble nudges it toward concrete action ordering.
 */
const CODEX_HOW_PHASE_PREAMBLE = `## HOW Phase (your contract with this step)

Before you write code:

1. Quote the Prior Step Handoff's \`what_connects\` and \`next_step_should_know\` so we both know you read them.
2. List the files you intend to touch and the exact command sequence you will run (npm run dev, curl, npx playwright, git add/commit). Be concrete — "start the dev server" is not a command.
3. Call out the single verification you will run last: the curl, the playwright journey block, the integration gate. That verification is the definition of done for this step.

Then execute the plan. Do not skip ahead, do not rewrite unrelated files. When you are finished, emit the structured handoff YAML block — it is mandatory.

---

`;

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

  // Vendor-specific preambles prepended BEFORE the main prompt so the model
  // sees them first. Kimi gets a documentation-adherence nudge; Codex gets a
  // HOW-phase structure nudge. Both address weaknesses surfaced in v2.2 runs.
  let prefixed = prompt;
  if (vendor === 'kimi' || vendor === 'kimi-cli' || vendor === 'kimi-wire') {
    prefixed = KIMI_DOC_ADHERENCE_PREAMBLE + prompt;
  } else if (vendor === 'codex') {
    prefixed = CODEX_HOW_PHASE_PREAMBLE + prompt;
  }

  const sections: string[] = [prefixed];

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
export function getToolMap(vendor: AgentWorkerVendor): Record<string, string> | null {
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
