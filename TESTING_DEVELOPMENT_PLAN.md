# Testing Infrastructure Development Plan

**Status**: ACTIVE **Created**: 2025-10-01 **Target**: Achieve 50%+ test
coverage with high-quality, maintainable tests **Current Coverage**: 36.76%
statements, 26.2% branches, 35.55% functions, 36.93% lines

---

## Current State Analysis

### Coverage by Category (as of 2025-10-01)

**Well-Tested Components (>50%)**:

- `detectors.ts`: 90.9% - Relationship detection algorithms ✓
- `monitored-router.ts`: 58.57% - Monitoring integration ✓
- `rate-limiter.ts`: 57.69% - Rate limiting ✓
- `text-analyzer.ts`: 49.09% - Text analysis ✓
- `request-validator.ts`: 42.85% - Input validation ✓

**Partially-Tested Components (10-50%)**:

- `engine.ts`: 45.96% - Relationship engine
- `base-layer.ts`: 29.68% - Base layer functionality
- `router.ts`: 23.36% - Core routing logic
- `decay-modeler.ts`: 6.57% - Memory decay prediction

**Untested Components (0%)**:

- All embedding services (BGE, OpenAI, FAISS, code embeddings)
- Autonomous intelligence service
- Semantic enrichment pipeline
- Production-ready system
- Secure index/routers
- Error handling/recovery
- Many layer implementations

### Critical Gaps

1. **Core Router Logic**: 23.36% coverage on the most critical component
2. **Layer Implementations**: Global (13.43%), Project (20%), Temporal (9.9%)
3. **Advanced Search**: 1.48% coverage on hybrid search
4. **Error Handling**: 0% coverage on error recovery/resilient operations
5. **Integration Tests**: Limited cross-component testing

---

## Sprint Structure

### Sprint Duration

- **Length**: 1 week per sprint
- **Velocity**: ~500-800 lines of test code per sprint
- **Coverage Goal**: +3-5% per sprint

---

## Phase 1: Core Foundation (Sprints 1-2)

**Goal**: Achieve 45% coverage | **Duration**: 2 weeks | **Priority**: CRITICAL

### Sprint 1: Core Router & Layer Foundation

**Target**: +5% coverage (36.76% → 41.76%)

**Deliverables**:

1. **Router Core Tests** (`tests/memory/router.test.ts`)
   - Store/retrieve/update/delete operations
   - Layer routing logic (session → project → global → temporal)
   - Metadata handling
   - Edge cases (duplicate IDs, invalid metadata)
   - **Est**: 200 lines, +4% coverage

2. **Global Layer Tests** (`tests/memory/layers/global-layer.test.ts`)
   - CRUD operations
   - Persistence (save/load from JSON)
   - Search functionality
   - Stats generation
   - **Est**: 150 lines, +2% coverage

3. **Project Layer Tests** (`tests/memory/layers/project-layer.test.ts`)
   - Project isolation
   - Project switching
   - Cross-project queries
   - **Est**: 120 lines, +1.5% coverage

**Success Criteria**:

- ✓ Router.ts coverage > 50%
- ✓ Global layer coverage > 40%
- ✓ Project layer coverage > 40%
- ✓ All tests pass
- ✓ No performance degradation

---

### Sprint 2: Session & Temporal Layers

**Target**: +4% coverage (41.76% → 45.76%)

**Deliverables**:

1. **Session Layer Tests** (`tests/memory/layers/session-layer.test.ts`)
   - Session lifecycle
   - Session-scoped storage
   - Session cleanup/expiration
   - **Est**: 100 lines, +2% coverage

2. **Temporal Layer Tests** (`tests/memory/layers/temporal-layer.test.ts`)
   - Time-based storage
   - Temporal queries
   - Archive functionality
   - Decay handling
   - **Est**: 150 lines, +2% coverage

3. **Cross-Layer Integration Tests** (`tests/memory/layer-integration.test.ts`)
   - Data flow between layers
   - Priority-based routing
   - Layer promotion/demotion
   - **Est**: 120 lines, +1% coverage

