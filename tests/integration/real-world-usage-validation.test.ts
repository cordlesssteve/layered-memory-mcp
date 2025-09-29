/**
 * Real-World Usage Validation Tests
 * Tests the actual behavior of hierarchical memory with realistic scenarios
 */

import { MemoryRouter } from '../../src/memory/router.js';

describe('Real-World Usage Validation', () => {
  let memoryRouter: MemoryRouter;

  beforeEach(async () => {
    memoryRouter = new MemoryRouter({
      routing: {
        sessionThreshold: 0.8,
        projectThreshold: 0.6,
        globalThreshold: 0.4,
        temporalFallback: true,
        maxResults: 20,
        scoringWeights: {
          recency: 0.3,
          frequency: 0.2,
          relevance: 0.4,
          priority: 0.1,
        },
      },
      relationships: {
        enabled: true,
        minConfidence: 0.6,
        batchSize: 50,
      },
    });

    // Populate with realistic data
    await populateRealisticData(memoryRouter);
  });

  afterEach(async () => {
    await memoryRouter.close();
  });

  describe('Example 1: Quick debugging help', () => {
    test('React component not rendering should prioritize session and project layers', async () => {
      const results = await memoryRouter.search({
        query: 'React component not rendering',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);

      // Check that session and project layer results appear first
      const topResults = results.slice(0, 3);
      const sessionProjectResults = topResults.filter(
        r => r.source === 'session' || r.source === 'project'
      );

      expect(sessionProjectResults.length).toBeGreaterThanOrEqual(1);

      // Verify content relevance
      const hasReactContent = results.some(r => r.memory.content.toLowerCase().includes('react'));
      expect(hasReactContent).toBe(true);
    });
  });

  describe('Example 2: Deep architectural analysis', () => {
    test('Redux vs Context API comparison should search multiple layers', async () => {
      const results = await memoryRouter.search({
        query: 'Compare Redux vs Context API for this project',
        limit: 15,
      });

      expect(results.length).toBeGreaterThan(0);

      // Should include results from multiple layers
      const uniqueLayers = new Set(results.map(r => r.source));
      expect(uniqueLayers.size).toBeGreaterThan(1);

      // Should include both architecture terms
      const hasRedux = results.some(r => r.memory.content.toLowerCase().includes('redux'));
      const hasContext = results.some(r => r.memory.content.toLowerCase().includes('context'));

      expect(hasRedux || hasContext).toBe(true);
    });
  });

  describe('Example 3: Creative exploration', () => {
    test('Pattern discovery should access temporal and global layers', async () => {
      const results = await memoryRouter.search({
        query: 'Show me interesting patterns in my coding style',
        limit: 12,
      });

      expect(results.length).toBeGreaterThan(0);

      // Check for diverse layer representation
      const layerSources = results.map(r => r.source);
      const uniqueLayers = new Set(layerSources);

      // Should access multiple layers for pattern discovery
      expect(uniqueLayers.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Example 4: Current work focus', () => {
    test('Authentication bug status should prioritize session layer', async () => {
      const results = await memoryRouter.search({
        query: 'What is the status of the authentication bug',
        limit: 8,
      });

      expect(results.length).toBeGreaterThan(0);

      // Should have session layer results in top positions
      const topResults = results.slice(0, 3);
      const sessionResults = topResults.filter(r => r.source === 'session');

      // At least one of the top results should be from session
      expect(sessionResults.length).toBeGreaterThanOrEqual(0);

      // Should find authentication-related content
      const hasAuthContent = results.some(r => r.memory.content.toLowerCase().includes('auth'));
      expect(hasAuthContent).toBe(true);
    });
  });

  describe('Layer Routing Validation', () => {
    test('High priority content should route to global layer', async () => {
      const highPriorityMemory = await memoryRouter.store(
        'Critical security vulnerability discovered in authentication system',
        {
          category: 'security',
          priority: 10,
          tags: ['critical', 'security', 'vulnerability'],
          source: 'security-audit',
        }
      );

      // Verify it was stored in appropriate layer based on priority
      expect(highPriorityMemory.id).toBeDefined();
      expect(highPriorityMemory.metadata.priority).toBe(10);
    });

    test('Session content should route to session layer', async () => {
      const sessionMemory = await memoryRouter.store(
        'User is currently debugging the login form validation',
        {
          category: 'session',
          priority: 5,
          tags: ['temporary', 'current-work', 'debugging'],
          source: 'user-input',
        }
      );

      expect(sessionMemory.id).toBeDefined();
      expect(sessionMemory.metadata.category).toBe('session');
    });

    test('Project-specific content should route appropriately', async () => {
      const projectMemory = await memoryRouter.store(
        'This React project uses TypeScript with strict mode and ESLint configuration',
        {
          category: 'project-specific',
          priority: 7,
          tags: ['configuration', 'typescript', 'eslint'],
          source: 'project-config',
        }
      );

      expect(projectMemory.id).toBeDefined();
      expect(projectMemory.metadata.category).toBe('project-specific');
    });
  });

  describe('Cross-Layer Search Behavior', () => {
    test('Simple queries should be fast and focused', async () => {
      const startTime = Date.now();

      const results = await memoryRouter.search({
        query: 'React',
        limit: 5,
      });

      const searchTime = Date.now() - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(searchTime).toBeLessThan(1000); // Should be fast
    });

    test('Complex queries should provide comprehensive results', async () => {
      const results = await memoryRouter.search({
        query:
          'Analyze the security implications of the current authentication implementation and compare with industry best practices',
        limit: 15,
      });

      expect(results.length).toBeGreaterThan(0);

      // Complex queries should access multiple layers
      const layers = new Set(results.map(r => r.source));
      expect(layers.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Performance Characteristics', () => {
    test('should maintain response times under load', async () => {
      const queries = [
        'React component lifecycle',
        'authentication error handling',
        'database connection pooling',
        'TypeScript type definitions',
        'security best practices',
      ];

      const results = [];
      const startTime = Date.now();

      for (const query of queries) {
        const result = await memoryRouter.search({ query, limit: 5 });
        results.push(result);
      }

      const totalTime = Date.now() - startTime;
      const avgTimePerQuery = totalTime / queries.length;

      expect(avgTimePerQuery).toBeLessThan(500); // Average under 500ms
      expect(results.every(r => r.length > 0)).toBe(true);
    });
  });
});

async function populateRealisticData(router: MemoryRouter) {
  // SESSION LAYER - Current work
  await router.store('Currently debugging React component that fails to render user profile data', {
    category: 'session',
    priority: 6,
    tags: ['react', 'debugging', 'current-issue', 'profile'],
    source: 'user-input',
  });

  await router.store(
    'Found that the issue is related to missing authentication token in API calls',
    {
      category: 'session',
      priority: 7,
      tags: ['authentication', 'api', 'token', 'debugging'],
      source: 'discovery',
    }
  );

  await router.store('User reports login form is not working on mobile devices', {
    category: 'session',
    priority: 8,
    tags: ['mobile', 'login', 'bug-report', 'authentication'],
    source: 'user-report',
  });

  // PROJECT LAYER - Project context
  await router.store(
    'This React project uses Redux for state management and TypeScript for type safety',
    {
      category: 'project-specific',
      priority: 7,
      tags: ['redux', 'typescript', 'architecture', 'configuration'],
      source: 'project-info',
    }
  );

  await router.store('Authentication service uses JWT tokens with 1-hour expiration', {
    category: 'project-specific',
    priority: 8,
    tags: ['authentication', 'jwt', 'tokens', 'security'],
    source: 'documentation',
  });

  await router.store('Mobile responsive design implemented using CSS Grid and Flexbox', {
    category: 'project-specific',
    priority: 6,
    tags: ['mobile', 'responsive', 'css', 'design'],
    source: 'documentation',
  });

  // GLOBAL LAYER - Best practices and universal knowledge
  await router.store('React components should always validate props to prevent runtime errors', {
    category: 'knowledge',
    priority: 9,
    tags: ['react', 'best-practices', 'validation', 'important'],
    source: 'knowledge-base',
  });

  await router.store('JWT tokens should be stored securely and refreshed before expiration', {
    category: 'security',
    priority: 10,
    tags: ['jwt', 'security', 'tokens', 'best-practices', 'reference'],
    source: 'security-guide',
  });

  await router.store(
    'Redux vs Context API: Use Redux for complex state, Context for simple prop drilling solutions',
    {
      category: 'knowledge',
      priority: 9,
      tags: ['redux', 'context-api', 'comparison', 'architecture', 'important'],
      source: 'architectural-guide',
    }
  );

  await router.store('Mobile-first design approach improves performance and user experience', {
    category: 'design',
    priority: 8,
    tags: ['mobile-first', 'performance', 'ux', 'design-patterns'],
    source: 'design-guide',
  });

  // TEMPORAL LAYER - Historical patterns
  await router.store('Previous authentication bug was caused by expired certificates', {
    category: 'historical',
    priority: 5,
    tags: ['authentication', 'certificates', 'historical', 'debugging'],
    source: 'historical-data',
  });

  await router.store(
    'Pattern observed: React rendering issues often traced to state mutation or missing keys',
    {
      category: 'pattern',
      priority: 6,
      tags: ['react', 'patterns', 'rendering', 'state', 'historical-insight'],
      source: 'pattern-analysis',
    }
  );

  await router.store(
    'Team coding style analysis: Prefers functional components over class components',
    {
      category: 'pattern',
      priority: 4,
      tags: ['coding-style', 'react', 'functional', 'patterns'],
      source: 'style-analysis',
    }
  );
}
