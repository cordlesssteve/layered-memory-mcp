/**
 * Memory Router: Intelligent routing and coordination between memory layers
 * - Decides which layer(s) to query based on context
 * - Aggregates results from multiple layers
 * - Manages cross-layer operations like promotion and archival
 */

// import { randomUUID } from 'crypto'; // Not needed in router
import { createLogger } from '../utils/logger.js';
import { SessionLayer } from './layers/session-layer.js';
import { ProjectLayer } from './layers/project-layer.js';
import { GlobalLayer } from './layers/global-layer.js';
import { TemporalLayer } from './layers/temporal-layer.js';
import {
  AdvancedSearchEngine,
  type AdvancedQuery,
  type SearchResult,
} from './search/advanced-search.js';
import {
  MemoryRelationshipEngine,
  type MemoryRelationship,
  type KnowledgeGraph,
  type ConflictResolution,
  type MemoryVersion,
  type DecayPrediction,
} from './relationships/index.js';
import {
  RelationshipValidationInterface,
  type RelationshipSuggestion,
  type ValidationStats,
} from './relationships/validation-interface.js';
import type {
  MemoryItem,
  MemoryLayerInterface,
  MemoryRouterInterface,
  MemoryRouterConfig,
  MemoryLayer,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryMetadata,
  MemoryAnalysis,
  MemoryFilters,
  MemoryEvent,
  MemoryEventHandler,
} from './types.js';

export class MemoryRouter implements MemoryRouterInterface {
  private readonly logger = createLogger('memory-router');
  private readonly layers = new Map<MemoryLayer, MemoryLayerInterface>();
  private readonly eventHandlers: MemoryEventHandler[] = [];
  private readonly config: MemoryRouterConfig;
  private readonly advancedSearchEngine: AdvancedSearchEngine;
  private readonly relationshipEngine: MemoryRelationshipEngine;
  private readonly validationInterface: RelationshipValidationInterface;

  constructor(config: Partial<MemoryRouterConfig> = {}) {
    this.config = {
      sessionLayer: { maxItems: 50, maxSizeBytes: 1024 * 1024, ttl: undefined },
      projectLayer: { maxItems: 1000, maxSizeBytes: 10 * 1024 * 1024, ttl: undefined },
      globalLayer: { maxItems: 10000, maxSizeBytes: 100 * 1024 * 1024, ttl: undefined },
      temporalLayer: { maxItems: 50000, maxSizeBytes: 500 * 1024 * 1024, ttl: undefined },
      routing: {
        sessionThreshold: 0.8,
        projectThreshold: 0.6,
        globalThreshold: 0.4,
        temporalFallback: true,
        maxResults: 20,
        scoringWeights: {
          recency: 0.3,
          frequency: 0.2,
          relevance: 0.4,
          priority: 0.1,
        },
      },
      relationships: {
        enabled: true, // Enable relationship detection by default
        minConfidence: 0.6, // Minimum confidence for auto-detection
        batchSize: 100, // Maximum memories to consider for relationships
      },
      ...config,
    };

    this.initializeLayers();
    this.advancedSearchEngine = new AdvancedSearchEngine(this.layers);
    this.relationshipEngine = new MemoryRelationshipEngine();
    this.validationInterface = new RelationshipValidationInterface();

    this.logger.info('Memory router initialized', {
      layerCount: this.layers.size,
      config: this.config.routing,
    });
  }

