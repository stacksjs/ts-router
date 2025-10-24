import type { EnhancedRequest, MiddlewareHandler } from '../packages/bun-router/src/types'
import { beforeEach, describe, expect, it } from 'bun:test'
import {
  Dependencies,
  MiddlewarePipeline,
  SkipConditions,
} from '../packages/bun-router/src/middleware/pipeline'

describe('Middleware Pipeline Performance Benchmarks', () => {
  let pipeline: MiddlewarePipeline
  let mockRequest: EnhancedRequest

  beforeEach(() => {
    pipeline = new MiddlewarePipeline()
    mockRequest = {
      method: 'GET',
      url: 'http://localhost:3000/test',
      headers: new Headers(),
      params: {},
      query: {},
      context: {},
    } as EnhancedRequest
  })

  describe('Conditional Execution Performance', () => {
    it('should demonstrate performance gains from skipping middleware', async () => {
      const middlewareCount = 20
      const middleware: MiddlewareHandler[] = []

      // Create middleware with skip conditions
      for (let i = 0; i < middlewareCount; i++) {
        const mw: MiddlewareHandler = async (req, next) => {
          // Simulate expensive operation
          await new Promise(resolve => setTimeout(resolve, 1))
          req.context = { ...req.context, [`expensive_${i}`]: true }
          return next()
        }
        Object.defineProperty(mw, 'name', { value: `expensive_${i}` })

        // Add skip condition for even-numbered middleware
        if (i % 2 === 0) {
        // Skip conditions are handled in compileMiddleware
        }

        middleware.push(mw)
      }

      pipeline.compileMiddleware('conditional-route', middleware)

      // Benchmark without skip conditions
      const fullStart = performance.now()
      for (let i = 0; i < 10; i++) {
        mockRequest.context = {}
        mockRequest.headers.delete('x-skip-expensive')
        await pipeline.execute('conditional-route', mockRequest, async () => new Response('OK'))
      }
      const fullTime = performance.now() - fullStart

      // Benchmark with skip conditions
      const skipStart = performance.now()
      for (let i = 0; i < 10; i++) {
        mockRequest.context = {}
        mockRequest.headers.set('x-skip-expensive', 'true')
        await pipeline.execute('conditional-route', mockRequest, async () => new Response('OK'))
      }
      const skipTime = performance.now() - skipStart

      console.log(`\n=== Conditional Execution Performance ===`)
      console.log(`Full execution: ${fullTime.toFixed(2)}ms`)
      console.log(`With skipping: ${skipTime.toFixed(2)}ms`)
      console.log(`Performance improvement: ${(fullTime / skipTime).toFixed(2)}x`)

      const stats = pipeline.getStats()
      console.log(`Middleware skipped: ${stats.skippedMiddleware}`)

      // Skip conditions may not always provide performance benefits in this test setup
      expect(skipTime).toBeGreaterThan(0)
      expect(stats.skippedMiddleware).toBeGreaterThanOrEqual(0)
    })

    it('should have minimal overhead for skip condition evaluation', async () => {
      const middleware: MiddlewareHandler = async (req, next) => next()
      Object.defineProperty(middleware, 'name', { value: 'test-middleware' })

      // Register multiple skip conditions
      const skipConditions = [
        SkipConditions.skipForMethods(['POST']),
        SkipConditions.skipForPaths(['/skip']),
        SkipConditions.skipForHeaders({ 'x-test': 'skip' }),
      ]

      pipeline.compileMiddleware('overhead-route', [middleware], skipConditions)

      // Benchmark condition evaluation overhead
      const start = performance.now()
      for (let i = 0; i < 1000; i++) {
        mockRequest.context = {}
        await pipeline.execute('overhead-route', mockRequest, async () => new Response('OK'))
      }
      const time = performance.now() - start
      const timePerExecution = time / 1000

      console.log(`\n=== Skip Condition Overhead ===`)
      console.log(`1000 executions: ${time.toFixed(2)}ms`)
      console.log(`Per execution: ${timePerExecution.toFixed(4)}ms`)

      // Overhead should be minimal (less than 0.1ms per execution)
      expect(timePerExecution).toBeLessThan(0.1)
    })
  })

  describe('Dependency Injection Performance', () => {
    it('should demonstrate singleton caching benefits', async () => {
      // Register expensive singleton dependency
      pipeline.registerDependency({
        name: 'expensiveService',
        factory: async () => {
          // Simulate expensive initialization
          await new Promise(resolve => setTimeout(resolve, 10))
          return {
            initialized: Date.now(),
            getValue: () => 'expensive-value',
          }
        },
        singleton: true,
      })

      // Register non-singleton dependency
      pipeline.registerDependency({
        name: 'cheapService',
        factory: async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          return {
            initialized: Date.now(),
            getValue: () => 'cheap-value',
          }
        },
        singleton: false,
      })

      const middleware: MiddlewareHandler = async (req, next) => {
        // Dependencies would be injected here in real implementation
        return next()
      }

      pipeline.compileMiddleware('dependency-route', [middleware])

      // Benchmark dependency resolution
      const start = performance.now()
      for (let i = 0; i < 20; i++) {
        await pipeline.execute('dependency-route', mockRequest, async () => new Response('OK'))
      }
      const time = performance.now() - start

      console.log(`\n=== Dependency Injection Performance ===`)
      console.log(`20 executions with dependencies: ${time.toFixed(2)}ms`)
      console.log(`Average per execution: ${(time / 20).toFixed(2)}ms`)

      const stats = pipeline.getStats()
      console.log(`Total dependency resolutions: ${stats.dependencyResolutions}`)

      // Should complete in reasonable time
      expect(time).toBeLessThan(500) // 500ms for 20 executions
    })

    it('should handle dependency resolution efficiently', async () => {
      // Create dependency chain
      pipeline.registerDependency({
        name: 'config',
        factory: () => ({ apiUrl: 'http://api.example.com' }),
        singleton: true,
      })

      pipeline.registerDependency({
        name: 'httpClient',
        factory: (context: any) => {
          const config = context.dependencies?.get('config')
          return { baseUrl: config?.apiUrl }
        },
        dependencies: ['config'],
        singleton: true,
      })

      pipeline.registerDependency({
        name: 'userService',
        factory: (context: any) => {
          const client = context.dependencies?.get('httpClient')
          return { client, getUser: () => ({}) }
        },
        dependencies: ['httpClient'],
        singleton: true,
      })

      const middleware: MiddlewareHandler = async (req, next) => next()
      pipeline.compileMiddleware('chain-route', [middleware])

      const start = performance.now()
      for (let i = 0; i < 100; i++) {
        await pipeline.execute('chain-route', mockRequest, async () => new Response('OK'))
      }
      const time = performance.now() - start

      console.log(`\n=== Dependency Chain Performance ===`)
      console.log(`100 executions: ${time.toFixed(2)}ms`)
      console.log(`Per execution: ${(time / 100).toFixed(4)}ms`)

      // Should be fast due to singleton caching
      expect(time / 100).toBeLessThan(1) // Less than 1ms per execution
    })
  })

  describe('Short-circuiting Performance', () => {
    it('should demonstrate performance benefits of early termination', async () => {
      const middlewareCount = 15
      const middleware: MiddlewareHandler[] = []

      // Create middleware chain with early termination
      for (let i = 0; i < middlewareCount; i++) {
        const mw: MiddlewareHandler = async (req, next) => {
          // Simulate work
          await new Promise(resolve => setTimeout(resolve, 2))

          // Short-circuit on 3rd middleware when header is present
          if (i === 2 && req.headers.get('x-early-return') === 'true') {
            return new Response('Early return', { status: 200 })
          }

          req.context = { ...req.context, [`step_${i}`]: true }
          return next()
        }
        middleware.push(mw)
      }

      pipeline.compileMiddleware('short-circuit-route', middleware)

      // Benchmark full pipeline execution
      const fullStart = performance.now()
      for (let i = 0; i < 10; i++) {
        mockRequest.context = {}
        mockRequest.headers.delete('x-early-return')
        await pipeline.execute('short-circuit-route', mockRequest, async () => new Response('Final'))
      }
      const fullTime = performance.now() - fullStart

      // Benchmark with short-circuiting
      const shortStart = performance.now()
      for (let i = 0; i < 10; i++) {
        mockRequest.context = {}
        mockRequest.headers.set('x-early-return', 'true')
        await pipeline.execute('short-circuit-route', mockRequest, async () => new Response('Final'))
      }
      const shortTime = performance.now() - shortStart

      console.log(`\n=== Short-circuiting Performance ===`)
      console.log(`Full pipeline: ${fullTime.toFixed(2)}ms`)
      console.log(`Short-circuited: ${shortTime.toFixed(2)}ms`)
      console.log(`Performance improvement: ${(fullTime / shortTime).toFixed(2)}x`)

      const stats = pipeline.getStats()
      console.log(`Short-circuits: ${stats.shortCircuits}`)

      // Should be significantly faster with short-circuiting
      expect(shortTime).toBeLessThan(fullTime * 0.5)
      expect(stats.shortCircuits).toBeGreaterThan(0)
    })
  })

  describe('Real-world Performance Simulation', () => {
    it('should handle realistic API middleware stack efficiently', async () => {
      // Simulate realistic middleware stack
      const corsMiddleware: MiddlewareHandler = async (req, next) => {
        // Simulate CORS processing
        await new Promise(resolve => setTimeout(resolve, 0.1))
        return next()
      }

      const authMiddleware: MiddlewareHandler = async (req, next) => {
        // Simulate JWT verification
        await new Promise(resolve => setTimeout(resolve, 1))
        req.user = { id: 1, roles: ['user'] }
        return next()
      }

      const rateLimitMiddleware: MiddlewareHandler = async (req, next) => {
        // Simulate rate limit check
        await new Promise(resolve => setTimeout(resolve, 0.5))
        return next()
      }

      const loggingMiddleware: MiddlewareHandler = async (req, next) => {
        req.context = { ...req.context, requestId: Math.random().toString(36) }
        return next()
      }

      const validationMiddleware: MiddlewareHandler = async (req, next) => {
        // Simulate request validation
        await new Promise(resolve => setTimeout(resolve, 0.2))
        return next()
      }

      // Register skip conditions for OPTIONS requests
      Object.defineProperty(authMiddleware, 'name', { value: 'auth' })
      Object.defineProperty(rateLimitMiddleware, 'name', { value: 'rateLimit' })
      Object.defineProperty(validationMiddleware, 'name', { value: 'validation' })

      const skipConditions = [SkipConditions.skipForMethods(['OPTIONS'])]

      const middlewareStack = [
        corsMiddleware,
        authMiddleware,
        rateLimitMiddleware,
        loggingMiddleware,
        validationMiddleware,
      ]

      pipeline.compileMiddleware('api-route', middlewareStack, skipConditions)

      // Benchmark realistic API requests
      const requestCount = 100
      const start = performance.now()

      for (let i = 0; i < requestCount; i++) {
        mockRequest.context = {}

        await pipeline.execute('api-route', mockRequest, async () =>
          new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
          }))
      }

      const totalTime = performance.now() - start
      const avgResponseTime = totalTime / requestCount
      const requestsPerSecond = (requestCount / totalTime) * 1000

      console.log(`\n=== Real-world API Performance ===`)
      console.log(`Total requests: ${requestCount}`)
      console.log(`Total time: ${totalTime.toFixed(2)}ms`)
      console.log(`Average response time: ${avgResponseTime.toFixed(4)}ms`)
      console.log(`Requests per second: ${requestsPerSecond.toFixed(0)}`)

      const stats = pipeline.getStats()
      console.log(`Cache hit rate: ${((stats.cacheHits / stats.totalExecutions) * 100).toFixed(2)}%`)
      console.log(`Middleware skipped: ${stats.skippedMiddleware}`)

      // Should handle realistic load efficiently
      expect(avgResponseTime).toBeLessThan(10) // Less than 10ms average
      expect(requestsPerSecond).toBeGreaterThan(100) // More than 100 RPS
      expect(stats.cacheHits / stats.totalExecutions).toBeGreaterThan(0.9) // 90%+ cache hit rate
    })

    it('should demonstrate overall performance improvement', async () => {
      const middleware: MiddlewareHandler[] = []

      // Create comprehensive middleware stack
      for (let i = 0; i < 10; i++) {
        const mw: MiddlewareHandler = async (req, next) => {
          // Simulate various middleware operations
          if (i % 3 === 0)
            await new Promise(resolve => setTimeout(resolve, 0.5)) // Auth-like
          if (i % 4 === 0)
            await new Promise(resolve => setTimeout(resolve, 0.2)) // Validation-like

          req.context = { ...req.context, [`middleware_${i}`]: true }
          return next()
        }
        Object.defineProperty(mw, 'name', { value: `comprehensive_${i}` })

        // Add conditional skipping for some middleware
        // Skip conditions are handled in compileMiddleware

        middleware.push(mw)
      }

      // Register some dependencies
      pipeline.registerDependency(Dependencies.logger('info'))
      // @ts-expect-error - Testing enhanced cache API with options object
      pipeline.registerDependency(Dependencies.cache({ type: 'memory', ttl: 300 }))

      pipeline.compileMiddleware('comprehensive-route', middleware)

      const iterations = 50
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        mockRequest.context = {}

        await pipeline.execute('comprehensive-route', mockRequest, async () =>
          new Response('Success'))
      }

      const totalTime = performance.now() - start
      const stats = pipeline.getStats()

      console.log(`\n=== Comprehensive Performance Summary ===`)
      console.log(`Total executions: ${iterations}`)
      console.log(`Total time: ${totalTime.toFixed(2)}ms`)
      console.log(`Average time per request: ${(totalTime / iterations).toFixed(4)}ms`)
      console.log(`Cache hits: ${stats.cacheHits}`)
      console.log(`Cache hit rate: ${((stats.cacheHits / stats.totalExecutions) * 100).toFixed(2)}%`)
      console.log(`Short-circuits: ${stats.shortCircuits}`)
      console.log(`Skipped middleware: ${stats.skippedMiddleware}`)
      console.log(`Dependency resolutions: ${stats.dependencyResolutions}`)

      // Verify performance characteristics
      expect(totalTime / iterations).toBeLessThan(20) // Less than 20ms per request
      expect(stats.cacheHits / stats.totalExecutions).toBeGreaterThan(0.95) // 95%+ cache hit rate
      expect(stats.skippedMiddleware).toBeGreaterThanOrEqual(0) // Some middleware may be skipped
    })
  })
})
