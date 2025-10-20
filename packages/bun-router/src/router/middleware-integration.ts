import type { EnhancedRequest, MiddlewareHandler, Route } from '../types'
import type { Router } from './router'

// Type placeholders for middleware pipeline
export type SkipConditionFn = (req: EnhancedRequest) => boolean
export type SkipConditionsList = SkipConditionFn[]

/**
 * Skip condition helpers
 */
export const SkipConditions = {
  skipForPaths: (paths: string[]): SkipConditionFn => (req: EnhancedRequest) => {
    const url = new URL(req.url)
    return paths.some(path => url.pathname.startsWith(path))
  },
  skipForMethods: (methods: string[]): SkipConditionFn => (req: EnhancedRequest) => {
    return methods.includes(req.method)
  },
}

/**
 * Dependency helpers
 */
export const Dependencies = {
  cache: (config: { type: string, ttl: number }): { type: string, config: { type: string, ttl: number } } => ({
    type: 'cache',
    config,
  }),
  logger: (level: string): { type: string, config: { level: string } } => ({
    type: 'logger',
    config: { level },
  }),
}

class MiddlewarePipeline {
  registerDependency(_key: string, _dependency: any): this { return this }
  registerSkipConditions(_middleware: MiddlewareHandler, _conditions: SkipConditionsList): void {}
  getStats(): any { return {} }
  getCacheInfo(): any { return {} }
  clearCache(): this { return this }
  compilePipeline(_key: string, _middleware: MiddlewareHandler[], _options?: any): void {}
  execute(_key: string, _req: EnhancedRequest, _handler: () => Promise<Response>): Promise<Response> { return _handler() }
}

/**
 * Integration layer for middleware pipeline with the router
 */
export function registerMiddlewarePipeline(RouterClass: typeof Router): void {
  // Add pipeline instance to router prototype
  Object.defineProperty(RouterClass.prototype, '_middlewarePipeline', {
    value: new MiddlewarePipeline(),
    writable: false,
    enumerable: false,
    configurable: false,
  })

  // Override the addRoute method to compile middleware pipelines
  const originalAddRoute = RouterClass.prototype.addRoute
  RouterClass.prototype.addRoute = function (route: Route) {
    // Call original addRoute
    const result = originalAddRoute.call(this, route)

    // Compile middleware pipeline for this route
    const routeKey = `${route.method}:${route.path}`
    if (route.middleware && route.middleware.length > 0 && this._middlewarePipeline) {
      this._middlewarePipeline.compilePipeline(routeKey, route.middleware, {
        allowShortCircuit: true,
        enableConditionalExecution: true,
        resolveDependencies: true,
      })
    }

    return result
  }
}

/**
 * Middleware factory for common use cases
 */
export class MiddlewareFactory {
  private pipeline: MiddlewarePipeline

  constructor(pipeline: MiddlewarePipeline) {
    this.pipeline = pipeline
  }

