# Database Schema Design - Layered Memory MCP Server

**Status**: ACTIVE  
**Created**: 2025-09-25  
**Last Updated**: 2025-09-25  
**Version**: 1.0  

## Schema Overview

The hybrid storage architecture uses four different database technologies, each optimized for specific data types and access patterns. This document details the schema design for each storage layer.

## Storage Layer Mapping

```
┌─────────────────┬─────────────────┬─────────────────────────────────┐
│ Data Type       │ Primary Storage │ Purpose                         │
├─────────────────┼─────────────────┼─────────────────────────────────┤
│ Memory Content  │ SQLite         │ Structured data, metadata       │
│ Embeddings      │ Qdrant         │ Semantic search, similarity     │
│ Relationships   │ Neo4j          │ Graph queries, pattern matching │
│ Cache Data      │ Redis          │ Fast access, session state     │
└─────────────────┴─────────────────┴─────────────────────────────────┘
```

---

## 1. SQLite Schema (Structured Data)

**Purpose**: Primary storage for memory metadata, user data, and structured queries  
**File**: `layered_memory.db`

### Core Tables

#### 1.1 Users Table
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    display_name TEXT,
    preferences_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    
    -- Indexes
    INDEX idx_users_username ON users(username),
    INDEX idx_users_email ON users(email),
    INDEX idx_users_active ON users(last_active_at) WHERE is_active = 1
);
```

#### 1.2 Projects Table
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    path TEXT, -- File system path
    git_remote_url TEXT,
    git_branch TEXT DEFAULT 'main',
    project_type TEXT, -- web, api, cli, library, etc.
    language TEXT, -- primary programming language
    framework TEXT, -- react, express, django, etc.
    config_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    
    -- Indexes
    UNIQUE INDEX idx_projects_user_name ON projects(user_id, name),
    INDEX idx_projects_user_active ON projects(user_id, last_accessed_at) WHERE is_active = 1,
    INDEX idx_projects_path ON projects(path) WHERE path IS NOT NULL,
    INDEX idx_projects_type ON projects(project_type)
);
```

