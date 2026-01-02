# 3. Graph-RAG Retrieval Strategy

**Date:** 2025-12-17

**Status:** Accepted

---

## Context

Traditional Retrieval-Augmented Generation (RAG) uses vector similarity search to find relevant documents. However, for a personal knowledge graph:

1. **Context is relational:** "What is JACQ?" should surface not just the project entity, but related technologies, decisions, and people
2. **Depth matters:** Surface-level matches miss connected context that provides crucial understanding
3. **Freshness varies:** Recent information should be weighted higher than stale data
4. **Sources differ:** User-provided facts are more reliable than inferences

We need a retrieval strategy that combines semantic search with graph exploration.

---

## Decision

Implement **Graph-RAG** using a three-phase retrieval pipeline:

1. **Vector Anchor** — Semantic search finds entry points
2. **Spreading Activation** — Graph traversal expands context
3. **Narrative Construction** — Subgraph formatted for LLM

```
User Message → Embed → Vector Search → Anchor Entities
                                            │
                                            ▼
                              Spreading Activation (N-hop BFS)
                                            │
                                            ▼
                                    Relevance Scoring
                                            │
                                            ▼
                                  Narrative Construction
                                            │
                                            ▼
                                    Context Injection
```

---

## Implementation

### Phase 1: Vector Anchor

Find semantically similar entities to the user's query.

```typescript
async function findAnchorEntities(
  userId: string,
  message: string,
  limit: number = 3
): Promise<Entity[]> {
  // Generate embedding for the message
  const { embedding } = await embed({
    model: embeddingModel,
    value: message,
  });

  // Vector similarity search using HNSW index
  const similar = await db.query(`
    SELECT id, name, type, embedding
    FROM entities
    WHERE user_id = $1
    ORDER BY vec_cosine_distance(embedding, $2) ASC
    LIMIT $3
  `, [userId, embedding, limit]);

  return similar;
}
```

**Design Choices:**
- **Top 3:** Balance between recall and noise
- **Cosine Distance:** Normalized for magnitude-invariant similarity
- **HNSW Index:** O(log n) approximate nearest neighbor

### Phase 2: Spreading Activation

Traverse the graph from anchor entities to find connected facts.

```typescript
async function spreadingActivation(
  userId: string,
  anchorIds: string[],
  maxHops: number = 2,
  maxFacts: number = 30
): Promise<Fact[]> {
  const visited = new Set<string>();
  const facts: Fact[] = [];
  let frontier = anchorIds;

  for (let hop = 0; hop < maxHops; hop++) {
    if (facts.length >= maxFacts) break;
    
    const nextFrontier: string[] = [];

    for (const entityId of frontier) {
      if (visited.has(entityId)) continue;
      visited.add(entityId);

      // Get outgoing facts from this entity
      const entityFacts = await db.query(`
        SELECT f.*, e.name as subject_name
        FROM facts f
        JOIN entities e ON f.subject_id = e.id
        WHERE f.subject_id = $1 
          AND f.user_id = $2
          AND f.status IN ('staged', 'confirmed')
        ORDER BY f.confidence DESC
        LIMIT 10
      `, [entityId, userId]);

      for (const fact of entityFacts) {
        facts.push(fact);
        
        // Add connected entities to next frontier
        if (fact.objectId) {
          nextFrontier.push(fact.objectId);
        }
      }
    }

    frontier = nextFrontier;
  }

  return facts;
}
```

**Design Choices:**
- **2 Hops Default:** Captures direct and secondary relationships without explosion
- **Breadth-First:** Ensures closest relationships are captured first
- **Limit Per Entity:** Prevents any single entity from dominating context
- **Max Facts Cap:** Controls context window size

### Phase 3: Relevance Scoring

Score facts to prioritize the most valuable context.

