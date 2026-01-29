/**
 * Project Registry - DETERMINISTIC
 * Tracks completed projects that can be reused as source material
 * V1.2: Enables multi-project access for workers
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const REGISTRY_PATH = path.join(process.cwd(), 'workspace', 'project-registry.yml');

export interface ProjectRegistryEntry {
  slug: string;
  title: string;
  output_path: string;
  completed: string;           // ISO date
  category: string;
  capabilities: string[];
  reusable: boolean;
  tags?: string[];
}

interface ProjectRegistryFile {
  projects: ProjectRegistryEntry[];
}

/**
 * Load all projects from the registry
 */
export function loadProjectRegistry(): ProjectRegistryEntry[] {
  try {
    if (!existsSync(REGISTRY_PATH)) {
      return [];
    }
    const content = readFileSync(REGISTRY_PATH, 'utf-8');
    const data = yaml.load(content) as ProjectRegistryFile;
    return data?.projects || [];
  } catch {
    return [];
  }
}

/**
 * Register a completed project
 * Skips if slug already exists
 */
export function registerProject(entry: ProjectRegistryEntry): void {
  const projects = loadProjectRegistry();

  // Check for duplicate by slug
  if (projects.some(p => p.slug === entry.slug)) {
    console.log(`[ProjectRegistry] Project ${entry.slug} already registered, skipping`);
    return;
  }

  projects.push(entry);

  const data: ProjectRegistryFile = { projects };
  const content = yaml.dump(data, { lineWidth: 120, quotingType: '"' });
  writeFileSync(REGISTRY_PATH, content, 'utf-8');
  console.log(`[ProjectRegistry] Registered project: ${entry.title} (${entry.slug})`);
}

/**
 * Find a project by slug
 */
export function findProjectBySlug(slug: string): ProjectRegistryEntry | null {
  const projects = loadProjectRegistry();
  return projects.find(p => p.slug === slug) || null;
}

/**
 * Find projects by category
 */
export function findProjectsByCategory(category: string): ProjectRegistryEntry[] {
  const projects = loadProjectRegistry();
  return projects.filter(p => p.category === category && p.reusable);
}

/**
 * Find projects by capability
 */
export function findProjectsByCapability(capability: string): ProjectRegistryEntry[] {
  const projects = loadProjectRegistry();
  return projects.filter(p => p.capabilities.includes(capability) && p.reusable);
}

/**
 * Find best source project for a given task
 * Returns the most recently completed reusable project matching the category
 */
export function findBestSourceProject(
  category: string,
  capabilities: string[] = []
): ProjectRegistryEntry | null {
  const projects = loadProjectRegistry();

  // Score projects by match quality
  const scored = projects
    .filter(p => p.reusable)
    .map(p => {
      let score = 0;
      // Category match
      if (p.category === category) score += 10;
      // Capability matches
      for (const cap of capabilities) {
        if (p.capabilities.includes(cap)) score += 5;
      }
      // Recency bonus (newer = better)
      const daysSince = (Date.now() - new Date(p.completed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) score += 3;
      else if (daysSince < 30) score += 1;

      return { project: p, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].project : null;
}

/**
 * Generate a slug from a task title
 */
export function generateProjectSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[self-enhance\]\s*/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