#### 1.3 Sessions Table
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    git_branch TEXT,
    git_commit TEXT,
    working_directory TEXT,
    context_json TEXT DEFAULT '{}', -- Current working context
    parent_session_id TEXT REFERENCES sessions(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    
    -- Indexes
    INDEX idx_sessions_user_active ON sessions(user_id, last_active_at) WHERE is_active = 1,
    INDEX idx_sessions_project ON sessions(project_id) WHERE project_id IS NOT NULL,
    INDEX idx_sessions_branch ON sessions(git_branch) WHERE git_branch IS NOT NULL,
    INDEX idx_sessions_parent ON sessions(parent_session_id) WHERE parent_session_id IS NOT NULL
);
```

#### 1.4 Memory Items Table
```sql
CREATE TABLE memories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    
    -- Memory content
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT, -- AI-generated summary for quick retrieval
    
    -- Classification
    memory_type TEXT NOT NULL, -- decision, task, progress, insight, pattern, etc.
    category TEXT, -- auto-categorized or user-defined
    tags TEXT, -- JSON array of tags
    
    -- Importance and lifecycle
    importance_score REAL DEFAULT 0.5, -- 0.0 to 1.0
    decay_rate REAL DEFAULT 0.1, -- how quickly importance decays
    access_count INTEGER DEFAULT 0,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Context
    context_json TEXT DEFAULT '{}', -- File paths, line numbers, etc.
    git_context_json TEXT DEFAULT '{}', -- Commit, branch, diff info
    
    -- Layer assignments
    layer_session BOOLEAN DEFAULT 0,
    layer_project BOOLEAN DEFAULT 0,
    layer_global BOOLEAN DEFAULT 0,
    layer_temporal BOOLEAN DEFAULT 0,
    
    -- Metadata
    source_tool TEXT, -- mcp_tool that created this memory
    external_id TEXT, -- ID from external system if imported
    is_private BOOLEAN DEFAULT 0,
    is_archived BOOLEAN DEFAULT 0,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (importance_score >= 0.0 AND importance_score <= 1.0),
    CHECK (decay_rate >= 0.0 AND decay_rate <= 1.0),
    
    -- Indexes
    INDEX idx_memories_user ON memories(user_id),
    INDEX idx_memories_project ON memories(project_id) WHERE project_id IS NOT NULL,
    INDEX idx_memories_session ON memories(session_id) WHERE session_id IS NOT NULL,
    INDEX idx_memories_type ON memories(memory_type),
    INDEX idx_memories_category ON memories(category) WHERE category IS NOT NULL,
    INDEX idx_memories_importance ON memories(importance_score DESC),
    INDEX idx_memories_last_accessed ON memories(last_accessed_at DESC),
    INDEX idx_memories_created ON memories(created_at DESC),
    INDEX idx_memories_layers ON memories(layer_session, layer_project, layer_global, layer_temporal),
    
    -- Full-text search
    INDEX idx_memories_content_fts ON memories(title, content, summary)
);
```

#### 1.5 Memory Relationships Table
```sql
CREATE TABLE memory_relationships (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    from_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    to_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL, -- relates_to, contradicts, builds_on, resolved_by, etc.
    strength REAL DEFAULT 1.0, -- 0.0 to 1.0, relationship strength
    context TEXT, -- Description of the relationship
    auto_detected BOOLEAN DEFAULT 0, -- Was this relationship auto-detected?
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT REFERENCES users(id),
    
    -- Constraints
    CHECK (from_memory_id != to_memory_id),
    CHECK (strength >= 0.0 AND strength <= 1.0),
    UNIQUE (from_memory_id, to_memory_id, relationship_type),
    
    -- Indexes
    INDEX idx_memory_relationships_from ON memory_relationships(from_memory_id),
    INDEX idx_memory_relationships_to ON memory_relationships(to_memory_id),
    INDEX idx_memory_relationships_type ON memory_relationships(relationship_type),
    INDEX idx_memory_relationships_strength ON memory_relationships(strength DESC),
    INDEX idx_memory_relationships_auto ON memory_relationships(auto_detected)
);
```

#### 1.6 Memory Versions Table
```sql
CREATE TABLE memory_versions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    change_type TEXT NOT NULL, -- created, updated, merged, archived
    change_reason TEXT,
    diff_json TEXT, -- JSON representation of changes
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT REFERENCES users(id),
    
    -- Constraints
    UNIQUE (memory_id, version_number),
    
    -- Indexes
    INDEX idx_memory_versions_memory ON memory_versions(memory_id, version_number DESC),
    INDEX idx_memory_versions_created ON memory_versions(created_at DESC)
);
```

### Layer-Specific Tables

#### 1.7 Session Memory Table
```sql
CREATE TABLE session_memories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    position_in_session INTEGER, -- Order within session
    working_memory BOOLEAN DEFAULT 0, -- Is this actively being worked on?
    context_window_position INTEGER, -- Position in current context window
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE (session_id, memory_id),
    
    -- Indexes
    INDEX idx_session_memories_session ON session_memories(session_id, position_in_session),
    INDEX idx_session_memories_working ON session_memories(session_id, working_memory) WHERE working_memory = 1,
    INDEX idx_session_memories_context ON session_memories(context_window_position) WHERE context_window_position IS NOT NULL
);
```

#### 1.8 Project Patterns Table
```sql
CREATE TABLE project_patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pattern_type TEXT NOT NULL, -- architecture, testing, deployment, code_style, etc.
    pattern_name TEXT NOT NULL,
    pattern_description TEXT NOT NULL,
    pattern_data_json TEXT NOT NULL, -- Structured pattern data
    success_rate REAL DEFAULT 1.0, -- How often this pattern succeeds
    usage_count INTEGER DEFAULT 1,
    memory_ids TEXT, -- JSON array of memory IDs that contributed to this pattern
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (success_rate >= 0.0 AND success_rate <= 1.0),
    UNIQUE (project_id, pattern_type, pattern_name),
    
    -- Indexes
    INDEX idx_project_patterns_project ON project_patterns(project_id),
    INDEX idx_project_patterns_type ON project_patterns(pattern_type),
    INDEX idx_project_patterns_success ON project_patterns(success_rate DESC),
    INDEX idx_project_patterns_usage ON project_patterns(usage_count DESC)
);
```

### Configuration and System Tables

#### 1.9 System Configuration Table
```sql
CREATE TABLE system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    value_type TEXT DEFAULT 'string', -- string, integer, float, boolean, json
    description TEXT,
    is_user_configurable BOOLEAN DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT REFERENCES users(id)
);

