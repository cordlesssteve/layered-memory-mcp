/**
 * Core types and interfaces for the 4-layer memory hierarchy
 */

export interface MemoryItem {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

export interface MemoryMetadata {
  tags: string[];
  category: string;
  priority: number; // 1-10, higher = more important
  source: string; // e.g., 'user-input', 'system', 'auto-generated'
  projectId?: string | undefined;
  sessionId?: string | undefined;
  userId?: string | undefined;
  expiresAt?: Date | undefined;
  [key: string]: unknown; // Allow additional custom metadata
}

export interface MemoryQuery {
  query: string;
  limit?: number | undefined;
  offset?: number | undefined;
  filters?: MemoryFilters | undefined;
  similarity?: SimilarityOptions | undefined;
}

export interface MemoryFilters {
  tags?: string[] | undefined;
  category?: string | undefined;
  priority?: { min?: number | undefined; max?: number | undefined } | undefined;
  source?: string | undefined;
  projectId?: string | undefined;
  sessionId?: string | undefined;
  userId?: string | undefined;
  dateRange?: { start?: Date | undefined; end?: Date | undefined } | undefined;
  [key: string]: unknown;
}

export interface SimilarityOptions {
  threshold?: number | undefined; // 0-1, minimum similarity score
  algorithm?: 'cosine' | 'euclidean' | 'semantic' | undefined;
  includeMetadata?: boolean | undefined;
}

export interface MemorySearchResult {
  memory: MemoryItem;
  score: number; // Relevance/similarity score 0-1
  source: MemoryLayer;
  explanation?: string; // Why this result was selected
}

export interface MemoryStats {
  totalItems: number;
  totalSize: number; // In bytes
  averageAccessCount: number;
  lastAccessed: Date | undefined;
  oldestItem: Date | undefined;
  newestItem: Date | undefined;
  categoryCounts: Record<string, number>;
  tagCounts: Record<string, number>;
}

export type MemoryLayer = 'session' | 'project' | 'global' | 'temporal';

export interface MemoryLayerConfig {
  maxItems?: number;
  maxSizeBytes?: number;
  ttl: number | undefined; // Time to live in milliseconds
  compressionEnabled?: boolean;
  indexingEnabled?: boolean;
}

export interface MemoryLayerInterface {
  readonly layer: MemoryLayer;
  readonly config: MemoryLayerConfig;

  // Core operations
  store(
    _item: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>
  ): Promise<MemoryItem>;
  retrieve(_id: string): Promise<MemoryItem | null>;
  search(_query: MemoryQuery): Promise<MemorySearchResult[]>;
  update(
    _id: string,
    _updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>
  ): Promise<MemoryItem | null>;
  delete(_id: string): Promise<boolean>;

  // Bulk operations
  bulkStore(
    _items: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>[]
  ): Promise<MemoryItem[]>;
  bulkDelete(_ids: string[]): Promise<number>; // Returns count of deleted items

  // Maintenance operations
  cleanup(): Promise<number>; // Returns count of cleaned up items
  getStats(): Promise<MemoryStats>;
  export(): Promise<MemoryItem[]>;
  import(_items: MemoryItem[]): Promise<number>; // Returns count of imported items

  // Layer-specific operations
  optimize(): Promise<void>; // Optimize storage/indexing
  backup(): Promise<string>; // Returns backup identifier
  restore(_backupId: string): Promise<boolean>;
}

export interface MemoryRouterConfig {
  sessionLayer: MemoryLayerConfig;
  projectLayer: MemoryLayerConfig;
  globalLayer: MemoryLayerConfig;
  temporalLayer: MemoryLayerConfig;
  routing: RoutingConfig;
  relationships: RelationshipConfig;
}

export interface RelationshipConfig {
  enabled: boolean; // Whether to automatically detect relationships on store
  minConfidence: number; // Minimum confidence threshold for auto-detection
  batchSize: number; // Maximum memories to process for relationships per store operation
}

export interface RoutingConfig {
  sessionThreshold: number; // Score threshold for routing to session layer
  projectThreshold: number; // Score threshold for routing to project layer
  globalThreshold: number; // Score threshold for routing to global layer
  temporalFallback: boolean; // Whether to fall back to temporal layer
  maxResults: number; // Maximum results to return across all layers
  scoringWeights: ScoringWeights;
}

export interface ScoringWeights {
  recency: number; // Weight for how recent the memory is
  frequency: number; // Weight for access frequency
  relevance: number; // Weight for semantic relevance
  priority: number; // Weight for explicit priority
}

export interface MemoryRouterInterface {
  // Unified operations that work across all layers
  store(_content: string, _metadata: MemoryMetadata): Promise<MemoryItem>;
  search(_query: MemoryQuery): Promise<MemorySearchResult[]>;
  retrieve(_id: string): Promise<MemoryItem | null>;
  update(
    _id: string,
    _updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>
  ): Promise<MemoryItem | null>;
  delete(_id: string): Promise<boolean>;

  // Layer management
  getLayer(_layer: MemoryLayer): MemoryLayerInterface;
  getAllStats(): Promise<Record<MemoryLayer, MemoryStats>>;
  optimize(): Promise<void>;
  cleanup(): Promise<Record<MemoryLayer, number>>;

  // Advanced operations
  migrate(
    _fromLayer: MemoryLayer,
    _toLayer: MemoryLayer,
    _criteria: MemoryFilters
  ): Promise<number>;
  analyze(_query: string): Promise<MemoryAnalysis>;

  // Relationship and evolution operations
  buildKnowledgeGraph(): Promise<any>; // KnowledgeGraph from relationships.ts
  getMemoryRelationships(_memoryId: string): Promise<any[]>; // MemoryRelationship[]
  detectConflicts(): Promise<any[]>; // ConflictResolution[]
  getMemoryVersions(_memoryId: string): Promise<any[]>; // MemoryVersion[]
  summarizeCluster(_memoryIds: string[]): Promise<string>;
}

export interface MemoryAnalysis {
  suggestedLayers: MemoryLayer[];
  queryComplexity: 'simple' | 'moderate' | 'complex';
  estimatedResults: number;
  recommendedFilters: MemoryFilters;
  relatedQueries: string[];
}

export interface MemoryEvent {
  type: 'store' | 'retrieve' | 'search' | 'update' | 'delete' | 'cleanup' | 'migrate';
  layer: MemoryLayer;
  itemId?: string;
  query?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export type MemoryEventHandler = (_event: MemoryEvent) => void | Promise<void>;