**Success Criteria**:

- ✓ Session layer coverage > 60%
- ✓ Temporal layer coverage > 30%
- ✓ Integration tests demonstrate correct layer interaction
- ✓ Reach 45% overall coverage

---

## Phase 2: Advanced Features (Sprints 3-4)

**Goal**: Achieve 52% coverage | **Duration**: 2 weeks | **Priority**: HIGH

### Sprint 3: Relationship Engine & Search

**Target**: +4% coverage (45.76% → 49.76%)

**Deliverables**:

1. **Relationship Engine Tests** (`tests/memory/relationships/engine.test.ts`)
   - Relationship detection
   - Knowledge graph construction
   - Graph traversal
   - Conflict detection (expand existing tests)
   - **Est**: 180 lines, +3% coverage

2. **Advanced Search Tests** (`tests/memory/search/advanced-search.test.ts`)
   - Semantic search
   - Temporal search
   - Hybrid search modes
   - Result ranking
   - **Est**: 150 lines, +2% coverage

3. **Validation Interface Tests**
   (`tests/memory/relationships/validation-interface.test.ts`)
   - User validation workflow
   - Feedback processing
   - Algorithm learning
   - **Est**: 100 lines, +1% coverage

**Success Criteria**:

- ✓ Relationship engine coverage > 65%
- ✓ Advanced search coverage > 40%
- ✓ Validation interface coverage > 30%
- ✓ Reach ~50% overall coverage

---

### Sprint 4: Monitoring & Performance

**Target**: +3% coverage (49.76% → 52.76%)

**Deliverables**:

1. **Performance Monitor Tests**
   (`tests/monitoring/performance-monitor.test.ts`)
   - Operation tracking
   - Slow operation detection
   - Performance metrics
   - **Est**: 120 lines, +2% coverage

2. **Telemetry System Tests** (`tests/monitoring/telemetry.test.ts`)
   - Metric recording
   - Health checks
   - Metric retrieval
   - Retention handling
   - **Est**: 100 lines, +1.5% coverage

3. **Monitoring Integration Tests** (expand existing)
   - End-to-end monitoring flows
   - Alert generation
   - Metric aggregation
   - **Est**: 80 lines, +0.5% coverage

**Success Criteria**:

- ✓ Performance monitor coverage > 60%
- ✓ Telemetry coverage > 40%
- ✓ Monitoring integration working end-to-end
- ✓ Achieve 52%+ overall coverage 🎯

---

## Phase 3: Error Handling & Resilience (Sprint 5)

**Goal**: Achieve 55% coverage | **Duration**: 1 week | **Priority**: MEDIUM

### Sprint 5: Error Recovery & Resilient Operations

**Target**: +3% coverage (52.76% → 55.76%)

**Deliverables**:

1. **Error Recovery Tests** (`tests/error-handling/error-recovery.test.ts`)
   - Retry mechanisms
   - Fallback strategies
   - Circuit breaker patterns
   - Recovery from partial failures
   - **Est**: 150 lines, +2% coverage

2. **Resilient Router Tests** (`tests/error-handling/resilient-router.test.ts`)
   - Graceful degradation
   - Error propagation
   - Timeout handling
   - **Est**: 120 lines, +1.5% coverage

3. **Error Types Tests** (`tests/error-handling/error-types.test.ts`)
   - Custom error classes
   - Error serialization
   - Error context preservation
   - **Est**: 80 lines, +0.5% coverage

**Success Criteria**:

- ✓ Error recovery coverage > 50%
- ✓ Resilient router coverage > 40%
- ✓ Error handling proven through failure scenarios
- ✓ Reach 55%+ overall coverage

---

## Phase 4: Advanced Intelligence (Sprint 6) [OPTIONAL]

**Goal**: Achieve 58% coverage | **Duration**: 1 week | **Priority**: LOW

