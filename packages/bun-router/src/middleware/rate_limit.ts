import type { EnhancedRequest, Middleware, MiddlewareHandler, NextFunction } from '../types'
import { createRateLimiter } from 'ts-rate-limiter'
import { config } from '../config'

export interface RateLimitOptions {
  windowMs?: number
  maxRequests?: number
  standardHeaders?: boolean
  legacyHeaders?: boolean
  skipFailedRequests?: boolean
  keyGenerator?: (request: Request) => string | Promise<string>
  handler?: (request: Request, limit: { remaining: number, limit: number, resetTime: number }) => Response | Promise<Response>
  skip?: (request: Request) => boolean | Promise<boolean>
  storage?: any
  algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket'
  draftMode?: boolean
  redis?: {
    url?: string
    prefix?: string
  }
  tokenBucket?: {
    tokensPerInterval?: number
    interval?: number
    burst?: number
  }
}

// Factory function to create a callable middleware instance
function createRateLimitMiddleware(options: RateLimitOptions = {}): MiddlewareHandler {
  const instance = new RateLimit(options)
  const middlewareHandler = async (req: EnhancedRequest, next: NextFunction): Promise<Response> => {
    return instance.handle(req, next)
  }
  return middlewareHandler
}

export default class RateLimit implements Middleware {
  private limiter: any // Will be initialized in constructor
  private options: RateLimitOptions

  constructor(options: RateLimitOptions = {}) {
    // Get rate limit config from server config if available
    const rateLimitConfig = config.server?.rateLimit || {}
    const securityRateLimitConfig = config.server?.security?.rateLimit || {}

    // Merge options with configuration (options take precedence)
    this.options = {
      // Basic settings
      windowMs: options.windowMs || rateLimitConfig.timeWindow || securityRateLimitConfig.timeWindow || 60 * 1000,
      maxRequests: options.maxRequests || rateLimitConfig.max || securityRateLimitConfig.max || 100,

      // Headers
      standardHeaders: options.standardHeaders ?? true,
      legacyHeaders: options.legacyHeaders ?? false,

      // Behavior options
      skipFailedRequests: options.skipFailedRequests
        ?? (rateLimitConfig.advanced?.skipFailedRequests)
        ?? (securityRateLimitConfig.advanced?.skipFailedRequests)
        ?? false,
      draftMode: options.draftMode ?? false,

      // Custom handlers
      keyGenerator: options.keyGenerator,

      handler: options.handler || (
        rateLimitConfig.message
          ? (_req: Request, _limit: any) => new Response(rateLimitConfig.message, { status: 429 })
          : undefined
      ),

      skip: options.skip,

      // Algorithm - advanced config can override
      algorithm: options.algorithm || 'fixed-window',

      // Storage configuration from config
      storage: options.storage,
    }

    // Enable storage from config if available
    if (!this.options.storage && rateLimitConfig.stores?.type === 'redis' && rateLimitConfig.stores.redis) {
      this.options.storage = 'redis'

      // Set up redis config if available
      if (rateLimitConfig.stores.redis) {
        this.options.redis = {
          url: rateLimitConfig.stores.redis.url,
          prefix: rateLimitConfig.stores.redis.prefix || 'ratelimit:',
        }
      }
    }

    // Advanced options from config
    if (rateLimitConfig.advanced) {
      if (rateLimitConfig.advanced.tokensPerInterval && this.options.algorithm === 'token-bucket') {
        this.options.tokenBucket = {
          tokensPerInterval: rateLimitConfig.advanced.tokensPerInterval,
          interval: rateLimitConfig.advanced.interval || this.options.windowMs,
          burst: rateLimitConfig.advanced.burst,
        }
      }
    }

    // Initialize the limiter (async)
    this.initLimiter()
  }

