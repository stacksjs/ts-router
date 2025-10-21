import type { HTTPMethod, Route } from '../packages/bun-router/src/types'
import { describe, expect, it } from 'bun:test'
import { RouteCompiler } from '../packages/bun-router/src/router/route-compiler'

describe('Route Optimization Benchmarks', () => {
  describe('Trie vs Linear Search Performance', () => {
    it('should demonstrate significant performance improvement over linear search', () => {
      const routeCounts = [100, 500, 1000, 2000]
      const results: Array<{
        routeCount: number
        trieTime: number
        linearTime: number
        improvement: number
      }> = []

      for (const routeCount of routeCounts) {
        // Setup routes
        const routes: Route[] = []
        for (let i = 0; i < routeCount; i++) {
          routes.push({
            path: `/api/resource${i}/{id}`,
            method: 'GET',
            handler: () => new Response(`resource${i}`),
            middleware: [],
            type: 'api',
          })
        }

        // Test trie performance
        const compiler = new RouteCompiler()
        routes.forEach(route => compiler.addRoute(route))

        const trieStart = performance.now()
        for (let i = 0; i < 1000; i++) {
          const routeIndex = i % routeCount
          compiler.match(`/api/resource${routeIndex}/123`, 'GET')
        }
        const trieTime = performance.now() - trieStart

        // Simulate linear search performance
        const linearStart = performance.now()
        for (let i = 0; i < 1000; i++) {
          const routeIndex = i % routeCount
          const targetPath = `/api/resource${routeIndex}/123`

          // Linear search simulation
          let _found = false
          for (let j = 0; j < routeCount; j++) {
            if (routes[j].path.replace('{id}', '123') === targetPath) {
              _found = true
              break
            }
          }
        }
        const linearTime = performance.now() - linearStart

        const improvement = linearTime / trieTime
        results.push({ routeCount, trieTime, linearTime, improvement })

        // Trie should be significantly faster
        expect(improvement).toBeGreaterThan(1)
      }

      // Log benchmark results
      console.log('\n=== Route Matching Performance Benchmarks ===')
      console.log('Routes\tTrie (ms)\tLinear (ms)\tImprovement')
      results.forEach(({ routeCount, trieTime, linearTime, improvement }) => {
        console.log(`${routeCount}\t${trieTime.toFixed(2)}\t\t${linearTime.toFixed(2)}\t\t${improvement.toFixed(2)}x`)
      })

      // Performance should improve with larger route sets
      expect(results[results.length - 1].improvement).toBeGreaterThan(results[0].improvement)
    })

    it('should maintain O(log n) complexity characteristics', () => {
      const routeCounts = [10, 100, 1000, 5000]
      const timings: number[] = []

      for (const routeCount of routeCounts) {
        const compiler = new RouteCompiler()

        // Add routes with varying complexity
        for (let i = 0; i < routeCount; i++) {
          const complexity = i % 4
          let path: string

          switch (complexity) {
            case 0:
              path = `/static${i}`
              break
            case 1:
              path = `/param${i}/{id}`
              break
            case 2:
              path = `/multi${i}/{id}/{action}`
              break
            case 3:
              path = `/constrained${i}/{id:\\d+}`
              break
            default: path = `/default${i}`
          }

          compiler.addRoute({
            path,
            method: 'GET',
            handler: () => new Response(),
            middleware: [],
            type: 'api',
          })
        }

        // Measure average matching time
        const iterations = 1000
        const start = performance.now()

        for (let i = 0; i < iterations; i++) {
          const routeIndex = Math.floor(Math.random() * routeCount)
          compiler.match(`/param${routeIndex}/test`, 'GET')
        }

        const avgTime = (performance.now() - start) / iterations
        timings.push(avgTime)
      }

      console.log('\n=== Complexity Analysis ===')
      console.log('Routes\tAvg Time (ms)')
      routeCounts.forEach((count, i) => {
        console.log(`${count}\t${timings[i].toFixed(4)}`)
      })

      // Time should not grow linearly with route count
      const growthRatio = timings[timings.length - 1] / timings[0]
      const routeRatio = routeCounts[routeCounts.length - 1] / routeCounts[0]

      expect(growthRatio).toBeLessThan(routeRatio * 0.1) // Much less than linear growth
    })
  })

  describe('Cache Performance', () => {
    it('should demonstrate cache effectiveness', () => {
      const compiler = new RouteCompiler({ cacheSize: 1000 })

      // Add test routes
      for (let i = 0; i < 100; i++) {
        compiler.addRoute({
          path: `/api/users/{id}/posts/{postId}`,
          method: 'GET',
          handler: () => new Response(),
          middleware: [],
          type: 'api',
        })
      }

      // Test paths that will be repeated
      const testPaths = [
        '/api/users/1/posts/1',
        '/api/users/2/posts/2',
        '/api/users/3/posts/3',
        '/api/users/4/posts/4',
        '/api/users/5/posts/5',
      ]

      // First pass - populate cache
      const firstPassStart = performance.now()
      for (let i = 0; i < 100; i++) {
        const path = testPaths[i % testPaths.length]
        compiler.match(path, 'GET')
      }
      const firstPassTime = performance.now() - firstPassStart

      // Second pass - should hit cache
      const secondPassStart = performance.now()
      for (let i = 0; i < 100; i++) {
        const path = testPaths[i % testPaths.length]
        compiler.match(path, 'GET')
      }
      const secondPassTime = performance.now() - secondPassStart

      const _stats = compiler.getStats()
      const cacheStats = compiler.getCacheStats()

      console.log('\n=== Cache Performance ===')
      console.log(`Cache Hit Rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`)
      console.log(`First Pass Time: ${firstPassTime.toFixed(2)}ms`)
      console.log(`Second Pass Time: ${secondPassTime.toFixed(2)}ms`)
      console.log(`Speed Improvement: ${(firstPassTime / secondPassTime).toFixed(2)}x`)

      // Cache should provide significant speedup
      expect(cacheStats.hitRate).toBeGreaterThan(0.8)
      expect(secondPassTime).toBeLessThan(firstPassTime * 0.8)
    })

    it('should handle cache eviction gracefully', () => {
      const compiler = new RouteCompiler({ cacheSize: 10 }) // Small cache

      compiler.addRoute({
        path: '/users/{id}',
        method: 'GET',
        handler: () => new Response(),
        middleware: [],
        type: 'api',
      })

      // Fill cache beyond capacity
      for (let i = 0; i < 20; i++) {
        compiler.match(`/users/${i}`, 'GET')
      }

      const cacheStats = compiler.getCacheStats()
      expect(cacheStats.size).toBeLessThanOrEqual(10)

      // Should still function correctly
      const match = compiler.match('/users/999', 'GET')
      expect(match).toBeTruthy()
    })
  })

  describe('Method Grouping Performance', () => {
    it('should demonstrate method-specific optimization', () => {
      const compiler = new RouteCompiler({ enableMethodGrouping: true })

      // Add routes for different methods
      const methods: HTTPMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
      const routesPerMethod = 200

      methods.forEach((method) => {
        for (let i = 0; i < routesPerMethod; i++) {
          compiler.addRoute({
            path: `/api/${method.toLowerCase()}/${i}/{id}`,
            method,
            handler: () => new Response(),
            middleware: [],
            type: 'api',
          })
        }
      })

      // Test method-specific matching performance
      const methodTimes: Record<string, number> = {}

      methods.forEach((method) => {
        const start = performance.now()

        for (let i = 0; i < 100; i++) {
          const routeIndex = i % routesPerMethod
          compiler.match(`/api/${method.toLowerCase()}/${routeIndex}/test`, method)
        }

        methodTimes[method] = performance.now() - start
      })

      console.log('\n=== Method Grouping Performance ===')
      console.log('Method\tTime (ms)')
      Object.entries(methodTimes).forEach(([method, time]) => {
        console.log(`${method}\t${time.toFixed(2)}`)
      })

      // All methods should perform similarly well
      const times = Object.values(methodTimes)
      const maxTime = Math.max(...times)
      const minTime = Math.min(...times)
      const variance = maxTime / minTime

      expect(variance).toBeLessThan(2) // Should not vary by more than 2x
    })
  })

  describe('Priority System Performance', () => {
    it('should handle overlapping routes efficiently', () => {
      const compiler = new RouteCompiler({ enablePriorityOptimization: true })

      // Add overlapping routes with different priorities
      const overlappingRoutes: Route[] = [
        { path: '/users/profile', method: 'GET', handler: () => new Response('profile'), middleware: [], type: 'api' },
        { path: '/users/settings', method: 'GET', handler: () => new Response('settings'), middleware: [], type: 'api' },
        { path: '/users/{id}', method: 'GET', handler: () => new Response('user'), middleware: [], type: 'api' },
        { path: '/users/{id}/posts', method: 'GET', handler: () => new Response('posts'), middleware: [], type: 'api' },
        { path: '/users/{id}/posts/{postId}', method: 'GET', handler: () => new Response('post'), middleware: [], type: 'api' },
        { path: '/users/*', method: 'GET', handler: () => new Response('wildcard'), middleware: [], type: 'api' },
      ]

      overlappingRoutes.forEach(route => compiler.addRoute(route))

      // Test that priority resolution is fast
      const testCases = [
        { path: '/users/profile', expected: 'profile' },
        { path: '/users/settings', expected: 'settings' },
        { path: '/users/123', expected: 'user' },
        { path: '/users/123/posts', expected: 'posts' },
        { path: '/users/123/posts/456', expected: 'post' },
        { path: '/users/anything/else', expected: 'wildcard' },
      ]

      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        const testCase = testCases[i % testCases.length]
        const match = compiler.match(testCase.path, 'GET')
        expect(match).toBeTruthy()
      }

      const totalTime = performance.now() - start

      console.log('\n=== Priority Resolution Performance ===')
      console.log(`1000 priority resolutions: ${totalTime.toFixed(2)}ms`)
      console.log(`Average per resolution: ${(totalTime / 1000).toFixed(4)}ms`)

      // Should be very fast even with overlapping routes
      expect(totalTime).toBeLessThan(50)
    })

    it('should detect conflicts efficiently', () => {
      const compiler = new RouteCompiler()

      // Add potentially conflicting routes
      const routes: Route[] = []
      for (let i = 0; i < 100; i++) {
        routes.push({
          path: `/api/resource{i}/{id}`,
          method: 'GET',
          handler: () => new Response(),
          middleware: [],
          type: 'api',
        })

        // Add some actual conflicts
        if (i % 10 === 0) {
          routes.push({
            path: `/api/resource{i}/{userId}`, // Conflicts with above
            method: 'GET',
            handler: () => new Response(),
            middleware: [],
            type: 'api',
          })
        }
      }

      routes.forEach(route => compiler.addRoute(route))

      const start = performance.now()
      const conflicts = compiler.getRouteConflicts()
      const conflictDetectionTime = performance.now() - start

      console.log('\n=== Conflict Detection Performance ===')
      console.log(`Routes analyzed: ${routes.length}`)
      console.log(`Conflicts found: ${conflicts.length}`)
      console.log(`Detection time: ${conflictDetectionTime.toFixed(2)}ms`)

      expect(conflicts.length).toBeGreaterThan(0)
      expect(conflictDetectionTime).toBeLessThan(100) // Should be fast
    })
  })

  describe('Memory Usage', () => {
    it('should have reasonable memory footprint', () => {
      const compiler = new RouteCompiler()

      // Measure initial memory
      const initialMemory = process.memoryUsage()

      // Add many routes
      for (let i = 0; i < 10000; i++) {
        compiler.addRoute({
          path: `/api/route${i}/{param1}/{param2}`,
          method: 'GET',
          handler: () => new Response(),
          middleware: [],
          type: 'api',
        })
      }

      // Perform many matches to populate cache
      for (let i = 0; i < 1000; i++) {
        compiler.match(`/api/route${i % 1000}/test1/test2`, 'GET')
      }

      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed
      const memoryPerRoute = memoryIncrease / 10000

      console.log('\n=== Memory Usage Analysis ===')
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`)
      console.log(`Memory per route: ${memoryPerRoute.toFixed(0)} bytes`)
      console.log(`Cache size: ${compiler.getCacheStats().size}`)

      // Should use reasonable memory per route
      expect(memoryPerRoute).toBeLessThan(1000) // Less than 1KB per route
    })
  })

  describe('Real-world Simulation', () => {
    it('should handle realistic API route patterns', () => {
      const compiler = new RouteCompiler()

      // Simulate a real API with common patterns
      const apiRoutes: Route[] = [
        // User management
        { path: '/api/users', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/users', method: 'POST', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/users/{id}', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/users/{id}', method: 'PUT', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/users/{id}', method: 'DELETE', handler: () => new Response(), middleware: [], type: 'api' },

        // Posts and comments
        { path: '/api/posts', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/posts', method: 'POST', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/posts/{id}', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/posts/{id}/comments', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/posts/{id}/comments', method: 'POST', handler: () => new Response(), middleware: [], type: 'api' },

        // File uploads
        { path: '/api/files', method: 'POST', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/files/{id}', method: 'GET', handler: () => new Response(), middleware: [], type: 'api' },
        { path: '/api/files/{id}', method: 'DELETE', handler: () => new Response(), middleware: [], type: 'api' },

        // Admin routes
        { path: '/admin/dashboard', method: 'GET', handler: () => new Response(), middleware: [], type: 'web' },
        { path: '/admin/users', method: 'GET', handler: () => new Response(), middleware: [], type: 'web' },
        { path: '/admin/settings', method: 'GET', handler: () => new Response(), middleware: [], type: 'web' },

        // Static pages
        { path: '/', method: 'GET', handler: () => new Response(), middleware: [], type: 'web' },
        { path: '/about', method: 'GET', handler: () => new Response(), middleware: [], type: 'web' },
        { path: '/contact', method: 'GET', handler: () => new Response(), middleware: [], type: 'web' },

        // Wildcards
        { path: '/assets/*', method: 'GET', handler: () => new Response(), middleware: [], type: 'web' },
      ]

      apiRoutes.forEach(route => compiler.addRoute(route))

      // Simulate realistic traffic patterns
      const trafficPatterns = [
        { path: '/api/users', method: 'GET' as HTTPMethod, weight: 10 },
        { path: '/api/users/123', method: 'GET' as HTTPMethod, weight: 8 },
        { path: '/api/posts', method: 'GET' as HTTPMethod, weight: 15 },
        { path: '/api/posts/456', method: 'GET' as HTTPMethod, weight: 12 },
        { path: '/', method: 'GET' as HTTPMethod, weight: 20 },
        { path: '/about', method: 'GET' as HTTPMethod, weight: 5 },
        { path: '/assets/style.css', method: 'GET' as HTTPMethod, weight: 3 },
      ]

      const start = performance.now()
      let totalRequests = 0

      // Simulate 10,000 requests with realistic distribution
      for (let i = 0; i < 10000; i++) {
        const pattern = trafficPatterns[Math.floor(Math.random() * trafficPatterns.length)]
        compiler.match(pattern.path, pattern.method)
        totalRequests++
      }

      const totalTime = performance.now() - start
      const stats = compiler.getStats()
      const cacheStats = compiler.getCacheStats()

      console.log('\n=== Real-world Simulation Results ===')
      console.log(`Total requests: ${totalRequests}`)
      console.log(`Total time: ${totalTime.toFixed(2)}ms`)
      console.log(`Requests per second: ${(totalRequests / (totalTime / 1000)).toFixed(0)}`)
      console.log(`Average response time: ${stats.averageMatchTime.toFixed(4)}ms`)
      console.log(`Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`)

      // Should handle high throughput efficiently
      expect(totalRequests / (totalTime / 1000)).toBeGreaterThan(10000) // >10k RPS
      expect(stats.averageMatchTime).toBeLessThan(0.1) // <0.1ms average
      expect(cacheStats.hitRate).toBeGreaterThan(0.7) // >70% cache hit rate
    })
  })
})