```typescript
function scoreFact(fact: Fact): number {
  const now = Date.now();
  const lastAccessed = new Date(fact.lastAccessed).getTime();
  const ageMs = now - lastAccessed;
  const ageWeeks = ageMs / (1000 * 60 * 60 * 24 * 7);

  // Source weight
  const sourceWeights = {
    user_edit: 2.0,
    file: 1.5,
    system: 1.2,
    conversation: 1.0,
  };
  const sourceWeight = sourceWeights[fact.source] || 1.0;

  // Temporal decay (5% per week after grace period)
  const gracePeriodWeeks = 1;
  const decayFactor = ageWeeks > gracePeriodWeeks
    ? Math.pow(0.95, ageWeeks - gracePeriodWeeks)
    : 1.0;

  // Usage boost (logarithmic)
  const usageBoost = 1 + Math.log10(fact.accessCount + 1) * 0.5;

  // Status weight
  const statusWeight = fact.status === 'confirmed' ? 1.2 : 1.0;

  return fact.confidence * sourceWeight * decayFactor * usageBoost * statusWeight;
}

function rankFacts(facts: Fact[]): Fact[] {
  return facts
    .map(f => ({ fact: f, score: scoreFact(f) }))
    .sort((a, b) => b.score - a.score)
    .map(({ fact }) => fact);
}
```

### Phase 4: Narrative Construction

Format the subgraph as natural language for LLM context.

```typescript
function constructNarrative(
  entities: Entity[],
  facts: Fact[]
): string {
  const sections: string[] = [];

  // Group facts by subject entity
  const factsBySubject = new Map<string, Fact[]>();
  for (const fact of facts) {
    const list = factsBySubject.get(fact.subjectId) || [];
    list.push(fact);
    factsBySubject.set(fact.subjectId, list);
  }

  for (const entity of entities) {
    const entityFacts = factsBySubject.get(entity.id);
    if (!entityFacts || entityFacts.length === 0) continue;

    const isUser = entity.name.toLowerCase() === 'user';
    const header = isUser 
      ? '### 👤 USER CONTEXT' 
      : `### 💡 CONTEXT: ${entity.name}`;

    const factLines = entityFacts.map(f => {
      const value = f.objectValue || '...'; // TODO: resolve object names
      return `- ${f.predicate}: ${value}`;
    });

    sections.push(`${header}\n${factLines.join('\n')}`);
  }

  return sections.join('\n\n');
}
```

**Output Example:**
```markdown
### 👤 USER CONTEXT
- prefers: dark mode
- prefers: TypeScript over JavaScript
- works_on: JACQ Project

### 💡 CONTEXT: JACQ Project
- uses: DuckDB
- uses: Next.js 16
- status: active development

### 💡 CONTEXT: DuckDB
- type: embedded OLAP database
- supports: vector search via VSS extension
```

---

## Consequences

### Positive

- **Contextual Richness:** Related information surfaces automatically
- **Semantic + Structural:** Combines embedding similarity with graph relationships
- **Tunable:** Hop depth, limits, and scoring weights are configurable
- **Explainable:** The provenance (how context was retrieved) is traceable

### Negative

- **Latency:** Multi-phase retrieval adds ~50-100ms compared to pure vector search
- **Complexity:** More moving parts than simple embedding lookup
- **Scaling:** Deep traversals on large graphs could be expensive

### Mitigations

- Caching for repeated similar queries (60s TTL)
- Limit traversal depth and facts per entity
- Background pre-warming for known high-frequency entities

---

## Alternatives Considered

### Pure Vector Search

Just find the top-K most similar entities/facts and inject directly.

**Rejected because:** Loses relational context. "What is JACQ?" would only return the JACQ entity, not its technologies or decisions.

### Full Graph Query (Cypher-like)

Use a graph query language to find paths and subgraphs.

**Rejected because:** Requires Neo4j or similar, adding deployment complexity. The hybrid approach gives us graph traversal without the infrastructure cost.

### Keyword Search + Vector Search

Combine exact keyword matching with vector similarity.

**Adopted as fallback:** If embedding fails, we degrade to keyword search on entity names.

---

## References

- [Memory Graph Documentation](../MEMORY_GRAPH.md)
- [ADR 001: Memory Backend](001-memory-graph-backend.md)
- [Graph RAG Paper](https://arxiv.org/abs/2404.16130)
