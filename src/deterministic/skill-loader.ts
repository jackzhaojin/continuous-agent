import path from 'path';
import { logDeterministic } from '../core/logging.js';
import {
  findSkillMarkdownFiles,
  parseSkillMarkdown,
  toStringArray,
  toStringValue,
} from './library-frontmatter-parser.js';
import type {
  LoaderOptions,
  LibraryValidationIssue,
  SkillDefinition,
  SkillLibraryResult,
  TrackRecord,
} from './library-loader-types.js';

const SKILL_FORBIDDEN_FIELDS = ['context_requires', 'composes_skills', 'composes_playbooks', 'goal', 'execution_pattern'];

function normalizeTrackRecord(value: unknown): TrackRecord {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  return {
    total_executions: Number(record.total_executions ?? 0),
    successes: Number(record.successes ?? 0),
    failures: Number(record.failures ?? 0),
    last_executed: typeof record.last_executed === 'string' ? record.last_executed : null,
    confidence: Number(record.confidence ?? 0),
    maturity: toStringValue(record.maturity, 'Declared'),
  };
}

function createWarning(filePath: string, code: string, message: string): LibraryValidationIssue {
  return { severity: 'warning', code, message, filePath };
}

export async function loadSkillLibrary(rootDir = path.join(process.cwd(), 'skills'), options: LoaderOptions = {}): Promise<SkillLibraryResult> {
  const warnings: LibraryValidationIssue[] = [];
  const skills: SkillDefinition[] = [];

  let files: string[] = [];
  try {
    files = await findSkillMarkdownFiles(rootDir);
  } catch {
    return { skills: [], warnings: [createWarning(rootDir, 'SKILL_DISCOVERY_FAILED', 'Unable to discover skill files.')] };
  }

  for (const filePath of files) {
    try {
      const doc = await parseSkillMarkdown(filePath);
      const fm = doc.frontmatter;

      const forbidden = SKILL_FORBIDDEN_FIELDS.filter((field) => field in fm);
      if (forbidden.length > 0) {
        warnings.push(
          createWarning(
            filePath,
            'SKILL_FORBIDDEN_FIELDS',
            `Skill contains playbook-only fields: ${forbidden.join(', ')}. Skipping file.`
          )
        );
        continue;
      }

      // Accept category from top-level (legacy) or metadata.category (Agent Skills spec)
      const metadata = (fm.metadata && typeof fm.metadata === 'object') ? fm.metadata as Record<string, unknown> : {};
      const category = toStringValue(fm.category) || toStringValue(metadata.category, 'skill');
      if (category !== 'skill') {
        warnings.push(createWarning(filePath, 'SKILL_CATEGORY_INVALID', `Expected category "skill" but got "${category}". Skipping file.`));
        continue;
      }

      const name = toStringValue(fm.name);
      if (!name) {
        warnings.push(createWarning(filePath, 'SKILL_NAME_MISSING', 'Skill is missing required "name" field. Skipping file.'));
        continue;
      }

      const skill: SkillDefinition = {
        name,
        version: toStringValue(fm.version, '0.1.0'),
        category: 'skill',
        description: toStringValue(fm.description),
        use_cases: toStringArray(fm.use_cases),
        tools_required: toStringArray(fm.tools_required),
        setup: toStringArray(fm.setup),
        tags: toStringArray(fm.tags),
        track_record: normalizeTrackRecord(fm.track_record),
        source_path: filePath,
        body: doc.body,
      };

      skills.push(skill);
    } catch (error) {
      warnings.push(
        createWarning(
          filePath,
          'SKILL_PARSE_FAILED',
          `Failed to parse skill file: ${error instanceof Error ? error.message : String(error)}. Skipping file.`
        )
      );
    }
  }

  warnings.forEach((warning) => {
    logDeterministic(`[skill-loader] ${warning.code} - ${warning.message} (${warning.filePath})`);
  });

  if (options.strict && warnings.length > 0) {
    throw new Error(`Strict skill loading failed with ${warnings.length} warning(s).`);
  }

  return { skills, warnings };
}
