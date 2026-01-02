"""
Orchestrator: Intent Router

Routes user intent to specialized capabilities.
The router analyzes input and determines which
"app" or capability should handle it.

This is the "brain" that coordinates work.
"""

from enum import Enum
from typing import List, Optional, Tuple
from dataclasses import dataclass
import re


class Capability(str, Enum):
    """Available capabilities the orchestrator can invoke."""
    RESEARCH = "research"      # Web search, document analysis
    WRITE = "write"            # Content creation, editing
    CODE = "code"              # Programming, debugging
    CREATE = "create"          # Image/media generation
    REMEMBER = "remember"      # Memory storage/retrieval
    REFLECT = "reflect"        # Self-analysis, planning


@dataclass
class RoutingDecision:
    """Result of intent analysis."""
    primary_capability: Capability
    secondary_capabilities: List[Capability]
    confidence: float
    intent_summary: str
    requires_memory: bool


class IntentRouter:
    """
    Analyzes user input and routes to appropriate capability.
    
    The router uses heuristics and patterns to make fast
    routing decisions. For complex cases, it can invoke
    the LLM for classification.
    """
    
    # Pattern-based routing rules (fast path)
    PATTERNS = {
        Capability.RESEARCH: [
            r"\b(search|find|look up|research|what is|who is)\b",
            r"\b(latest|news|current|recent)\b",
        ],
        Capability.WRITE: [
            r"\b(write|draft|compose|create.*(?:email|doc|post))\b",
            r"\b(edit|revise|rewrite|summarize)\b",
        ],
        Capability.CODE: [
            r"\b(code|implement|debug|fix.*(?:bug|error))\b",
            r"\b(function|class|api|test)\b",
            r"```",  # Code blocks
        ],
        Capability.CREATE: [
            r"\b(generate.*image|create.*visual|design)\b",
            r"\b(diagram|chart|illustration)\b",
        ],
        Capability.REMEMBER: [
            r"\b(remember|save|store|note)\b",
            r"\b(don't forget|keep in mind)\b",
        ],
        Capability.REFLECT: [
            r"\b(plan|think|analyze|strategize)\b",
            r"\b(what should|how should|next steps)\b",
        ],
    }
    
    def __init__(self):
        """Initialize router with compiled patterns."""
        self.compiled_patterns = {
            cap: [re.compile(p, re.IGNORECASE) for p in patterns]
            for cap, patterns in self.PATTERNS.items()
        }
    
    def _score_capability(self, text: str, capability: Capability) -> float:
        """Score how well text matches a capability's patterns."""
        patterns = self.compiled_patterns.get(capability, [])
        matches = sum(1 for p in patterns if p.search(text))
        return matches / max(len(patterns), 1)
    
    def route(self, user_input: str) -> RoutingDecision:
        """
        Route user input to appropriate capability.
        
        Returns a RoutingDecision with primary and secondary
        capabilities, along with confidence score.
        """
        # Score all capabilities
        scores: List[Tuple[Capability, float]] = [
            (cap, self._score_capability(user_input, cap))
            for cap in Capability
        ]
        
        # Sort by score descending
        scores.sort(key=lambda x: x[1], reverse=True)
        
        primary = scores[0]
        secondary = [cap for cap, score in scores[1:3] if score > 0]
        
        # Check if memory is needed
        requires_memory = (
            Capability.REMEMBER in [primary[0]] + secondary
            or self._mentions_past_context(user_input)
        )
        
        return RoutingDecision(
            primary_capability=primary[0],
            secondary_capabilities=secondary,
            confidence=min(primary[1] + 0.3, 1.0),  # Boost base confidence
            intent_summary=self._summarize_intent(user_input, primary[0]),
            requires_memory=requires_memory,
        )
    
    def _mentions_past_context(self, text: str) -> bool:
        """Check if input references past context/history."""
        past_refs = [
            r"\b(earlier|before|previously|last time)\b",
            r"\b(we discussed|you said|I mentioned)\b",
            r"\b(continue|resume|pick up where)\b",
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in past_refs)
    
    def _summarize_intent(self, text: str, capability: Capability) -> str:
        """Generate a brief summary of the detected intent."""
        summaries = {
            Capability.RESEARCH: "User wants to find or learn information",
            Capability.WRITE: "User wants to create or edit content",
            Capability.CODE: "User wants to write or modify code",
            Capability.CREATE: "User wants to generate visual content",
            Capability.REMEMBER: "User wants to save information for later",
            Capability.REFLECT: "User wants to plan or analyze",
        }
        return summaries.get(capability, "Processing user request")
