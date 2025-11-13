/**
 * Semantic Enrichment Pipeline for Software Engineering Content
 * Combines NER, concept extraction, and intelligent categorization
 */

import type { CodeContext } from '../embeddings/code-embedding-service.js';
import type { ConceptNode } from '../knowledge/software-engineering-ontology.js';
import type { MemoryItem } from '../memory/types.js';

export interface EnrichmentResult {
  originalContent: string;
  enrichedMetadata: EnrichmentMetadata;
  extractedEntities: NamedEntity[];
  concepts: ConceptNode[];
  categories: SemanticCategory[];
  codeAnalysis?: CodeAnalysisResult | undefined;
  confidence: number;
  processingTime: number;
}

export interface EnrichmentMetadata {
  // Technical metadata
  language?: string | undefined;
  framework?: string | undefined;
  codeType?: 'function' | 'class' | 'module' | 'documentation' | 'config' | 'test' | undefined;
  domain?: 'frontend' | 'backend' | 'devops' | 'testing' | 'data' | undefined;

  // Quality indicators
  complexity?: number | undefined;
  maintainabilityIndex?: number | undefined;
  testCoverage?: number | undefined;

  // Semantic markers
  concepts: string[];
  conceptTypes: string[];
  semanticTags: string[];
  confidenceScores: Record<string, number>;
}

export interface NamedEntity {
  text: string;
  type: EntityType;
  start: number;
  end: number;
  confidence: number;
  context?: string | undefined;
}

export type EntityType =
  | 'person' // Developer names, authors
  | 'organization' // Companies, teams
  | 'technology' // Languages, frameworks, tools
  | 'concept' // Programming concepts
  | 'pattern' // Design patterns
  | 'methodology' // Development approaches
  | 'file' // File names, paths
  | 'function' // Function/method names
  | 'class' // Class names
  | 'variable' // Variable identifiers
  | 'api_endpoint' // REST endpoints
  | 'database_table' // DB entities
  | 'library' // Third-party libraries
  | 'bug_type' // Error categories
  | 'performance_metric'; // Performance indicators

export interface SemanticCategory {
  category: string;
  subcategory?: string | undefined;
  confidence: number;
  reasoning: string[];
  suggestedTags: string[];
}

export interface CodeAnalysisResult {
  // Metrics
  linesOfCode: number;
  linesOfComments: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingLevel: number;
  maintainabilityIndex: number;

  // Structure analysis
  functionCount: number;
  classCount: number;
  methodCount: number;
  variableCount: number;

  // Quality indicators
  codeSmells: CodeSmell[];
  duplicateBlocks: DuplicateBlock[];
  dependencyComplexity: number;
  testabilityScore: number;
}

export interface CodeSmell {
  type: SmellType;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: {
    line: number;
    column: number;
    function?: string | undefined;
  };
  suggestion: string;
}

export type SmellType =
  | 'long_method'
  | 'large_class'
  | 'duplicate_code'
  | 'long_parameter_list'
  | 'deep_nesting'
  | 'complex_conditional'
  | 'dead_code'
  | 'magic_number'
  | 'god_class'
  | 'feature_envy';

export interface DuplicateBlock {
  originalLocation: { start: number; end: number };
  duplicateLocation: { start: number; end: number };
  similarity: number;
  lineCount: number;
}

/**
 * Semantic Enrichment Pipeline Service
 * Sprint SE-1 implementation: Basic semantic enrichment capabilities
 */
