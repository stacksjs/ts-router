import { beforeEach, describe, expect, test } from 'bun:test'
import { RateLimit } from '../src/middleware'
import { Router } from '../src/router'

describe('Rate Limiter Middleware', () => {
  let router: Router

  beforeEach(() => {
    router = new Router({ verbose: false })
  })

  test('should allow requests under the rate limit', async () => {
    // Set up rate limiter with high limit
    const rateLimiter = new RateLimit({
      maxRequests: 10,
      windowMs: 1000,
    })

    router.get('/test-rate-limit', async (_req) => {
      return new Response('OK')
    })

    // Apply middleware
    router.use(rateLimiter.handle.bind(rateLimiter))

    // Wait for rate limiter to initialize
    await new Promise(resolve => setTimeout(resolve, 100))

    // Make a request
    const response = await router.handleRequest(new Request('http://localhost/test-rate-limit'))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('OK')
    expect(response.headers.has('RateLimit-Limit')).toBe(true)
    expect(response.headers.has('RateLimit-Remaining')).toBe(true)
    expect(response.headers.has('RateLimit-Reset')).toBe(true)
  })

  test('should block requests over the rate limit', async () => {
    // Set up rate limiter with very low limit and standard handler
    const rateLimiter = new RateLimit({
      maxRequests: 1,
      windowMs: 10000, // 10 seconds
      // We're manually setting a custom handler to not depend on config
      handler: async (_req, _limit) => {
        return new Response('Too Many Requests', {
          status: 429,
          headers: {
            'RateLimit-Limit': '1',
            'RateLimit-Remaining': '0',
            'RateLimit-Reset': Math.ceil(Date.now() / 1000 + 10).toString(),
          },
        })
      },
    })

    router.get('/test-rate-limit', async (_req) => {
      return new Response('OK')
    })

    // Apply middleware
    router.use(rateLimiter.handle.bind(rateLimiter))

    // Wait for rate limiter to initialize
    await new Promise(resolve => setTimeout(resolve, 100))

    // First request should succeed
    const response1 = await router.handleRequest(new Request('http://localhost/test-rate-limit'))
    expect(response1.status).toBe(200)

    // Second request should be rate limited
    const response2 = await router.handleRequest(new Request('http://localhost/test-rate-limit'))
    expect(response2.status).toBe(429)
    expect(await response2.text()).toBe('Too Many Requests')
    expect(response2.headers.has('RateLimit-Limit')).toBe(true)
    expect(response2.headers.has('RateLimit-Remaining')).toBe(true)
    expect(response2.headers.has('RateLimit-Reset')).toBe(true)
  })

  test('should respect custom handler for rate limited requests', async () => {
    // Set up rate limiter with custom handler
    const rateLimiter = new RateLimit({
      maxRequests: 1,
      windowMs: 5000,
      handler: async (req, limit) => {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          limit: limit.limit,
          remaining: limit.remaining,
          reset: limit.resetTime,
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })

    router.get('/test-custom-handler', async (_req) => {
      return new Response('OK')
    })

    // Apply middleware
    router.use(rateLimiter.handle.bind(rateLimiter))

    // Wait for rate limiter to initialize
    await new Promise(resolve => setTimeout(resolve, 100))

    // First request should succeed
    const response1 = await router.handleRequest(new Request('http://localhost/test-custom-handler'))
    expect(response1.status).toBe(200)

    // Second request should use our custom handler
    const response2 = await router.handleRequest(new Request('http://localhost/test-custom-handler'))
    expect(response2.status).toBe(429)

    const body = await response2.json() as { error: string, limit: number }
    expect(body.error).toBe('Rate limit exceeded')
    expect(typeof body.limit).toBe('number')
    expect(response2.headers.get('Content-Type')).toBe('application/json')
  })

  test('should skip rate limiting based on custom skip function', async () => {
    // Set up rate limiter with skip function
    const rateLimiter = new RateLimit({
      maxRequests: 1,
      windowMs: 5000,
      skip: (req) => {
        return req.url.includes('skip-me')
      },
    })

    router.get('/test-skip-me', async (_req) => {
      return new Response('OK')
    })

    // Apply middleware
    router.use(rateLimiter.handle.bind(rateLimiter))

    // Wait for rate limiter to initialize
    await new Promise(resolve => setTimeout(resolve, 100))

    // Multiple requests to the skipped route should all succeed
    const response1 = await router.handleRequest(new Request('http://localhost/test-skip-me'))
    expect(response1.status).toBe(200)

    const response2 = await router.handleRequest(new Request('http://localhost/test-skip-me'))
    expect(response2.status).toBe(200)

    const response3 = await router.handleRequest(new Request('http://localhost/test-skip-me'))
    expect(response3.status).toBe(200)
  })
})
