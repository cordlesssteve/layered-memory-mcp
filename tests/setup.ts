/**
 * Global test setup configuration
 * This file is run before all tests
 */

// Global test timeout
jest.setTimeout(30000);

// Mock environment variables
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';
process.env['DATABASE_URL'] = 'sqlite::memory:';
process.env['REDIS_URL'] = 'redis://localhost:6379/15'; // Use test database
process.env['NEO4J_URI'] = 'bolt://localhost:7687';
process.env['NEO4J_USER'] = 'neo4j';
process.env['NEO4J_PASSWORD'] = 'test';
process.env['CHROMADB_HOST'] = 'localhost';
process.env['CHROMADB_PORT'] = '8000';

// Global test utilities (types defined in globals.d.ts)

// Custom Jest matchers
expect.extend({
  toBeValidMemoryItem(received: unknown) {
    const pass = Boolean(
      received &&
      typeof received === 'object' &&
      'id' in received &&
      'content' in received &&
      'createdAt' in received
    );

    return {
      message: () =>
        pass
          ? `Expected ${JSON.stringify(received)} not to be a valid memory item`
          : `Expected ${JSON.stringify(received)} to be a valid memory item`,
      pass,
    };
  },

  toBeValidMemoryResult(received: unknown) {
    const pass = Boolean(
      received &&
      typeof received === 'object' &&
      'memory' in received &&
      'score' in received &&
      'source' in received
    );

    return {
      message: () =>
        pass
          ? `Expected ${JSON.stringify(received)} not to be a valid memory result`
          : `Expected ${JSON.stringify(received)} to be a valid memory result`,
      pass,
    };
  },
});

// Global test cleanup
afterEach(() => {
  // Clear any module mocks
  jest.clearAllMocks();
});

beforeEach(() => {
  // Reset environment variables if needed
  process.env['NODE_ENV'] = 'test';
});

// Suppress console output during tests unless LOG_LEVEL is set
// Note: This is disabled for logger tests to work properly
// if (!process.env['LOG_LEVEL'] || process.env['LOG_LEVEL'] === 'silent') {
//   global.console = {
//     ...console,
//     log: jest.fn(),
//     debug: jest.fn(),
//     info: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn(),
//   };
// }