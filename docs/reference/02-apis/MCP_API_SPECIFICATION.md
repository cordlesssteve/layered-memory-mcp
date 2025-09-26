# MCP API Specification - Layered Memory MCP Server

**Status**: ACTIVE  
**Created**: 2025-09-25  
**Last Updated**: 2025-09-25  
**Version**: 1.0  
**MCP Protocol Version**: 1.0  

## API Overview

The Layered Memory MCP Server provides a comprehensive set of tools for intelligent memory management across four hierarchical layers. The API is designed for seamless integration with MCP-compatible clients while providing advanced memory operations and intelligent retrieval.

## Server Configuration

### Server Metadata
```json
{
  "name": "layered-memory",
  "version": "1.0.0",
  "description": "Intelligent hierarchical memory management with cross-project insights",
  "author": "Layered Memory Team",
  "license": "MIT",
  "protocolVersion": "1.0",
  "capabilities": {
    "tools": {},
    "resources": {},
    "prompts": {}
  }
}
```

### Initialization Parameters
```json
{
  "serverUrl": "mcp://layered-memory",
  "config": {
    "databasePath": "./data/layered_memory.db",
    "vectorDbUrl": "http://localhost:6333",
    "graphDbUrl": "bolt://localhost:7687",
    "cacheUrl": "redis://localhost:6379",
    "enableDecay": true,
    "enableCrossProjectInsights": true,
    "logLevel": "info"
  }
}
```

---

## Tools API

### Memory Management Tools

#### 1. Create Memory
**Tool Name**: `create_memory`  
**Description**: Create a new memory item in the appropriate layers

```json
{
  "name": "create_memory",
  "description": "Create a new memory item with automatic layer assignment and categorization",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Brief title for the memory"
      },
      "content": {
        "type": "string", 
        "description": "Full content of the memory"
      },
      "memoryType": {
        "type": "string",
        "enum": ["decision", "task", "progress", "insight", "pattern", "error", "solution", "note"],
        "description": "Type of memory being created"
      },
      "category": {
        "type": "string",
        "description": "Optional category (will be auto-detected if not provided)"
      },
      "tags": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Optional tags for the memory"
      },
      "importance": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Importance score (0-1), will be auto-calculated if not provided"
      },
      "projectId": {
        "type": "string",
        "description": "Optional project ID to associate with this memory"
      },
      "context": {
        "type": "object",
        "description": "Additional context (file paths, line numbers, git info, etc.)"
      },
      "isPrivate": {
        "type": "boolean",
        "default": false,
        "description": "Whether this memory should be kept private"
      }
    },
    "required": ["title", "content", "memoryType"]
  }
}
```

**Response Schema**:
```json
{
  "type": "object",
  "properties": {
    "memoryId": {"type": "string"},
    "layerAssignments": {
      "type": "array", 
      "items": {"type": "string", "enum": ["session", "project", "global", "temporal"]}
    },
    "autoCategory": {"type": "string"},
    "importanceScore": {"type": "number"},
    "relatedMemories": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "memoryId": {"type": "string"},
          "title": {"type": "string"},
          "relationshipType": {"type": "string"},
          "strength": {"type": "number"}
        }
      }
    }
  }
}
```

#### 2. Get Memory
**Tool Name**: `get_memory`  
**Description**: Retrieve a specific memory item by ID

```json
{
  "name": "get_memory",
  "description": "Retrieve a memory item by its ID with full details",
  "inputSchema": {
    "type": "object", 
    "properties": {
      "memoryId": {
        "type": "string",
        "description": "Unique identifier of the memory to retrieve"
      },
      "includeVersions": {
        "type": "boolean",
        "default": false,
        "description": "Include version history of the memory"
      },
      "includeRelationships": {
        "type": "boolean", 
        "default": true,
        "description": "Include related memories"
      }
    },
    "required": ["memoryId"]
  }
}
```

#### 3. Update Memory
**Tool Name**: `update_memory`  
**Description**: Update an existing memory item

