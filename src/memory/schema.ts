/**
 * Memory Graph Schema
 *
 * Type definitions for the Entity-Fact memory model.
 * Uses Zod for runtime validation and TypeScript inference.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

/**
 * Types of entities the system can remember.
 */
export const EntityType = z.enum([
  'person',      // People: colleagues, friends, the user
  'project',     // Products, codebases, initiatives
  'concept',     // Technologies, frameworks, methodologies
  'decision',    // Choices the user has made
  'preference',  // Recurring likes/dislikes
]);
export type EntityType = z.infer<typeof EntityType>;

/**
 * Lifecycle status of a fact.
 */
export const FactStatus = z.enum([
  'staged',      // Newly learned, not yet validated
  'confirmed',   // Validated through repeated access
  'superseded',  // Replaced by newer fact
  'retracted',   // Explicitly invalidated
]);
export type FactStatus = z.infer<typeof FactStatus>;

/**
 * Source of a fact (affects trust weighting).
 */
export const FactSource = z.enum([
  'user_edit',   // Explicitly provided by user
  'file',        // Extracted from uploaded document
  'system',      // System-generated metadata
  'conversation', // Inferred from chat
]);
export type FactSource = z.infer<typeof FactSource>;

// ============================================================================
// Entity Schema
// ============================================================================

/**
 * An Entity is a node in the memory graph.
 * Represents things the system remembers: people, projects, concepts.
 */
export const EntitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  type: EntityType,
  name: z.string().min(1),
  description: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  
  // Vector embedding for semantic search (768-dimensional)
  embedding: z.array(z.number()).optional(),
  
  // Usage tracking
  mentionCount: z.number().int().nonnegative().default(0),
  lastMentioned: z.string().datetime().optional(),
  
  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export type Entity = z.infer<typeof EntitySchema>;

/**
 * Input for creating a new entity.
 */
export const CreateEntityInput = EntitySchema.omit({
  id: true,
  userId: true,
  mentionCount: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateEntityInput = z.infer<typeof CreateEntityInput>;

// ============================================================================
// Fact Schema
// ============================================================================

/**
 * A Fact is an edge or attribute in the memory graph.
 * Represents relationships between entities or properties of entities.
 *
 * Examples:
 * - User -> works_on -> JACQ (relationship)
 * - User -> prefers -> "dark mode" (attribute)
 */
export const FactSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  
  // Subject entity (required)
  subjectId: z.string().uuid(),
  
  // Predicate (relationship type)
  predicate: z.string().min(1),
  
  // Object: either another entity or a literal value
  objectId: z.string().uuid().optional(),
  objectValue: z.string().optional(),
  
  // Confidence and lifecycle
  confidence: z.number().min(0).max(1).default(1.0),
  status: FactStatus.default('staged'),
  source: FactSource,
  sourceRef: z.string().optional(), // Session ID, file path, etc.
  
  // Provenance
  provenance: z.enum(['explicit', 'inference', 'import']).default('inference'),
  tags: z.array(z.string()).default([]),
  
  // Usage tracking for promotion/decay
  accessCount: z.number().int().nonnegative().default(0),
  lastAccessed: z.string().datetime().optional(),
  
  // Timestamps
  timestamp: z.string().datetime(),
  validUntil: z.string().datetime().optional(), // For superseded facts
});

export type Fact = z.infer<typeof FactSchema>;

/**
 * Input for staging a new fact.
 */
export const StageFactInput = FactSchema.omit({
  id: true,
  userId: true,
  status: true,
  accessCount: true,
  lastAccessed: true,
  validUntil: true,
});
export type StageFactInput = z.infer<typeof StageFactInput>;

// ============================================================================
// Interaction Schema
// ============================================================================

/**
 * An Interaction records a conversation session.
 * Used for temporal context (what was discussed recently).
 */
export const InteractionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  entityId: z.string().uuid(), // Usually the User entity
  sessionId: z.string(),
  timestamp: z.string().datetime(),
  topics: z.array(z.string()).default([]),
  factsCreated: z.array(z.string().uuid()).default([]),
  factsAccessed: z.array(z.string().uuid()).default([]),
});

export type Interaction = z.infer<typeof InteractionSchema>;

// ============================================================================
// Memory Context Schema
// ============================================================================

/**
 * MemoryContext is the output of Graph-RAG retrieval.
 * This is what gets injected into the AI's context.
 */
export const MemoryContextSchema = z.object({
  // Retrieved entities (anchors + connected)
  entities: z.array(EntitySchema),
  
  // Retrieved facts (subgraph)
  facts: z.array(FactSchema),
  
  // Recent interactions for timeline
  recentInteractions: z.array(InteractionSchema).default([]),
  
  // Retrieval metadata
  retrievalTimestamp: z.string().datetime(),
  anchorEntityIds: z.array(z.string().uuid()),
  hopDepth: z.number().int().positive(),
  
  // Provenance for debugging
  provenance: z.string().optional(),
});

export type MemoryContext = z.infer<typeof MemoryContextSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a fact represents a relationship (edge) vs an attribute.
 */
export function isRelationship(fact: Fact): boolean {
  return fact.objectId !== undefined && fact.objectId !== null;
}

/**
 * Get the display value of a fact's object (entity ID or literal).
 */
export function getFactValue(fact: Fact): string {
  return fact.objectValue ?? fact.objectId ?? '';
}

/**
 * Format a fact for display.
 */
export function formatFact(fact: Fact, subjectName?: string): string {
  const subject = subjectName ?? fact.subjectId;
  const value = getFactValue(fact);
  return `${subject} -> ${fact.predicate} -> ${value}`;
}

/**
 * Convert MemoryContext to a markdown string for LLM injection.
 */
export function contextToMarkdown(context: MemoryContext): string {
  const sections: string[] = [];

  // Group facts by subject entity
  const factsBySubject = new Map<string, Fact[]>();
  for (const fact of context.facts) {
    const list = factsBySubject.get(fact.subjectId) ?? [];
    list.push(fact);
    factsBySubject.set(fact.subjectId, list);
  }

  // Build entity sections
  for (const entity of context.entities) {
    const entityFacts = factsBySubject.get(entity.id);
    if (!entityFacts || entityFacts.length === 0) continue;

    const isUser = entity.name.toLowerCase() === 'user';
    const header = isUser
      ? '### 👤 USER CONTEXT'
      : `### 💡 CONTEXT: ${entity.name}`;

    const factLines = entityFacts.map((f) => {
      const value = f.objectValue ?? '...';
      return `- ${f.predicate}: ${value}`;
    });

    sections.push(`${header}\n${factLines.join('\n')}`);
  }

  // Add recent activity if available
  if (context.recentInteractions.length > 0) {
    const timeline = context.recentInteractions
      .slice(0, 3)
      .map((i) => {
        const date = new Date(i.timestamp).toLocaleDateString();
        return `- [${date}] ${i.topics.join(', ')}`;
      });
    sections.push(`### 📅 RECENT ACTIVITY\n${timeline.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Estimate token count for a context (rough approximation).
 */
export function estimateTokens(context: MemoryContext): number {
  const markdown = contextToMarkdown(context);
  // Rough estimate: 4 characters per token
  return Math.ceil(markdown.length / 4);
}