-- Default configuration values
INSERT INTO system_config (key, value, value_type, description, is_user_configurable) VALUES
('memory_decay_enabled', 'true', 'boolean', 'Enable automatic memory decay', 1),
('default_decay_rate', '0.1', 'float', 'Default decay rate for new memories', 1),
('max_memories_per_session', '1000', 'integer', 'Maximum memories in a single session', 1),
('semantic_search_threshold', '0.7', 'float', 'Minimum similarity threshold for semantic search', 1),
('auto_categorization_enabled', 'true', 'boolean', 'Enable automatic memory categorization', 1);
```

#### 1.10 Audit Log Table
```sql
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT REFERENCES users(id),
    session_id TEXT REFERENCES sessions(id),
    action TEXT NOT NULL, -- create, read, update, delete, search, etc.
    resource_type TEXT NOT NULL, -- memory, project, session, etc.
    resource_id TEXT NOT NULL,
    details_json TEXT, -- Additional action details
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC),
    INDEX idx_audit_log_action ON audit_log(action, created_at DESC),
    INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id),
    INDEX idx_audit_log_created ON audit_log(created_at DESC)
);
```

---

## 2. Qdrant Schema (Vector Database)

**Purpose**: Semantic search and similarity matching using vector embeddings

### Collections Structure

#### 2.1 Memory Embeddings Collection
```python
# Collection configuration
collection_config = {
    "vectors": {
        "size": 384,  # sentence-transformers/all-MiniLM-L6-v2 embedding size
        "distance": "Cosine"
    },
    "payload_schema": {
        "memory_id": "keyword",
        "user_id": "keyword", 
        "project_id": "keyword",
        "session_id": "keyword",
        "memory_type": "keyword",
        "category": "keyword",
        "tags": ["keyword"],
        "importance_score": "float",
        "layer_assignments": ["keyword"],  # [session, project, global, temporal]
        "created_at": "datetime",
        "updated_at": "datetime"
    }
}

# Point structure
{
    "id": "memory_uuid",
    "vector": [0.1, 0.2, ..., 0.384],  # 384-dimensional embedding
    "payload": {
        "memory_id": "uuid",
        "user_id": "user_uuid",
        "project_id": "project_uuid", 
        "session_id": "session_uuid",
        "memory_type": "decision",
        "category": "architecture",
        "tags": ["database", "schema", "design"],
        "importance_score": 0.85,
        "layer_assignments": ["project", "global"],
        "title": "Database schema design decision",
        "summary": "Decided to use hybrid storage approach...",
        "created_at": "2025-09-25T10:00:00Z",
        "updated_at": "2025-09-25T10:00:00Z"
    }
}
```

#### 2.2 Pattern Embeddings Collection
```python
# Collection for cross-project patterns
pattern_collection_config = {
    "vectors": {
        "size": 384,
        "distance": "Cosine"
    },
    "payload_schema": {
        "pattern_id": "keyword",
        "pattern_type": "keyword",
        "pattern_name": "keyword", 
        "project_ids": ["keyword"],
        "success_rate": "float",
        "usage_count": "integer",
        "created_at": "datetime"
    }
}
```

### Search Strategies

#### 2.3 Search Configurations
```python
# Semantic search with filters
search_params = {
    "query_vector": embedding_vector,
    "limit": 50,
    "with_payload": True,
    "with_vectors": False,
    "score_threshold": 0.7,
    "filter": {
        "must": [
            {"key": "user_id", "match": {"value": user_id}},
            {"key": "layer_assignments", "match": {"any": ["project", "global"]}}
        ],
        "should": [
            {"key": "importance_score", "range": {"gte": 0.5}},
            {"key": "memory_type", "match": {"value": "decision"}}
        ]
    }
}
```

---

## 3. Neo4j Schema (Graph Database)

**Purpose**: Relationship modeling, pattern detection, and graph traversal queries

### Node Types and Properties

#### 3.1 Memory Node
```cypher
CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE;

