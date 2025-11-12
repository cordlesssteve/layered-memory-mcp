/**
 * Advanced Search Engine for Layered Memory System
 * Provides sophisticated search capabilities across all memory layers
 */

import type {
  MemoryQuery,
  MemorySearchResult,
  MemoryItem,
  MemoryLayer,
  MemoryLayerInterface
} from '../types.js';

export interface AdvancedQuery extends MemoryQuery {
  // Semantic search enhancements
  semanticSearch?: {
    enabled: boolean;
    threshold: number;
    includeEmbeddings?: boolean;
    crossLanguage?: boolean;
  };

  // Temporal patterns
  temporalPatterns?: {
    enabled: boolean;
    timeWindow?: {
      start: Date;
      end: Date;
    };
    periodicity?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    relativeTime?: string; // e.g., "last week", "this month"
  };

  // Relationship mapping
  relationships?: {
    enabled: boolean;
    includeReferences?: boolean;
    includeContextual?: boolean;
    includeCausal?: boolean;
    maxDepth?: number;
  };

  // Advanced aggregation
  aggregation?: {
    groupBy?: 'category' | 'tags' | 'project' | 'timeperiod';
    metrics?: Array<'count' | 'avgScore' | 'totalSize' | 'accessFrequency'>;
    includeStats?: boolean;
  };

  // Query optimization
  optimization?: {
    useCache?: boolean;
    cacheKey?: string;
    parallel?: boolean;
    earlyTermination?: boolean;
  };
}

export interface SearchResult extends MemorySearchResult {
  // Enhanced result information
  confidence: number;
  relevanceFactors: string[];
  semanticScore?: number;
  temporalRelevance?: number;
  relationshipStrength?: number;
  layerRelevance?: Record<MemoryLayer, number>;

  // Contextual information
  relatedMemories?: MemorySearchResult[];
  temporalContext?: {
    before: MemoryItem[];
    after: MemoryItem[];
    concurrent: MemoryItem[];
  };

  // Aggregation data
  aggregationData?: {
    group: string;
    metrics: Record<string, number>;
    memberCount: number;
  };
}

export interface SearchAnalytics {
  queryPerformance: {
    totalTime: number;
    layerTimes: Record<MemoryLayer, number>;
    cacheHits: number;
    cacheMisses: number;
  };

  resultQuality: {
    totalResults: number;
    layerDistribution: Record<MemoryLayer, number>;
    scoreDistribution: {
      high: number; // > 0.8
      medium: number; // 0.4 - 0.8
      low: number; // < 0.4
    };
  };

  searchPatterns: {
    queryType: 'semantic' | 'temporal' | 'keyword' | 'hybrid';
    complexity: 'simple' | 'moderate' | 'complex';
    layersQueried: MemoryLayer[];
  };
}

export class AdvancedSearchEngine {
  private layers: Map<MemoryLayer, MemoryLayerInterface>;
  private cache = new Map<string, { results: SearchResult[]; timestamp: number; ttl: number }>();
  private analytics: SearchAnalytics[] = [];

  constructor(layers: Map<MemoryLayer, MemoryLayerInterface>) {
    this.layers = layers;
  }

  /**
   * Enhanced semantic search across all layers
   */
  async semanticSearch(
    query: string,
    options: AdvancedQuery['semanticSearch'] = { enabled: true, threshold: 0.3 }
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Get embeddings from Global Layer's vector system
    const globalLayer = this.layers.get('global');
    if (!globalLayer || !('findSimilarMemories' in globalLayer)) {
      throw new Error('Global layer not available for semantic search');
    }

    // Perform semantic search across layers
    for (const [layerName, layer] of this.layers) {

      try {
        // Use existing search for non-global layers, enhanced semantic for global
        let layerResults: MemorySearchResult[];

        if (layerName === 'global' && 'findSimilarMemories' in layer) {
          layerResults = await (layer as any).findSimilarMemories(query, 20);
        } else {
          layerResults = await layer.search({
            query,
            similarity: { threshold: options.threshold },
            limit: 20
          });
        }

        // Convert to enhanced results
        const enhancedResults = layerResults.map(result => ({
          ...result,
          semanticScore: result.score,
          layerRelevance: { [layerName]: result.score } as Record<MemoryLayer, number>,
          temporalRelevance: this.calculateTemporalRelevance(result.memory),
        })) as SearchResult[];

        results.push(...enhancedResults);

      } catch (error) {
        console.warn(`Semantic search failed for layer ${layerName}:`, error);
      }
    }

    // Merge and deduplicate results
    const deduplicatedResults = this.deduplicateResults(results);

    // Apply semantic scoring boost
    const semanticResults = this.applySemanticScoring(deduplicatedResults, query);

    // Sort by combined semantic score
    semanticResults.sort((a, b) => (b.semanticScore ?? 0) - (a.semanticScore ?? 0));

    return semanticResults.slice(0, 15);
  }

