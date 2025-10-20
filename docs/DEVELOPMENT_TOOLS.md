# Development Tools

Comprehensive development tools for debugging, profiling, and optimizing your bun-router applications.

## Overview

The development tools provide four main capabilities:

1. **Route Debugging** - Detailed logging and inspection of route matching
2. **Route Inspection** - Route listing, analysis, and metadata
3. **Performance Profiling** - Request profiling and performance analysis
4. **TypeScript Utilities** - Type generation and validation

## Quick Start

```typescript
import { DevelopmentTools, DevelopmentPresets } from 'bun-router'

// Initialize with development preset
const devTools = new DevelopmentTools(DevelopmentPresets.development())

// Add middleware to router
router.use(...devTools.createMiddleware())

// Register routes with development tools
devTools.registerRoute('GET', '/users/{id}', handler, [], {
  types: { paramsType: '{ id: string }', responseType: 'User' }
})
```

## Route Debugging

### Basic Usage

```typescript
import { DevelopmentRouter } from 'bun-router'

const router = new DevelopmentRouter()

// Enable debugging for specific routes
router.debug().get('/test', handler) // Logs route matching process
router.debug().post('/users', handler)
```

### Debug Configuration

```typescript
import { RouteDebugger } from 'bun-router'

const debugger = new RouteDebugger({
  enabled: true,
  logLevel: 'debug', // 'debug' | 'info' | 'warn' | 'error'
  includeHeaders: true,
  includeBody: true,
  includeParams: true,
  includeQuery: true,
  includeTimings: true,
  maxBodySize: 1024 * 10, // 10KB
  colorOutput: true,
  outputFormat: 'console' // 'console' | 'json' | 'structured'
})
```

### Debug Output Example

```
🔍 Starting route debugging for GET /users/123
✅ Route match: GET /users/{id} (params: { id: "123" })
🎯 Final route match: /users/{id}
⏱️  routeMatching: 2.34ms
⏱️  middlewareExecution: 15.67ms
⏱️  handlerExecution: 45.23ms
📊 Route debugging summary for GET /users/123
   Total time: 63.24ms
   Memory delta: 2.45MB
   CPU time: 12.34ms
```

### Manual Debugging

```typescript
import { RouteDebugHelpers } from 'bun-router'

// In route handler
const handler = async (req: EnhancedRequest) => {
  // Record custom debug points
  RouteDebugHelpers.recordMatch(req, '/users/{id}', 'GET', true, undefined, { id: '123' })
  RouteDebugHelpers.recordTiming(req, 'handlerExecution', 45.23)
  
  return new Response('OK')
}
```

## Route Inspection

### Route Listing

```typescript
import { RouteInspectionHelpers } from 'bun-router'

// List all routes
RouteInspectionHelpers.listRoutes()

// Filter routes
RouteInspectionHelpers.listRoutes({ method: 'GET' })
RouteInspectionHelpers.listRoutes({ pattern: 'users' })
RouteInspectionHelpers.listRoutes({ hasParams: true })
```

### Route Analysis

```typescript
// Analyze routes for insights
RouteInspectionHelpers.analyzeRoutes()

// Get detailed analysis
const devTools = new DevelopmentTools()
const analysis = devTools.routes().analyze()

console.log(`Total routes: ${analysis.totalRoutes}`)
console.log(`Unused routes: ${analysis.unusedRoutes.length}`)
console.log(`Slow routes: ${analysis.slowRoutes.length}`)
console.log(`Recommendations:`, analysis.recommendations)
```

### Export Routes

```typescript
// Export in different formats
RouteInspectionHelpers.exportRoutes('json')
RouteInspectionHelpers.exportRoutes('csv')
RouteInspectionHelpers.exportRoutes('markdown')
RouteInspectionHelpers.exportRoutes('openapi')

// Export to file
RouteInspectionHelpers.exportRoutes('json', 'routes.json')
```

### Route Metadata