// Memory node structure
(:Memory {
    id: "memory_uuid",
    user_id: "user_uuid",
    project_id: "project_uuid",
    session_id: "session_uuid", 
    title: "Memory title",
    memory_type: "decision",
    category: "architecture",
    importance_score: 0.85,
    layer_assignments: ["project", "global"],
    created_at: datetime("2025-09-25T10:00:00Z"),
    updated_at: datetime("2025-09-25T10:00:00Z")
})
```

#### 3.2 Project Node
```cypher
CREATE CONSTRAINT project_id_unique IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE;

(:Project {
    id: "project_uuid",
    user_id: "user_uuid",
    name: "Project Name",
    project_type: "web",
    language: "typescript",
    framework: "react",
    created_at: datetime("2025-09-25T10:00:00Z")
})
```

#### 3.3 Pattern Node
```cypher
CREATE CONSTRAINT pattern_id_unique IF NOT EXISTS FOR (pt:Pattern) REQUIRE pt.id IS UNIQUE;

(:Pattern {
    id: "pattern_uuid",
    pattern_type: "architecture",
    pattern_name: "microservices",
    description: "Microservices architecture pattern",
    success_rate: 0.9,
    usage_count: 15,
    created_at: datetime("2025-09-25T10:00:00Z")
})
```

#### 3.4 User Node
```cypher
CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;

(:User {
    id: "user_uuid",
    username: "developer",
    created_at: datetime("2025-09-25T10:00:00Z")
})
```

### Relationship Types

#### 3.5 Memory Relationships
```cypher
// Memory to Memory relationships
(m1:Memory)-[:RELATES_TO {strength: 0.8, context: "Both about database design"}]->(m2:Memory)
(m1:Memory)-[:CONTRADICTS {discovered_at: datetime()}]->(m2:Memory)
(m1:Memory)-[:BUILDS_ON {sequence: 1}]->(m2:Memory)
(m1:Memory)-[:RESOLVES {resolution_date: date()}]->(m2:Memory)
(m1:Memory)-[:SUPERSEDES {reason: "Updated approach"}]->(m2:Memory)

// Memory to Project relationships
(m:Memory)-[:BELONGS_TO]->(p:Project)
(m:Memory)-[:APPLIES_TO {relevance: 0.9}]->(p:Project)

// Memory to Pattern relationships
(m:Memory)-[:DEMONSTRATES]->(pt:Pattern)
(m:Memory)-[:VALIDATES {outcome: "success"}]->(pt:Pattern)
(m:Memory)-[:CONTRADICTS_PATTERN {reason: "Failed in this context"}]->(pt:Pattern)

// Pattern to Project relationships
(pt:Pattern)-[:USED_IN {success: true, date: date()}]->(p:Project)
(pt:Pattern)-[:FAILED_IN {reason: "Performance issues"}]->(p:Project)

// User relationships
(u:User)-[:OWNS]->(p:Project)
(u:User)-[:CREATED]->(m:Memory)
(u:User)-[:DISCOVERED]->(pt:Pattern)

// Temporal relationships
(m1:Memory)-[:TEMPORAL_BEFORE]->(m2:Memory)
(m1:Memory)-[:SAME_CONTEXT {time_window: "1 hour"}]->(m2:Memory)
```

### Graph Indexes

#### 3.6 Performance Indexes
```cypher
// Node indexes
CREATE INDEX memory_user_id IF NOT EXISTS FOR (m:Memory) ON (m.user_id);
CREATE INDEX memory_project_id IF NOT EXISTS FOR (m:Memory) ON (m.project_id);
CREATE INDEX memory_type IF NOT EXISTS FOR (m:Memory) ON (m.memory_type);
CREATE INDEX memory_importance IF NOT EXISTS FOR (m:Memory) ON (m.importance_score);
CREATE INDEX memory_created_at IF NOT EXISTS FOR (m:Memory) ON (m.created_at);

