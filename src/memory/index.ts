/**
 * Memory system exports
 * Main entry point for the layered memory system
 */

// Core types and interfaces
export * from './types.js';

// Base layer implementation
export { BaseMemoryLayer } from './base-layer.js';

// Individual layer implementations
export { SessionLayer } from './layers/session-layer.js';
export { ProjectLayer } from './layers/project-layer.js';
export { GlobalLayer } from './layers/global-layer.js';
export { TemporalLayer } from './layers/temporal-layer.js';

// Router and coordination
export { MemoryRouter } from './router.js';

// Re-export temporal-specific types
export type { TemporalQuery, TemporalPattern } from './layers/temporal-layer.js';
