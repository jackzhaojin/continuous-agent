import type { ExecutionPattern } from '../core/types.js';

export type LibraryValidationSeverity = 'warning' | 'error';

export interface LibraryValidationIssue {
  severity: LibraryValidationSeverity;
  code: string;
  message: string;
  filePath: string;
}

export interface TrackRecord {
  total_executions: number;
  successes: number;
  failures: number;
  last_executed: string | null;
  confidence: number;
  maturity: string;
}

export interface SkillDefinition {
  name: string;
  version: string;
  category: 'skill';
  description: string;
  use_cases: string[];
  tools_required: string[];
  setup: string[];
  tags: string[];
  track_record: TrackRecord;
  source_path: string;
  body: string;
}

export interface PlaybookDefinition {
  name: string;
  version: string;
  category: 'executive' | 'worker' | 'domain' | 'pipeline';
  description: string;
  goal: string;
  context_requires: Array<Record<string, string>>;
  context_optional: Array<Record<string, string>>;
  composes_skills: string[];
  composes_playbooks: string[];
  execution_pattern: ExecutionPattern;
  tags: string[];
  track_record: TrackRecord;
  source_path: string;
  body: string;
}

export interface SkillLibraryResult {
  skills: SkillDefinition[];
  warnings: LibraryValidationIssue[];
}

export interface PlaybookLibraryResult {
  playbooks: PlaybookDefinition[];
  warnings: LibraryValidationIssue[];
}

export interface LoaderOptions {
  strict?: boolean;
}
