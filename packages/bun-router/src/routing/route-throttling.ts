import type { EnhancedRequest, MiddlewareHandler, NextFunction, ThrottlePattern } from '../types'
import { LRUCache } from '../cache/lru-cache'

/**
 * Throttle configuration for rate limiting
 */
export interface ThrottleConfig {
  maxAttempts: number // Maximum attempts allowed
  windowMs: number // Time window in milliseconds
  keyGenerator?: (req: EnhancedRequest) => string // Custom key generator
  skipIf?: (req: EnhancedRequest) => boolean // Skip rate limiting condition
  onLimitReached?: (req: EnhancedRequest, info: RateLimitInfo) => Response // Custom response when limit reached
  headers?: boolean // Include rate limit headers in response
  maxRequests?: number
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  totalHits: number
  totalHits24h?: number
  resetTime: Date
  remaining: number
  limit: number
  windowMs: number
}

/**
 * Rate limit entry stored in cache
 */
interface RateLimitEntry {
  count: number
  resetTime: number
  firstHit: number
}

/**
 * Rate limiter implementation
 */
export class RateLimiter {
  private cache: LRUCache<RateLimitEntry>
  private config: ThrottleConfig

  constructor(config: ThrottleConfig, cacheSize: number = 10000) {
    this.config = config
    this.cache = new LRUCache<RateLimitEntry>({
      maxSize: cacheSize,
      ttl: config.windowMs * 2, // Keep entries longer than window for cleanup
    })
  }

  /**
   * Check if request should be rate limited
   */
  async checkLimit(req: EnhancedRequest): Promise<{ allowed: boolean, info: RateLimitInfo }> {
    // Skip if condition is met
    if (this.config.skipIf && this.config.skipIf(req)) {
      return {
        allowed: true,
        info: {
          totalHits: 0,
          resetTime: new Date(Date.now() + this.config.windowMs),
          remaining: this.config.maxAttempts,
          limit: this.config.maxAttempts,
          windowMs: this.config.windowMs,
        },
      }
    }

    const key = this.generateKey(req)
    const now = Date.now()

    let entry = this.cache.get(key)

    // Clean up expired entry or create new one
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
        firstHit: now,
      }
    }
    else {
      entry.count++
    }

    // Update cache
    this.cache.set(key, entry)

    const info: RateLimitInfo = {
      totalHits: entry.count,
      resetTime: new Date(entry.resetTime),
      remaining: Math.max(0, this.config.maxAttempts - entry.count),
      limit: this.config.maxAttempts,
      windowMs: this.config.windowMs,
    }

    const allowed = entry.count <= this.config.maxAttempts

    return { allowed, info }
  }

  /**
   * Generate cache key for rate limiting
   */
  private generateKey(req: EnhancedRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req)
    }

    // Default key generation: IP + User ID (if available)
    const ip = this.getClientIP(req)
    const userId = req.user?.id

    if (userId) {
      return `user:${userId}`
    }

    return `ip:${ip}`
  }

  /**
   * Extract client IP from request
   */
  private getClientIP(req: EnhancedRequest): string {
    // Check common headers for real IP
    const forwardedFor = req.headers.get('x-forwarded-for')
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim()
    }

    const realIP = req.headers.get('x-real-ip')
    if (realIP) {
      return realIP
    }

    const cfConnectingIP = req.headers.get('cf-connecting-ip')
    if (cfConnectingIP) {
      return cfConnectingIP
    }

    // Fallback to a default IP if none found
    return 'unknown'
  }

  /**
   * Get current statistics
   */
  getStats(): ReturnType<LRUCache<RateLimitEntry>['getStats']> & { config: { maxAttempts: number, windowMs: number } } {
    return {
      ...this.cache.getStats(),
      config: {
        maxAttempts: this.config.maxAttempts,
        windowMs: this.config.windowMs,
      },
    }
  }
}

/**
 * Global rate limiters registry
 */