  /**
   * Create authentication middleware with conditional execution
   */
  createAuthMiddleware(options: {
    skipPaths?: string[]
    skipMethods?: string[]
    requireRoles?: string[]
    jwtSecret?: string
  } = {}): MiddlewareHandler {
    const middleware: MiddlewareHandler = async (req, next) => {
      // Skip authentication for public paths
      if (options.skipPaths) {
        const url = new URL(req.url)
        if (options.skipPaths.some(path => url.pathname.startsWith(path))) {
          return next()
        }
      }

      // Extract JWT token
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401 })
      }

      const _token = authHeader.slice(7)

      // In a real implementation, this would verify the JWT
      // For demo purposes, we'll simulate user extraction
      try {
        // Simulate JWT verification
        const user = {
          id: 1,
          name: 'John Doe',
          roles: ['user'],
          // In real implementation: jwt.verify(token, options.jwtSecret)
        }

        // Check required roles
        if (options.requireRoles && options.requireRoles.length > 0) {
          const hasRequiredRole = options.requireRoles.some(role =>
            user.roles.includes(role),
          )
          if (!hasRequiredRole) {
            return new Response('Forbidden', { status: 403 })
          }
        }

        req.user = user
        return next()
      }
      catch (error) {
        console.error(error)
        return new Response('Invalid token', { status: 401 })
      }
    }

    Object.defineProperty(middleware, 'name', { value: 'auth' })

    // Register skip conditions
    const skipConditions = []
    if (options.skipPaths) {
      skipConditions.push(SkipConditions.skipForPaths(options.skipPaths))
    }
    if (options.skipMethods) {
      skipConditions.push(SkipConditions.skipForMethods(options.skipMethods))
    }

    if (skipConditions.length > 0) {
      this.pipeline.registerSkipConditions(middleware, skipConditions)
    }

    return middleware
  }

  /**
   * Create rate limiting middleware with dependency injection
   */
  createRateLimitMiddleware(options: {
    maxRequests: number
    windowMs: number
    skipPaths?: string[]
  }): MiddlewareHandler {
    // Register cache dependency for rate limiting
    this.pipeline.registerDependency('cache', Dependencies.cache({
      type: 'memory',
      ttl: Math.ceil(options.windowMs / 1000),
    }))

    const middleware: MiddlewareHandler = async (req, next) => {
      const cache = req.context?.cache
      if (!cache) {
        // Fallback if cache not available
        return next()
      }

      const clientId = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
      const key = `rate_limit:${clientId}`

      const current = cache.get(key) || { count: 0, resetTime: Date.now() + options.windowMs }

      if (Date.now() > current.resetTime) {
        current.count = 0
        current.resetTime = Date.now() + options.windowMs
      }

      if (current.count >= options.maxRequests) {
        return new Response('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((current.resetTime - Date.now()) / 1000).toString(),
          },
        })
      }

      current.count++
      cache.set(key, current)

      return next()
    }

    Object.defineProperty(middleware, 'name', { value: 'rateLimit' })

    // Register skip conditions
    if (options.skipPaths) {
      this.pipeline.registerSkipConditions(middleware, [
        SkipConditions.skipForPaths(options.skipPaths),
      ])
    }

    return middleware
  }

  /**
   * Create logging middleware with dependency injection
   */
  createLoggingMiddleware(options: {
    level?: string
    skipPaths?: string[]
    includeBody?: boolean
  } = {}): MiddlewareHandler {
    // Register logger dependency
    this.pipeline.registerDependency('logger', Dependencies.logger(options.level || 'info'))

    const middleware: MiddlewareHandler = async (req, next) => {
      const logger = req.context?.logger
      const startTime = Date.now()

      // Generate request ID
      const requestId = Math.random().toString(36).substr(2, 9)
      req.requestId = requestId

      if (logger) {
        logger.log(`[${requestId}] ${req.method} ${req.url} - Started`)
      }

      try {
        const response = await next()
        const duration = Date.now() - startTime

        if (logger && response) {
          logger.log(`[${requestId}] ${req.method} ${req.url} - ${response.status} (${duration}ms)`)
        }

        return response
      }
      catch (error) {
        const duration = Date.now() - startTime
        if (logger) {
          logger.error(`[${requestId}] ${req.method} ${req.url} - Error: ${error} (${duration}ms)`)
        }
        throw error
      }
    }

    Object.defineProperty(middleware, 'name', { value: 'logging' })

    // Register skip conditions
    if (options.skipPaths) {
      this.pipeline.registerSkipConditions(middleware, [
        SkipConditions.skipForPaths(options.skipPaths),
      ])
    }

    return middleware
  }

  /**
   * Create CORS middleware with conditional execution
   */
  createCorsMiddleware(options: {
    origin?: string | string[]
    methods?: string[]
    allowedHeaders?: string[]
    credentials?: boolean
  } = {}): MiddlewareHandler {
    const middleware: MiddlewareHandler = async (req, next) => {
      const origin = req.headers.get('Origin')
      const method = req.method

      // Handle preflight requests
      if (method === 'OPTIONS') {
        const headers = new Headers()

        if (options.origin) {
          if (Array.isArray(options.origin)) {
            if (origin && options.origin.includes(origin)) {
              headers.set('Access-Control-Allow-Origin', origin)
            }
          }
          else if (options.origin === '*' || options.origin === origin) {
            headers.set('Access-Control-Allow-Origin', options.origin)
          }
        }

        if (options.methods) {
          headers.set('Access-Control-Allow-Methods', options.methods.join(', '))
        }

        if (options.allowedHeaders) {
          headers.set('Access-Control-Allow-Headers', options.allowedHeaders.join(', '))
        }

        if (options.credentials) {
          headers.set('Access-Control-Allow-Credentials', 'true')
        }

        return new Response(null, { status: 204, headers })
      }

      // Handle actual requests
      const response = await next()
      if (response && options.origin && origin) {
        const newHeaders = new Headers(response.headers)

        if (Array.isArray(options.origin)) {
          if (options.origin.includes(origin)) {
            newHeaders.set('Access-Control-Allow-Origin', origin)
          }
        }
        else if (options.origin === '*' || options.origin === origin) {
          newHeaders.set('Access-Control-Allow-Origin', options.origin)
        }

        if (options.credentials) {
          newHeaders.set('Access-Control-Allow-Credentials', 'true')
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        })
      }

      return response
    }

    Object.defineProperty(middleware, 'name', { value: 'cors' })
    return middleware
  }
}

/**
 * Helper function to setup common middleware stack
 */
export function setupMiddlewareStack(router: any, options: {
  auth?: {
    jwtSecret: string
    skipPaths?: string[]
    requireRoles?: string[]
  }
  rateLimit?: {
    maxRequests: number
    windowMs: number
    skipPaths?: string[]
  }
  cors?: {
    origin?: string | string[]
    methods?: string[]
    allowedHeaders?: string[]
    credentials?: boolean
  }
  logging?: {
    level?: string
    skipPaths?: string[]
  }
} = {}): MiddlewareHandler[] {
  const factory = new MiddlewareFactory(router._middlewarePipeline)
  const middleware: MiddlewareHandler[] = []

  // Add CORS middleware first
  if (options.cors) {
    middleware.push(factory.createCorsMiddleware(options.cors))
  }

  // Add logging middleware
  if (options.logging !== undefined) {
    middleware.push(factory.createLoggingMiddleware(options.logging))
  }

  // Add rate limiting middleware
  if (options.rateLimit) {
    middleware.push(factory.createRateLimitMiddleware(options.rateLimit))
  }

  // Add authentication middleware
  if (options.auth) {
    middleware.push(factory.createAuthMiddleware(options.auth))
  }

  return middleware
}
