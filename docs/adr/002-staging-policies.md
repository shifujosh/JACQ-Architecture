# 2. Staging Policies for Fact Lifecycle

**Date:** 2025-12-16

**Status:** Accepted

---

## Context

The Learning Pipeline extracts entities and facts from user conversations. However, LLM inference is imperfect:

- **Hallucination Risk:** The model might infer facts that aren't actually stated
- **Confidence Variance:** Some inferences are stronger than others
- **Temporal Validity:** Facts become stale over time (e.g., "User lives in NYC" → user moves)
- **Contradiction:** New information may conflict with existing facts

We need a policy framework that:
1. Prevents hallucinated facts from polluting long-term memory
2. Promotes validated facts to permanent status
3. Decays unused or outdated information
4. Resolves conflicts automatically

---

## Decision

Implement a **Staged Memory Lifecycle** with promotion, decay, and conflict resolution policies.

### Lifecycle States

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   [STAGED]  ──(3+ accesses)──>  [CONFIRMED]                 │
│      │                              │                       │
│      │                              │                       │
│      ▼                              ▼                       │
│   (decay)                    (contradiction)                │
│      │                              │                       │
│      ▼                              ▼                       │
│   [RETRACTED]               [SUPERSEDED]                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Policy Configuration

```typescript
const StagingConfig = {
  // Promotion: How many times must a fact be accessed to become confirmed?
  PROMOTION_THRESHOLD: 3,

  // Decay: How long before decay starts?
  DECAY_GRACE_PERIOD_DAYS: 7,

  // Decay: Weekly decay rate (0.95 = 5% per week)
  DECAY_RATE: 0.95,

  // Cleanup: Below what relevance score is a fact eligible for retraction?
  CLEANUP_THRESHOLD: 0.2,

  // Protection: How many accesses protect a fact from cleanup?
  MIN_ACCESS_PROTECTION: 5,
};
```

---

## Implementation

### Promotion Policy

A staged fact is promoted to confirmed when it has been accessed (used in context retrieval) at least N times.

```typescript
function shouldPromote(fact: Fact): boolean {
  if (fact.status !== 'staged') return false;
  return fact.accessCount >= StagingConfig.PROMOTION_THRESHOLD;
}
```

**Rationale:** If a fact keeps being relevant to conversations, it's likely accurate. The system's own usage patterns validate the fact.

### Decay Policy

Relevance is calculated using a compound formula:

```typescript
function calculateRelevance(fact: Fact): number {
  const now = new Date();
  const lastAccessed = new Date(fact.lastAccessed);
  const daysSinceAccess = (now - lastAccessed) / (1000 * 60 * 60 * 24);

  // 1. Source Weighting
  const sourceWeight = {
    user_edit: 2.0,    // Highest trust
    file: 1.5,         // High trust
    system: 1.2,       // Medium trust
    conversation: 1.0, // Baseline
  }[fact.source];

  // 2. Temporal Decay (Exponential)
  let decayFactor = 1.0;
  if (daysSinceAccess > StagingConfig.DECAY_GRACE_PERIOD_DAYS) {
    const decayDays = daysSinceAccess - StagingConfig.DECAY_GRACE_PERIOD_DAYS;
    const decayWeeks = decayDays / 7;
    decayFactor = Math.pow(StagingConfig.DECAY_RATE, decayWeeks);
  }

  // 3. Usage Boost (Logarithmic, capped)
  const usageBoost = 1 + Math.log10(fact.accessCount + 1) * 0.5;

  return fact.confidence * sourceWeight * decayFactor * usageBoost;
}
```

**Rationale:** 
- Facts from user edits are more reliable than inferences
- Unused facts should fade over time
- Frequently accessed facts should be protected

### Cleanup Policy

A fact is eligible for retraction when:

```typescript
function shouldCleanup(fact: Fact): boolean {
  // Never cleanup high-usage confirmed facts
  if (fact.status === 'confirmed' && 
      fact.accessCount >= StagingConfig.MIN_ACCESS_PROTECTION) {
    return false;
  }

  // Already retracted or superseded
  if (fact.status === 'retracted' || fact.status === 'superseded') {
    return false;
  }

  return calculateRelevance(fact) < StagingConfig.CLEANUP_THRESHOLD;
}
```

### Conflict Resolution

When a new high-confidence fact contradicts an existing one:

```typescript
async function handleConflict(newFact: Fact): Promise<void> {
  if (newFact.confidence < 0.9) return; // Only act on high confidence

  const existing = await getFactsForEntity(
    newFact.subjectId, 
    newFact.predicate
  );

  for (const old of existing) {
    const oldValue = old.objectValue || old.objectId;
    const newValue = newFact.objectValue || newFact.objectId;
    
    if (oldValue !== newValue) {
      await supersedeFact(old.id, newFact.id);
      console.log(`Conflict: ${old.predicate} (${oldValue} → ${newValue})`);
    }
  }
}
```

**Rationale:** User corrections (high confidence) should override old inferences. We keep the old fact for history (superseded) rather than deleting.

---

## Consequences

### Positive

- **Self-Correcting:** The memory naturally improves over time as hallucinations decay and valid facts are reinforced
- **Conflict-Aware:** New information automatically supersedes old without user intervention
- **Tunable:** All thresholds are configurable for different use cases
- **Transparent:** The lifecycle is explicit and auditable

### Negative

- **Latency:** Promotion takes time (minimum 3 accesses) — new facts may not immediately feel "remembered"
- **Cold Start:** New users have no confirmed facts, so early context is sparse
- **Complexity:** Multiple status states add cognitive overhead for debugging

### Mitigations

- For critical facts (user edits), we can bypass staging and directly confirm
- Cold start can be addressed with onboarding prompts that seed initial facts
- Status transitions are logged for debugging

---

## Alternative Considered

### Immediate Confirmation

All extracted facts are immediately confirmed, with only decay-based cleanup.

**Rejected because:** Hallucination rates from LLM inference (~5-10%) would pollute memory quickly. Staging provides a validation buffer.

### User Manual Approval

All facts require explicit user approval before becoming confirmed.

**Rejected because:** Too high friction. Users would abandon the feature. Automated policies with good defaults are essential.

---

## References

- [Memory Graph Documentation](../MEMORY_GRAPH.md)
- [ADR 001: Memory Backend](001-memory-graph-backend.md)
