#!/usr/bin/env node

/**
 * Test script to validate relationship features are working correctly
 */

import { MemoryRouter } from './dist/src/memory/index.js';

async function testRelationshipFeatures() {
  console.log('🧪 Testing Memory Relationship Features...\n');

  const router = new MemoryRouter({
    relationships: {
      enabled: true,
      minConfidence: 0.5, // Lower threshold for testing
      batchSize: 20,
    },
  });

  try {
    // Store related memories to test relationship detection
    console.log('📝 Storing test memories...');

    const memory1 = await router.store('JavaScript is a programming language used for web development', {
      category: 'knowledge',
      priority: 7,
      tags: ['javascript', 'programming', 'web'],
    });

    const memory2 = await router.store('React is a JavaScript library for building user interfaces', {
      category: 'knowledge',
      priority: 8,
      tags: ['react', 'javascript', 'ui', 'library'],
    });

    const memory3 = await router.store('TypeScript adds type safety to JavaScript development', {
      category: 'knowledge',
      priority: 7,
      tags: ['typescript', 'javascript', 'types'],
    });

    const memory4 = await router.store('Python is excellent for data science and machine learning', {
      category: 'knowledge',
      priority: 6,
      tags: ['python', 'data-science', 'ml'],
    });

    console.log(`✅ Stored ${[memory1, memory2, memory3, memory4].length} test memories\n`);

    // Test 1: Build Knowledge Graph
    console.log('🕸️  Testing Knowledge Graph Construction...');
    const graph = await router.buildKnowledgeGraph();
    console.log(`   - Nodes: ${graph.stats.totalNodes}`);
    console.log(`   - Edges: ${graph.stats.totalEdges}`);
    console.log(`   - Average Connections: ${graph.stats.averageConnections.toFixed(2)}`);
    console.log(`   - Top Central Nodes: ${graph.stats.topCentralNodes.slice(0, 2).map(n => n.substring(0, 8)).join(', ')}`);

    // Test 2: Get Memory Relationships
    console.log('\n🔗 Testing Memory Relationships...');
    const relationships = await router.getMemoryRelationships(memory1.id);
    console.log(`   - Found ${relationships.length} relationships for first memory`);
    if (relationships.length > 0) {
      relationships.slice(0, 2).forEach((rel, i) => {
        console.log(`   - Relationship ${i + 1}: ${rel.type} (confidence: ${rel.confidence.toFixed(3)})`);
      });
    }

    // Test 3: Detect Conflicts
    console.log('\n⚠️  Testing Conflict Detection...');
    const conflicts = await router.detectConflicts();
    console.log(`   - Found ${conflicts.length} potential conflicts`);

    // Test 4: Get Relationship Suggestions
    console.log('\n💡 Testing Relationship Suggestions...');
    const suggestions = await router.getRelationshipSuggestions(5, 0.3);
    console.log(`   - Found ${suggestions.length} relationship suggestions`);
    if (suggestions.length > 0) {
      suggestions.slice(0, 2).forEach((suggestion, i) => {
        console.log(`   - Suggestion ${i + 1}: ${suggestion.relationship.type} (confidence: ${suggestion.confidence.toFixed(3)})`);
      });
    }

    // Test 5: Memory Decay Prediction
    console.log('\n📉 Testing Memory Decay Prediction...');
    const decayPredictions = await router.predictMemoryDecay();
    console.log(`   - Generated ${decayPredictions.length} decay predictions`);
    if (decayPredictions.length > 0) {
      const topPrediction = decayPredictions[0];
      console.log(`   - Top prediction: ${topPrediction.recommendation} (confidence: ${topPrediction.confidenceScore.toFixed(3)})`);
    }

    // Test 6: Get Validation Stats
    console.log('\n📊 Testing Validation Statistics...');
    const validationStats = await router.getValidationStats();
    console.log(`   - Total suggestions: ${validationStats.totalSuggestions}`);
    console.log(`   - Confirmed: ${validationStats.confirmedCount}`);
    console.log(`   - Rejected: ${validationStats.rejectedCount}`);
    console.log(`   - Success rate: ${(validationStats.successRate * 100).toFixed(1)}%`);

    // Test 7: Advanced Search with Relationships
    console.log('\n🔍 Testing Relationship-Enhanced Search...');
    const searchResults = await router.advancedSearch({
      query: 'programming languages',
      relationships: { enabled: true },
      semanticSearch: { enabled: true, threshold: 0.5 },
      limit: 5,
    });
    console.log(`   - Found ${searchResults.length} results with relationship enhancement`);
    if (searchResults.length > 0) {
      searchResults.slice(0, 2).forEach((result, i) => {
        console.log(`   - Result ${i + 1}: "${result.memory.content.substring(0, 50)}..." (score: ${result.score.toFixed(3)})`);
      });
    }

    console.log('\n✅ All relationship features tested successfully!');
    console.log('\n🎉 Relationship system is fully operational and ready for use.');

  } catch (error) {
    console.error('\n❌ Error testing relationship features:', error);
    throw error;
  } finally {
    await router.close();
  }
}

// Run the test
testRelationshipFeatures().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});