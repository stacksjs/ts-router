// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { fileCache, hybridCache, memoryCache, ResponseCache, responseCache } from '../packages/bun-router/src/middleware/response_cache'
import { Router } from '../packages/bun-router/src/router'

describe('Response Caching System', () => {
  let router: Router
  const testCacheDir = '.cache/test-responses'

  beforeEach(async () => {
    router = new Router()

    // Clean up any existing test cache directory
    try {
      const { rm } = await import('node:fs/promises')
      await rm(testCacheDir, { recursive: true, force: true })
    }
    catch {
      // Directory might not exist
    }

    // Wait a bit for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 10))
  })

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await rm(testCacheDir, { recursive: true, force: true })
    }
    catch {
      // Directory might not exist, that's fine
    }
  })

  describe('ResponseCache Middleware', () => {
    test('should cache GET responses in memory', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
        ttl: { default: 60000 },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('Hello World', {
        headers: { 'Content-Type': 'text/plain' },
      }))

      // First request - should miss cache
      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response1.status).toBe(200)
      expect(await response1.text()).toBe('Hello World')
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      // Second request - should hit cache
      const response2 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response2.status).toBe(200)
      expect(await response2.text()).toBe('Hello World')
      expect(response2.headers.get('X-Cache')).toBe('HIT')

      const stats = cache.getStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(0.5)
    })

    test('should cache responses to files using Bun APIs', async () => {
      const cache = new ResponseCache({
        storage: { type: 'file', directory: testCacheDir },
        ttl: { default: 60000 },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('File Cache Test', {
        headers: { 'Content-Type': 'text/plain' },
      }))

      // First request - should miss cache
      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response1.status).toBe(200)
      expect(await response1.text()).toBe('File Cache Test')
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      // Wait a bit for file write
      await new Promise(resolve => setTimeout(resolve, 10))

      // Second request - should hit file cache
      const response2 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response2.status).toBe(200)
      expect(await response2.text()).toBe('File Cache Test')
      expect(response2.headers.get('X-Cache')).toBe('HIT')

      // Verify cache directory exists
      const { readdir } = await import('node:fs/promises')
      try {
        const files = await readdir(testCacheDir)
        const cacheFiles = files.filter(f => f.endsWith('.cache'))
        expect(cacheFiles.length).toBeGreaterThan(0)
      }
      catch {
        // Directory might not exist if no files were written
        expect(false).toBe(true) // Force failure to debug
      }
    })

    test('should use hybrid storage (memory + file)', async () => {
      const cache = new ResponseCache({
        storage: { type: 'hybrid', directory: testCacheDir },
        ttl: { default: 60000 },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('Hybrid Cache Test'))

      // First request - miss
      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      // Second request - hit from memory
      const response2 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response2.headers.get('X-Cache')).toBe('HIT')

      const stats = cache.getStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
    })

    test('should respect TTL and expire cached responses', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
        ttl: { default: 50 }, // 50ms TTL
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/ttl-test', () => new Response('TTL Test'))

      // First request
      const response1 = await router.handleRequest(new Request('http://localhost/ttl-test'))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      // Second request - should hit cache
      const response2 = await router.handleRequest(new Request('http://localhost/ttl-test'))
      expect(response2.headers.get('X-Cache')).toBe('HIT')

      // Wait for TTL to expire and trigger cleanup
      await new Promise(resolve => setTimeout(resolve, 60))
      cache.cleanup() // Force cleanup to expire entries

      // Third request - should miss cache (expired)
      const response3 = await router.handleRequest(new Request('http://localhost/ttl-test'))
      expect(response3.headers.get('X-Cache')).toBe('MISS')
    })

    test('should generate and validate ETags', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
        etag: { enabled: true, weak: false },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('ETag Test'))

      // First request
      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      const etag = response1.headers.get('ETag')
      expect(etag).toBeTruthy()
      expect(etag?.startsWith('"')).toBe(true) // Strong ETag

      // Request with If-None-Match header
      const response2 = await router.handleRequest(new Request('http://localhost/test', {
        headers: { 'If-None-Match': etag! },
      }))
      expect(response2.status).toBe(304) // Not Modified
    })

    test('should handle conditional requests with Last-Modified', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('Last-Modified Test'))

      // First request
      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      const lastModified = response1.headers.get('Last-Modified')
      expect(lastModified).toBeTruthy()

      // Request with If-Modified-Since header
      const response2 = await router.handleRequest(new Request('http://localhost/test', {
        headers: { 'If-Modified-Since': lastModified! },
      }))
      expect(response2.status).toBe(304) // Not Modified
    })

    test('should vary cache by specified headers', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
        varyHeaders: ['Accept-Language'],
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', (req) => {
        const lang = req.headers.get('Accept-Language') || 'en'
        return new Response(`Hello in ${lang}`)
      })

      // Request with English
      const response1 = await router.handleRequest(new Request('http://localhost/test', {
        headers: { 'Accept-Language': 'en' },
      }))
      expect(await response1.text()).toBe('Hello in en')
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      // Request with French - should miss cache (different vary header)
      const response2 = await router.handleRequest(new Request('http://localhost/test', {
        headers: { 'Accept-Language': 'fr' },
      }))
      expect(await response2.text()).toBe('Hello in fr')
      expect(response2.headers.get('X-Cache')).toBe('MISS')

      // Request with English again - should hit cache
      const response3 = await router.handleRequest(new Request('http://localhost/test', {
        headers: { 'Accept-Language': 'en' },
      }))
      expect(await response3.text()).toBe('Hello in en')
      expect(response3.headers.get('X-Cache')).toBe('HIT')
    })

    test('should not cache responses with no-cache directive', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('No Cache Test', {
        headers: { 'Cache-Control': 'no-cache' },
      }))

      // Both requests should miss cache
      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      const response2 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response2.headers.get('X-Cache')).toBe('MISS')

      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(2)
    })

    test('should not cache error responses', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/error', () => new Response('Not Found', { status: 404 }))

      // Both requests should miss cache
      const response1 = await router.handleRequest(new Request('http://localhost/error'))
      expect(response1.status).toBe(404)
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      const response2 = await router.handleRequest(new Request('http://localhost/error'))
      expect(response2.status).toBe(404)
      expect(response2.headers.get('X-Cache')).toBe('MISS')
    })

    test('should invalidate cache on POST requests', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
        invalidation: {
          methods: ['POST'],
          patterns: ['/test'], // Add pattern to ensure invalidation works
        },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('Cache Test'))
      router.post('/test', () => new Response('Posted'))

      // GET request - should cache
      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      const response2 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response2.headers.get('X-Cache')).toBe('HIT')

      // POST request - should invalidate cache
      await router.handleRequest(new Request('http://localhost/test', { method: 'POST' }))

      // GET request after POST - should miss cache (invalidated)
      const response3 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response3.headers.get('X-Cache')).toBe('MISS')
    })

    test('should handle different TTL for different routes', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
        ttl: {
          default: 1000,
          routes: {
            '/fast': 50, // 50ms TTL
            '/slow': 5000, // 5s TTL
          },
        },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/fast', () => new Response('Fast Route'))
      router.get('/slow', () => new Response('Slow Route'))

      // Test fast route
      await router.handleRequest(new Request('http://localhost/fast'))
      const fastHit = await router.handleRequest(new Request('http://localhost/fast'))
      expect(fastHit.headers.get('X-Cache')).toBe('HIT')

      // Wait for fast route to expire
      await new Promise(resolve => setTimeout(resolve, 60))

      const fastExpired = await router.handleRequest(new Request('http://localhost/fast'))
      expect(fastExpired.headers.get('X-Cache')).toBe('MISS')

      // Test slow route (should still be cached)
      await router.handleRequest(new Request('http://localhost/slow'))
      const slowHit = await router.handleRequest(new Request('http://localhost/slow'))
      expect(slowHit.headers.get('X-Cache')).toBe('HIT')
    })

    test('should clear all cache', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test1', () => new Response('Test 1'))
      router.get('/test2', () => new Response('Test 2'))

      // Cache both routes
      await router.handleRequest(new Request('http://localhost/test1'))
      await router.handleRequest(new Request('http://localhost/test2'))

      // Verify cache hits
      const hit1 = await router.handleRequest(new Request('http://localhost/test1'))
      const hit2 = await router.handleRequest(new Request('http://localhost/test2'))
      expect(hit1.headers.get('X-Cache')).toBe('HIT')
      expect(hit2.headers.get('X-Cache')).toBe('HIT')

      // Clear cache
      await cache.clearCache()

      // Both should miss after clear
      const miss1 = await router.handleRequest(new Request('http://localhost/test1'))
      const miss2 = await router.handleRequest(new Request('http://localhost/test2'))
      expect(miss1.headers.get('X-Cache')).toBe('MISS')
      expect(miss2.headers.get('X-Cache')).toBe('MISS')
    })

    test('should handle binary responses', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/binary', () => {
        const buffer = new Uint8Array([1, 2, 3, 4, 5])
        return new Response(buffer, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })

      // First request
      const response1 = await router.handleRequest(new Request('http://localhost/binary'))
      const buffer1 = await response1.arrayBuffer()
      expect(new Uint8Array(buffer1)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      // Second request - from cache
      const response2 = await router.handleRequest(new Request('http://localhost/binary'))
      const buffer2 = await response2.arrayBuffer()
      expect(new Uint8Array(buffer2)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
      expect(response2.headers.get('X-Cache')).toBe('HIT')
    })
  })

  describe('Factory Functions', () => {
    test('should create memory cache instance', async () => {
      const cache = memoryCache({ ttl: { default: 60000 } })
      expect(cache).toBeInstanceOf(ResponseCache)

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('Memory Cache'))

      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      const response2 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response2.headers.get('X-Cache')).toBe('HIT')
    })

    test('should create file cache instance', async () => {
      const cache = fileCache(testCacheDir, { ttl: { default: 60000 } })
      expect(cache).toBeInstanceOf(ResponseCache)

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('File Cache'))

      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      await new Promise(resolve => setTimeout(resolve, 10))

      const response2 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response2.headers.get('X-Cache')).toBe('HIT')
    })

    test('should create hybrid cache instance', async () => {
      const testRouter = new Router()
      const uniqueCacheDir = `${testCacheDir}-hybrid-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Ensure clean directory
      try {
        await rm(uniqueCacheDir, { recursive: true, force: true })
      }
      catch {}

      const cache = hybridCache({
        storage: { type: 'hybrid', directory: uniqueCacheDir },
        ttl: { default: 60000 },
      })
      expect(cache).toBeInstanceOf(ResponseCache)

      // Clear any existing cache
      await cache.clearCache()

      await testRouter.use(async (req, next) => cache.handle(req, next))
      testRouter.get('/hybrid-test', () => new Response('Hybrid Cache'))

      const response1 = await testRouter.handleRequest(new Request('http://localhost/hybrid-test'))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      const response2 = await testRouter.handleRequest(new Request('http://localhost/hybrid-test'))
      expect(response2.headers.get('X-Cache')).toBe('HIT')

      // Cleanup
      try {
        const { rm } = await import('node:fs/promises')
        await rm(uniqueCacheDir, { recursive: true, force: true })
      }
      catch {}
    })

    test('should create general response cache instance', async () => {
      const cache = responseCache({
        storage: { type: 'memory' },
        ttl: { default: 60000 },
      })
      expect(cache).toBeInstanceOf(ResponseCache)

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('Response Cache'))

      const response1 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response1.headers.get('X-Cache')).toBe('MISS')

      const response2 = await router.handleRequest(new Request('http://localhost/test'))
      expect(response2.headers.get('X-Cache')).toBe('HIT')
    })
  })

  describe('Cache Statistics', () => {
    test('should track cache statistics', async () => {
      const cache = new ResponseCache({
        storage: { type: 'memory' },
      })

      await router.use(async (req, next) => cache.handle(req, next))
      router.get('/test', () => new Response('Stats Test'))

      // Initial stats
      let stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.sets).toBe(0)

      // First request (miss + set)
      await router.handleRequest(new Request('http://localhost/test'))
      stats = cache.getStats()
      expect(stats.misses).toBe(1)
      expect(stats.sets).toBe(1)

      // Second request (hit)
      await router.handleRequest(new Request('http://localhost/test'))
      stats = cache.getStats()
      expect(stats.hits).toBe(1)
      expect(stats.hitRate).toBe(0.5)
    })
  })

  describe('Memory Management', () => {
    test('should evict LRU entries when memory limit reached', async () => {
      const testRouter = new Router()
      const cache = new ResponseCache({
        storage: { type: 'memory', maxEntries: 2 },
      })

      await testRouter.use(async (req, next) => cache.handle(req, next))
      testRouter.get('/test1', () => new Response('Test 1'))
      testRouter.get('/test2', () => new Response('Test 2'))
      testRouter.get('/test3', () => new Response('Test 3'))

      // Fill cache to limit
      await testRouter.handleRequest(new Request('http://localhost/test1'))
      await new Promise(resolve => setTimeout(resolve, 1)) // Small delay
      await testRouter.handleRequest(new Request('http://localhost/test2'))

      // Both should be cached
      await new Promise(resolve => setTimeout(resolve, 1)) // Small delay
      const hit1 = await testRouter.handleRequest(new Request('http://localhost/test1'))
      await new Promise(resolve => setTimeout(resolve, 1)) // Small delay
      const hit2 = await testRouter.handleRequest(new Request('http://localhost/test2'))
      expect(hit1.headers.get('X-Cache')).toBe('HIT')
      expect(hit2.headers.get('X-Cache')).toBe('HIT')

      // Add third entry (should evict least recently used)
      await new Promise(resolve => setTimeout(resolve, 1)) // Small delay
      await testRouter.handleRequest(new Request('http://localhost/test3'))

      // Check cache statistics to verify eviction happened
      const stats = cache.getStats()
      expect(stats.deletes).toBe(1) // One entry should have been evicted
      expect(stats.size).toBe(2) // Cache should still have 2 entries

      // test2 and test3 should be cached (test1 was evicted)
      const cached2 = await testRouter.handleRequest(new Request('http://localhost/test2'))
      const cached3 = await testRouter.handleRequest(new Request('http://localhost/test3'))
      expect(cached2.headers.get('X-Cache')).toBe('HIT')
      expect(cached3.headers.get('X-Cache')).toBe('HIT')

      // test1 should be a miss (was evicted)
      const evicted = await testRouter.handleRequest(new Request('http://localhost/test1'))
      expect(evicted.headers.get('X-Cache')).toBe('MISS')
    })
  })
})
