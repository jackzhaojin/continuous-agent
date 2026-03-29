import path from 'path';
import { logDeterministic } from '../core/logging.js';
import type { ExecutionPattern } from '../core/types.js';
import {
  findSkillMarkdownFiles,
  parseSkillMarkdown,
  toStringArray,
  toStringValue,
} from './library-frontmatter-parser.js';
import type {
  LoaderOptions,
  LibraryValidationIssue,
  PlaybookDefinition,
  PlaybookLibraryResult,
  TrackRecord,
} from './library-loader-types.js';

const ALLOWED_PATTERNS: ExecutionPattern[] = [
  'plan-then-execute',
  'loop-until-progress',
  'plan-mode',
  'deterministic-pipeline',
];

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

function normalizeExecutionPattern(value: unknown): ExecutionPattern {
  if (typeof value === 'string' && ALLOWED_PATTERNS.includes(value as ExecutionPattern)) {
    return value as ExecutionPattern;
  }
  return 'plan-then-execute';
}

export async function loadPlaybookLibrary(
  rootDir = path.join(process.cwd(), 'playbooks'),
  options: LoaderOptions = {}
): Promise<PlaybookLibraryResult> {
  const warnings: LibraryValidationIssue[] = [];
  const playbooks: PlaybookDefinition[] = [];

  let files: string[] = [];
  try {
    files = await findSkillMarkdownFiles(rootDir);
  } catch {
    return { playbooks: [], warnings: [createWarning(rootDir, 'PLAYBOOK_DISCOVERY_FAILED', 'Unable to discover playbook files.')] };
  }

  for (const filePath of files) {
    try {
      const doc = await parseSkillMarkdown(filePath);
      const fm = doc.frontmatter;

      const category = toStringValue(fm.category, 'playbook');
      if (category !== 'playbook') {
        warnings.push(
          createWarning(filePath, 'PLAYBOOK_CATEGORY_INVALID', `Expected category "playbook" but got "${category}". Skipping file.`)
        );
        continue;
      }

      const name = toStringValue(fm.name);
      if (!name) {
        warnings.push(createWarning(filePath, 'PLAYBOOK_NAME_MISSING', 'Playbook is missing required "name" field. Skipping file.'));
        continue;
      }

      const playbook: PlaybookDefinition = {
        name,
        version: toStringValue(fm.version, '0.1.0'),
        category: 'playbook',
        description: toStringValue(fm.description),
        goal: toStringValue(fm.goal),
        context_requires: toStringArray(fm.context_requires),
        composes_skills: toStringArray(fm.composes_skills),
        composes_playbooks: toStringArray(fm.composes_playbooks),
        execution_pattern: normalizeExecutionPattern(fm.execution_pattern),
        tags: toStringArray(fm.tags),
        track_record: normalizeTrackRecord(fm.track_record),
        source_path: filePath,
        body: doc.body,
      };

      playbooks.push(playbook);
    } catch (error) {
      warnings.push(
        createWarning(
          filePath,
          'PLAYBOOK_PARSE_FAILED',
          `Failed to parse playbook file: ${error instanceof Error ? error.message : String(error)}. Skipping file.`
        )
      );
    }
  }

  warnings.forEach((warning) => {
    logDeterministic(`[playbook-loader] ${warning.code} - ${warning.message} (${warning.filePath})`);
  });

  if (options.strict && warnings.length > 0) {
    throw new Error(`Strict playbook loading failed with ${warnings.length} warning(s).`);
  }

  return { playbooks, warnings };
}
