/**
 * Software Engineering Knowledge Base and Ontology Integration
 * Provides structured knowledge about programming concepts, patterns, and relationships
 */

import { createLogger } from '../utils/logger.js';
import type { MemoryItem } from '../memory/types.js';

const logger = createLogger('se-ontology');

export interface ConceptNode {
  id: string;
  name: string;
  type: ConceptType;
  description: string;
  aliases: string[];
  relationships: ConceptRelationship[];
  properties: Record<string, any>;
  confidence: number;
}

export interface ConceptRelationship {
  type: RelationshipType;
  target: string;
  weight: number;
  context?: string;
}

export type ConceptType =
  | 'programming_language'
  | 'framework'
  | 'library'
  | 'design_pattern'
  | 'architectural_pattern'
  | 'development_practice'
  | 'testing_concept'
  | 'devops_tool'
  | 'data_structure'
  | 'algorithm'
  | 'software_principle'
  | 'code_smell'
  | 'refactoring_technique';

export type RelationshipType =
  | 'is_a' // inheritance/subtype
  | 'part_of' // composition
  | 'uses' // dependency
  | 'implements' // implementation
  | 'similar_to' // similarity
  | 'conflicts_with' // incompatibility
  | 'precedes' // temporal/evolution
  | 'enables' // facilitation
  | 'requires' // dependency
  | 'alternative_to'; // alternatives

export interface KnowledgeExtractionResult {
  concepts: ConceptNode[];
  relationships: ConceptRelationship[];
  confidence: number;
  extractedFrom: {
    content: string;
    language?: string | undefined;
    framework?: string | undefined;
  };
}

export class SoftwareEngineeringOntology {
  private concepts = new Map<string, ConceptNode>();
  private conceptsByType = new Map<ConceptType, Set<string>>();
  private isInitialized = false;

  constructor() {
    this.initializeKnowledgeBase();
  }

