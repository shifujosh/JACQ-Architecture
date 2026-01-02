/**
 * Memory Staging Policies
 *
 * Handles fact lifecycle:
 * - Promotion: staged -> confirmed after N accesses
 * - Decay: reduce relevance for old, unused facts
 * - Cleanup: retract facts that decay below threshold
 */

import type { Fact, FactSource } from './schema';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Staging policy configuration.
 * These values are tunable based on use case.
 */
export const StagingConfig = {
  /**
   * Number of accesses required to promote a staged fact to confirmed.
   * Lower = faster validation, but more hallucination risk.
   * Higher = more validation, but slower memory building.
   */
  PROMOTION_THRESHOLD: 3,

  /**
   * Days since last access before decay starts.
   * Facts accessed within this window maintain full relevance.
   */
  DECAY_GRACE_PERIOD_DAYS: 7,

  /**
   * Weekly decay rate (0.95 = 5% decay per week).
   * Lower = faster forgetting.
   */
  DECAY_RATE: 0.95,

  /**
   * Relevance score below which facts are candidates for cleanup.
   * Range: 0.0 - 1.0
   */
  CLEANUP_THRESHOLD: 0.2,

  /**
   * Minimum accesses to protect a confirmed fact from cleanup.
   * High-usage facts are never cleaned up.
   */
  MIN_ACCESS_PROTECTION: 5,
} as const;

/**
 * Source weights for relevance calculation.
 * Higher weight = more trusted source.
 */
export const SourceWeights: Record<FactSource, number> = {
  user_edit: 2.0,    // Highest trust: explicit user correction
  file: 1.5,         // High trust: static document content
  system: 1.2,       // Medium trust: system-generated metadata
  conversation: 1.0, // Baseline trust: inferred from chat
};

// ============================================================================
// Policy Functions
// ============================================================================

/**
 * Check if a fact should be promoted from staged to confirmed.
 * Promotion occurs when accessCount >= PROMOTION_THRESHOLD.
 */
export function shouldPromote(fact: Fact): boolean {
  if (fact.status !== 'staged') {
    return false;
  }
  return fact.accessCount >= StagingConfig.PROMOTION_THRESHOLD;
}

/**
 * Calculate the effective relevance score for a fact.
 * Applies temporal decay based on last access time.
 *
 * Formula:
 *   relevance = confidence * source_weight * decay_factor * usage_boost
 *
 * Example:
 *   - Fact with confidence 0.9, from conversation, 3 weeks old, 5 accesses
 *   - source_weight = 1.0
 *   - decay_factor = 0.95^2 = 0.9025 (2 weeks past grace period)
 *   - usage_boost = 1 + log10(6) * 0.5 = 1.39
 *   - relevance = 0.9 * 1.0 * 0.9025 * 1.39 = 1.13
 */
export function calculateRelevance(fact: Fact): number {
  const now = new Date();
  const lastAccessed = fact.lastAccessed
    ? new Date(fact.lastAccessed)
    : new Date(fact.timestamp);

  const daysSinceAccess = Math.floor(
    (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 1. Source Weighting
  const sourceWeight = SourceWeights[fact.source] ?? 1.0;

  // 2. Temporal Decay (Exponential)
  // No decay within grace period
  let decayFactor = 1.0;
  if (daysSinceAccess > StagingConfig.DECAY_GRACE_PERIOD_DAYS) {
    const decayDays = daysSinceAccess - StagingConfig.DECAY_GRACE_PERIOD_DAYS;
    const decayWeeks = decayDays / 7;
    decayFactor = Math.pow(StagingConfig.DECAY_RATE, decayWeeks);
  }

  // 3. Usage Boost (Logarithmic, mild)
  // ln(1) = 0, log10(2) = 0.3, log10(10) = 1
  // This gives a boost from 1.0 to ~1.5 for frequently accessed facts
  const usageBoost = 1 + Math.log10(fact.accessCount + 1) * 0.5;

  // 4. Status Weight (confirmed facts get a small boost)
  const statusWeight = fact.status === 'confirmed' ? 1.1 : 1.0;

  return fact.confidence * sourceWeight * decayFactor * usageBoost * statusWeight;
}

/**
 * Check if a fact is a candidate for cleanup (retraction).
 * Facts are protected if they have high access counts or confirmed status
 * with sufficient usage.
 */
export function shouldCleanup(fact: Fact): boolean {
  // Never cleanup confirmed facts with high usage
  if (
    fact.status === 'confirmed' &&
    fact.accessCount >= StagingConfig.MIN_ACCESS_PROTECTION
  ) {
    return false;
  }

  // Already retracted or superseded - skip
  if (fact.status === 'retracted' || fact.status === 'superseded') {
    return false;
  }

  // Calculate effective relevance
  const relevance = calculateRelevance(fact);

  return relevance < StagingConfig.CLEANUP_THRESHOLD;
}

/**
 * Possible actions from staging policy evaluation.
 */
export type StagingAction = 'promote' | 'cleanup' | 'none';

/**
 * Determine the next action for a fact based on its current state.
 */
export function determineStagingAction(fact: Fact): StagingAction {
  if (shouldPromote(fact)) return 'promote';
  if (shouldCleanup(fact)) return 'cleanup';
  return 'none';
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process a list of facts and return recommended actions.
 * Does not modify facts - returns action recommendations.
 *
 * @param facts - Array of facts to evaluate
 * @returns Map of fact ID -> recommended action
 */
export function processStagingBatch(facts: Fact[]): Map<string, StagingAction> {
  const actions = new Map<string, StagingAction>();

  for (const fact of facts) {
    const action = determineStagingAction(fact);
    if (action !== 'none') {
      actions.set(fact.id, action);
    }
  }

  return actions;
}

/**
 * Get facts that need promotion.
 */
export function getFactsToPromote(facts: Fact[]): Fact[] {
  return facts.filter(shouldPromote);
}

/**
 * Get facts that are candidates for cleanup.
 */
export function getFactsToCleanup(facts: Fact[]): Fact[] {
  return facts.filter(shouldCleanup);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Format a fact's staging status for logging/debugging.
 */
export function formatFactStatus(fact: Fact): string {
  const relevance = calculateRelevance(fact).toFixed(2);
  const lastAccess = fact.lastAccessed
    ? new Date(fact.lastAccessed).toLocaleDateString()
    : 'never';

  return `[${fact.status}] ${fact.predicate} (conf: ${fact.confidence}, rel: ${relevance}, accesses: ${fact.accessCount}, last: ${lastAccess})`;
}

/**
 * Simulate the effect of accessing a fact.
 * Returns a new fact object with updated accessCount and lastAccessed.
 */
export function touchFact(fact: Fact): Fact {
  return {
    ...fact,
    accessCount: fact.accessCount + 1,
    lastAccessed: new Date().toISOString(),
  };
}

/**
 * Simulate promotion of a staged fact.
 * Returns a new fact object with status = 'confirmed'.
 */
export function promoteFact(fact: Fact): Fact {
  if (fact.status !== 'staged') {
    throw new Error(`Cannot promote fact with status: ${fact.status}`);
  }
  return {
    ...fact,
    status: 'confirmed',
  };
}

/**
 * Simulate superseding a fact.
 * Returns a new fact object with status = 'superseded' and validUntil set.
 */
export function supersedeFact(fact: Fact): Fact {
  return {
    ...fact,
    status: 'superseded',
    validUntil: new Date().toISOString(),
  };
}
