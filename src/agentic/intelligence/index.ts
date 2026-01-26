/**
 * Intelligence Module
 *
 * Provides the "smart" layer for the executive agent:
 * - Intent classification (what kind of goal is this?)
 * - Strategy selection (how should we approach it?)
 * - Prompt building (how do we communicate with workers?)
 */

export { classifyIntent, needsResearch, type IntentType, type IntentClassification } from './intent-classifier.js';
export { selectStrategy, getStrategyGuidance, recordStrategyAttempt, type Strategy, type StrategySelection } from './strategy-selector.js';
export { buildIntelligentPrompt, buildSimplePrompt } from './prompt-builder.js';
