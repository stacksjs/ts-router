import type { EnhancedRequest, MiddlewareHandler } from '../types'
import type { LRUCacheOptions } from './lru-cache'
import { LRUCache } from './lru-cache'

/**
 * Middleware result memoization for expensive operations
 * Caches middleware results based on request characteristics
 */

export interface MemoizationOptions extends Omit<LRUCacheOptions, 'maxSize'> {
  maxSize: number
  keyGenerator?: (req: EnhancedRequest) => string
  shouldMemoize?: (req: EnhancedRequest, result: any) => boolean
  resultSerializer?: (result: any) => any
  resultDeserializer?: (serialized: any) => any
}

export interface MemoizedResult<T = any> {
  value: T
  timestamp: number
  requestFingerprint: string
  executionTime: number
  hitCount: number
}

export interface MemoizationStats {
  totalRequests: number
  cacheHits: number
  cacheMisses: number
  hitRate: number
  averageExecutionTime: number
  totalTimeSaved: number
  memoryUsage: number
}

/**
 * Middleware memoization system for caching expensive operations
 */
export class MiddlewareMemoizer {
  private cache: LRUCache<MemoizedResult>
  private stats: MemoizationStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    averageExecutionTime: 0,
    totalTimeSaved: 0,
    memoryUsage: 0,
  }

  constructor(private options: MemoizationOptions) {
    this.cache = new LRUCache<MemoizedResult>({
      maxSize: options.maxSize,
      ttl: options.ttl,
      onEvict: options.onEvict,
      allowStale: options.allowStale,
      updateAgeOnGet: options.updateAgeOnGet,
    })
  }

  /**
   * Create a memoized version of a middleware function
   */
  memoize<T = any>(
    middleware: MiddlewareHandler,
    options: {
      name?: string
      keyGenerator?: (req: EnhancedRequest) => string
      shouldMemoize?: (req: EnhancedRequest, result: any) => boolean
      ttl?: number
    } = {},
  ): MiddlewareHandler {
    const middlewareName = options.name || middleware.name || 'anonymous'

    return async (req: EnhancedRequest, next) => {
      this.stats.totalRequests++

      // Generate cache key
      const cacheKey = this.generateCacheKey(req, middlewareName, options.keyGenerator)

      // Try to get cached result
      const cachedResult = this.cache.get(cacheKey)

      if (cachedResult) {
        this.stats.cacheHits++
        cachedResult.hitCount++
        this.stats.totalTimeSaved += cachedResult.executionTime
        this.updateHitRate()

        // Deserialize and return cached result
        const result = this.options.resultDeserializer
          ? this.options.resultDeserializer(cachedResult.value)
          : cachedResult.value

        return result
      }

      // Cache miss - execute middleware
      this.stats.cacheMisses++
      const startTime = performance.now()

      try {
        const result = await middleware(req, next)
        const executionTime = performance.now() - startTime

        // Update average execution time
        this.stats.averageExecutionTime
          = (this.stats.averageExecutionTime * (this.stats.totalRequests - 1) + executionTime)
            / this.stats.totalRequests

        // Check if result should be memoized
        const shouldMemoize = options.shouldMemoize || this.options.shouldMemoize
        if (!shouldMemoize || shouldMemoize(req, result)) {
          // Serialize and cache result
          const serializedResult = this.options.resultSerializer
            ? this.options.resultSerializer(result)
            : result

          const memoizedResult: MemoizedResult = {
            value: serializedResult,
            timestamp: Date.now(),
            requestFingerprint: this.generateRequestFingerprint(req),
            executionTime,
            hitCount: 0,
          }

          this.cache.set(cacheKey, memoizedResult, options.ttl)
        }

        this.updateHitRate()
        return result
      }
      catch (error) {
        // Don't cache errors
        throw error
      }
    }
  }

  /**
   * Create a memoized async function (not middleware)
   */
  memoizeFunction<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: {
      name?: string
      keyGenerator?: (...args: TArgs) => string
      shouldMemoize?: (result: TResult, ...args: TArgs) => boolean
      ttl?: number
    } = {},
  ): (...args: TArgs) => Promise<TResult> {
    const functionName = options.name || fn.name || 'anonymous'

    return async (...args: TArgs): Promise<TResult> => {
      this.stats.totalRequests++

      // Generate cache key
      const cacheKey = options.keyGenerator
        ? `${functionName}:${options.keyGenerator(...args)}`
        : `${functionName}:${JSON.stringify(args)}`

      // Try to get cached result
      const cachedResult = this.cache.get(cacheKey)

      if (cachedResult) {
        this.stats.cacheHits++
        cachedResult.hitCount++
        this.stats.totalTimeSaved += cachedResult.executionTime
        this.updateHitRate()

        return this.options.resultDeserializer
          ? this.options.resultDeserializer(cachedResult.value)
          : cachedResult.value
      }

      // Cache miss - execute function
      this.stats.cacheMisses++
      const startTime = performance.now()

      try {
        const result = await fn(...args)
        const executionTime = performance.now() - startTime

        this.stats.averageExecutionTime
          = (this.stats.averageExecutionTime * (this.stats.totalRequests - 1) + executionTime)
            / this.stats.totalRequests

        // Check if result should be memoized
        if (!options.shouldMemoize || options.shouldMemoize(result, ...args)) {
          const serializedResult = this.options.resultSerializer
            ? this.options.resultSerializer(result)
            : result

          const memoizedResult: MemoizedResult = {
            value: serializedResult,
            timestamp: Date.now(),
            requestFingerprint: JSON.stringify(args),
            executionTime,
            hitCount: 0,
          }

          this.cache.set(cacheKey, memoizedResult, options.ttl)
        }

        this.updateHitRate()
        return result
      }
      catch (error) {
        throw error
      }
    }
  }

  /**
   * Invalidate cached results by pattern
   */
  invalidate(pattern: string | RegExp): number {
    let invalidatedCount = 0
    const keys = this.cache.keys()

    for (const key of keys) {
      if (typeof pattern === 'string') {
        if (key.includes(pattern)) {
          this.cache.delete(key)
          invalidatedCount++
        }
      }
      else if (pattern instanceof RegExp) {
        if (pattern.test(key)) {
          this.cache.delete(key)
          invalidatedCount++
        }
      }
    }

    return invalidatedCount
  }

  /**
   * Invalidate cached results for specific user
   */
  invalidateForUser(userId: string): number {
    return this.invalidate(`user:${userId}`)
  }

  /**
   * Invalidate cached results by tag
   */
  invalidateByTag(tag: string): number {
    return this.invalidate(`tag:${tag}`)
  }

  /**
   * Get most frequently used cached results
   */
  getPopularResults(limit: number = 10): Array<{
    key: string
    hitCount: number
    executionTime: number
    timeSaved: number
  }> {
    const results: Array<{
      key: string
      hitCount: number
      executionTime: number
      timeSaved: number
    }> = []

    for (const key of this.cache.keys()) {
      const result = this.cache.get(key)
      if (result) {
        results.push({
          key,
          hitCount: result.hitCount,
          executionTime: result.executionTime,
          timeSaved: result.hitCount * result.executionTime,
        })
      }
    }

    return results
      .sort((a, b) => b.timeSaved - a.timeSaved)
      .slice(0, limit)
  }

  /**
   * Get memoization statistics
   */
  getStats(): MemoizationStats {
    return {
      ...this.stats,
      memoryUsage: this.cache.getStats().memoryUsage,
    }
  }

  /**
   * Clear cache and reset statistics
   */
  clear(): void {
    this.cache.clear()
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRate: 0,
      averageExecutionTime: 0,
      totalTimeSaved: 0,
      memoryUsage: 0,
    }
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    return this.cache.prune()
  }

  /**
   * Generate cache key for middleware
   */
  private generateCacheKey(
    req: EnhancedRequest,
    middlewareName: string,
    customKeyGenerator?: (req: EnhancedRequest) => string,
  ): string {
    if (customKeyGenerator) {
      return `${middlewareName}:${customKeyGenerator(req)}`
    }

    if (this.options.keyGenerator) {
      return `${middlewareName}:${this.options.keyGenerator(req)}`
    }

    // Default key generation
    const url = new URL(req.url)
    const keyParts = [
      middlewareName,
      req.method,
      url.pathname,
      url.search,
      req.user?.id || 'anonymous',
    ]

    return keyParts.join(':')
  }

  /**
   * Generate request fingerprint for cache validation
   */
  private generateRequestFingerprint(req: EnhancedRequest): string {
    const fingerprint = {
      method: req.method,
      url: req.url,
      userAgent: req.headers.get('user-agent'),
      userId: req.user?.id,
      timestamp: Math.floor(Date.now() / 60000), // Round to minute
    }

    return JSON.stringify(fingerprint)
  }

  /**
   * Update hit rate statistics
   */
  private updateHitRate(): void {
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses
    this.stats.hitRate = totalRequests > 0 ? this.stats.cacheHits / totalRequests : 0
  }
}

