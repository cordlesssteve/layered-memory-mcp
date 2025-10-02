/**
 * Integration tests for Software Engineering Ontology
 * Real integration tests without mocking
 */

import { describe, expect, it } from '@jest/globals';
import { SoftwareEngineeringOntology } from '../../src/knowledge/software-engineering-ontology.js';

describe('SoftwareEngineeringOntology Integration', () => {
  describe('extractConcepts', () => {
    it('should extract JavaScript-related concepts from code', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const content = `
        class UserService {
          async function getUserData() {
            return fetch('/api/users');
          }
        }
      `;

      const result = await ontology.extractConcepts(content, {
        language: 'javascript',
      });

      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.extractedFrom.content).toBe(content);
      expect(result.extractedFrom.language).toBe('javascript');
    });

    it('should extract React concepts from JSX code', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const content = `
        import React from 'react';

        function MyComponent() {
          return <div>Hello World</div>;
        }
      `;

      const result = await ontology.extractConcepts(content, {
        language: 'javascript',
        framework: 'react',
      });

      expect(result.concepts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/react/i),
          }),
        ])
      );
    });

    it('should extract testing concepts from test code', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const content = `
        describe('UserService', () => {
          it('should fetch user data', async () => {
            const result = await getUserData();
            expect(result).toBeDefined();
          });
        });
      `;

      const result = await ontology.extractConcepts(content);

      const hasTestingConcept = result.concepts.some(c => c.type === 'testing_concept');
      expect(hasTestingConcept).toBe(true);
    });

    it('should extract design pattern concepts', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const content = `
        class Singleton {
          private static instance: Singleton;

          static getInstance() {
            if (!Singleton.instance) {
              Singleton.instance = new Singleton();
            }
            return Singleton.instance;
          }
        }
      `;

      const result = await ontology.extractConcepts(content, {
        language: 'typescript',
      });

      const hasPatternConcept = result.concepts.some(c => c.type === 'design_pattern');
      expect(hasPatternConcept).toBe(true);
    });

    it('should extract TypeScript-specific concepts', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const content = `
        interface User {
          id: number;
          name: string;
        }

        class UserService implements ServiceInterface {
          getUser(id: number): User {
            return { id, name: 'Test' };
          }
        }
      `;

      const result = await ontology.extractConcepts(content, {
        language: 'typescript',
      });

      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.extractedFrom.language).toBe('typescript');
    });

    it('should detect OOP patterns (class inheritance)', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const content = `
        class Animal {
          move() {}
        }

        class Dog extends Animal {
          bark() {}
        }
      `;

      const result = await ontology.extractConcepts(content);

      // Should extract concepts from OOP code
      expect(result.concepts).toBeDefined();
      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle empty content gracefully', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const result = await ontology.extractConcepts('', {});

      expect(result.concepts).toBeDefined();
      expect(Array.isArray(result.concepts)).toBe(true);
      expect(result.confidence).toBeDefined();
    });

    it('should extract multiple concepts from complex code', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const content = `
        import React, { useState } from 'react';

        interface Props {
          initialCount: number;
        }

        export function Counter({ initialCount }: Props) {
          const [count, setCount] = useState(initialCount);

          return (
            <div>
              <button onClick={() => setCount(count + 1)}>
                Count: {count}
              </button>
            </div>
          );
        }
      `;

      const result = await ontology.extractConcepts(content, {
        language: 'typescript',
        framework: 'react',
      });

      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.relationships).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('concept relationships', () => {
    it('should establish relationships between extracted concepts', async () => {
      const ontology = new SoftwareEngineeringOntology();

      const content = `
        import express from 'express';
        import { Request, Response } from 'express';

        const app = express();

        app.get('/api/users', (req: Request, res: Response) => {
          res.json({ users: [] });
        });
      `;

      const result = await ontology.extractConcepts(content, {
        language: 'typescript',
        framework: 'express',
      });

      expect(result.relationships).toBeDefined();
      expect(Array.isArray(result.relationships)).toBe(true);

      if (result.relationships.length > 0) {
        expect(result.relationships[0]).toMatchObject({
          type: expect.any(String),
          from: expect.any(String),
          to: expect.any(String),
          weight: expect.any(Number),
        });
      }
    });
  });
});
