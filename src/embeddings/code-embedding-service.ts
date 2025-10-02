/**
 * Software Engineering Domain-Specific Embedding Service
 * Specialized embeddings for code, documentation, and software engineering concepts
 */

import { pipeline } from '@xenova/transformers';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('code-embedding-service');

export interface CodeEmbeddingConfig {
  modelName: string;
  dimensions: number;
  maxLength: number;
  normalize: boolean;
  batchSize: number;
  // Code-specific settings
  includeCodeStructure: boolean;
  includeComments: boolean;
  preserveIdentifiers: boolean;
}

export interface CodeContext {
  language: string;
  framework?: string | undefined;
  domain?: string | undefined; // 'frontend' | 'backend' | 'devops' | 'testing' | 'data'
  codeType: 'function' | 'class' | 'module' | 'documentation' | 'config' | 'test';
}

export interface CodeEmbeddingResponse {
  embedding: number[];
  dimensions: number;
  processingTime: number;
  codeContext: CodeContext;
  extractedTokens: {
    identifiers: string[];
    keywords: string[];
    concepts: string[];
  };
}

export class CodeEmbeddingService {
  private pipeline: any | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  private readonly config: CodeEmbeddingConfig = {
    modelName: 'microsoft/codebert-base', // CodeBERT for code understanding
    dimensions: 768,
    maxLength: 512,
    normalize: true,
    batchSize: 16,
    includeCodeStructure: true,
    includeComments: true,
    preserveIdentifiers: true,
  };

  // Software engineering domain vocabularies
  private readonly programmingKeywords = new Set([
    'function',
    'class',
    'method',
    'variable',
    'array',
    'object',
    'interface',
    'api',
    'endpoint',
    'database',
    'query',
    'schema',
    'model',
    'controller',
    'service',
    'repository',
    'component',
    'module',
    'library',
    'framework',
    'test',
    'unit test',
    'integration',
    'deployment',
    'ci/cd',
    'docker',
    'microservice',
    'architecture',
    'design pattern',
    'algorithm',
    'data structure',
  ]);

  private readonly frameworks = new Map([
    ['react', ['jsx', 'hooks', 'component', 'props', 'state']],
    ['vue', ['template', 'directive', 'computed', 'watch', 'component']],
    ['angular', ['component', 'service', 'directive', 'pipe', 'module']],
    ['express', ['middleware', 'route', 'handler', 'request', 'response']],
    ['django', ['view', 'model', 'template', 'url', 'middleware']],
    ['spring', ['bean', 'annotation', 'controller', 'service', 'repository']],
  ]);