  /**
   * Temporal pattern-based search
   */
  async temporalSearch(query: AdvancedQuery): Promise<SearchResult[]> {
    if (!query.temporalPatterns?.enabled) {
      return [];
    }

    const temporalLayer = this.layers.get('temporal');
    if (!temporalLayer) {
      return [];
    }

    const results: SearchResult[] = [];

    // Time window search
    if (query.temporalPatterns.timeWindow) {
      const { start, end } = query.temporalPatterns.timeWindow;

      if ('getMemoriesInRange' in temporalLayer) {
        const timeRangeItems = await (temporalLayer as any).getMemoriesInRange(start, end, 50);

        const timeResults = timeRangeItems
          .filter((item: MemoryItem) => this.matchesQuery(item, query.query || ''))
          .map((item: MemoryItem) => ({
            memory: item,
            score: this.calculateTemporalScore(item, start, end),
            source: 'temporal' as MemoryLayer,
            explanation: `Found in time range ${start.toISOString()} to ${end.toISOString()}`,
            temporalRelevance: this.calculateTemporalRelevance(item),
            layerRelevance: { temporal: 1.0 } as Record<MemoryLayer, number>,
          })) as SearchResult[];

        results.push(...timeResults);
      }
    }

    // Periodicity pattern search
    if (query.temporalPatterns.periodicity) {
      const patternResults = await this.searchByPeriodicity(
        query.query || '',
        query.temporalPatterns.periodicity
      );
      results.push(...patternResults);
    }

    // Relative time search
    if (query.temporalPatterns.relativeTime) {
      const relativeResults = await this.searchByRelativeTime(
        query.query || '',
        query.temporalPatterns.relativeTime
      );
      results.push(...relativeResults);
    }

    return this.deduplicateResults(results).slice(0, 20);
  }

  /**
   * Relationship mapping and contextual search
   */
  async relationshipSearch(query: AdvancedQuery): Promise<SearchResult[]> {
    if (!query.relationships?.enabled) {
      return [];
    }

    // First, get base results
    const baseResults = await this.semanticSearch(query.query || '');

    // Enhance with relationship information
    const enhancedResults: SearchResult[] = [];

    for (const result of baseResults) {
      const enhanced = { ...result };

      // Find related memories
      if (query.relationships.includeReferences) {
        enhanced.relatedMemories = await this.findRelatedMemories(
          result.memory,
          'reference',
          query.relationships.maxDepth ?? 2
        );
      }

      // Find temporal context
      if (query.relationships.includeContextual) {
        const context = await this.findTemporalContext(result.memory);
        if (context) {
          enhanced.temporalContext = context;
        }
      }

      // Calculate relationship strength
      enhanced.relationshipStrength = this.calculateRelationshipStrength(
        result.memory,
        enhanced.relatedMemories || [],
        enhanced.temporalContext
      );

      enhancedResults.push(enhanced);
    }

    return enhancedResults;
  }

  /**
   * Advanced aggregation and grouping
   */
  async aggregatedSearch(query: AdvancedQuery): Promise<{
    results: SearchResult[];
    aggregations: Record<string, any>;
  }> {
    if (!query.aggregation) {
      const results = await this.hybridSearch(query);
      return { results, aggregations: {} };
    }

    // Get base results
    const results = await this.hybridSearch(query);

    // Perform aggregations
    const aggregations: Record<string, any> = {};

    if (query.aggregation.groupBy) {
      aggregations['groups'] = this.groupResults(results, query.aggregation.groupBy);
    }

    if (query.aggregation.metrics) {
      aggregations['metrics'] = this.calculateAggregateMetrics(results, query.aggregation.metrics);
    }

    if (query.aggregation.includeStats) {
      aggregations['statistics'] = this.calculateSearchStatistics(results);
    }

    return { results, aggregations };
  }

