# Layered Memory MCP - Development Plan

**Status:** BLOCKED (Build Issues)
**Priority:** MEDIUM
**Last Updated:** 2025-09-30

## Critical Issue: Build Configuration Broken ❌

### Problem
TypeScript compilation produces ES modules, but code uses CommonJS patterns that are incompatible with ES module scope.

**Error:**
```
ReferenceError: require is not defined in ES module scope
```

**Location:** `dist/src/index.js:1079`
**Root Cause:** Code uses `if (require.main === module)` pattern but package.json specifies `"type": "module"`

### Impact
- ❌ Server cannot start
- ❌ Cannot test any of the 19+ implemented tools
- ❌ Cannot validate functionality
- ❌ Blocking evaluation for promotion to "essential tools"

---

## Development Plan: Build Fix & Validation

### Phase 1: Fix Build Configuration (Priority: HIGH)
**Goal:** Get the server running so we can test functionality

**Option A: Convert to Pure ESM** (Recommended)
```typescript
// Replace (line ~1079):
if (require.main === module) {
  main().catch(...);
}

// With:
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(...);
}
```

**Option B: Switch to CommonJS Build**
```json
// package.json - Remove:
"type": "module"

// tsconfig.json - Change:
"module": "CommonJS"
```

**Recommendation:** Use Option A (ESM) since the rest of the codebase appears to be ESM-ready.

**Acceptance Criteria:**
- [ ] `npm run build` completes without errors
- [ ] `node dist/src/index.js` starts without errors
- [ ] MCP protocol responds to `tools/list` request

---

### Phase 2: Functional Validation (Priority: HIGH)
**Goal:** Verify the 19+ tools actually work

**Tools to Test (Priority Order):**

**Tier 1 - Basic Memory Operations:**
1. ✅ `store_memory` - Store a test memory item
2. ✅ `search_memory` - Retrieve stored items
3. ✅ `get_memory_stats` - Verify stats tracking works

**Tier 2 - Advanced Search:**
4. ✅ `advanced_search` - Multi-parameter search
5. ✅ `semantic_search` - Vector similarity search
6. ✅ `temporal_search` - Time-based queries

**Tier 3 - Knowledge Graph:**
7. ✅ `build_knowledge_graph` - Graph construction
8. ✅ `get_memory_relationships` - Relationship queries

**Tier 4 - Memory Management:**
9. ✅ `detect_conflicts` - Conflict detection
10. ✅ `get_memory_versions` - Version history
11. ✅ `predict_memory_decay` - Decay prediction
12. ✅ `get_promotion_candidates` - Promotion logic

**Test Strategy:**
- Write integration tests for each tier
- Start with Tier 1 (basic CRUD operations)
- Only proceed to next tier if current tier passes
- Document which tools work vs. don't work

**Acceptance Criteria:**
- [ ] At least 80% of Tier 1 tools functional
- [ ] Clear documentation of working vs. broken tools
- [ ] Decision on whether to proceed with Tier 2-4 testing

---

### Phase 3: Essential Tools Evaluation (Priority: MEDIUM)
**Goal:** Determine if basic memory tools should be promoted to "essential" in metaMCP

**Evaluation Criteria:**
1. **Functionality:** Do the basic tools (store/search/stats) work reliably?
2. **Performance:** Are operations fast enough for interactive use? (<100ms)
3. **Value:** Do they provide unique capabilities not available elsewhere?
4. **Stability:** Are there crashes, memory leaks, or edge cases?

**Potential Essential Tools:**
- `store_memory` - If it provides session-level persistence
- `search_memory` - If search is fast and accurate
- `get_memory_stats` - If stats are useful for debugging

**Decision Matrix:**
| Tool | Functional? | Fast? | Unique? | Stable? | Promote? |
|------|------------|-------|---------|---------|----------|
| store_memory | ❓ | ❓ | ❓ | ❓ | ❓ |
| search_memory | ❓ | ❓ | ❓ | ❓ | ❓ |
| get_memory_stats | ❓ | ❓ | ❓ | ❓ | ❓ |

**Acceptance Criteria:**
- [ ] All three questions answered with data (not speculation)
- [ ] Clear recommendation: Promote or Don't Promote
- [ ] If Don't Promote: Document why and what needs to improve

---

### Phase 4: Integration with metaMCP (Priority: LOW)
**Goal:** If tools are valuable, integrate with metaMCP-RAG server

