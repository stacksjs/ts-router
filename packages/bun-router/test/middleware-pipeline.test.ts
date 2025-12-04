/**
 * Middleware Pipeline Tests
 *
 * Comprehensive tests for middleware execution, ordering, and error handling
 */

import type { EnhancedRequest, MiddlewareHandler } from '../src/types'
import { describe, expect, it, mock } from 'bun:test'
import { Router } from '../src/router/index'

describe('Middleware Pipeline', () => {
  describe('Execution Order', () => {
    it('should execute middleware in order', async () => {
      const router = new Router()
      const order: number[] = []

      const middleware1: MiddlewareHandler = async (_req, next) => {
        order.push(1)
        const res = await next()
        order.push(4)
        return res
      }

      const middleware2: MiddlewareHandler = async (_req, next) => {
        order.push(2)
        const res = await next()
        order.push(3)
        return res
      }

      router.use(middleware1)
      router.use(middleware2)
      await router.get('/test', () => new Response('OK'))

      await router.handleRequest(new Request('http://localhost/test'))

      expect(order).toEqual([1, 2, 3, 4])
    })

    it('should execute global middleware before route handler', async () => {
      const router = new Router()
      const order: string[] = []

      const globalMiddleware: MiddlewareHandler = async (_req, next) => {
        order.push('global')
        return next()
      }

      router.use(globalMiddleware)
      await router.get('/test', () => {
        order.push('handler')
        return new Response('OK')
      })

      await router.handleRequest(new Request('http://localhost/test'))

      expect(order).toEqual(['global', 'handler'])
    })
  })

  describe('Request Modification', () => {
    it('should allow middleware to modify request', async () => {
      const router = new Router()

      const authMiddleware: MiddlewareHandler = async (req, next) => {
        const enhanced = req as EnhancedRequest
        enhanced.user = { id: 1, name: 'John' }
        return next()
      }

      router.use(authMiddleware)
      await router.get('/test', (req: EnhancedRequest) => {
        return new Response(JSON.stringify(req.user))
      })

      const response = await router.handleRequest(new Request('http://localhost/test'))
      const body = await response.json() as { id: number, name: string }

      expect(body).toEqual({ id: 1, name: 'John' })
    })

    it('should pass modified request through chain', async () => {
      const router = new Router()

      const middleware1: MiddlewareHandler = async (req, next) => {
        const r = req as unknown as Record<string, unknown>
        r.step1 = true
        return next()
      }

      const middleware2: MiddlewareHandler = async (req, next) => {
        const r = req as unknown as Record<string, unknown>
        r.step2 = true
        return next()
      }

      router.use(middleware1)
      router.use(middleware2)
      await router.get('/test', (req: EnhancedRequest) => {
        const r = req as unknown as Record<string, unknown>
        return new Response(JSON.stringify({ step1: r.step1, step2: r.step2 }))
      })

      const response = await router.handleRequest(new Request('http://localhost/test'))
      const body = await response.json() as { step1: boolean, step2: boolean }

      expect(body).toEqual({ step1: true, step2: true })
    })
  })

  describe('Response Modification', () => {
    it('should allow middleware to modify response', async () => {
      const router = new Router()

      const headerMiddleware: MiddlewareHandler = async (_req, next) => {
        const response = await next()
        if (response) {
          const newResponse = new Response(response.body, response)
          newResponse.headers.set('X-Custom-Header', 'added')
          return newResponse
        }
        return response
      }

      router.use(headerMiddleware)
      await router.get('/test', () => new Response('OK'))

      const response = await router.handleRequest(new Request('http://localhost/test'))

      expect(response.headers.get('X-Custom-Header')).toBe('added')
    })

    it('should allow middleware to replace response entirely', async () => {
      const router = new Router()

      const cacheMiddleware: MiddlewareHandler = async (_req, _next) => {
        return new Response('Cached', { status: 200 })
      }

      router.use(cacheMiddleware)
      await router.get('/test', () => new Response('Fresh'))

      const response = await router.handleRequest(new Request('http://localhost/test'))
      const text = await response.text()

      expect(text).toBe('Cached')
    })
  })

  describe('Short-circuiting', () => {
    it('should allow middleware to short-circuit pipeline', async () => {
      const router = new Router()
      const handlerCalled = mock(() => {})

      const authMiddleware: MiddlewareHandler = async (_req, _next) => {
        return new Response('Unauthorized', { status: 401 })
      }

      router.use(authMiddleware)
      await router.get('/test', () => {
        handlerCalled()
        return new Response('OK')
      })

      const response = await router.handleRequest(new Request('http://localhost/test'))

      expect(response.status).toBe(401)
      expect(handlerCalled).not.toHaveBeenCalled()
    })

    it('should stop at first middleware that returns response', async () => {
      const router = new Router()
      const middleware2Called = mock(() => {})

      const middleware1: MiddlewareHandler = async (_req, _next) => {
        return new Response('Stopped at 1')
      }

      const middleware2: MiddlewareHandler = async (_req, next) => {
        middleware2Called()
        return next()
      }

      router.use(middleware1)
      router.use(middleware2)
      await router.get('/test', () => new Response('OK'))

      await router.handleRequest(new Request('http://localhost/test'))

      expect(middleware2Called).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should propagate errors from middleware', async () => {
      const router = new Router()

      const errorMiddleware: MiddlewareHandler = async (_req, _next) => {
        throw new Error('Middleware error')
      }

      router.use(errorMiddleware)
      await router.get('/test', () => new Response('OK'))

      const response = await router.handleRequest(new Request('http://localhost/test'))

      expect(response.status).toBe(500)
    })

    it('should allow error handling middleware', async () => {
      const router = new Router()

      const errorMiddleware: MiddlewareHandler = async (_req, next) => {
        try {
          return await next()
        }
        catch (error) {
          return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      const throwingMiddleware: MiddlewareHandler = async (_req, _next) => {
        throw new Error('Something went wrong')
      }

      router.use(errorMiddleware)
      router.use(throwingMiddleware)
      await router.get('/test', () => new Response('OK'))

      const response = await router.handleRequest(new Request('http://localhost/test'))
      const body = await response.json() as { error: string }

      expect(response.status).toBe(500)
      expect(body.error).toBe('Something went wrong')
    })
  })

  describe('Async Middleware', () => {
    it('should handle async middleware correctly', async () => {
      const router = new Router()

      const asyncMiddleware: MiddlewareHandler = async (req, next) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        const r = req as unknown as Record<string, unknown>
        r.asyncData = 'loaded'
        return next()
      }

      router.use(asyncMiddleware)
      await router.get('/test', (req: EnhancedRequest) => {
        const r = req as unknown as Record<string, unknown>
        return new Response(r.asyncData as string)
      })

      const response = await router.handleRequest(new Request('http://localhost/test'))
      const text = await response.text()

      expect(text).toBe('loaded')
    })

    it('should maintain order with mixed sync/async middleware', async () => {
      const router = new Router()
      const order: number[] = []

      const syncMiddleware: MiddlewareHandler = async (_req, next) => {
        order.push(1)
        return next()
      }

      const asyncMiddleware: MiddlewareHandler = async (_req, next) => {
        await new Promise(resolve => setTimeout(resolve, 5))
        order.push(2)
        return next()
      }

      router.use(syncMiddleware)
      router.use(asyncMiddleware)
      await router.get('/test', () => {
        order.push(3)
        return new Response('OK')
      })

      await router.handleRequest(new Request('http://localhost/test'))

      expect(order).toEqual([1, 2, 3])
    })
  })

  describe('Conditional Middleware', () => {
    it('should apply middleware based on path', async () => {
      const router = new Router()
      const apiCalled = mock(() => {})
      const webCalled = mock(() => {})

      const apiMiddleware: MiddlewareHandler = async (req, next) => {
        if (new URL(req.url).pathname.startsWith('/api')) {
          apiCalled()
        }
        return next()
      }

      const webMiddleware: MiddlewareHandler = async (req, next) => {
        if (!new URL(req.url).pathname.startsWith('/api')) {
          webCalled()
        }
        return next()
      }

      router.use(apiMiddleware)
      router.use(webMiddleware)
      await router.get('/api/users', () => new Response('API'))
      await router.get('/home', () => new Response('Web'))

      await router.handleRequest(new Request('http://localhost/api/users'))
      expect(apiCalled).toHaveBeenCalled()
      expect(webCalled).not.toHaveBeenCalled()

      apiCalled.mockClear()
      webCalled.mockClear()

      await router.handleRequest(new Request('http://localhost/home'))
      expect(apiCalled).not.toHaveBeenCalled()
      expect(webCalled).toHaveBeenCalled()
    })

    it('should apply middleware based on method', async () => {
      const router = new Router()
      const postOnlyCalled = mock(() => {})

      const postOnlyMiddleware: MiddlewareHandler = async (req, next) => {
        if (req.method === 'POST') {
          postOnlyCalled()
        }
        return next()
      }

      router.use(postOnlyMiddleware)
      await router.get('/test', () => new Response('GET'))
      await router.post('/test', () => new Response('POST'))

      await router.handleRequest(new Request('http://localhost/test'))
      expect(postOnlyCalled).not.toHaveBeenCalled()

      await router.handleRequest(new Request('http://localhost/test', { method: 'POST' }))
      expect(postOnlyCalled).toHaveBeenCalled()
    })
  })

  describe('Middleware Context', () => {
    it('should share context between middleware', async () => {
      const router = new Router()

      const setContextMiddleware: MiddlewareHandler = async (req, next) => {
        const r = req as unknown as Record<string, unknown>
        r.ctx = {
          requestId: '12345',
          startTime: Date.now(),
        }
        return next()
      }

      const useContextMiddleware: MiddlewareHandler = async (req, next) => {
        const r = req as unknown as Record<string, unknown>
        const ctx = r.ctx as Record<string, unknown>
        ctx.processed = true
        return next()
      }

      router.use(setContextMiddleware)
      router.use(useContextMiddleware)
      await router.get('/test', (req: EnhancedRequest) => {
        const r = req as unknown as Record<string, unknown>
        const ctx = r.ctx as Record<string, unknown>
        return new Response(JSON.stringify(ctx))
      })

      const response = await router.handleRequest(new Request('http://localhost/test'))
      const body = await response.json() as { requestId: string, processed: boolean }

      expect(body.requestId).toBe('12345')
      expect(body.processed).toBe(true)
    })
  })
})

describe('Middleware - Real World Scenarios', () => {
  it('should implement CORS middleware', async () => {
    const router = new Router()

    const corsMiddleware: MiddlewareHandler = async (req, next) => {
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        })
      }

      const response = await next()
      if (response) {
        const newResponse = new Response(response.body, response)
        newResponse.headers.set('Access-Control-Allow-Origin', '*')
        return newResponse
      }
      return response
    }

    router.use(corsMiddleware)
    await router.get('/api/data', () => new Response('Data'))
    await router.options('/api/data', () => new Response(null))

    const preflightResponse = await router.handleRequest(
      new Request('http://localhost/api/data', { method: 'OPTIONS' }),
    )
    expect(preflightResponse.status).toBe(204)
    expect(preflightResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')

    const response = await router.handleRequest(new Request('http://localhost/api/data'))
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should implement rate limiting middleware', async () => {
    const router = new Router()
    const requestCounts = new Map<string, number>()

    const rateLimitMiddleware: MiddlewareHandler = async (req, next) => {
      const ip = req.headers.get('X-Forwarded-For') || 'unknown'
      const count = requestCounts.get(ip) || 0

      if (count >= 3) {
        return new Response('Too Many Requests', { status: 429 })
      }

      requestCounts.set(ip, count + 1)
      return next()
    }

    router.use(rateLimitMiddleware)
    await router.get('/api/limited', () => new Response('OK'))

    for (let i = 0; i < 3; i++) {
      const response = await router.handleRequest(
        new Request('http://localhost/api/limited', {
          headers: { 'X-Forwarded-For': '192.168.1.1' },
        }),
      )
      expect(response.status).toBe(200)
    }

    const response = await router.handleRequest(
      new Request('http://localhost/api/limited', {
        headers: { 'X-Forwarded-For': '192.168.1.1' },
      }),
    )
    expect(response.status).toBe(429)
  })

  it('should implement logging middleware', async () => {
    const router = new Router()
    const logs: string[] = []

    const loggingMiddleware: MiddlewareHandler = async (req, next) => {
      const start = Date.now()
      const response = await next()
      const duration = Date.now() - start

      logs.push(`${req.method} ${new URL(req.url).pathname} - ${response?.status} (${duration}ms)`)

      return response
    }

    router.use(loggingMiddleware)
    await router.get('/test', () => new Response('OK'))

    await router.handleRequest(new Request('http://localhost/test'))

    expect(logs.length).toBe(1)
    expect(logs[0]).toMatch(/GET \/test - 200 \(\d+ms\)/)
  })

  it('should implement authentication middleware', async () => {
    const router = new Router()

    const authMiddleware: MiddlewareHandler = async (req, next) => {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '')

      if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (token !== 'valid-token') {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const enhanced = req as EnhancedRequest
      enhanced.user = { id: 1, name: 'Authenticated User' }
      return next()
    }

    router.use(authMiddleware)
    await router.get('/protected', (req: EnhancedRequest) => {
      return new Response(JSON.stringify({ user: req.user }))
    })

    const noTokenResponse = await router.handleRequest(new Request('http://localhost/protected'))
    expect(noTokenResponse.status).toBe(401)

    const invalidResponse = await router.handleRequest(
      new Request('http://localhost/protected', {
        headers: { Authorization: 'Bearer invalid' },
      }),
    )
    expect(invalidResponse.status).toBe(401)

    const validResponse = await router.handleRequest(
      new Request('http://localhost/protected', {
        headers: { Authorization: 'Bearer valid-token' },
      }),
    )
    expect(validResponse.status).toBe(200)
    const body = await validResponse.json() as { user: { name: string } }
    expect(body.user.name).toBe('Authenticated User')
  })

  it('should implement request timing middleware', async () => {
    const router = new Router()

    const timingMiddleware: MiddlewareHandler = async (_req, next) => {
      const start = performance.now()
      const response = await next()

      if (response) {
        const duration = performance.now() - start
        const newResponse = new Response(response.body, response)
        newResponse.headers.set('X-Response-Time', `${duration.toFixed(2)}ms`)
        return newResponse
      }
      return response
    }

    router.use(timingMiddleware)
    await router.get('/test', () => new Response('OK'))

    const response = await router.handleRequest(new Request('http://localhost/test'))

    expect(response.headers.get('X-Response-Time')).toMatch(/^\d+\.\d+ms$/)
  })

  it('should implement request ID middleware', async () => {
    const router = new Router()

    const requestIdMiddleware: MiddlewareHandler = async (req, next) => {
      const requestId = req.headers.get('X-Request-ID') || crypto.randomUUID()
      const r = req as unknown as Record<string, unknown>
      r.requestId = requestId

      const response = await next()
      if (response) {
        const newResponse = new Response(response.body, response)
        newResponse.headers.set('X-Request-ID', requestId)
        return newResponse
      }
      return response
    }

    router.use(requestIdMiddleware)
    await router.get('/test', () => new Response('OK'))

    const response1 = await router.handleRequest(new Request('http://localhost/test'))
    const id1 = response1.headers.get('X-Request-ID')
    expect(id1).toBeTruthy()
    expect(id1).toMatch(/^[0-9a-f-]{36}$/)

    const response2 = await router.handleRequest(
      new Request('http://localhost/test', {
        headers: { 'X-Request-ID': 'custom-id-123' },
      }),
    )
    expect(response2.headers.get('X-Request-ID')).toBe('custom-id-123')
  })
})