```json
{
  "name": "update_memory",
  "description": "Update an existing memory item with versioning support",
  "inputSchema": {
    "type": "object",
    "properties": {
      "memoryId": {"type": "string"},
      "title": {"type": "string"},
      "content": {"type": "string"},
      "category": {"type": "string"},
      "tags": {
        "type": "array",
        "items": {"type": "string"}
      },
      "importance": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "changeReason": {
        "type": "string",
        "description": "Reason for the update"
      }
    },
    "required": ["memoryId"]
  }
}
```

#### 4. Delete Memory  
**Tool Name**: `delete_memory`  
**Description**: Delete or archive a memory item

```json
{
  "name": "delete_memory",
  "description": "Delete or archive a memory item",
  "inputSchema": {
    "type": "object",
    "properties": {
      "memoryId": {"type": "string"},
      "softDelete": {
        "type": "boolean",
        "default": true,
        "description": "Archive instead of permanently deleting"
      },
      "reason": {
        "type": "string",
        "description": "Reason for deletion"
      }
    },
    "required": ["memoryId"]
  }
}
```

### Search and Retrieval Tools

#### 5. Search Memories
**Tool Name**: `search_memories`  
**Description**: Search memories using semantic search and filters

```json
{
  "name": "search_memories",
  "description": "Search memories using natural language queries with intelligent layer routing",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language search query"
      },
      "layers": {
        "type": "array",
        "items": {"type": "string", "enum": ["session", "project", "global", "temporal"]},
        "description": "Specific layers to search (auto-selected if not provided)"
      },
      "memoryTypes": {
        "type": "array", 
        "items": {"type": "string"},
        "description": "Filter by memory types"
      },
      "categories": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Filter by categories"
      },
      "tags": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Filter by tags"
      },
      "projectId": {
        "type": "string",
        "description": "Limit search to specific project"
      },
      "timeRange": {
        "type": "object",
        "properties": {
          "start": {"type": "string", "format": "date-time"},
          "end": {"type": "string", "format": "date-time"}
        },
        "description": "Time range filter"
      },
      "minimumImportance": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Minimum importance threshold"
      },
      "limit": {
        "type": "integer",
        "default": 20,
        "minimum": 1,
        "maximum": 100,
        "description": "Maximum number of results"
      },
      "includeContent": {
        "type": "boolean",
        "default": true,
        "description": "Include full content in results"
      }
    },
    "required": ["query"]
  }
}
```

**Response Schema**:
```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object", 
        "properties": {
          "memoryId": {"type": "string"},
          "title": {"type": "string"},
          "content": {"type": "string"},
          "memoryType": {"type": "string"},
          "category": {"type": "string"},
          "tags": {"type": "array", "items": {"type": "string"}},
          "importanceScore": {"type": "number"},
          "relevanceScore": {"type": "number"},
          "layerSource": {"type": "string"},
          "createdAt": {"type": "string", "format": "date-time"},
          "lastAccessedAt": {"type": "string", "format": "date-time"}
        }
      }
    },
    "totalCount": {"type": "integer"},
    "searchStats": {
      "type": "object",
      "properties": {
        "queryTime": {"type": "number"},
        "layersQueried": {"type": "array", "items": {"type": "string"}},
        "cacheHit": {"type": "boolean"}
      }
    },
    "suggestions": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Query refinement suggestions"
    }
  }
}
```

#### 6. Get Context  
**Tool Name**: `get_context`  
**Description**: Get contextual memories for current activity

```json
{
  "name": "get_context",
  "description": "Retrieve contextually relevant memories based on current activity",
  "inputSchema": {
    "type": "object",
    "properties": {
      "activity": {
        "type": "string",
        "description": "Description of current activity or task"
      },
      "files": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Currently open/active files"
      },
      "gitBranch": {
        "type": "string",
        "description": "Current git branch"
      },
      "gitCommit": {
        "type": "string",
        "description": "Current git commit hash"
      },
      "workingDirectory": {
        "type": "string",
        "description": "Current working directory"
      },
      "maxResults": {
        "type": "integer",
        "default": 10,
        "description": "Maximum context items to return"
      }
    }
  }
}
```

### Pattern Recognition Tools

#### 7. Find Similar Patterns
**Tool Name**: `find_similar_patterns`  
**Description**: Find similar patterns across projects

