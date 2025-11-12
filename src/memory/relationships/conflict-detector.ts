/**
 * Conflict detection and resolution system
 */

import { createLogger } from '../../utils/logger.js';
import type { MemoryItem } from '../types.js';
import type { ConflictResolution } from './types.js';
import { TextAnalyzer } from './text-analyzer.js';
import { RelationshipDetectors } from './detectors.js';

const logger = createLogger('conflict-detector');

export class ConflictDetector {
  private textAnalyzer = new TextAnalyzer();
  private detectors = new RelationshipDetectors();

  async detectConflicts(memories: MemoryItem[]): Promise<ConflictResolution[]> {
    logger.info('Detecting conflicts between memories');
    const conflicts: ConflictResolution[] = [];

    // Check for contradictions
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const memory1 = memories[i];
        const memory2 = memories[j];

        if (memory1 && memory2) {
          const conflict = await this.detectContentConflict(memory1, memory2);
          if (conflict) {
            conflicts.push(conflict);
          }
        }
      }
    }

    logger.info(`Detected ${conflicts.length} potential conflicts`);
    return conflicts;
  }

  private async detectContentConflict(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<ConflictResolution | null> {
    // Simple conflict detection based on contradictory content
    const similarity = this.textAnalyzer.calculateContentSimilarity(memory1.content, memory2.content);
    const hasContradiction = await this.detectors.detectContradictionRelationship(memory1, memory2);

    if (similarity > 0.5 && hasContradiction) {
      return this.createConflictResolution(memory1, memory2, 'contradiction', 0.8);
    }

    // Check for duplicate content
    if (similarity > 0.9) {
      return this.createConflictResolution(memory1, memory2, 'duplication', 0.9);
    }

    // Check for inconsistent metadata
    if (this.hasInconsistentMetadata(memory1, memory2)) {
      return this.createConflictResolution(memory1, memory2, 'inconsistency', 0.6);
    }

    return null;
  }

  private hasInconsistentMetadata(memory1: MemoryItem, memory2: MemoryItem): boolean {
    // Same content but different categories or priorities could indicate inconsistency
    const contentSimilarity = this.textAnalyzer.calculateContentSimilarity(memory1.content, memory2.content);

    if (contentSimilarity > 0.8) {
      const categoryMismatch = memory1.metadata.category !== memory2.metadata.category;
      const priorityDifference = Math.abs(memory1.metadata.priority - memory2.metadata.priority) > 3;

      return categoryMismatch || priorityDifference;
    }

    return false;
  }

  private createConflictResolution(
    memory1: MemoryItem,
    memory2: MemoryItem,
    conflictType: ConflictResolution['conflictType'],
    confidence: number
  ): ConflictResolution {
    const suggestedResolution = this.determineSuggestedResolution(conflictType, confidence);

    return {
      id: `conflict-${memory1.id}-${memory2.id}`,
      conflictingMemoryIds: [memory1.id, memory2.id],
      conflictType,
      confidence,
      suggestedResolution,
      metadata: {
        detectedAt: new Date(),
        algorithm: `${conflictType}-detector`,
      },
    };
  }

  private determineSuggestedResolution(
    conflictType: ConflictResolution['conflictType'],
    confidence: number
  ): ConflictResolution['suggestedResolution'] {
    switch (conflictType) {
      case 'duplication':
        return confidence > 0.9 ? 'merge' : 'prioritize';
      case 'contradiction':
        return confidence > 0.8 ? 'contextualize' : 'coexist';
      case 'inconsistency':
        return 'prioritize';
      default:
        return 'coexist';
    }
  }

  async resolveConflict(
    conflict: ConflictResolution,
    resolution: ConflictResolution['suggestedResolution'],
    resolvedBy: string,
    notes?: string
  ): Promise<ConflictResolution> {
    const updatedConflict: ConflictResolution = {
      ...conflict,
      metadata: {
        ...conflict.metadata,
        resolvedAt: new Date(),
        resolvedBy,
        ...(notes && { notes }),
      },
    };

    logger.info(`Conflict ${conflict.id} resolved using strategy: ${resolution}`, {
      conflictType: conflict.conflictType,
      resolvedBy,
    });

    return updatedConflict;
  }
}