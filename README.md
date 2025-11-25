# Layered Memory MCP Server

[![Production Ready](https://img.shields.io/badge/status-production%20ready-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)]()
[![Tests](https://img.shields.io/badge/tests-763%20passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/coverage-49.57%25-yellow)]()

## Overview

Advanced hierarchical memory management system for Claude Code that provides
intelligent, context-aware memory storage and retrieval with semantic search,
graph relationships, and temporal patterns.

## Features

### Core Memory System ✅

- **4-Layer Hierarchy**: Session → Project → Global → Temporal
- **Intelligent Routing**: Automatic layer selection based on context
- **Multiple Search Modes**: Keyword, semantic, temporal, and graph-based search
- **Memory Categorization**: Decision, knowledge, pattern, progress, task
- **Priority Scoring**: Importance levels (1-10) for memory ranking

### Advanced Capabilities ✅

- **Knowledge Graph Integration**: Neo4j-backed relationship mapping with 6
  relationship types
- **Semantic Search**: Vector-based similarity matching (threshold 0.7)
- **Temporal Analysis**: Time-based pattern detection and evolution tracking
- **Memory Evolution**: Automatic relationship detection, conflict detection,
  version history
- **Decay Prediction**: ML-based prediction of memory importance over time

### High-Level Prompts 🆕

- **7 User-Friendly Workflows**: `remember-this`, `recall-decision`,
  `find-pattern`, `review-learnings`, `connect-memories`, `review-recent-work`,
  `consolidate-knowledge`
- **Orchestrated Tool Calls**: Automatic multi-step workflows with intelligent
  guidance
- **Claude Code Integration**: Seamless user experience with convenient
  shortcuts

### Production Features ✅

- **Security**: Rate limiting, request validation, input sanitization
- **Monitoring**: Telemetry, performance tracking, slow operation detection
- **Testing**: 763 functional tests passing (100% pass rate)
- **Type Safety**: Strict TypeScript with 0 compilation errors

## Quick Start

### Installation

```bash
npm install
npm run build
```

### Configuration

The server uses Neo4j for graph database operations. Configure via environment
variables:

```bash
export NEO4J_URI=neo4j://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=your_password
```

### Running the Server

```bash
npm start
```

Or add to your Claude Code MCP configuration (`~/.claude.json`):

```json
{
  "mcpServers": {
    "layered-memory": {
      "command": "node",
      "args": ["/path/to/layered-memory/dist/index.js"],
      "env": {
        "NEO4J_URI": "neo4j://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your_password"
      }
    }
  }
}
```

## Usage

### Using Prompts (Recommended)

High-level workflows for common tasks:

```
# Store important information
/remember-this "We use PostgreSQL for ACID compliance"

# Find past decisions
/recall-decision "authentication strategy"

# Search for similar patterns
/find-pattern "handling circular dependencies"

# Review learnings
/review-learnings "React hooks performance"

# Explore connections
/connect-memories "microservices architecture"

# Review recent work
/review-recent-work 14

# Consolidate knowledge
/consolidate-knowledge "error handling strategies"
```

### Using Tools Directly

Low-level operations for custom workflows:

```typescript
// Store a memory
await store_memory({
  content: 'Decided to use event-driven architecture',
  category: 'decision',
  priority: 8,
  tags: ['architecture', 'scalability'],
});

// Search memories
await search_memory({
  query: 'architecture decisions',
  category: 'decision',
  limit: 10,
});

// Advanced search
await advanced_search({
  query: 'performance optimization',
  semanticSearch: { enabled: true, threshold: 0.7 },
  relationships: { enabled: true, maxDepth: 2 },
  temporalPatterns: { enabled: true },
});

// Graph operations
await graph_search({
  query: 'microservices',
  maxDepth: 2,
  limit: 10,
});
```

## Architecture

```
┌─────────────────────────────────────┐
│        MCP PROTOCOL LAYER           │
│  31 Tools + 7 Prompts               │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│     MONITORED MEMORY ROUTER         │
│  • Intelligent Layer Routing        │
│  • Advanced Search Engine           │
│  • Security & Monitoring            │
│  • Graph Integration                │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│      4-LAYER HIERARCHY              │
│  SESSION → PROJECT → GLOBAL → TEMP  │
│  All layers operational with        │
│  optimized storage and indexing     │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│       NEO4J GRAPH LAYER             │
│  6 Relationship Types               │
│  Auto-linking Heuristics            │
│  Graph Traversal & Pathfinding      │
└─────────────────────────────────────┘
```

## Documentation

- **[Prompts Guide](./docs/PROMPTS.md)** - High-level workflow prompts
- **[Graph Integration](./docs/GRAPH_DATABASE_INTEGRATION.md)** - Neo4j
  integration details
- **[API Reference](./docs/API.md)** - Tool specifications
- **[Development Guide](./docs/DEVELOPMENT.md)** - Contributing guidelines

## Status

**Production Ready** - All 3 phases complete:

1. ✅ **Phase 1**: Core memory system with 4 layers
2. ✅ **Phase 2**: Graph integration with Neo4j
3. ✅ **Phase 3**: Advanced features (semantic search, temporal patterns, memory
   evolution)
4. ✅ **Prompts**: 7 high-level workflow prompts for enhanced UX

**Current Capabilities:**

- 22 memories seeded from project history
- 763/763 functional tests passing (100%)
- 49.57% test coverage (near 50% threshold)
- Graph integration validated (81.5% test coverage)
- Production monitoring and security enabled

## Performance

- **Sub-100ms Query Response**: Basic search operations
- **Semantic Search**: Vector similarity with 0.7 threshold
- **Graph Traversal**: Up to 5-hop relationship exploration
- **Concurrent Users**: Rate limiting supports 100+ concurrent users

## Contributing

See [DEVELOPMENT.md](./docs/DEVELOPMENT.md) for:

- Development setup
- Testing guidelines
- Code quality standards
- Contribution workflow

## License

MIT

## Support

For issues, questions, or contributions, please open an issue on GitHub.
