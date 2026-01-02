/**
 * Graph-RAG Demo
 *
 * Demonstrates the JACQ memory system in action:
 * 1. Create entities (User, Project, Concepts)
 * 2. Add facts with relationships
 * 3. Simulate semantic query and graph traversal
 * 4. Format context for LLM injection
 *
 * This is a reference implementation showing the architecture.
 * The real system uses DuckDB for persistence.
 */

import { v4 as uuid } from 'uuid';
import {
  Entity,
  Fact,
  MemoryContext,
  EntityType,
  FactStatus,
  FactSource,
  contextToMarkdown,
  estimateTokens,
} from '../src/memory/schema';
import {
  calculateRelevance,
  shouldPromote,
  touchFact,
  promoteFact,
  formatFactStatus,
} from '../src/memory/staging';
import { routeIntent } from '../src/orchestrator/router';

// ============================================================================
// Demo Helpers
// ============================================================================

function highlight(text: string, color: 'cyan' | 'magenta' | 'green' | 'yellow' = 'cyan'): string {
  const colors = {
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
  };
  return `${colors[color]}${text}\x1b[0m`;
}

function createEntity(
  type: EntityType,
  name: string,
  description?: string
): Entity {
  return {
    id: uuid(),
    userId: 'user-1',
    type,
    name,
    description,
    aliases: [],
    mentionCount: 0,
    createdAt: new Date().toISOString(),
  };
}

