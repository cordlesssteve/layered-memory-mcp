/**
 * Dynamic Memory Evolution System - Module Index
 *
 * This module provides a clean interface to the refactored relationship system.
 * The original 852-line relationships.ts has been split into focused modules:
 *
 * - types.ts: Type definitions and interfaces
 * - detectors.ts: Relationship detection algorithms
 * - text-analyzer.ts: Text analysis utilities
 * - knowledge-graph.ts: Knowledge graph construction
 * - conflict-detector.ts: Conflict detection and resolution
 * - cluster-analyzer.ts: Memory clustering and analysis
 * - version-tracker.ts: Version tracking and evolution
 * - engine.ts: Main orchestrator engine
 */

// Export main engine (drop-in replacement for original MemoryRelationshipEngine)
export { MemoryRelationshipEngine } from './engine.js';

// Export all types for external use
export type {
  RelationshipType,
  MemoryRelationship,
  KnowledgeGraph,
  GraphNode,
  MemoryCluster,
  ConflictResolution,
  MemoryVersion,
  RelationshipDetectionResult,
  RelationshipCreationParams
} from './types.js';

// Export specialized engines for advanced use cases
export { RelationshipDetectors } from './detectors.js';
export { KnowledgeGraphEngine } from './knowledge-graph.js';
export { ConflictDetector } from './conflict-detector.js';
export { ClusterAnalyzer } from './cluster-analyzer.js';
export { VersionTracker } from './version-tracker.js';
export { TextAnalyzer } from './text-analyzer.js';
export { MemoryDecayModeler } from './decay-modeler.js';

// Export decay prediction types
export type { DecayPrediction } from './decay-modeler.js';

// Export performance optimization
export { RelationshipPerformanceOptimizer } from './performance-optimizer.js';
export type { ProcessingMetrics } from './performance-optimizer.js';

// Export validation interfaces
export { RelationshipValidationInterface } from './validation-interface.js';
export { EnhancedValidationInterface } from './enhanced-validation.js';
export type { RelationshipSuggestion } from './validation-interface.js';
export type { UserPreferences, LearningInsights, SuggestionPriority } from './enhanced-validation.js';

// Export error handling system
export {
  RelationshipErrorHandler,
  RelationshipValidator,
  RelationshipError,
  RelationshipErrorType,
  relationshipErrorHandler
} from './error-handling.js';
export type { ErrorRecoveryStrategy } from './error-handling.js';