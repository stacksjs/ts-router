/**
 * Development Tools Example
 *
 * Comprehensive example showing all development tools features
 */

import {
  DevelopmentTools,
  DevelopmentRouter,
  DevelopmentPresets,
  RouteDebugHelpers,
  RouteInspectionHelpers,
  PerformanceProfilingHelpers,
  TypeScriptHelpers
} from '../packages/bun-router/src/development'

// Example 1: Basic Development Setup
console.log('=== Basic Development Setup ===')

const devTools = new DevelopmentTools(DevelopmentPresets.development())

// Register routes with development tools
const userHandler = async (req: any) => {
  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100))

  // Record custom timing
  const timingId = PerformanceProfilingHelpers.startTiming(req, 'handlerExecution', 'user_lookup')

  // Simulate database query
  await new Promise(resolve => setTimeout(resolve, 25))
  PerformanceProfilingHelpers.recordQuery(req, 'SELECT * FROM users WHERE id = ?', 25.5)

  PerformanceProfilingHelpers.endTiming(req, 'handlerExecution', timingId)

  return new Response(JSON.stringify({
    id: req.params?.id || '123',
    name: 'John Doe',
    email: 'john@example.com'
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

const createUserHandler = async (req: any) => {
  // Simulate validation and creation
  await new Promise(resolve => setTimeout(resolve, 50))

  PerformanceProfilingHelpers.recordQuery(req, 'INSERT INTO users (name, email) VALUES (?, ?)', 15.2)

  return new Response(JSON.stringify({
    id: '456',
    name: 'Jane Doe',
    email: 'jane@example.com'
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  })
}

// Register routes with type information
devTools.registerRoute('GET', '/users/{id}', userHandler, [], {
  types: {
    paramsType: '{ id: string }',
    responseType: 'User',
    queryType: '{ include?: string }'
  },
  metadata: {
    name: 'GetUser',
    description: 'Retrieve user by ID',
    group: 'users'
  }
})

devTools.registerRoute('POST', '/users', createUserHandler, [], {
  types: {
    bodyType: 'CreateUserRequest',
    responseType: 'User'
  },
  metadata: {
    name: 'CreateUser',
    description: 'Create a new user',
    group: 'users'
  }
})

devTools.registerRoute('GET', '/posts/{slug}', async (req: any) => {
  await new Promise(resolve => setTimeout(resolve, 200)) // Slow route
  return new Response('Post content')
}, [], {
  types: {
    paramsType: '{ slug: string }',
    responseType: 'Post'
  },
  metadata: {
    group: 'posts'
  }
})

// Example 2: Development Router Usage
console.log('\n=== Development Router Usage ===')

const devRouter = new DevelopmentRouter()

// Enable debugging for specific routes
const debugRoutes = devRouter.debug()
debugRoutes.get('/debug-test', async (req: any) => {
  console.log('Debug route called')
  return new Response('Debug OK')
})

// Profile a group of routes
devRouter.profile().group(() => {
  console.log('Registering profiled routes...')
  // Routes registered here will be profiled
})

// Example 3: Route Inspection
console.log('\n=== Route Inspection ===')

// List all routes
console.log('All registered routes:')
RouteInspectionHelpers.listRoutes()

// Filter routes by method
console.log('\nGET routes only:')
RouteInspectionHelpers.listRoutes({ method: 'GET' })

// Filter routes by group
console.log('\nUser routes only:')
RouteInspectionHelpers.listRoutes({ group: 'users' })

// Analyze routes
console.log('\nRoute analysis:')
RouteInspectionHelpers.analyzeRoutes()

// Example 4: Performance Profiling
console.log('\n=== Performance Profiling ===')

// Simulate some requests to generate profile data
const simulateRequests = async () => {
  console.log('Simulating requests...')

  // Create mock requests
  const requests = [
    { method: 'GET', url: 'http://localhost/users/123', pattern: '/users/{id}' },
    { method: 'POST', url: 'http://localhost/users', pattern: '/users' },
    { method: 'GET', url: 'http://localhost/posts/hello-world', pattern: '/posts/{slug}' },
    { method: 'GET', url: 'http://localhost/users/456', pattern: '/users/{id}' }
  ]

  for (const reqData of requests) {
    const mockReq = {
      method: reqData.method,
      url: reqData.url,
      params: reqData.pattern.includes('{id}') ? { id: '123' } :
              reqData.pattern.includes('{slug}') ? { slug: 'hello-world' } : {},
      headers: new Headers(),
      route: { pattern: reqData.pattern, id: `${reqData.method.toLowerCase()}_route` }
    }

    // Find the appropriate handler
    let handler = userHandler
    if (reqData.method === 'POST') handler = createUserHandler
    if (reqData.pattern.includes('posts')) {
      handler = async (req: any) => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return new Response('Post content')
      }
    }

    try {
      await handler(mockReq)
    } catch (error) {
      console.log('Handler error:', error)
    }
  }
}

await simulateRequests()

// Get performance metrics
const metrics = devTools.profile().getMetrics()
console.log('Performance metrics:', {
  averageResponseTime: `${metrics.averageResponseTime.toFixed(2)}ms`,
  p95ResponseTime: `${metrics.p95ResponseTime.toFixed(2)}ms`,
  memoryUsage: `${(metrics.memoryUsageAverage / 1024 / 1024).toFixed(2)}MB`,
  slowestRoutes: metrics.slowestRoutes.slice(0, 3)
})

// Generate performance report
console.log('\nPerformance report:')
const performanceReport = devTools.profile().generateReport()
console.log(performanceReport.substring(0, 500) + '...')

// Example 5: TypeScript Utilities
console.log('\n=== TypeScript Utilities ===')

// Generate TypeScript definitions
console.log('Generated TypeScript types:')
const generatedTypes = devTools.typescript().generateTypes()
console.log(generatedTypes.substring(0, 800) + '...')

// Generate validation schemas
console.log('\nValidation schemas:')
const schemas = devTools.typescript().generateSchemas()
console.log(JSON.stringify(schemas, null, 2))

// Generate OpenAPI documentation
console.log('\nOpenAPI schema:')
const openapi = devTools.typescript().generateOpenAPI()
console.log(JSON.stringify(openapi, null, 2).substring(0, 600) + '...')

// Example 6: Export Routes
console.log('\n=== Export Routes ===')

// Export as JSON
console.log('Exporting routes as JSON...')
RouteInspectionHelpers.exportRoutes('json', 'routes.json')

// Export as Markdown
console.log('Exporting routes as Markdown...')
const markdownExport = devTools.routes().export('markdown')
console.log(markdownExport.substring(0, 400) + '...')

// Export as CSV
console.log('Exporting routes as CSV...')
const csvExport = devTools.routes().export('csv')
console.log(csvExport)

// Example 7: Comprehensive Development Report
console.log('\n=== Comprehensive Development Report ===')

const fullReport = devTools.generateReport()
console.log(fullReport)

// Example 8: Manual Debugging
console.log('\n=== Manual Debugging Example ===')

const manualDebugHandler = async (req: any) => {
  // Record route match attempts
  RouteDebugHelpers.recordMatch(req, '/api/users', 'GET', false, 'Method mismatch')
  RouteDebugHelpers.recordMatch(req, '/api/users/{id}', 'GET', true, undefined, { id: '123' })

  // Record timing
  RouteDebugHelpers.recordTiming(req, 'handlerExecution', 45.23)

  return new Response('Manual debug OK')
}

// Example 9: Different Configuration Presets
console.log('\n=== Configuration Presets ===')

// Development preset
const devConfig = DevelopmentPresets.development()
console.log('Development config:', {
  debugEnabled: devConfig.debug?.enabled,
  profilingSampleRate: devConfig.profiling?.sampleRate,
  typescriptGeneration: devConfig.typescript?.generateTypes
})

// Production preset
const prodConfig = DevelopmentPresets.production()
console.log('Production config:', {
  debugLogLevel: prodConfig.debug?.logLevel,
  profilingSampleRate: prodConfig.profiling?.sampleRate,
  typescriptGeneration: prodConfig.typescript?.generateTypes
})

// Performance testing preset
const perfConfig = DevelopmentPresets.performance()
console.log('Performance config:', {
  debugEnabled: perfConfig.debug?.enabled,
  profilingEnabled: perfConfig.profiling?.enabled,
  includeMemory: perfConfig.profiling?.includeMemory
})

// TypeScript development preset
const tsConfig = DevelopmentPresets.typescript()
console.log('TypeScript config:', {
  generateTypes: tsConfig.typescript?.generateTypes,
  validateTypes: tsConfig.typescript?.validateTypes,
  generateSchemas: tsConfig.typescript?.generateSchemas
})

// Example 10: Custom Middleware Integration
console.log('\n=== Custom Middleware Integration ===')

const customMiddleware = devTools.createMiddleware()
console.log(`Created ${customMiddleware.length} development middleware functions`)

// Example middleware usage
const exampleMiddlewareStack = async (req: any, next: () => Promise<Response>) => {
  console.log('Processing request through development middleware...')

  // Apply all development middleware
  let response = new Response('OK')
  for (const middleware of customMiddleware) {
    try {
      response = await middleware(req, async () => response)
    } catch (error) {
      console.log('Middleware error:', error)
    }
  }

  return response
}

// Example 11: Route Statistics
console.log('\n=== Route Statistics ===')

// Get routes with statistics
const routesWithStats = devTools.routes().list()
routesWithStats.forEach(route => {
  console.log(`${route.method} ${route.pattern}:`, {
    hits: route.stats.hits,
    averageTime: `${route.stats.averageResponseTime.toFixed(2)}ms`,
    errors: route.stats.errors,
    lastAccessed: route.stats.lastAccessed ? new Date(route.stats.lastAccessed).toISOString() : 'Never'
  })
})

// Example 12: Memory and Performance Cleanup
console.log('\n=== Cleanup ===')

// Clear all development data
devTools.clear()
console.log('Development tools data cleared')

// Final summary
console.log('\n=== Summary ===')
console.log('Development tools example completed successfully!')
console.log('Features demonstrated:')
console.log('✅ Route debugging with detailed logging')
console.log('✅ Route inspection and analysis')
console.log('✅ Performance profiling and metrics')
console.log('✅ TypeScript utilities and type generation')
console.log('✅ Export capabilities (JSON, CSV, Markdown, OpenAPI)')
console.log('✅ Configuration presets for different environments')
console.log('✅ Middleware integration')
console.log('✅ Manual debugging and profiling helpers')
console.log('✅ Comprehensive reporting')

export {
  devTools,
  devRouter,
  userHandler,
  createUserHandler,
  manualDebugHandler
}