/**
 * Common memoization patterns and utilities
 */
export class MemoizationPatterns {
  /**
   * Memoize database queries
   */
  static createDatabaseMemoizer(options: MemoizationOptions = { maxSize: 1000 }): MiddlewareMemoizer {
    return new MiddlewareMemoizer({
      ...options,
      keyGenerator: (req) => {
        // Include user context and query parameters in key
        const url = new URL(req.url)
        return `db:${req.user?.id || 'anon'}:${url.pathname}:${url.search}`
      },
      shouldMemoize: (req, result) => {
        // Only memoize successful results
        return result && !result.error
      },
      ttl: 5 * 60 * 1000, // 5 minutes
    })
  }

  /**
   * Memoize API calls
   */
  static createApiMemoizer(options: MemoizationOptions = { maxSize: 500 }): MiddlewareMemoizer {
    return new MiddlewareMemoizer({
      ...options,
      keyGenerator: (req) => {
        const url = new URL(req.url)
        return `api:${req.method}:${url.pathname}:${url.search}`
      },
      shouldMemoize: (req, result) => {
        // Memoize GET requests and successful responses
        return req.method === 'GET' && result && result.status < 400
      },
      ttl: 2 * 60 * 1000, // 2 minutes
    })
  }

  /**
   * Memoize authentication checks
   */
  static createAuthMemoizer(options: MemoizationOptions = { maxSize: 2000 }): MiddlewareMemoizer {
    return new MiddlewareMemoizer({
      ...options,
      keyGenerator: (req) => {
        const token = req.headers.get('authorization')?.replace('Bearer ', '')
        return `auth:${token || 'anonymous'}`
      },
      shouldMemoize: (req, result) => {
        // Memoize successful auth results
        return result && result.user
      },
      ttl: 10 * 60 * 1000, // 10 minutes
    })
  }