**Integration Tasks:**
- [ ] Add Layered Memory to metaMCP server configs
- [ ] Index tools in RAG vector database
- [ ] Test discovery via `discover_tools`
- [ ] Verify execution via `execute_tool`
- [ ] Update essential tools list if promoted

**Acceptance Criteria:**
- [ ] Tools discoverable via semantic queries
- [ ] Tools execute successfully through metaMCP proxy
- [ ] No performance degradation in metaMCP

---

## Timeline Estimate

**Phase 1 (Build Fix):** 1-2 hours
- Fix ESM compatibility issue
- Verify compilation and startup
- Document any remaining issues

**Phase 2 (Validation):** 4-6 hours
- Write test harness
- Test Tier 1 tools (3 tools × 1 hour each)
- Document results

**Phase 3 (Evaluation):** 2-3 hours
- Analyze test results
- Performance benchmarking
- Write recommendation

**Phase 4 (Integration):** 2-4 hours (if approved)
- metaMCP configuration
- RAG indexing
- Integration testing

**Total Estimated Effort:** 9-15 hours

---

## Technical Details

### Dependencies
According to `package.json`, this MCP has significant dependencies:
- **ChromaDB** - Vector database for semantic search
- **Neo4j** - Graph database for knowledge relationships
- **Redis** - Likely for caching and session management
- **OpenAI** - Embeddings generation (potential cost/API key requirement)
- **@xenova/transformers** - Local embeddings alternative
- **faiss-node** - Vector similarity search

**Concern:** These are heavyweight dependencies. Need to verify:
1. Which ones are actually required?
2. Are external services needed (Neo4j, Redis)?
3. Can it run in standalone mode?

### Current Architecture (from source code)
```
src/
├── memory/           # Core memory management
├── embeddings/       # Vector embeddings
├── knowledge/        # Knowledge graph
├── autonomous/       # Auto-learning features
├── analysis/         # Analytics
├── learning/         # ML-based features
├── security/         # Security & auth
└── monitoring/       # Metrics & logging
```

**Observation:** This is a **very ambitious** MCP with enterprise-grade features. May be overengineered for basic memory needs.

---

## Risk Assessment

**High Risk:**
- ⚠️ Complex dependency stack may cause deployment issues
- ⚠️ External service requirements (Neo4j, Redis) increase friction
- ⚠️ OpenAI API dependency may require API keys
- ⚠️ Build issues suggest project may be abandoned/unmaintained

**Medium Risk:**
- ⚠️ Performance unknown with heavyweight dependencies
- ⚠️ Memory consumption unknown (ChromaDB + Neo4j + Redis)
- ⚠️ Security features suggest enterprise use case (may be overkill)

**Low Risk:**
- ℹ️ TypeScript codebase is maintainable
- ℹ️ Test infrastructure exists (`jest` configured)
- ℹ️ Documentation structure present

---

## Alternative Approaches

If Layered Memory proves too complex, consider:

1. **Simple In-Memory Cache**
   - Use Map/Set with TTL
   - No external dependencies
   - Fast, lightweight

2. **SQLite-based Memory**
   - Single file database
   - No external services
   - Query-able, persistent

3. **Existing MCP Memory Server**
   - Use official `@modelcontextprotocol/server-memory`
   - Battle-tested, maintained
   - Simpler feature set

---

## Success Criteria

**Minimum Success:**
- [ ] Server builds and starts
- [ ] Basic CRUD operations work (store/search/stats)
- [ ] Decision made: Use or Don't Use

**Full Success:**
- [ ] All 19+ tools functional
- [ ] Performance acceptable (<100ms per operation)
- [ ] Integrated with metaMCP
- [ ] Basic tools promoted to "essential"

**Recommendation:**
Given the complexity and current broken state, this should be a **MEDIUM priority** item. Focus on file-converter refactor and metaMCP improvements first, then circle back to Layered Memory when there's dedicated time for a deep dive.

---

## Next Actions (When Ready)

1. ✅ Read this development plan
2. ⬜ Decide priority: Fix now or defer
3. ⬜ If fix now: Start with Phase 1 (build fix)
4. ⬜ If defer: Add to backlog with timeline estimate
5. ⬜ Document decision in CURRENT_STATUS.md

**Status:** Documented and ready for future work