  /**
   * Initialize the software engineering knowledge base
   */
  private initializeKnowledgeBase(): void {
    // Programming Languages
    this.addConcept({
      id: 'javascript',
      name: 'JavaScript',
      type: 'programming_language',
      description: 'Dynamic programming language for web development',
      aliases: ['js', 'ecmascript'],
      relationships: [
        { type: 'enables', target: 'typescript', weight: 0.9 },
        { type: 'uses', target: 'nodejs', weight: 0.8 },
        { type: 'similar_to', target: 'python', weight: 0.6 },
      ],
      properties: {
        paradigm: ['object-oriented', 'functional', 'procedural'],
        typing: 'dynamic',
        compilation: 'interpreted',
      },
      confidence: 1.0,
    });

    this.addConcept({
      id: 'typescript',
      name: 'TypeScript',
      type: 'programming_language',
      description: 'Typed superset of JavaScript',
      aliases: ['ts'],
      relationships: [
        { type: 'is_a', target: 'javascript', weight: 0.9 },
        { type: 'uses', target: 'static_typing', weight: 1.0 },
      ],
      properties: {
        paradigm: ['object-oriented', 'functional'],
        typing: 'static',
        compilation: 'transpiled',
      },
      confidence: 1.0,
    });

    this.addConcept({
      id: 'python',
      name: 'Python',
      type: 'programming_language',
      description: 'High-level programming language emphasizing readability',
      aliases: ['py'],
      relationships: [
        { type: 'similar_to', target: 'javascript', weight: 0.6 },
        { type: 'uses', target: 'django', weight: 0.7 },
        { type: 'uses', target: 'flask', weight: 0.6 },
      ],
      properties: {
        paradigm: ['object-oriented', 'functional', 'procedural'],
        typing: 'dynamic',
        compilation: 'interpreted',
      },
      confidence: 1.0,
    });

    // Frameworks
    this.addConcept({
      id: 'react',
      name: 'React',
      type: 'framework',
      description: 'JavaScript library for building user interfaces',
      aliases: ['reactjs'],
      relationships: [
        { type: 'uses', target: 'javascript', weight: 1.0 },
        { type: 'implements', target: 'component_pattern', weight: 0.9 },
        { type: 'alternative_to', target: 'vue', weight: 0.8 },
        { type: 'alternative_to', target: 'angular', weight: 0.8 },
      ],
      properties: {
        domain: 'frontend',
        architecture: 'component-based',
        paradigm: 'declarative',
      },
      confidence: 1.0,
    });

    this.addConcept({
      id: 'nodejs',
      name: 'Node.js',
      type: 'framework',
      description: 'JavaScript runtime for server-side development',
      aliases: ['node'],
      relationships: [
        { type: 'uses', target: 'javascript', weight: 1.0 },
        { type: 'enables', target: 'express', weight: 0.9 },
        { type: 'implements', target: 'event_driven', weight: 0.8 },
      ],
      properties: {
        domain: 'backend',
        architecture: 'event-driven',
        io: 'non-blocking',
      },
      confidence: 1.0,
    });

    // Design Patterns
    this.addConcept({
      id: 'singleton',
      name: 'Singleton Pattern',
      type: 'design_pattern',
      description: 'Ensures a class has only one instance',
      aliases: ['singleton'],
      relationships: [
        { type: 'is_a', target: 'creational_pattern', weight: 1.0 },
        { type: 'conflicts_with', target: 'dependency_injection', weight: 0.7 },
      ],
      properties: {
        category: 'creational',
        complexity: 'simple',
        testability: 'low',
      },
      confidence: 1.0,
    });

    this.addConcept({
      id: 'observer',
      name: 'Observer Pattern',
      type: 'design_pattern',
      description: 'Defines one-to-many dependency between objects',
      aliases: ['observer', 'pub-sub'],
      relationships: [
        { type: 'is_a', target: 'behavioral_pattern', weight: 1.0 },
        { type: 'implements', target: 'event_driven', weight: 0.8 },
        { type: 'similar_to', target: 'mediator', weight: 0.6 },
      ],
      properties: {
        category: 'behavioral',
        complexity: 'medium',
        decoupling: 'high',
      },
      confidence: 1.0,
    });

    // Architectural Patterns
    this.addConcept({
      id: 'mvc',
      name: 'Model-View-Controller',
      type: 'architectural_pattern',
      description: 'Separates application logic into three components',
      aliases: ['mvc'],
      relationships: [
        { type: 'alternative_to', target: 'mvp', weight: 0.8 },
        { type: 'alternative_to', target: 'mvvm', weight: 0.8 },
        { type: 'implements', target: 'separation_of_concerns', weight: 0.9 },
      ],
      properties: {
        complexity: 'medium',
        separation: 'high',
        testability: 'high',
      },
      confidence: 1.0,
    });

    this.addConcept({
      id: 'microservices',
      name: 'Microservices Architecture',
      type: 'architectural_pattern',
      description: 'Application as suite of small, independent services',
      aliases: ['microservices', 'microservice'],
      relationships: [
        { type: 'alternative_to', target: 'monolithic', weight: 0.9 },
        { type: 'requires', target: 'api_gateway', weight: 0.8 },
        { type: 'requires', target: 'containerization', weight: 0.8 },
      ],
      properties: {
        scalability: 'high',
        complexity: 'high',
        deployment: 'distributed',
      },
      confidence: 1.0,
    });

    // Development Practices
    this.addConcept({
      id: 'tdd',
      name: 'Test-Driven Development',
      type: 'development_practice',
      description: 'Write tests before implementation',
      aliases: ['tdd', 'test-driven'],
      relationships: [
        { type: 'requires', target: 'unit_testing', weight: 1.0 },
        { type: 'implements', target: 'red_green_refactor', weight: 0.9 },
        { type: 'alternative_to', target: 'bdd', weight: 0.7 },
      ],
      properties: {
        quality: 'high',
        speed: 'medium',
        design: 'emergent',
      },
      confidence: 1.0,
    });

    // Software Principles
    this.addConcept({
      id: 'inheritance',
      name: 'Inheritance',
      type: 'software_principle',
      description: 'OOP principle where classes inherit properties and methods from parent classes',
      aliases: ['extends', 'subclass', 'derived class'],
      relationships: [
        { type: 'part_of', target: 'oop', weight: 1.0 },
        { type: 'enables', target: 'code_reuse', weight: 0.9 },
        { type: 'similar_to', target: 'composition', weight: 0.6 },
      ],
      properties: {
        paradigm: 'object-oriented',
        reusability: 'high',
        coupling: 'medium',
      },
      confidence: 1.0,
    });

    this.addConcept({
      id: 'polymorphism',
      name: 'Polymorphism',
      type: 'software_principle',
      description: 'Ability of objects to take multiple forms',
      aliases: ['polymorphic', 'method overriding'],
      relationships: [
        { type: 'part_of', target: 'oop', weight: 1.0 },
        { type: 'requires', target: 'inheritance', weight: 0.8 },
      ],
      properties: {
        paradigm: 'object-oriented',
        flexibility: 'high',
      },
      confidence: 1.0,
    });

    this.addConcept({
      id: 'encapsulation',
      name: 'Encapsulation',
      type: 'software_principle',
      description: 'Bundling data and methods that operate on that data within a single unit',
      aliases: ['data hiding', 'information hiding'],
      relationships: [
        { type: 'part_of', target: 'oop', weight: 1.0 },
        { type: 'implements', target: 'abstraction', weight: 0.7 },
      ],
      properties: {
        paradigm: 'object-oriented',
        security: 'high',
        maintainability: 'high',
      },
      confidence: 1.0,
    });

    this.addConcept({
      id: 'interface_segregation',
      name: 'Interface Segregation Principle',
      type: 'software_principle',
      description: 'No client should depend on methods it does not use',
      aliases: ['isp', 'interface segregation'],
      relationships: [
        { type: 'part_of', target: 'solid', weight: 1.0 },
        { type: 'enables', target: 'loose_coupling', weight: 0.9 },
      ],
      properties: {
        category: 'SOLID',
        cohesion: 'high',
      },
      confidence: 1.0,
    });

    // Testing Concepts
    this.addConcept({
      id: 'unit_testing',
      name: 'Unit Testing',
      type: 'testing_concept',
      description: 'Testing individual components in isolation',
      aliases: ['unit test', 'unit tests'],
      relationships: [
        { type: 'part_of', target: 'test_pyramid', weight: 0.9 },
        { type: 'precedes', target: 'integration_testing', weight: 0.8 },
        { type: 'uses', target: 'mocking', weight: 0.7 },
      ],
      properties: {
        scope: 'small',
        speed: 'fast',
        isolation: 'high',
      },
      confidence: 1.0,
    });

    // DevOps Tools
    this.addConcept({
      id: 'docker',
      name: 'Docker',
      type: 'devops_tool',
      description: 'Platform for containerizing applications',
      aliases: ['containerization'],
      relationships: [
        { type: 'enables', target: 'microservices', weight: 0.8 },
        { type: 'uses', target: 'kubernetes', weight: 0.7 },
        { type: 'implements', target: 'containerization', weight: 1.0 },
      ],
      properties: {
        category: 'containerization',
        portability: 'high',
        overhead: 'low',
      },
      confidence: 1.0,
    });

    // Software Principles
    this.addConcept({
      id: 'solid',
      name: 'SOLID Principles',
      type: 'software_principle',
      description: 'Five design principles for maintainable code',
      aliases: ['solid'],
      relationships: [
        { type: 'implements', target: 'clean_code', weight: 0.9 },
        { type: 'enables', target: 'maintainability', weight: 0.9 },
        { type: 'part_of', target: 'object_oriented_design', weight: 0.8 },
      ],
      properties: {
        principles: ['SRP', 'OCP', 'LSP', 'ISP', 'DIP'],
        complexity: 'medium',
        impact: 'high',
      },
      confidence: 1.0,
    });

    this.buildIndices();
    this.isInitialized = true;

    logger.info('Software Engineering Ontology initialized', {
      concepts: this.concepts.size,
      types: this.conceptsByType.size,
    });
  }

