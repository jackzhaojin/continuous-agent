/**
 * Skill Prompt Loader
 *
 * Loads executive skill prompts from .claude/skills/ and renders
 * {{VARIABLE}} placeholders. This is how the executive agent's
 * agentic decisions (email triage, diagnosis, breakdown) get their
 * prompts — from versioned skill files, not hardcoded TypeScript strings.
 *
 * Uses the executive agent's CWD (continuous-agent/) to resolve
 * the .claude/ directory, ensuring skills are always loaded from
 * the agent codebase regardless of where workers run.
 */

import fs from 'fs/promises';
import path from 'path';
import { log } from '../../core/logging.js';

// Executive agent's .claude/ directory — always relative to the agent codebase root
const AGENT_ROOT = process.env.AGENT_PATH || process.cwd();
const SKILLS_DIR = path.join(AGENT_ROOT, '.claude', 'skills');

/**
 * Load a skill prompt from .claude/skills/{skillName}/SKILL.md,
 * strip the YAML frontmatter, and render {{VARIABLE}} placeholders.
 *
 * @param skillName - Directory name under .claude/skills/ (e.g. 'email-triage')
 * @param variables - Key-value pairs to substitute for {{KEY}} placeholders
 * @returns Rendered prompt string ready for ChatCompletionProvider
 */
export async function loadSkillPrompt(
  skillName: string,
  variables: Record<string, string> = {},
): Promise<string> {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');

  let raw: string;
  try {
    raw = await fs.readFile(skillPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Executive skill not found: .claude/skills/${skillName}/SKILL.md (resolved: ${skillPath})`,
      );
    }
    throw error;
  }

  // Strip YAML frontmatter (--- ... ---)
  const content = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();

  // Render variables
  let rendered = content;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  log(`  [SKILL] Loaded .claude/skills/${skillName}/SKILL.md (${rendered.length} chars)`);
  return rendered;
}