```json
{
  "name": "find_similar_patterns",
  "description": "Find similar patterns and solutions across different projects",
  "inputSchema": {
    "type": "object",
    "properties": {
      "description": {
        "type": "string",
        "description": "Description of the current problem or pattern"
      },
      "currentProjectId": {
        "type": "string",
        "description": "Current project ID (will exclude from results)"
      },
      "patternType": {
        "type": "string",
        "enum": ["architecture", "testing", "deployment", "performance", "security", "debugging"],
        "description": "Type of pattern to look for"
      },
      "includeFailures": {
        "type": "boolean",
        "default": false,
        "description": "Include patterns that failed (anti-patterns)"
      },
      "minimumConfidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "default": 0.7,
        "description": "Minimum confidence threshold for pattern matches"
      }
    },
    "required": ["description"]
  }
}
```

#### 8. Get Cross-Project Insights
**Tool Name**: `get_cross_project_insights`  
**Description**: Get insights synthesized across all projects

```json
{
  "name": "get_cross_project_insights",
  "description": "Get synthesized insights and patterns from across all user projects",
  "inputSchema": {
    "type": "object",
    "properties": {
      "insightType": {
        "type": "string", 
        "enum": ["patterns", "anti-patterns", "best-practices", "common-mistakes", "evolution"],
        "description": "Type of insights to retrieve"
      },
      "categories": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Limit insights to specific categories"
      },
      "timeWindow": {
        "type": "string",
        "enum": ["week", "month", "quarter", "year", "all"],
        "default": "all",
        "description": "Time window for insight generation"
      },
      "excludeProjects": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Project IDs to exclude from insights"
      }
    }
  }
}
```

### Session Management Tools

#### 9. Create Session
**Tool Name**: `create_session`  
**Description**: Create a new memory session

```json
{
  "name": "create_session", 
  "description": "Create a new memory session for organizing conversation context",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Session name"
      },
      "description": {
        "type": "string",
        "description": "Session description"
      },
      "projectId": {
        "type": "string",
        "description": "Associated project ID"
      },
      "gitBranch": {
        "type": "string",
        "description": "Associated git branch"
      },
      "workingDirectory": {
        "type": "string",
        "description": "Working directory path"
      },
      "parentSessionId": {
        "type": "string",
        "description": "Parent session if this is a continuation"
      }
    },
    "required": ["name"]
  }
}
```

#### 10. Switch Session
**Tool Name**: `switch_session`  
**Description**: Switch to a different memory session

```json
{
  "name": "switch_session",
  "description": "Switch to a different memory session and load its context",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": {
        "type": "string",
        "description": "ID of session to switch to"
      },
      "preserveContext": {
        "type": "boolean",
        "default": true,
        "description": "Whether to preserve current session context"
      }
    },
    "required": ["sessionId"]
  }
}
```

### Project Management Tools

#### 11. Initialize Project
**Tool Name**: `initialize_project`  
**Description**: Initialize memory tracking for a new project

```json
{
  "name": "initialize_project",
  "description": "Initialize memory tracking and context for a new project",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "description": {"type": "string"},
      "path": {"type": "string"},
      "gitRemoteUrl": {"type": "string"},
      "projectType": {
        "type": "string",
        "enum": ["web", "api", "cli", "library", "mobile", "desktop", "data", "other"]
      },
      "language": {"type": "string"},
      "framework": {"type": "string"},
      "importExistingContext": {
        "type": "boolean",
        "default": false,
        "description": "Import context from existing project structure"
      }
    },
    "required": ["name", "path"]
  }
}
```

#### 12. Get Project Stats
**Tool Name**: `get_project_stats`  
**Description**: Get memory statistics for a project

```json
{
  "name": "get_project_stats",
  "description": "Get comprehensive memory statistics and insights for a project",
  "inputSchema": {
    "type": "object",
    "properties": {
      "projectId": {"type": "string"},
      "includePatternsFound": {
        "type": "boolean",
        "default": true
      },
      "includeMemoryGrowth": {
        "type": "boolean", 
        "default": true
      }
    },
    "required": ["projectId"]
  }
}
```

