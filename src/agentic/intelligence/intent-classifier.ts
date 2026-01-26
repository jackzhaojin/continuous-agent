/**
 * Intent Classifier - Determines how much research/planning is needed
 *
 * Per PRD: Goals come in three forms:
 * - outcome_only: "I want to be seen as thought leader" → RESEARCH MANDATORY
 * - what_only: "Build a blog post about continuous agents" → RESEARCH MANDATORY
 * - what_and_how: "Write a post using outline in drafts/" → Can execute directly
 */

import type { WorkItem } from '../../core/types.js';

export type IntentType = 'outcome_only' | 'what_only' | 'what_and_how';

export interface IntentClassification {
  type: IntentType;
  confidence: number;
  reasoning: string;
  research_required: boolean;
  suggested_research_questions: string[];
}

/**
 * Keywords/patterns that indicate specificity level
 */
const HOW_INDICATORS = [
  // Specific technology/approach mentioned
  /using\s+(next\.?js|react|node|express|tailwind)/i,
  /with\s+(typescript|prisma|sqlite|postgres)/i,
  /in\s+(src|lib|components|pages)\//i,
  // Specific file references
  /\.(ts|tsx|js|jsx|md|json)$/i,
  // Specific commands/actions
  /npm\s+(install|run|build)/i,
  /create-next-app/i,
  // Explicit approach
  /approach:\s*\w+/i,
  /method:\s*\w+/i,
];

const WHAT_INDICATORS = [
  // Clear deliverable but no approach
  /build\s+(a|an|the)\s+\w+/i,
  /create\s+(a|an|the)\s+\w+/i,
  /implement\s+\w+/i,
  /add\s+\w+\s+(feature|functionality|capability)/i,
  /write\s+(a|an|the)\s+\w+/i,
];

const OUTCOME_INDICATORS = [
  // Pure outcomes, no specifics
  /i want to/i,
  /goal is to/i,
  /objective:\s*(be|become|achieve)/i,
  /improve\s+(my|our|the)/i,
  /enhance\s+(my|our|the)/i,
  /better\s+\w+\s+than/i,
  /increase\s+\w+/i,
];

/**
 * Classify the intent type of a work item
 */
export async function classifyIntent(item: WorkItem): Promise<IntentClassification> {
  const text = `${item.title} ${item.description || ''}`;

  // Count indicators
  const howScore = HOW_INDICATORS.filter(p => p.test(text)).length;
  const whatScore = WHAT_INDICATORS.filter(p => p.test(text)).length;
  const outcomeScore = OUTCOME_INDICATORS.filter(p => p.test(text)).length;

  // Determine type based on scores
  let type: IntentType;
  let confidence: number;
  let reasoning: string;

  if (howScore >= 2) {
    type = 'what_and_how';
    confidence = Math.min(90, 60 + howScore * 10);
    reasoning = `Found ${howScore} specific approach indicators (technology, paths, commands)`;
  } else if (whatScore >= 1 && outcomeScore === 0) {
    type = 'what_only';
    confidence = Math.min(85, 50 + whatScore * 15);
    reasoning = `Clear deliverable described but no specific approach mentioned`;
  } else if (outcomeScore >= 1) {
    type = 'outcome_only';
    confidence = Math.min(80, 40 + outcomeScore * 20);
    reasoning = `Goal describes desired outcome without specific deliverable`;
  } else if (whatScore >= 1) {
    type = 'what_only';
    confidence = 60;
    reasoning = `Deliverable mentioned but approach unclear`;
  } else {
    // Default: assume what_only for most programming tasks
    type = 'what_only';
    confidence = 50;
    reasoning = `Unable to classify clearly, defaulting to what_only`;
  }

  // Research is required for outcome_only and what_only
  const research_required = type !== 'what_and_how';

  // Generate research questions based on type
  const suggested_research_questions = generateResearchQuestions(item, type);

  return {
    type,
    confidence,
    reasoning,
    research_required,
    suggested_research_questions,
  };
}

/**
 * Generate research questions based on intent type
 */
function generateResearchQuestions(item: WorkItem, type: IntentType): string[] {
  const questions: string[] = [];
  const text = `${item.title} ${item.description || ''}`.toLowerCase();

  if (type === 'outcome_only') {
    questions.push('What specific deliverables would achieve this outcome?');
    questions.push('What are the different approaches to achieve this?');
    questions.push('What are the success criteria for this outcome?');
  }

  if (type === 'what_only' || type === 'outcome_only') {
    // Technology research
    if (text.includes('next') || text.includes('app')) {
      questions.push('What Next.js patterns are best for this use case?');
      questions.push('Should this use App Router or Pages Router?');
      questions.push('What database/state management approach fits best?');
    }

    if (text.includes('integration') || text.includes('api')) {
      questions.push('What API/integration patterns should be used?');
      questions.push('What authentication is required?');
      questions.push('Are there existing libraries/SDKs to leverage?');
    }

    if (text.includes('poc') || text.includes('proof of concept')) {
      questions.push('What is the minimum viable proof of concept?');
      questions.push('What should be proven vs mocked?');
    }

    // General research
    questions.push('What existing code patterns can be followed?');
    questions.push('What are the key risks and how to mitigate?');
  }

  return questions.slice(0, 5); // Max 5 questions
}

/**
 * Check if a task needs research phase
 */
export async function needsResearch(item: WorkItem): Promise<boolean> {
  const classification = await classifyIntent(item);
  return classification.research_required;
}
