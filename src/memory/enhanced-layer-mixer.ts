/**
 * Enhanced Layer Mixing Strategies for Hierarchical Memory
 * Provides sophisticated algorithms for intelligent layer selection, result fusion, and context-aware routing
 */

import { createLogger } from '../utils/logger.js';
import type { MemorySearchResult, MemoryQuery, MemoryLayer, MemoryAnalysis } from './types.js';

const logger = createLogger('enhanced-layer-mixer');

export interface LayerMixingStrategy {
  name: string;
  description: string;
  selector: LayerSelectionStrategy;
  merger: ResultMergingStrategy;
  scorer: CrossLayerScoringStrategy;
}

export interface LayerSelectionStrategy {
  selectLayers(
    _query: MemoryQuery,
    _analysis: MemoryAnalysis,
    _context: SearchContext
  ): MemoryLayer[];
}

export interface ResultMergingStrategy {
  mergeResults(
    _layerResults: Map<MemoryLayer, MemorySearchResult[]>,
    _query: MemoryQuery
  ): MemorySearchResult[];
}

export interface CrossLayerScoringStrategy {
  scoreResult(
    _result: MemorySearchResult,
    _query: MemoryQuery,
    _layerContext: LayerContext
  ): number;
}

export interface SearchContext {
  sessionHistory: string[];
  activeProject?: string;
  userPreferences?: UserSearchPreferences;
  timeContext: {
    currentSession: Date;
    sessionDuration: number;
    recentQueries: string[];
  };
}

export interface LayerContext {
  sourceLayer: MemoryLayer;
  layerHealth: number; // 0-1, layer performance/availability
  layerSize: number;
  averageRelevance: number;
}

export interface UserSearchPreferences {
  preferRecent: boolean;
  preferGlobal: boolean;
  layerBias: Record<MemoryLayer, number>;
  complexityPreference: 'simple' | 'balanced' | 'comprehensive';
}

/**
 * Enhanced layer mixing engine with multiple strategies
 */
export class EnhancedLayerMixer {
  private strategies = new Map<string, LayerMixingStrategy>();
  private currentStrategy = 'adaptive';

  constructor() {
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    // 1. Adaptive Strategy - Learns from usage patterns
    this.strategies.set('adaptive', {
      name: 'Adaptive Mixing',
      description: 'Learns from user behavior and adapts layer selection dynamically',
      selector: new AdaptiveLayerSelector(),
      merger: new IntelligentResultMerger(),
      scorer: new ContextAwareScorer(),
    });

    // 2. Contextual Strategy - Heavy emphasis on current context
    this.strategies.set('contextual', {
      name: 'Contextual Priority',
      description: 'Prioritizes session and project context heavily',
      selector: new ContextualLayerSelector(),
      merger: new ContextWeightedMerger(),
      scorer: new RecencyBiasedScorer(),
    });

    // 3. Comprehensive Strategy - Always searches all layers
    this.strategies.set('comprehensive', {
      name: 'Comprehensive Search',
      description: 'Searches all layers for maximum coverage',
      selector: new ComprehensiveLayerSelector(),
      merger: new BalancedResultMerger(),
      scorer: new DiversityOptimizedScorer(),
    });

    // 4. Performance Strategy - Optimizes for speed
    this.strategies.set('performance', {
      name: 'Performance Optimized',
      description: 'Minimizes layers searched for fast response times',
      selector: new PerformanceLayerSelector(),
      merger: new FastResultMerger(),
      scorer: new QuickScorer(),
    });

    // 5. Discovery Strategy - Optimizes for finding unexpected connections
    this.strategies.set('discovery', {
      name: 'Discovery Mode',
      description: 'Emphasizes serendipitous discovery across all layers',
      selector: new DiscoveryLayerSelector(),
      merger: new DiversityMerger(),
      scorer: new NoveltyScorer(),
    });
  }