### Analytics and Insights Tools

#### 13. Get Memory Analytics
**Tool Name**: `get_memory_analytics`  
**Description**: Get analytics about memory usage and patterns

```json
{
  "name": "get_memory_analytics",
  "description": "Get comprehensive analytics about memory usage, patterns, and effectiveness",
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": ["user", "project", "session"],
        "default": "user"
      },
      "scopeId": {
        "type": "string",
        "description": "ID for project or session scope"
      },
      "timeRange": {
        "type": "object",
        "properties": {
          "start": {"type": "string", "format": "date-time"},
          "end": {"type": "string", "format": "date-time"}
        }
      },
      "metrics": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["creation-rate", "access-patterns", "decay-effectiveness", "search-success", "pattern-reuse"]
        },
        "default": ["creation-rate", "access-patterns", "search-success"]
      }
    }
  }
}
```

#### 14. Suggest Context Gaps
**Tool Name**: `suggest_context_gaps`  
**Description**: Identify potential gaps in current context

```json
{
  "name": "suggest_context_gaps",
  "description": "Analyze current context and suggest potentially missing relevant information",
  "inputSchema": {
    "type": "object",
    "properties": {
      "currentActivity": {
        "type": "string",
        "description": "What you're currently working on"
      },
      "activeMemories": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Currently active memory IDs"
      },
      "projectContext": {
        "type": "object",
        "description": "Current project context information"
      },
      "confidenceThreshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "default": 0.6,
        "description": "Minimum confidence for gap suggestions"
      }
    },
    "required": ["currentActivity"]
  }
}
```

### Maintenance and System Tools

#### 15. Process Memory Decay
**Tool Name**: `process_memory_decay`  
**Description**: Manually trigger memory decay processing

```json
{
  "name": "process_memory_decay",
  "description": "Manually trigger memory decay processing and cleanup",
  "inputSchema": {
    "type": "object",
    "properties": {
      "dryRun": {
        "type": "boolean",
        "default": false,
        "description": "Preview decay results without applying changes"
      },
      "scope": {
        "type": "string",
        "enum": ["user", "project", "session"],
        "default": "user"
      },
      "scopeId": {"type": "string"},
      "aggressiveness": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "default": 0.5,
        "description": "How aggressive the decay should be"
      }
    }
  }
}
```

#### 16. Reindex Memories
**Tool Name**: `reindex_memories`  
**Description**: Reindex memories for improved search and categorization

```json
{
  "name": "reindex_memories",
  "description": "Reindex memories to update embeddings, categories, and relationships",
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": ["all", "project", "outdated"],
        "default": "outdated"
      },
      "projectId": {"type": "string"},
      "updateEmbeddings": {
        "type": "boolean",
        "default": true
      },
      "updateCategories": {
        "type": "boolean", 
        "default": true
      },
      "updateRelationships": {
        "type": "boolean",
        "default": false
      }
    }
  }
}
```

---

## Resources API

### Resource Types

#### 1. Memory Resources
**URI Pattern**: `memory://memories/{memoryId}`  
**Description**: Individual memory items as resources

```json
{
  "uri": "memory://memories/550e8400-e29b-41d4-a716-446655440000",
  "name": "Database Schema Design Decision", 
  "description": "Memory about choosing hybrid storage approach",
  "mimeType": "application/json"
}
```

#### 2. Project Resources  
**URI Pattern**: `memory://projects/{projectId}/context`  
**Description**: Project context and memory summaries

```json
{
  "uri": "memory://projects/project-123/context",
  "name": "Project Memory Context",
  "description": "Aggregated memory context for the project",
  "mimeType": "application/json"
}
```

#### 3. Pattern Resources
**URI Pattern**: `memory://patterns/{patternType}`  
**Description**: Discovered patterns and insights

```json
{
  "uri": "memory://patterns/architecture",
  "name": "Architecture Patterns",
  "description": "Discovered architecture patterns across projects", 
  "mimeType": "application/json"
}
```

#### 4. Search Results Resources
**URI Pattern**: `memory://search/{queryHash}`  
**Description**: Cached search results as resources

