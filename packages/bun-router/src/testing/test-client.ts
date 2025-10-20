import type { Router } from '../router/router'
import type { EnhancedRequest } from '../types'
import type { TestResponseWrapper } from './test-response'
import type { TestClientConfig, TestRequestOptions } from './types'
import { TestRequestBuilder } from './test-request'
import { createTestResponse } from './test-response'

/**
 * Test client for making HTTP requests to router instances
 */
export class TestClient {
  private router: Router
  private config: TestClientConfig
  private defaultHeaders: Record<string, string>

  constructor(router: Router, config: TestClientConfig = {}) {
    this.router = router
    this.config = {
      baseUrl: 'http://localhost:3000',
      timeout: 5000,
      followRedirects: true,
      validateStatus: (status: number) => status >= 200 && status < 300,
      ...config,
    }
    this.defaultHeaders = config.defaultHeaders || {}
  }

  /**
   * Make a GET request
   */
  async get(path: string, options: TestRequestOptions = {}): Promise<TestResponseWrapper> {
    return this.request('GET', path, options)
  }

  /**
   * Make a POST request
   */
  async post(path: string, options: TestRequestOptions = {}): Promise<TestResponseWrapper> {
    return this.request('POST', path, options)
  }

  /**
   * Make a PUT request
   */
  async put(path: string, options: TestRequestOptions = {}): Promise<TestResponseWrapper> {
    return this.request('PUT', path, options)
  }

  /**
   * Make a PATCH request
   */
  async patch(path: string, options: TestRequestOptions = {}): Promise<TestResponseWrapper> {
    return this.request('PATCH', path, options)
  }

  /**
   * Make a DELETE request
   */
  async delete(path: string, options: TestRequestOptions = {}): Promise<TestResponseWrapper> {
    return this.request('DELETE', path, options)
  }

  /**
   * Make an OPTIONS request
   */
  async options(path: string, options: TestRequestOptions = {}): Promise<TestResponseWrapper> {
    return this.request('OPTIONS', path, options)
  }

  /**
   * Make a HEAD request
   */
  async head(path: string, options: TestRequestOptions = {}): Promise<TestResponseWrapper> {
    return this.request('HEAD', path, options)
  }

  /**
   * Make a request with custom method
   */
  async request(method: string, path: string, options: TestRequestOptions = {}): Promise<TestResponseWrapper> {
    // Merge default headers
    const headers = { ...this.defaultHeaders, ...options.headers }
    const requestOptions = { ...options, headers }

    // Build the test request
    const request = new TestRequestBuilder(method, path, requestOptions).build()

    try {
      // Handle the request through the router
      const response = await this.handleRequest(request)
      return await createTestResponse(response)
    }
    catch (error) {
      throw new Error(`Test request failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle request through the router
   */
  private async handleRequest(request: EnhancedRequest): Promise<Response> {
    // Find matching route
    const url = new URL(request.url)
    const matchResult = this.findMatchingRoute(request.method, url.pathname)

    if (!matchResult) {
      return new Response('Not Found', { status: 404 })
    }

    const { route, params } = matchResult

    // Update request with route params
    request.params = { ...request.params, ...params }

    try {
      // Execute middleware chain
      const response = await this.executeMiddlewareChain(request, route)
      return response || new Response('No response', { status: 500 })
    }
    catch (error) {
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  }

  /**
   * Find matching route for the request
   */
  private findMatchingRoute(method: string, pathname: string): { route: any, params: Record<string, string> } | null {
    for (const route of this.router.routes) {
      if (route.method.toLowerCase() !== method.toLowerCase()) {
        continue
      }

      // Simple pattern matching for testing
      const params = this.matchPath(route.path, pathname)
      if (params !== null) {
        return { route, params }
      }
    }
    return null
  }

  /**
   * Simple path matching with parameter extraction
   */
  private matchPath(pattern: string, pathname: string): Record<string, string> | null {
    const patternParts = pattern.split('/')
    const pathParts = pathname.split('/')

    if (patternParts.length !== pathParts.length) {
      return null
    }

    const params: Record<string, string> = {}

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]
      const pathPart = pathParts[i]

      if (patternPart.startsWith(':')) {
        // Parameter
        const paramName = patternPart.slice(1)
        params[paramName] = pathPart
      }
      else if (patternPart !== pathPart) {
        // Literal mismatch
        return null
      }
    }

    return params
  }

  /**
   * Execute middleware chain and route handler
   */
  private async executeMiddlewareChain(request: EnhancedRequest, route: any): Promise<Response> {
    const middlewares = [...this.router.globalMiddleware, ...route.middleware]
    let index = 0

    const next = async (): Promise<Response | null> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++]
        return await middleware(request, next)
      }
      else {
        // Execute route handler
        return await this.executeHandler(route.handler, request)
      }
    }

    const result = await next()
    return result || new Response('No response', { status: 500 })
  }

  /**
   * Execute route handler
   */
  private async executeHandler(handler: any, request: EnhancedRequest): Promise<Response> {
    if (typeof handler === 'function') {
      return await handler(request)
    }
    else if (typeof handler === 'string') {
      // Handle string-based handlers (would normally load from file)
      throw new TypeError(`String handlers not supported in test environment: ${handler}`)
    }
    else if (typeof handler === 'object' && handler.handle) {
      // Handle class-based handlers
      const instance = new (handler as any)()
      return await instance.handle(request)
    }

    throw new Error('Invalid handler type')
  }

  /**
   * Set default headers for all requests
   */
  setDefaultHeaders(headers: Record<string, string>): TestClient {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers }
    return this
  }

  /**
   * Set authorization header for all requests
   */
  auth(token: string, type: 'Bearer' | 'Basic' = 'Bearer'): TestClient {
    this.defaultHeaders.Authorization = `${type} ${token}`
    return this
  }

  /**
   * Set user agent for all requests
   */
  userAgent(userAgent: string): TestClient {
    this.defaultHeaders['User-Agent'] = userAgent
    return this
  }

  /**
   * Create a new test client with additional configuration
   */
  withConfig(config: Partial<TestClientConfig>): TestClient {
    return new TestClient(this.router, { ...this.config, ...config })
  }

  /**
   * Create a new test client with additional headers
   */
  withHeaders(headers: Record<string, string>): TestClient {
    return new TestClient(this.router, {
      ...this.config,
      defaultHeaders: { ...this.defaultHeaders, ...headers },
    })
  }

  /**
   * Get the router instance
   */
  getRouter(): Router {
    return this.router
  }

  /**
   * Get client configuration
   */
  getConfig(): TestClientConfig {
    return { ...this.config }
  }
}

/**
 * Create a test client for a router
 */
export function createTestClient(router: Router, config?: TestClientConfig): TestClient {
  return new TestClient(router, config)
}

/**
 * Test client factory with fluent API
 */
export const testClient = {
  /**
   * Create a test client for a router
   */
  for: (router: Router, config?: TestClientConfig): TestClient => createTestClient(router, config),

  /**
   * Create a test client with specific configuration
   */
  withConfig: (config: TestClientConfig): (router: Router) => TestClient => (router: Router): TestClient => createTestClient(router, config),

  /**
   * Create a test client with authentication
   */
  withAuth: (token: string, type: 'Bearer' | 'Basic' = 'Bearer'): (router: Router) => TestClient => (router: Router): TestClient =>
    createTestClient(router).auth(token, type),

  /**
   * Create a test client with custom headers
   */
  withHeaders: (headers: Record<string, string>): (router: Router) => TestClient => (router: Router): TestClient =>
    createTestClient(router).withHeaders(headers),
}