  /**
   * Select the best mixing strategy based on query and context
   */
  selectStrategy(query: MemoryQuery, _context: SearchContext): string {
    // Automatic strategy selection based on context
    const queryLength = query.query.length;
    const hasTimeConstraints = !!query.filters?.dateRange;
    const isExploratoryQuery = this.isExploratoryQuery(query.query);

    // Quick queries - performance strategy
    if (queryLength < 10 && !hasTimeConstraints) {
      return 'performance';
    }

    // Exploratory queries - discovery strategy
    if (isExploratoryQuery) {
      return 'discovery';
    }

    // Time-constrained queries - contextual strategy
    if (hasTimeConstraints) {
      return 'contextual';
    }

    // Complex analytical queries - comprehensive strategy
    if (queryLength > 100 || query.query.includes('analyze') || query.query.includes('compare')) {
      return 'comprehensive';
    }

    // Default to adaptive
    return 'adaptive';
  }

  /**
   * Execute enhanced layer mixing with selected strategy
   */
  async mixLayers(
    query: MemoryQuery,
    analysis: MemoryAnalysis,
    context: SearchContext,
    layerSearchFunction: (
      _layers: MemoryLayer[],
      _query: MemoryQuery
    ) => Promise<Map<MemoryLayer, MemorySearchResult[]>>
  ): Promise<MemorySearchResult[]> {
    const startTime = Date.now();

    // Select strategy
    const strategyName = this.currentStrategy || this.selectStrategy(query, context);
    const strategy = this.strategies.get(strategyName);

    if (!strategy) {
      throw new Error(`Unknown mixing strategy: ${strategyName}`);
    }

    logger.debug('Executing layer mixing strategy', {
      strategy: strategyName,
      query: query.query,
      complexity: analysis.queryComplexity,
    });

    // 1. Select layers to search
    const layersToSearch = strategy.selector.selectLayers(query, analysis, context);

    // 2. Execute search across selected layers
    const layerResults = await layerSearchFunction(layersToSearch, query);

    // 3. Merge results using strategy-specific merger
    const mergedResults = strategy.merger.mergeResults(layerResults, query);

    // 4. Apply strategy-specific scoring
    const layerContexts = this.buildLayerContexts(layerResults);
    const scoredResults = mergedResults.map(result => ({
      ...result,
      score: strategy.scorer.scoreResult(
        result,
        query,
        layerContexts.get(result.source as MemoryLayer)!
      ),
    }));

    // 5. Final ranking
    const finalResults = scoredResults.sort((a, b) => b.score - a.score);

    logger.info('Layer mixing completed', {
      strategy: strategyName,
      layersSearched: layersToSearch,
      resultCount: finalResults.length,
      mixingTime: Date.now() - startTime,
    });

    return finalResults;
  }

  /**
   * Set the current mixing strategy
   */
  setStrategy(strategyName: string): void {
    if (!this.strategies.has(strategyName)) {
      throw new Error(`Unknown strategy: ${strategyName}`);
    }
    this.currentStrategy = strategyName;
  }

  /**
   * Get available strategies
   */
  getAvailableStrategies(): Array<{ name: string; description: string }> {
    return Array.from(this.strategies.values()).map(s => ({
      name: s.name,
      description: s.description,
    }));
  }

  private isExploratoryQuery(query: string): boolean {
    const exploratoryKeywords = [
      'explore',
      'discover',
      'find',
      'show me',
      'what about',
      'related to',
      'similar',
      'connections',
      'patterns',
    ];
    return exploratoryKeywords.some(keyword => query.toLowerCase().includes(keyword));
  }

  private buildLayerContexts(
    layerResults: Map<MemoryLayer, MemorySearchResult[]>
  ): Map<MemoryLayer, LayerContext> {
    const contexts = new Map<MemoryLayer, LayerContext>();

    for (const [layer, results] of layerResults.entries()) {
      const avgRelevance =
        results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0;

      contexts.set(layer, {
        sourceLayer: layer,
        layerHealth: 1.0, // Could be calculated based on response times, error rates, etc.
        layerSize: results.length,
        averageRelevance: avgRelevance,
      });
    }

    return contexts;
  }
}

// Implementation of different layer selection strategies