export class SemanticEnrichmentPipeline {
  /**
   * Enrich content with semantic analysis
   */
  async enrichContent(content: string, context?: Partial<CodeContext>): Promise<EnrichmentResult> {
    const startTime = Date.now();

    // Basic implementation for Sprint SE-1
    const entities = await this.extractNamedEntities(content);
    const categories = this.categorizeContent(content);
    const concepts: ConceptNode[] = []; // To be implemented in Sprint SE-4
    const codeAnalysis = this.isCodeContent(content) ? await this.analyzeCode(content) : undefined;

    const enrichedMetadata: EnrichmentMetadata = {
      language: context?.language,
      framework: context?.framework,
      domain: context?.domain as 'frontend' | 'backend' | 'devops' | 'testing' | 'data' | undefined,
      codeType: context?.codeType,
      concepts: concepts.map(c => c.id),
      conceptTypes: [...new Set(concepts.map(c => c.type))],
      semanticTags: categories.flatMap(c => c.suggestedTags),
      confidenceScores: {},
    };

    return {
      originalContent: content,
      enrichedMetadata,
      extractedEntities: entities,
      concepts,
      categories,
      codeAnalysis,
      confidence: 0.7, // Basic confidence for Sprint SE-1
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Extract named entities from content
   */
  async extractNamedEntities(content: string): Promise<NamedEntity[]> {
    // Basic regex-based NER for Sprint SE-1
    const entities: NamedEntity[] = [];

    // Technology detection
    const techPatterns = [
      {
        pattern: /\b(React|Vue|Angular|Express|Django|Spring)\b/gi,
        type: 'technology' as EntityType,
      },
      {
        pattern: /\b(JavaScript|TypeScript|Python|Java|Go|Rust)\b/gi,
        type: 'technology' as EntityType,
      },
      { pattern: /\b(MySQL|PostgreSQL|MongoDB|Redis)\b/gi, type: 'technology' as EntityType },
    ];

    for (const { pattern, type } of techPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        entities.push({
          text: match[0],
          type,
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.8,
          context: content.substring(
            Math.max(0, match.index - 20),
            match.index + match[0].length + 20
          ),
        });
      }
    }

    return entities;
  }

  /**
   * Categorize content semantically
   */
  private categorizeContent(content: string): SemanticCategory[] {
    const categories: SemanticCategory[] = [];
    const lowercaseContent = content.toLowerCase();

    // Basic categorization rules for Sprint SE-1
    if (lowercaseContent.includes('test') || lowercaseContent.includes('spec')) {
      categories.push({
        category: 'testing',
        confidence: 0.8,
        reasoning: ['Contains test-related keywords'],
        suggestedTags: ['testing', 'qa'],
      });
    }

    if (lowercaseContent.includes('function') || lowercaseContent.includes('method')) {
      categories.push({
        category: 'implementation',
        subcategory: 'function',
        confidence: 0.7,
        reasoning: ['Contains function/method definitions'],
        suggestedTags: ['function', 'implementation'],
      });
    }

    if (lowercaseContent.includes('class') || lowercaseContent.includes('interface')) {
      categories.push({
        category: 'implementation',
        subcategory: 'structure',
        confidence: 0.7,
        reasoning: ['Contains class/interface definitions'],
        suggestedTags: ['class', 'interface', 'structure'],
      });
    }

    return categories;
  }

  /**
   * Check if content is likely code
   */
  private isCodeContent(content: string): boolean {
    const codeIndicators = [
      /function\s+\w+/,
      /class\s+\w+/,
      /import\s+.+from/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /def\s+\w+\(/,
      /public\s+class/,
      /\bif\s*\(/,
      /\bwhile\s*\(/,
      /\bfor\s*\(/,
      /\bswitch\s*\(/,
      /\btry\s*\{/,
      /\.\w+\(/, // method calls like obj.method()
      /=>\s*[{\w]/, // arrow functions
      /\{.*\}/, // code blocks with braces
    ];

    return codeIndicators.some(pattern => pattern.test(content));
  }

  /**
   * Analyze code for complexity and quality metrics
   */
  private async analyzeCode(content: string): Promise<CodeAnalysisResult> {
    const lines = content.split('\n');
    const linesOfCode = lines.filter(line => line.trim() && !line.trim().startsWith('//')).length;
    const linesOfComments = lines.filter(
      line => line.trim().startsWith('//') || line.trim().startsWith('*')
    ).length;

    // Simple complexity metrics for Sprint SE-1
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(content);
    const nestingLevel = this.calculateNestingLevel(content);

    return {
      linesOfCode,
      linesOfComments,
      cyclomaticComplexity,
      cognitiveComplexity: cyclomaticComplexity, // Simplified for now
      nestingLevel,
      maintainabilityIndex: Math.max(0, 100 - cyclomaticComplexity * 2 - nestingLevel * 5),
      functionCount: (content.match(/function\s+|def\s+/gi) || []).length,
      classCount: (content.match(/class\s+/gi) || []).length,
      methodCount: (content.match(/\.\w+\(/gi) || []).length,
      variableCount: (content.match(/\b(const|let|var)\s+\w+/gi) || []).length,
      codeSmells: [], // To be implemented in Sprint SE-3
      duplicateBlocks: [], // To be implemented in Sprint SE-3
      dependencyComplexity: 0,
      testabilityScore: 0.7,
    };
  }

  /**
   * Calculate cyclomatic complexity (basic implementation)
   */
  private calculateCyclomaticComplexity(content: string): number {
    const complexityKeywords = ['if', 'else if', 'while', 'for', 'switch', 'case', 'catch', 'try'];

    let complexity = 1; // Base complexity
    for (const keyword of complexityKeywords) {
      const matches = content.match(new RegExp(`\\b${keyword}\\b`, 'gi'));
      complexity += matches ? matches.length : 0;
    }

    return complexity;
  }

  /**
   * Calculate maximum nesting level
   */
  private calculateNestingLevel(content: string): number {
    let currentLevel = 0;
    let maxLevel = 0;

    for (const char of content) {
      if (char === '{') {
        currentLevel++;
        maxLevel = Math.max(maxLevel, currentLevel);
      } else if (char === '}') {
        currentLevel--;
      }
    }

    return maxLevel;
  }

  /**
   * Enrich a memory item with semantic analysis
   */
  async enrichMemoryItem(memory: MemoryItem): Promise<MemoryItem> {
    const enrichmentResult = await this.enrichContent(memory.content, {
      language: memory.metadata['language'] as string,
      framework: memory.metadata['framework'] as string,
    });

    const enrichedMetadata = {
      ...memory.metadata,
      ...enrichmentResult.enrichedMetadata,
      enrichmentConfidence: enrichmentResult.confidence,
      enrichmentTimestamp: new Date().toISOString(),
    };

    return {
      ...memory,
      metadata: enrichedMetadata,
    };
  }
}

// Create and export singleton instance
export const semanticEnrichmentPipeline = new SemanticEnrichmentPipeline();
