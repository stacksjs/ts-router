// @ts-nocheck
import type { EnhancedRequest } from '../packages/bun-router/src/types'
import { beforeEach, describe, expect, it } from 'bun:test'
import { createLRUCache, LRUCache } from '../packages/bun-router/src/cache/lru-cache'
import { createMemoizer, MemoizationPatterns, MiddlewareMemoizer } from '../packages/bun-router/src/cache/middleware-memoization'
import { createRouteCacheWarmer, RouteCacheWarmer } from '../packages/bun-router/src/cache/route-cache-warmer'
import { createStreamingCache, StreamingCache } from '../packages/bun-router/src/cache/streaming-cache'

describe('Cache Optimizations', () => {
  describe('LRU Cache', () => {
    let cache: LRUCache<string>

    beforeEach(() => {
      cache = new LRUCache({ maxSize: 3 })
    })

    it('should store and retrieve values', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      expect(cache.get('key1')).toBe('value1')
      expect(cache.get('key2')).toBe('value2')
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('should evict least recently used items when at capacity', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      cache.set('key4', 'value4') // Should evict key1

      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBe('value2')
      expect(cache.get('key3')).toBe('value3')
      expect(cache.get('key4')).toBe('value4')
    })

    it('should update access order on get', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      // Access key1 to make it most recently used
      cache.get('key1')

      // Add key4, should evict key2 (least recently used)
      cache.set('key4', 'value4')

      expect(cache.get('key1')).toBe('value1')
      expect(cache.get('key2')).toBeUndefined()
      expect(cache.get('key3')).toBe('value3')
      expect(cache.get('key4')).toBe('value4')
    })

    it('should handle TTL expiration', async () => {
      const shortTtlCache = new LRUCache({ maxSize: 10, ttl: 50 })

      shortTtlCache.set('key1', 'value1')
      expect(shortTtlCache.get('key1')).toBe('value1')

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(shortTtlCache.get('key1')).toBeUndefined()
    })

    it('should provide accurate statistics', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      cache.get('key1') // Hit
      cache.get('key3') // Miss
      cache.get('key2') // Hit

      const stats = cache.getStats()
      expect(stats.size).toBe(2)
      expect(stats.maxSize).toBe(3)
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.67, 2)
    })

    it('should support key and value iteration', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      const keys = cache.keys()
      const values = cache.values()

      expect(keys).toHaveLength(3)
      expect(values).toHaveLength(3)
      expect(keys).toContain('key1')
      expect(values).toContain('value1')
    })

    it('should prune expired entries', async () => {
      const ttlCache = new LRUCache({ maxSize: 10, ttl: 50 })

      ttlCache.set('key1', 'value1')
      ttlCache.set('key2', 'value2', 100) // Longer TTL

      await new Promise(resolve => setTimeout(resolve, 60))

      const prunedCount = ttlCache.prune()
      expect(prunedCount).toBe(1)
      expect(ttlCache.get('key1')).toBeUndefined()
      expect(ttlCache.get('key2')).toBe('value2')
    })

    it('should resize cache and evict excess entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      cache.resize(2)

      const stats = cache.getStats()
      expect(stats.size).toBe(2)
      expect(stats.maxSize).toBe(2)
    })

    it('should track frequently used items', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      // Access key1 multiple times
      cache.get('key1')
      cache.get('key1')
      cache.get('key2')

      const frequentlyUsed = cache.getFrequentlyUsed(2)
      expect(frequentlyUsed[0].key).toBe('key1')
      expect(frequentlyUsed[0].accessCount).toBe(2)
    })
  })

  describe('Streaming Cache', () => {
    let streamingCache: StreamingCache

    beforeEach(() => {
      streamingCache = createStreamingCache.api(100)
    })

    it('should cache and retrieve responses', async () => {
      const mockResponse = new Response('test content', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })

      await streamingCache.cacheResponse('test-key', mockResponse)
      const cachedResponse = await streamingCache.getStreamingResponse('test-key')

      expect(cachedResponse).toBeTruthy()
      expect(cachedResponse!.status).toBe(200)
      expect(await cachedResponse!.text()).toBe('test content')
    })

    it('should generate and use ETags', async () => {
      const mockResponse = new Response('test content', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })

      await streamingCache.cacheResponse('test-key', mockResponse, {
        generateETag: true,
      })

      const cachedResponse = await streamingCache.getStreamingResponse('test-key')
      expect(cachedResponse!.headers.get('ETag')).toBeTruthy()
    })

    it('should handle conditional responses', async () => {
      const mockResponse = new Response('test content', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })

      await streamingCache.cacheResponse('test-key', mockResponse, {
        generateETag: true,
      })

      const cachedResponse = await streamingCache.getStreamingResponse('test-key')
      const etag = cachedResponse!.headers.get('ETag')

      const conditionalResponse = streamingCache.createConditionalResponse('test-key', etag!)
      expect(conditionalResponse!.status).toBe(304)
    })

    it('should determine cacheable responses correctly', () => {
      const cacheableResponse = new Response('content', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })

      const nonCacheableResponse = new Response('error', {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })

      const noCacheResponse = new Response('content', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-cache',
        },
      })

      expect(streamingCache.shouldCache(cacheableResponse)).toBe(true)
      expect(streamingCache.shouldCache(nonCacheableResponse)).toBe(false)
      expect(streamingCache.shouldCache(noCacheResponse)).toBe(false)
    })

    it('should provide accurate statistics', async () => {
      const mockResponse = new Response('test content', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })

      await streamingCache.cacheResponse('test-key', mockResponse)

      // Hit
      await streamingCache.getStreamingResponse('test-key')

      // Miss
      await streamingCache.getStreamingResponse('nonexistent-key')

      const stats = streamingCache.getStats()
      expect(stats.streamingHits).toBe(1)
      expect(stats.streamingMisses).toBe(1)
      expect(stats.totalResponses).toBe(1)
    })

    it('should handle large responses with streaming', async () => {
      const largeContent = 'x'.repeat(100000) // 100KB content
      const mockResponse = new Response(largeContent, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })

      await streamingCache.cacheResponse('large-key', mockResponse)
      const cachedResponse = await streamingCache.getStreamingResponse('large-key')

      expect(cachedResponse).toBeTruthy()
      expect(await cachedResponse!.text()).toBe(largeContent)
    })
  })

  describe('Route Cache Warmer', () => {
    let warmer: RouteCacheWarmer
    let routeCache: LRUCache<any>
    let streamingCache: StreamingCache

    beforeEach(() => {
      routeCache = createLRUCache.medium()
      streamingCache = createStreamingCache.api()
      warmer = createRouteCacheWarmer.development(routeCache, streamingCache)
    })

    it('should register and prioritize routes', () => {
      const routes = [
        { path: '/api/users', method: 'GET', priority: 80, frequency: 100 },
        { path: '/api/posts', method: 'GET', priority: 60, frequency: 50 },
        { path: '/health', method: 'GET', priority: 90, frequency: 200 },
      ]

      warmer.registerRoutes(routes)
      const stats = warmer.getStats()
      expect(stats.totalRoutes).toBe(3)
    })

    it('should precompute route results', async () => {
      const precomputeRoutes = [
        {
          path: '/api/stats',
          method: 'GET',
          computeFunction: async () => ({ stats: 'computed' }),
          cacheKey: 'stats-data',
        },
      ]

      const precomputedCount = await warmer.precomputeRoutes(precomputeRoutes)
      expect(precomputedCount).toBe(1)
      expect(routeCache.get('stats-data')).toEqual({ stats: 'computed' })
    })

    it('should handle intelligent warmup patterns', async () => {
      const patterns = {
        userSegments: [
          {
            segment: 'premium',
            commonRoutes: ['/api/premium/features'],
            priority: 80,
          },
        ],
        timeBasedPatterns: [
          {
            timeRange: { start: 0, end: 23 }, // All day
            routes: ['/api/dashboard'],
            priority: 70,
          },
        ],
      }

      await warmer.intelligentWarmup(patterns)
      const stats = warmer.getStats()
      expect(stats.totalRoutes).toBeGreaterThan(0)
    })

    it('should provide warmup statistics', () => {
      const stats = warmer.getStats()
      expect(stats).toHaveProperty('totalRoutes')
      expect(stats).toHaveProperty('successfulWarmups')
      expect(stats).toHaveProperty('failedWarmups')
      expect(stats).toHaveProperty('averageWarmupTime')
    })

    it('should reset statistics', () => {
      warmer.registerRoute({ path: '/test', method: 'GET', priority: 50, frequency: 10 })

      let stats = warmer.getStats()
      expect(stats.totalRoutes).toBe(1)

      warmer.resetStats()
      stats = warmer.getStats()
      expect(stats.successfulWarmups).toBe(0)
      expect(stats.failedWarmups).toBe(0)
    })
  })

  describe('Middleware Memoization', () => {
    let memoizer: MiddlewareMemoizer
    let mockRequest: EnhancedRequest

    beforeEach(() => {
      memoizer = createMemoizer.development()
      mockRequest = {
        method: 'GET',
        url: 'http://localhost:3000/test',
        headers: new Headers(),
        params: {},
        query: {},
        user: { id: '123' },
      } as EnhancedRequest
    })

    it('should memoize middleware results', async () => {
      let executionCount = 0

      const expensiveMiddleware = async (_req: EnhancedRequest, _next: any) => {
        executionCount++
        await new Promise(resolve => setTimeout(resolve, 10))
        return new Response(JSON.stringify({ result: 'expensive-computation', count: executionCount }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const memoizedMiddleware = memoizer.memoize(expensiveMiddleware)

      // First call should execute
      const result1 = await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      expect(result1).toBeInstanceOf(Response)
      if (result1) {
        const data1 = await result1.json() as { result: string, count: number }
        expect(data1.count).toBe(1)
      }
      expect(executionCount).toBe(1)

      // Second call should use cache
      const result2 = await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      expect(result2).toBeInstanceOf(Response)
      if (result2) {
        const data2 = await result2.json() as { result: string, count: number }
        expect(data2.count).toBe(1) // Same result from cache
      }
      expect(executionCount).toBe(1) // Not executed again

      const stats = memoizer.getStats()
      expect(stats.cacheHits).toBe(1)
      expect(stats.cacheMisses).toBe(1)
    })

    it('should memoize async functions', async () => {
      let executionCount = 0

      const expensiveFunction = async (input: string) => {
        executionCount++
        await new Promise(resolve => setTimeout(resolve, 5))
        return `processed-${input}-${executionCount}`
      }

      const memoizedFunction = memoizer.memoizeFunction(expensiveFunction)

      const result1 = await memoizedFunction('test')
      const result2 = await memoizedFunction('test')

      expect(result1).toBe(result2)
      expect(executionCount).toBe(1)
    })

    it('should handle custom key generation', async () => {
      const middleware = async (_req: EnhancedRequest, _next: any) => {
        return new Response(JSON.stringify({ userId: _req.user?.id, timestamp: Date.now() }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const memoizedMiddleware = memoizer.memoize(middleware, {
        keyGenerator: req => `user:${req.user?.id}`,
      })

      await memoizedMiddleware(mockRequest, () => Promise.resolve(null))

      // Same user should hit cache
      const result = await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      expect(result).toBeInstanceOf(Response)
      if (result) {
        const data = await result.json() as { userId: string, timestamp: number }
        expect(data.userId).toBe('123')
      }

      const stats = memoizer.getStats()
      expect(stats.cacheHits).toBe(1)
    })

    it('should support conditional memoization', async () => {
      let executionCount = 0

      const middleware = async (req: EnhancedRequest, _next: any) => {
        executionCount++
        return new Response(JSON.stringify({ success: req.method === 'GET', count: executionCount }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const memoizedMiddleware = memoizer.memoize(middleware, {
        shouldMemoize: (req, result) => {
          if (result instanceof Response) {
            return result.status === 200 // Only memoize successful responses
          }
          return false
        },
      })

      // GET request - should be memoized
      const result1 = await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      const result2 = await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      expect(result1).toBeInstanceOf(Response)
      expect(result2).toBeInstanceOf(Response)
      if (result1 && result2) {
        const data1 = await result1.json() as { success: boolean, count: number }
        const data2 = await result2.json() as { success: boolean, count: number }
        expect(data2.count).toBe(data1.count)
      }

      // POST request - should not be memoized
      const postRequest = { ...mockRequest, method: 'POST' as const }
      const result3 = await memoizedMiddleware(postRequest, () => Promise.resolve(null))
      const result4 = await memoizedMiddleware(postRequest, () => Promise.resolve(null))
      expect(result3).toBeInstanceOf(Response)
      expect(result4).toBeInstanceOf(Response)
      if (result3 && result4) {
        const data3 = await result3.json() as { success: boolean, count: number }
        const data4 = await result4.json() as { success: boolean, count: number }
        expect(data4.count).not.toBe(data3.count)
      }
    })

    it('should invalidate cache by pattern', async () => {
      const middleware = async (req: EnhancedRequest, _next: any) => {
        return new Response(JSON.stringify({ path: req.url }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const memoizedMiddleware = memoizer.memoize(middleware, { name: 'testMiddleware' })

      await memoizedMiddleware(mockRequest, () => Promise.resolve(null))

      let stats = memoizer.getStats()
      expect(stats.cacheMisses).toBe(1)

      // Invalidate by pattern
      const invalidatedCount = memoizer.invalidate('testMiddleware')
      expect(invalidatedCount).toBe(1)

      // Next call should miss cache
      await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      stats = memoizer.getStats()
      expect(stats.cacheMisses).toBe(2)
    })

    it('should track popular results', async () => {
      const middleware = async (req: EnhancedRequest, _next: any) => {
        return new Response(JSON.stringify({ url: req.url }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const memoizedMiddleware = memoizer.memoize(middleware, { name: 'popular' })

      // Call multiple times to create hits
      await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      await memoizedMiddleware(mockRequest, () => Promise.resolve(null))

      const popularResults = memoizer.getPopularResults(1)
      expect(popularResults).toHaveLength(1)
      expect(popularResults[0].hitCount).toBe(2) // First call is miss, next 2 are hits
    })

    it('should provide accurate statistics', async () => {
      const middleware = async (_req: EnhancedRequest, _next: any) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return new Response(JSON.stringify({ processed: true }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const memoizedMiddleware = memoizer.memoize(middleware)

      await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      await memoizedMiddleware(mockRequest, () => Promise.resolve(null))

      const stats = memoizer.getStats()
      expect(stats.totalRequests).toBe(2)
      expect(stats.cacheHits).toBe(1)
      expect(stats.cacheMisses).toBe(1)
      expect(stats.hitRate).toBe(0.5)
      expect(stats.averageExecutionTime).toBeGreaterThan(0)
      expect(stats.totalTimeSaved).toBeGreaterThan(0)
    })
  })

  describe('Memoization Patterns', () => {
    it('should create database memoizer with appropriate settings', () => {
      const dbMemoizer = MemoizationPatterns.createDatabaseMemoizer()
      expect(dbMemoizer).toBeInstanceOf(MiddlewareMemoizer)
    })

    it('should create API memoizer with appropriate settings', () => {
      const apiMemoizer = MemoizationPatterns.createApiMemoizer()
      expect(apiMemoizer).toBeInstanceOf(MiddlewareMemoizer)
    })

    it('should create auth memoizer with appropriate settings', () => {
      const authMemoizer = MemoizationPatterns.createAuthMemoizer()
      expect(authMemoizer).toBeInstanceOf(MiddlewareMemoizer)
    })

    it('should create rate limit memoizer with appropriate settings', () => {
      const rateLimitMemoizer = MemoizationPatterns.createRateLimitMemoizer()
      expect(rateLimitMemoizer).toBeInstanceOf(MiddlewareMemoizer)
    })

    it('should create computation memoizer with appropriate settings', () => {
      const computationMemoizer = MemoizationPatterns.createComputationMemoizer()
      expect(computationMemoizer).toBeInstanceOf(MiddlewareMemoizer)
    })
  })

  describe('Factory Functions', () => {
    it('should create LRU caches with different sizes', () => {
      const smallCache = createLRUCache.small()
      const mediumCache = createLRUCache.medium()
      const largeCache = createLRUCache.large()

      expect(smallCache.getStats().maxSize).toBe(100)
      expect(mediumCache.getStats().maxSize).toBe(1000)
      expect(largeCache.getStats().maxSize).toBe(10000)
    })

    it('should create streaming caches for different use cases', () => {
      const apiCache = createStreamingCache.api()
      const assetsCache = createStreamingCache.assets()
      const pagesCache = createStreamingCache.pages()

      expect(apiCache).toBeInstanceOf(StreamingCache)
      expect(assetsCache).toBeInstanceOf(StreamingCache)
      expect(pagesCache).toBeInstanceOf(StreamingCache)
    })

    it('should create route cache warmers for different environments', () => {
      const routeCache = createLRUCache.medium()

      const devWarmer = createRouteCacheWarmer.development(routeCache)
      const prodWarmer = createRouteCacheWarmer.production(routeCache)

      expect(devWarmer).toBeInstanceOf(RouteCacheWarmer)
      expect(prodWarmer).toBeInstanceOf(RouteCacheWarmer)
    })

    it('should create memoizers for different environments', () => {
      const devMemoizer = createMemoizer.development()
      const prodMemoizer = createMemoizer.production()

      expect(devMemoizer).toBeInstanceOf(MiddlewareMemoizer)
      expect(prodMemoizer).toBeInstanceOf(MiddlewareMemoizer)

      expect(devMemoizer.getStats().totalRequests).toBe(0)
      expect(prodMemoizer.getStats().totalRequests).toBe(0)
    })
  })

  describe('Integration Tests', () => {
    it('should work together in a complete caching system', async () => {
      // Setup complete caching system
      const routeCache = createLRUCache.medium()
      const streamingCache = createStreamingCache.api()
      const warmer = createRouteCacheWarmer.development(routeCache, streamingCache)
      const memoizer = createMemoizer.development()

      // Register routes for warming
      warmer.registerRoutes([
        { path: '/api/users', method: 'GET', priority: 80, frequency: 100 },
        { path: '/api/posts', method: 'GET', priority: 60, frequency: 50 },
      ])

      // Create memoized middleware
      const expensiveMiddleware = async (req: EnhancedRequest, _next: any) => {
        await new Promise(resolve => setTimeout(resolve, 5))
        return new Response(JSON.stringify({ processed: true, url: req.url }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      const memoizedMiddleware = memoizer.memoize(expensiveMiddleware)

      // Test middleware memoization
      const mockRequest: EnhancedRequest = {
        method: 'GET',
        url: 'http://localhost:3000/api/users',
        headers: new Headers(),
        params: {},
        query: {},
        user: { id: '123' },
      } as EnhancedRequest

      const result1 = await memoizedMiddleware(mockRequest, () => Promise.resolve(null))
      const result2 = await memoizedMiddleware(mockRequest, () => Promise.resolve(null))

      expect(result1).toBeInstanceOf(Response)
      expect(result2).toBeInstanceOf(Response)
      if (result1 && result2) {
        const data1 = await result1.json() as { processed: boolean, url: string }
        const data2 = await result2.json() as { processed: boolean, url: string }
        expect(data1).toEqual(data2)
      }

      // Test route cache
      routeCache.set('api:users', { users: ['user1', 'user2'] })
      expect(routeCache.get('api:users')).toEqual({ users: ['user1', 'user2'] })

      // Test streaming cache
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })

      await streamingCache.cacheResponse('api:users', mockResponse)
      const cachedResponse = await streamingCache.getStreamingResponse('api:users')
      expect(cachedResponse).toBeTruthy()

      // Verify all systems are working
      expect(routeCache.getStats().size).toBeGreaterThan(0)
      expect(streamingCache.getStats().totalResponses).toBeGreaterThan(0)
      expect(memoizer.getStats().totalRequests).toBeGreaterThan(0)
      expect(warmer.getStats().totalRoutes).toBeGreaterThan(0)
    })
  })
})
