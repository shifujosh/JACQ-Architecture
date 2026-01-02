#!/usr/bin/env python3
"""
Example: Memory Persistence Across Sessions

This script demonstrates how JACQ's memory system
enables persistent context. Unlike traditional AI
that forgets everything between sessions, JACQ
remembers entities, facts, and preferences.

Usage:
    python examples/session_example.py
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
    Interaction,
    MemoryContext,
)
from orchestrator.router import IntentRouter, Capability


def simulate_session_1():
    """First session: User introduces themselves and a project."""
    print("=" * 60)
    print("SESSION 1: Initial Context Building")
    print("=" * 60)
    
    # User message
    user_input = "I'm Joshua, working on a project called JACQ. It's a cognitive OS."
    print(f"\nUser: {user_input}")
    
    # System extracts entities
    user_entity = Entity(
        entity_type=EntityType.PERSON,
        name="Joshua",
        description="The user"
    )
    
    project_entity = Entity(
        entity_type=EntityType.PROJECT,
        name="JACQ",
        description="Cognitive Operating System"
    )
    
    # System creates facts
    works_on_fact = Fact(
        subject_id=user_entity.id,
        predicate="works_on",
        object_id=project_entity.id,
        status=FactStatus.STAGED,
        source="session_1"
    )
    
    print("\n[Memory System] Entities extracted:")
    print(f"  - {user_entity.name} ({user_entity.entity_type.value})")
    print(f"  - {project_entity.name} ({project_entity.entity_type.value})")
    
    print("\n[Memory System] Facts created:")
    print(f"  - {user_entity.name} --works_on--> {project_entity.name}")
    print(f"    Status: {works_on_fact.status.value}")
    
    # Log the interaction
    interaction = Interaction(
        session_id="session_1",
        user_input=user_input,
        system_response="Nice to meet you, Joshua! I've noted that you're working on JACQ.",
        entities_mentioned=[user_entity.id, project_entity.id],
        facts_created=[works_on_fact.id]
    )
    
    print(f"\nSystem: {interaction.system_response}")
    
    return user_entity, project_entity, works_on_fact


def simulate_session_2(user_entity, project_entity, works_on_fact):
    """Second session: User returns and context is restored."""
    print("\n" + "=" * 60)
    print("SESSION 2: Context Restoration (New Session)")
    print("=" * 60)
    
    # The fact has been accessed again, increasing confidence
    works_on_fact.access_count += 1
    works_on_fact.last_accessed = datetime.utcnow()
    
    # After 3 accesses, fact is confirmed
    if works_on_fact.access_count >= 3:
        works_on_fact.status = FactStatus.CONFIRMED
    
    # Build context for this session
    context = MemoryContext(
        relevant_entities=[user_entity, project_entity],
        relevant_facts=[works_on_fact]
    )
    
    print("\n[Memory System] Context restored from previous session:")
    print(context.to_prompt_context())
    
    # User asks a follow-up
    user_input = "How is JACQ coming along?"
    print(f"User: {user_input}")
    
    # System can now reference past context
    response = (
        f"Since you're working on {project_entity.name} "
        f"({project_entity.description}), I can help you continue from "
        f"where we left off. What would you like to focus on?"
    )
    print(f"\nSystem: {response}")
    
    return context


def demonstrate_routing():
    """Show how the orchestrator routes different intents."""
    print("\n" + "=" * 60)
    print("BONUS: Intent Routing Demo")
    print("=" * 60)
    
    router = IntentRouter()
    
    test_inputs = [
        "Search for the latest news on AI agents",
        "Write me a project proposal for JACQ",
        "Fix this bug in the memory module",
        "Generate a diagram of the architecture",
        "Remember that I prefer dark mode",
        "What should I focus on next?",
    ]
    
    print("\nRouting various user inputs:\n")
    for user_input in test_inputs:
        decision = router.route(user_input)
        print(f"  \"{user_input[:40]}...\"")
        print(f"    → {decision.primary_capability.value.upper()}")
        print(f"      Confidence: {decision.confidence:.0%}")
        print(f"      Needs memory: {decision.requires_memory}")
        print()


def main():
    """Run the full demonstration."""
    print("=" * 60)
    print("JACQ Memory System Demonstration")
    print("=" * 60)
    print("\nThis demo shows how JACQ maintains persistent context")
    print("across sessions, unlike traditional AI that forgets.")
    
    # Simulate two sessions
    user, project, fact = simulate_session_1()
    context = simulate_session_2(user, project, fact)
    
    # Show routing
    demonstrate_routing()
    
    print("=" * 60)
    print("Demo complete. Context persists. Nothing is forgotten.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
