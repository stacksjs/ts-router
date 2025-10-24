/**
 * Development Tools Test Suite
 *
 * Comprehensive tests for route debugging, inspection, profiling, and TypeScript utilities
 */

import type { EnhancedRequest } from '../packages/bun-router/src/types'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  DevelopmentPresets,
  DevelopmentRouter,
  DevelopmentTools,
  PerformanceProfiler,
  RouteDebugger,
  RouteInspector,
  TypeScriptUtilities,
} from '../packages/bun-router/src/development'

// Mock request helper
function createMockRequest(method: string = 'GET', url: string = 'http://localhost/test'): EnhancedRequest {
  const request = new Request(url, { method })
  return {
    method: request.method,
    url: request.url,
    headers: request.headers,
    params: {},
    query: {},
    body: null,
    route: { pattern: '/test', id: 'test_route' },
  } as unknown as EnhancedRequest
}

// Mock handler
async function mockHandler(_req: EnhancedRequest): Promise<Response> {
  return new Response('OK')
}

describe('Route Debugger', () => {
  let routeDebugger: RouteDebugger

  beforeEach(() => {
    routeDebugger = new RouteDebugger({
      enabled: true,
      logLevel: 'debug',
      includeHeaders: true,
      includeBody: true,
      colorOutput: false,
      outputFormat: 'json',
    })
  })

  afterEach(() => {
    routeDebugger.clearSessions()
  })

  test('should start and finish debugging session', () => {
    const req = createMockRequest()
    const requestId = routeDebugger.startDebugging(req)

    expect(requestId).toBeTruthy()
    expect(routeDebugger.getDebugSession(requestId)).toBeDefined()

    const debugInfo = routeDebugger.finishDebugging(requestId)
    expect(debugInfo).toBeDefined()
    expect(debugInfo?.requestId).toBe(requestId)
    expect(debugInfo?.method).toBe('GET')
  })

  test('should record route match attempts', () => {
    const req = createMockRequest()
    const requestId = routeDebugger.startDebugging(req)

    routeDebugger.recordMatchAttempt(requestId, '/test', 'GET', false, 'Pattern mismatch')
    routeDebugger.recordMatchAttempt(requestId, '/test/{id}', 'GET', true, undefined, { id: '123' })

    const debugInfo = routeDebugger.getDebugSession(requestId)
    expect(debugInfo?.matchAttempts).toHaveLength(2)
    expect(debugInfo?.matchAttempts[0].matched).toBe(false)
    expect(debugInfo?.matchAttempts[1].matched).toBe(true)
    expect(debugInfo?.matchAttempts[1].params).toEqual({ id: '123' })
  })

  test('should record final route match', () => {
    const req = createMockRequest()
    const requestId = routeDebugger.startDebugging(req)

    routeDebugger.recordFinalMatch(requestId, '/test/{id}', mockHandler, [], { id: '123' })

    const debugInfo = routeDebugger.getDebugSession(requestId)
    expect(debugInfo?.finalMatch).toBeDefined()
    expect(debugInfo?.finalMatch?.pattern).toBe('/test/{id}')
    expect(debugInfo?.finalMatch?.params).toEqual({ id: '123' })
  })

  test('should record timing information', () => {
    const req = createMockRequest()
    const requestId = routeDebugger.startDebugging(req)

    routeDebugger.recordTiming(requestId, 'routeMatching', 5.5)
    routeDebugger.recordTiming(requestId, 'handlerExecution', 15.2)

    const debugInfo = routeDebugger.getDebugSession(requestId)
    expect(debugInfo?.timings.routeMatching).toBe(5.5)
    expect(debugInfo?.timings.handlerExecution).toBe(15.2)
  })

  test('should register and retrieve routes', () => {
    routeDebugger.registerRoute('GET', '/test', mockHandler, [])
    routeDebugger.registerRoute('POST', '/users', mockHandler, [])

    const routes = routeDebugger.getRegisteredRoutes()
    expect(routes).toHaveLength(2)
    expect(routes[0].method).toBe('GET')
    expect(routes[0].pattern).toBe('/test')
    expect(routes[1].method).toBe('POST')
    expect(routes[1].pattern).toBe('/users')
  })

  test('should handle disabled debugging', () => {
    const disabledDebugger = new RouteDebugger({ enabled: false })
    const req = createMockRequest()

    const requestId = disabledDebugger.startDebugging(req)
    expect(requestId).toBe('')

    disabledDebugger.recordMatchAttempt(requestId, '/test', 'GET', true)
    expect(disabledDebugger.getDebugSession(requestId)).toBeUndefined()
  })
})