export class RateLimitRegistry {
  private limiters = new Map<string, RateLimiter>()

  /**
   * Register a rate limiter
   */
  register(name: string, config: ThrottleConfig): RateLimiter {
    const limiter = new RateLimiter(config)
    this.limiters.set(name, limiter)
    return limiter
  }

  /**
   * Get rate limiter by name
   */
  get(name: string): RateLimiter | undefined {
    return this.limiters.get(name)
  }

  /**
   * Create or get rate limiter
   */
  getOrCreate(name: string, config: ThrottleConfig): RateLimiter {
    const existing = this.limiters.get(name)
    if (existing) {
      return existing
    }
    return this.register(name, config)
  }
}

/**
 * Global rate limit registry instance
 */
export const rateLimitRegistry: RateLimitRegistry = new RateLimitRegistry()

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: ThrottleConfig, name?: string): MiddlewareHandler {
  const limiter = name
    ? rateLimitRegistry.getOrCreate(name, config)
    : new RateLimiter(config)

  return async (req: EnhancedRequest, next: NextFunction): Promise<Response | null> => {
    const { allowed, info } = await limiter.checkLimit(req)

    if (!allowed) {
      // Use custom response if provided
      if (config.onLimitReached) {
        return config.onLimitReached(req, info)
      }

      // Default rate limit response
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil((info.resetTime.getTime() - Date.now()) / 1000).toString(),
      })

      if (config.headers !== false) {
        headers.set('X-RateLimit-Limit', info.limit.toString())
        headers.set('X-RateLimit-Remaining', info.remaining.toString())
        headers.set('X-RateLimit-Reset', Math.ceil(info.resetTime.getTime() / 1000).toString())
      }

      return new Response(
        JSON.stringify({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil((info.resetTime.getTime() - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((info.resetTime.getTime() - Date.now()) / 1000),
        }),
        {
          status: 429,
          headers,
        },
      )
    }

    // Continue to next middleware/handler
    const response = await next()

    // Add rate limit headers to successful responses
    if (response && config.headers !== false && response.status < 400) {
      const headers = new Headers(response.headers)
      headers.set('X-RateLimit-Limit', info.limit.toString())
      headers.set('X-RateLimit-Remaining', info.remaining.toString())
      headers.set('X-RateLimit-Reset', Math.ceil(info.resetTime.getTime() / 1000).toString())

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }

    return response
  }
}

/**
 * Parse throttle string (Laravel-style) with enhanced time unit support
 * Examples: '60,1' -> 60 requests per 1 minute
 *          '100,30s' -> 100 requests per 30 seconds
 *          '1000,1h' -> 1000 requests per 1 hour
 *          '60' -> 60 requests per 1 minute (default)
 */
export function parseThrottleString(throttleStr: ThrottlePattern): ThrottleConfig {
  const parts = throttleStr.split(',')
  const maxAttempts = Number.parseInt(parts[0], 10)

  if (Number.isNaN(maxAttempts) || maxAttempts <= 0) {
    throw new Error(`Invalid throttle max attempts: ${parts[0]}`)
  }

  let windowMs: number

  if (parts.length === 1) {
    // Default to 1 minute if no time window specified
    windowMs = 60 * 1000
  }
  else {
    const timeStr = parts[1]
    windowMs = parseTimeString(timeStr)
  }

  return {
    maxAttempts,
    windowMs,
  }
}

/**
 * Parse time string with units into milliseconds
 */