class AdaptiveLayerSelector implements LayerSelectionStrategy {
  selectLayers(
    query: MemoryQuery,
    analysis: MemoryAnalysis,
    context: SearchContext
  ): MemoryLayer[] {
    const layers: MemoryLayer[] = ['session']; // Always include current context

    // Adapt based on session history
    const recentQueries = context.timeContext.recentQueries.slice(-5);
    const hasGlobalQueries = recentQueries.some(q => q.includes('global') || q.includes('general'));
    const hasHistoricalQueries = recentQueries.some(
      q => q.includes('history') || q.includes('past')
    );

    // Add layers based on learned patterns
    if (analysis.queryComplexity === 'complex' || hasGlobalQueries) {
      layers.push('global');
    }

    if (context.activeProject) {
      layers.push('project');
    }

    if (hasHistoricalQueries || query.filters?.dateRange) {
      layers.push('temporal');
    }

    return layers;
  }
}

class ContextualLayerSelector implements LayerSelectionStrategy {
  selectLayers(
    _query: MemoryQuery,
    analysis: MemoryAnalysis,
    context: SearchContext
  ): MemoryLayer[] {
    const layers: MemoryLayer[] = ['session'];

    // Heavy bias toward current context
    if (context.activeProject) {
      layers.push('project');
    }

    // Only add global for high-importance queries
    if (analysis.queryComplexity === 'complex') {
      layers.push('global');
    }

    return layers;
  }
}

class ComprehensiveLayerSelector implements LayerSelectionStrategy {
  selectLayers(
    _query: MemoryQuery,
    _analysis: MemoryAnalysis,
    _context: SearchContext
  ): MemoryLayer[] {
    return ['session', 'project', 'global', 'temporal'];
  }
}

class PerformanceLayerSelector implements LayerSelectionStrategy {
  selectLayers(
    _query: MemoryQuery,
    analysis: MemoryAnalysis,
    context: SearchContext
  ): MemoryLayer[] {
    // Minimize layers for speed
    const layers: MemoryLayer[] = ['session'];

    if (analysis.queryComplexity !== 'simple' && context.activeProject) {
      layers.push('project');
    }

    return layers;
  }
}

class DiscoveryLayerSelector implements LayerSelectionStrategy {
  selectLayers(
    _query: MemoryQuery,
    analysis: MemoryAnalysis,
    _context: SearchContext
  ): MemoryLayer[] {
    // Always search all layers for maximum discovery potential
    const layers: MemoryLayer[] = ['session', 'project', 'global'];

    // Add temporal for richer discovery
    if (analysis.queryComplexity !== 'simple') {
      layers.push('temporal');
    }

    return layers;
  }
}

// Implementation of result merging strategies

class IntelligentResultMerger implements ResultMergingStrategy {
  mergeResults(
    layerResults: Map<MemoryLayer, MemorySearchResult[]>,
    _query: MemoryQuery
  ): MemorySearchResult[] {
    const allResults: MemorySearchResult[] = [];

    // Interleave results from different layers to ensure diversity
    const maxResults = Math.max(...Array.from(layerResults.values()).map(r => r.length));

    for (let i = 0; i < maxResults; i++) {
      for (const [layer, results] of layerResults.entries()) {
        if (i < results.length) {
          const result = results[i];
          if (result?.memory) {
            allResults.push({
              ...result,
              source: layer,
              memory: result.memory,
              score: result.score ?? 0,
              explanation: result.explanation ?? 'From layer mixing',
            });
          }
        }
      }
    }

    return allResults;
  }
}

class ContextWeightedMerger implements ResultMergingStrategy {
  mergeResults(
    layerResults: Map<MemoryLayer, MemorySearchResult[]>,
    _query: MemoryQuery
  ): MemorySearchResult[] {
    const allResults: MemorySearchResult[] = [];

    // Prioritize session and project layers
    const priorityOrder: MemoryLayer[] = ['session', 'project', 'global', 'temporal'];

    for (const layer of priorityOrder) {
      const results = layerResults.get(layer) || [];
      allResults.push(...results.map(r => ({ ...r, source: layer })));
    }

    return allResults;
  }
}