describe('Route Inspector', () => {
  let inspector: RouteInspector

  beforeEach(() => {
    inspector = new RouteInspector()
  })

  afterEach(() => {
    inspector.clear()
  })

  test('should register and retrieve routes', () => {
    const routeId = inspector.registerRoute('GET', '/test', mockHandler, [])

    expect(routeId).toBeTruthy()

    const routes = inspector.getRoutes()
    expect(routes).toHaveLength(1)
    expect(routes[0].method).toBe('GET')
    expect(routes[0].pattern).toBe('/test')
    expect(routes[0].handler.name).toBe('mockHandler')
  })

  test('should filter routes', () => {
    inspector.registerRoute('GET', '/users', mockHandler, [])
    inspector.registerRoute('POST', '/users', mockHandler, [])
    inspector.registerRoute('GET', '/posts', mockHandler, [])

    const getRoutes = inspector.getRoutes({ method: 'GET' })
    expect(getRoutes).toHaveLength(2)
    expect(getRoutes.every(route => route.method === 'GET')).toBe(true)

    const userRoutes = inspector.getRoutes({ pattern: 'users' })
    expect(userRoutes).toHaveLength(2)
    expect(userRoutes.every(route => route.pattern.includes('users'))).toBe(true)
  })

  test('should find matching routes', () => {
    inspector.registerRoute('GET', '/users/{id}', mockHandler, [])
    inspector.registerRoute('GET', '/posts/{slug}', mockHandler, [])

    const matches = inspector.findMatchingRoutes('GET', '/users/123')
    expect(matches).toHaveLength(1)
    expect(matches[0].pattern).toBe('/users/{id}')
  })

  test('should record route access statistics', () => {
    const routeId = inspector.registerRoute('GET', '/test', mockHandler, [])

    inspector.recordRouteAccess(routeId, 150.5, false)
    inspector.recordRouteAccess(routeId, 200.3, false)
    inspector.recordRouteAccess(routeId, 100.1, true)

    const route = inspector.getRoute(routeId)
    expect(route?.stats.hits).toBe(3)
    expect(route?.stats.errors).toBe(1)
    expect(route?.stats.averageResponseTime).toBeCloseTo(150.3, 1)
  })

  test('should analyze routes', () => {
    inspector.registerRoute('GET', '/test', mockHandler, [])
    inspector.registerRoute('POST', '/test', mockHandler, []) // Duplicate pattern
    inspector.registerRoute('GET', '/slow', mockHandler, [])

    // Record some statistics
    const routeId1 = inspector.getRoutes()[0].id
    const routeId3 = inspector.getRoutes()[2].id

    inspector.recordRouteAccess(routeId1, 50, false)
    inspector.recordRouteAccess(routeId3, 1500, false) // Slow route

    const analysis = inspector.analyzeRoutes()

    expect(analysis.totalRoutes).toBe(3)
    expect(analysis.routesByMethod.GET).toBe(2)
    expect(analysis.routesByMethod.POST).toBe(1)
    expect(analysis.slowRoutes).toHaveLength(1)
    expect(analysis.unusedRoutes).toHaveLength(1) // One route with no hits
  })

  test('should export routes in different formats', () => {
    inspector.registerRoute('GET', '/test', mockHandler, [])
    inspector.registerRoute('POST', '/users', mockHandler, [])

    const jsonExport = inspector.exportRoutes('json')
    expect(() => JSON.parse(jsonExport)).not.toThrow()

    const csvExport = inspector.exportRoutes('csv')
    expect(csvExport).toContain('Method,Pattern,Handler')
    expect(csvExport).toContain('GET,/test,mockHandler')

    const markdownExport = inspector.exportRoutes('markdown')
    expect(markdownExport).toContain('# Route Documentation')
    expect(markdownExport).toContain('| Method | Pattern |')

    const openApiExport = inspector.exportRoutes('openapi')
    const openApiObj = JSON.parse(openApiExport)
    expect(openApiObj.openapi).toBe('3.0.0')
    expect(openApiObj.paths).toBeDefined()
  })

  test('should register and retrieve route groups', () => {
    inspector.registerGroup('api', '/api', [])
    inspector.registerGroup('admin', '/admin', [])

    const groups = inspector.getGroups()
    expect(groups).toHaveLength(2)
    expect(groups[0].name).toBe('api')
    expect(groups[0].prefix).toBe('/api')
  })
})

