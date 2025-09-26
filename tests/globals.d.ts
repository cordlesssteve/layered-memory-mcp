/**
 * Global type declarations for tests
 */

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidMemoryItem(): R;
      toBeValidMemoryResult(): R;
    }
  }
}

export {};