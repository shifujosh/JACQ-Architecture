"""
Unit tests for the JACQ Memory System.

Verifies cognitive architecture components:
- Entity-Fact graph structure
- Staging and promotion lifecycle
- Time-based decay of relevance
- Context traversal (related entity discovery)
"""

import pytest
from datetime import datetime, timedelta
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from memory.schema import (
    Entity,
    EntityType,
    Fact,
    FactStatus,
    MemoryStore
)


class TestMemoryLifecycle:
    """Tests for the dynamic lifecycle of memories."""
    
    def test_fact_promotion(self):
        """Facts should move from STAGED to CONFIRMED after reuse."""
        fact = Fact(
            subject_id="ent_1",
            predicate="likes",
            value="pizza"
        )
        assert fact.status == FactStatus.STAGED
        
        # Simulate repeated access
        fact.touch() # 1
        fact.touch() # 2
        assert fact.status == FactStatus.STAGED
        
        fact.touch() # 3 (Threshold)
        assert fact.status == FactStatus.CONFIRMED

    def test_relevance_decay(self):
        """Confirmed facts should lose relevance over time."""
        fact = Fact(
            subject_id="ent_1",
            predicate="location",
            value="office",
            status=FactStatus.CONFIRMED,
            relevance=1.0
        )
        
        # Simulate 2 weeks of inactivity
        fact.decay(weeks_inactive=2.0)
        
        # 1.0 - (0.05 * 2) = 0.9
        assert fact.relevance < 1.0
        assert fact.relevance == 0.9

class TestMemoryGraph:
    """Tests for graph traversal and storage."""
    
    def test_related_entity_discovery(self):
        """Should find connected entities through 'hops'."""
        store = MemoryStore()
        
        # Create a graph: User -> Project -> Tech
        user = Entity(entity_type=EntityType.PERSON, name="Joshua")
        project = Entity(entity_type=EntityType.PROJECT, name="JACQ")
        tech = Entity(entity_type=EntityType.CONCEPT, name="Python")
        
        store.add_entity(user)
        store.add_entity(project)
        store.add_entity(tech)
        
        # Connect them
        # Joshua --works_on--> JACQ
        f1 = Fact(subject_id=user.id, predicate="works_on", object_id=project.id)
        # JACQ --uses--> Python
        f2 = Fact(subject_id=project.id, predicate="uses", object_id=tech.id)
        
        store.add_fact(f1)
        store.add_fact(f2)
        
        # Search from User (2 hops max)
        related = store.find_related_entities(user.id, max_hops=2)
        
        assert project.id in related # 1 hop
        assert tech.id in related    # 2 hops
    
    def test_cleanup_pass(self):
        """Should identify stale facts for cleanup."""
        store = MemoryStore()
        
        # Create a stale confirmed fact
        old_fact = Fact(
            subject_id="ent_1", 
            predicate="was_at", 
            value="old_place",
            status=FactStatus.CONFIRMED,
            relevance=0.1, # Below 0.2 threshold
            last_accessed=datetime.utcnow() - timedelta(weeks=10)
        )
        store.add_fact(old_fact)
        
        cleaned_count = store.run_decay_pass()
        assert cleaned_count == 1
        # Relevance should have dropped further
        assert old_fact.relevance == 0.0
