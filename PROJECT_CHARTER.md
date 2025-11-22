# PROJECT CHARTER: layered-memory

**Status:** FOUNDATIONAL **Created:** 2025-11-17 **Project Type:** Single-Branch
(MCP Server) **Charter Version:** 1.0 (ORIGINAL) **Revisions:** None

---

⚠️ **IMMUTABILITY NOTICE**

## This charter preserves original project vision. Only edit for typo corrections, formatting fixes, or clarifications (logged in CHARTER_CHANGELOG.md). For scope/vision changes, create CHARTER_REVISION document in `/docs/charter/`.

## 1. Project Purpose

Claude Code's session-scoped memory means valuable project knowledge,
cross-project insights, and learned preferences disappear after each
conversation ends—forcing developers to repeatedly explain project context, team
conventions, and architectural decisions every time they start a new session,
creating "knowledge amnesia" that wastes time and reduces AI assistance quality.

This MCP server addresses the memory persistence problem by providing
hierarchical memory management across Session → Project → Global → Temporal
layers with automatic context categorization and intelligent retrieval. The core
insight is that different knowledge types require different persistence
scopes—session context is ephemeral, project knowledge endures, global
preferences apply everywhere, and temporal memory tracks time-based patterns.

**Primary Objective:** Enable intelligent memory persistence and retrieval
across hierarchical layers (Session/Project/Global/Temporal) through automatic
context categorization, semantic search with memory decay scoring, and
cross-session knowledge retention eliminating repeated explanations and
improving AI assistance quality.

## 2. Success Criteria

- [ ] Four memory layers operational (Session/Project/Global/Temporal)
- [ ] Automatic context categorization assigns knowledge to appropriate layer
- [ ] Semantic search retrieves relevant memories based on current task
- [ ] Memory decay scoring prioritizes recent and important knowledge
- [ ] Cross-session knowledge preservation working
- [ ] Project-specific memory isolation maintained
- [ ] At least one "remembers from last time" experience validating value

## 3. Scope Boundaries

**In Scope:** Hierarchical layer management with different persistence scopes,
automatic context categorization, semantic search with vector embeddings, memory
decay and importance scoring, cross-session knowledge retention,
project-specific isolation, temporal pattern tracking

**Out of Scope:** Real-time conversation sync, cloud storage, multi-user
knowledge sharing, automated knowledge graph construction

**Future Consideration:** Knowledge graph relationships, collaborative memory
sharing, memory conflict resolution

## 4. Key Stakeholders

| Role              | Name/Entity                                | Interest                             | Influence Level |
| ----------------- | ------------------------------------------ | ------------------------------------ | --------------- |
| Developer         | cordlesssteve                              | Persistent knowledge across sessions | High            |
| Claude Code Users | Reduced repetition and improved assistance | Medium                               |

## 5. Constraints

**Time:** Memory retrieval must not slow down Claude Code responses **Budget:**
Zero-budget (local storage, local embeddings) **Technology:** Vector database,
semantic embeddings, TypeScript **Resources:** Local memory storage

## 6. Assumptions

1. Hierarchical layers match natural knowledge categorization
2. Automatic categorization achieves >80% accuracy
3. Memory decay scoring improves retrieval relevance
4. Developers value persistent knowledge over session restart

## 7. Known Risks

| Risk                                      | Probability | Impact | Mitigation                                     |
| ----------------------------------------- | ----------- | ------ | ---------------------------------------------- |
| Memory storage growth unbounded           | Medium      | Medium | Decay policies, manual cleanup, storage limits |
| Categorization errors pollute layers      | Medium      | Low    | Manual recategorization, validation            |
| Retrieval performance degrades with scale | Low         | Medium | Indexing optimization, query tuning            |

## 8. Background & Context

Session-only memory limits Claude Code's ability to learn project context and
user preferences over time. Persistent layered memory enables cumulative
knowledge retention matching human long-term memory patterns.

**Related Projects:** Claude Code (memory consumer)

## 9. Dependencies

**External:** Vector database (ChromaDB or similar), embedding models
**Internal:** MCP SDK, TypeScript memory management

## 10. Success Metrics

- **Categorization Accuracy:** >80% of memories automatically assigned to
  correct layer
- **Retrieval Relevance:** Top 5 memories include relevant knowledge >75% of
  time
- **User Experience:** >50% reduction in repeated explanations across sessions

---

**Approved By:** cordlesssteve | **Approval Date:** 2025-11-17

This is the original charter. Changes logged in
`/docs/charter/CHARTER_CHANGELOG.md`.
