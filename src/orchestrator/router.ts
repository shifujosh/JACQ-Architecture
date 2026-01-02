/**
 * Orchestrator: Intent Router
 *
 * Routes user intent to specialized capabilities.
 * The router analyzes input and determines which
 * "app" or capability should handle it.
 *
 * This is the "brain" that coordinates work.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Available capabilities the orchestrator can invoke.
 */
export type Capability =
  | 'research'  // Web search, document analysis
  | 'write'     // Content creation, editing
  | 'code'      // Programming, debugging
  | 'create'    // Image/media generation
  | 'remember'  // Memory storage/retrieval
  | 'reflect';  // Self-analysis, planning

/**
 * Result of intent analysis.
 */
export interface RoutingDecision {
  /** Primary capability to handle this request */
  primaryCapability: Capability;
  /** Secondary capabilities that may assist */
  secondaryCapabilities: Capability[];
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** Brief summary of detected intent */
  intentSummary: string;
  /** Whether this request requires memory context */
  requiresMemory: boolean;
}

/**
 * Pattern-based routing rule.
 */
interface RoutingPattern {
  /** Regular expression patterns to match */
  patterns: RegExp[];
  /** Base confidence when matched */
  baseConfidence: number;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Pattern-based routing rules (fast path).
 * Each capability has a list of patterns that strongly indicate it.
 */
const ROUTING_PATTERNS: Record<Capability, RoutingPattern> = {
  research: {
    patterns: [
      /\b(search|find|look up|google|research|what is|who is|when did)\b/i,
      /\b(learn about|investigate|explore|discover)\b/i,
      /\b(compare|contrast|analyze|review)\b/i,
      /\?$/,  // Questions often indicate research
    ],
    baseConfidence: 0.7,
  },
  write: {
    patterns: [
      /\b(write|draft|compose|create a document|blog post|article)\b/i,
      /\b(edit|revise|rewrite|proofread|polish)\b/i,
      /\b(summarize|outline|expand|elaborate)\b/i,
      /\b(email|letter|memo|report)\b/i,
    ],
    baseConfidence: 0.8,
  },
  code: {
    patterns: [
      /\b(code|program|debug|fix|implement|function|class|api)\b/i,
      /\b(typescript|javascript|python|react|node)\b/i,
      /\b(bug|error|exception|crash|test)\b/i,
      /\b(refactor|optimize|deploy|build)\b/i,
      /```[\s\S]*```/,  // Code blocks strongly indicate coding
    ],
    baseConfidence: 0.85,
  },
  create: {
    patterns: [
      /\b(image|picture|photo|illustration|graphic|visual)\b/i,
      /\b(generate|create|make|design|draw)\s+(an?\s+)?(image|picture)/i,
      /\b(logo|icon|banner|thumbnail)\b/i,
      /\b(diagram|chart|visualization)\b/i,
    ],
    baseConfidence: 0.9,
  },
  remember: {
    patterns: [
      /\b(remember|save|store|note|bookmark)\b/i,
      /\b(remind me|don't forget|keep in mind)\b/i,
      /\b(my preference|i prefer|i like|i always)\b/i,
    ],
    baseConfidence: 0.75,
  },
  reflect: {
    patterns: [
      /\b(plan|strategy|roadmap|architecture)\b/i,
      /\b(think about|consider|evaluate|assess)\b/i,
      /\b(pros and cons|tradeoffs|options)\b/i,
      /\b(how should i|what approach|best way to)\b/i,
    ],
    baseConfidence: 0.7,
  },
};

/**
 * Patterns that indicate the request references past context.
 */
const MEMORY_REFERENCE_PATTERNS = [
  /\b(earlier|before|previously|last time)\b/i,
  /\b(we discussed|you said|I mentioned)\b/i,
  /\b(continue|resume|pick up where)\b/i,
  /\b(as I said|like I told you|remember when)\b/i,
];

// ============================================================================
// Intent Router
// ============================================================================

/**
 * Intent Router
 *
 * Analyzes user input and routes to appropriate capability.
 * Uses heuristics and patterns to make fast routing decisions.
 */
export class IntentRouter {
  /**
   * Route a user message to the appropriate capability.
   *
   * @param userInput - The user's message
   * @returns Routing decision with primary and secondary capabilities
   */
  route(userInput: string): RoutingDecision {
    const input = userInput.trim();
    const scores = this.scoreAllCapabilities(input);

    // Sort by score descending
    const sorted = scores.sort((a, b) => b.score - a.score);

    // Primary = highest scoring
    const primary = sorted[0] ?? { capability: 'reflect' as Capability, score: 0.5 };

    // Secondary = any other capabilities with score > 0.3
    const secondary = sorted
      .slice(1)
      .filter((s) => s.score > 0.3)
      .map((s) => s.capability);

    // Check if memory context is needed
    const requiresMemory =
      primary.capability === 'remember' ||
      secondary.includes('remember') ||
      this.mentionsPastContext(input);

    return {
      primaryCapability: primary.capability,
      secondaryCapabilities: secondary,
      confidence: Math.min(primary.score + 0.2, 1.0), // Boost confidence
      intentSummary: this.summarizeIntent(input, primary.capability),
      requiresMemory,
    };
  }

  /**
   * Score all capabilities based on pattern matching.
   */
  private scoreAllCapabilities(
    input: string
  ): Array<{ capability: Capability; score: number }> {
    const results: Array<{ capability: Capability; score: number }> = [];

    for (const [cap, config] of Object.entries(ROUTING_PATTERNS)) {
      const capability = cap as Capability;
      let matchCount = 0;

      for (const pattern of config.patterns) {
        if (pattern.test(input)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        // Score increases with number of matches, capped at base + 0.2
        const score = Math.min(
          config.baseConfidence + matchCount * 0.05,
          config.baseConfidence + 0.2
        );
        results.push({ capability, score });
      }
    }

    // If no patterns matched, default to reflect with low confidence
    if (results.length === 0) {
      results.push({ capability: 'reflect', score: 0.4 });
    }

    return results;
  }

  /**
   * Check if input references past context/history.
   */
  private mentionsPastContext(text: string): boolean {
    return MEMORY_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
  }

  /**
   * Generate a brief summary of the detected intent.
   */
  private summarizeIntent(_text: string, capability: Capability): string {
    const summaries: Record<Capability, string> = {
      research: 'User wants to find or learn information',
      write: 'User wants to create or edit content',
      code: 'User wants to write or modify code',
      create: 'User wants to generate visual content',
      remember: 'User wants to save information for later',
      reflect: 'User wants to plan or analyze',
    };

    return summaries[capability] ?? 'Processing user request';
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a default router instance.
 */
export function createRouter(): IntentRouter {
  return new IntentRouter();
}

/**
 * Quick route function for simple use cases.
 */
export function routeIntent(userInput: string): RoutingDecision {
  const router = new IntentRouter();
  return router.route(userInput);
}

/**
 * Check if a capability requires external tools.
 */
export function requiresExternalTools(capability: Capability): boolean {
  return capability === 'research' || capability === 'create';
}

/**
 * Get the display name for a capability.
 */
export function getCapabilityDisplayName(capability: Capability): string {
  const names: Record<Capability, string> = {
    research: 'Research',
    write: 'Write',
    code: 'Code',
    create: 'Create',
    remember: 'Remember',
    reflect: 'Reflect',
  };
  return names[capability];
}
