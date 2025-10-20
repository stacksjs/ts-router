import type { Route } from '../packages/bun-router/src/types'
import { beforeEach, describe, expect, it } from 'bun:test'
import { RouteCompiler } from '../packages/bun-router/src/router/route-compiler'
import { RouteTrie } from '../packages/bun-router/src/router/route-trie'

describe('Route Optimization - Core Functionality', () => {
  let trie: RouteTrie
  let compiler: RouteCompiler

  beforeEach(() => {
    trie = new RouteTrie()
    compiler = new RouteCompiler({ precompilePatterns: false }) // Disable URLPattern usage
  })

  describe('RouteTrie Basic Functionality', () => {
    it('should match static routes', () => {
      const route: Route = {
        path: '/users',
        method: 'GET',
        handler: () => new Response('users'),
        middleware: [],
      }

      trie.addRoute(route)
      const match = trie.match('/users', 'GET')

      expect(match).toBeTruthy()
      expect(match?.route.path).toBe('/users')
      expect(match?.params).toEqual({})
    })

    it('should match parameterized routes', () => {
      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response('user'),
        middleware: [],
      }

      trie.addRoute(route)
      const match = trie.match('/users/123', 'GET')

      expect(match).toBeTruthy()
      expect(match?.route.path).toBe('/users/{id}')
      expect(match?.params).toEqual({ id: '123' })
    })

    it('should handle wildcard routes correctly', () => {
      const route: Route = {
        path: '/files/*',
        method: 'GET',
        handler: () => new Response('file'),
        middleware: [],
      }

      trie.addRoute(route)
      const match = trie.match('/files/documents/test.pdf', 'GET')

      expect(match).toBeTruthy()
      expect(match?.params.wildcard).toBe('documents/test.pdf')
    })

    it('should prioritize static routes over dynamic ones', () => {
      const staticRoute: Route = {
        path: '/users/profile',
        method: 'GET',
        handler: () => new Response('profile'),
        middleware: [],
      }

      const paramRoute: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response('user'),
        middleware: [],
      }

      trie.addRoute(paramRoute)
      trie.addRoute(staticRoute)

      const match = trie.match('/users/profile', 'GET')
      expect(match?.route.path).toBe('/users/profile')
    })

    it('should handle different HTTP methods', () => {
      const getRoute: Route = {
        path: '/users',
        method: 'GET',
        handler: () => new Response('get'),
        middleware: [],
      }

      const postRoute: Route = {
        path: '/users',
        method: 'POST',
        handler: () => new Response('post'),
        middleware: [],
      }

      trie.addRoute(getRoute)
      trie.addRoute(postRoute)

      const getMatch = trie.match('/users', 'GET')
      expect(getMatch?.route.method).toBe('GET')

      const postMatch = trie.match('/users', 'POST')
      expect(postMatch?.route.method).toBe('POST')
    })
  })

  describe('RouteCompiler Basic Functionality', () => {
    it('should compile and match routes', () => {
      const route: Route = {
        path: '/api/users/{id}',
        method: 'GET',
        handler: () => new Response('user'),
        middleware: [],
      }

      compiler.addRoute(route)
      const match = compiler.match('/api/users/123', 'GET')

      expect(match).toBeTruthy()
      expect(match?.route.path).toBe('/api/users/{id}')
      expect(match?.params.id).toBe('123')
    })

    it('should provide performance statistics', () => {
      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
      }

      compiler.addRoute(route)
      compiler.match('/users/123', 'GET')

      const stats = compiler.getStats()
      expect(stats.totalMatches).toBe(1)
      expect(stats.averageMatchTime).toBeGreaterThan(0)
    })

    it('should cache results for better performance', () => {
      const route: Route = {
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
      }

      compiler.addRoute(route)

      // First match
      compiler.match('/users/123', 'GET')
      // Second match (should hit cache)
      compiler.match('/users/123', 'GET')

      const stats = compiler.getStats()
      expect(stats.totalMatches).toBe(2)
      expect(stats.cacheHits).toBe(1)
    })

    it('should group routes by HTTP method', () => {
      const routes: Route[] = [
        { path: '/users', method: 'GET', handler: () => new Response(), middleware: [] },
        { path: '/users', method: 'POST', handler: () => new Response(), middleware: [] },
        { path: '/posts', method: 'GET', handler: () => new Response(), middleware: [] },
      ]

      routes.forEach(route => compiler.addRoute(route))
      const routesByMethod = compiler.getRoutesByMethod()

      expect(routesByMethod.get('GET')).toHaveLength(2)
      expect(routesByMethod.get('POST')).toHaveLength(1)
    })
  })

  describe('Performance Characteristics', () => {
    it('should handle large numbers of routes efficiently', () => {
      const routeCount = 1000

      // Add many routes
      for (let i = 0; i < routeCount; i++) {
        compiler.addRoute({
          path: `/api/resource${i}/{id}`,
          method: 'GET',
          handler: () => new Response(),
          middleware: [],
        })
      }

      // Test matching performance
      const start = performance.now()
      for (let i = 0; i < 100; i++) {
        const routeIndex = i % routeCount
        compiler.match(`/api/resource${routeIndex}/test`, 'GET')
      }
      const totalTime = performance.now() - start

      // Should complete quickly even with many routes
      expect(totalTime).toBeLessThan(100) // Less than 100ms for 100 matches

      const stats = compiler.getStats()
      expect(stats.totalMatches).toBe(100)
    })

    it('should demonstrate cache effectiveness', () => {
      const route: Route = {
        path: '/api/users/{id}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
      }

      compiler.addRoute(route)

      // Make repeated requests to the same path
      const testPath = '/api/users/123'
      for (let i = 0; i < 10; i++) {
        compiler.match(testPath, 'GET')
      }

      const cacheStats = compiler.getCacheStats()
      expect(cacheStats.hitRate).toBeGreaterThan(0.8) // >80% cache hit rate
    })
  })

  describe('Edge Cases', () => {
    it('should handle root path', () => {
      const route: Route = {
        path: '/',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
      }

      trie.addRoute(route)
      const match = trie.match('/', 'GET')

      expect(match).toBeTruthy()
      expect(match?.route.path).toBe('/')
    })

    it('should handle nested parameters', () => {
      const route: Route = {
        path: '/users/{userId}/posts/{postId}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
      }

      trie.addRoute(route)
      const match = trie.match('/users/123/posts/456', 'GET')

      expect(match).toBeTruthy()
      expect(match?.params).toEqual({ userId: '123', postId: '456' })
    })

    it('should return null for non-matching routes', () => {
      const route: Route = {
        path: '/users',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
      }

      trie.addRoute(route)
      const match = trie.match('/posts', 'GET')

      expect(match).toBeNull()
    })

    it('should handle method mismatches', () => {
      const route: Route = {
        path: '/users',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
      }

      trie.addRoute(route)
      const match = trie.match('/users', 'POST')

      expect(match).toBeNull()
    })
  })
})
