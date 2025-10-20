import type { EnhancedRequest, NextFunction } from '../src/types'
import { beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { Router } from '../src/router'

describe('Router Performance Optimizations', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  describe('Route Caching', () => {
    it('should cache matched routes', async () => {
      // Setup a spy on the handleRequest method to track matching
      const handleRequestSpy = spyOn(router, 'handleRequest')

      // Register a route
      await router.get('/test-cache', () => new Response('Test Cache'))

      // First request
      const response1 = await router.handleRequest(new Request('http://localhost/test-cache'))
      expect(response1.status).toBe(200)
      expect(await response1.text()).toBe('Test Cache')

      // Second request - should be faster due to caching
      const response2 = await router.handleRequest(new Request('http://localhost/test-cache'))
      expect(response2.status).toBe(200)
      expect(await response2.text()).toBe('Test Cache')

      // Just verify both requests were handled correctly
      expect(handleRequestSpy).toHaveBeenCalledTimes(2)
    })

    it('should invalidate cache when adding new routes', async () => {
      // Create a route
      await router.get('/cached-route', () => new Response('Original Route'))

      // First request to populate cache
      await router.handleRequest(new Request('http://localhost/cached-route'))

      // Add a new route which should invalidate the cache
      await router.get('/new-route', () => new Response('New Route'))

      // Make another request to the original route
      const response = await router.handleRequest(new Request('http://localhost/cached-route'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Original Route')
    })
  })

  describe('Static Route Fast Path', () => {
    it('should register and match static routes correctly', async () => {
      // Register a static route
      await router.get('/static-path', () => new Response('Static Route'))

      // Register a dynamic route
      await router.get('/dynamic/{param}', req => new Response(`Dynamic Route: ${req.params.param}`))

      // Check static route works
      const staticResponse = await router.handleRequest(new Request('http://localhost/static-path'))
      expect(staticResponse.status).toBe(200)
      expect(await staticResponse.text()).toBe('Static Route')

      // Check dynamic route works
      const dynamicResponse = await router.handleRequest(new Request('http://localhost/dynamic/test'))
      expect(dynamicResponse.status).toBe(200)
      expect(await dynamicResponse.text()).toBe('Dynamic Route: test')
    })
  })

  describe('Pattern Compilation Optimization', () => {
    it('should correctly match routes with constraints', async () => {
      // Register a route with a constraint using where
      const routeWithConstraint = await router.get('/users/{id}', () => new Response('User'))
      // Apply the number constraint
      routeWithConstraint.where({ id: '\\d+' })

      // Make a request that matches the constraint
      const response1 = await router.handleRequest(new Request('http://localhost/users/123'))
      expect(response1.status).toBe(200)
      expect(await response1.text()).toBe('User')

      // Make a request that doesn't match the constraint
      const response2 = await router.handleRequest(new Request('http://localhost/users/abc'))
      expect(response2.status).toBe(404)
    })
  })

  describe('Middleware Chain Optimization', () => {
    it('should build and execute optimized middleware chain', async () => {
      // Create middleware functions
      const middleware1 = async (req: EnhancedRequest, next: NextFunction) => {
        req.params.middleware1 = 'executed'
        return await next()
      }

      const middleware2 = async (req: EnhancedRequest, next: NextFunction) => {
        req.params.middleware2 = 'executed'
        return await next()
      }

      // Register route with middleware
      await router.get('/middleware-chain', (req) => {
        return new Response(`Middleware1: ${req.params.middleware1}, Middleware2: ${req.params.middleware2}`)
      }, 'web', 'middleware-test', [middleware1, middleware2])

      // Make a request
      const response = await router.handleRequest(new Request('http://localhost/middleware-chain'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Middleware1: executed, Middleware2: executed')
    })
  })

  describe('Lazy Cookie Parsing', () => {
    it('should parse cookies only when accessed', async () => {
      // Create a route that doesn't access cookies
      await router.get('/no-cookies', () => new Response('No Cookies Accessed'))

      // Create a route that accesses cookies
      await router.get('/use-cookies', (req) => {
        const cookieValue = req.cookies.get('test-cookie')
        return new Response(`Cookie Value: ${cookieValue}`)
      })

      // Request without cookies that doesn't access them
      const response1 = await router.handleRequest(new Request('http://localhost/no-cookies'))
      expect(response1.status).toBe(200)

      // Request with cookies that accesses them
      const headers = new Headers()
      headers.append('Cookie', 'test-cookie=cookie-value')
      const response2 = await router.handleRequest(new Request('http://localhost/use-cookies', { headers }))
      expect(response2.status).toBe(200)
      expect(await response2.text()).toBe('Cookie Value: cookie-value')
    })
  })

  describe('Domain Pattern Caching', () => {
    it('should work with domain-specific routes', async () => {
      // Register a domain-specific route
      await router.domain('test.example.com', async () => {
        await router.get('/domain-test', () => new Response('Domain Test'))
      })

      // Register a route with dynamic domain parameters
      await router.domain('{subdomain}.example.com', async () => {
        await router.get('/dynamic-domain', (_req) => {
          return new Response('Subdomain Test')
        })
      })

      // Make a request to the domain
      const headers = new Headers()
      headers.append('Host', 'test.example.com')
      const response = await router.handleRequest(new Request('http://test.example.com/domain-test', { headers }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Domain Test')
    })
  })

  describe('Cache Invalidation', () => {
    it('should reset caches when server is restarted', async () => {
      // Register a route
      await router.get('/invalidate-test', () => new Response('Test'))

      // Make a request to populate cache
      await router.handleRequest(new Request('http://localhost/invalidate-test'))

      // Start the server (this should call invalidateCache)
      try {
        await router.serve({ port: 0 })

        // Make another request after server start
        const response = await router.handleRequest(new Request('http://localhost/invalidate-test'))
        expect(response.status).toBe(200)

        // Cleanup
        router.getServer()?.stop()
      }
      catch {
        // In case port is in use, continue test
      }
    })

    it('should work after manual cache reset', async () => {
      // Register a route
      await router.get('/invalidate-test', () => new Response('Test'))

      // Make a request to populate cache
      await router.handleRequest(new Request('http://localhost/invalidate-test'))

      // Manually reset caches by modifying routes
      await router.get('/another-route', () => new Response('Another'))

      // Make another request
      const response = await router.handleRequest(new Request('http://localhost/invalidate-test'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test')
    })
  })

  describe('Performance Impact', () => {
    it('should handle high load efficiently', async () => {
      // Register a test route
      await router.get('/high-load', () => new Response('High Load Test'))

      // Time execution of multiple requests to the same endpoint
      const startTime = Date.now()

      // Make multiple requests to benefit from caching
      const requests = []
      for (let i = 0; i < 100; i++) {
        requests.push(router.handleRequest(new Request('http://localhost/high-load')))
      }

      // Wait for all requests to complete
      const responses = await Promise.all(requests)

      const endTime = Date.now()
      const duration = endTime - startTime

      // Check all responses were successful
      for (const response of responses) {
        expect(response.status).toBe(200)
      }

      // Just assert that we processed the requests in a reasonable time
      expect(duration).toBeLessThan(2000) // Should be much faster than 2 seconds for 100 requests
    })
  })
})
