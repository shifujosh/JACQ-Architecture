/**
 * Memory System Tests
 *
 * Verifies cognitive architecture components:
 * - Entity-Fact schema validation
 * - Staging and promotion lifecycle
 * - Time-based decay of relevance
 * - Context construction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EntitySchema,
  FactSchema,
  EntityType,
  FactStatus,
  FactSource,
  isRelationship,
  getFactValue,
  contextToMarkdown,
  type Entity,
  type Fact,
  type MemoryContext,
} from '../src/memory/schema';
import {
  StagingConfig,
  shouldPromote,
  calculateRelevance,
  shouldCleanup,
  determineStagingAction,
  processStagingBatch,
  touchFact,
  promoteFact,
  supersedeFact,
} from '../src/memory/staging';

// ============================================================================
// Test Fixtures
// ============================================================================

// Valid UUIDs for testing
const TEST_USER_ID = 'user-1';
const TEST_ENTITY_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_ENTITY_ID_2 = '550e8400-e29b-41d4-a716-446655440002';
const TEST_FACT_ID = '550e8400-e29b-41d4-a716-446655440010';

function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: TEST_ENTITY_ID,
    userId: TEST_USER_ID,
    type: 'person',
    name: 'Test Entity',
    aliases: [],
    mentionCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: TEST_FACT_ID,
    userId: TEST_USER_ID,
    subjectId: TEST_ENTITY_ID,
    predicate: 'test_predicate',
    objectValue: 'test_value',
    confidence: 0.9,
    status: 'staged',
    source: 'conversation',
    provenance: 'inference',
    tags: [],
    accessCount: 0,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Schema Tests
// ============================================================================

describe('Schema Validation', () => {
  describe('EntitySchema', () => {
    it('should validate a valid entity', () => {
      const entity = createTestEntity();
      const result = EntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
    });

    it('should reject entity without required fields', () => {
      const result = EntitySchema.safeParse({ name: 'Test' });
      expect(result.success).toBe(false);
    });

    it('should validate all entity types', () => {
      const types: EntityType[] = ['person', 'project', 'concept', 'decision', 'preference'];
      for (const type of types) {
        const entity = createTestEntity({ type });
        const result = EntitySchema.safeParse(entity);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('FactSchema', () => {
    it('should validate a valid fact', () => {
      const fact = createTestFact();
      const result = FactSchema.safeParse(fact);
      expect(result.success).toBe(true);
    });

    it('should validate relationship facts', () => {
      const fact = createTestFact({
        objectId: TEST_ENTITY_ID_2,
        objectValue: undefined,
      });
      const result = FactSchema.safeParse(fact);
      expect(result.success).toBe(true);
      expect(isRelationship(fact)).toBe(true);
    });

    it('should validate attribute facts', () => {
      const fact = createTestFact({
        objectId: undefined,
        objectValue: 'some value',
      });
      expect(isRelationship(fact)).toBe(false);
      expect(getFactValue(fact)).toBe('some value');
    });
  });
});

// ============================================================================
// Staging Lifecycle Tests
// ============================================================================

describe('Staging Lifecycle', () => {
  describe('shouldPromote', () => {
    it('should not promote facts with insufficient accesses', () => {
      const fact = createTestFact({ accessCount: 1 });
      expect(shouldPromote(fact)).toBe(false);
    });

    it('should promote facts at threshold', () => {
      const fact = createTestFact({
        accessCount: StagingConfig.PROMOTION_THRESHOLD,
      });
      expect(shouldPromote(fact)).toBe(true);
    });

    it('should not promote already confirmed facts', () => {
      const fact = createTestFact({
        status: 'confirmed',
        accessCount: 10,
      });
      expect(shouldPromote(fact)).toBe(false);
    });
  });

  describe('touchFact', () => {
    it('should increment access count', () => {
      const fact = createTestFact({ accessCount: 0 });
      const touched = touchFact(fact);
      expect(touched.accessCount).toBe(1);
    });

    it('should update lastAccessed timestamp', () => {
      const fact = createTestFact({ lastAccessed: undefined });
      const touched = touchFact(fact);
      expect(touched.lastAccessed).toBeDefined();
    });

    it('should trigger promotion after threshold accesses', () => {
      let fact = createTestFact({ accessCount: 0 });
      
      // Touch until promotion threshold
      for (let i = 0; i < StagingConfig.PROMOTION_THRESHOLD; i++) {
        fact = touchFact(fact);
      }
      
      expect(shouldPromote(fact)).toBe(true);
    });
  });

  describe('promoteFact', () => {
    it('should change status to confirmed', () => {
      const fact = createTestFact({ status: 'staged' });
      const promoted = promoteFact(fact);
      expect(promoted.status).toBe('confirmed');
    });

    it('should throw for non-staged facts', () => {
      const fact = createTestFact({ status: 'confirmed' });
      expect(() => promoteFact(fact)).toThrow();
    });
  });

  describe('supersedeFact', () => {
    it('should change status to superseded', () => {
      const fact = createTestFact({ status: 'confirmed' });
      const superseded = supersedeFact(fact);
      expect(superseded.status).toBe('superseded');
    });

    it('should set validUntil timestamp', () => {
      const fact = createTestFact();
      const superseded = supersedeFact(fact);
      expect(superseded.validUntil).toBeDefined();
    });
  });
});

// ============================================================================
// Relevance Calculation Tests
// ============================================================================

describe('Relevance Calculation', () => {
  it('should return higher relevance for higher confidence', () => {
    const highConf = createTestFact({ confidence: 0.9 });
    const lowConf = createTestFact({ confidence: 0.3 });

    expect(calculateRelevance(highConf)).toBeGreaterThan(calculateRelevance(lowConf));
  });

  it('should apply source weighting', () => {
    const userEdit = createTestFact({ source: 'user_edit', confidence: 1.0 });
    const conversation = createTestFact({ source: 'conversation', confidence: 1.0 });

    expect(calculateRelevance(userEdit)).toBeGreaterThan(calculateRelevance(conversation));
  });

  it('should apply usage boost', () => {
    const unused = createTestFact({ accessCount: 0 });
    const used = createTestFact({ accessCount: 10 });

    expect(calculateRelevance(used)).toBeGreaterThan(calculateRelevance(unused));
  });

  it('should apply temporal decay after grace period', () => {
    const recent = createTestFact({
      lastAccessed: new Date().toISOString(),
    });

    // Create a fact last accessed 30 days ago
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const old = createTestFact({
      lastAccessed: oldDate.toISOString(),
    });

    expect(calculateRelevance(recent)).toBeGreaterThan(calculateRelevance(old));
  });

  it('should not decay within grace period', () => {
    const now = new Date();
    const withinGrace = new Date(now);
    withinGrace.setDate(withinGrace.getDate() - (StagingConfig.DECAY_GRACE_PERIOD_DAYS - 1));

    const fact1 = createTestFact({ lastAccessed: now.toISOString() });
    const fact2 = createTestFact({ lastAccessed: withinGrace.toISOString() });

    // Relevance should be very close (only differ by usage boost if any)
    const rel1 = calculateRelevance(fact1);
    const rel2 = calculateRelevance(fact2);
    expect(Math.abs(rel1 - rel2)).toBeLessThan(0.1);
  });
});

// ============================================================================
// Cleanup Tests
// ============================================================================

describe('Cleanup Policy', () => {
  it('should cleanup facts below threshold', () => {
    // Create a very old, low-confidence fact
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100); // 100 days old

    const staleFact = createTestFact({
      confidence: 0.3,
      accessCount: 0,
      lastAccessed: oldDate.toISOString(),
    });

    expect(shouldCleanup(staleFact)).toBe(true);
  });

  it('should protect high-usage confirmed facts', () => {
    const protectedFact = createTestFact({
      status: 'confirmed',
      accessCount: StagingConfig.MIN_ACCESS_PROTECTION + 1,
      confidence: 0.5,
    });

    expect(shouldCleanup(protectedFact)).toBe(false);
  });

  it('should skip already retracted facts', () => {
    const retracted = createTestFact({ status: 'retracted' });
    expect(shouldCleanup(retracted)).toBe(false);
  });
});

// ============================================================================
// Batch Processing Tests
// ============================================================================

describe('Batch Processing', () => {
  it('should identify facts needing promotion', () => {
    const facts = [
      createTestFact({ id: 'f1', accessCount: 0 }),
      createTestFact({ id: 'f2', accessCount: StagingConfig.PROMOTION_THRESHOLD }),
      createTestFact({ id: 'f3', accessCount: 5 }),
    ];

    const actions = processStagingBatch(facts);
    expect(actions.get('f2')).toBe('promote');
    expect(actions.get('f3')).toBe('promote');
    expect(actions.has('f1')).toBe(false); // No action needed
  });

  it('should identify facts for cleanup', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const facts = [
      createTestFact({ id: 'f1', confidence: 0.9 }), // Healthy
      createTestFact({
        id: 'f2',
        confidence: 0.1,
        lastAccessed: oldDate.toISOString(),
      }), // Stale
    ];

    const actions = processStagingBatch(facts);
    expect(actions.get('f2')).toBe('cleanup');
  });
});

// ============================================================================
// Context Construction Tests
// ============================================================================

describe('Context Construction', () => {
  it('should format context as markdown', () => {
    const entities: Entity[] = [
      createTestEntity({ id: 'e1', name: 'User', type: 'person' }),
      createTestEntity({ id: 'e2', name: 'JACQ', type: 'project' }),
    ];

    const facts: Fact[] = [
      createTestFact({ subjectId: 'e1', predicate: 'works_on', objectValue: 'JACQ' }),
      createTestFact({ subjectId: 'e2', predicate: 'uses', objectValue: 'TypeScript' }),
    ];

    const context: MemoryContext = {
      entities,
      facts,
      recentInteractions: [],
      retrievalTimestamp: new Date().toISOString(),
      anchorEntityIds: ['e1'],
      hopDepth: 2,
    };

    const markdown = contextToMarkdown(context);

    expect(markdown).toContain('USER CONTEXT');
    expect(markdown).toContain('works_on');
    expect(markdown).toContain('JACQ');
    expect(markdown).toContain('uses');
    expect(markdown).toContain('TypeScript');
  });
});
