# 1. Memory Graph Backend Selection

**Date:** 2025-12-15

**Status:** Accepted

---

## Context

JACQ requires a long-term memory system to store and retrieve knowledge about the user, their projects, and their preferences. This memory must be:

1. **Associative:** Capable of linking related concepts (e.g., "React" → "Frontend" → "Project A")
2. **Semantic:** Searchable by meaning, not just keywords
3. **Local-First:** Running efficiently on the user's machine without heavy infrastructure
4. **Autonomous:** Self-maintaining (decay, promotion, conflict resolution)

### Options Evaluated

| Option | Pros | Cons |
|--------|------|------|
| **Neo4j** | Native graph queries (Cypher), mature ecosystem | Heavy JVM runtime, server process required, overkill for single-user |
| **ArangoDB** | Multi-model (Graph + Document), good performance | Still requires server, complex deployment |
| **LanceDB** | Embedded, excellent vector search | No native graph traversal, pure vector store |
| **Chroma** | Simple API, good for RAG | No graph structure, limited query flexibility |
| **DuckDB + VSS** | Embedded, OLAP-optimized, vector extension, SQL | Requires hand-written graph traversal |

---

## Decision

We chose to implement a **Hybrid Cognitive Graph** using **DuckDB**.

### Architecture

```
┌─────────────────────────────────────────────┐
│              Application Layer              │
│   (TypeScript: graph-traversal.ts)          │
│   - Spreading Activation                    │
│   - Relevance Scoring                       │
│   - Context Construction                    │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│                  DuckDB                     │
│   ┌─────────────┐  ┌─────────────────────┐  │
│   │  entities   │  │       facts         │  │
│   │  (nodes)    │  │      (edges)        │  │
│   │  + HNSW     │  │  + confidence       │  │
│   │    vector   │  │  + status           │  │
│   │    index    │  │  + decay metadata   │  │
│   └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Key Decisions

1. **Storage Engine:** DuckDB
   - Embedded (no separate server process)
   - ACID compliant with WAL
   - High-performance OLAP queries
   - Supports vector operations via `vss` extension

2. **Vector Search:** HNSW Indexing on `embedding` column
   - Sub-millisecond approximate nearest neighbor search
   - Configurable precision/performance tradeoff

3. **Graph Traversal:** Application-layer "Spreading Activation"
   - Store graph data (Nodes/Edges) in relational tables
   - Perform weighted breadth-first traversals in TypeScript
   - Avoids overhead of a JVM-based Graph DB like Neo4j

---

## Consequences

### Positive

- **Zero Ops:** No Docker containers or Java runtime required. Just a single `.duckdb` file.
- **Performance:** DuckDB is significantly faster than SQLite for analytical queries and vector operations.
- **Flexibility:** Mix SQL (relational) and Vector queries in the same transaction.
- **Portability:** Single file can be backed up, synced, or migrated easily.
- **Debugging:** Standard SQL tooling works for inspection.

### Negative

- **Complexity:** Graph traversal logic is hand-written in TypeScript rather than using standard Cypher/Gremlin.
- **Scale Ceiling:** Not a distributed system. Designed for single-user "Personal" OS, not multi-tenant SaaS.
- **Feature Gap:** No native path algorithms (shortest path, etc.) — must implement manually.

### Mitigations

- The expected dataset size (<1M nodes, <10M edges) is well within single-machine OLAP capabilities.
- Hand-written traversal allows fine-tuned relevance scoring that wouldn't be possible with generic graph queries.
- We can always export to Neo4j if scale requirements change.

---

## Implementation Notes

### Schema

```sql
CREATE TABLE entities (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT[],
  embedding FLOAT[768],
  mention_count INTEGER DEFAULT 0,
  last_mentioned TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE facts (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject_id UUID REFERENCES entities(id),
  predicate TEXT NOT NULL,
  object_id UUID REFERENCES entities(id),
  object_value TEXT,
  confidence FLOAT DEFAULT 1.0,
  status TEXT DEFAULT 'staged',
  source TEXT NOT NULL,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP
);

-- Vector index for semantic search
CREATE INDEX entities_embedding_idx ON entities 
USING HNSW (embedding) WITH (metric = 'cosine');
```

### Graph Traversal (Pseudocode)

```typescript
async function spreadingActivation(
  anchorIds: string[],
  maxHops: number = 2,
  maxFacts: number = 30
): Promise<Fact[]> {
  const visited = new Set<string>();
  const result: Fact[] = [];
  let frontier = anchorIds;

  for (let hop = 0; hop < maxHops && result.length < maxFacts; hop++) {
    const nextFrontier: string[] = [];
    
    for (const entityId of frontier) {
      if (visited.has(entityId)) continue;
      visited.add(entityId);
      
      const facts = await db.query(`
        SELECT * FROM facts 
        WHERE subject_id = ? AND status IN ('staged', 'confirmed')
        ORDER BY confidence DESC
      `, [entityId]);
      
      result.push(...facts);
      nextFrontier.push(...facts.map(f => f.object_id).filter(Boolean));
    }
    
    frontier = nextFrontier;
  }
  
  return result.slice(0, maxFacts);
}
```

---

## References

- [DuckDB Documentation](https://duckdb.org/docs/)
- [DuckDB VSS Extension](https://duckdb.org/docs/extensions/vss.html)
- [Neo4j Embedded Limitations](https://neo4j.com/docs/operations-manual/current/configuration/neo4j-conf/)