function createFact(
  subjectId: string,
  predicate: string,
  value: string,
  objectId?: string
): Fact {
  return {
    id: uuid(),
    userId: 'user-1',
    subjectId,
    predicate,
    objectId,
    objectValue: objectId ? undefined : value,
    confidence: 0.9,
    status: 'staged' as FactStatus,
    source: 'conversation' as FactSource,
    provenance: 'inference',
    tags: [],
    accessCount: 0,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Demo
// ============================================================================

async function runDemo() {
  console.log(highlight('\n========================================', 'magenta'));
  console.log(highlight('   JACQ Cognitive Operating System', 'magenta'));
  console.log(highlight('   Graph-RAG Memory Demo', 'magenta'));
  console.log(highlight('========================================\n', 'magenta'));

  // -------------------------------------------------------------------------
  // Phase 1: Entity Creation
  // -------------------------------------------------------------------------
  console.log(highlight('1. Entity Ingestion', 'cyan'));
  console.log('─'.repeat(50));
  console.log('User: "I\'m building JACQ using TypeScript and DuckDB."\n');

  const user = createEntity('person', 'User');
  const jacq = createEntity('project', 'JACQ', 'Cognitive Operating System');
  const typescript = createEntity('concept', 'TypeScript');
  const duckdb = createEntity('concept', 'DuckDB', 'Embedded OLAP database');
  const nextjs = createEntity('concept', 'Next.js', 'React framework');

  const entities = [user, jacq, typescript, duckdb, nextjs];

  for (const entity of entities) {
    console.log(
      `   → Learned Entity: ${highlight(entity.name, 'green')} (${entity.type})`
    );
  }

  // -------------------------------------------------------------------------
  // Phase 2: Fact Extraction
  // -------------------------------------------------------------------------
  console.log(highlight('\n2. Fact Extraction & Staging', 'cyan'));
  console.log('─'.repeat(50));

  const facts: Fact[] = [
    // User relationships
    createFact(user.id, 'works_on', 'JACQ', jacq.id),
    createFact(user.id, 'prefers', 'dark mode'),
    createFact(user.id, 'uses', 'TypeScript', typescript.id),

    // Project relationships
    createFact(jacq.id, 'uses', 'TypeScript', typescript.id),
    createFact(jacq.id, 'uses', 'DuckDB', duckdb.id),
    createFact(jacq.id, 'uses', 'Next.js', nextjs.id),
    createFact(jacq.id, 'status', 'active development'),

    // Concept relationships
    createFact(duckdb.id, 'type', 'embedded database'),
    createFact(duckdb.id, 'supports', 'vector search'),
  ];

  for (const fact of facts) {
    const subjectName = entities.find((e) => e.id === fact.subjectId)?.name ?? 'Unknown';
    const value = fact.objectValue ?? entities.find((e) => e.id === fact.objectId)?.name ?? 'Unknown';
    console.log(
      `   → Staged Fact: ${subjectName} → ${fact.predicate} → ${value}`
    );
  }
  console.log(`\n   Total: ${facts.length} facts staged`);

  // -------------------------------------------------------------------------
  // Phase 3: Promotion Simulation
  // -------------------------------------------------------------------------
  console.log(highlight('\n3. Fact Promotion Lifecycle', 'cyan'));
  console.log('─'.repeat(50));
  console.log('Simulating repeated access to validate facts...\n');

  // Simulate accessing some facts multiple times
  let testFact = facts[0]!; // User works_on JACQ
  console.log(`   Initial: ${formatFactStatus(testFact)}`);

  // Touch 3 times to trigger promotion
  for (let i = 0; i < 3; i++) {
    testFact = touchFact(testFact);
    console.log(`   Access ${i + 1}: accessCount = ${testFact.accessCount}`);
  }

  console.log(`   Should promote? ${shouldPromote(testFact) ? highlight('YES', 'green') : 'NO'}`);

  if (shouldPromote(testFact)) {
    testFact = promoteFact(testFact);
    console.log(`   → Status changed to: ${highlight(testFact.status, 'green')}`);
  }

  // -------------------------------------------------------------------------
  // Phase 4: Relevance Calculation
  // -------------------------------------------------------------------------
  console.log(highlight('\n4. Relevance Scoring', 'cyan'));
  console.log('─'.repeat(50));
  console.log('Calculating relevance for context ranking...\n');

  // Show relevance for each fact
  for (const fact of facts.slice(0, 5)) {
    const subjectName = entities.find((e) => e.id === fact.subjectId)?.name ?? 'Unknown';
    const relevance = calculateRelevance(fact);
    console.log(
      `   ${subjectName} → ${fact.predicate}: relevance = ${highlight(relevance.toFixed(3), 'yellow')}`
    );
  }

  // -------------------------------------------------------------------------
  // Phase 5: Graph-RAG Context Construction
  // -------------------------------------------------------------------------
  console.log(highlight('\n5. Graph-RAG Context Construction', 'cyan'));
  console.log('─'.repeat(50));
  console.log('User query: "What is JACQ using?"\n');

  // Simulate vector anchor (in real system, this uses embeddings)
  const anchorEntities = [jacq, user];
  console.log(`   Vector Anchors: [${anchorEntities.map((e) => e.name).join(', ')}]`);

  // Simulate spreading activation (2-hop BFS)
  // In real system, this queries the database
  const subgraphFacts = facts.filter(
    (f) =>
      anchorEntities.some((e) => e.id === f.subjectId) ||
      anchorEntities.some((e) => e.id === f.objectId)
  );
  console.log(`   Spreading Activation: Found ${subgraphFacts.length} connected facts\n`);

  // Build memory context
  const context: MemoryContext = {
    entities: anchorEntities,
    facts: subgraphFacts,
    recentInteractions: [],
    retrievalTimestamp: new Date().toISOString(),
    anchorEntityIds: anchorEntities.map((e) => e.id),
    hopDepth: 2,
    provenance: `Vector search found ${anchorEntities.length} entities. Graph traversal retrieved ${subgraphFacts.length} facts.`,
  };

  // Format for LLM
  const markdown = contextToMarkdown(context);
  const tokens = estimateTokens(context);

  console.log(highlight('   Formatted Context for LLM:', 'yellow'));
  console.log('   ─'.repeat(25));
  for (const line of markdown.split('\n')) {
    console.log(`   ${line}`);
  }
  console.log('   ─'.repeat(25));
  console.log(`   Estimated tokens: ${tokens}`);

  // -------------------------------------------------------------------------
  // Phase 6: Intent Routing Demo
  // -------------------------------------------------------------------------
  console.log(highlight('\n6. Intent Routing', 'cyan'));
  console.log('─'.repeat(50));

  const testQueries = [
    'Search for the latest Next.js documentation',
    'Write a blog post about JACQ',
    'Fix the bug in the memory module',
    'Generate an architecture diagram',
    'Remember that I prefer TypeScript',
  ];

  for (const query of testQueries) {
    const decision = routeIntent(query);
    console.log(`   "${query.slice(0, 40)}..."`);
    console.log(
      `   → ${highlight(decision.primaryCapability.toUpperCase(), 'green')} (confidence: ${decision.confidence.toFixed(2)})`
    );
    if (decision.requiresMemory) {
      console.log(`   → Requires memory: ${highlight('YES', 'yellow')}`);
    }
    console.log();
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(highlight('\n========================================', 'magenta'));
  console.log(highlight('   Demo Complete', 'magenta'));
  console.log(highlight('========================================', 'magenta'));
  console.log(`
Key Takeaways:
1. Entities represent nodes (people, projects, concepts)
2. Facts represent edges and attributes with lifecycle states
3. Staged facts are promoted after repeated access
4. Relevance scoring combines confidence, recency, and usage
5. Graph-RAG retrieves connected context via spreading activation
6. Intent routing classifies user messages to capabilities
`);
}

// Run the demo
runDemo().catch(console.error);