  /**
   * Add a concept to the knowledge base
   */
  private addConcept(concept: ConceptNode): void {
    this.concepts.set(concept.id, concept);

    if (!this.conceptsByType.has(concept.type)) {
      this.conceptsByType.set(concept.type, new Set());
    }
    this.conceptsByType.get(concept.type)!.add(concept.id);

    // Add aliases as searchable terms
    for (const alias of concept.aliases) {
      this.concepts.set(alias.toLowerCase(), concept);
    }
  }

  /**
   * Build search indices for faster lookups
   */
  private buildIndices(): void {
    // Build reverse relationship index for faster traversal
    // This could be expanded for more sophisticated indexing
  }

  /**
   * Extract software engineering concepts from content
   */
  async extractConcepts(
    content: string,
    context?: {
      language?: string;
      framework?: string;
      codeType?: string;
    }
  ): Promise<KnowledgeExtractionResult> {
    const lowercaseContent = content.toLowerCase();
    const foundConcepts: ConceptNode[] = [];
    const foundRelationships: ConceptRelationship[] = [];

    // Find exact matches
    for (const [id, concept] of this.concepts) {
      if (
        lowercaseContent.includes(id) ||
        concept.aliases.some(alias => lowercaseContent.includes(alias.toLowerCase()))
      ) {
        foundConcepts.push(concept);
      }
    }

    // Find pattern-based concepts
    const patternConcepts = this.extractPatternBasedConcepts(content, context);
    foundConcepts.push(...patternConcepts);

    // Deduplicate
    const uniqueConcepts = foundConcepts.filter(
      (concept, index, array) => array.findIndex(c => c.id === concept.id) === index
    );

    // Extract relationships between found concepts
    for (let i = 0; i < uniqueConcepts.length; i++) {
      for (let j = i + 1; j < uniqueConcepts.length; j++) {
        const relationship = this.findRelationshipBetweenConcepts(
          uniqueConcepts[i]!,
          uniqueConcepts[j]!,
          content
        );
        if (relationship) {
          foundRelationships.push(relationship);
        }
      }
    }

    const confidence = this.calculateExtractionConfidence(uniqueConcepts, content);

    logger.debug('Extracted software engineering concepts', {
      concepts: uniqueConcepts.length,
      relationships: foundRelationships.length,
      confidence,
      contentLength: content.length,
    });

    return {
      concepts: uniqueConcepts,
      relationships: foundRelationships,
      confidence,
      extractedFrom: {
        content: content.substring(0, 200), // Store snippet for reference
        language: context?.language,
        framework: context?.framework,
      },
    };
  }

