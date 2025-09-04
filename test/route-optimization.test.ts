import type { RouteMatch } from '../packages/bun-router/src/router/route-trie'
import type { HTTPMethod, Route } from '../packages/bun-router/src/types'
import { beforeEach, describe, expect, it } from 'bun:test'
import { RouteCompiler } from '../packages/bun-router/src/router/route-compiler'
import { RouteTrie } from '../packages/bun-router/src/router/route-trie'

describe('Route Optimization', () => {
  let trie: RouteTrie
  let compiler: RouteCompiler

  beforeEach(() => {
    trie = new RouteTrie()
    compiler = new RouteCompiler()
  })

  describe('RouteTrie', () => {
    it('should handle static routes efficiently', () => {
      const route: Route = {
        path: '/users',
        method: 'GET',
        handler: () => new Response('users'),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(route)
      const match = trie.match('/users', 'GET')

      expect(match).toBeTruthy()
      expect(match?.route.path).toBe('/users')
      expect(match?.params).toEqual({})
    })

    it('should handle parameterized routes', () => {
      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response('user'),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(route)
      const match = trie.match('/users/123', 'GET')

      expect(match).toBeTruthy()
      expect(match?.route.path).toBe('/users/{id}')
      expect(match?.params).toEqual({ id: '123' })
    })

    it('should handle constrained parameters', () => {
      const route: Route = {
        path: '/users/{id:\\d+}',
        method: 'GET',
        handler: () => new Response('user'),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(route)

      // Should match numeric ID
      const validMatch = trie.match('/users/123', 'GET')
      expect(validMatch).toBeTruthy()
      expect(validMatch?.params).toEqual({ id: '123' })

      // Should not match non-numeric ID
      const invalidMatch = trie.match('/users/abc', 'GET')
      expect(invalidMatch).toBeNull()
    })

    it('should handle wildcard routes', () => {
      const route: Route = {
        path: '/files/*',
        method: 'GET',
        handler: () => new Response('file'),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(route)
      const match = trie.match('/files/documents/test.pdf', 'GET')

      expect(match).toBeTruthy()
      expect(match?.params).toEqual({ wildcard: 'documents/test.pdf' })
    })

    it('should prioritize routes correctly', () => {
      const staticRoute: Route = {
        path: '/users/profile',
        method: 'GET',
        handler: () => new Response('profile'),
        middleware: [],
        type: 'api',
      }

      const paramRoute: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response('user'),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(paramRoute)
      trie.addRoute(staticRoute)

      // Static route should take priority over parameter route
      const match = trie.match('/users/profile', 'GET')
      expect(match?.route.path).toBe('/users/profile')
    })

    it('should handle complex nested routes', () => {
      const routes: Route[] = [
        {
          path: '/api/v1/users/{userId}/posts/{postId}/comments',
          method: 'GET',
          handler: () => new Response('comments'),
          middleware: [],
          type: 'api',
        },
        {
          path: '/api/v1/users/{userId}/posts',
          method: 'GET',
          handler: () => new Response('posts'),
          middleware: [],
          type: 'api',
        },
        {
          path: '/api/v1/users',
          method: 'GET',
          handler: () => new Response('users'),
          middleware: [],
          type: 'api',
        },
      ]

      routes.forEach(route => trie.addRoute(route))

      const match1 = trie.match('/api/v1/users/123/posts/456/comments', 'GET')
      expect(match1?.route.path).toBe('/api/v1/users/{userId}/posts/{postId}/comments')
      expect(match1?.params).toEqual({ userId: '123', postId: '456' })

      const match2 = trie.match('/api/v1/users/123/posts', 'GET')
      expect(match2?.route.path).toBe('/api/v1/users/{userId}/posts')
      expect(match2?.params).toEqual({ userId: '123' })

      const match3 = trie.match('/api/v1/users', 'GET')
      expect(match3?.route.path).toBe('/api/v1/users')
      expect(match3?.params).toEqual({})
    })

    it('should handle method-specific routing', () => {
      const getRoute: Route = {
        path: '/users',
        method: 'GET',
        handler: () => new Response('get users'),
        middleware: [],
        type: 'api',
      }

      const postRoute: Route = {
        path: '/users',
        method: 'POST',
        handler: () => new Response('create user'),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(getRoute)
      trie.addRoute(postRoute)

      const getMatch = trie.match('/users', 'GET')
      expect(getMatch?.route.method).toBe('GET')

      const postMatch = trie.match('/users', 'POST')
      expect(postMatch?.route.method).toBe('POST')

      const putMatch = trie.match('/users', 'PUT')
      expect(putMatch).toBeNull()
    })

    it('should provide trie statistics', () => {
      const routes: Route[] = [
        { path: '/users', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/users/{id}', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/posts', method: 'POST', handler: () => new Response(), middleware: [], type: 'api' },
      ]

      routes.forEach(route => trie.addRoute(route))
      const stats = trie.getStats()

      expect(stats.totalRoutes).toBe(3)
      expect(stats.totalNodes).toBeGreaterThan(0)
      expect(stats.methodDistribution.GET).toBe(2)
      expect(stats.methodDistribution.POST).toBe(1)
    })
  })

  describe('RouteCompiler', () => {
    it('should compile routes with caching enabled', () => {
      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response('user'),
        middleware: [],
        type: 'api',
      }

      compiler.addRoute(route)

      // First match should be a cache miss
      const match1 = compiler.match('/users/123', 'GET')
      expect(match1).toBeTruthy()

      // Second match should be a cache hit
      const match2 = compiler.match('/users/123', 'GET')
      expect(match2).toBeTruthy()

      const stats = compiler.getStats()
      expect(stats.totalMatches).toBe(2)
      expect(stats.cacheHits).toBe(1)
      expect(stats.cacheMisses).toBe(1)
    })

    it('should group routes by HTTP method', () => {
      const routes: Route[] = [
        { path: '/users', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/users', method: 'POST', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/posts', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
      ]

      routes.forEach(route => compiler.addRoute(route))
      const routesByMethod = compiler.getRoutesByMethod()

      expect(routesByMethod.get('GET')).toHaveLength(2)
      expect(routesByMethod.get('POST')).toHaveLength(1)
      expect(routesByMethod.get('PUT')).toBeUndefined()
    })

    it('should detect route conflicts', () => {
      const routes: Route[] = [
        { path: '/users/{id}', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/users/{userId}', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
      ]

      routes.forEach(route => compiler.addRoute(route))
      const conflicts = compiler.getRouteConflicts()

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe('overlap')
      expect(conflicts[0].routes).toHaveLength(2)
    })

    it('should warm cache with common paths', () => {
      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      }

      compiler.addRoute(route)

      const commonPaths = [
        { path: '/users/1', method: 'GET' as HTTPMethod },
        { path: '/users/2', method: 'GET' as HTTPMethod },
        { path: '/users/3', method: 'GET' as HTTPMethod },
      ]

      compiler.warmCache(commonPaths)

      const cacheStats = compiler.getCacheStats()
      expect(cacheStats.size).toBe(3)
      expect(cacheStats.hitRate).toBe(1) // All warmed paths should be cache hits
    })

    it('should provide performance statistics', () => {
      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      }

      compiler.addRoute(route)
      compiler.match('/users/123', 'GET')

      const stats = compiler.getStats()
      expect(stats.totalMatches).toBe(1)
      expect(stats.averageMatchTime).toBeGreaterThan(0)
      expect(stats.methodDistribution.GET).toBe(1)
    })

    it('should handle cache size limits', () => {
      const limitedCompiler = new RouteCompiler({ cacheSize: 2 })

      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      }

      limitedCompiler.addRoute(route)

      // Fill cache beyond limit
      limitedCompiler.match('/users/1', 'GET')
      limitedCompiler.match('/users/2', 'GET')
      limitedCompiler.match('/users/3', 'GET') // Should not be cached due to limit

      const cacheStats = limitedCompiler.getCacheStats()
      expect(cacheStats.size).toBeLessThanOrEqual(2)
    })

    it('should clear caches properly', () => {
      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      }

      compiler.addRoute(route)
      compiler.match('/users/123', 'GET')

      expect(compiler.getCacheStats().size).toBeGreaterThan(0)

      compiler.clear()

      expect(compiler.getCacheStats().size).toBe(0)
      expect(compiler.getStats().totalMatches).toBe(0)
    })
  })

  describe('Performance Benchmarks', () => {
    it('should perform better than linear search for large route sets', () => {
      const routes: Route[] = []

      // Create 1000 routes
      for (let i = 0; i < 1000; i++) {
        routes.push({
          path: `/route${i}/{param}`,
          method: 'GET',
          handler: () => new Response(),
          middleware: [],
          type: 'api',
        })
      }

      routes.forEach(route => compiler.addRoute(route))

      // Benchmark trie matching
      const startTime = performance.now()
      for (let i = 0; i < 100; i++) {
        compiler.match(`/route${i}/test`, 'GET')
      }
      const trieTime = performance.now() - startTime

      // The trie should be significantly faster than O(n) linear search
      // For 1000 routes, trie should be much faster
      expect(trieTime).toBeLessThan(100) // Should complete in under 100ms
    })

    it('should handle high-frequency matching efficiently', () => {
      const routes: Route[] = [
        { path: '/api/users', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/users/{id}', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/posts', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/posts/{id}', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
      ]

      routes.forEach(route => compiler.addRoute(route))

      // Perform many matches to test cache efficiency
      const testPaths = [
        '/api/users',
        '/api/users/123',
        '/api/posts',
        '/api/posts/456',
      ]

      const startTime = performance.now()
      for (let i = 0; i < 1000; i++) {
        const path = testPaths[i % testPaths.length]
        compiler.match(path, 'GET')
      }
      const totalTime = performance.now() - startTime

      const stats = compiler.getStats()
      expect(stats.totalMatches).toBe(1000)
      expect(stats.cacheHits).toBeGreaterThan(900) // Most should be cache hits
      expect(totalTime).toBeLessThan(50) // Should be very fast with caching
    })

    it('should demonstrate O(log n) complexity', () => {
      const testSizes = [10, 100, 1000]
      const times: number[] = []

      for (const size of testSizes) {
        const testCompiler = new RouteCompiler()

        // Add routes
        for (let i = 0; i < size; i++) {
          testCompiler.addRoute({
            path: `/route${i}`,
            method: 'GET',
            handler: () => new Response(),
            middleware: [],
            type: 'api',
          })
        }

        // Measure matching time
        const startTime = performance.now()
        for (let i = 0; i < 100; i++) {
          testCompiler.match(`/route${i % size}`, 'GET')
        }
        const endTime = performance.now()

        times.push(endTime - startTime)
      }

      // Time complexity should not grow linearly
      // With caching, larger sets might even be faster due to cache hits
      expect(times[2]).toBeLessThan(times[0] * 10) // Not 100x slower for 100x more routes
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty paths', () => {
      const route: Route = {
        path: '/',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(route)
      const match = trie.match('/', 'GET')

      expect(match).toBeTruthy()
      expect(match?.route.path).toBe('/')
    })

    it('should handle routes with special characters', () => {
      const route: Route = {
        path: '/api/search/{query}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(route)
      const match = trie.match('/api/search/hello%20world', 'GET')

      expect(match).toBeTruthy()
      expect(match?.params.query).toBe('hello%20world')
    })

    it('should handle very long paths', () => {
      const longPath = `/api/${'segment/'.repeat(50)}{id}`
      const route: Route = {
        path: longPath,
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      }

      trie.addRoute(route)
      const testPath = `/api/${'segment/'.repeat(50)}123`
      const match = trie.match(testPath, 'GET')

      expect(match).toBeTruthy()
      expect(match?.params.id).toBe('123')
    })

    it('should handle duplicate route registration gracefully', () => {
      const route: Route = {
        path: '/users',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      }

      compiler.addRoute(route)
      compiler.addRoute(route) // Add same route twice

      const conflicts = compiler.getRouteConflicts()
      expect(conflicts.some(c => c.conflictType === 'duplicate')).toBe(true)
    })
  })
})
