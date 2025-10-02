/**
 * Unit tests for Semantic Enrichment Pipeline
 * Testing content enrichment, NER, code analysis, and categorization
 */

import { describe, expect, it } from '@jest/globals';
import { SemanticEnrichmentPipeline } from '../../src/analysis/semantic-enrichment-pipeline.js';
import type { MemoryItem } from '../../src/memory/types.js';

describe('SemanticEnrichmentPipeline', () => {
  let pipeline: SemanticEnrichmentPipeline;

  beforeEach(() => {
    pipeline = new SemanticEnrichmentPipeline();
  });

  describe('enrichContent', () => {
    it('should enrich basic text content', async () => {
      const result = await pipeline.enrichContent('This is a test content');

      expect(result).toBeDefined();
      expect(result.originalContent).toBe('This is a test content');
      expect(result.enrichedMetadata).toBeDefined();
      expect(result.extractedEntities).toBeDefined();
      expect(result.concepts).toBeDefined();
      expect(result.categories).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should enrich content with code context', async () => {
      const result = await pipeline.enrichContent('function test() { return true; }', {
        language: 'javascript',
        framework: 'react',
        domain: 'frontend',
      });

      expect(result.enrichedMetadata.language).toBe('javascript');
      expect(result.enrichedMetadata.framework).toBe('react');
      expect(result.enrichedMetadata.domain).toBe('frontend');
    });

    it('should detect and analyze code content', async () => {
      const codeContent = `
        function calculateSum(a, b) {
          return a + b;
        }
      `;
      const result = await pipeline.enrichContent(codeContent);

      expect(result.codeAnalysis).toBeDefined();
      expect(result.codeAnalysis?.linesOfCode).toBeGreaterThan(0);
      expect(result.codeAnalysis?.functionCount).toBeGreaterThan(0);
    });

    it('should not perform code analysis on non-code content', async () => {
      const result = await pipeline.enrichContent('This is just plain text without code');

      expect(result.codeAnalysis).toBeUndefined();
    });

    it('should extract semantic tags from categories', async () => {
      const result = await pipeline.enrichContent('test function implementation');

      expect(result.enrichedMetadata.semanticTags).toBeDefined();
      expect(result.enrichedMetadata.semanticTags.length).toBeGreaterThan(0);
    });
  });

  describe('extractNamedEntities', () => {
    it('should extract React technology entity', async () => {
      const entities = await pipeline.extractNamedEntities('We are using React for our frontend');

      const reactEntity = entities.find(e => e.text === 'React');
      expect(reactEntity).toBeDefined();
      expect(reactEntity?.type).toBe('technology');
      expect(reactEntity?.confidence).toBeGreaterThan(0);
      expect(reactEntity?.start).toBeGreaterThanOrEqual(0);
      expect(reactEntity?.end).toBeGreaterThan(reactEntity?.start!);
    });

    it('should extract multiple technology entities', async () => {
      const entities = await pipeline.extractNamedEntities(
        'Our stack includes React, TypeScript, and MongoDB'
      );

      expect(entities.length).toBeGreaterThanOrEqual(3);
      const technologies = entities.filter(e => e.type === 'technology');
      expect(technologies.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract language entities', async () => {
      const entities = await pipeline.extractNamedEntities('JavaScript and Python');

      expect(entities.length).toBeGreaterThanOrEqual(2);
      expect(entities.some(e => e.text === 'JavaScript')).toBe(true);
      expect(entities.some(e => e.text === 'Python')).toBe(true);
    });

    it('should extract database entities', async () => {
      const entities = await pipeline.extractNamedEntities(
        'We use PostgreSQL and Redis for data storage'
      );

      expect(entities.some(e => e.text === 'PostgreSQL')).toBe(true);
      expect(entities.some(e => e.text === 'Redis')).toBe(true);
    });

    it('should include context for each entity', async () => {
      const entities = await pipeline.extractNamedEntities(
        'The React framework is great for building UIs'
      );

      const reactEntity = entities.find(e => e.text === 'React');
      expect(reactEntity?.context).toBeDefined();
      expect(reactEntity?.context).toContain('React');
    });

    it('should handle content with no entities', async () => {
      const entities = await pipeline.extractNamedEntities(
        'This is plain text without any technical entities'
      );

      expect(Array.isArray(entities)).toBe(true);
    });

    it('should handle case-insensitive matching', async () => {
      const entities = await pipeline.extractNamedEntities('react, REACT, React');

      const reactEntities = entities.filter(e => e.text.toLowerCase() === 'react');
      expect(reactEntities.length).toBeGreaterThan(0);
    });
  });

  describe('categorization', () => {
    it('should categorize test-related content', async () => {
      const result = await pipeline.enrichContent('This is a test spec for our unit tests');

      expect(result.categories.some(c => c.category === 'testing')).toBe(true);
      const testingCategory = result.categories.find(c => c.category === 'testing');
      expect(testingCategory?.confidence).toBeGreaterThan(0);
      expect(testingCategory?.suggestedTags).toContain('testing');
    });

    it('should categorize function implementation content', async () => {
      const result = await pipeline.enrichContent('function implementation for user service');

      const implCategory = result.categories.find(c => c.category === 'implementation');
      expect(implCategory).toBeDefined();
      expect(implCategory?.subcategory).toBe('function');
      expect(implCategory?.reasoning.length).toBeGreaterThan(0);
    });

    it('should categorize class/interface content', async () => {
      const result = await pipeline.enrichContent(
        'class UserService implements IService interface'
      );

      const implCategory = result.categories.find(c => c.category === 'implementation');
      expect(implCategory).toBeDefined();
      expect(implCategory?.subcategory).toBe('structure');
      expect(implCategory?.suggestedTags).toContain('class');
      expect(implCategory?.suggestedTags).toContain('interface');
    });

    it('should return multiple categories when applicable', async () => {
      const result = await pipeline.enrichContent(
        'test class implementation with function methods'
      );

      expect(result.categories.length).toBeGreaterThan(0);
    });

    it('should handle content with no clear category', async () => {
      const result = await pipeline.enrichContent(
        'Random text without any specific category markers'
      );

      expect(Array.isArray(result.categories)).toBe(true);
    });
  });

  describe('code content detection', () => {
    it('should detect function definitions', async () => {
      const content = 'function myFunction() { return true; }';
      const result = await pipeline.enrichContent(content);

      expect(result.codeAnalysis).toBeDefined();
    });

    it('should detect class definitions', async () => {
      const content = 'class MyClass { constructor() {} }';
      const result = await pipeline.enrichContent(content);

      expect(result.codeAnalysis).toBeDefined();
    });

    it('should detect import statements', async () => {
      const content = 'import React from "react"';
      const result = await pipeline.enrichContent(content);

      expect(result.codeAnalysis).toBeDefined();
    });

    it('should detect const declarations', async () => {
      const content = 'const myVar = 10;';
      const result = await pipeline.enrichContent(content);

      expect(result.codeAnalysis).toBeDefined();
    });

    it('should detect Python function definitions', async () => {
      const content = 'def my_function():\n    return True';
      const result = await pipeline.enrichContent(content);

      expect(result.codeAnalysis).toBeDefined();
    });

    it('should detect Java class definitions', async () => {
      const content = 'public class MyClass { }';
      const result = await pipeline.enrichContent(content);

      expect(result.codeAnalysis).toBeDefined();
    });

    it('should not detect code in plain text', async () => {
      const content = 'This is just normal text explaining something';
      const result = await pipeline.enrichContent(content);

      expect(result.codeAnalysis).toBeUndefined();
    });
  });

  describe('code analysis', () => {
    it('should count lines of code excluding comments', async () => {
      const code = `
        // This is a comment
        function test() {
          // Another comment
          return true;
        }
      `;
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.linesOfCode).toBeGreaterThan(0);
      expect(result.codeAnalysis?.linesOfComments).toBeGreaterThan(0);
    });

    it('should calculate cyclomatic complexity', async () => {
      const code = `
        function complex() {
          if (condition1) {
            while (condition2) {
              for (let i = 0; i < 10; i++) {
                if (condition3) {
                  return true;
                }
              }
            }
          }
          return false;
        }
      `;
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('should calculate nesting level', async () => {
      const code = `
        function nested() {
          {
            {
              {
                return true;
              }
            }
          }
        }
      `;
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.nestingLevel).toBeGreaterThan(0);
    });

    it('should calculate maintainability index', async () => {
      const code = 'function simple() { return true; }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.maintainabilityIndex).toBeGreaterThanOrEqual(0);
      expect(result.codeAnalysis?.maintainabilityIndex).toBeLessThanOrEqual(100);
    });

    it('should count functions', async () => {
      const code = `
        function func1() {}
        function func2() {}
        def python_func():
          pass
      `;
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.functionCount).toBeGreaterThanOrEqual(2);
    });

    it('should count classes', async () => {
      const code = `
        class Class1 {}
        class Class2 {}
      `;
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.classCount).toBe(2);
    });

    it('should count method calls', async () => {
      const code = `
        obj.method1();
        obj.method2();
        arr.map(x => x.transform());
      `;
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.methodCount).toBeGreaterThan(0);
    });

    it('should count variables', async () => {
      const code = `
        const var1 = 10;
        let var2 = 20;
        var var3 = 30;
      `;
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.variableCount).toBe(3);
    });

    it('should provide testability score', async () => {
      const code = 'function testable() { return true; }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.testabilityScore).toBeDefined();
      expect(result.codeAnalysis?.testabilityScore).toBeGreaterThan(0);
    });

    it('should have empty code smells for Sprint SE-1', async () => {
      const code = 'function test() { return true; }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.codeSmells).toBeDefined();
      expect(Array.isArray(result.codeAnalysis?.codeSmells)).toBe(true);
    });

    it('should have empty duplicate blocks for Sprint SE-1', async () => {
      const code = 'function test() { return true; }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.duplicateBlocks).toBeDefined();
      expect(Array.isArray(result.codeAnalysis?.duplicateBlocks)).toBe(true);
    });
  });

  describe('complexity calculations', () => {
    it('should calculate complexity for if statements', async () => {
      const code = 'if (a) {} if (b) {} if (c) {}';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('should calculate complexity for loops', async () => {
      const code = 'while (a) {} for (;;) {}';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('should calculate complexity for switch statements', async () => {
      const code = 'switch (x) { case 1: break; case 2: break; }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('should calculate complexity for try-catch', async () => {
      const code = 'try { } catch (e) { }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('should start with base complexity of 1', async () => {
      const code = 'function simple() { return 1; }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    });

    it('should handle deeply nested braces', async () => {
      const code = '{ { { { } } } }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.nestingLevel).toBe(4);
    });

    it('should handle unbalanced braces gracefully', async () => {
      const code = '{ { { } }';
      const result = await pipeline.enrichContent(code);

      expect(result.codeAnalysis?.nestingLevel).toBeGreaterThan(0);
    });
  });

  describe('enrichMemoryItem', () => {
    it('should enrich memory item with analysis', async () => {
      const memoryItem: MemoryItem = {
        id: 'test-id',
        content: 'function test() { return true; }',
        metadata: {
          tags: ['test'],
          category: 'code',
          priority: 5,
          source: 'test',
          language: 'javascript',
          framework: 'none',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        accessCount: 0,
        lastAccessedAt: new Date(),
      };

      const enriched = await pipeline.enrichMemoryItem(memoryItem);

      expect(enriched.metadata).toBeDefined();
      expect(enriched.metadata['enrichmentConfidence']).toBeDefined();
      expect(enriched.metadata['enrichmentTimestamp']).toBeDefined();
      expect(enriched.metadata['language']).toBe('javascript');
    });

    it('should preserve original memory item properties', async () => {
      const memoryItem: MemoryItem = {
        id: 'test-id',
        content: 'test content',
        metadata: {
          tags: ['test'],
          category: 'test',
          priority: 5,
          source: 'test',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        accessCount: 0,
        lastAccessedAt: new Date(),
      };

      const enriched = await pipeline.enrichMemoryItem(memoryItem);

      expect(enriched.id).toBe(memoryItem.id);
      expect(enriched.content).toBe(memoryItem.content);
      expect(enriched.metadata.tags).toEqual(memoryItem.metadata.tags);
    });

    it('should add enrichment metadata to existing metadata', async () => {
      const memoryItem: MemoryItem = {
        id: 'test-id',
        content: 'React component code',
        metadata: {
          tags: ['component'],
          category: 'frontend',
          priority: 7,
          source: 'manual',
          framework: 'react',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        accessCount: 0,
        lastAccessedAt: new Date(),
      };

      const enriched = await pipeline.enrichMemoryItem(memoryItem);

      expect(enriched.metadata['framework']).toBe('react');
      expect(enriched.metadata['enrichmentConfidence']).toBeGreaterThan(0);
      expect(enriched.metadata['semanticTags']).toBeDefined();
    });
  });
});
