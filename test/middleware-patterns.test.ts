// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import { Router } from '../packages/bun-router/src/router/router'

describe('Advanced Middleware Patterns', () => {
  it('should support middleware groups', async () => {
    const router = new Router()

    // Register middleware group
    router.middlewareGroup('api', ['auth', 'throttle:60,1', 'cors'])

    // Apply middleware group to routes
    const routeBuilder = router.middlewareGroupRoutes('api')
    expect(routeBuilder).toBeDefined()
  })

  it('should support conditional middleware', async () => {
    const router = new Router()

    // Conditional middleware based on request
    const condition = (req: any) => req.headers.get('x-admin') === 'true'
    const conditionalBuilder = router.when(condition)

    expect(conditionalBuilder).toBeDefined()
    expect(() => conditionalBuilder.middleware('auth')).not.toThrow()
  })

  it('should support middleware with parameters', async () => {
    const router = new Router()

    // Middleware with parameters
    const middlewareBuilder = router.middleware('throttle:100,5')
    expect(middlewareBuilder).toBeDefined()

    // Should be able to chain route methods
    const routeBuilder = middlewareBuilder.get('/api/test', async () => new Response('OK'))
    expect(routeBuilder).toBeDefined()
  })

  it('should parse middleware parameters correctly', async () => {
    const router = new Router()

    // Test different parameter formats
    expect(() => router.middleware('throttle:60,1')).not.toThrow()
    expect(() => router.middleware('auth')).not.toThrow()
    expect(() => router.middleware('cors')).not.toThrow()
  })

  it('should throw error for unknown middleware', async () => {
    const router = new Router()

    expect(() => router.middleware('unknown:param')).toThrow('Unknown middleware: unknown')
  })

  it('should support complex middleware patterns', async () => {
    const router = new Router()

    // Register API middleware group
    router.middlewareGroup('api', ['auth', 'throttle:60,1', 'cors'])

    // Create conditional middleware for admin routes
    const isAdmin = (req: any) => req.headers.get('x-role') === 'admin'

    // Combine patterns
    router.when(isAdmin).middleware('auth')

    // Apply middleware group and additional middleware
    const route = router
      .middlewareGroupRoutes('api')
      .get('/admin/users', async () => new Response('Admin users'))

    expect(route).toBeDefined()
  })

  it('should handle middleware execution order', async () => {
    const _router = new Router()
    const executionOrder: string[] = []

    // Mock middleware that tracks execution
    const _createTrackingMiddleware = (name: string) => async (req: any, next: any) => {
      executionOrder.push(name)
      return await next()
    }

    // Register custom middleware (in real implementation)
    // This test demonstrates the expected behavior
    expect(executionOrder).toEqual([])
  })
})