```typescript
import { RouteInspector } from 'bun-router'

const inspector = new RouteInspector()

// Register route with metadata
inspector.registerRoute('GET', '/users/{id}', handler, [], {
  metadata: {
    name: 'GetUser',
    description: 'Retrieve user by ID',
    group: 'users'
  },
  validation: {
    rules: { id: 'required|uuid' }
  }
})

// Get route information
const routes = inspector.getRoutes()
const userRoutes = inspector.getRoutes({ group: 'users' })
```

## Performance Profiling

### Basic Profiling

```typescript
import { DevelopmentRouter } from 'bun-router'

const router = new DevelopmentRouter()

// Profile specific route groups
router.profile().group(() => {
  router.get('/api/users', handler)
  router.get('/api/posts', handler)
})
```

### Profiling Configuration

```typescript
import { PerformanceProfiler } from 'bun-router'

const profiler = new PerformanceProfiler({
  enabled: true,
  sampleRate: 0.1, // Profile 10% of requests
  includeMemory: true,
  includeCpu: true,
  includeGc: true,
  trackSlowQueries: true,
  slowQueryThreshold: 100, // ms
  maxProfiles: 1000,
  outputFormat: 'console' // 'console' | 'json' | 'flamegraph'
})
```

### Manual Profiling

```typescript
import { PerformanceProfilingHelpers } from 'bun-router'

const handler = async (req: EnhancedRequest) => {
  // Start timing operation
  const timingId = PerformanceProfilingHelpers.startTiming(req, 'handlerExecution', 'database_query')
  
  // Perform database operation
  const result = await db.query('SELECT * FROM users')
  
  // End timing
  PerformanceProfilingHelpers.endTiming(req, 'handlerExecution', timingId)
  
  // Record query
  PerformanceProfilingHelpers.recordQuery(req, 'SELECT * FROM users', 25.5)
  
  return Response.json(result)
}
```

### Performance Metrics

```typescript
const devTools = new DevelopmentTools()
const metrics = devTools.profile().getMetrics()

console.log(`Average response time: ${metrics.averageResponseTime}ms`)
console.log(`P95 response time: ${metrics.p95ResponseTime}ms`)
console.log(`P99 response time: ${metrics.p99ResponseTime}ms`)
console.log(`Memory usage (avg): ${metrics.memoryUsageAverage / 1024 / 1024}MB`)
console.log(`Slowest routes:`, metrics.slowestRoutes)
```

### Performance Report

```typescript
const report = devTools.profile().generateReport()
console.log(report)

// Output:
// # Performance Profile Report
// 
// ## Summary
// - Total Profiles: 150
// - Average Response Time: 45.23ms
// - P95 Response Time: 120.45ms
// - P99 Response Time: 250.67ms
// - Requests/Second: 25.4
// - Average Memory Usage: 45.67MB
// - Peak Memory Usage: 89.23MB
// 
// ## Slowest Routes
// 1. GET /api/reports - 234.56ms (12 requests)
// 2. POST /api/uploads - 156.78ms (8 requests)
// 
// ## Warnings
// ### GET /api/slow-endpoint
// - Slow query detected: 150.20ms
// - 💡 Consider query optimization
```

## TypeScript Utilities

### Type Generation

```typescript
import { TypeScriptHelpers } from 'bun-router'

// Generate TypeScript definitions
const types = TypeScriptHelpers.generateTypes()
console.log(types)

// Output:
// import type { EnhancedRequest } from '../types'
// 
// export interface GetUsersIdParams {
//   id: string
// }
// 
// export type GetUsersIdHandler = (req: EnhancedRequest & { params: GetUsersIdParams }) => Promise<User>
// 
// export interface RouteRegistry {
//   'GET /users/{id}': GetUsersIdHandler
// }
```

### Validation Schemas

```typescript
// Generate validation schemas from types
const schemas = TypeScriptHelpers.generateSchemas()
console.log(schemas)

// Output:
// {
//   "GET:/users/{id}_params": {
//     "type": "object",
//     "properties": {
//       "id": { "type": "string" }
//     },
//     "required": ["id"]
//   }
// }
```

### OpenAPI Generation

