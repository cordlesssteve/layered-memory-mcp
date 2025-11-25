# Layered Memory MCP Server - Prompts

This document describes the high-level workflow prompts available in the Layered
Memory MCP Server. These prompts provide user-friendly interfaces that
orchestrate multiple tool calls to accomplish common memory management tasks.

## Overview

Prompts are exposed through the MCP protocol and appear as convenient shortcuts
in Claude Code. They combine multiple tool operations with intelligent guidance
to provide seamless workflows.

## Available Prompts

### 1. `remember-this`

**Purpose:** Store an important piece of information, decision, or learning for
future recall.

**Arguments:**

- `content` (required): The information to remember (decision, learning,
  pattern, etc.)
- `category` (optional): Memory category - `decision`, `knowledge`, `pattern`,
  `progress`, or `task`
- `priority` (optional): Importance level (1-10, default: 5)

**Example Usage:**

```
/remember-this "We decided to use PostgreSQL over MongoDB because we need ACID compliance and complex relationships"
```

**What it does:**

1. Stores the content using `store_memory` tool
2. Automatically categorizes and prioritizes
3. Detects and creates relationships with related memories
4. Confirms the memory ID and storage layer

---

### 2. `recall-decision`

**Purpose:** Find architectural decisions, design choices, or technical
decisions about a topic.

**Arguments:**

- `topic` (required): The topic, feature, or component to find decisions about
- `project` (optional): Limit to specific project

**Example Usage:**

```
/recall-decision "authentication strategy"
```

**What it does:**

1. Searches for decisions using multiple query strategies
2. Filters by "decision" category
3. Extracts reasoning and rationale
4. Shows trade-offs and alternatives considered
5. Provides timestamps and related decisions via graph

---

### 3. `find-pattern`

**Purpose:** Search for similar problems, solutions, or patterns from past work.

**Arguments:**

- `description` (required): Describe the problem or pattern you're looking for
- `threshold` (optional): Similarity threshold (0-1, default: 0.7)

**Example Usage:**

```
/find-pattern "handling circular dependencies in TypeScript modules"
```

**What it does:**

1. Uses semantic search to find similar problems
2. Filters for "pattern" and "knowledge" categories
3. Shows solutions that worked (and didn't work)
4. Displays confidence scores for each match
5. Explores related memories via graph connections

---

### 4. `review-learnings`

**Purpose:** Review accumulated knowledge and patterns about a topic.

**Arguments:**

- `topic` (required): The topic to review learnings about

**Example Usage:**

```
/review-learnings "React hooks performance"
```

**What it does:**

1. Searches knowledge and pattern categories
2. Identifies key concepts and principles
3. Highlights recurring patterns and best practices
4. Shows common pitfalls and avoidance strategies
5. Displays evolution of understanding over time
6. Identifies gaps in knowledge

---

### 5. `connect-memories`

**Purpose:** Explore how concepts or memories are related through the knowledge
graph.

**Arguments:**

- `topic` (required): The topic or memory ID to explore connections for
- `depth` (optional): How many relationship hops to traverse (1-5, default: 2)

**Example Usage:**

```
/connect-memories "microservices architecture" 2
```

**What it does:**

1. Finds the target memory
2. Uses graph operations to explore relationships
3. Visualizes direct and indirect connections
4. Shows relationship types (TEMPORAL, SEMANTIC, REFERENCES, etc.)
5. Displays relationship strengths
6. Reveals clusters and key connecting nodes

---

### 6. `review-recent-work`

**Purpose:** Summarize recent progress, decisions, and learnings from a time
period.

**Arguments:**

- `days` (optional): Number of days to look back (default: 7)
- `project` (optional): Limit to specific project

**Example Usage:**

```
/review-recent-work 14
```

**What it does:**

1. Uses temporal search for the specified period
2. Identifies major decisions made
3. Highlights key learnings and patterns discovered
4. Shows progress on ongoing tasks
5. Lists problems solved and solutions found
6. Reveals emerging themes or trends
7. Suggests next steps based on trajectory

---

### 7. `consolidate-knowledge`

**Purpose:** Summarize and consolidate everything known about a topic.

**Arguments:**

- `topic` (required): The topic to consolidate knowledge about

**Example Usage:**

```
/consolidate-knowledge "error handling strategies"
```

**What it does:**

1. Uses advanced search with all features enabled
2. Identifies related memories via graph traversal
3. Creates cluster summaries
4. Shows evolution over time (earliest to latest)
5. Presents comprehensive knowledge summary including:
   - Core concepts and principles
   - Historical context and evolution
   - Related topics and dependencies
   - Decisions and rationale
   - Patterns and best practices
   - Current state and open questions

---

## How Prompts Work

### MCP Protocol Integration

Prompts are exposed through the MCP protocol's prompt capability:

```typescript
capabilities: {
  tools: {},
  prompts: {},
}
```

### Workflow Orchestration

Each prompt:

1. Accepts user-friendly arguments
2. Constructs appropriate tool calls
3. Provides guidance on interpreting results
4. Suggests follow-up actions

### Claude Code Integration

In Claude Code, prompts appear as convenient shortcuts that users can invoke to
trigger complex workflows without manually calling individual tools.

## Best Practices

### When to Use Prompts

- **Use prompts** for common, high-level workflows
- **Use prompts** when you want guided assistance
- **Use prompts** for multi-step operations

### When to Use Direct Tools

- **Use tools** for specific, low-level operations
- **Use tools** when building custom workflows
- **Use tools** for programmatic access

### Prompt Chaining

Prompts can be chained together for complex workflows:

1. Start with `remember-this` to capture information
2. Use `connect-memories` to see relationships
3. Follow with `consolidate-knowledge` for comprehensive summary

## Implementation Details

### Location

All prompt definitions and handlers are in `src/index.ts`:

- Prompt definitions: Lines 631-740
- ListPromptsRequestSchema handler: Lines 742-745
- GetPromptRequestSchema handler: Lines 747-976

### Schema

Each prompt follows the MCP prompt schema:

```typescript
{
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}
```

### Response Format

Prompt handlers return messages that guide Claude to:

1. Use appropriate tools with specific parameters
2. Process and interpret results
3. Present findings in structured format

## Future Enhancements

Potential additions to the prompt library:

- **`compare-approaches`**: Compare different solutions to the same problem
- **`track-evolution`**: Show how understanding evolved over time
- **`identify-gaps`**: Find areas lacking documentation or knowledge
- **`suggest-priorities`**: Recommend what to focus on next based on memory
  decay predictions

## Related Documentation

- [MCP Tools Reference](./TOOLS.md) - Low-level tool documentation
- [Graph Database Integration](./GRAPH_DATABASE_INTEGRATION.md) - Graph
  operations used by prompts
- [Memory Router](./MEMORY_ROUTER.md) - Routing logic for memory operations
