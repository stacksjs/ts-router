import type { EnhancedRequest, MiddlewareHandler, NextFunction } from '../types'
import type { MiddlewareTestContext } from './types'
import { mock, spyOn } from 'bun:test'
import { createMockRequest } from './test-request'

/**
 * Middleware testing utilities
 */
export class MiddlewareTester {
  private middleware: MiddlewareHandler
  private context: MiddlewareTestContext

  constructor(middleware: MiddlewareHandler) {
    this.middleware = middleware
    this.context = this.createContext()
  }

  private createContext(): MiddlewareTestContext {
    const request = createMockRequest()
    const next = mock(() => Promise.resolve(new Response('Next called', { status: 200 })))

    return {
      request,
      next,
    }
  }

  /**
   * Set up the test request
   */
  withRequest(request: EnhancedRequest): MiddlewareTester {
    this.context.request = request
    return this
  }

  /**
   * Set up a custom next function
   */
  withNext(nextFn: NextFunction): MiddlewareTester {
    this.context.next = mock(nextFn as () => Promise<Response | null>)
    return this
  }

  /**
   * Set up an error context
   */
  withError(error: Error): MiddlewareTester {
    this.context.error = error
    return this
  }

  /**
   * Execute the middleware and return the result
   */
  async execute(): Promise<Response | null> {
    try {
      return await this.middleware(this.context.request, this.context.next)
    }
    catch (error) {
      this.context.error = error as Error
      throw error
    }
  }

  /**
   * Assert that next was called
   */
  expectNextCalled(times: number = 1): MiddlewareTester {
    if (this.context.next.mock.calls.length !== times) {
      throw new Error(`Expected next to be called ${times} times, but was called ${this.context.next.mock.calls.length} times`)
    }
    return this
  }

  /**
   * Assert that next was not called
   */
  expectNextNotCalled(): MiddlewareTester {
    if (this.context.next.mock.calls.length > 0) {
      throw new Error(`Expected next not to be called, but was called ${this.context.next.mock.calls.length} times`)
    }
    return this
  }

  /**
   * Assert that middleware threw an error
   */
  expectError(errorMessage?: string): MiddlewareTester {
    if (!this.context.error) {
      throw new Error('Expected middleware to throw an error, but no error was thrown')
    }
    if (errorMessage && this.context.error.message !== errorMessage) {
      throw new Error(`Expected error message "${errorMessage}", but got "${this.context.error.message}"`)
    }
    return this
  }

  /**
   * Get the test context
   */
  getContext(): MiddlewareTestContext {
    return this.context
  }

  /**
   * Reset the middleware tester
   */
  reset(): MiddlewareTester {
    this.context = this.createContext()
    return this
  }
}

/**
 * Create a middleware tester
 */
export function testMiddleware(middleware: MiddlewareHandler): MiddlewareTester {
  return new MiddlewareTester(middleware)
}

/**
 * Mock middleware factory
 */
export const mockMiddleware = {
  /**
   * Create a middleware that always calls next
   */
  passthrough: (): MiddlewareHandler => mock(async (req, next) => await next()),

  /**
   * Create a middleware that returns a response without calling next
   */
  response: (status: number = 200, body?: any): MiddlewareHandler =>
    mock(async () => new Response(body ? JSON.stringify(body) : null, { status })),

  /**
   * Create a middleware that throws an error
   */
  error: (message: string = 'Middleware error'): MiddlewareHandler =>
    mock(async () => { throw new Error(message) }),

  /**
   * Create a middleware that modifies the request
   */
  modifyRequest: (modifier: (req: EnhancedRequest) => void): MiddlewareHandler =>
    mock(async (req, next) => {
      modifier(req)
      return await next()
    }),

  /**
   * Create a middleware that adds context
   */
  addContext: (key: string, value: any): MiddlewareHandler =>
    mock(async (req, next) => {
      req.context = req.context || {}
      req.context[key] = value
      return await next()
    }),

  /**
   * Create an authentication middleware mock
   */
  auth: (user?: any): MiddlewareHandler =>
    mock(async (req, next) => {
      if (user) {
        req.user = user
        return await next()
      }
      else {
        return new Response('Unauthorized', { status: 401 })
      }
    }),

  /**
   * Create a rate limiting middleware mock
   */
  rateLimit: (shouldLimit: boolean = false): MiddlewareHandler =>
    mock(async (req, next) => {
      if (shouldLimit) {
        return new Response('Too Many Requests', { status: 429 })
      }
      return await next()
    }),

  /**
   * Create a CORS middleware mock
   */
  cors: (origin: string = '*'): MiddlewareHandler =>
    mock(async (req, next) => {
      const response = await next()
      if (response) {
        response.headers.set('Access-Control-Allow-Origin', origin)
      }
      return response
    }),
}

/**
 * Middleware chain tester
 */
export class MiddlewareChainTester {
  private middlewares: MiddlewareHandler[]
  private request: EnhancedRequest
  private finalHandler: () => Promise<Response>

  constructor(middlewares: MiddlewareHandler[]) {
    this.middlewares = middlewares
    this.request = createMockRequest()
    this.finalHandler = mock(async () => new Response('Final handler', { status: 200 }))
  }

  /**
   * Set the request for the chain
   */
  withRequest(request: EnhancedRequest): MiddlewareChainTester {
    this.request = request
    return this
  }

  /**
   * Set the final handler
   */
  withFinalHandler(handler: () => Promise<Response>): MiddlewareChainTester {
    this.finalHandler = mock(handler)
    return this
  }

  /**
   * Execute the middleware chain
   */
  async execute(): Promise<Response | null> {
    let index = 0

    const next = async (): Promise<Response | null> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++]
        return await middleware(this.request, next)
      }
      else {
        return await this.finalHandler()
      }
    }

    return await next()
  }

  /**
   * Get execution order of middlewares
   */
  getExecutionOrder(): number[] {
    return this.middlewares.map((_, index) => index)
  }
}

/**
 * Create a middleware chain tester
 */
export function testMiddlewareChain(middlewares: MiddlewareHandler[]): MiddlewareChainTester {
  return new MiddlewareChainTester(middlewares)
}

/**
 * Spy on middleware execution
 */
export function spyOnMiddleware(middleware: MiddlewareHandler): ReturnType<typeof spyOn> {
  return spyOn(middleware as any, 'call')
}

/**
 * Create a middleware spy that tracks calls
 */
export function createMiddlewareSpy(): {
  middleware: MiddlewareHandler
  spy: ReturnType<typeof mock>
} {
  const spy = mock(async (req: EnhancedRequest, next: NextFunction) => {
    return await next()
  })

  return {
    middleware: spy,
    spy,
  }
}

/**
 * Test middleware performance
 */
export async function benchmarkMiddleware(
  middleware: MiddlewareHandler,
  iterations: number = 1000,
): Promise<{
    averageTime: number
    minTime: number
    maxTime: number
    totalTime: number
  }> {
  const times: number[] = []
  const request = createMockRequest()
  const next = mock(async () => new Response('OK'))

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await middleware(request, next)
    const end = performance.now()
    times.push(end - start)
  }

  const totalTime = times.reduce((sum, time) => sum + time, 0)
  const averageTime = totalTime / iterations
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)

  return {
    averageTime,
    minTime,
    maxTime,
    totalTime,
  }
}
