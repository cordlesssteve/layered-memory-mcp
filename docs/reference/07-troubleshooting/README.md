# Troubleshooting Documentation

This section contains troubleshooting guides, common issues, and diagnostic procedures for the Layered Memory MCP Server.

## Quick Links

- [Common Issues](./common-issues.md)
- [Performance Problems](./performance.md)
- [Database Issues](./database.md)
- [Integration Problems](./integration.md)
- [Diagnostic Tools](./diagnostics.md)
- [Support Procedures](./support.md)

## Troubleshooting Overview

This guide helps diagnose and resolve common issues with the Layered Memory MCP Server across different deployment scenarios and use cases.

### Issue Categories
- **Installation and Setup**: Initial configuration and startup problems
- **Performance**: Query response times and resource utilization
- **Database**: Storage, connectivity, and data integrity issues
- **Integration**: MCP client and external service problems
- **Memory Management**: Memory storage, retrieval, and organization

## Common Issues

### Installation and Setup Problems

#### Server Won't Start
**Symptoms**: Application fails to start or exits immediately
**Common Causes**:
- Missing dependencies or incorrect Node.js version
- Database connection failures
- Invalid configuration files
- Port conflicts or permission issues

**Diagnostic Steps**:
```bash
# Check Node.js version
node --version  # Should be 18.0.0 or higher

# Verify dependencies
npm install
npm run typecheck

# Check configuration
npm run validate-config

# Test database connections
npm run test:db
```

#### MCP Client Connection Issues
**Symptoms**: MCP clients can't connect or discover the server
**Common Causes**:
- Incorrect MCP configuration in client
- Server not properly exposing MCP interface
- Network connectivity or firewall issues
- Authentication failures

**Diagnostic Steps**:
```bash
# Test MCP server directly
npm run test:mcp

# Check server logs
npm run logs --level=debug

# Validate MCP configuration
npm run validate:mcp-config
```

### Performance Issues

#### Slow Query Response Times
**Symptoms**: Memory searches and retrievals taking >200ms
**Common Causes**:
- Database indexing issues
- Large memory volume without optimization
- Inefficient query patterns
- Resource constraints (CPU, memory, disk)

**Diagnostic Steps**:
```bash
# Run performance benchmarks
npm run benchmark

# Check database query performance
npm run analyze:queries

# Monitor resource usage
npm run monitor:resources

# Test with smaller dataset
npm run test:performance --size=small
```

#### High Memory Usage
**Symptoms**: Node.js process consuming excessive RAM
**Common Causes**:
- Memory leaks in application code
- Large cache sizes without proper limits
- Inefficient data structures
- Unclosed database connections

**Diagnostic Steps**:
```bash
# Memory profiling
npm run profile:memory

# Check cache usage
npm run analyze:cache

# Database connection monitoring
npm run monitor:db-connections
```

### Database Problems

#### Vector Database Issues
**Symptoms**: Semantic search not working or returning poor results
**Common Causes**:
- ChromaDB connection problems
- Embedding model issues
- Index corruption or missing embeddings
- Configuration problems

**Diagnostic Steps**:
```bash
# Test vector database connection
npm run test:chromadb

# Rebuild embeddings index
npm run rebuild:embeddings

# Validate embedding quality
npm run test:embeddings

# Check ChromaDB logs
npm run logs:chromadb
```

#### Graph Database Problems
**Symptoms**: Relationship queries failing or incomplete results
**Common Causes**:
- Neo4j connection issues
- Graph schema problems
- Transaction failures
- Memory constraints in Neo4j

**Diagnostic Steps**:
```bash
# Test Neo4j connection
npm run test:neo4j

# Validate graph schema
npm run validate:graph-schema

# Check transaction logs
npm run logs:neo4j

# Analyze graph performance
npm run analyze:graph-queries
```

#### SQLite Issues
**Symptoms**: Data persistence problems or corruption
**Common Causes**:
- File permission issues
- Disk space problems
- Concurrent access conflicts
- Database file corruption

**Diagnostic Steps**:
```bash
# Check database integrity
npm run check:sqlite

# Test file permissions
ls -la data/memory.db

# Analyze database size and performance
npm run analyze:sqlite

# Backup and repair if needed
npm run backup:sqlite
npm run repair:sqlite
```

## Diagnostic Tools

### Health Check Endpoints
```bash
# Overall system health
curl http://localhost:3000/health

# Database connectivity
curl http://localhost:3000/health/databases

# Performance metrics
curl http://localhost:3000/metrics

# Memory statistics
curl http://localhost:3000/stats/memory
```

### Logging and Monitoring
```bash
# Enable debug logging
export LOG_LEVEL=debug
npm start

# Monitor real-time logs
npm run logs:follow

# Analyze error patterns
npm run analyze:errors

# Performance monitoring
npm run monitor:performance
```

### Performance Profiling
```bash
# CPU profiling
npm run profile:cpu

# Memory profiling
npm run profile:memory

# Database query profiling
npm run profile:queries

# Generate performance report
npm run report:performance
```

## Recovery Procedures

### Database Recovery
```bash
# Backup current state
npm run backup:all

# Restore from backup
npm run restore:from-backup --date=2025-09-25

# Rebuild indexes
npm run rebuild:indexes

# Verify data integrity
npm run verify:data-integrity
```

### Configuration Reset
```bash
# Reset to default configuration
npm run reset:config

# Regenerate configuration from environment
npm run generate:config

# Validate new configuration
npm run validate:config
```

### Cache Clearing
```bash
# Clear all caches
npm run clear:cache

# Clear specific cache types
npm run clear:cache --type=vector
npm run clear:cache --type=query
npm run clear:cache --type=embedding
```

## Support and Escalation

### Information Collection
When reporting issues, collect:
- Server version and configuration
- Error logs and stack traces
- Performance metrics and resource usage
- Database schema and data statistics
- Client configuration and version

### Support Levels
1. **Self-Service**: Documentation and diagnostic tools
2. **Community Support**: GitHub issues and discussions
3. **Technical Support**: Direct assistance for critical issues
4. **Emergency Support**: 24/7 for production outages

### Escalation Procedures
1. Document issue with diagnostic information
2. Check known issues and workarounds
3. Create GitHub issue with detailed information
4. Contact support for critical production issues

## Preventive Measures

### Regular Maintenance
- Weekly database optimization and cleanup
- Monthly performance benchmarking
- Quarterly security audits
- Regular backup verification

### Monitoring Setup
- Configure alerts for performance thresholds
- Monitor database growth and performance
- Track error rates and patterns
- Monitor resource utilization trends

### Best Practices
- Regular updates and security patches
- Proper resource allocation and limits
- Regular backup and recovery testing
- Performance testing before deployments