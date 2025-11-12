/**
 * Type definitions for the Dynamic Memory Evolution system
 */

import type { MemoryItem } from '../types.js';

// Core relationship types for memory evolution
export type RelationshipType =
  | 'reference' // Direct citation or reference
  | 'contextual' // Related context or setting
  | 'causal' // Cause and effect relationship
  | 'temporal' // Time-based sequence
  | 'hierarchical' // Parent-child or part-whole
  | 'contradiction' // Conflicting information
  | 'confirmation' // Supporting evidence
  | 'evolution' // Version or update relationship
  | 'synthesis' // Combination of multiple memories
  | 'derivation'; // Derived or inferred from

export interface MemoryRelationship {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  type: RelationshipType;
  confidence: number; // 0-1, how confident we are in this relationship
  weight: number; // 0-1, strength of the relationship
  metadata: {
    source: 'auto-detected' | 'user-defined' | 'system-inferred';
    algorithm: string; // Which algorithm detected this relationship
    createdAt: Date;
    validatedBy?: string; // User ID if validated
    notes?: string;
  };
}

export interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, MemoryRelationship>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    averageConnections: number;
    topCentralNodes: string[]; // Most connected memory IDs
  };
}

export interface GraphNode {
  memoryId: string;
  memory: MemoryItem;
  connections: string[]; // Relationship IDs
  centrality: number; // 0-1, importance based on connections
  importance: number; // 0-1, overall importance score
  cluster?: string; // Cluster ID if assigned
}

export interface MemoryCluster {
  id: string;
  memoryIds: string[];
  centroid: string; // Central memory ID
  cohesion: number; // 0-1, how tightly related memories are
  keywords: string[];
  commonTags: string[];
  summary: string;
  createdAt: Date;
}

export interface ConflictResolution {
  id: string;
  conflictingMemoryIds: string[];
  conflictType: 'contradiction' | 'duplication' | 'inconsistency';
  confidence: number;
  suggestedResolution: 'merge' | 'prioritize' | 'contextualize' | 'coexist';
  metadata: {
    detectedAt: Date;
    algorithm: string;
    resolvedAt?: Date;
    resolvedBy?: string;
    notes?: string;
  };
}

export interface MemoryVersion {
  id: string;
  memoryId: string;
  version: number;
  parentVersionId?: string;
  changeType: 'created' | 'updated' | 'merged' | 'split' | 'archived';
  changes: {
    content?: { old: string; new: string };
    metadata?: { old: any; new: any };
  };
  createdAt: Date;
  createdBy: string;
}

export interface RelationshipDetectionResult {
  relationship: MemoryRelationship | null;
  confidence: number;
  reasoning: string;
}

export interface RelationshipCreationParams {
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  confidence: number;
  weight: number;
  algorithm: string;
}