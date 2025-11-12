/**
 * Tenant-Aware Temporal Layer - Temporal memory with multi-tenant isolation
 * Phase 2.1.2: Multi-tenant Architecture
 */

import path from 'path';
import { TemporalLayer } from './temporal-layer.js';
import { TenantAwareMemoryLayer } from '../tenant-aware-layer.js';
import type { MemoryLayerInterface, MemoryLayerConfig } from '../types.js';

export class TenantAwareTemporalLayer extends TenantAwareMemoryLayer {
  private layerConfig: MemoryLayerConfig;
  private baseDataDir: string;

  constructor(config: MemoryLayerConfig, baseDataDir = './data/temporal') {
    // Create a default temporal layer for fallback
    const defaultLayer = new TemporalLayer(config);
    super(defaultLayer);
    this.layerConfig = config;
    this.baseDataDir = baseDataDir;
  }

  /**
   * Create tenant-specific temporal layer with isolated data directory
   */
  protected createTenantLayer(tenantId: string): MemoryLayerInterface {
    // Create tenant-specific data directory
    const tenantDataDir = path.join(this.baseDataDir, 'tenants', tenantId);

    return new TemporalLayer(this.layerConfig, tenantDataDir);
  }

  /**
   * Get temporal statistics for tenant
   */
  async getTenantTemporalStats(tenantId: string) {
    if (this.tenantSeparation.has(tenantId)) {
      const tenantLayer = this.tenantSeparation.get(tenantId)! as TemporalLayer;

      // Get basic stats
      const stats = await tenantLayer.getStats();

      // Get temporal-specific stats if available
      let temporalStats = {};
      if ('getTemporalStats' in tenantLayer) {
        try {
          temporalStats = await (tenantLayer as any).getTemporalStats();
        } catch (error) {
          // Temporal stats not available
        }
      }

      return {
        ...stats,
        ...temporalStats,
        tenantId,
        layerType: 'temporal',
      };
    }

    return {
      tenantId,
      layerType: 'temporal',
      totalItems: 0,
      totalSize: 0,
      averageAccessCount: 0,
      categoryCounts: {},
      tagCounts: {},
      timeIndexSize: 0,
      chronoIndexSize: 0,
      oldestItem: undefined,
      newestItem: undefined,
    };
  }

  /**
   * Get temporal patterns for tenant
   */
  async getTenantTemporalPatterns(tenantId: string, timeRange?: { start: Date; end: Date }) {
    if (!this.tenantSeparation.has(tenantId)) {
      return {
        patterns: [],
        summary: {
          totalPatterns: 0,
          timeRange: timeRange || { start: new Date(), end: new Date() },
        },
      };
    }

    const tenantLayer = this.tenantSeparation.get(tenantId)! as TemporalLayer;

    // Get temporal patterns if the method exists
    if ('analyzeTemporalPatterns' in tenantLayer) {
      try {
        const patterns = await (tenantLayer as any).analyzeTemporalPatterns(timeRange);
        return {
          patterns,
          summary: {
            totalPatterns: patterns.length,
            timeRange: timeRange || { start: new Date(), end: new Date() },
          },
        };
      } catch (error) {
        // Temporal pattern analysis not available
      }
    }

    return {
      patterns: [],
      summary: {
        totalPatterns: 0,
        timeRange: timeRange || { start: new Date(), end: new Date() },
      },
    };
  }

  /**
   * Archive old temporal data for tenant (data retention)
   */
  async archiveTenantTemporalData(tenantId: string, olderThan: Date): Promise<{
    success: boolean;
    archivedItems: number;
    archiveLocation?: string;
  }> {
    if (!this.tenantSeparation.has(tenantId)) {
      return {
        success: false,
        archivedItems: 0,
      };
    }

    try {
      const tenantLayer = this.tenantSeparation.get(tenantId)! as TemporalLayer;

      // Search for old items
      const oldItems = await tenantLayer.search({
        query: '',
        filters: {
          dateRange: {
            end: olderThan,
          },
        },
        limit: 10000, // Large limit to get all old items
      });

      if (oldItems.length === 0) {
        return {
          success: true,
          archivedItems: 0,
        };
      }

      // Archive location
      const archiveLocation = path.join(
        this.baseDataDir,
        'archives',
        tenantId,
        `temporal-archive-${olderThan.getTime()}.json`
      );

      // In a real implementation, this would:
      // 1. Export the old items to archive storage
      // 2. Remove them from the temporal layer
      // 3. Update temporal indexes

      // For now, just return the count
      return {
        success: true,
        archivedItems: oldItems.length,
        archiveLocation,
      };
    } catch (error) {
      return {
        success: false,
        archivedItems: 0,
      };
    }
  }

  /**
   * Optimize temporal indexes for tenant
   */
  async optimizeTenantTemporalIndexes(tenantId: string): Promise<{
    success: boolean;
    optimizationResults?: any;
  }> {
    if (!this.tenantSeparation.has(tenantId)) {
      return { success: false };
    }

    try {
      const tenantLayer = this.tenantSeparation.get(tenantId)!;

      // Optimize the layer
      await tenantLayer.optimize();

      // Get optimization results if available
      let optimizationResults = {};
      if ('getTemporalOptimizationResults' in tenantLayer) {
        try {
          optimizationResults = await (tenantLayer as any).getTemporalOptimizationResults();
        } catch (error) {
          // Optimization results not available
        }
      }

      return {
        success: true,
        optimizationResults,
      };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Get tenant temporal usage report
   */
  async getTenantTemporalUsageReport(tenantId: string) {
    const stats = await this.getTenantTemporalStats(tenantId);
    const patterns = await this.getTenantTemporalPatterns(tenantId);

    return {
      tenantId,
      temporalLayer: {
        memoryCount: stats.totalItems,
        storageBytes: stats.totalSize,
        timeIndexSize: stats.timeIndexSize || 0,
        chronoIndexSize: stats.chronoIndexSize || 0,
        oldestMemory: stats.oldestItem,
        newestMemory: stats.newestItem,
        temporalPatterns: patterns.summary.totalPatterns,
      },
      retentionAnalysis: {
        // This would analyze data age and suggest archival
        suggestedArchivalCount: 0,
        oldestDataAge: stats.oldestItem
          ? Math.floor((Date.now() - stats.oldestItem.getTime()) / (1000 * 60 * 60 * 24))
          : 0,
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}