function parseTimeString(timeStr: string): number {
  const timePattern = /^(\d+)([smh]|sec|min|hour)?$/
  const match = timeStr.match(timePattern)

  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}`)
  }

  const value = Number.parseInt(match[1], 10)
  const unit = match[2] || 'm' // Default to minutes

  if (Number.isNaN(value) || value <= 0) {
    throw new Error(`Invalid time value: ${match[1]}`)
  }

  switch (unit) {
    case 's':
    case 'sec':
      return value * 1000
    case 'm':
    case 'min':
      return value * 60 * 1000
    case 'h':
    case 'hour':
      return value * 60 * 60 * 1000
    default:
      // Fallback: treat as minutes if no unit or unknown unit
      return value * 60 * 1000
  }
}

/**
 * Factory functions for common rate limiting scenarios
 */
export const ThrottleFactory = {
  /**
   * API rate limiting (60 requests per minute)
   */
  api: (maxAttempts: number = 60, windowMinutes: number = 1): ThrottleConfig => ({
    maxAttempts,
    windowMs: windowMinutes * 60 * 1000,
    headers: true,
  }),

  /**
   * Authentication rate limiting (5 attempts per 15 minutes)
   */
  auth: (): ThrottleConfig => ({
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    keyGenerator: (req) => {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
      const email = (req.jsonBody as any)?.email || (req.formBody as any)?.email || (req.query as any)?.email || 'unknown'
      return `auth:${ip}:${email}`
    },
    onLimitReached: (req, info) => new Response(
      JSON.stringify({
        error: 'Too many authentication attempts',
        message: 'Please try again later',
        retryAfter: Math.ceil((info.resetTime.getTime() - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((info.resetTime.getTime() - Date.now()) / 1000).toString(),
        },
      },
    ),
  }),

  /**
   * Upload rate limiting (10 uploads per hour)
   */
  upload: (): ThrottleConfig => ({
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000,
    keyGenerator: (req) => {
      const userId = req.user?.id
      if (userId) {
        return `upload:user:${userId}`
      }
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
      return `upload:ip:${ip}`
    },
  }),

  /**
   * Search rate limiting (100 searches per 10 minutes)
   */
  search: (): ThrottleConfig => ({
    maxAttempts: 100,
    windowMs: 10 * 60 * 1000,
    skipIf: (req) => {
      // Skip rate limiting for authenticated premium users
      return req.user?.plan === 'premium'
    },
  }),

  /**
   * Per-user rate limiting
   */
  perUser: (maxAttempts: number, windowMinutes: number): ThrottleConfig => ({
    maxAttempts,
    windowMs: windowMinutes * 60 * 1000,
    keyGenerator: (req) => {
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for per-user rate limiting')
      }
      return `user:${userId}`
    },
    skipIf: req => !req.user?.id, // Skip if not authenticated
  }),

  /**
   * Per-IP rate limiting
   */
  perIP: (maxAttempts: number, windowMinutes: number): ThrottleConfig => ({
    maxAttempts,
    windowMs: windowMinutes * 60 * 1000,
    keyGenerator: (req) => {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]
        || req.headers.get('x-real-ip')
        || req.headers.get('cf-connecting-ip')
        || 'unknown'
      return `ip:${ip}`
    },
  }),

  /**
   * Global rate limiting (shared across all users)
   */
  global: (maxAttempts: number, windowMinutes: number): ThrottleConfig => ({
    maxAttempts,
    windowMs: windowMinutes * 60 * 1000,
    keyGenerator: () => 'global',
  }),
}

/**
 * Rate limit utilities
 */
export const RateLimitUtils = {
  /**
   * Create throttle middleware from string (Laravel-style)
   */
  fromString: (throttleStr: string, name?: string): MiddlewareHandler => {
    const config = parseThrottleString(throttleStr as ThrottlePattern)
    return createRateLimitMiddleware(config, name)
  },

  /**
   * Get rate limit info for a request without incrementing
   */
  getInfo: async (req: EnhancedRequest, config: ThrottleConfig): Promise<RateLimitInfo> => {
    const limiter: RateLimiter = new RateLimiter(config)
    const { info } = await limiter.checkLimit(req)
    return info
  },

  /**
   * Reset rate limit for a specific key
   */
  reset: (limiterName: string, key: string): boolean => {
    const limiter = rateLimitRegistry.get(limiterName)
    if (limiter) {
      return (limiter as any).cache.delete(key)
    }
    return false
  },
}