### Sprint 6: Decay Modeling & Enhanced Features

**Target**: +3% coverage (55.76% → 58.76%)

**Deliverables**:

1. **Decay Modeler Tests** (`tests/memory/relationships/decay-modeler.test.ts`)
   - Decay prediction
   - Urgency detection
   - Promotion/archival candidates
   - Model insights
   - **Est**: 150 lines, +2% coverage

2. **Enhanced Validation Tests**
   (`tests/memory/relationships/enhanced-validation.test.ts`)
   - Advanced validation patterns
   - Confidence scoring
   - User feedback integration
   - **Est**: 100 lines, +1% coverage

3. **Cluster Analyzer Tests**
   (`tests/memory/relationships/cluster-analyzer.test.ts`)
   - Cluster detection
   - Cluster summarization
   - Cluster evolution
   - **Est**: 80 lines, +0.5% coverage

**Success Criteria**:

- ✓ Decay modeler coverage > 40%
- ✓ Enhanced validation coverage > 20%
- ✓ Cluster analyzer coverage > 40%
- ✓ Reach 58%+ overall coverage

---

## Deferred/Out-of-Scope

The following modules will **NOT** be tested in this plan:

### Experimental/Unintegrated Features (0% coverage OK)

- **Embedding Services** (BGE, OpenAI, FAISS, code embeddings)
  - _Reason_: External dependencies, not integrated into main router
  - _Action_: Mark as experimental, document or remove

- **Autonomous Intelligence Service**
  - _Reason_: Not integrated, unclear requirements
  - _Action_: Document as future work or remove

- **Semantic Enrichment Pipeline**
  - _Reason_: Not used by core system
  - _Action_: Move to experimental/ directory or remove

- **Production-Ready System & Secure Routers**
  - _Reason_: Duplicate/alternative implementations not in main flow
  - _Action_: Consolidate or document as examples

### Rationale

Testing these modules would:

- Require external service mocks (embeddings APIs, vector databases)
- Test code paths not used in production
- Dilute focus from core functionality
- Not meaningfully improve system reliability

**Recommendation**: Document these as experimental features or remove if unused.

---

## Testing Standards & Practices

### Test Quality Guidelines

1. **Test Structure**
   - Use descriptive test names: `should [action] when [condition]`
   - Group related tests with `describe` blocks
   - One assertion per test (when possible)
   - Arrange-Act-Assert pattern

2. **Coverage Targets per Module**
   - Critical paths: 80%+ coverage
   - Core features: 60%+ coverage
   - Supporting features: 40%+ coverage
   - Experimental: 0% OK

3. **Test Types**
   - **Unit**: 70% of tests - Fast, isolated, single component
   - **Integration**: 25% of tests - Multiple components working together
   - **E2E**: 5% of tests - Full workflows through the system

4. **Performance Requirements**
   - Individual test: < 100ms
   - Test suite: < 60 seconds total
   - No external network calls (use mocks)
   - Clean up resources (files, timers, connections)

5. **Maintainability**
   - Extract test utilities to `tests/utils/`
   - Use factories for test data
   - Mock external dependencies consistently
   - Document complex test scenarios

### Pre-Commit Checklist

Before committing test code:

- [ ] All tests pass locally
- [ ] No console.log or debugging code
- [ ] Test names are descriptive
- [ ] Coverage increased (verify with `npm test`)
- [ ] No new linting errors
- [ ] Used `--forceExit` if async operations present

---

## Success Metrics

### Phase Completion Criteria

**Phase 1 Complete When**:

- ✓ Coverage ≥ 45%
- ✓ Core router fully tested
- ✓ All layer types tested
- ✓ Integration tests passing

**Phase 2 Complete When**:

- ✓ Coverage ≥ 52%
- ✓ Relationship engine tested
- ✓ Search functionality tested
- ✓ Monitoring validated

**Phase 3 Complete When**:

- ✓ Coverage ≥ 55%
- ✓ Error handling tested
- ✓ Resilience proven
- ✓ All critical paths covered