CREATE INDEX project_user_id IF NOT EXISTS FOR (p:Project) ON (p.user_id);
CREATE INDEX project_type IF NOT EXISTS FOR (p:Project) ON (p.project_type);

CREATE INDEX pattern_type IF NOT EXISTS FOR (pt:Pattern) ON (pt.pattern_type);
CREATE INDEX pattern_success IF NOT EXISTS FOR (pt:Pattern) ON (pt.success_rate);

// Relationship indexes
CREATE INDEX rel_strength IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.strength);
CREATE INDEX rel_applies_relevance IF NOT EXISTS FOR ()-[r:APPLIES_TO]-() ON (r.relevance);
```

---

## 4. Redis Schema (Cache Layer)

**Purpose**: High-speed caching of frequently accessed data and session state

### Cache Key Patterns

#### 4.1 Memory Caching
```
# Memory data
memory:{memory_id} -> Memory JSON
memory:user:{user_id}:recent -> List of recent memory IDs
memory:project:{project_id}:active -> Set of active memory IDs

# Search result caching
search:semantic:{query_hash} -> Search results JSON (TTL: 1 hour)
search:user:{user_id}:history -> List of recent searches (TTL: 24 hours)

# Memory relationships
relationships:{memory_id}:outgoing -> List of related memory IDs
relationships:{memory_id}:incoming -> List of referencing memory IDs
```

#### 4.2 Session Caching
```
# Session state
session:{session_id}:context -> Current session context JSON
session:{session_id}:working_memory -> Set of active memory IDs
session:user:{user_id}:active -> Current active session ID

# Project context
project:{project_id}:context -> Project context JSON (TTL: 4 hours)
project:{project_id}:patterns -> Cached project patterns (TTL: 2 hours)
project:{project_id}:git_status -> Current git status (TTL: 5 minutes)
```

#### 4.3 User Data Caching  
```
# User preferences and settings
user:{user_id}:preferences -> User preferences JSON (TTL: 24 hours)
user:{user_id}:projects -> List of user project IDs (TTL: 1 hour)

# Layer configuration
layer:config:{layer_type} -> Layer configuration JSON
layer:stats:{layer_type} -> Layer performance statistics
```

#### 4.4 Performance Caching
```
# Query result caching
query:{query_hash} -> Query result JSON
query:popular -> Set of popular query hashes (TTL: 1 hour)

# Embedding caching
embedding:{content_hash} -> Vector embedding array
embedding:batch:{batch_id} -> Batch embedding results

# Router caching  
router:decision:{context_hash} -> Layer selection decision
router:performance -> Router performance metrics
```

### Cache Strategies

#### 4.5 TTL Configuration
```python
CACHE_TTL_CONFIG = {
    # Hot data - very frequently accessed
    "session_context": 1800,        # 30 minutes
    "working_memory": 900,          # 15 minutes
    "git_status": 300,              # 5 minutes
    
    # Warm data - regularly accessed  
    "memory_data": 3600,            # 1 hour
    "search_results": 3600,         # 1 hour
    "project_context": 14400,       # 4 hours
    
    # Cool data - occasionally accessed
    "user_preferences": 86400,      # 24 hours
    "project_patterns": 7200,       # 2 hours
    "relationships": 1800,          # 30 minutes
    
    # Performance data
    "router_decisions": 300,        # 5 minutes
    "layer_stats": 600,            # 10 minutes
}
```

---

## 5. Schema Migration Strategy

### Migration Management

#### 5.1 SQLite Migrations
```sql
-- Migration tracking table
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    checksum TEXT NOT NULL
);

-- Migration file structure
-- migrations/001_initial_schema.sql
-- migrations/002_add_memory_relationships.sql
-- migrations/003_add_pattern_detection.sql
```

#### 5.2 Qdrant Migrations
```python
class QdrantMigration:
    def __init__(self, client: QdrantClient):
        self.client = client
    
    async def create_collections(self):
        # Create memory embeddings collection
        await self.client.create_collection(
            collection_name="memory_embeddings",
            vectors_config=VectorParams(size=384, distance=Distance.COSINE)
        )
    
    async def migrate_embeddings(self):
        # Handle embedding model updates
        pass
