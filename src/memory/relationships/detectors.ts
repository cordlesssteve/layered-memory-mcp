/**
 * Relationship detection algorithms for the Dynamic Memory Evolution system
 */

import type { MemoryItem } from '../types.js';
import type { MemoryRelationship, RelationshipCreationParams } from './types.js';
import { TextAnalyzer } from './text-analyzer.js';
import {
  relationshipErrorHandler,
  RelationshipValidator
} from './error-handling.js';

export class RelationshipDetectors {
  private textAnalyzer = new TextAnalyzer();

  async detectReferenceRelationship(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<MemoryRelationship | null> {
    return await relationshipErrorHandler.withErrorHandling(
      async () => {
        // Input validation
        RelationshipValidator.validateMemoryItem(memory1, 'in detectReferenceRelationship (memory1)');
        RelationshipValidator.validateMemoryItem(memory2, 'in detectReferenceRelationship (memory2)');

        // Look for explicit references or citations
        const hasReference =
          memory1.content.toLowerCase().includes(memory2.id) ||
          memory2.content.toLowerCase().includes(memory1.id) ||
          this.textAnalyzer.hasUrlReference(memory1.content, memory2.content);

        if (hasReference) {
          return this.createRelationship({
            sourceId: memory1.id,
            targetId: memory2.id,
            type: 'reference',
            confidence: 0.9,
            weight: 0.8,
            algorithm: 'reference-detector',
          });
        }
        return null;
      },
      {
        operation: 'detectReferenceRelationship',
        memory1Id: memory1.id,
        memory2Id: memory2.id
      },
      null // Return null as fallback
    );
  }

  async detectContextualRelationship(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<MemoryRelationship | null> {
    // Check for shared context (tags, categories, projects) - be more selective
    const sharedTags = memory1.metadata.tags.filter(tag => memory2.metadata.tags.includes(tag));
    const sameCategory = memory1.metadata.category === memory2.metadata.category;
    const sameProject = memory1.metadata.projectId === memory2.metadata.projectId;

    // Require stronger contextual connections
    const hasStrongConnection =
      sharedTags.length >= 2 || // At least 2 shared tags
      (sharedTags.length >= 1 && sameCategory) || // 1 shared tag AND same category
      (sameCategory && sameProject && memory1.metadata.category !== 'knowledge'); // Same category/project but not generic knowledge

    if (hasStrongConnection) {
      const confidence = Math.min(1.0,
        sharedTags.length * 0.25 + (sameCategory ? 0.3 : 0) + (sameProject ? 0.2 : 0));
      return this.createRelationship({
        sourceId: memory1.id,
        targetId: memory2.id,
        type: 'contextual',
        confidence,
        weight: 0.6,
        algorithm: 'context-detector',
      });
    }
    return null;
  }

  async detectCausalRelationship(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<MemoryRelationship | null> {
    // Look for causal language patterns
    const causalPatterns = [
      /because.*/,
      /due to.*/,
      /caused by.*/,
      /results in.*/,
      /leads to.*/,
      /therefore.*/,
      /consequently.*/,
    ];

    const content1 = memory1.content.toLowerCase();
    const content2 = memory2.content.toLowerCase();

    for (const pattern of causalPatterns) {
      if (pattern.test(content1) || pattern.test(content2)) {
        return this.createRelationship({
          sourceId: memory1.id,
          targetId: memory2.id,
          type: 'causal',
          confidence: 0.7,
          weight: 0.7,
          algorithm: 'causal-detector',
        });
      }
    }
    return null;
  }

  async detectTemporalRelationship(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<MemoryRelationship | null> {
    // Check temporal proximity - be more selective to avoid noise
    // Handle both Date objects and ISO strings
    const getTime = (dateField: Date | string): number => {
      if (dateField instanceof Date) {
        return dateField.getTime();
      }
      return new Date(dateField).getTime();
    };

    const timeDiff = Math.abs(getTime(memory1.createdAt) - getTime(memory2.createdAt));
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    // Only consider memories created within 4 hours as temporally related
    // AND require some contextual similarity to avoid spurious connections
    if (hoursDiff < 4) {
      const sharedTags = memory1.metadata.tags.filter(tag => memory2.metadata.tags.includes(tag));
      const sameCategory = memory1.metadata.category === memory2.metadata.category;

      // Require at least some contextual connection for temporal relationships
      if (sharedTags.length > 0 || sameCategory) {
        const confidence = Math.max(0.5, 1 - hoursDiff / 4);
        return this.createRelationship({
          sourceId: memory1.id,
          targetId: memory2.id,
          type: 'temporal',
          confidence,
          weight: 0.4, // Lower weight since temporal proximity alone isn't very meaningful
          algorithm: 'temporal-detector',
        });
      }
    }
    return null;
  }

  async detectHierarchicalRelationship(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<MemoryRelationship | null> {
    // Look for hierarchical patterns
    const hierarchicalPatterns = [
      /parent/,
      /child/,
      /contains/,
      /part of/,
      /belongs to/,
      /section/,
      /chapter/,
      /subsection/,
    ];

    const content1 = memory1.content.toLowerCase();
    const content2 = memory2.content.toLowerCase();

    for (const pattern of hierarchicalPatterns) {
      if (pattern.test(content1) || pattern.test(content2)) {
        return this.createRelationship({
          sourceId: memory1.id,
          targetId: memory2.id,
          type: 'hierarchical',
          confidence: 0.8,
          weight: 0.7,
          algorithm: 'hierarchy-detector',
        });
      }
    }
    return null;
  }

  async detectContradictionRelationship(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<MemoryRelationship | null> {
    // Look for contradictory language
    const contradictionPatterns = [
      /however/,
      /but/,
      /although/,
      /despite/,
      /contrary/,
      /opposite/,
      /not/,
      /never/,
      /disagree/,
    ];

    const content1 = memory1.content.toLowerCase();
    const content2 = memory2.content.toLowerCase();

    // Also check for similar topics with different conclusions
    const hasSimilarTopics = this.textAnalyzer.hasSimilarKeywords(content1, content2);
    const hasContradictoryLanguage = contradictionPatterns.some(
      pattern => pattern.test(content1) || pattern.test(content2)
    );

    if (hasSimilarTopics && hasContradictoryLanguage) {
      return this.createRelationship({
        sourceId: memory1.id,
        targetId: memory2.id,
        type: 'contradiction',
        confidence: 0.8,
        weight: 0.9,
        algorithm: 'contradiction-detector',
      });
    }
    return null;
  }

  async detectConfirmationRelationship(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<MemoryRelationship | null> {
    // Look for supporting language
    const confirmationPatterns = [
      /confirms/,
      /supports/,
      /validates/,
      /proves/,
      /shows/,
      /demonstrates/,
      /agrees/,
      /consistent/,
    ];

    const content1 = memory1.content.toLowerCase();
    const content2 = memory2.content.toLowerCase();

    for (const pattern of confirmationPatterns) {
      if (pattern.test(content1) || pattern.test(content2)) {
        return this.createRelationship({
          sourceId: memory1.id,
          targetId: memory2.id,
          type: 'confirmation',
          confidence: 0.7,
          weight: 0.8,
          algorithm: 'confirmation-detector',
        });
      }
    }
    return null;
  }

  async detectEvolutionRelationship(
    memory1: MemoryItem,
    memory2: MemoryItem
  ): Promise<MemoryRelationship | null> {
    // Check if memories are versions of each other
    const similarity = this.textAnalyzer.calculateContentSimilarity(memory1.content, memory2.content);

    // Helper function to safely get time from date field
    const getTime = (dateField: Date | string | undefined): number => {
      if (!dateField) return 0;
      if (dateField instanceof Date) {
        return dateField.getTime();
      }
      return new Date(dateField).getTime();
    };

    // High similarity + different update times suggests evolution
    const updateTime1 = getTime(memory1.updatedAt || memory1.createdAt);
    const updateTime2 = getTime(memory2.updatedAt || memory2.createdAt);

    if (similarity > 0.7 && updateTime1 !== updateTime2) {
      return this.createRelationship({
        sourceId: memory1.id,
        targetId: memory2.id,
        type: 'evolution',
        confidence: 0.9,
        weight: 0.8,
        algorithm: 'evolution-detector',
      });
    }
    return null;
  }

  private createRelationship(params: RelationshipCreationParams): MemoryRelationship {
    return {
      id: `rel-${params.sourceId}-${params.targetId}-${params.type}`,
      sourceMemoryId: params.sourceId,
      targetMemoryId: params.targetId,
      type: params.type,
      confidence: params.confidence,
      weight: params.weight,
      metadata: {
        source: 'auto-detected',
        algorithm: params.algorithm,
        createdAt: new Date(),
      },
    };
  }
}