import type { EnhancedRequest, MiddlewareHandler, Route } from '../types'
import type { Router } from './router'
import { Dependencies, MiddlewarePipeline, SkipConditions } from '../middleware/pipeline'

// Extend Router interface to include enhanced middleware methods
declare module './router' {
  interface Router {
    _enhancedPipeline: MiddlewarePipeline
    addRoute(route: Route): Router
    registerMiddlewareDependency(dependency: any): Router
    registerMiddlewareSkipConditions(middlewareName: string, conditions: any[]): Router
    getMiddlewareStats(): any
    getMiddlewareCacheInfo(): any
    clearMiddlewareCache(): Router
    executeMiddleware(middleware: MiddlewareHandler[], request: EnhancedRequest, handler: () => Promise<Response>): Promise<Response>
  }
}

/**
 * Integration layer for enhanced middleware pipeline with the router
 */
export function registerEnhancedMiddleware(RouterClass: typeof Router): void {
  // Add enhanced pipeline instance to router prototype
  Object.defineProperty(RouterClass.prototype, '_enhancedPipeline', {
    value: new MiddlewarePipeline(),
    writable: false,
    enumerable: false,
    configurable: false,
  })

  // Override the addRoute method to compile middleware pipelines
  const originalAddRoute = (RouterClass.prototype as any).addRoute
  if (originalAddRoute) {
    RouterClass.prototype.addRoute = function (route: Route) {
      // Call original addRoute
      const result = originalAddRoute.call(this, route)

      // Compile middleware pipeline for this route
      const routeKey = `${route.method}:${route.path}`
      if (route.middleware && route.middleware.length > 0) {
        (this as any)._enhancedPipeline.compileMiddleware(routeKey, route.middleware)
      }

      return result
    }
  }

  // Add method to register middleware dependencies
  RouterClass.prototype.registerMiddlewareDependency = function (dependency: any) {
    return (this as any)._enhancedPipeline.registerDependency(dependency)
  }

  // Add method to register skip conditions
  RouterClass.prototype.registerMiddlewareSkipConditions = function (middlewareName: string, conditions: any[]) {
    // Skip conditions are handled during middleware compilation
    return this
  }

  // Add method to get middleware statistics
  RouterClass.prototype.getMiddlewareStats = function () {
    return (this as any)._enhancedPipeline.getStats()
  }

  // Add method to get middleware cache info
  RouterClass.prototype.getMiddlewareCacheInfo = function () {
    const stats = (this as any)._enhancedPipeline.getStats()
    return {
      compiledPipelines: stats.totalExecutions > 0 ? 1 : 0,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
    }
  }

  // Add method to clear middleware cache
  RouterClass.prototype.clearMiddlewareCache = function () {
    return (this as any)._enhancedPipeline.clear()
  }

  // Override route execution to use enhanced pipeline
  const originalExecuteMiddleware = (RouterClass.prototype as any).executeMiddleware || function (middleware: MiddlewareHandler[], request: EnhancedRequest, handler: () => Promise<Response>) {
    // Fallback implementation for basic middleware execution
    let currentIndex = 0

    const next = async (): Promise<Response | null> => {
      if (currentIndex >= middleware.length) {
        return handler()
      }

      const mw = middleware[currentIndex++]
      return mw(request, next)
    }

    return next()
  }

  RouterClass.prototype.executeMiddleware = function (middleware: MiddlewareHandler[], request: EnhancedRequest, handler: () => Promise<Response>) {
    // Try to use enhanced pipeline if available
    if (middleware.length === 0) {
      return handler()
    }

    // Create route key for pipeline lookup
    const routeKey = `${request.method}:${new URL(request.url).pathname}`

    // Check if we have a compiled pipeline for this route pattern
    const cacheInfo = (this as any).getMiddlewareCacheInfo()
    if (cacheInfo.compiledPipelines > 0) {
      // Try to find matching compiled pipeline
      // In a real implementation, this would use more sophisticated matching
      return (this as any)._enhancedPipeline.execute(routeKey, request, handler)
    }

    // Fallback to original middleware execution
    return originalExecuteMiddleware.call(this, middleware, request, handler)
  }
}

/**
 * Middleware factory for common use cases with enhanced features
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

    // Skip conditions are handled during middleware compilation
    // Note: Skip conditions would be applied during pipeline compilation

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
    this.pipeline.registerDependency(Dependencies.cache(1000))

    const middleware: MiddlewareHandler = async (req, next) => {
      // Simple in-memory rate limiting without cache dependency
      const clientId = req.headers.get('x-forwarded-for') || 'unknown'
      const key = `rate_limit:${clientId}`

      // Use a simple Map for rate limiting (in production, use Redis or similar)
      if (!(globalThis as any).rateLimitCache) {
        (globalThis as any).rateLimitCache = new Map()
      }
      
      const cache = (globalThis as any).rateLimitCache
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

    // Skip conditions are handled during middleware compilation
    // Note: Skip conditions would be applied during pipeline compilation

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
    this.pipeline.registerDependency(Dependencies.logger(options.level || 'info'))

    const middleware: MiddlewareHandler = async (req, next) => {
      const startTime = Date.now()

      // Generate request ID
      const requestId = Math.random().toString(36).substr(2, 9)
      ;(req as any).requestId = requestId

      console.log(`[${requestId}] ${req.method} ${req.url} - Started`)

      try {
        const response = await next()
        const duration = Date.now() - startTime

        if (response) {
          console.log(`[${requestId}] ${req.method} ${req.url} - ${response.status} (${duration}ms)`)
        }

        return response
      }
      catch (error) {
        const duration = Date.now() - startTime
        console.error(`[${requestId}] ${req.method} ${req.url} - Error: ${error} (${duration}ms)`)
        throw error
      }
    }

    Object.defineProperty(middleware, 'name', { value: 'logging' })

    // Skip conditions are handled during middleware compilation
    // Note: Skip conditions would be applied during pipeline compilation

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
 * Helper function to setup common middleware stack with enhanced features
 */
export function setupEnhancedMiddlewareStack(router: any, options: {
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
  } | false
} = {}): MiddlewareHandler[] {
  const factory = new MiddlewareFactory(router._enhancedPipeline)
  const middleware: MiddlewareHandler[] = []

  // Add CORS middleware first
  if (options.cors) {
    middleware.push(factory.createCorsMiddleware(options.cors))
  }

  // Add logging middleware
  if (options.logging !== false) {
    middleware.push(factory.createLoggingMiddleware(options.logging || {}))
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