```

#### 5.3 Neo4j Migrations
```cypher
// Migration procedures
CALL apoc.cypher.runFile('migrations/001_initial_constraints.cypher');
CALL apoc.cypher.runFile('migrations/002_add_temporal_relationships.cypher');

// Migration tracking
CREATE (:Migration {
    version: 1,
    name: "initial_constraints",
    applied_at: datetime()
});
```

### Data Consistency

#### 5.4 Cross-Database Consistency
```typescript
interface DataSyncManager {
    // Ensure consistency across storage layers
    syncMemoryAcrossStorages(memoryId: string): Promise<SyncResult>
    
    // Validate data integrity
    validateDataIntegrity(): Promise<ValidationReport>
    
    // Repair inconsistencies
    repairInconsistencies(issues: ConsistencyIssue[]): Promise<RepairResult>
}

// Transaction coordination
interface TransactionCoordinator {
    beginTransaction(): Promise<TransactionId>
    commitTransaction(transactionId: TransactionId): Promise<CommitResult>
    rollbackTransaction(transactionId: TransactionId): Promise<RollbackResult>
}
```

---

## 6. Performance Optimization

### Indexing Strategy

#### 6.1 SQLite Optimization
```sql
-- Composite indexes for common queries
CREATE INDEX idx_memories_user_project_type ON memories(user_id, project_id, memory_type);
CREATE INDEX idx_memories_layers_importance ON memories(layer_global, layer_project, importance_score DESC);
CREATE INDEX idx_memories_recent_important ON memories(created_at DESC, importance_score DESC) 
    WHERE is_archived = 0;

-- Partial indexes for active data
CREATE INDEX idx_active_sessions ON sessions(user_id, last_active_at DESC) 
    WHERE is_active = 1;
    
-- FTS indexes for content search
CREATE VIRTUAL TABLE memories_fts USING fts5(
    title, content, summary, 
    content=memories, 
    content_rowid=rowid
);
```

#### 6.2 Query Optimization Patterns
```sql
-- Optimized memory retrieval with layers
SELECT m.*, 
       CASE 
           WHEN m.layer_session = 1 THEN 'session'
           WHEN m.layer_project = 1 THEN 'project' 
           WHEN m.layer_global = 1 THEN 'global'
           WHEN m.layer_temporal = 1 THEN 'temporal'
       END as primary_layer
FROM memories m
WHERE m.user_id = ?
  AND m.is_archived = 0
  AND (m.layer_project = 1 OR m.layer_global = 1)
  AND m.importance_score > 0.3
ORDER BY m.importance_score DESC, m.last_accessed_at DESC
LIMIT 50;
```

### Storage Size Estimation

#### 6.3 Capacity Planning
```
Memory Storage Estimates:
- Average memory size: 500 bytes (metadata) + 2KB (content) = 2.5KB
- 10,000 memories per user = 25MB per user
- Vector embeddings: 384 floats * 4 bytes = 1.5KB per memory
- Graph relationships: ~100 bytes per relationship
- Cache overhead: ~20% of total storage

Total per 10K memories:
- SQLite: 25MB
- Qdrant: 15MB  
- Neo4j: 5MB
- Redis: 6MB (cache)
- Total: ~51MB per 10,000 memories
```

---

## Next Steps

1. **Implementation Priority**: Start with SQLite schema as foundation
2. **Data Migration Tools**: Build tools for importing existing memory data
3. **Performance Testing**: Benchmark queries against target data volumes
4. **Backup Strategy**: Design backup and recovery procedures
5. **Monitoring**: Implement schema health monitoring and alerts

---

**Schema Review Required**: This database schema should be validated for:
- Query performance at target scale (100K+ memories)
- Storage efficiency and growth patterns  
- Cross-database consistency requirements
- Backup and recovery feasibility