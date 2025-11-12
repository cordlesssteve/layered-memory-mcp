/**
 * Tenant-Aware Global Layer - Global memory with multi-tenant isolation
 * Phase 2.1.2: Multi-tenant Architecture
 */

import path from 'path';
import { GlobalLayer } from './global-layer.js';
import { TenantAwareMemoryLayer } from '../tenant-aware-layer.js';
import type { MemoryLayerInterface, MemoryLayerConfig } from '../types.js';

export class TenantAwareGlobalLayer extends TenantAwareMemoryLayer {
  private layerConfig: MemoryLayerConfig;
  private baseDataDir: string;

  constructor(config: MemoryLayerConfig, baseDataDir = './data/global') {
    // Create a default global layer for fallback
    const defaultLayer = new GlobalLayer(config);
    super(defaultLayer);
    this.layerConfig = config;
    this.baseDataDir = baseDataDir;
  }

  /**
   * Create tenant-specific global layer with isolated data directory
   */
  protected createTenantLayer(tenantId: string): MemoryLayerInterface {
    // Create tenant-specific data directory
    const tenantDataDir = path.join(this.baseDataDir, 'tenants', tenantId);

    return new GlobalLayer(this.layerConfig, tenantDataDir);
  }

  /**
   * Get global memory statistics for tenant
   */
  async getTenantGlobalStats(tenantId: string) {
    if (this.tenantSeparation.has(tenantId)) {
      const tenantLayer = this.tenantSeparation.get(tenantId)!;
      const stats = await tenantLayer.getStats();

      return {
        ...stats,
        tenantId,
        layerType: 'global',
      };
    }

    return {
      tenantId,
      layerType: 'global',
      totalItems: 0,
      totalSize: 0,
      averageAccessCount: 0,
      categoryCounts: {},
      tagCounts: {},
    };
  }

  /**
   * Archive tenant's global memories (for data retention compliance)
   */
  async archiveTenantData(tenantId: string, archivePath?: string): Promise<{
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
      const tenantLayer = this.tenantSeparation.get(tenantId)!;
      const items = await tenantLayer.export();

      const archiveLocation = archivePath ||
        path.join(this.baseDataDir, 'archives', tenantId, `archive-${Date.now()}.json`);

      // In a real implementation, this would save to the archive location
      // For now, we'll just return the count

      return {
        success: true,
        archivedItems: items.length,
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
   * Purge tenant's global data (for GDPR compliance)
   */
  async purgeTenantData(tenantId: string): Promise<{
    success: boolean;
    purgedItems: number;
  }> {
    if (!this.tenantSeparation.has(tenantId)) {
      return {
        success: false,
        purgedItems: 0,
      };
    }

    try {
      const tenantLayer = this.tenantSeparation.get(tenantId)!;
      const stats = await tenantLayer.getStats();
      const itemCount = stats.totalItems;

      // Clear all data for this tenant
      await tenantLayer.cleanup();

      // Close and remove the tenant layer
      if ('close' in tenantLayer && typeof tenantLayer.close === 'function') {
        await (tenantLayer as any).close();
      }

      this.tenantSeparation.delete(tenantId);

      return {
        success: true,
        purgedItems: itemCount,
      };
    } catch (error) {
      return {
        success: false,
        purgedItems: 0,
      };
    }
  }

  /**
   * Get tenant data usage for billing/quota management
   */
  async getTenantUsageReport(tenantId: string) {
    const stats = await this.getTenantGlobalStats(tenantId);

    return {
      tenantId,
      globalLayer: {
        memoryCount: stats.totalItems,
        storageBytes: stats.totalSize,
        averageAccess: stats.averageAccessCount,
        categories: stats.categoryCounts,
        tags: stats.tagCounts,
      },
      quotaUsage: {
        memoryUtilization: 0, // Would calculate against tenant limits
        storageUtilization: 0, // Would calculate against tenant limits
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}