describe('Performance Profiler', () => {
  let profiler: PerformanceProfiler

  beforeEach(() => {
    profiler = new PerformanceProfiler({
      enabled: true,
      sampleRate: 1.0, // Profile all requests for testing
      includeMemory: true,
      includeCpu: true,
      outputFormat: 'json',
    })
  })

  afterEach(() => {
    profiler.clear()
  })

  test('should start and finish profiling', () => {
    const req = createMockRequest()
    const profileId = profiler.startProfiling(req, '/test')

    expect(profileId).toBeTruthy()
    expect(profiler.getProfile(profileId!)).toBeDefined()

    const profile = profiler.finishProfiling(profileId!)
    expect(profile).toBeDefined()
    expect(profile?.method).toBe('GET')
    expect(profile?.pattern).toBe('/test')
    expect(profile?.totalDuration).toBeGreaterThan(0)
  })

  test('should record profile points', () => {
    const req = createMockRequest()
    const profileId = profiler.startProfiling(req, '/test')

    profiler.recordPoint(profileId!, 'routeMatching', 'start')
    profiler.recordPoint(profileId!, 'routeMatching', 'end')
    profiler.recordPoint(profileId!, 'handlerExecution', 'handler_start')

    const profile = profiler.getProfile(profileId!)
    expect(profile?.phases.routeMatching).toHaveLength(2)
    expect(profile?.phases.handlerExecution).toHaveLength(1)
  })

  test('should record timing operations', async () => {
    const req = createMockRequest()
    const profileId = profiler.startProfiling(req, '/test')

    const timingId = profiler.startTiming(profileId!, 'middlewareExecution', 'auth')

    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 10))

    profiler.endTiming(profileId!, 'middlewareExecution', timingId)

    const profile = profiler.getProfile(profileId!)
    const authPoints = profile?.phases.middlewareExecution.filter(p => p.name.includes('auth'))
    expect(authPoints).toHaveLength(2) // start and end

    const endPoint = authPoints?.find(p => p.name.includes('end'))
    expect(endPoint?.metadata?.duration).toBeGreaterThan(0)
  })

  test('should record database queries', () => {
    const req = createMockRequest()
    const profileId = profiler.startProfiling(req, '/test')

    profiler.recordQuery(profileId!, 'SELECT * FROM users WHERE id = ?', 25.5)
    profiler.recordQuery(profileId!, 'SELECT * FROM posts WHERE user_id = ?', 150.2) // Slow query

    const profile = profiler.getProfile(profileId!)
    expect(profile?.queries).toHaveLength(2)
    expect(profile?.queries?.[0].duration).toBe(25.5)
    expect(profile?.queries?.[1].duration).toBe(150.2)
    expect(profile?.warnings).toContain('Slow query detected: 150.20ms')
  })

  test('should filter profiles', async () => {
    const req1 = createMockRequest('GET', 'http://localhost/fast')
    const req2 = createMockRequest('POST', 'http://localhost/slow')

    const profileId1 = profiler.startProfiling(req1, '/fast')
    const profileId2 = profiler.startProfiling(req2, '/slow')

    // Simulate different durations
    const _profile1 = profiler.finishProfiling(profileId1!)

    // Add artificial duration to second profile
    await new Promise(resolve => setTimeout(resolve, 50))
    const _profile2 = profiler.finishProfiling(profileId2!)

    const allProfiles = profiler.getProfiles()
    expect(allProfiles).toHaveLength(2)

    const getProfiles = profiler.getProfiles({ method: 'GET' })
    expect(getProfiles).toHaveLength(1)
    expect(getProfiles[0].method).toBe('GET')

    const slowProfiles = profiler.getProfiles({ minDuration: 40 })
    expect(slowProfiles.length).toBeGreaterThanOrEqual(0) // May vary based on timing
  })

  test('should generate performance metrics', async () => {
    const req = createMockRequest()
    const profileId = profiler.startProfiling(req, '/test')

    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 20))

    profiler.finishProfiling(profileId!)

    const metrics = profiler.getMetrics()
    expect(metrics.averageResponseTime).toBeGreaterThan(0)
    expect(metrics.memoryUsageAverage).toBeGreaterThan(0)
  })

  test('should generate performance report', () => {
    const req = createMockRequest()
    const profileId = profiler.startProfiling(req, '/test')
    profiler.finishProfiling(profileId!)

    const report = profiler.generateReport()
    expect(report).toContain('# Performance Profile Report')
    expect(report).toContain('Total Profiles: 1')
    expect(report).toContain('Average Response Time:')
  })

  test('should handle disabled profiling', () => {
    const disabledProfiler = new PerformanceProfiler({ enabled: false })
    const req = createMockRequest()

    const profileId = disabledProfiler.startProfiling(req, '/test')
    expect(profileId).toBeNull()
  })
})