```json
{
  "uri": "memory://search/abc123hash",
  "name": "Search: authentication patterns",
  "description": "Cached search results for authentication patterns query",
  "mimeType": "application/json"
}
```

---

## Prompts API

### Prompt Templates

#### 1. Memory Creation Prompt
**Name**: `create_memory_guided`  
**Description**: Guided memory creation with context analysis

```json
{
  "name": "create_memory_guided",
  "description": "Guide user through creating a well-structured memory item",
  "arguments": [
    {
      "name": "context",
      "description": "Current working context",
      "required": false
    },
    {
      "name": "topic",
      "description": "Topic or area of the memory",
      "required": false  
    }
  ]
}
```

#### 2. Search Query Enhancement
**Name**: `enhance_search_query`  
**Description**: Improve search queries for better results

```json
{
  "name": "enhance_search_query",
  "description": "Enhance a search query with context and synonyms for better memory retrieval",
  "arguments": [
    {
      "name": "originalQuery",
      "description": "The original search query",
      "required": true
    },
    {
      "name": "currentContext", 
      "description": "Current working context",
      "required": false
    }
  ]
}
```

#### 3. Pattern Analysis
**Name**: `analyze_pattern`  
**Description**: Analyze and extract patterns from memories

```json
{
  "name": "analyze_pattern",
  "description": "Analyze memories to identify patterns and provide insights",
  "arguments": [
    {
      "name": "memories",
      "description": "Array of memory objects to analyze",
      "required": true
    },
    {
      "name": "focusArea",
      "description": "Specific area to focus pattern analysis on",
      "required": false
    }
  ]
}
```

---

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "MEMORY_NOT_FOUND",
    "message": "Memory with ID '123' was not found",
    "details": {
      "memoryId": "123",
      "searchedLayers": ["session", "project", "global"]
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Request validation failed |
| `MEMORY_NOT_FOUND` | Requested memory does not exist |
| `PROJECT_NOT_FOUND` | Requested project does not exist |
| `SESSION_NOT_FOUND` | Requested session does not exist |
| `PERMISSION_DENIED` | User lacks permission for operation |
| `STORAGE_ERROR` | Database or storage layer error |
| `SEARCH_FAILED` | Search operation failed |
| `LAYER_UNAVAILABLE` | Memory layer is temporarily unavailable |
| `PATTERN_ANALYSIS_FAILED` | Pattern recognition failed |
| `CONTEXT_ANALYSIS_FAILED` | Context analysis failed |
| `DECAY_PROCESSING_ERROR` | Memory decay processing error |
| `REINDEX_FAILED` | Memory reindexing operation failed |

---

## Performance Considerations

### Rate Limits
- Search operations: 60 requests/minute
- Memory creation: 120 requests/minute
- Memory updates: 240 requests/minute
- Analytics queries: 30 requests/minute

### Response Size Limits
- Search results: Maximum 1000 items
- Memory content: Maximum 1MB per memory
- Analytics data: Maximum 10MB per response

### Caching Behavior
- Search results cached for 1 hour
- Memory data cached for 30 minutes
- Pattern analysis cached for 4 hours
- Project context cached for 2 hours

---

## Authentication and Security

### API Key Authentication
```json
{
  "headers": {
    "Authorization": "Bearer <api_key>",
    "X-User-ID": "<user_id>"
  }
}
```

### Permission Model
- **Read**: View memories and search results
- **Write**: Create and update memories
- **Delete**: Archive or delete memories
- **Admin**: Manage projects and system settings

### Data Privacy
- Personal memories are isolated per user
- Project memories respect project permissions
- Global insights are anonymized
- Search history is optionally retained

---

## Migration and Compatibility

### API Versioning
- Current version: `v1`
- Version header: `X-API-Version: v1`
- Backward compatibility maintained for 2 major versions

### Breaking Changes Policy
- Breaking changes only in major versions
- Deprecation warnings 6 months before removal
- Migration tools provided for major upgrades

---

**API Review Required**: This MCP API specification should be validated for:
- MCP protocol compliance and standard adherence
- Tool schema completeness and validation
- Error handling coverage and user experience
- Performance and scalability considerations