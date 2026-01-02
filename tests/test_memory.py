"""
Unit tests for the Memory System.

Tests cover entity/fact creation, staging lifecycle,
and context retrieval.

Run with: pytest tests/test_memory.py -v
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
    Interaction,
    MemoryContext,
)


class TestEntity:
    """Tests for Entity model."""

    def test_create_entity(self):
        """Entity should be created with defaults."""
        entity = Entity(
            entity_type=EntityType.PERSON,
            name="Joshua"
        )
        assert entity.name == "Joshua"
        assert entity.entity_type == EntityType.PERSON
        assert entity.id is not None
        assert entity.created_at is not None

    def test_entity_with_metadata(self):
        """Entity should support arbitrary metadata."""
        entity = Entity(
            entity_type=EntityType.PROJECT,
            name="JACQ",
            description="Cognitive Operating System",
            metadata={"status": "active", "priority": "high"}
        )
        assert entity.metadata["status"] == "active"
        assert entity.description == "Cognitive Operating System"

    def test_entity_equality(self):
        """Two entities with same ID should be equal."""
        entity1 = Entity(entity_type=EntityType.CONCEPT, name="Test")
        entity2 = Entity(
            id=entity1.id,
            entity_type=EntityType.CONCEPT,
            name="Test"
        )
        assert entity1 == entity2


class TestFact:
    """Tests for Fact model."""

    def test_create_relationship_fact(self):
        """Fact can represent a relationship between entities."""
        fact = Fact(
            subject_id="entity_1",
            predicate="works_on",
            object_id="entity_2"
        )
        assert fact.is_relationship() is True
        assert fact.is_attribute() is False
        assert fact.status == FactStatus.STAGED

    def test_create_attribute_fact(self):
        """Fact can represent an attribute value."""
        fact = Fact(
            subject_id="entity_1",
            predicate="prefers_theme",
            value="dark_mode"
        )
        assert fact.is_attribute() is True
        assert fact.is_relationship() is False

    def test_fact_staging_lifecycle(self):
        """Fact should start staged and be confirmable."""
        fact = Fact(
            subject_id="entity_1",
            predicate="knows",
            object_id="entity_2"
        )
        assert fact.status == FactStatus.STAGED
        
        # Simulate confirmation
        fact.status = FactStatus.CONFIRMED
        fact.access_count = 3
        assert fact.status == FactStatus.CONFIRMED

    def test_fact_confidence(self):
        """Fact confidence should be bounded 0-1."""
        fact = Fact(
            subject_id="entity_1",
            predicate="test",
            value="test",
            confidence=0.8
        )
        assert fact.confidence == 0.8
        
        # Pydantic should reject out-of-range values
        with pytest.raises(ValueError):
            Fact(
                subject_id="entity_1",
                predicate="test",
                value="test",
                confidence=1.5
            )


class TestMemoryContext:
    """Tests for context retrieval and formatting."""

    def test_empty_context(self):
        """Empty context should format cleanly."""
        context = MemoryContext()
        prompt = context.to_prompt_context()
        assert "## Memory Context" in prompt

    def test_context_with_entities(self):
        """Context should include entity information."""
        entity = Entity(
            entity_type=EntityType.PROJECT,
            name="JACQ",
            description="AI workspace"
        )
        context = MemoryContext(relevant_entities=[entity])
        prompt = context.to_prompt_context()
        
        assert "JACQ" in prompt
        assert "project" in prompt
        assert "AI workspace" in prompt

    def test_context_with_facts(self):
        """Context should include fact information."""
        fact = Fact(
            subject_id="entity_1",
            predicate="prefers",
            value="concise responses"
        )
        context = MemoryContext(relevant_facts=[fact])
        prompt = context.to_prompt_context()
        
        assert "prefers" in prompt
        assert "concise responses" in prompt


class TestInteraction:
    """Tests for interaction logging."""

    def test_create_interaction(self):
        """Interaction should capture session data."""
        interaction = Interaction(
            session_id="session_123",
            user_input="What was the project we discussed?",
            system_response="You mentioned JACQ, the cognitive OS.",
            entities_mentioned=["entity_jacq"],
            facts_accessed=["fact_1", "fact_2"]
        )
        assert interaction.session_id == "session_123"
        assert len(interaction.facts_accessed) == 2
        assert interaction.timestamp is not None