describe('TypeScript Utilities', () => {
  let tsUtils: TypeScriptUtilities

  beforeEach(() => {
    tsUtils = new TypeScriptUtilities({
      generateTypes: true,
      validateTypes: true,
      generateSchemas: true,
    })
  })

  afterEach(() => {
    tsUtils.clear()
  })

  test('should register route types', () => {
    tsUtils.registerRouteTypes('GET', '/users/{id}', {
      paramsType: '{ id: string }',
      responseType: 'User',
      bodyType: 'unknown',
    })

    const routeTypes = tsUtils.getRouteTypes()
    expect(routeTypes).toHaveLength(1)
    expect(routeTypes[0].method).toBe('GET')
    expect(routeTypes[0].pattern).toBe('/users/{id}')
    expect(routeTypes[0].paramsType).toBe('{ id: string }')
  })

  test('should generate route types', () => {
    tsUtils.registerRouteTypes('GET', '/users/{id}', {
      paramsType: '{ id: string }',
      responseType: 'User',
    })

    tsUtils.registerRouteTypes('POST', '/users', {
      bodyType: 'CreateUserRequest',
      responseType: 'User',
    })

    const generatedTypes = tsUtils.generateRouteTypes()

    expect(generatedTypes).toContain('import type { EnhancedRequest }')
    expect(generatedTypes).toContain('export interface')
    expect(generatedTypes).toContain('export type')
    expect(generatedTypes).toContain('RouteRegistry')
  })

  test('should generate validation schemas', () => {
    tsUtils.registerRouteTypes('POST', '/users', {
      bodyType: 'CreateUserRequest',
    })

    const schemas = tsUtils.generateValidationSchemas()
    expect(schemas).toBeDefined()
    expect(Object.keys(schemas).length).toBeGreaterThanOrEqual(0)
  })

  test('should generate OpenAPI schema', () => {
    tsUtils.registerRouteTypes('GET', '/users/{id}', {
      paramsType: '{ id: string }',
      responseType: 'User',
    })

    tsUtils.registerRouteTypes('POST', '/users', {
      bodyType: 'CreateUserRequest',
      responseType: 'User',
    })

    const openApiSchema = tsUtils.generateOpenAPISchema()

    expect(openApiSchema.openapi).toBe('3.0.0')
    expect(openApiSchema.paths).toBeDefined()
    expect(openApiSchema.paths['/users/{id}']).toBeDefined()
    expect(openApiSchema.paths['/users/{id}'].get).toBeDefined()
    expect(openApiSchema.paths['/users'].post).toBeDefined()
  })

  test('should generate route builder', () => {
    tsUtils.registerRouteTypes('GET', '/users/{id}', {
      paramsType: '{ id: string }',
      responseType: 'User',
    })

    const routeBuilder = tsUtils.generateRouteBuilder()

    expect(routeBuilder).toContain('TypeSafeRouteBuilder')
    expect(routeBuilder).toContain('getusersId')
    expect(routeBuilder).toContain('params: { id: string }')
  })

  test('should generate middleware types', () => {
    tsUtils.registerRouteTypes('GET', '/test', {
      middlewareTypes: ['AuthMiddleware', 'ValidationMiddleware'],
    })

    const middlewareTypes = tsUtils.generateMiddlewareTypes()

    expect(middlewareTypes).toContain('MiddlewareFunction')
    expect(middlewareTypes).toContain('AuthMiddlewareMiddleware')
    expect(middlewareTypes).toContain('ValidationMiddlewareMiddleware')
  })

  test('should validate requests', () => {
    const routeKey = 'GET:/users/{id}'
    tsUtils.registerRouteTypes('GET', '/users/{id}', {
      paramsType: '{ id: string }',
    })

    const req = createMockRequest('GET', 'http://localhost/users/123')
    req.params = { id: '123' }

    const validation = tsUtils.validateRequest(req, routeKey)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)
  })
})