  /**
   * Hybrid search combining all capabilities
   */
  async hybridSearch(query: AdvancedQuery): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    // Check cache first
    if (query.optimization?.useCache) {
      const cacheKey = query.optimization.cacheKey || this.generateCacheKey(query);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Parallel execution of different search types
    const searchPromises: Promise<SearchResult[]>[] = [];

    // Semantic search
    if (query.semanticSearch?.enabled !== false) {
      searchPromises.push(this.semanticSearch(query.query || '', query.semanticSearch));
    }

    // Temporal search
    if (query.temporalPatterns?.enabled) {
      searchPromises.push(this.temporalSearch(query));
    }

    // Relationship search
    if (query.relationships?.enabled) {
      searchPromises.push(this.relationshipSearch(query));
    }

    // Execute searches
    const searchResults = await Promise.all(searchPromises);

    // Combine and merge results
    for (const results of searchResults) {
      allResults.push(...results);
    }

    // Deduplicate and rank
    const finalResults = this.deduplicateResults(allResults);
    const rankedResults = this.rankHybridResults(finalResults, query);

    // Cache results
    if (query.optimization?.useCache) {
      const cacheKey = query.optimization.cacheKey || this.generateCacheKey(query);
      this.setCache(cacheKey, rankedResults);
    }

    // Record analytics
    this.recordAnalytics(query, finalResults, 0);

    return rankedResults.slice(0, query.limit || 20);
  }