  /**
   * Extract concepts based on code patterns and context
   */
  private extractPatternBasedConcepts(content: string, context?: any): ConceptNode[] {
    const concepts: ConceptNode[] = [];
    const lowercaseContent = content.toLowerCase();

    // Pattern-based detection
    if (lowercaseContent.includes('class ') && lowercaseContent.includes('extends')) {
      const inheritanceConcept = this.concepts.get('inheritance');
      if (inheritanceConcept) concepts.push(inheritanceConcept);
    }

    if (lowercaseContent.includes('interface ') || lowercaseContent.includes('implements')) {
      const interfaceConcept = this.concepts.get('interface_segregation');
      if (interfaceConcept) concepts.push(interfaceConcept);
    }

    if (
      lowercaseContent.includes('test') ||
      lowercaseContent.includes('describe') ||
      lowercaseContent.includes('it(')
    ) {
      const testingConcept = this.concepts.get('unit_testing');
      if (testingConcept) concepts.push(testingConcept);
    }

    // Context-based detection
    if (context?.language === 'javascript' || context?.language === 'typescript') {
      if (lowercaseContent.includes('async') || lowercaseContent.includes('await')) {
        concepts.push({
          id: 'async_programming',
          name: 'Asynchronous Programming',
          type: 'development_practice',
          description: 'Non-blocking code execution pattern',
          aliases: ['async', 'await', 'promises'],
          relationships: [],
          properties: { language: 'javascript' },
          confidence: 0.8,
        });
      }
    }

    return concepts;
  }

  /**
   * Find relationships between concepts in content
   */
  private findRelationshipBetweenConcepts(
    concept1: ConceptNode,
    concept2: ConceptNode,
    content: string
  ): ConceptRelationship | null {
    // Check if there's a direct relationship in our ontology
    const directRelationship = concept1.relationships.find(rel => rel.target === concept2.id);
    if (directRelationship) {
      return directRelationship;
    }

    // Check for contextual relationships based on co-occurrence patterns
    const lowercaseContent = content.toLowerCase();

    // If both concepts appear close together, they might be related
    const concept1Pos = lowercaseContent.indexOf(concept1.name.toLowerCase());
    const concept2Pos = lowercaseContent.indexOf(concept2.name.toLowerCase());

    if (concept1Pos !== -1 && concept2Pos !== -1 && Math.abs(concept1Pos - concept2Pos) < 100) {
      return {
        type: 'uses',
        target: concept2.id,
        weight: 0.5,
        context: 'co-occurrence',
      };
    }

    return null;
  }