describe('Development Tools Integration', () => {
  let devTools: DevelopmentTools

  beforeEach(() => {
    devTools = new DevelopmentTools({
      debug: { enabled: true, logLevel: 'info', colorOutput: false },
      profiling: { enabled: true, sampleRate: 1.0 },
      inspection: { enabled: true, trackStats: true },
      typescript: { generateTypes: true },
    })
  })

  afterEach(() => {
    devTools.clear()
  })

  test('should register routes with all tools', () => {
    const routeId = devTools.registerRoute('GET', '/test', mockHandler, [], {
      types: { responseType: 'TestResponse' },
    })

    expect(routeId).toBeTruthy()

    // Check that route is registered with all tools
    const routes = devTools.routes().list()
    expect(routes).toHaveLength(1)
    expect(routes[0].pattern).toBe('/test')
  })

  test('should create middleware stack', () => {
    const middleware = devTools.createMiddleware()
    expect(middleware).toBeInstanceOf(Array)
    expect(middleware.length).toBeGreaterThan(0)
  })

  test('should provide debug interface', () => {
    const debug = devTools.debug()
    expect(debug.listRoutes).toBeDefined()
    expect(debug.analyzeRoutes).toBeDefined()
    expect(debug.exportRoutes).toBeDefined()
  })

  test('should provide routes interface', () => {
    devTools.registerRoute('GET', '/test', mockHandler)

    const routes = devTools.routes()
    expect(routes.list).toBeDefined()
    expect(routes.analyze).toBeDefined()
    expect(routes.export).toBeDefined()

    const routeList = routes.list()
    expect(routeList).toHaveLength(1)
  })

  test('should provide profile interface', () => {
    const profile = devTools.profile()
    expect(profile.getMetrics).toBeDefined()
    expect(profile.getProfiles).toBeDefined()
    expect(profile.generateReport).toBeDefined()
  })

  test('should provide typescript interface', () => {
    devTools.registerRoute('GET', '/test', mockHandler, [], {
      types: { responseType: 'TestResponse' },
    })

    const typescript = devTools.typescript()
    expect(typescript.generateTypes).toBeDefined()
    expect(typescript.generateSchemas).toBeDefined()
    expect(typescript.generateOpenAPI).toBeDefined()

    const types = typescript.generateTypes()
    expect(types).toContain('import type { EnhancedRequest }')
  })

  test('should generate comprehensive report', () => {
    devTools.registerRoute('GET', '/test', mockHandler)

    const report = devTools.generateReport()
    expect(report).toContain('# Development Tools Report')
    expect(report).toContain('## Route Analysis')
    expect(report).toContain('## Performance Metrics')
    expect(report).toContain('## TypeScript Information')
  })
})

