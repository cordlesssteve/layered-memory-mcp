/**
 * Tenant-Aware Project Layer - Project memory with multi-tenant isolation
 * Phase 2.1.2: Multi-tenant Architecture
 */

import path from 'path';
import { ProjectLayer } from './project-layer.js';
import { TenantAwareMemoryLayer } from '../tenant-aware-layer.js';
import type { MemoryLayerInterface, MemoryLayerConfig } from '../types.js';

export class TenantAwareProjectLayer extends TenantAwareMemoryLayer {
  private layerConfig: MemoryLayerConfig;
  private baseDataDir: string;

  constructor(projectId: string, config: MemoryLayerConfig, baseDataDir = './data/projects') {
    // Create a default project layer for fallback
    const defaultLayer = new ProjectLayer(projectId, config);
    super(defaultLayer);
    this.layerConfig = config;
    this.baseDataDir = baseDataDir;
  }

  /**
   * Create tenant-specific project layer with isolated data directory
   */
  protected createTenantLayer(tenantId: string): MemoryLayerInterface {
    // Create tenant-specific data directory
    const tenantDataDir = path.join(this.baseDataDir, 'tenants', tenantId);

    // Use a tenant-specific project ID to avoid conflicts
    const projectId = `tenant-${tenantId}-project`;

    return new ProjectLayer(projectId, this.layerConfig, tenantDataDir);
  }

  /**
   * Get all projects for a tenant
   */
  async getTenantProjects(_tenantId: string): Promise<string[]> {
    // This would typically read from the tenant's data directory
    // For now, return empty array as we only have one project layer
    return [];
  }

  /**
   * Create new project for tenant
   */
  async createTenantProject(tenantId: string, projectId: string): Promise<MemoryLayerInterface> {
    const tenantDataDir = path.join(this.baseDataDir, 'tenants', tenantId);
    const projectLayer = new ProjectLayer(projectId, this.layerConfig, tenantDataDir);

    // Store the project layer for this tenant
    this.tenantSeparation.set(`${tenantId}:${projectId}`, projectLayer);

    return projectLayer;
  }

  /**
   * Get specific project for tenant
   */
  async getTenantProject(tenantId: string, projectId: string): Promise<MemoryLayerInterface | null> {
    const key = `${tenantId}:${projectId}`;
    return this.tenantSeparation.get(key) || null;
  }

  /**
   * Delete project for tenant
   */
  async deleteTenantProject(tenantId: string, projectId: string): Promise<boolean> {
    const key = `${tenantId}:${projectId}`;
    const projectLayer = this.tenantSeparation.get(key);

    if (projectLayer) {
      // Close the project layer if it has a close method
      if ('close' in projectLayer && typeof projectLayer.close === 'function') {
        await (projectLayer as any).close();
      }

      this.tenantSeparation.delete(key);
      return true;
    }

    return false;
  }

  /**
   * Get tenant project statistics
   */
  async getTenantProjectStats(tenantId: string) {
    const tenantProjects = Array.from(this.tenantSeparation.entries())
      .filter(([key]) => key.startsWith(`${tenantId}:`));

    const stats = {
      projectCount: tenantProjects.length,
      totalItems: 0,
      totalSize: 0,
      projects: {} as Record<string, any>,
    };

    for (const [key, layer] of tenantProjects) {
      const keyParts = key.split(':');
      const projectId = keyParts[1] || 'unknown';
      try {
        const projectStats = await layer.getStats();
        stats.totalItems += projectStats.totalItems;
        stats.totalSize += projectStats.totalSize;
        stats.projects[projectId] = projectStats;
      } catch (error) {
        stats.projects[projectId] = { error: 'Failed to get stats' };
      }
    }

    return stats;
  }
}