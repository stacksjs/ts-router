// @ts-nocheck
import type { EnhancedRequest, NextFunction } from '../src/types'
import { beforeEach, describe, expect, it } from 'bun:test'
import { Router } from '../src/router'

// Extend EnhancedRequest for testing
declare module '../src/types' {
  interface EnhancedRequest {
    testOrder?: string[]
  }
}

describe('Bun Router - Middleware Tests', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  it('should apply route-specific middleware', async () => {
    // Create a simple middleware
    const loggerMiddleware = async (req: EnhancedRequest, next: NextFunction) => {
      // Add something to the request
      req.requestId = 'test-request-id'
      // Continue to next middleware/route handler
      return await next()
    }

    // Create a route that uses the middleware
    await router.get('/middleware-test', async (req) => {
      return new Response(`Request ID: ${req.requestId}`, {
        status: 200,
      })
    }, 'web')

    // Apply the middleware to all routes
    await router.use(loggerMiddleware)

    // Make a request to the route
    const response = await router.handleRequest(new Request('http://localhost/middleware-test'))

    // Verify the middleware was applied
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Request ID: test-request-id')
  })

  it('should apply middleware in the correct order', async () => {
    // Create a fresh router
    router = new Router()

    // Make our execution order tracking global
    const executionOrder: string[] = []

    // First middleware that runs first, ends last
    const middleware1 = async (req: EnhancedRequest, next: NextFunction) => {
      executionOrder.push('before_middleware1')
      // Call next to get the response from downstream
      const response = await next()
      executionOrder.push('after_middleware1')

      // Add our mark to the response
      if (!response)
        return new Response('Not Found', { status: 404 })
      const text = await response.clone().text()
      return new Response(`${text} + MW1`, {
        status: response.status,
        headers: response.headers,
      })
    }

    // Second middleware that runs second, ends second-to-last
    const middleware2 = async (req: EnhancedRequest, next: NextFunction) => {
      executionOrder.push('before_middleware2')
      // Call next to get the response from downstream
      const response = await next()
      executionOrder.push('after_middleware2')

      // Add our mark to the response
      if (!response)
        return new Response('Not Found', { status: 404 })
      const text = await response.clone().text()
      const headers = new Headers(response.headers)
      headers.set('X-Custom-Header', 'test-value')
      return new Response(`${text} + MW2`, {
        status: response.status,
        headers,
      })
    }

    // Register middlewares in the correct order
    await router.use(middleware1) // This runs first
    await router.use(middleware2) // This runs second

    // Create a simple route
    await router.get('/order-test', () => {
      executionOrder.push('handler')
      return new Response('RESPONSE', { status: 200 })
    })

    // Make a request
    const response = await router.handleRequest(new Request('http://localhost/order-test'))

    // Verify status
    expect(response.status).toBe(200)

    // Verify response text has correct order of modifications
    const text = await response.text()
    expect(text).toBe('RESPONSE + MW2 + MW1')

    // Verify execution order
    expect(executionOrder).toEqual([
      'before_middleware1',
      'before_middleware2',
      'handler',
      'after_middleware2',
      'after_middleware1',
    ])
  })

  it('should allow middleware to short-circuit responses', async () => {
    // Create an auth middleware that blocks some requests
    const authMiddleware = async (req: EnhancedRequest, next: NextFunction) => {
      if (req.url.includes('protected')) {
        return new Response('Unauthorized', { status: 401 })
      }
      return next()
    }

    // Register the middleware
    await router.use(authMiddleware)

    // Register routes
    await router.get('/protected', () => new Response('Secret Data', { status: 200 }))
    await router.get('/public', () => new Response('Public Data', { status: 200 }))

    // Test protected route
    const protectedResponse = await router.handleRequest(new Request('http://localhost/protected'))
    expect(protectedResponse.status).toBe(401)
    expect(await protectedResponse.text()).toBe('Unauthorized')

    // Test public route
    const publicResponse = await router.handleRequest(new Request('http://localhost/public'))
    expect(publicResponse.status).toBe(200)
    expect(await publicResponse.text()).toBe('Public Data')
  })
})
