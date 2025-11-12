/**
 * Memory version tracking and evolution system
 */

import { createLogger } from '../../utils/logger.js';
import type { MemoryVersion } from './types.js';

const logger = createLogger('version-tracker');

export class VersionTracker {
  private versions = new Map<string, MemoryVersion[]>();

  trackVersion(
    memoryId: string,
    changeType: MemoryVersion['changeType'],
    changes: MemoryVersion['changes'],
    createdBy: string,
    parentVersionId?: string
  ): MemoryVersion {
    const existingVersions = this.versions.get(memoryId) || [];
    const version: MemoryVersion = {
      id: `${memoryId}-v${existingVersions.length + 1}`,
      memoryId,
      version: existingVersions.length + 1,
      ...(parentVersionId && { parentVersionId }),
      changeType,
      changes,
      createdAt: new Date(),
      createdBy,
    };

    existingVersions.push(version);
    this.versions.set(memoryId, existingVersions);

    logger.info(`Tracked version ${version.version} for memory ${memoryId}`, { changeType });
    return version;
  }

  getVersions(memoryId: string): MemoryVersion[] {
    return this.versions.get(memoryId) || [];
  }

  getLatestVersion(memoryId: string): MemoryVersion | null {
    const versions = this.getVersions(memoryId);
    return versions.length > 0 ? versions[versions.length - 1]! : null;
  }

  getVersionById(versionId: string): MemoryVersion | null {
    for (const versions of this.versions.values()) {
      const version = versions.find(v => v.id === versionId);
      if (version) return version;
    }
    return null;
  }

  getVersionEvolutionPath(memoryId: string): MemoryVersion[] {
    const versions = this.getVersions(memoryId);
    return versions.sort((a, b) => a.version - b.version);
  }

  get allVersions(): Map<string, MemoryVersion[]> {
    return new Map(this.versions);
  }
}