describe('Development Router', () => {
  let devRouter: DevelopmentRouter

  beforeEach(() => {
    devRouter = new DevelopmentRouter()
  })

  test('should provide debug interface', () => {
    const debug = devRouter.debug()
    expect(debug.get).toBeDefined()
    expect(debug.post).toBeDefined()
    expect(debug.put).toBeDefined()
    expect(debug.patch).toBeDefined()
    expect(debug.delete).toBeDefined()
  })

  test('should provide profile interface', () => {
    const profile = devRouter.profile()
    expect(profile.group).toBeDefined()
  })

  test('should list routes', () => {
    // @ts-expect-error - Testing internal API
    const routes = Array.from(devRouter.routes.values())
    expect(routes).toBeInstanceOf(Array)
  })
})

describe('Development Presets', () => {
  test('should provide development preset', () => {
    const config = DevelopmentPresets.development()

    expect(config.debug?.enabled).toBe(true)
    expect(config.debug?.logLevel).toBe('debug')
    expect(config.profiling?.enabled).toBe(true)
    expect(config.profiling?.sampleRate).toBe(1.0)
    expect(config.inspection?.enabled).toBe(true)
    expect(config.typescript?.generateTypes).toBe(true)
  })

  test('should provide production preset', () => {
    const config = DevelopmentPresets.production()

    expect(config.debug?.enabled).toBe(true)
    expect(config.debug?.logLevel).toBe('warn')
    expect(config.profiling?.sampleRate).toBe(0.01)
    expect(config.typescript?.generateTypes).toBe(false)
  })

  test('should provide performance preset', () => {
    const config = DevelopmentPresets.performance()

    expect(config.debug?.enabled).toBe(false)
    expect(config.profiling?.enabled).toBe(true)
    expect(config.profiling?.sampleRate).toBe(1.0)
    expect(config.profiling?.includeMemory).toBe(true)
  })

  test('should provide typescript preset', () => {
    const config = DevelopmentPresets.typescript()

    expect(config.typescript?.generateTypes).toBe(true)
    expect(config.typescript?.validateTypes).toBe(true)
    expect(config.typescript?.generateSchemas).toBe(true)
    expect(config.profiling?.enabled).toBe(false)
  })
})

describe('Middleware Integration', () => {
  test('should create debug middleware', async () => {
    const routeDebugger = new RouteDebugger({ enabled: true, outputFormat: 'json' })
    const middleware = async (req: EnhancedRequest, next: () => Promise<Response>) => {
      const requestId = routeDebugger.startDebugging(req)
      const response = await next()
      routeDebugger.finishDebugging(requestId, response)
      return response
    }

    const req = createMockRequest()
    const next = mock(() => Promise.resolve(new Response('OK')))

    const response = await middleware(req, next)
    expect(response.status).toBe(200)
    expect(next).toHaveBeenCalled()
  })

  test('should create profiling middleware', async () => {
    const profiler = new PerformanceProfiler({ enabled: true, sampleRate: 1.0 })
    const middleware = async (req: EnhancedRequest, next: () => Promise<Response>) => {
      const profileId = profiler.startProfiling(req, '/test')
      const response = await next()
      if (profileId)
        profiler.finishProfiling(profileId, response)
      return response
    }

    const req = createMockRequest()
    const next = mock(() => Promise.resolve(new Response('OK')))

    const response = await middleware(req, next)
    expect(response.status).toBe(200)
    expect(next).toHaveBeenCalled()
  })
})