class BalancedResultMerger implements ResultMergingStrategy {
  mergeResults(
    layerResults: Map<MemoryLayer, MemorySearchResult[]>,
    _query: MemoryQuery
  ): MemorySearchResult[] {
    const allResults: MemorySearchResult[] = [];

    // Simply concatenate all results
    for (const [layer, results] of layerResults.entries()) {
      allResults.push(...results.map(r => ({ ...r, source: layer })));
    }

    return allResults;
  }
}

class FastResultMerger implements ResultMergingStrategy {
  mergeResults(
    layerResults: Map<MemoryLayer, MemorySearchResult[]>,
    _query: MemoryQuery
  ): MemorySearchResult[] {
    // Take top results from each layer quickly
    const allResults: MemorySearchResult[] = [];

    for (const [layer, results] of layerResults.entries()) {
      // Only take top 5 from each layer for speed
      allResults.push(...results.slice(0, 5).map(r => ({ ...r, source: layer })));
    }

    return allResults;
  }
}

class DiversityMerger implements ResultMergingStrategy {
  mergeResults(
    layerResults: Map<MemoryLayer, MemorySearchResult[]>,
    _query: MemoryQuery
  ): MemorySearchResult[] {
    // Ensure diverse representation from all layers
    const allResults: MemorySearchResult[] = [];
    const layerCount = layerResults.size;

    // Round-robin to ensure diversity
    const maxFromEach = Math.ceil(20 / layerCount); // Aim for 20 total results

    for (const [layer, results] of layerResults.entries()) {
      allResults.push(...results.slice(0, maxFromEach).map(r => ({ ...r, source: layer })));
    }

    return allResults;
  }
}

// Implementation of scoring strategies

class ContextAwareScorer implements CrossLayerScoringStrategy {
  scoreResult(result: MemorySearchResult, _query: MemoryQuery, layerContext: LayerContext): number {
    let { score } = result;

    // Boost based on layer context
    score += layerContext.averageRelevance * 0.1;
    score += layerContext.layerHealth * 0.05;

    // Boost session and project layers
    if (layerContext.sourceLayer === 'session') score += 0.15;
    if (layerContext.sourceLayer === 'project') score += 0.1;

    return Math.min(score, 1.0);
  }
}

class RecencyBiasedScorer implements CrossLayerScoringStrategy {
  scoreResult(
    result: MemorySearchResult,
    _query: MemoryQuery,
    _layerContext: LayerContext
  ): number {
    let { score } = result;

    // Heavy recency bias
    const age = Date.now() - result.memory.createdAt.getTime();
    const daysSinceCreated = age / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 0.3 - daysSinceCreated * 0.01);

    score += recencyBoost;

    return Math.min(score, 1.0);
  }
}

class DiversityOptimizedScorer implements CrossLayerScoringStrategy {
  scoreResult(result: MemorySearchResult, _query: MemoryQuery, layerContext: LayerContext): number {
    let { score } = result;

    // Reward less common layers for diversity
    if (layerContext.sourceLayer === 'temporal') score += 0.05;
    if (layerContext.sourceLayer === 'global') score += 0.03;

    return Math.min(score, 1.0);
  }
}

class QuickScorer implements CrossLayerScoringStrategy {
  scoreResult(
    result: MemorySearchResult,
    _query: MemoryQuery,
    _layerContext: LayerContext
  ): number {
    // Use original score for speed
    return result.score;
  }
}

class NoveltyScorer implements CrossLayerScoringStrategy {
  scoreResult(result: MemorySearchResult, _query: MemoryQuery, layerContext: LayerContext): number {
    let { score } = result;

    // Boost novel or unexpected results
    if (layerContext.sourceLayer === 'temporal') score += 0.1; // Historical connections
    if (layerContext.sourceLayer === 'global') score += 0.05; // Cross-domain knowledge

    // Boost low-frequency content types for discovery
    const { tags } = result.memory.metadata;
    if (tags.length > 3) score += 0.05; // Rich tagging suggests interesting content

    return Math.min(score, 1.0);
  }
}