**Overall Success**:

- ✓ Achieve 52%+ coverage (Phase 2)
- ✓ Zero failing tests
- ✓ Test suite runs in < 60s
- ✓ All critical components > 60% coverage
- ✓ Documentation updated

---

## Risk Management

### Potential Blockers

1. **Time Constraints**
   - _Mitigation_: Prioritize Phases 1-2, defer Phase 4 if needed
   - _Fallback_: Focus on critical paths only

2. **Test Complexity**
   - _Mitigation_: Start with simple cases, add edge cases incrementally
   - _Fallback_: Accept lower coverage for complex modules

3. **External Dependencies**
   - _Mitigation_: Mock all external services
   - _Fallback_: Skip modules requiring complex mocking

4. **Performance Issues**
   - _Mitigation_: Use in-memory storage for tests
   - _Fallback_: Parallelize test execution

### Scope Adjustments

If behind schedule after Sprint 2:

- ✓ Skip Phase 4 entirely
- ✓ Reduce Phase 3 to error recovery only
- ✓ Focus on reaching 50% minimum

If ahead of schedule:

- ✓ Add embeddings service tests
- ✓ Expand integration test coverage
- ✓ Add performance benchmarks

---

## Next Steps

### Immediate Actions (This Week)

1. **Create Sprint 1 Branch**

   ```bash
   git checkout -b sprint-1-core-router-tests
   ```

2. **Set Up Test Infrastructure**
   - Create `tests/utils/` directory
   - Add test data factories
   - Set up test environment configuration

3. **Begin Router Tests**
   - Start with happy path tests
   - Add edge case tests
   - Run coverage checks frequently

4. **Daily Progress Tracking**
   - Update coverage percentage daily
   - Document any blockers
   - Adjust estimates as needed

### Sprint Planning Template

For each sprint:

1. Review previous sprint results
2. Adjust estimates based on actual velocity
3. Prioritize tests based on risk
4. Set up test files and structure
5. Write tests incrementally
6. Run coverage checks daily
7. Review and refactor before sprint end
8. Update this plan with learnings

---

## Appendix: Coverage Calculation

### How Coverage is Measured

```bash
# Run full test suite with coverage
npm test -- --coverage

# Run specific test file with coverage
npm test -- path/to/test.test.ts --coverage

# Generate HTML coverage report
npm test -- --coverage --coverageReporters=html
# View: open coverage/index.html
```

### Current Module Coverage Breakdown

```
CRITICAL (Must reach 60%+):
- router.ts: 23.36% → Target: 65%
- monitored-router.ts: 58.57% → Target: 70%
- base-layer.ts: 29.68% → Target: 60%

HIGH PRIORITY (Must reach 50%+):
- global-layer.ts: 13.43% → Target: 55%
- project-layer.ts: 20% → Target: 55%
- session-layer.ts: 31.25% → Target: 65%
- temporal-layer.ts: 9.9% → Target: 50%
- engine.ts: 45.96% → Target: 70%

MEDIUM PRIORITY (Must reach 40%+):
- advanced-search.ts: 1.48% → Target: 45%
- performance-monitor.ts: 29.67% → Target: 65%
- telemetry.ts: 15.26% → Target: 45%
- decay-modeler.ts: 6.57% → Target: 40%

LOW PRIORITY (Can stay low):
- Embedding services: 0% → Target: 0% (defer)
- Autonomous intelligence: 0% → Target: 0% (defer)
- Production-ready-system: 0% → Target: 0% (consolidate/remove)
```

---

## Document Control

**Version**: 1.0 **Last Updated**: 2025-10-01 **Next Review**: After Sprint 2
completion **Owner**: Development Team

### Change Log

- 2025-10-01: Initial plan created based on 36.76% baseline coverage
- Target: 52%+ coverage through Phase 2 (4 sprints)
- Stretch goal: 58%+ coverage including Phase 4 (6 sprints total)
