/**
 * Simplified Secure Memory Router for MCP Integration
 * A working implementation that adds basic security to the existing router
 */

import { MemoryRouter } from './router.js';
import { SimpleAuthService, type SimpleAuthContext } from '../security/simple-auth.js';
import {
  SecurityMiddleware,
  createSecurityMiddleware,
  type SecurityContext,
} from '../security/security-middleware.js';
import { setupEnvironment } from '../config/environment.js';
import { createLogger } from '../utils/logger.js';
import type {
  MemoryItem,
  MemoryRouterInterface,
  MemoryRouterConfig,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryMetadata,
  MemoryLayer,
} from './types.js';

const logger = createLogger('simple-secure-router');

export interface SecureMemoryMetadata extends MemoryMetadata {
  tenantId: string;
  createdBy: string;
}

export class SimpleSecureRouter implements MemoryRouterInterface {
  private router: MemoryRouter;
  private authService: SimpleAuthService;
  private securityMiddleware: SecurityMiddleware;

  constructor(config: Partial<MemoryRouterConfig> = {}) {
    this.router = new MemoryRouter(config);
    this.authService = new SimpleAuthService();

    // Initialize security middleware with environment configuration
    const env = setupEnvironment();
    this.securityMiddleware = createSecurityMiddleware(env);

    logger.info('Simple secure router initialized');
  }

  getAuthService(): SimpleAuthService {
    return this.authService;
  }

  async store(
    content: string,
    metadata: MemoryMetadata,
    context?: SimpleAuthContext
  ): Promise<MemoryItem> {
    // Create security context for middleware
    const securityContext: SecurityContext = {
      tenantId: context?.tenantId,
      userId: context?.userId,
      roles: context?.roles,
      sessionId: context?.sessionId,
    };

    // Security middleware checks
    const securityResult = await this.securityMiddleware.checkRequest(
      'memory_store',
      securityContext,
      { content, metadata }
    );

    if (!securityResult.allowed) {
      logger.warn('Memory store request blocked by security middleware', {
        reason: securityResult.error?.code,
        userId: context?.userId,
        tenantId: context?.tenantId,
      });

      const error = new Error(securityResult.error?.message || 'Request blocked by security');
      (error as any).code = securityResult.error?.code;
      (error as any).statusCode = securityResult.statusCode;
      throw error;
    }

    // Add security metadata if context provided
    const secureMetadata: SecureMemoryMetadata = {
      ...metadata,
      tenantId: context?.tenantId || 'default-tenant',
      createdBy: context?.userId || 'system',
    };

    const item = await this.router.store(content, secureMetadata);

    logger.debug('Secure memory stored', {
      id: item.id,
      tenantId: secureMetadata.tenantId,
      userId: secureMetadata.createdBy,
    });

    return item;
  }

  async search(query: MemoryQuery, context?: SimpleAuthContext): Promise<MemorySearchResult[]> {
    // Create security context for middleware
    const securityContext: SecurityContext = {
      tenantId: context?.tenantId,
      userId: context?.userId,
      roles: context?.roles,
      sessionId: context?.sessionId,
    };

    // Security middleware checks
    const securityResult = await this.securityMiddleware.checkRequest(
      'memory_search',
      securityContext,
      query
    );

    if (!securityResult.allowed) {
      logger.warn('Memory search request blocked by security middleware', {
        reason: securityResult.error?.code,
        userId: context?.userId,
        tenantId: context?.tenantId,
      });

      const error = new Error(securityResult.error?.message || 'Request blocked by security');
      (error as any).code = securityResult.error?.code;
      (error as any).statusCode = securityResult.statusCode;
      throw error;
    }

    const results = await this.router.search(query);

    // Filter results by tenant if context provided
    if (context) {
      return results.filter(result => {
        const metadata = result.memory.metadata as SecureMemoryMetadata;
        return !metadata.tenantId || metadata.tenantId === context.tenantId;
      });
    }

    return results;
  }

  // Delegate all other methods to the underlying router
  async retrieve(id: string): Promise<MemoryItem | null> {
    return this.router.retrieve(id);
  }

  async update(
    id: string,
    updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>
  ): Promise<MemoryItem | null> {
    return this.router.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    return this.router.delete(id);
  }

  getLayer(layer: MemoryLayer) {
    return this.router.getLayer(layer);
  }

  async getAllStats(): Promise<Record<MemoryLayer, MemoryStats>> {
    return this.router.getAllStats();
  }

  async optimize(): Promise<void> {
    return this.router.optimize();
  }

  async cleanup(): Promise<Record<MemoryLayer, number>> {
    return this.router.cleanup();
  }

  async migrate(fromLayer: MemoryLayer, toLayer: MemoryLayer, criteria: any): Promise<number> {
    return this.router.migrate(fromLayer, toLayer, criteria);
  }

  async analyze(query: string) {
    return this.router.analyze(query);
  }

  addEventListener(handler: any): void {
    return this.router.addEventListener(handler);
  }

  removeEventListener(handler: any): void {
    return this.router.removeEventListener(handler);
  }

  async close(): Promise<void> {
    return this.router.close();
  }

  // Advanced search methods
  async advancedSearch(query: any) {
    return this.router.advancedSearch(query);
  }

  async semanticSearch(query: string, options?: any) {
    return this.router.semanticSearch(query, options);
  }

  async temporalSearch(query: string, timeRange?: any) {
    return this.router.temporalSearch(query, timeRange);
  }

  async relationshipSearch(query: string, relationshipTypes?: string[]) {
    return this.router.relationshipSearch(query, relationshipTypes);
  }

  // Relationship methods
  async buildKnowledgeGraph() {
    return this.router.buildKnowledgeGraph();
  }

  async getMemoryRelationships(memoryId: string) {
    return this.router.getMemoryRelationships(memoryId);
  }

  async detectConflicts() {
    return this.router.detectConflicts();
  }

  async getMemoryVersions(memoryId: string) {
    return this.router.getMemoryVersions(memoryId);
  }

  async summarizeCluster(memoryIds: string[]) {
    return this.router.summarizeCluster(memoryIds);
  }

  async getRelationshipSuggestions(limit?: number, minConfidence?: number) {
    return this.router.getRelationshipSuggestions(limit, minConfidence);
  }

  async validateRelationship(suggestionId: string, options: any) {
    return this.router.validateRelationship(suggestionId, options);
  }

  async getValidationStats() {
    return this.router.getValidationStats();
  }

  async getAlgorithmInsights() {
    return this.router.getAlgorithmInsights();
  }

  async predictMemoryDecay() {
    return this.router.predictMemoryDecay();
  }

  async getUrgentMemories() {
    return this.router.getUrgentMemories();
  }

  async getPromotionCandidates() {
    return this.router.getPromotionCandidates();
  }

  async getArchivalCandidates() {
    return this.router.getArchivalCandidates();
  }

  async getDecayModelInsights() {
    return this.router.getDecayModelInsights();
  }

  async storeWithRelationships(content: string, metadata: MemoryMetadata) {
    return this.router.storeWithRelationships(content, metadata);
  }

  getRelationshipEngine() {
    return this.router.getRelationshipEngine();
  }
}
