# JACQ: Multi-Agent Orchestration Environment

> **[Proprietary Architecture - Concept Whitepaper]**

JACQ is a "Cognitive Operating System" designed to solve context drift in complex logical tasks. It applies the rigors of **"Data Physics"** (strict schemas, type safety) to the probabilistic nature of LLMs.

## System Architecture

```mermaid
graph TD
    %% --- Styling (Dark Mode Native) ---
    classDef user fill:#1e293b,stroke:#f59e0b,stroke-width:2px,color:#f59e0b;
    classDef brain fill:#1e293b,stroke:#a855f7,stroke-width:2px,color:#d8b4fe;
    classDef swarm fill:#1e293b,stroke:#3b82f6,stroke-width:1px,color:#93c5fd;
    classDef data fill:#1e293b,stroke:#0ea5e9,stroke-width:2px,color:#7dd3fc;

    User[User / Developer]:::user -->|CLI Command| Orch[Orchestrator Agent]:::brain
    
    subgraph "Context Management Layer"
        Orch <-->|Read/Write| ShortMem[Short Term Memory]:::data
        Orch <-->|RAG Retrieval| LongMem[(Vector Store / Codebase)]:::data
    end
    
    subgraph "Agent Swarm"
        Orch -->|Delegates Task| Coder[Coding Agent]:::swarm
        Orch -->|Delegates Review| Reviewer[Reviewer Agent]:::swarm
        Orch -->|Delegates Ops| QA[QA/Test Agent]:::swarm
    end
    
    Coder -->|Generates Syntax| Sandbox[Execution Environment]:::data
    Reviewer -->|Validates Logic| Sandbox
    Sandbox -->|Result/Error| Orch
```

## Core Components

### 1. The Orchestrator
Acts as the system bus. It does not write code; it plans, delegates, and reviews. It maintains the "Thread State" ensuring that no context is lost between agent hand-offs.

### 2. Context Management
- **Short Term Memory:** Ephemeral scratchpad for the current task.
- **Long Term Memory:** Vector-based retrieval for codebase understanding and historical decisions.

### 3. Agent Swarm
Specialized agents with narrow prompts and tools:
- **Coder:** Pure generation.
- **Reviewer:** Linting, logic checking, and security validation.
- **QA:** Running tests and verifying acceptance criteria.