  private async initLimiter() {
    // Create a copy of the options to avoid modifying the original
    const limiterOptions: any = { ...this.options }

    // Assign specific properties for the rate limiter
    limiterOptions.windowMs = this.options.windowMs as number
    limiterOptions.maxRequests = this.options.maxRequests as number
    limiterOptions.standardHeaders = this.options.standardHeaders
    limiterOptions.legacyHeaders = this.options.legacyHeaders
    limiterOptions.skipFailedRequests = this.options.skipFailedRequests
    limiterOptions.keyGenerator = this.options.keyGenerator
    limiterOptions.skip = this.options.skip
    limiterOptions.algorithm = this.options.algorithm
    limiterOptions.draftMode = this.options.draftMode

    // Set up custom handler
    limiterOptions.handler = this.options.handler
      ? async (req: Request, result: any) => {
        return this.options.handler?.(req, {
          remaining: result.remaining,
          limit: result.limit,
          resetTime: result.resetTime,
        }) || this.defaultHandler(req, result)
      }
      : undefined

    // Initialize the rate limiter (suppress noisy logs from ts-rate-limiter)
    const originalConsoleLog = console.log
    const originalConsoleWarn = console.warn
    console.log = () => {}
    console.warn = () => {}
    try {
      this.limiter = await createRateLimiter(limiterOptions)
    } finally {
      console.log = originalConsoleLog
      console.warn = originalConsoleWarn
    }
  }

  private defaultHandler(req: Request, result: any): Response {
    const headers: Record<string, string> = {}

    if (this.options.standardHeaders) {
      headers['RateLimit-Limit'] = String(result.limit)
      headers['RateLimit-Remaining'] = String(Math.max(0, result.limit - result.current))
      headers['RateLimit-Reset'] = String(Math.ceil(result.resetTime / 1000))
    }

    if (this.options.legacyHeaders) {
      headers['X-RateLimit-Limit'] = String(result.limit)
      headers['X-RateLimit-Remaining'] = String(Math.max(0, result.limit - result.current))
      headers['X-RateLimit-Reset'] = String(Math.ceil(result.resetTime / 1000))
      headers['Retry-After'] = String(Math.ceil(result.remaining / 1000))
    }

    const message = config.server?.rateLimit?.message || 'Too Many Requests'

    return new Response(message, {
      status: 429,
      headers,
    })
  }

  // The middleware interface implementation
  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    // If rate limiting is disabled in config, skip it
    if (config.server?.rateLimit?.enabled === false) {
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }

    // If limiter isn't initialized yet, wait a bit and try again
    if (!this.limiter) {
      await new Promise(resolve => setTimeout(resolve, 50))
      if (!this.limiter) {
        // If still not initialized, just proceed
        const response = await next()
        return response || new Response('Not Found', { status: 404 })
      }
    }

    try {
      // Check if request exceeds rate limit
      const result = await this.limiter.check(req)

      if (!result.allowed) {
        return this.options.handler
          ? await this.options.handler(req, {
              remaining: result.remaining,
              limit: result.limit,
              resetTime: result.resetTime,
            })
          : this.defaultHandler(req, result)
      }

      // If allowed, proceed to next middleware
      const response = await next()

      if (!response) {
        return new Response('Not Found', { status: 404 })
      }

      // Add rate limit headers to response
      const headers = new Headers(response.headers)

      if (this.options.standardHeaders) {
        headers.set('RateLimit-Limit', String(result.limit))
        headers.set('RateLimit-Remaining', String(Math.max(0, result.limit - result.current)))
        headers.set('RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)))
      }

      if (this.options.legacyHeaders) {
        headers.set('X-RateLimit-Limit', String(result.limit))
        headers.set('X-RateLimit-Remaining', String(Math.max(0, result.limit - result.current)))
        headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)))
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    catch (error) {
      console.error('[RateLimit] Error during rate limiting:', error)
      // Proceed to next middleware in case of error
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }
  }
}

// Export a factory function to create middleware handlers
export function rateLimit(options: RateLimitOptions = {}): MiddlewareHandler {
  return createRateLimitMiddleware(options)
}
