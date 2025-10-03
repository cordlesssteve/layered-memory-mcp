/**
 * Hierarchical Memory & Layer Mixing Demonstration
 * Shows how the system elegantly handles different types of queries with sophisticated layer mixing
 */

import { MemoryRouter } from '../src/memory/router.js';
import { EnhancedLayerMixer } from '../src/memory/enhanced-layer-mixer.js';
import type { MemoryQuery, SearchContext } from '../src/memory/types.js';

/**
 * Demonstration of hierarchical memory and elegant layer mixing
 */
async function demonstrateHierarchicalMemory() {
  console.log('🧠 Hierarchical Memory & Layer Mixing Demonstration\n');

  // Initialize the memory router with all layers
  const memoryRouter = new MemoryRouter({
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

  // Initialize enhanced layer mixer
  const layerMixer = new EnhancedLayerMixer();

  console.log('📊 Available Layer Mixing Strategies:');
  layerMixer.getAvailableStrategies().forEach((strategy, index) => {
    console.log(`   ${index + 1}. ${strategy.name}: ${strategy.description}`);
  });
  console.log('');

  // 1. Populate different layers with sample data
  await populateLayers(memoryRouter);

  // 2. Demonstrate different query scenarios
  await demonstrateQueryScenarios(memoryRouter, layerMixer);

  console.log('✅ Demonstration completed!\n');
}

async function populateLayers(router: MemoryRouter) {
  console.log('📝 Populating memory layers with sample data...\n');

  // SESSION LAYER - Current conversation context
  await router.store('The user is working on debugging a React component that won\'t render properly', {
    category: 'session',
    priority: 6,
    tags: ['react', 'debugging', 'current-issue'],
    source: 'user-input',
  });

  await router.store('We identified that the missing key prop is causing the rendering issue', {
    category: 'session',
    priority: 7,
    tags: ['react', 'debugging', 'solution'],
    source: 'system',
  });

  // PROJECT LAYER - Project-specific knowledge
  await router.store('This React project uses TypeScript with strict mode enabled', {
    category: 'project-specific',
    priority: 7,
    tags: ['react', 'typescript', 'configuration'],
    source: 'project-info',
  });

  await router.store('The project architecture follows a component-based design with Redux for state management', {
    category: 'project-specific',
    priority: 8,
    tags: ['architecture', 'redux', 'design-patterns'],
    source: 'documentation',
  });

  // GLOBAL LAYER - Universal knowledge and best practices
  await router.store('React keys help maintain component identity during re-renders for optimal performance', {
    category: 'knowledge',
    priority: 9,
    tags: ['react', 'performance', 'best-practices', 'important'],
    source: 'knowledge-base',
  });

  await router.store('TypeScript strict mode catches potential runtime errors at compile time', {
    category: 'knowledge',
    priority: 9,
    tags: ['typescript', 'error-prevention', 'compilation', 'reference'],
    source: 'knowledge-base',
  });

  // TEMPORAL LAYER - Historical patterns and archived data
  await router.store('Last month we solved a similar React rendering issue by checking component lifecycle methods', {
    category: 'historical',
    priority: 5,
    tags: ['react', 'rendering', 'lifecycle', 'past-solution'],
    source: 'historical-data',
  });

  await router.store('Historical pattern: React debugging issues often trace back to prop validation or state mutations', {
    category: 'pattern',
    priority: 6,
    tags: ['react', 'debugging', 'patterns', 'historical-insight'],
    source: 'pattern-analysis',
  });

  console.log('   ✅ Sample data populated across all layers\n');
}

async function demonstrateQueryScenarios(router: MemoryRouter, mixer: EnhancedLayerMixer) {
  console.log('🔍 Demonstrating different query scenarios and layer mixing strategies:\n');

  const searchContext: SearchContext = {
    sessionHistory: ['react debugging', 'component rendering', 'typescript errors'],
    activeProject: 'react-dashboard',
    timeContext: {
      currentSession: new Date(),
      sessionDuration: 3600000, // 1 hour
      recentQueries: ['react component', 'debugging help', 'typescript strict'],
    },
  };

  // Scenario 1: Quick contextual query
  console.log('🎯 Scenario 1: Quick Contextual Query');
  console.log('   Query: "React key prop"');
  console.log('   Expected: Performance strategy, focus on session + project layers');

  mixer.setStrategy('performance');
  const quickResults = await router.search({
    query: 'React key prop',
    limit: 5,
  });

  console.log(`   Results: ${quickResults.length} items found`);
  quickResults.forEach((result, index) => {
    console.log(`     ${index + 1}. [${result.source}] ${result.memory.content.substring(0, 60)}...`);
    console.log(`        Score: ${result.score.toFixed(3)}, Tags: ${result.memory.metadata.tags.join(', ')}`);
  });
  console.log('');

  // Scenario 2: Exploratory discovery query
  console.log('🔎 Scenario 2: Exploratory Discovery Query');
  console.log('   Query: "Find patterns in React debugging approaches"');
  console.log('   Expected: Discovery strategy, search all layers for patterns');

  mixer.setStrategy('discovery');
  const discoveryResults = await router.search({
    query: 'Find patterns in React debugging approaches',
    limit: 8,
  });

  console.log(`   Results: ${discoveryResults.length} items found`);
  discoveryResults.forEach((result, index) => {
    console.log(`     ${index + 1}. [${result.source}] ${result.memory.content.substring(0, 60)}...`);
    console.log(`        Score: ${result.score.toFixed(3)}, Priority: ${result.memory.metadata.priority}`);
  });
  console.log('');

  // Scenario 3: Comprehensive analytical query
  console.log('📊 Scenario 3: Comprehensive Analytical Query');
  console.log('   Query: "Analyze the relationship between TypeScript strict mode and React component debugging"');
  console.log('   Expected: Comprehensive strategy, search all layers with balanced results');

  mixer.setStrategy('comprehensive');
  const analyticalResults = await router.search({
    query: 'Analyze the relationship between TypeScript strict mode and React component debugging',
    limit: 10,
  });

  console.log(`   Results: ${analyticalResults.length} items found`);
  analyticalResults.forEach((result, index) => {
    console.log(`     ${index + 1}. [${result.source}] ${result.memory.content.substring(0, 60)}...`);
    console.log(`        Score: ${result.score.toFixed(3)}, Category: ${result.memory.metadata.category}`);
  });
  console.log('');

  // Scenario 4: Context-heavy current work query
  console.log('💼 Scenario 4: Context-Heavy Current Work Query');
  console.log('   Query: "Current debugging status and next steps"');
  console.log('   Expected: Contextual strategy, heavy emphasis on session layer');

  mixer.setStrategy('contextual');
  const contextualResults = await router.search({
    query: 'Current debugging status and next steps',
    limit: 6,
  });

  console.log(`   Results: ${contextualResults.length} items found`);
  contextualResults.forEach((result, index) => {
    console.log(`     ${index + 1}. [${result.source}] ${result.memory.content.substring(0, 60)}...`);
    console.log(`        Score: ${result.score.toFixed(3)}, Created: ${result.memory.createdAt.toLocaleTimeString()}`);
  });
  console.log('');

  // Scenario 5: Adaptive strategy (automatic selection)
  console.log('🧠 Scenario 5: Adaptive Strategy (Automatic Selection)');
  console.log('   Query: "TypeScript configuration best practices"');
  console.log('   Expected: Adaptive strategy automatically selects optimal approach');

  mixer.setStrategy('adaptive');
  const adaptiveResults = await router.search({
    query: 'TypeScript configuration best practices',
    limit: 7,
  });

  console.log(`   Results: ${adaptiveResults.length} items found`);
  adaptiveResults.forEach((result, index) => {
    console.log(`     ${index + 1}. [${result.source}] ${result.memory.content.substring(0, 60)}...`);
    console.log(`        Score: ${result.score.toFixed(3)}, Source: ${result.memory.metadata.source}`);
  });
  console.log('');

  // Show layer statistics
  console.log('📈 Layer Statistics:');
  const stats = await router.getAllStats();
  Object.entries(stats).forEach(([layer, layerStats]) => {
    console.log(`   ${layer}: ${layerStats.totalItems} items, avg score: ${layerStats.averageScore?.toFixed(3) || 'N/A'}`);
  });
}

/**
 * Key Benefits Demonstration
 */
function demonstrateKeyBenefits() {
  console.log('🎯 Key Benefits of Hierarchical Memory & Layer Mixing:\n');

  console.log('1. 🧠 Intelligent Context Awareness:');
  console.log('   • Session layer captures immediate conversation context');
  console.log('   • Project layer maintains work-specific knowledge');
  console.log('   • Global layer provides universal best practices');
  console.log('   • Temporal layer reveals historical patterns\n');

  console.log('2. 🔄 Adaptive Strategy Selection:');
  console.log('   • Performance strategy for quick queries');
  console.log('   • Discovery strategy for exploration');
  console.log('   • Comprehensive strategy for deep analysis');
  console.log('   • Contextual strategy for current work focus\n');

  console.log('3. 🎯 Elegant Result Mixing:');
  console.log('   • Cross-layer deduplication prevents redundancy');
  console.log('   • Intelligent scoring blends relevance across layers');
  console.log('   • Context-aware ranking prioritizes most useful results');
  console.log('   • Diversity optimization ensures broad coverage\n');

  console.log('4. ⚡ Performance Optimization:');
  console.log('   • Parallel search across selected layers');
  console.log('   • Smart layer selection reduces unnecessary work');
  console.log('   • Caching strategies speed up repeated queries');
  console.log('   • Batch processing optimizes resource usage\n');

  console.log('5. 🔗 Relationship-Aware Architecture:');
  console.log('   • Cross-layer relationship detection');
  console.log('   • Automatic memory promotion based on importance');
  console.log('   • Temporal pattern recognition across layers');
  console.log('   • User preference learning influences layer weights\n');
}

/**
 * Run the complete demonstration
 */
async function runDemo() {
  try {
    await demonstrateHierarchicalMemory();
    demonstrateKeyBenefits();
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Export for use
export { runDemo, demonstrateHierarchicalMemory, demonstrateKeyBenefits };