  constructor(customConfig?: Partial<CodeEmbeddingConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    logger.info('Code Embedding Service initialized', {
      model: this.config.modelName,
      dimensions: this.config.dimensions,
      codeFeatures: {
        structure: this.config.includeCodeStructure,
        comments: this.config.includeComments,
        identifiers: this.config.preserveIdentifiers,
      },
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._initializeModel();
    return this.initializationPromise;
  }

  private async _initializeModel(): Promise<void> {
    try {
      logger.info('Loading CodeBERT model...', { model: this.config.modelName });

      this.pipeline = await pipeline('feature-extraction', this.config.modelName, {
        quantized: false,
        local_files_only: false,
      });

      this.isInitialized = true;
      logger.info('CodeBERT model loaded successfully');
    } catch (error) {
      logger.error('Failed to load CodeBERT model', { error });
      throw new Error(`CodeBERT initialization failed: ${error}`);
    }
  }

  /**
   * Generate embeddings for code with software engineering context
   */
  async generateCodeEmbedding(
    content: string,
    context: Partial<CodeContext> = {}
  ): Promise<CodeEmbeddingResponse> {
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('CodeBERT pipeline not initialized');
    }

    const startTime = Date.now();

    try {
      // Analyze code structure and extract tokens
      const codeAnalysis = this.analyzeCodeStructure(content, context);

      // Preprocess code for embedding
      const processedCode = this.preprocessCode(content, codeAnalysis.codeContext);

      // Generate embedding
      const result = await this.pipeline(processedCode, {
        pooling: 'mean',
        normalize: this.config.normalize,
      });

      let embedding: number[];
      if (Array.isArray(result) && result.length > 0) {
        embedding = Array.from(result[0] as number[]);
      } else if (result && typeof result === 'object' && 'data' in result) {
        embedding = Array.from((result as any).data as number[]);
      } else {
        throw new Error('Unexpected embedding format from CodeBERT');
      }

      const processingTime = Date.now() - startTime;

      logger.debug('Generated code embedding', {
        contentLength: content.length,
        language: codeAnalysis.codeContext.language,
        codeType: codeAnalysis.codeContext.codeType,
        identifiersFound: codeAnalysis.extractedTokens.identifiers.length,
        processingTime,
      });

      return {
        embedding,
        dimensions: embedding.length,
        processingTime,
        codeContext: codeAnalysis.codeContext,
        extractedTokens: codeAnalysis.extractedTokens,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Code embedding generation failed', {
        contentLength: content.length,
        processingTime,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Analyze code structure and extract programming concepts
   */
  private analyzeCodeStructure(content: string, context: Partial<CodeContext>) {
    const extractedTokens = {
      identifiers: this.extractIdentifiers(content),
      keywords: this.extractProgrammingKeywords(content),
      concepts: this.extractSoftwareEngineeringConcepts(content),
    };

    const detectedLanguage = context.language || this.detectProgrammingLanguage(content);
    const detectedCodeType = context.codeType || this.detectCodeType(content);
    const detectedFramework = this.detectFramework(content);

    const codeContext: CodeContext = {
      language: detectedLanguage,
      framework: detectedFramework || undefined,
      domain: context.domain || this.inferDomain(content),
      codeType: detectedCodeType,
    };

    return { codeContext, extractedTokens };
  }

  /**
   * Preprocess code content for optimal embedding generation
   */
  private preprocessCode(content: string, context: CodeContext): string {
    let processed = content;

    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();

    // Add context markers for better semantic understanding
    if (context.language) {
      processed = `[${context.language.toUpperCase()}] ${processed}`;
    }

    if (context.framework) {
      processed = `[${context.framework.toUpperCase()}] ${processed}`;
    }

    if (context.codeType) {
      processed = `[${context.codeType.toUpperCase()}] ${processed}`;
    }

    // Truncate if necessary
    if (processed.length > this.config.maxLength * 4) {
      processed = processed.substring(0, this.config.maxLength * 4);
    }

    return processed;
  }

  /**
   * Extract programming identifiers (functions, variables, classes)
   */
  private extractIdentifiers(content: string): string[] {
    const identifiers: string[] = [];

    // Function declarations/calls
    const functionPattern =
      /(?:function\s+|def\s+|const\s+|let\s+|var\s+)([a-zA-Z_][a-zA-Z0-9_]*)|([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      const identifier = match[1] || match[2];
      if (identifier && identifier.length > 2) {
        identifiers.push(identifier);
      }
    }

    // Class names
    const classPattern = /(?:class\s+|interface\s+|type\s+)([A-Z][a-zA-Z0-9_]*)/g;
    while ((match = classPattern.exec(content)) !== null) {
      identifiers.push(match[1]!);
    }

    // Remove duplicates and filter out common words
    return [...new Set(identifiers)].filter(id => id.length > 2);
  }

  /**
   * Extract programming keywords and concepts
   */
  private extractProgrammingKeywords(content: string): string[] {
    const found: string[] = [];
    const lowercaseContent = content.toLowerCase();

    for (const keyword of this.programmingKeywords) {
      if (lowercaseContent.includes(keyword)) {
        found.push(keyword);
      }
    }

    return found;
  }

  /**
   * Extract software engineering concepts and patterns
   */
  private extractSoftwareEngineeringConcepts(content: string): string[] {
    const concepts: string[] = [];
    const lowercaseContent = content.toLowerCase();

    // Design patterns
    const patterns = [
      'singleton',
      'factory',
      'observer',
      'strategy',
      'decorator',
      'facade',
      'adapter',
      'proxy',
      'command',
      'state',
      'mvc',
      'mvp',
      'mvvm',
    ];

    // Architectural concepts
    const architecturalConcepts = [
      'microservice',
      'monolith',
      'api gateway',
      'event driven',
      'rest api',
      'graphql',
      'websocket',
      'pub/sub',
      'event sourcing',
    ];

    // Development practices
    const practices = [
      'tdd',
      'test driven development',
      'unit test',
      'integration test',
      'ci/cd',
      'devops',
      'containerization',
      'orchestration',
    ];

    const allConcepts = [...patterns, ...architecturalConcepts, ...practices];

    for (const concept of allConcepts) {
      if (lowercaseContent.includes(concept)) {
        concepts.push(concept);
      }
    }

    return concepts;
  }

  /**
   * Detect programming language from content
   */
  private detectProgrammingLanguage(content: string): string {
    const lowercaseContent = content.toLowerCase();

    // Language-specific patterns
    if (lowercaseContent.includes('import ') && lowercaseContent.includes('from '))
      return 'javascript';
    if (lowercaseContent.includes('def ') && lowercaseContent.includes(':')) return 'python';
    if (lowercaseContent.includes('public class') || lowercaseContent.includes('package '))
      return 'java';
    if (lowercaseContent.includes('func ') && lowercaseContent.includes('{}')) return 'go';
    if (lowercaseContent.includes('fn ') && lowercaseContent.includes('->')) return 'rust';
    if (lowercaseContent.includes('interface ') && lowercaseContent.includes('<'))
      return 'typescript';
    if (lowercaseContent.includes('#include') && lowercaseContent.includes('::')) return 'cpp';
    if (lowercaseContent.includes('<?php')) return 'php';

    return 'unknown';
  }

  /**
   * Detect code type (function, class, documentation, etc.)
   */
  private detectCodeType(content: string): CodeContext['codeType'] {
    const lowercaseContent = content.toLowerCase();

    if (
      lowercaseContent.includes('test') ||
      lowercaseContent.includes('describe') ||
      lowercaseContent.includes('it(')
    ) {
      return 'test';
    }
    if (lowercaseContent.includes('class ')) return 'class';
    if (lowercaseContent.includes('function') || lowercaseContent.includes('def '))
      return 'function';
    if (lowercaseContent.includes('module.exports') || lowercaseContent.includes('export'))
      return 'module';
    if (lowercaseContent.includes('# ') || lowercaseContent.includes('## ')) return 'documentation';
    if (lowercaseContent.includes('{') && lowercaseContent.includes(':')) return 'config';

    return 'function'; // default
  }

  /**
   * Detect framework from content and language
   */
  private detectFramework(content: string): string | undefined {
    const lowercaseContent = content.toLowerCase();

    for (const [framework, keywords] of this.frameworks) {
      const keywordMatches = keywords.filter(keyword => lowercaseContent.includes(keyword));
      if (keywordMatches.length >= 2) {
        return framework;
      }
    }

    return undefined;
  }

  /**
   * Infer software engineering domain from content
   */
  private inferDomain(content: string): string | undefined {
    const lowercaseContent = content.toLowerCase();

    // Frontend indicators
    if (
      lowercaseContent.includes('jsx') ||
      lowercaseContent.includes('dom') ||
      lowercaseContent.includes('component') ||
      lowercaseContent.includes('render')
    ) {
      return 'frontend';
    }

    // Backend indicators
    if (
      lowercaseContent.includes('api') ||
      lowercaseContent.includes('server') ||
      lowercaseContent.includes('database') ||
      lowercaseContent.includes('endpoint')
    ) {
      return 'backend';
    }

    // DevOps indicators
    if (
      lowercaseContent.includes('docker') ||
      lowercaseContent.includes('kubernetes') ||
      lowercaseContent.includes('deployment') ||
      lowercaseContent.includes('ci/cd')
    ) {
      return 'devops';
    }

    // Testing indicators
    if (
      lowercaseContent.includes('test') ||
      lowercaseContent.includes('mock') ||
      lowercaseContent.includes('assertion') ||
      lowercaseContent.includes('spec')
    ) {
      return 'testing';
    }

    // Data indicators
    if (
      lowercaseContent.includes('data') ||
      lowercaseContent.includes('analytics') ||
      lowercaseContent.includes('ml') ||
      lowercaseContent.includes('model')
    ) {
      return 'data';
    }

    return undefined;
  }

  /**
   * Calculate semantic similarity between code embeddings
   */
  calculateCodeSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error(`Embedding dimension mismatch: ${embedding1.length} vs ${embedding2.length}`);
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      const val1 = embedding1[i]!;
      const val2 = embedding2[i]!;

      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  async close(): Promise<void> {
    if (
      this.pipeline &&
      'dispose' in this.pipeline &&
      typeof this.pipeline.dispose === 'function'
    ) {
      await (this.pipeline as any).dispose();
    }
    this.pipeline = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    logger.info('Code Embedding Service closed');
  }
}

// Export singleton instance
export const codeEmbeddingService = new CodeEmbeddingService();