```typescript
// Generate OpenAPI documentation
const openapi = TypeScriptHelpers.generateOpenAPI()
console.log(JSON.stringify(openapi, null, 2))

// Output:
// {
//   "openapi": "3.0.0",
//   "info": {
//     "title": "API Documentation",
//     "version": "1.0.0"
//   },
//   "paths": {
//     "/users/{id}": {
//       "get": {
//         "summary": "GET /users/{id}",
//         "parameters": [
//           {
//             "name": "id",
//             "in": "path",
//             "required": true,
//             "schema": { "type": "string" }
//           }
//         ]
//       }
//     }
//   }
// }
```

### Type-Safe Route Registration

```typescript
import { TypeScriptUtilities } from 'bun-router'

const tsUtils = new TypeScriptUtilities()

// Register route with type information
tsUtils.registerRouteTypes('GET', '/users/{id}', {
  paramsType: '{ id: string }',
  responseType: 'User',
  queryType: '{ include?: string }',
  middlewareTypes: ['AuthMiddleware', 'ValidationMiddleware']
})

// Generate type-safe route builder
const routeBuilder = tsUtils.generateRouteBuilder()
console.log(routeBuilder)
```

### Request Validation

```typescript
// Validate request against TypeScript types
const validation = TypeScriptHelpers.validateRequest(req, 'GET:/users/{id}')

if (!validation.valid) {
  console.log('Validation errors:', validation.errors)
  return new Response('Bad Request', { status: 400 })
}
```

## Development Presets

### Available Presets

```typescript
import { DevelopmentPresets } from 'bun-router'

// Full development mode - all features enabled
const devConfig = DevelopmentPresets.development()

// Production debugging - minimal overhead
const prodConfig = DevelopmentPresets.production()

// Performance testing - focus on profiling
const perfConfig = DevelopmentPresets.performance()

// TypeScript development - focus on type generation
const tsConfig = DevelopmentPresets.typescript()
```

### Custom Configuration

```typescript
const customConfig = {
  debug: {
    enabled: true,
    logLevel: 'info',
    includeHeaders: false,
    includeBody: true,
    colorOutput: true
  },
  profiling: {
    enabled: true,
    sampleRate: 0.05, // 5% sampling
    includeMemory: true,
    includeCpu: false
  },
  inspection: {
    enabled: true,
    trackStats: true,
    generateReports: true
  },
  typescript: {
    generateTypes: true,
    validateTypes: false,
    generateSchemas: true
  }
}

const devTools = new DevelopmentTools(customConfig)
```

## Integration Examples

### Express-Style Router Integration

```typescript
import { DevelopmentTools, DevelopmentPresets } from 'bun-router'

const devTools = new DevelopmentTools(DevelopmentPresets.development())

// Add development middleware
app.use(...devTools.createMiddleware())

// Register routes with development tools
app.get('/users/:id', (req, res) => {
  // Route handler
}, {
  types: {
    paramsType: '{ id: string }',
    responseType: 'User'
  }
})
```

### Middleware Integration

```typescript
import { createRouteDebugMiddleware, createPerformanceProfilingMiddleware } from 'bun-router'

// Individual middleware
router.use(createRouteDebugMiddleware({ logLevel: 'info' }))
router.use(createPerformanceProfilingMiddleware({ sampleRate: 0.1 }))

// Combined middleware stack
const devTools = new DevelopmentTools()
router.use(...devTools.createMiddleware())
```

### CLI Integration

```typescript
// Generate development report
const devTools = new DevelopmentTools()
const report = devTools.generateReport()

// Write to file
await Bun.write('development-report.md', report)

// Export routes
const routes = devTools.routes().export('openapi')
await Bun.write('openapi.json', routes)

// Generate TypeScript definitions
const types = devTools.typescript().generateTypes()
await Bun.write('generated-types.ts', types)
```

## Production Considerations

### Performance Impact

- **Debug Mode**: Minimal overhead when disabled, ~5-10% when enabled
- **Profiling**: Configurable sampling rate (recommend 1-5% in production)
- **Inspection**: Negligible overhead for route registration
- **TypeScript**: No runtime overhead, build-time only

### Memory Usage

- **Profiles**: Automatically cleaned up (configurable max profiles)
- **Debug Sessions**: Cleared after completion
- **Route Metadata**: Minimal memory footprint
- **Type Information**: Build-time only

