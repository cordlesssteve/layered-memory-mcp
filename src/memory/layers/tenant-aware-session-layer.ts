/**
 * Tenant-Aware Session Layer - Session memory with multi-tenant isolation
 * Phase 2.1.2: Multi-tenant Architecture
 */

import { SessionLayer } from './session-layer.js';
import { TenantAwareMemoryLayer } from '../tenant-aware-layer.js';
import type { MemoryLayerInterface, MemoryLayerConfig } from '../types.js';

export class TenantAwareSessionLayer extends TenantAwareMemoryLayer {
  private layerConfig: MemoryLayerConfig;

  constructor(config: MemoryLayerConfig) {
    // Create a default session layer for fallback
    const defaultLayer = new SessionLayer(config);
    super(defaultLayer);
    this.layerConfig = config;
  }

  /**
   * Create tenant-specific session layer
   */
  protected createTenantLayer(_tenantId: string): MemoryLayerInterface {
    // Create isolated session layer for tenant
    const tenantConfig = {
      ...this.layerConfig,
      // Tenant-specific configuration could be applied here
      // For example, different TTL or size limits per tenant tier
    };

    return new SessionLayer(tenantConfig);
  }

  /**
   * Get tenant-specific session stats
   */
  async getTenantSessionStats(tenantId: string) {
    if (this.tenantSeparation.has(tenantId)) {
      const tenantLayer = this.tenantSeparation.get(tenantId)!;
      return tenantLayer.getStats();
    }

    return {
      totalItems: 0,
      totalSize: 0,
      averageAccessCount: 0,
      categoryCounts: {},
      tagCounts: {},
    };
  }

  /**
   * Clear session for specific tenant (useful for logout)
   */
  async clearTenantSession(tenantId: string): Promise<number> {
    if (this.tenantSeparation.has(tenantId)) {
      const tenantLayer = this.tenantSeparation.get(tenantId)!;
      const stats = await tenantLayer.getStats();
      const itemCount = stats.totalItems;

      // Remove all items for this tenant's session
      await tenantLayer.cleanup();

      // Remove the tenant layer instance
      this.tenantSeparation.delete(tenantId);

      return itemCount;
    }

    return 0;
  }
}