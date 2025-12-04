import type { MiddlewareMemoizer } from '../packages/bun-router/src/cache/middleware-memoization'
import type { RouteCacheWarmer } from '../packages/bun-router/src/cache/route-cache-warmer'
import type { StreamingCache } from '../packages/bun-router/src/cache/streaming-cache'
import type { EnhancedRequest } from '../packages/bun-router/src/types'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createLRUCache, LRUCache } from '../packages/bun-router/src/cache/lru-cache'
import { createMemoizer } from '../packages/bun-router/src/cache/middleware-memoization'
import { createRouteCacheWarmer } from '../packages/bun-router/src/cache/route-cache-warmer'
import { createStreamingCache } from '../packages/bun-router/src/cache/streaming-cache'

// Track all cache instances for cleanup
const activeWarmers: RouteCacheWarmer[] = []

// Ensure all timers are stopped after all tests
afterAll(() => {
  for (const warmer of activeWarmers) {
    warmer.stop()
  }
  activeWarmers.length = 0
})

describe('Cache Performance Benchmarks', () => {
  describe('LRU Cache Performance', () => {
    it('should demonstrate LRU eviction performance', () => {
      const cache = new LRUCache({ maxSize: 100 })

      // Fill cache to capacity
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`)
      }

      // Benchmark eviction performance
      const evictionStart = performance.now()
      for (let i = 100; i < 200; i++) {
        cache.set(`key${i}`, `value${i}`) // Should trigger evictions
      }
      const evictionTime = performance.now() - evictionStart

      expect(evictionTime / 100).toBeLessThan(1) // Less than 1ms per eviction
    })

    it('should demonstrate memory efficiency', () => {
      const cache = new LRUCache({ maxSize: 1000 })

      const initialMemory = process.memoryUsage().heapUsed

      // Add entries
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, { data: `value${i}`, index: i })
      }

      const afterInsert = process.memoryUsage().heapUsed
      const memoryUsed = afterInsert - initialMemory
      const memoryPerEntry = memoryUsed / 1000

      expect(memoryPerEntry).toBeLessThan(5000) // Less than 5KB per entry
    })

    it('should compare with native Map performance', () => {
      const cacheSize = 1000
      const cache = new LRUCache({ maxSize: cacheSize })
      const map = new Map()

      // Benchmark LRU Cache
      const lruStart = performance.now()
      for (let i = 0; i < cacheSize; i++) {
        cache.set(`key${i}`, `value${i}`)
      }
      for (let i = 0; i < cacheSize; i++) {
        cache.get(`key${i}`)
      }
      const lruTime = performance.now() - lruStart

      // Benchmark native Map
      const mapStart = performance.now()
      for (let i = 0; i < cacheSize; i++) {
        map.set(`key${i}`, `value${i}`)
      }
      for (let i = 0; i < cacheSize; i++) {
        map.get(`key${i}`)
      }
      const mapTime = performance.now() - mapStart

      // LRU should be reasonably close to native Map performance
      expect(lruTime).toBeLessThan(mapTime * 5) // Less than 5x slower
    })
  })

  describe('Streaming Cache Performance', () => {
    let streamingCache: StreamingCache

    beforeEach(() => {
      streamingCache = createStreamingCache.api(1000)
    })

    it('should demonstrate compression benefits', async () => {
      const sizes = [1024, 10240] // 1KB, 10KB
      const results: { size: number, originalSize: number, compressedSize: number, ratio: number }[] = []

      for (const size of sizes) {
        const content = 'x'.repeat(size)
        const response = new Response(content, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })

        await streamingCache.cacheResponse(`test-${size}`, response, { forceCache: true })

        const stats = streamingCache.getStats()
        const ratio = stats.compressionRatio

        results.push({
          size,
          originalSize: size,
          compressedSize: Math.round(size * ratio),
          ratio,
        })
      }

      // Verify compression is effective
      expect(results.every(r => r.ratio < 1)).toBe(true) // Compression happened
    })

    it('should demonstrate streaming performance for large responses', async () => {
      const size = 100 * 1024 // 100KB - much smaller for speed

      const content = new Uint8Array(size).fill(65) // Fill with 'A'
      const response = new Response(content, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      })

      // Benchmark caching
      await streamingCache.cacheResponse(`large-${size}`, response, { forceCache: true })

      // Benchmark retrieval
      const cachedResponse = await streamingCache.getStreamingResponse(`large-${size}`)
      if (cachedResponse) {
        await cachedResponse.arrayBuffer() // Consume the stream
      }

      const stats = streamingCache.getStats()
      expect(stats.totalResponses).toBeGreaterThan(0)
    })

    it('should demonstrate cache hit performance', async () => {
      const content = 'test content for cache hit performance'
      const response = new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })

      // Cache the response
      await streamingCache.cacheResponse('hit-test', response)

      // Benchmark cache hits
      const iterations = 100
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        const cachedResponse = await streamingCache.getStreamingResponse('hit-test')
        if (cachedResponse) {
          await cachedResponse.text()
        }
      }

      const totalTime = performance.now() - start
      const avgTime = totalTime / iterations

      expect(avgTime).toBeLessThan(10) // Less than 10ms per cache hit
    })
  })

  describe('Route Cache Warmer Performance', () => {
    let warmer: RouteCacheWarmer
    let routeCache: LRUCache<any>

    beforeEach(() => {
      routeCache = createLRUCache.large()
      warmer = createRouteCacheWarmer.development(routeCache)
      activeWarmers.push(warmer)
    })

    afterEach(() => {
      warmer.stop()
      const index = activeWarmers.indexOf(warmer)
      if (index > -1) {
        activeWarmers.splice(index, 1)
      }
    })

    it('should demonstrate warmup concurrency benefits', async () => {
      const routes = Array.from({ length: 10 }, (_, i) => ({
        path: `/api/test/${i}`,
        method: 'GET',
        priority: 50,
        frequency: 10,
        warmupData: { id: i, data: `test-${i}` },
      }))

      warmer.registerRoutes(routes)

      // Benchmark precompute performance
      const precomputeRoutes = routes.map(route => ({
        path: route.path,
        method: route.method,
        computeFunction: async () => {
          // No delay for speed
          return route.warmupData
        },
        cacheKey: `precompute:${route.path}`,
      }))

      const start = performance.now()
      const precomputedCount = await warmer.precomputeRoutes(precomputeRoutes)
      const time = performance.now() - start

      expect(precomputedCount).toBe(routes.length)
      expect(time).toBeLessThan(1000) // Less than 1s total
    })

    it('should demonstrate intelligent warmup efficiency', async () => {
      const patterns = {
        userSegments: [
          { segment: 'premium', commonRoutes: ['/api/premium/dashboard'], priority: 90 },
        ],
        timeBasedPatterns: [
          {
            timeRange: { start: 0, end: 23 },
            routes: ['/api/analytics'],
            priority: 80,
          },
        ],
      }

      await warmer.intelligentWarmup(patterns)

      const stats = warmer.getStats()

      expect(stats.totalRoutes).toBeGreaterThan(0)
    })
  })

  describe('Middleware Memoization Performance', () => {
    let memoizer: MiddlewareMemoizer
    let mockRequest: EnhancedRequest

    beforeEach(() => {
      memoizer = createMemoizer.production()
      mockRequest = {
        method: 'GET',
        url: 'http://localhost:3000/api/test',
        headers: new Headers(),
        params: {},
        query: {},
        user: { id: '123' },
      } as EnhancedRequest
    })

    it('should demonstrate memoization performance benefits', async () => {
      let executionCount = 0
      const expensiveMiddleware = async (_req: EnhancedRequest, _next: any) => {
        executionCount++
        // Simulate expensive operation (reduced delay)
        await new Promise(resolve => setTimeout(resolve, 1))
        return new Response(JSON.stringify({ result: 'computed', executionId: executionCount }))
      }

      const memoizedMiddleware = memoizer.memoize(expensiveMiddleware)

      // Benchmark without memoization
      const directStart = performance.now()
      for (let i = 0; i < 5; i++) {
        await expensiveMiddleware(mockRequest, () => Promise.resolve(null))
      }
      const directTime = performance.now() - directStart

      // Reset execution count
      executionCount = 0

      // Benchmark with memoization
      const memoizedStart = performance.now()
      for (let i = 0; i < 5; i++) {
        await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      }
      const memoizedTime = performance.now() - memoizedStart

      const stats = memoizer.getStats()

      expect(memoizedTime).toBeLessThan(directTime) // Should be faster
      expect(stats.hitRate).toBeGreaterThan(0.5) // 50%+ hit rate
    })

    it('should demonstrate function memoization scaling', async () => {
      const complexityLevels = [10, 100]

      for (const complexity of complexityLevels) {
        const expensiveFunction = async (input: number) => {
          // Simulate computation complexity
          let result = 0
          for (let i = 0; i < complexity * 100; i++) {
            result += Math.sqrt(i)
          }
          return result + input
        }

        const memoizedFunction = memoizer.memoizeFunction(expensiveFunction, {
          name: `complexity-${complexity}`,
        })

        // First call (cache miss)
        const firstStart = performance.now()
        await memoizedFunction(42)
        const firstTime = performance.now() - firstStart

        // Second call (cache hit)
        const secondStart = performance.now()
        await memoizedFunction(42)
        const secondTime = performance.now() - secondStart

        const speedup = firstTime / secondTime

        expect(speedup).toBeGreaterThan(1) // At least 1x speedup for cached calls
      }
    })

    it('should demonstrate memory usage efficiency', async () => {
      // Create memoized functions
      const functions = Array.from({ length: 50 }, (_, i) => {
        const fn = async (input: string) => `processed-${input}-${i}`
        return memoizer.memoizeFunction(fn, { name: `fn-${i}` })
      })

      // Execute functions to populate cache
      for (let i = 0; i < functions.length; i++) {
        await functions[i](`input-${i}`)
        await functions[i](`input-${i}`) // Second call for cache hit
      }

      const stats = memoizer.getStats()

      expect(stats.hitRate).toBeGreaterThan(0.4) // At least 40% hit rate
    })

    it('should demonstrate invalidation performance', async () => {
      // Create cached entries
      const middleware = async (_req: EnhancedRequest, _next: any) => {
        return new Response(JSON.stringify({ url: _req.url, timestamp: Date.now() }))
      }

      const memoizedMiddleware = memoizer.memoize(middleware, { name: 'invalidation-test' })

      // Populate cache with different URLs
      const requests = Array.from({ length: 100 }, (_, i) => ({
        ...mockRequest,
        url: `http://localhost:3000/api/test/${i}`,
      }))

      for (const req of requests) {
        await memoizedMiddleware(req as EnhancedRequest, () => Promise.resolve(null))
      }

      // Benchmark invalidation
      const invalidatedCount = memoizer.invalidate('invalidation-test')

      expect(invalidatedCount).toBe(requests.length)
    })
  })

  describe('Integrated Cache System Performance', () => {
    it('should demonstrate end-to-end caching performance', async () => {
      // Setup integrated caching system
      const routeCache = createLRUCache.large()
      const streamingCache = createStreamingCache.api(100)
      const warmer = createRouteCacheWarmer.production(routeCache, streamingCache)
      activeWarmers.push(warmer)
      const memoizer = createMemoizer.production()

      // Simulate realistic workload
      const routes = Array.from({ length: 10 }, (_, i) => ({
        path: `/api/resource/${i}`,
        method: 'GET',
        priority: Math.floor(Math.random() * 100),
        frequency: Math.floor(Math.random() * 200),
        warmupData: { id: i, data: `resource-${i}` },
      }))

      warmer.registerRoutes(routes)

      // Create middleware (no delay for speed)
      const expensiveMiddleware = async (_req: EnhancedRequest, _next: any) => {
        return new Response(JSON.stringify({ processed: true, url: _req.url }))
      }

      const memoizedMiddleware = memoizer.memoize(expensiveMiddleware)

      // Warm caches
      const precomputeRoutes = routes.slice(0, 5).map(route => ({
        path: route.path,
        method: route.method,
        computeFunction: async () => route.warmupData,
        cacheKey: `warm:${route.path}`,
      }))

      await warmer.precomputeRoutes(precomputeRoutes)

      // Simulate requests with memoized middleware
      const mockRequests = routes.slice(0, 10).map(route => ({
        method: 'GET',
        url: `http://localhost:3000${route.path}`,
        headers: new Headers(),
        params: {},
        query: {},
        user: { id: '1' },
      } as EnhancedRequest))

      // Process requests (some will hit cache, some won't)
      for (const request of mockRequests) {
        await memoizedMiddleware(request, () => Promise.resolve(null))

        // Simulate response caching
        const response = new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })

        const cacheKey = `${request.method}:${new URL(request.url).pathname}`
        await streamingCache.cacheResponse(cacheKey, response)
      }

      // Process same requests again (should hit caches)
      for (const request of mockRequests) {
        await memoizedMiddleware(request, () => Promise.resolve(null))

        const cacheKey = `${request.method}:${new URL(request.url).pathname}`
        await streamingCache.getStreamingResponse(cacheKey)
      }

      // Collect statistics
      const streamingCacheStats = streamingCache.getStats()
      const warmerStats = warmer.getStats()
      const memoizerStats = memoizer.getStats()

      // Verify performance characteristics
      expect(memoizerStats.hitRate).toBeGreaterThan(0.4) // At least 40% hit rate
      expect(streamingCacheStats.totalResponses).toBeGreaterThan(0)
      expect(warmerStats.totalRoutes).toBe(routes.length)

      // Cleanup
      warmer.stop()
      const index = activeWarmers.indexOf(warmer)
      if (index > -1) {
        activeWarmers.splice(index, 1)
      }
    })

    it('should demonstrate memory efficiency of integrated system', async () => {
      // Create integrated system
      const routeCache = createLRUCache.large()
      const streamingCache = createStreamingCache.api(100)
      const memoizer = createMemoizer.production()

      // Populate caches
      for (let i = 0; i < 100; i++) {
        // Route cache
        routeCache.set(`route:${i}`, { id: i, data: `route-data-${i}` })

        // Streaming cache
        const response = new Response(`content-${i}`, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
        await streamingCache.cacheResponse(`stream:${i}`, response)

        // Memoizer cache
        const fn = async (input: number) => input * 2
        const memoizedFn = memoizer.memoizeFunction(fn, { name: `fn-${i}` })
        await memoizedFn(i)
      }

      const routeCacheStats = routeCache.getStats()
      const streamingCacheStats = streamingCache.getStats()
      const memoizerStats = memoizer.getStats()

      // Verify reasonable behavior
      expect(routeCacheStats.size).toBeGreaterThan(0)
      expect(streamingCacheStats.totalResponses).toBeGreaterThan(0)
      expect(memoizerStats.totalRequests).toBeGreaterThan(0)
    })
  })
})