  /**
   * Memoize rate limiting checks
   */
  static createRateLimitMemoizer(options: MemoizationOptions = { maxSize: 5000 }): MiddlewareMemoizer {
    return new MiddlewareMemoizer({
      ...options,
      keyGenerator: (req) => {
        const clientId = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
        return `ratelimit:${clientId}`
      },
      shouldMemoize: (req, result) => {
        // Always memoize rate limit results
        return true
      },
      ttl: 60 * 1000, // 1 minute
    })
  }

  /**
   * Memoize expensive computations
   */
  static createComputationMemoizer(options: MemoizationOptions = { maxSize: 200 }): MiddlewareMemoizer {
    return new MiddlewareMemoizer({
      ...options,
      keyGenerator: (req) => {
        // Include request body hash for POST requests
        const url = new URL(req.url)
        let key = `compute:${req.method}:${url.pathname}:${url.search}`

        if (req.jsonBody) {
          key += `:${JSON.stringify(req.jsonBody)}`
        }

        return key
      },
      shouldMemoize: (req, result) => {
        // Memoize successful computations
        return result && !result.error
      },
      ttl: 30 * 60 * 1000, // 30 minutes
    })
  }
}

/**
 * Decorator for memoizing class methods
 */
export function Memoize(options: {
  memoizer: MiddlewareMemoizer
  keyGenerator?: (...args: any[]) => string
  ttl?: number
} = { memoizer: new MiddlewareMemoizer({ maxSize: 100 }) }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = function (...args: any[]) {
      const memoizedMethod = options.memoizer.memoizeFunction(
        originalMethod.bind(this),
        {
          name: `${target.constructor.name}.${propertyKey}`,
          keyGenerator: options.keyGenerator,
          ttl: options.ttl,
        },
      )

      return memoizedMethod(...args)
    }

    return descriptor
  }
}

/**
 * Factory functions for creating memoizers
 */
export const createMemoizer = {
  /**
   * Create memoizer for development
   */
  development: (): MiddlewareMemoizer =>
    new MiddlewareMemoizer({
      maxSize: 100,
      ttl: 60 * 1000, // 1 minute
      updateAgeOnGet: true,
    }),

  /**
   * Create memoizer for production
   */
  production: (): MiddlewareMemoizer =>
    new MiddlewareMemoizer({
      maxSize: 10000,
      ttl: 15 * 60 * 1000, // 15 minutes
      updateAgeOnGet: true,
    }),

  /**
   * Create custom memoizer
   */
  custom: (options: MemoizationOptions): MiddlewareMemoizer =>
    new MiddlewareMemoizer(options),
}
