/**
 * Project Memory Store - DETERMINISTIC
 * Read/write/query project-memory.yml
 * Records completed projects with their capabilities, features, and lessons learned
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const MEMORY_PATH = path.join(process.cwd(), 'capabilities', 'project-memory.yml');

export interface ProjectMemoryEntry {
  id: string;
  name: string;
  category: string;
  completed: string;              // ISO date
  output_path: string;
  archive_path?: string;          // Goal bundle archive path (V1.2)
  turns?: number;
  duration_minutes?: number;
  capabilities_exercised: string[];
  features_built: string[];
  lessons: string[];
  verifier_results?: Record<string, 'PASS' | 'FAIL'>;
}

interface ProjectMemoryFile {
  projects: ProjectMemoryEntry[];
}

/**
 * Load project memory from YAML file
 */
export function loadProjectMemory(): ProjectMemoryEntry[] {
  try {
    if (!existsSync(MEMORY_PATH)) {
      return [];
    }
    const content = readFileSync(MEMORY_PATH, 'utf-8');
    const data = yaml.load(content) as ProjectMemoryFile;
    return data?.projects || [];
  } catch {
    return [];
  }
}

/**
 * Append a new project memory entry
 */
export function appendProjectMemory(entry: ProjectMemoryEntry): void {
  const projects = loadProjectMemory();

  // Check for duplicate by ID
  if (projects.some(p => p.id === entry.id)) {
    console.log(`[ProjectMemory] Entry ${entry.id} already exists, skipping`);
    return;
  }

  projects.push(entry);

  const data: ProjectMemoryFile = { projects };
  const content = yaml.dump(data, { lineWidth: 120, quotingType: '"' });
  writeFileSync(MEMORY_PATH, content, 'utf-8');
  console.log(`[ProjectMemory] Added entry: ${entry.name} (${entry.id})`);
}

/**
 * Query project memory by capability
 * Returns projects that exercised any of the given capabilities
 */
export function queryByCapabilities(capabilityIds: string[]): ProjectMemoryEntry[] {
  const projects = loadProjectMemory();
  return projects.filter(p =>
    p.capabilities_exercised.some(c => capabilityIds.includes(c))
  );
}

/**
 * Query project memory by category
 */
export function queryByCategory(category: string): ProjectMemoryEntry[] {
  const projects = loadProjectMemory();
  return projects.filter(p => p.category === category);
}

/**
 * Get lessons from matching projects
 * Deduplicates lessons across projects
 */
export function getLessonsForCapabilities(capabilityIds: string[]): string[] {
  const matchingProjects = queryByCapabilities(capabilityIds);
  const allLessons = matchingProjects.flatMap(p => p.lessons);
  // Deduplicate
  return [...new Set(allLessons)];
}

/**
 * Get lessons from matching categories
 */
export function getLessonsForCategory(category: string): string[] {
  const matchingProjects = queryByCategory(category);
  const allLessons = matchingProjects.flatMap(p => p.lessons);
  return [...new Set(allLessons)];
}

/**
 * Build a context string for the prompt builder
 * Includes relevant past projects and their lessons
 */
export function buildProjectMemoryContext(
  capabilityIds: string[],
  category?: string
): string {
  const byCapability = queryByCapabilities(capabilityIds);
  const byCategory = category ? queryByCategory(category) : [];

  // Merge and deduplicate by ID
  const seen = new Set<string>();
  const relevantProjects: ProjectMemoryEntry[] = [];

  for (const project of [...byCapability, ...byCategory]) {
    if (!seen.has(project.id)) {
      seen.add(project.id);
      relevantProjects.push(project);
    }
  }

  if (relevantProjects.length === 0) {
    return '';
  }

  // Sort by completion date (most recent first)
  relevantProjects.sort((a, b) => b.completed.localeCompare(a.completed));

  // Limit to 5 most recent
  const topProjects = relevantProjects.slice(0, 5);

  let context = '## Relevant Past Experience\n\n';
  context += 'You have successfully built similar projects before:\n\n';

  for (const project of topProjects) {
    context += `### ${project.name} (${project.completed})\n`;
    if (project.features_built.length > 0) {
      context += `- Features: ${project.features_built.join(', ')}\n`;
    }
    if (project.lessons.length > 0) {
      context += `- Lessons:\n`;
      for (const lesson of project.lessons) {
        context += `  - ${lesson}\n`;
      }
    }
    if (project.output_path) {
      context += `- Reference: Check ${project.output_path} for patterns\n`;
    }
    context += '\n';
  }

  return context;
}