  async store(content: string, metadata: MemoryMetadata): Promise<MemoryItem> {
    // Determine target layer based on metadata and content analysis
    const targetLayer = this.determineStorageLayer(content, metadata);
    const layer = this.layers.get(targetLayer);

    if (!layer) {
      throw new Error(`Layer ${targetLayer} not available`);
    }

    // Store in target layer
    const item = await layer.store({
      content,
      metadata: {
        ...metadata,
        source: metadata.source || 'user-input',
      },
    });

    // Emit event
    await this.emitEvent({
      type: 'store',
      layer: targetLayer,
      itemId: item.id,
      timestamp: new Date(),
      metadata: { contentLength: content.length, category: metadata.category },
    });

    // Check for promotion to higher layers
    await this.considerPromotion(item, targetLayer);

    // Automatically detect relationships if enabled
    if (this.config.relationships.enabled) {
      try {
        await this.detectRelationshipsForMemory(item);
      } catch (error) {
        this.logger.warn('Relationship detection failed', {
          memoryId: item.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    this.logger.info('Memory stored', {
      id: item.id,
      layer: targetLayer,
      contentLength: content.length,
      category: metadata.category,
      relationshipsEnabled: this.config.relationships.enabled,
    });

    return item;
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const startTime = Date.now();

    // Analyze query to determine which layers to search
    const analysis = await this.analyze(query.query);
    const layersToSearch = analysis.suggestedLayers;

    this.logger.debug('Search routing', {
      query: query.query,
      suggestedLayers: layersToSearch,
      complexity: analysis.queryComplexity,
    });

    // Search each layer in parallel
    const searchPromises = layersToSearch.map(async layerName => {
      const layer = this.layers.get(layerName);
      if (!layer) return [];

      try {
        const results = await layer.search(query);
        return results;
      } catch (error) {
        this.logger.error(`Search failed in ${layerName} layer`, {
          error: error instanceof Error ? error.message : error,
        });
        return [];
      }
    });

    const layerResults = await Promise.all(searchPromises);
    const allResults = layerResults.flat();

    // Merge and rank results
    const mergedResults = this.mergeAndRankResults(allResults, query);

    // Apply query limit or default limit
    const limit = query.limit ?? this.config.routing.maxResults;
    const finalResults = mergedResults.slice(0, limit);

    // Emit event
    await this.emitEvent({
      type: 'search',
      layer: 'session', // Primary layer for event tracking
      query: query.query,
      timestamp: new Date(),
      metadata: {
        layersSearched: layersToSearch,
        resultCount: finalResults.length,
        searchTime: Date.now() - startTime,
      },
    });

    this.logger.info('Search completed', {
      query: query.query,
      layersSearched: layersToSearch,
      resultCount: finalResults.length,
      searchTime: Date.now() - startTime,
    });

    return finalResults;
  }

  async advancedSearch(query: AdvancedQuery): Promise<SearchResult[]> {
    const startTime = Date.now();

    this.logger.debug('Advanced search initiated', {
      query: query.query,
      semanticEnabled: query.semanticSearch?.enabled !== false,
      temporalEnabled: query.temporalPatterns?.enabled === true,
      relationshipEnabled: query.relationships?.enabled === true,
    });

    try {
      // Use the advanced search engine for sophisticated queries
      const results = await this.advancedSearchEngine.hybridSearch(query);

      // Emit event
      await this.emitEvent({
        type: 'search',
        layer: 'session',
        query: query.query || 'advanced-search',
        timestamp: new Date(),
        metadata: {
          searchType: 'advanced',
          resultCount: results.length,
          searchTime: Date.now() - startTime,
          features: {
            semantic: query.semanticSearch?.enabled !== false,
            temporal: query.temporalPatterns?.enabled === true,
            relationships: query.relationships?.enabled === true,
          },
        },
      });

      this.logger.info('Advanced search completed', {
        query: query.query,
        resultCount: results.length,
        searchTime: Date.now() - startTime,
      });

      return results;
    } catch (error) {
      this.logger.error('Advanced search failed', {
        query: query.query,
        error: error instanceof Error ? error.message : error,
      });

      // Fallback to regular search
      if (query.query) {
        const fallbackQuery: MemoryQuery = { query: query.query || '' };
        if (query.limit !== undefined) fallbackQuery.limit = query.limit;
        if (query.filters !== undefined) fallbackQuery.filters = query.filters;

        const fallbackResults = await this.search(fallbackQuery);

        // Convert regular results to advanced format
        return fallbackResults.map(result => ({
          ...result,
          explanation: 'Fallback to regular search due to advanced search failure',
          relevanceFactors: ['content-match'],
          confidence: result.score,
        }));
      }

      return [];
    }
  }

  async semanticSearch(
    query: string,
    options?: { threshold?: number; maxResults?: number }
  ): Promise<SearchResult[]> {
    const advancedQuery: AdvancedQuery = {
      query,
      limit: options?.maxResults || 20,
      semanticSearch: {
        enabled: true,
        threshold: options?.threshold || 0.7,
        includeEmbeddings: false,
      },
      temporalPatterns: { enabled: false },
      relationships: { enabled: false },
    };

    return this.advancedSearch(advancedQuery);
  }

  async temporalSearch(
    query: string,
    timeRange?: { start?: Date; end?: Date }
  ): Promise<SearchResult[]> {
    const advancedQuery: AdvancedQuery = {
      query,
      limit: 20,
      semanticSearch: { enabled: false, threshold: 0.7 },
      temporalPatterns:
        timeRange && timeRange.start && timeRange.end
          ? {
              enabled: true,
              timeWindow: {
                start: timeRange.start,
                end: timeRange.end,
              },
            }
          : { enabled: true },
      relationships: { enabled: false },
    };

    return this.advancedSearch(advancedQuery);
  }

  async relationshipSearch(query: string, _relationshipTypes?: string[]): Promise<SearchResult[]> {
    const advancedQuery: AdvancedQuery = {
      query,
      limit: 20,
      semanticSearch: { enabled: false, threshold: 0.7 },
      temporalPatterns: { enabled: false },
      relationships: { enabled: true },
    };

    return this.advancedSearch(advancedQuery);
  }

  async retrieve(id: string): Promise<MemoryItem | null> {
    // Try each layer until found
    for (const [layerName, layer] of this.layers) {
      try {
        const item = await layer.retrieve(id);
        if (item) {
          // Emit event
          await this.emitEvent({
            type: 'retrieve',
            layer: layerName,
            itemId: id,
            timestamp: new Date(),
          });

          this.logger.debug('Memory retrieved', { id, layer: layerName });
          return item;
        }
      } catch (error) {
        this.logger.error(`Retrieve failed in ${layerName} layer`, {
          id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return null;
  }

  async update(
    id: string,
    updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>
  ): Promise<MemoryItem | null> {
    // Find which layer contains the item
    for (const [layerName, layer] of this.layers) {
      try {
        const updated = await layer.update(id, updates);
        if (updated) {
          // Emit event
          await this.emitEvent({
            type: 'update',
            layer: layerName,
            itemId: id,
            timestamp: new Date(),
            metadata: updates,
          });

          this.logger.info('Memory updated', { id, layer: layerName });
          return updated;
        }
      } catch (error) {
        this.logger.error(`Update failed in ${layerName} layer`, {
          id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return null;
  }

  async delete(id: string): Promise<boolean> {
    // Try to delete from all layers (item might exist in multiple)
    let deleted = false;

    for (const [layerName, layer] of this.layers) {
      try {
        if (await layer.delete(id)) {
          deleted = true;

          // Emit event
          await this.emitEvent({
            type: 'delete',
            layer: layerName,
            itemId: id,
            timestamp: new Date(),
          });

          this.logger.info('Memory deleted', { id, layer: layerName });
        }
      } catch (error) {
        this.logger.error(`Delete failed in ${layerName} layer`, {
          id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return deleted;
  }

  getLayer(layer: MemoryLayer): MemoryLayerInterface {
    const layerInstance = this.layers.get(layer);
    if (!layerInstance) {
      throw new Error(`Layer ${layer} not available`);
    }
    return layerInstance;
  }

  async getAllStats(): Promise<Record<MemoryLayer, MemoryStats>> {
    const stats = {} as Record<MemoryLayer, MemoryStats>;

    for (const [layerName, layer] of this.layers) {
      try {
        stats[layerName] = await layer.getStats();
      } catch (error) {
        this.logger.error(`Failed to get stats for ${layerName}`, {
          error: error instanceof Error ? error.message : error,
        });
        // Provide default stats if layer fails
        stats[layerName] = {
          totalItems: 0,
          totalSize: 0,
          averageAccessCount: 0,
          lastAccessed: undefined,
          oldestItem: undefined,
          newestItem: undefined,
          categoryCounts: {},
          tagCounts: {},
        };
      }
    }

    return stats;
  }

  async optimize(): Promise<void> {
    this.logger.info('Starting cross-layer optimization');

    // Optimize each layer
    const optimizePromises = Array.from(this.layers.entries()).map(async ([layerName, layer]) => {
      try {
        await layer.optimize();
        this.logger.debug(`Optimized ${layerName} layer`);
      } catch (error) {
        this.logger.error(`Failed to optimize ${layerName} layer`, {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    await Promise.all(optimizePromises);

    // Perform cross-layer optimizations
    await this.performCrossLayerOptimization();

    this.logger.info('Cross-layer optimization completed');
  }

  async cleanup(): Promise<Record<MemoryLayer, number>> {
    const cleanupResults = {} as Record<MemoryLayer, number>;

    for (const [layerName, layer] of this.layers) {
      try {
        const cleanedCount = await layer.cleanup();
        cleanupResults[layerName] = cleanedCount;

        if (cleanedCount > 0) {
          // Emit event
          await this.emitEvent({
            type: 'cleanup',
            layer: layerName,
            timestamp: new Date(),
            metadata: { cleanedCount },
          });
        }
      } catch (error) {
        this.logger.error(`Cleanup failed for ${layerName}`, {
          error: error instanceof Error ? error.message : error,
        });
        cleanupResults[layerName] = 0;
      }
    }

    return cleanupResults;
  }

  async migrate(
    fromLayer: MemoryLayer,
    toLayer: MemoryLayer,
    criteria: MemoryFilters
  ): Promise<number> {
    const sourceLayer = this.layers.get(fromLayer);
    const targetLayer = this.layers.get(toLayer);

    if (!sourceLayer || !targetLayer) {
      throw new Error(`Invalid layer migration: ${fromLayer} -> ${toLayer}`);
    }

    // Find items matching criteria
    const searchResults = await sourceLayer.search({
      query: '',
      filters: criteria,
      limit: 1000, // Process in batches
    });

    let migratedCount = 0;

    for (const result of searchResults) {
      try {
        // Store in target layer
        await targetLayer.store({
          content: result.memory.content,
          metadata: result.memory.metadata,
        });

        // Delete from source layer
        await sourceLayer.delete(result.memory.id);

        migratedCount++;

        this.logger.debug('Item migrated', {
          id: result.memory.id,
          from: fromLayer,
          to: toLayer,
        });
      } catch (error) {
        this.logger.error('Failed to migrate item', {
          id: result.memory.id,
          from: fromLayer,
          to: toLayer,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // Emit event
    await this.emitEvent({
      type: 'migrate',
      layer: fromLayer,
      timestamp: new Date(),
      metadata: {
        fromLayer,
        toLayer,
        migratedCount,
        criteria,
      },
    });

    this.logger.info('Migration completed', {
      from: fromLayer,
      to: toLayer,
      migratedCount,
    });

    return migratedCount;
  }

  async analyze(query: string): Promise<MemoryAnalysis> {
    const tokens = this.tokenize(query);
    const complexity = this.assessQueryComplexity(query, tokens);

    // Determine which layers are most relevant
    const suggestedLayers = await this.suggestLayers(query, tokens, complexity);

    // Estimate result count
    const estimatedResults = await this.estimateResultCount(query, suggestedLayers);

    // Generate recommended filters
    const recommendedFilters = this.generateRecommendedFilters(tokens);

    // Generate related queries
    const relatedQueries = this.generateRelatedQueries(tokens);

    return {
      suggestedLayers,
      queryComplexity: complexity,
      estimatedResults,
      recommendedFilters,
      relatedQueries,
    };
  }

  addEventListener(handler: MemoryEventHandler): void {
    this.eventHandlers.push(handler);
  }

  removeEventListener(handler: MemoryEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index >= 0) {
      this.eventHandlers.splice(index, 1);
    }
  }

  async close(): Promise<void> {
    this.logger.info('Closing memory router');

    // Close all layers
    const closePromises = Array.from(this.layers.values()).map(async layer => {
      if ('close' in layer && typeof layer.close === 'function') {
        try {
          await (layer as any).close();
        } catch (error) {
          this.logger.error('Failed to close layer', {
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    });

    await Promise.all(closePromises);

    this.logger.info('Memory router closed');
  }

  // Private methods

  private initializeLayers(): void {
    // Initialize session layer
    this.layers.set('session', new SessionLayer(this.config.sessionLayer));

    // Initialize project layer (using default project ID)
    this.layers.set('project', new ProjectLayer('default', this.config.projectLayer));

    // Initialize global layer
    this.layers.set('global', new GlobalLayer(this.config.globalLayer));

    // Initialize temporal layer
    this.layers.set('temporal', new TemporalLayer(this.config.temporalLayer));
  }

  private determineStorageLayer(content: string, metadata: MemoryMetadata): MemoryLayer {
    // Check for explicit layer specification first
    const explicitLayer = this.getExplicitLayer(metadata);
    if (explicitLayer) return explicitLayer;

    // Apply routing rules in priority order
    return (
      this.getLayerByTags(metadata.tags) ||
      this.getLayerByCategory(metadata.category) ||
      this.getLayerByPriority(metadata.priority) ||
      this.getLayerByContentSize(content) ||
      'session' // Default fallback
    );
  }

  private getExplicitLayer(metadata: MemoryMetadata): MemoryLayer | null {
    if ('targetLayer' in metadata && typeof metadata['targetLayer'] === 'string') {
      const explicitLayer = metadata['targetLayer'] as MemoryLayer;
      return this.layers.has(explicitLayer) ? explicitLayer : null;
    }
    return null;
  }

  private getLayerByTags(tags: string[]): MemoryLayer | null {
    if (tags.includes('important') || tags.includes('reference')) return 'global';
    if (tags.includes('temporary') || tags.includes('session')) return 'session';
    return null;
  }

  private getLayerByCategory(category: string): MemoryLayer | null {
    if (category === 'system' || category === 'configuration') return 'global';
    if (category === 'project-specific') return 'project';
    return null;
  }

  private getLayerByPriority(priority: number): MemoryLayer | null {
    if (priority >= 8) return 'global';
    if (priority >= 6) return 'project';
    return null;
  }

  private getLayerByContentSize(content: string): MemoryLayer | null {
    return content.length > 5000 ? 'project' : null;
  }

  private async considerPromotion(item: MemoryItem, currentLayer: MemoryLayer): Promise<void> {
    // Skip if already in highest priority layer
    if (currentLayer === 'global') return;

    let shouldPromote = false;
    let targetLayer: MemoryLayer = currentLayer;

    // Promotion criteria
    if (item.metadata.priority >= 8) {
      shouldPromote = true;
      targetLayer = 'global';
    } else if (item.metadata.priority >= 6 && currentLayer === 'session') {
      shouldPromote = true;
      targetLayer = 'project';
    }

    // Tag-based promotion
    if (item.metadata.tags.includes('promote') || item.metadata.tags.includes('important')) {
      shouldPromote = true;
      targetLayer = currentLayer === 'session' ? 'project' : 'global';
    }

    if (shouldPromote && targetLayer !== currentLayer) {
      try {
        const targetLayerInstance = this.layers.get(targetLayer);
        if (targetLayerInstance) {
          await targetLayerInstance.store({
            content: item.content,
            metadata: item.metadata,
          });

          this.logger.info('Memory promoted', {
            id: item.id,
            from: currentLayer,
            to: targetLayer,
            reason: 'auto-promotion',
          });
        }
      } catch (error) {
        this.logger.error('Failed to promote memory', {
          id: item.id,
          from: currentLayer,
          to: targetLayer,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  private mergeAndRankResults(
    results: MemorySearchResult[],
    _query: MemoryQuery
  ): MemorySearchResult[] {
    // Deduplicate by content similarity
    const uniqueResults = this.deduplicateResults(results);

    // Apply cross-layer scoring
    const scoredResults = uniqueResults.map(result => ({
      ...result,
      score: this.calculateCrossLayerScore(result, _query),
    }));

    // Sort by final score
    return scoredResults.sort((a, b) => b.score - a.score);
  }

  private deduplicateResults(results: MemorySearchResult[]): MemorySearchResult[] {
    const seen = new Set<string>();
    const deduplicated: MemorySearchResult[] = [];

    for (const result of results) {
      // Use content hash for deduplication
      const contentHash = this.hashContent(result.memory.content);

      if (!seen.has(contentHash)) {
        seen.add(contentHash);
        deduplicated.push(result);
      }
    }

    return deduplicated;
  }

  private calculateCrossLayerScore(result: MemorySearchResult, _query: MemoryQuery): number {
    const weights = this.config.routing.scoringWeights;
    let { score } = result;

    const now = Date.now();
    const age = now - result.memory.createdAt.getTime();
    const hoursSinceCreated = age / (1000 * 60 * 60);

    // Recency scoring
    const recencyScore = Math.max(0, 1 - hoursSinceCreated / (24 * 7)); // Decay over a week
    score += recencyScore * weights.recency;

    // Frequency scoring
    const frequencyScore = Math.min(result.memory.accessCount / 10, 1);
    score += frequencyScore * weights.frequency;

    // Priority scoring
    const priorityScore = result.memory.metadata.priority / 10;
    score += priorityScore * weights.priority;

    // Layer-specific bonuses
    switch (result.source) {
      case 'session':
        score += 0.1; // Slight boost for session (current context)
        break;
      case 'project':
        score += 0.05; // Medium boost for project-specific
        break;
      case 'global':
        score += 0.02; // Small boost for global knowledge
        break;
      case 'temporal':
        score += 0.01; // Minimal boost for historical context
        break;
    }

    return Math.min(score, 1.0);
  }

  private async suggestLayers(
    _query: string,
    tokens: string[],
    complexity: MemoryAnalysis['queryComplexity']
  ): Promise<MemoryLayer[]> {
    const layers: MemoryLayer[] = [];

    // Always include session for current context
    layers.push('session');

    // Add layers based on query characteristics
    if (complexity === 'simple') {
      // Simple queries: prioritize recent and project-specific
      layers.push('project');
    } else if (complexity === 'moderate') {
      // Moderate queries: include global knowledge
      layers.push('project', 'global');
    } else {
      // Complex queries: search all layers
      layers.push('project', 'global', 'temporal');
    }

    // Token-based layer suggestions
    if (tokens.includes('history') || tokens.includes('past') || tokens.includes('previous')) {
      if (!layers.includes('temporal')) {
        layers.push('temporal');
      }
    }

    if (tokens.includes('global') || tokens.includes('universal') || tokens.includes('general')) {
      if (!layers.includes('global')) {
        layers.push('global');
      }
    }

    return layers;
  }

  private assessQueryComplexity(
    query: string,
    tokens: string[]
  ): MemoryAnalysis['queryComplexity'] {
    if (query.length < 20 && tokens.length <= 3) {
      return 'simple';
    }

    if (query.length > 100 || tokens.length > 10) {
      return 'complex';
    }

    return 'moderate';
  }

  private async estimateResultCount(_query: string, layers: MemoryLayer[]): Promise<number> {
    // Simple estimation based on layer capacities and query complexity
    let estimate = 0;

    for (const layerName of layers) {
      const layer = this.layers.get(layerName);
      if (layer) {
        const stats = await layer.getStats();
        // Estimate 10% of items might match for moderate queries
        estimate += Math.round(stats.totalItems * 0.1);
      }
    }

    return Math.min(estimate, 100); // Cap at reasonable number
  }

  private generateRecommendedFilters(tokens: string[]): MemoryFilters {
    const filters: MemoryFilters = {};

    // Extract potential categories from tokens
    const categories = ['system', 'project', 'user', 'configuration', 'data'];
    const matchedCategory = categories.find(cat => tokens.includes(cat));
    if (matchedCategory) {
      filters.category = matchedCategory;
    }

    // Extract potential tags
    const commonTags = ['important', 'temporary', 'reference', 'draft', 'completed'];
    const matchedTags = commonTags.filter(tag => tokens.includes(tag));
    if (matchedTags.length > 0) {
      filters.tags = matchedTags;
    }

    // Time-based filters
    if (tokens.includes('recent') || tokens.includes('today')) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filters.dateRange = { start: today };
    } else if (tokens.includes('week')) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filters.dateRange = { start: weekAgo };
    }

    return filters;
  }

  private generateRelatedQueries(tokens: string[]): string[] {
    // Generate simple related queries based on tokens
    const related: string[] = [];

    // Synonym expansion
    const synonyms: Record<string, string[]> = {
      find: ['search', 'locate', 'get'],
      create: ['make', 'build', 'generate'],
      update: ['modify', 'change', 'edit'],
      delete: ['remove', 'clear', 'eliminate'],
    };

    for (const token of tokens) {
      if (synonyms[token]) {
        for (const synonym of synonyms[token]) {
          const relatedQuery = tokens.map(t => (t === token ? synonym : t)).join(' ');
          related.push(relatedQuery);
        }
      }
    }

    return related.slice(0, 3); // Limit to 3 suggestions
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  private hashContent(content: string): string {
    // Simple hash for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private async performCrossLayerOptimization(): Promise<void> {
    // Promote frequently accessed session items to project layer
    const sessionLayer = this.layers.get('session');
    if (sessionLayer && 'getPromotionCandidates' in sessionLayer) {
      const promotionCandidates = await (
        sessionLayer as unknown as SessionLayer
      ).getPromotionCandidates();
      if (promotionCandidates.length > 0) {
        await this.migrate('session', 'project', {
          // Migration criteria handled by getPromotionCandidates
        });
      }
    }

    // Archive old global items to temporal layer
    const globalLayer = this.layers.get('global');
    if (globalLayer) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      await this.migrate('global', 'temporal', {
        dateRange: { end: sixMonthsAgo },
      });
    }
  }

  private async emitEvent(event: MemoryEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error('Event handler failed', {
          eventType: event.type,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  // Relationship and evolution methods
  async buildKnowledgeGraph(): Promise<KnowledgeGraph> {
    // Collect all memories from all layers
    const allMemories: MemoryItem[] = [];

    for (const layer of this.layers.values()) {
      const memories = await layer.export();
      allMemories.push(...memories);
    }

    // Detect relationships between all memories
    for (const memory of allMemories) {
      const otherMemories = allMemories.filter(m => m.id !== memory.id);
      await this.relationshipEngine.detectRelationships(memory, otherMemories);
    }

    // Build and return the knowledge graph
    return await this.relationshipEngine.buildKnowledgeGraph(allMemories);
  }

  async getMemoryRelationships(memoryId: string): Promise<MemoryRelationship[]> {
    return this.relationshipEngine.getMemoryRelationships(memoryId);
  }

  async detectConflicts(): Promise<ConflictResolution[]> {
    // Collect all memories from all layers
    const allMemories: MemoryItem[] = [];

    for (const layer of this.layers.values()) {
      const memories = await layer.export();
      allMemories.push(...memories);
    }

    return await this.relationshipEngine.detectConflicts(allMemories);
  }

  async getMemoryVersions(memoryId: string): Promise<MemoryVersion[]> {
    return this.relationshipEngine.getMemoryVersions(memoryId);
  }

  async summarizeCluster(memoryIds: string[]): Promise<string> {
    return await this.relationshipEngine.summarizeCluster(memoryIds);
  }

  // Relationship Validation Interface Methods
  async getRelationshipSuggestions(
    limit?: number,
    minConfidence?: number
  ): Promise<RelationshipSuggestion[]> {
    if (minConfidence !== undefined) {
      return this.validationInterface
        .getSuggestionsByConfidence(minConfidence, 1.0)
        .slice(0, limit || 10);
    }
    return this.validationInterface.getPendingSuggestions(limit || 10);
  }

  async validateRelationship(
    suggestionId: string,
    options: {
      action: 'confirm' | 'reject' | 'modify';
      userFeedback?: string;
      modifiedType?: string;
      modifiedConfidence?: number;
    }
  ): Promise<boolean> {
    switch (options.action) {
      case 'confirm':
        return this.validationInterface.confirmSuggestion(suggestionId, options.userFeedback);
      case 'reject':
        return this.validationInterface.rejectSuggestion(suggestionId, options.userFeedback);
      case 'modify':
        return this.validationInterface.modifySuggestion(
          suggestionId,
          options.modifiedType,
          options.modifiedConfidence,
          options.userFeedback
        );
      default:
        return false;
    }
  }

  async getValidationStats(): Promise<ValidationStats> {
    return this.validationInterface.getValidationStats();
  }

  async getAlgorithmInsights() {
    return this.validationInterface.getAlgorithmInsights();
  }

  // Memory Decay Prediction Methods
  async predictMemoryDecay(): Promise<DecayPrediction[]> {
    // Get all memories from all layers
    const allMemories: MemoryItem[] = [];
    for (const layer of this.layers.values()) {
      const memories = await layer.export();
      allMemories.push(...memories);
    }

    return await this.relationshipEngine.predictMemoryDecay(allMemories);
  }

  async getUrgentMemories(): Promise<DecayPrediction[]> {
    const allMemories: MemoryItem[] = [];
    for (const layer of this.layers.values()) {
      const memories = await layer.export();
      allMemories.push(...memories);
    }

    return await this.relationshipEngine.getUrgentMemories(allMemories);
  }

  async getPromotionCandidates(): Promise<DecayPrediction[]> {
    const allMemories: MemoryItem[] = [];
    for (const layer of this.layers.values()) {
      const memories = await layer.export();
      allMemories.push(...memories);
    }

    return await this.relationshipEngine.getPromotionCandidates(allMemories);
  }

  async getArchivalCandidates(): Promise<DecayPrediction[]> {
    const allMemories: MemoryItem[] = [];
    for (const layer of this.layers.values()) {
      const memories = await layer.export();
      allMemories.push(...memories);
    }

    return await this.relationshipEngine.getArchivalCandidates(allMemories);
  }

  async getDecayModelInsights() {
    const allMemories: MemoryItem[] = [];
    for (const layer of this.layers.values()) {
      const memories = await layer.export();
      allMemories.push(...memories);
    }

    return await this.relationshipEngine.getDecayModelInsights(allMemories);
  }

  // Helper method to detect relationships for a single memory
  private async detectRelationshipsForMemory(memory: MemoryItem): Promise<void> {
    // Get existing memories from all layers with batch size limit
    const allMemories: MemoryItem[] = [];
    let totalMemories = 0;

    for (const layer of this.layers.values()) {
      if (totalMemories >= this.config.relationships.batchSize) break;

      const memories = await layer.export();
      const remainingSlots = this.config.relationships.batchSize - totalMemories;
      const memoriesToAdd = memories.slice(0, remainingSlots);

      allMemories.push(...memoriesToAdd);
      totalMemories += memoriesToAdd.length;
    }

    // Filter out the memory itself
    const existingMemories = allMemories.filter(m => m.id !== memory.id);

    // Detect and store relationships
    const relationships = await this.relationshipEngine.detectRelationships(
      memory,
      existingMemories
    );

    // Filter relationships by confidence threshold
    const filteredRelationships = relationships.filter(
      rel => rel.confidence >= this.config.relationships.minConfidence
    );

    this.logger.debug(
      `Detected ${relationships.length} relationships (${filteredRelationships.length} above threshold) for memory ${memory.id}`,
      {
        threshold: this.config.relationships.minConfidence,
        batchSize: existingMemories.length,
      }
    );
  }

  // Enhanced store method with relationship detection (now delegates to main store)
  async storeWithRelationships(content: string, metadata: MemoryMetadata): Promise<MemoryItem> {
    // The main store method now handles relationship detection automatically
    return await this.store(content, metadata);
  }

  // Get relationship engine for direct access
  getRelationshipEngine(): MemoryRelationshipEngine {
    return this.relationshipEngine;
  }
}
