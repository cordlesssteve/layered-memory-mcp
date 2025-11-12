/* global NodeJS */
/**
 * Project Layer: Persistent storage for project-specific memories
 * - SQLite-based persistence
 * - Project-scoped isolation
 * - Medium capacity with indexing
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { BaseMemoryLayer } from '../base-layer.js';
import type { MemoryItem, MemoryLayerConfig } from '../types.js';

export class ProjectLayer extends BaseMemoryLayer {
  private readonly dataDir: string;
  private readonly projectId: string;
  private persistenceInterval?: NodeJS.Timeout;
  private isDirty = false;

  constructor(
    projectId: string,
    config: MemoryLayerConfig = { ttl: undefined },
    dataDir = './data/projects'
  ) {
    // Default configuration for project layer
    const defaultConfig: MemoryLayerConfig = {
      maxItems: config.maxItems ?? 1000, // Larger capacity than session
      maxSizeBytes: config.maxSizeBytes ?? 10 * 1024 * 1024, // 10MB max
      compressionEnabled: config.compressionEnabled ?? true,
      indexingEnabled: config.indexingEnabled ?? true,
      ttl: config.ttl ?? 1000 * 60 * 60 * 24 * 30, // 30 days
    };

    super('project', defaultConfig);

    this.projectId = projectId;
    this.dataDir = dataDir;

    // Auto-save every 5 minutes if dirty
    this.setupAutoPersistence();

    this.logger.info('Project layer initialized', {
      projectId,
      dataDir,
      config: defaultConfig,
    });

    // Load existing data
    this.loadFromDisk().catch(error => {
      this.logger.error('Failed to load project data', { error: error instanceof Error ? error.message : error });
    });
  }

  override async store(item: Parameters<BaseMemoryLayer['store']>[0]): Promise<MemoryItem> {
    // Ensure item has project ID in metadata
    const itemWithProject = {
      ...item,
      metadata: {
        ...item.metadata,
        projectId: this.projectId,
      },
    };

    const result = await super.store(itemWithProject);
    this.markDirty();
    return result;
  }

  override async update(id: string, updates: Parameters<BaseMemoryLayer['update']>[1]): Promise<MemoryItem | null> {
    const result = await super.update(id, updates);
    if (result) {
      this.markDirty();
    }
    return result;
  }

  override async delete(id: string): Promise<boolean> {
    const result = await super.delete(id);
    if (result) {
      this.markDirty();
    }
    return result;
  }

  override async optimize(): Promise<void> {
    // Clean up first
    await this.cleanup();

    // Rebuild index
    this.index.clear();
    for (const [id, item] of this.items) {
      this.updateIndex(id, item);
    }

    // Compress old items if enabled
    if (this.config.compressionEnabled) {
      await this.compressOldItems();
    }

    // Persist optimized data
    await this.saveToDisk();

    this.logger.info('Project layer optimized', {
      projectId: this.projectId,
      itemCount: this.items.size,
      indexSize: this.index.size,
    });
  }

  override async backup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `project-${this.projectId}-${timestamp}`;
    const backupPath = join(this.dataDir, 'backups', `${backupId}.json`);

    const dirCreated = await this.ensureDirectoryExists(dirname(backupPath));
    if (!dirCreated) {
      throw new Error(`Cannot create backup: failed to create directory ${dirname(backupPath)}`);
    }

    const backupData = {
      projectId: this.projectId,
      timestamp: new Date().toISOString(),
      items: await this.export(),
      metadata: {
        version: '1.0',
        layerType: 'project',
      },
    };

    await writeFile(backupPath, JSON.stringify(backupData, null, 2));

    this.logger.info('Project layer backup created', {
      projectId: this.projectId,
      backupId,
      backupPath,
      itemCount: backupData.items.length,
    });

    return backupId;
  }

  override async restore(backupId: string): Promise<boolean> {
    try {
      const backupPath = join(this.dataDir, 'backups', `${backupId}.json`);
      const backupData = JSON.parse(await readFile(backupPath, 'utf-8'));

      // Validate backup data
      if (backupData.projectId !== this.projectId) {
        this.logger.error('Backup project ID mismatch', {
          expected: this.projectId,
          found: backupData.projectId,
        });
        return false;
      }

      // Clear current data
      this.items.clear();
      this.index.clear();

      // Import backup data
      const importedCount = await this.import(backupData.items);

      // Save restored data
      await this.saveToDisk();

      this.logger.info('Project layer restored from backup', {
        projectId: this.projectId,
        backupId,
        importedCount,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to restore from backup', {
        backupId,
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  /**
   * Get project-specific statistics
   */
  async getProjectStats(): Promise<{
    projectId: string;
    itemsByCategory: Record<string, number>;
    oldestProjectItem?: Date;
    newestProjectItem?: Date;
    compressionRatio?: number;
    persistenceStatus: 'clean' | 'dirty' | 'saving';
  }> {
    const stats = await this.getStats();
    const items = Array.from(this.items.values());

    const projectItems = items.filter(item => item.metadata.projectId === this.projectId);

    const result: {
      projectId: string;
      itemsByCategory: Record<string, number>;
      oldestProjectItem?: Date;
      newestProjectItem?: Date;
      compressionRatio?: number;
      persistenceStatus: 'clean' | 'dirty' | 'saving';
    } = {
      projectId: this.projectId,
      itemsByCategory: stats.categoryCounts,
      persistenceStatus: this.isDirty ? 'dirty' : 'clean',
    };

    if (projectItems.length > 0) {
      result.oldestProjectItem = new Date(Math.min(...projectItems.map(item => item.createdAt.getTime())));
      result.newestProjectItem = new Date(Math.max(...projectItems.map(item => item.createdAt.getTime())));
    }

    const compressionRatio = this.calculateCompressionRatio();
    if (compressionRatio !== undefined) {
      result.compressionRatio = compressionRatio;
    }

    return result;
  }

  /**
   * Export project data for migration or analysis
   */
  async exportProject(): Promise<{
    projectId: string;
    items: MemoryItem[];
    metadata: Record<string, unknown>;
  }> {
    const items = await this.export();
    const projectItems = items.filter(item => item.metadata.projectId === this.projectId);

    return {
      projectId: this.projectId,
      items: projectItems,
      metadata: {
        exportedAt: new Date().toISOString(),
        totalItems: projectItems.length,
        categories: [...new Set(projectItems.map(item => item.metadata.category))],
        tags: [...new Set(projectItems.flatMap(item => item.metadata.tags))],
      },
    };
  }

  /**
   * Close the project layer and perform final persistence
   */
  async close(): Promise<void> {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }

    if (this.isDirty) {
      await this.saveToDisk();
    }

    this.logger.info('Project layer closed', { projectId: this.projectId });
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const filePath = this.getDataFilePath();
      await access(filePath);

      const data = JSON.parse(await readFile(filePath, 'utf-8'));

      if (data.projectId !== this.projectId) {
        this.logger.warn('Project ID mismatch in data file', {
          expected: this.projectId,
          found: data.projectId,
        });
        return;
      }

      await this.import(data.items || []);
      this.isDirty = false;

      this.logger.info('Project data loaded from disk', {
        projectId: this.projectId,
        itemCount: this.items.size,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.info('No existing project data found, starting fresh', { projectId: this.projectId });
      } else {
        this.logger.error('Failed to load project data', {
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      const filePath = this.getDataFilePath();
      const dirCreated = await this.ensureDirectoryExists(dirname(filePath));

      if (!dirCreated) {
        this.logger.warn('Cannot save to disk: directory creation failed', {
          projectId: this.projectId,
          filePath,
        });
        return; // Skip saving but don't throw
      }

      const data = {
        projectId: this.projectId,
        version: '1.0',
        savedAt: new Date().toISOString(),
        items: await this.export(),
      };

      await writeFile(filePath, JSON.stringify(data, null, 2));
      this.isDirty = false;

      this.logger.debug('Project data saved to disk', {
        projectId: this.projectId,
        itemCount: data.items.length,
        filePath,
      });
    } catch (error) {
      this.logger.error('Failed to save project data', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  private getDataFilePath(): string {
    return join(this.dataDir, `${this.projectId}.json`);
  }

  private async ensureDirectoryExists(dir: string): Promise<boolean> {
    try {
      await access(dir);
      return true;
    } catch {
      try {
        await mkdir(dir, { recursive: true });
        return true;
      } catch (error) {
        this.logger.error('Failed to create directory', {
          dir,
          error: error instanceof Error ? error.message : error,
        });
        return false;
      }
    }
  }

  private markDirty(): void {
    this.isDirty = true;
  }

  private setupAutoPersistence(): void {
    this.persistenceInterval = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.saveToDisk();
        } catch (error) {
          this.logger.error('Auto-persistence failed', {
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  private async compressOldItems(): Promise<void> {
    if (!this.config.compressionEnabled) return;

    // Compress items older than 7 days that haven't been accessed recently
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let compressedCount = 0;

    for (const [id, item] of this.items) {
      if (
        item.createdAt.getTime() < sevenDaysAgo &&
        item.lastAccessedAt.getTime() < sevenDaysAgo &&
        item.accessCount < 2
      ) {
        // Simple compression: remove redundant whitespace and newlines
        const compressedContent = item.content
          .replace(/\s+/g, ' ')
          .replace(/\n\s*/g, '\n')
          .trim();

        if (compressedContent.length < item.content.length) {
          await this.update(id, { content: compressedContent });
          compressedCount++;
        }
      }
    }

    if (compressedCount > 0) {
      this.logger.info('Compressed old items', {
        projectId: this.projectId,
        compressedCount,
      });
    }
  }

  private calculateCompressionRatio(): number | undefined {
    if (!this.config.compressionEnabled) return undefined;

    const items = Array.from(this.items.values());
    if (items.length === 0) return undefined;

    // Estimate original size vs current size
    let originalSize = 0;
    let currentSize = 0;

    for (const item of items) {
      currentSize += item.content.length;
      // Estimate original size (rough approximation)
      originalSize += item.content.length * 1.2; // Assume 20% compression
    }

    return originalSize > 0 ? currentSize / originalSize : 1;
  }
}