  /**
   * Calculate confidence score for concept extraction
   */
  private calculateExtractionConfidence(concepts: ConceptNode[], content: string): number {
    if (concepts.length === 0) return 0;

    let totalConfidence = 0;
    for (const concept of concepts) {
      // Base confidence from concept itself
      let conceptConfidence = concept.confidence;

      // Boost confidence based on exact name matches
      if (content.toLowerCase().includes(concept.name.toLowerCase())) {
        conceptConfidence += 0.2;
      }

      // Boost confidence based on multiple alias matches
      const aliasMatches = concept.aliases.filter(alias =>
        content.toLowerCase().includes(alias.toLowerCase())
      ).length;
      conceptConfidence += Math.min(aliasMatches * 0.1, 0.3);

      totalConfidence += Math.min(conceptConfidence, 1.0);
    }

    return totalConfidence / concepts.length;
  }

  /**
   * Get related concepts for a given concept
   */
  getRelatedConcepts(conceptId: string, maxDepth = 2): ConceptNode[] {
    const concept = this.concepts.get(conceptId);
    if (!concept) return [];

    const related = new Set<string>();
    const visited = new Set<string>();

    this.traverseRelationships(concept.id, related, visited, maxDepth);

    return Array.from(related)
      .map(id => this.concepts.get(id))
      .filter(Boolean) as ConceptNode[];
  }

  /**
   * Traverse concept relationships recursively
   */
  private traverseRelationships(
    conceptId: string,
    related: Set<string>,
    visited: Set<string>,
    depth: number
  ): void {
    if (depth <= 0 || visited.has(conceptId)) return;

    visited.add(conceptId);
    const concept = this.concepts.get(conceptId);
    if (!concept) return;

    for (const relationship of concept.relationships) {
      if (!visited.has(relationship.target)) {
        related.add(relationship.target);
        this.traverseRelationships(relationship.target, related, visited, depth - 1);
      }
    }
  }

  /**
   * Search concepts by type
   */
  getConceptsByType(type: ConceptType): ConceptNode[] {
    const conceptIds = this.conceptsByType.get(type) || new Set();
    return Array.from(conceptIds)
      .map(id => this.concepts.get(id))
      .filter(Boolean) as ConceptNode[];
  }

  /**
   * Find concepts similar to given terms
   */
  findSimilarConcepts(terms: string[], limit = 10): ConceptNode[] {
    const scoredConcepts: Array<{ concept: ConceptNode; score: number }> = [];

    for (const concept of this.concepts.values()) {
      let score = 0;

      for (const term of terms) {
        const lowerTerm = term.toLowerCase();

        // Exact name match
        if (concept.name.toLowerCase().includes(lowerTerm)) score += 2;

        // Alias match
        if (concept.aliases.some(alias => alias.toLowerCase().includes(lowerTerm))) score += 1.5;

        // Description match
        if (concept.description.toLowerCase().includes(lowerTerm)) score += 1;
      }

      if (score > 0) {
        scoredConcepts.push({ concept, score });
      }
    }

    return scoredConcepts
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.concept);
  }

  /**
   * Enrich memory item with software engineering concepts
   */
  async enrichMemoryWithConcepts(memory: MemoryItem): Promise<MemoryItem> {
    const extraction = await this.extractConcepts(memory.content, {
      language: memory.metadata['language'] as string,
      framework: memory.metadata['framework'] as string,
      codeType: memory.metadata['codeType'] as string,
    });

    const enrichedMetadata = {
      ...memory.metadata,
      softwareEngineeringConcepts: extraction.concepts.map(c => c.id),
      conceptConfidence: extraction.confidence,
      extractedRelationships: extraction.relationships,
      conceptTypes: [...new Set(extraction.concepts.map(c => c.type))],
    };

    return {
      ...memory,
      metadata: enrichedMetadata,
    };
  }

  /**
   * Get ontology statistics
   */
  getStats() {
    const typeDistribution = new Map<ConceptType, number>();
    for (const [type, concepts] of this.conceptsByType) {
      typeDistribution.set(type, concepts.size);
    }

    return {
      totalConcepts: this.concepts.size,
      typeDistribution: Object.fromEntries(typeDistribution),
      isInitialized: this.isInitialized,
    };
  }
}

// Export singleton instance
export const softwareEngineeringOntology = new SoftwareEngineeringOntology();
