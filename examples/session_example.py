"""
JACQ Memory System Demo
----------------------
Demonstrates the "Cognitive Operating System" in action.
Shows how the system boosts context, manages memory lifecycles,
and traverses the knowledge graph.
"""

import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from memory.schema import (
    Entity,
    EntityType,
    Fact,
    FactStatus,
    MemoryStore,
    MemoryContext
)

def highlight(text, color_code="36"):
    return f"\033[{color_code}m{text}\033[0m"

def run_simulation():
    print(highlight("Initializing JACQ Cognitive Core...", "35"))
    store = MemoryStore()
    
    # 1. Ingestion: Learning new entities
    print("\n" + highlight("1. Semantic Ingestion", "36"))
    print("User: 'I'm architecting JACQ using Python and LanceDB.'")
    
    joshua = Entity(entity_type=EntityType.PERSON, name="Joshua")
    jacq = Entity(entity_type=EntityType.PROJECT, name="JACQ", description="Cognitive OS")
    python = Entity(entity_type=EntityType.CONCEPT, name="Python")
    lancedb = Entity(entity_type=EntityType.PROJECT, name="LanceDB", description="Vector Store")
    
    for e in [joshua, jacq, python, lancedb]:
        store.add_entity(e)
        print(f"  -> Learned Entity: {e.name} ({e.entity_type.value})")
        
    # 2. Fact Extraction & Linkage
    print("\n" + highlight("2. Graph Construction", "36"))
    facts = [
        Fact(subject_id=joshua.id, predicate="architects", object_id=jacq.id),
        Fact(subject_id=jacq.id, predicate="built_with", object_id=python.id),
        Fact(subject_id=jacq.id, predicate="uses_database", object_id=lancedb.id),
    ]
    
    for f in facts:
        store.add_fact(f)
        # Simulate accessing them to promote to CONFIRMED
        for _ in range(3): f.touch()
        
    print(f"  -> Created dependence graph: {joshua.name} -> {jacq.name} -> [{python.name}, {lancedb.name}]")
    
    # 3. Context Retrieval (Multi-hop)
    print("\n" + highlight("3. Context Retrieval (2-Hop Expansion)", "36"))
    print("User asks about 'Joshua'")
    print("System expanding context...")
    
    related_ids = store.find_related_entities(joshua.id, max_hops=2)
    related_entities = [store.entities[eid] for eid in related_ids if eid != joshua.id]
    
    context = MemoryContext(
        relevant_entities=[joshua] + related_entities,
        relevant_facts=facts,
        retrieval_timestamp=datetime.now()
    )
    
    print("\n" + "-"*40)
    print(context.to_prompt_context())
    print("-" * 40)
    print(f"Context Tokens Estimated: {context.estimate_tokens()}")
    
    # 4. Simulation of Decay
    print("\n" + highlight("4. Temporal Decay Simulation", "36"))
    print("Fast-forwarding 4 weeks without access...")
    
    # Add a stale fact
    temp_fact = Fact(subject_id=joshua.id, predicate="currently_reading", value="Hacker News", status=FactStatus.CONFIRMED)
    store.add_fact(temp_fact)
    
    print(f"  Fact: '{temp_fact.predicate}' Relevance: {temp_fact.relevance:.2f}")
    
    # Simulate time passing
    temp_fact.last_accessed = datetime(2023, 1, 1) # Old date
    candidates = store.run_decay_pass()
    
    print(f"  ...Decay pass run.")
    print(f"  Fact: '{temp_fact.predicate}' New Relevance: {temp_fact.relevance:.2f}")
    if temp_fact.relevance < 0.2:
        print(f"  Result: Fact marked for cleanup (relevance < 0.2)")

if __name__ == "__main__":
    run_simulation()