### Security

- Debug information is not exposed in responses
- Sensitive data can be filtered from logs
- Production presets disable verbose logging
- No external dependencies for core functionality

## Best Practices

### Development Workflow

1. **Start with full development preset** for comprehensive debugging
2. **Use route inspection** to analyze route patterns and usage
3. **Profile performance** to identify bottlenecks
4. **Generate TypeScript types** for type safety
5. **Export documentation** for API consumers

### Production Deployment

1. **Use production preset** for minimal overhead
2. **Enable sampling** for performance monitoring
3. **Monitor slow routes** and error rates
4. **Generate reports** for performance analysis
5. **Disable debug logging** in production

### Performance Optimization

1. **Identify slow routes** using profiling
2. **Optimize database queries** based on query tracking
3. **Reduce middleware overhead** using conditional execution
4. **Monitor memory usage** for potential leaks
5. **Use route caching** for frequently accessed routes

## API Reference

### DevelopmentTools

- `registerRoute(method, pattern, handler, middleware, options)` - Register route with all tools
- `createMiddleware()` - Create development middleware stack
- `debug()` - Access debugging interface
- `routes()` - Access route inspection interface
- `profile()` - Access profiling interface
- `typescript()` - Access TypeScript utilities
- `generateReport()` - Generate comprehensive report
- `clear()` - Clear all development data

### RouteDebugger

- `startDebugging(req)` - Start debugging session
- `recordMatchAttempt(requestId, pattern, method, matched, reason, params)` - Record route match
- `recordFinalMatch(requestId, pattern, handler, middleware, params)` - Record final match
- `recordTiming(requestId, phase, duration)` - Record timing information
- `finishDebugging(requestId, response)` - Finish debugging session
- `getDebugSession(requestId)` - Get debug session data
- `clearSessions()` - Clear all debug sessions

### RouteInspector

- `registerRoute(method, pattern, handler, middleware, options)` - Register route
- `getRoutes(filter)` - Get routes with optional filtering
- `findMatchingRoutes(method, path)` - Find routes matching request
- `analyzeRoutes()` - Analyze routes for insights
- `exportRoutes(format)` - Export routes in various formats
- `recordRouteAccess(routeId, responseTime, error)` - Record route statistics

### PerformanceProfiler

- `startProfiling(req, pattern)` - Start profiling session
- `recordPoint(profileId, phase, name, metadata)` - Record profile point
- `startTiming(profileId, phase, name)` - Start timing operation
- `endTiming(profileId, phase, timingId)` - End timing operation
- `recordQuery(profileId, query, duration)` - Record database query
- `finishProfiling(profileId, response)` - Finish profiling session
- `getMetrics()` - Get performance metrics
- `generateReport()` - Generate performance report

### TypeScriptUtilities

- `registerRouteTypes(method, pattern, options)` - Register route type information
- `generateRouteTypes()` - Generate TypeScript route definitions
- `generateValidationSchemas()` - Generate validation schemas
- `generateOpenAPISchema()` - Generate OpenAPI documentation
- `generateRouteBuilder()` - Generate type-safe route builder
- `validateRequest(req, routeKey)` - Validate request against types

## Troubleshooting

### Common Issues

**Debug logs not appearing**
- Check that debugging is enabled
- Verify log level configuration
- Ensure middleware is properly registered

**Profiling not working**
- Check sample rate (may be too low)
- Verify profiler is enabled
- Ensure middleware order is correct

**Type generation issues**
- Verify route types are registered
- Check TypeScript configuration
- Ensure proper import paths

**Performance overhead**
- Reduce sample rate in production
- Disable unnecessary features
- Use production preset

### Debug Commands

```typescript
// Check development tools status
console.log('Debug enabled:', devTools.debug().getDebugSession('test'))
console.log('Routes registered:', devTools.routes().list().length)
console.log('Profiles collected:', devTools.profile().getProfiles().length)
console.log('Types generated:', devTools.typescript().generateTypes().length > 0)

// Clear all data
devTools.clear()

// Generate diagnostic report
const report = devTools.generateReport()
console.log(report)
```
