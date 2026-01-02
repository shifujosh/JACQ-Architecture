"""
Memory System Schema

Pydantic models for the Entity-Fact memory graph.
This schema enables persistent context across sessions.

Key Concepts:
- Entities: People, projects, concepts, decisions, preferences
- Facts: Relationships and attributes about entities
- Staging: New facts are staged before being confirmed
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Any
from pydantic import BaseModel, Field
import uuid


class EntityType(str, Enum):
    """Types of entities the system can remember."""
    PERSON = "person"
    PROJECT = "project"
    CONCEPT = "concept"
    DECISION = "decision"
    PREFERENCE = "preference"
    FILE = "file"
    CONVERSATION = "conversation"


class FactStatus(str, Enum):
    """Lifecycle status of a fact."""
    STAGED = "staged"        # Newly learned, not yet validated
    CONFIRMED = "confirmed"  # Validated through repeated access
    SUPERSEDED = "superseded"  # Replaced by newer fact
    RETRACTED = "retracted"  # Explicitly invalidated


class Entity(BaseModel):
    """
    A node in the memory graph.
    
    Entities represent things the system remembers:
    people, projects, concepts, decisions, preferences.
    """
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: EntityType
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict = Field(default_factory=dict)
    
    def __hash__(self):
        return hash(self.id)
    
    def __eq__(self, other):
        if isinstance(other, Entity):
            return self.id == other.id
        return False


class Fact(BaseModel):
    """
    An edge or attribute in the memory graph.
    
    Facts represent relationships between entities
    or attributes of a single entity.
    
    Examples:
    - "Joshua" --works_on--> "JACQ"  (relationship)
    - "Joshua" --prefers--> "dark mode"  (attribute)
    """
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    subject_id: str = Field(..., description="Entity this fact is about")
    predicate: str = Field(..., description="The relationship or attribute type")
    object_id: Optional[str] = Field(None, description="Target entity (for relationships)")
    value: Optional[Any] = Field(None, description="Attribute value (for attributes)")
    
    status: FactStatus = Field(default=FactStatus.STAGED)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    access_count: int = Field(default=0)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed: datetime = Field(default_factory=datetime.utcnow)
    source: Optional[str] = Field(None, description="Where this fact was learned")
    
    def is_relationship(self) -> bool:
        """Check if this fact represents a relationship."""
        return self.object_id is not None
    
    def is_attribute(self) -> bool:
        """Check if this fact represents an attribute."""
        return self.value is not None


class Interaction(BaseModel):
    """
    A record of user-system interaction.
    
    Used to extract new facts and reinforce existing ones.
    """
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    user_input: str
    system_response: str
    entities_mentioned: List[str] = Field(default_factory=list)
    facts_created: List[str] = Field(default_factory=list)
    facts_accessed: List[str] = Field(default_factory=list)


class MemoryContext(BaseModel):
    """
    Context retrieved for a query.
    
    This is what gets injected into the AI's context
    to enable persistent memory.
    """
    
    relevant_entities: List[Entity] = Field(default_factory=list)
    relevant_facts: List[Fact] = Field(default_factory=list)
    recent_interactions: List[Interaction] = Field(default_factory=list)
    
    def to_prompt_context(self) -> str:
        """Format context for injection into AI prompt."""
        lines = ["## Memory Context", ""]
        
        if self.relevant_entities:
            lines.append("### Known Entities")
            for entity in self.relevant_entities:
                lines.append(f"- **{entity.name}** ({entity.entity_type.value})")
                if entity.description:
                    lines.append(f"  {entity.description}")
            lines.append("")
        
        if self.relevant_facts:
            lines.append("### Relevant Facts")
            for fact in self.relevant_facts:
                if fact.is_relationship():
                    lines.append(f"- {fact.predicate}: relates to entity {fact.object_id}")
                else:
                    lines.append(f"- {fact.predicate}: {fact.value}")
            lines.append("")
        
        return "\n".join(lines)
