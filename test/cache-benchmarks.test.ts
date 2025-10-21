import type { MiddlewareMemoizer } from '../packages/bun-router/src/cache/middleware-memoization'
import type { RouteCacheWarmer } from '../packages/bun-router/src/cache/route-cache-warmer'
import type { StreamingCache } from '../packages/bun-router/src/cache/streaming-cache'
import type { EnhancedRequest } from '../packages/bun-router/src/types'
import { beforeEach, describe, expect, it } from 'bun:test'
import { createLRUCache, LRUCache } from '../packages/bun-router/src/cache/lru-cache'
import { createMemoizer } from '../packages/bun-router/src/cache/middleware-memoization'
import { createRouteCacheWarmer } from '../packages/bun-router/src/cache/route-cache-warmer'
import { createStreamingCache } from '../packages/bun-router/src/cache/streaming-cache'

describe('Cache Performance Benchmarks', () => {
  describe('LRU Cache Performance', () => {
    it('should demonstrate performance scaling with cache size', () => {
      const sizes = [100, 1000, 10000]
      const results: { size: number, setTime: number, getTime: number }[] = []

      console.log('\n=== LRU Cache Scaling Performance ===')
      console.log('Size\tSet Time (ms)\tGet Time (ms)\tHit Rate')

      for (const size of sizes) {
        const cache = new LRUCache({ maxSize: size })

        // Benchmark set operations
        const setStart = performance.now()
        for (let i = 0; i < size; i++) {
          cache.set(`key${i}`, `value${i}`)
        }
        const setTime = performance.now() - setStart

        // Benchmark get operations
        const getStart = performance.now()
        let hits = 0
        for (let i = 0; i < size; i++) {
          if (cache.get(`key${i}`))
            hits++
        }
        const getTime = performance.now() - getStart

        const hitRate = hits / size
        results.push({ size, setTime, getTime })

        console.log(`${size}\t${setTime.toFixed(2)}\t\t${getTime.toFixed(2)}\t\t${(hitRate * 100).toFixed(1)}%`)
      }

      // Verify performance characteristics
      expect(results[0].setTime).toBeLessThan(results[2].setTime * 0.5) // Small cache should be much faster
      expect(results.every(r => r.getTime < 50)).toBe(true) // All get operations should be fast
    })

    it('should demonstrate LRU eviction performance', () => {
      const cache = new LRUCache({ maxSize: 1000 })

      // Fill cache to capacity
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, `value${i}`)
      }

      // Benchmark eviction performance
      const evictionStart = performance.now()
      for (let i = 1000; i < 2000; i++) {
        cache.set(`key${i}`, `value${i}`) // Should trigger evictions
      }
      const evictionTime = performance.now() - evictionStart

      console.log('\n=== LRU Eviction Performance ===')
      console.log(`1000 evictions: ${evictionTime.toFixed(2)}ms`)
      console.log(`Per eviction: ${(evictionTime / 1000).toFixed(4)}ms`)

      expect(evictionTime / 1000).toBeLessThan(0.1) // Less than 0.1ms per eviction
    })

    it('should demonstrate memory efficiency', () => {
      const cache = new LRUCache({ maxSize: 10000 })

      const initialMemory = process.memoryUsage().heapUsed

      // Add large number of entries
      for (let i = 0; i < 10000; i++) {
        cache.set(`key${i}`, { data: `value${i}`, index: i })
      }

      const afterInsert = process.memoryUsage().heapUsed
      const memoryUsed = afterInsert - initialMemory
      const memoryPerEntry = memoryUsed / 10000

      console.log('\n=== LRU Memory Efficiency ===')
      console.log(`Total memory: ${(memoryUsed / 1024 / 1024).toFixed(2)} MB`)
      console.log(`Memory per entry: ${memoryPerEntry.toFixed(0)} bytes`)
      console.log(`Cache stats memory: ${(cache.getStats().memoryUsage / 1024 / 1024).toFixed(2)} MB`)

      expect(memoryPerEntry).toBeLessThan(1000) // Less than 1KB per entry
    })

    it('should compare with native Map performance', () => {
      const cacheSize = 10000
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

      console.log('\n=== LRU vs Native Map Performance ===')
      console.log(`LRU Cache: ${lruTime.toFixed(2)}ms`)
      console.log(`Native Map: ${mapTime.toFixed(2)}ms`)
      console.log(`Overhead: ${((lruTime / mapTime - 1) * 100).toFixed(1)}%`)

      // LRU should be reasonably close to native Map performance
      expect(lruTime).toBeLessThan(mapTime * 3) // Less than 3x slower
    })
  })

  describe('Streaming Cache Performance', () => {
    let streamingCache: StreamingCache

    beforeEach(() => {
      streamingCache = createStreamingCache.api(1000)
    })

    it('should demonstrate compression benefits', async () => {
      const sizes = [1024, 10240, 102400] // 1KB, 10KB, 100KB
      const results: { size: number, originalSize: number, compressedSize: number, ratio: number }[] = []

      console.log('\n=== Streaming Cache Compression Performance ===')
      console.log('Size\tOriginal\tCompressed\tRatio\tTime (ms)')

      for (const size of sizes) {
        const content = 'x'.repeat(size)
        const response = new Response(content, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })

        const start = performance.now()
        await streamingCache.cacheResponse(`test-${size}`, response, { forceCache: true })
        const time = performance.now() - start

        const stats = streamingCache.getStats()
        const ratio = stats.compressionRatio

        results.push({
          size,
          originalSize: size,
          compressedSize: Math.round(size * ratio),
          ratio,
        })

        console.log(`${size}\t${size}\t\t${Math.round(size * ratio)}\t\t${ratio.toFixed(2)}\t${time.toFixed(2)}`)
      }

      // Verify compression is effective
      expect(results.every(r => r.ratio < 0.8)).toBe(true) // At least 20% compression
    })

    it('should demonstrate streaming performance for large responses', async () => {
      const sizes = [1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024] // 1MB, 5MB, 10MB

      console.log('\n=== Large Response Streaming Performance ===')
      console.log('Size\tCache Time (ms)\tRetrieve Time (ms)\tThroughput (MB/s)')

      for (const size of sizes) {
        const content = new Uint8Array(size).fill(65) // Fill with 'A'
        const response = new Response(content, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })

        // Benchmark caching
        const cacheStart = performance.now()
        await streamingCache.cacheResponse(`large-${size}`, response, { forceCache: true })
        const cacheTime = performance.now() - cacheStart

        // Benchmark retrieval
        const retrieveStart = performance.now()
        const cachedResponse = await streamingCache.getStreamingResponse(`large-${size}`)
        if (cachedResponse) {
          await cachedResponse.arrayBuffer() // Consume the stream
        }
        const retrieveTime = performance.now() - retrieveStart

        const throughput = (size / 1024 / 1024) / (retrieveTime / 1000)

        console.log(`${(size / 1024 / 1024).toFixed(0)}MB\t${cacheTime.toFixed(2)}\t\t${retrieveTime.toFixed(2)}\t\t${throughput.toFixed(1)}`)
      }

      const stats = streamingCache.getStats()
      expect(stats.totalResponses).toBe(sizes.length)
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
      const iterations = 1000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        const cachedResponse = await streamingCache.getStreamingResponse('hit-test')
        if (cachedResponse) {
          await cachedResponse.text()
        }
      }

      const totalTime = performance.now() - start
      const avgTime = totalTime / iterations

      console.log('\n=== Cache Hit Performance ===')
      console.log(`${iterations} cache hits: ${totalTime.toFixed(2)}ms`)
      console.log(`Average per hit: ${avgTime.toFixed(4)}ms`)
      console.log(`Hits per second: ${(iterations / (totalTime / 1000)).toFixed(0)}`)

      expect(avgTime).toBeLessThan(1) // Less than 1ms per cache hit
    })
  })

  describe('Route Cache Warmer Performance', () => {
    let warmer: RouteCacheWarmer
    let routeCache: LRUCache<any>

    beforeEach(() => {
      routeCache = createLRUCache.large()
      warmer = createRouteCacheWarmer.development(routeCache)
    })

    it('should demonstrate warmup concurrency benefits', async () => {
      const routes = Array.from({ length: 20 }, (_, i) => ({
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
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
          return route.warmupData
        },
        cacheKey: `precompute:${route.path}`,
      }))

      const start = performance.now()
      const precomputedCount = await warmer.precomputeRoutes(precomputeRoutes)
      const time = performance.now() - start

      console.log('\n=== Route Warmup Performance ===')
      console.log(`Precomputed ${precomputedCount} routes in ${time.toFixed(2)}ms`)
      console.log(`Average per route: ${(time / precomputedCount).toFixed(2)}ms`)

      expect(precomputedCount).toBe(routes.length)
      expect(time / precomputedCount).toBeLessThan(50) // Less than 50ms per route
    })

    it('should demonstrate intelligent warmup efficiency', async () => {
      const patterns = {
        userSegments: [
          { segment: 'premium', commonRoutes: ['/api/premium/dashboard'], priority: 90 },
          { segment: 'basic', commonRoutes: ['/api/basic/profile'], priority: 70 },
        ],
        timeBasedPatterns: [
          {
            timeRange: { start: 0, end: 23 },
            routes: ['/api/analytics', '/api/reports'],
            priority: 80,
          },
        ],
      }

      const start = performance.now()
      await warmer.intelligentWarmup(patterns)
      const time = performance.now() - start

      const stats = warmer.getStats()

      console.log('\n=== Intelligent Warmup Performance ===')
      console.log(`Registered ${stats.totalRoutes} routes in ${time.toFixed(2)}ms`)
      console.log(`Routes per second: ${(stats.totalRoutes / (time / 1000)).toFixed(0)}`)

      expect(stats.totalRoutes).toBeGreaterThan(0)
      expect(time).toBeLessThan(1000) // Should complete within reasonable time
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
        // Simulate expensive operation
        await new Promise(resolve => setTimeout(resolve, 10))
        return new Response(JSON.stringify({ result: 'computed', executionId: executionCount }))
      }

      const memoizedMiddleware = memoizer.memoize(expensiveMiddleware)

      // Benchmark without memoization
      const directStart = performance.now()
      for (let i = 0; i < 10; i++) {
        await expensiveMiddleware(mockRequest, () => Promise.resolve(null))
      }
      const directTime = performance.now() - directStart

      // Reset execution count
      executionCount = 0

      // Benchmark with memoization
      const memoizedStart = performance.now()
      for (let i = 0; i < 10; i++) {
        await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      }
      const memoizedTime = performance.now() - memoizedStart

      const speedup = directTime / memoizedTime
      const stats = memoizer.getStats()

      console.log('\n=== Memoization Performance Benefits ===')
      console.log(`Direct execution: ${directTime.toFixed(2)}ms`)
      console.log(`Memoized execution: ${memoizedTime.toFixed(2)}ms`)
      console.log(`Speedup: ${speedup.toFixed(2)}x`)
      console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`)
      console.log(`Time saved: ${stats.totalTimeSaved.toFixed(2)}ms`)

      expect(speedup).toBeGreaterThan(2) // At least 2x speedup
      expect(stats.hitRate).toBeGreaterThan(0.8) // 80%+ hit rate
    })

    it('should demonstrate function memoization scaling', async () => {
      const complexityLevels = [10, 100, 1000]

      console.log('\n=== Function Memoization Scaling ===')
      console.log('Complexity\tFirst Call (ms)\tCached Call (ms)\tSpeedup')

      for (const complexity of complexityLevels) {
        const expensiveFunction = async (input: number) => {
          // Simulate computation complexity
          let result = 0
          for (let i = 0; i < complexity * 1000; i++) {
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

        console.log(`${complexity}\t\t${firstTime.toFixed(2)}\t\t${secondTime.toFixed(4)}\t\t${speedup.toFixed(0)}x`)

        expect(speedup).toBeGreaterThan(10) // At least 10x speedup for cached calls
      }
    })

    it('should demonstrate memory usage efficiency', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Create many memoized functions
      const functions = Array.from({ length: 100 }, (_, i) => {
        const fn = async (input: string) => `processed-${input}-${i}`
        return memoizer.memoizeFunction(fn, { name: `fn-${i}` })
      })

      // Execute functions to populate cache
      for (let i = 0; i < functions.length; i++) {
        await functions[i](`input-${i}`)
        await functions[i](`input-${i}`) // Second call for cache hit
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryUsed = finalMemory - initialMemory
      const stats = memoizer.getStats()

      console.log('\n=== Memoization Memory Usage ===')
      console.log(`Functions created: ${functions.length}`)
      console.log(`Total requests: ${stats.totalRequests}`)
      console.log(`Memory used: ${(memoryUsed / 1024 / 1024).toFixed(2)} MB`)
      console.log(`Memory per function: ${(memoryUsed / functions.length / 1024).toFixed(2)} KB`)
      console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`)

      expect(memoryUsed / functions.length).toBeLessThan(50 * 1024) // Less than 50KB per function
      expect(stats.hitRate).toBeGreaterThan(0.4) // At least 40% hit rate
    })

    it('should demonstrate invalidation performance', async () => {
      // Create many cached entries
      const middleware = async (_req: EnhancedRequest, _next: any) => {
        return new Response(JSON.stringify({ url: _req.url, timestamp: Date.now() }))
      }

      const memoizedMiddleware = memoizer.memoize(middleware, { name: 'invalidation-test' })

      // Populate cache with different URLs
      const requests = Array.from({ length: 1000 }, (_, i) => ({
        ...mockRequest,
        url: `http://localhost:3000/api/test/${i}`,
      }))

      for (const req of requests) {
        await memoizedMiddleware(req as EnhancedRequest, () => Promise.resolve(null))
      }

      // Benchmark invalidation
      const invalidationStart = performance.now()
      const invalidatedCount = memoizer.invalidate('invalidation-test')
      const invalidationTime = performance.now() - invalidationStart

      console.log('\n=== Cache Invalidation Performance ===')
      console.log(`Invalidated ${invalidatedCount} entries in ${invalidationTime.toFixed(2)}ms`)
      console.log(`Per entry: ${(invalidationTime / invalidatedCount).toFixed(4)}ms`)

      expect(invalidatedCount).toBe(requests.length)
      expect(invalidationTime / invalidatedCount).toBeLessThan(0.01) // Less than 0.01ms per entry
    })
  })

  describe('Integrated Cache System Performance', () => {
    it('should demonstrate end-to-end caching performance', async () => {
      // Setup integrated caching system
      const routeCache = createLRUCache.large()
      const streamingCache = createStreamingCache.api(1000)
      const warmer = createRouteCacheWarmer.production(routeCache, streamingCache)
      const memoizer = createMemoizer.production()

      // Simulate realistic workload
      const routes = Array.from({ length: 50 }, (_, i) => ({
        path: `/api/resource/${i}`,
        method: 'GET',
        priority: Math.floor(Math.random() * 100),
        frequency: Math.floor(Math.random() * 200),
        warmupData: { id: i, data: `resource-${i}` },
      }))

      warmer.registerRoutes(routes)

      // Create expensive middleware
      const expensiveMiddleware = async (_req: EnhancedRequest, _next: any) => {
        await new Promise(resolve => setTimeout(resolve, 2))
        return new Response(JSON.stringify({ processed: true, url: _req.url }))
      }

      const memoizedMiddleware = memoizer.memoize(expensiveMiddleware)

      // Benchmark integrated system
      const start = performance.now()

      // Warm caches
      const precomputeRoutes = routes.slice(0, 20).map(route => ({
        path: route.path,
        method: route.method,
        computeFunction: async () => route.warmupData,
        cacheKey: `warm:${route.path}`,
      }))

      await warmer.precomputeRoutes(precomputeRoutes)

      // Simulate requests with memoized middleware
      const mockRequests = routes.slice(0, 30).map(route => ({
        method: 'GET',
        url: `http://localhost:3000${route.path}`,
        headers: new Headers(),
        params: {},
        query: {},
        user: { id: Math.floor(Math.random() * 10).toString() },
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

      const totalTime = performance.now() - start

      // Collect statistics
      const routeCacheStats = routeCache.getStats()
      const streamingCacheStats = streamingCache.getStats()
      const warmerStats = warmer.getStats()
      const memoizerStats = memoizer.getStats()

      console.log('\n=== Integrated Cache System Performance ===')
      console.log(`Total execution time: ${totalTime.toFixed(2)}ms`)
      console.log(`Requests processed: ${mockRequests.length * 2}`)
      console.log(`Average per request: ${(totalTime / (mockRequests.length * 2)).toFixed(2)}ms`)
      console.log('')
      console.log('Route Cache:')
      console.log(`  Size: ${routeCacheStats.size}`)
      console.log(`  Hit rate: ${(routeCacheStats.hitRate * 100).toFixed(1)}%`)
      console.log('Streaming Cache:')
      console.log(`  Responses: ${streamingCacheStats.totalResponses}`)
      console.log(`  Hit rate: ${((streamingCacheStats.streamingHits / (streamingCacheStats.streamingHits + streamingCacheStats.streamingMisses)) * 100).toFixed(1)}%`)
      console.log('Warmer:')
      console.log(`  Routes: ${warmerStats.totalRoutes}`)
      console.log(`  Successful warmups: ${warmerStats.successfulWarmups}`)
      console.log('Memoizer:')
      console.log(`  Requests: ${memoizerStats.totalRequests}`)
      console.log(`  Hit rate: ${(memoizerStats.hitRate * 100).toFixed(1)}%`)
      console.log(`  Time saved: ${memoizerStats.totalTimeSaved.toFixed(2)}ms`)

      // Verify performance characteristics
      expect(totalTime / (mockRequests.length * 2)).toBeLessThan(10) // Less than 10ms per request
      expect(memoizerStats.hitRate).toBeGreaterThan(0.4) // At least 40% hit rate
      expect(streamingCacheStats.totalResponses).toBeGreaterThan(0)
      expect(warmerStats.totalRoutes).toBe(routes.length)
    })

    it('should demonstrate memory efficiency of integrated system', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Create large integrated system
      const routeCache = createLRUCache.large() // 10,000 entries
      const streamingCache = createStreamingCache.api(1000)
      const memoizer = createMemoizer.production() // 10,000 entries

      // Populate caches
      for (let i = 0; i < 1000; i++) {
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

      const finalMemory = process.memoryUsage().heapUsed
      const totalMemory = finalMemory - initialMemory

      const routeCacheStats = routeCache.getStats()
      const streamingCacheStats = streamingCache.getStats()
      const memoizerStats = memoizer.getStats()

      console.log('\n=== Integrated System Memory Efficiency ===')
      console.log(`Total memory used: ${(totalMemory / 1024 / 1024).toFixed(2)} MB`)
      console.log(`Route cache: ${routeCacheStats.size} entries`)
      console.log(`Streaming cache: ${streamingCacheStats.totalResponses} responses`)
      console.log(`Memoizer: ${memoizerStats.totalRequests} requests`)
      console.log(`Memory per cached item: ${(totalMemory / (routeCacheStats.size + streamingCacheStats.totalResponses + memoizerStats.totalRequests)).toFixed(0)} bytes`)

      // Verify reasonable memory usage
      expect(totalMemory / 1024 / 1024).toBeLessThan(100) // Less than 100MB total
      expect(totalMemory / (routeCacheStats.size + streamingCacheStats.totalResponses + memoizerStats.totalRequests)).toBeLessThan(10000) // Less than 10KB per item
    })
  })
})