  // Helper methods
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      if (seen.has(result.memory.id)) {
        return false;
      }
      seen.add(result.memory.id);
      return true;
    });
  }

  private applySemanticScoring(results: SearchResult[], query: string): SearchResult[] {
    return results.map(result => {
      const semanticBoost = this.calculateSemanticBoost(result.memory.content, query);
      return {
        ...result,
        semanticScore: (result.semanticScore || result.score) * (1 + semanticBoost),
      };
    });
  }

  private calculateTemporalRelevance(item: MemoryItem): number {
    const now = Date.now();
    const age = now - item.createdAt.getTime();
    const dayAge = age / (24 * 60 * 60 * 1000);

    // Recency boost
    if (dayAge < 1) return 1.0;
    if (dayAge < 7) return 0.8;
    if (dayAge < 30) return 0.6;
    if (dayAge < 90) return 0.4;
    return 0.2;
  }

  private calculateSemanticBoost(content: string, query: string): number {
    const contentWords = content.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);

    const overlap = queryWords.filter(word =>
      contentWords.some(cWord => cWord.includes(word) || word.includes(cWord))
    ).length;

    return overlap / Math.max(queryWords.length, 1);
  }

  private matchesQuery(item: MemoryItem, query: string): boolean {
    if (!query) return true;

    const searchText = `${item.content} ${item.metadata.tags.join(' ')} ${item.metadata.category}`.toLowerCase();
    const queryWords = query.toLowerCase().split(/\s+/);

    return queryWords.some(word => searchText.includes(word));
  }

  private calculateTemporalScore(item: MemoryItem, start: Date, end: Date): number {
    const itemTime = item.createdAt.getTime();
    const startTime = start.getTime();
    const endTime = end.getTime();

    if (itemTime < startTime || itemTime > endTime) return 0;

    const rangeSize = endTime - startTime;
    const position = (itemTime - startTime) / rangeSize;

    // Higher score for items in the middle of the range
    return 1 - Math.abs(position - 0.5) * 2;
  }

  private async searchByPeriodicity(_query: string, _periodicity: string): Promise<SearchResult[]> {
    // Implementation for periodic pattern search
    // This would analyze temporal patterns and find memories that match the periodicity
    return [];
  }

  private async searchByRelativeTime(query: string, relativeTime: string): Promise<SearchResult[]> {
    // Implementation for relative time search (e.g., "last week", "this month")
    const now = new Date();
    let start: Date, end: Date;

    switch (relativeTime.toLowerCase()) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case 'yesterday':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'last week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      case 'this month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      default:
        return [];
    }

    const temporalLayer = this.layers.get('temporal');
    if (!temporalLayer || !('getMemoriesInRange' in temporalLayer)) {
      return [];
    }

    const items = await (temporalLayer as any).getMemoriesInRange(start, end, 30);

    return items
      .filter((item: MemoryItem) => this.matchesQuery(item, query))
      .map((item: MemoryItem) => ({
        memory: item,
        score: this.calculateTemporalScore(item, start, end),
        source: 'temporal' as MemoryLayer,
        explanation: `Found in ${relativeTime}`,
        temporalRelevance: 1.0,
        layerRelevance: { temporal: 1.0 } as Record<MemoryLayer, number>,
      })) as SearchResult[];
  }

  private async findRelatedMemories(
    item: MemoryItem,
    _relationType: string,
    _maxDepth: number
  ): Promise<MemorySearchResult[]> {
    // Find memories related by tags, categories, or content similarity
    const related: MemorySearchResult[] = [];

    // Search by tags
    if (item.metadata.tags.length > 0) {
      for (const [, layer] of this.layers) {
        const tagResults = await layer.search({
          query: '',
          filters: { tags: item.metadata.tags },
          limit: 5
        });

        related.push(...tagResults.filter(r => r.memory.id !== item.id));
      }
    }

    // Search by category
    for (const [, layer] of this.layers) {
      const categoryResults = await layer.search({
        query: '',
        filters: { category: item.metadata.category },
        limit: 3
      });

      related.push(...categoryResults.filter(r => r.memory.id !== item.id));
    }

    return related.slice(0, 10);
  }

  private async findTemporalContext(item: MemoryItem): Promise<SearchResult['temporalContext']> {
    const temporalLayer = this.layers.get('temporal');
    if (!temporalLayer || !('getTemporalContext' in temporalLayer)) {
      return { before: [], after: [], concurrent: [] };
    }

    const context = await (temporalLayer as any).getTemporalContext(item.createdAt, 60, 5);

    return {
      before: context.before || [],
      after: context.after || [],
      concurrent: context.exact || [],
    };
  }

  private calculateRelationshipStrength(
    item: MemoryItem,
    related: MemorySearchResult[],
    temporalContext?: SearchResult['temporalContext']
  ): number {
    let strength = 0;

    // Related memories contribute to strength
    strength += Math.min(related.length / 10, 0.5);

    // Temporal context contributes
    if (temporalContext) {
      const contextSize = temporalContext.before.length + temporalContext.after.length + temporalContext.concurrent.length;
      strength += Math.min(contextSize / 15, 0.3);
    }

    // Tag overlap with related memories
    const itemTags = new Set(item.metadata.tags);
    const relatedTagOverlap = related.reduce((overlap, rel) => {
      const commonTags = rel.memory.metadata.tags.filter(tag => itemTags.has(tag));
      return overlap + commonTags.length;
    }, 0);

    strength += Math.min(relatedTagOverlap / 20, 0.2);

    return Math.min(strength, 1.0);
  }

  private groupResults(results: SearchResult[], groupBy: string): Record<string, SearchResult[]> {
    const groups: Record<string, SearchResult[]> = {};

    for (const result of results) {
      let key: string;

      switch (groupBy) {
        case 'category':
          key = result.memory.metadata.category;
          break;
        case 'tags':
          key = result.memory.metadata.tags[0] || 'untagged';
          break;
        case 'project':
          key = result.memory.metadata.projectId || 'no-project';
          break;
        case 'timeperiod':
          const date = result.memory.createdAt;
          key = `${date.getFullYear()}-${date.getMonth() + 1}`;
          break;
        default:
          key = 'unknown';
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key]!.push(result);
    }

    return groups;
  }

  private calculateAggregateMetrics(results: SearchResult[], metrics: string[]): Record<string, number> {
    const calculated: Record<string, number> = {};

    for (const metric of metrics) {
      switch (metric) {
        case 'count':
          calculated['count'] = results.length;
          break;
        case 'avgScore':
          calculated['avgScore'] = results.reduce((sum, r) => sum + r.score, 0) / results.length;
          break;
        case 'totalSize':
          calculated['totalSize'] = results.reduce((sum, r) => sum + r.memory.content.length, 0);
          break;
        case 'accessFrequency':
          calculated['accessFrequency'] = results.reduce((sum, r) => sum + r.memory.accessCount, 0) / results.length;
          break;
      }
    }

    return calculated;
  }

  private calculateSearchStatistics(results: SearchResult[]): Record<string, any> {
    const layers = results.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {} as Record<MemoryLayer, number>);

    const scores = results.map(r => r.score);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    return {
      layerDistribution: layers,
      scoreStatistics: { avg: avgScore, max: maxScore, min: minScore },
      resultCount: results.length,
    };
  }

  private rankHybridResults(results: SearchResult[], _query: AdvancedQuery): SearchResult[] {
    return results.map(result => {
      let finalScore = result.score;

      // Apply semantic boost
      if (result.semanticScore) {
        finalScore = (finalScore * 0.4) + (result.semanticScore * 0.6);
      }

      // Apply temporal boost
      if (result.temporalRelevance) {
        finalScore = (finalScore * 0.8) + (result.temporalRelevance * 0.2);
      }

      // Apply relationship boost
      if (result.relationshipStrength) {
        finalScore = (finalScore * 0.9) + (result.relationshipStrength * 0.1);
      }

      return { ...result, score: finalScore };
    }).sort((a, b) => b.score - a.score);
  }

  private generateCacheKey(query: AdvancedQuery): string {
    return JSON.stringify({
      query: query.query,
      filters: query.filters,
      semantic: query.semanticSearch?.enabled,
      temporal: query.temporalPatterns?.enabled,
      relationships: query.relationships?.enabled,
    });
  }

  private getFromCache(key: string): SearchResult[] | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.results;
    }
    return null;
  }

  private setCache(key: string, results: SearchResult[], ttl = 5 * 60 * 1000): void {
    this.cache.set(key, {
      results,
      timestamp: Date.now(),
      ttl,
    });
  }

  private recordAnalytics(query: AdvancedQuery, results: SearchResult[], totalTime: number): void {
    // Implementation for analytics recording
    const analytics: SearchAnalytics = {
      queryPerformance: {
        totalTime,
        layerTimes: {} as Record<MemoryLayer, number>,
        cacheHits: 0,
        cacheMisses: 0,
      },
      resultQuality: {
        totalResults: results.length,
        layerDistribution: results.reduce((acc, r) => {
          acc[r.source] = (acc[r.source] || 0) + 1;
          return acc;
        }, {} as Record<MemoryLayer, number>),
        scoreDistribution: {
          high: results.filter(r => r.score > 0.8).length,
          medium: results.filter(r => r.score >= 0.4 && r.score <= 0.8).length,
          low: results.filter(r => r.score < 0.4).length,
        },
      },
      searchPatterns: {
        queryType: this.determineQueryType(query),
        complexity: this.determineQueryComplexity(query),
        layersQueried: Array.from(this.layers.keys()),
      },
    };

    this.analytics.push(analytics);

    // Keep only last 1000 analytics entries
    if (this.analytics.length > 1000) {
      this.analytics = this.analytics.slice(-1000);
    }
  }

  private determineQueryType(query: AdvancedQuery): SearchAnalytics['searchPatterns']['queryType'] {
    const features = [
      query.semanticSearch?.enabled,
      query.temporalPatterns?.enabled,
      query.relationships?.enabled,
    ].filter(Boolean).length;

    if (features === 0) return 'keyword';
    if (features === 1) {
      if (query.semanticSearch?.enabled) return 'semantic';
      if (query.temporalPatterns?.enabled) return 'temporal';
      return 'keyword';
    }
    return 'hybrid';
  }

  private determineQueryComplexity(query: AdvancedQuery): SearchAnalytics['searchPatterns']['complexity'] {
    const complexityFactors = [
      query.semanticSearch?.enabled,
      query.temporalPatterns?.enabled,
      query.relationships?.enabled,
      query.aggregation?.groupBy,
      query.filters && Object.keys(query.filters).length > 2,
    ].filter(Boolean).length;

    if (complexityFactors <= 1) return 'simple';
    if (complexityFactors <= 3) return 'moderate';
    return 'complex';
  }

  // Public analytics access
  getAnalytics(): SearchAnalytics[] {
    return [...this.analytics];
  }

  clearCache(): void {
    this.cache.clear();
  }
}