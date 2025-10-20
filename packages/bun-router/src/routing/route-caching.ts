import type { EnhancedRequest } from '../types'
import { LRUCache } from '../cache/lru-cache'

/**
 * Route caching configuration
 */
export interface RouteCacheConfig {
  ttl?: number // Time to live in milliseconds
  maxSize?: number // Maximum number of cached responses
  tags?: string[] // Cache tags for invalidation
  varyBy?: string[] // Headers to vary cache by
  excludeQuery?: string[] // Query parameters to exclude from cache key
  condition?: (req: EnhancedRequest) => boolean // Condition to determine if response should be cached
}

/**
 * Cached response metadata
 */
export interface CachedResponse {
  response: Response
  headers: Record<string, string>
  status: number
  body: string | Uint8Array
  timestamp: number
  ttl?: number
  tags: string[]
  etag?: string
}

/**
 * Cache key generator for route responses
 */
export class RouteCacheKeyGenerator {
  /**
   * Generate cache key from request
   */
  static generateKey(req: EnhancedRequest, config: RouteCacheConfig): string {
    const url = new URL(req.url)
    const method = req.method
    const path = url.pathname

    // Base key components
    const keyParts = [method, path]

    // Add query parameters (excluding specified ones)
    const queryParams = new URLSearchParams(url.search)
    const excludeQuery = config.excludeQuery || []

    const relevantQuery: string[] = []
    for (const [key, value] of queryParams.entries()) {
      if (!excludeQuery.includes(key)) {
        relevantQuery.push(`${key}=${value}`)
      }
    }

    if (relevantQuery.length > 0) {
      keyParts.push(relevantQuery.sort().join('&'))
    }

    // Add vary headers
    if (config.varyBy) {
      const varyValues: string[] = []
      for (const header of config.varyBy) {
        const value = req.headers.get(header)
        if (value) {
          varyValues.push(`${header}:${value}`)
        }
      }
      if (varyValues.length > 0) {
        keyParts.push(varyValues.join('|'))
      }
    }

    return keyParts.join('::')
  }
}

/**
 * Route cache manager with tag-based invalidation
 */
export class RouteCacheManager {
  private cache: LRUCache<CachedResponse>
  private tagIndex: Map<string, Set<string>> = new Map() // tag -> cache keys
  private keyTags: Map<string, Set<string>> = new Map() // cache key -> tags

  constructor(maxSize: number = 1000) {
    this.cache = new LRUCache<CachedResponse>({ maxSize })
  }

  /**
   * Get cached response
   */
  async get(key: string): Promise<CachedResponse | null> {
    const cached = this.cache.get(key)
    if (!cached) {
      return null
    }

    // Check TTL
    if (cached.ttl && Date.now() - cached.timestamp > cached.ttl) {
      this.delete(key)
      return null
    }

    return cached
  }

  /**
   * Set cached response
   */
  async set(key: string, response: CachedResponse): Promise<void> {
    // Store in cache
    this.cache.set(key, response)

    // Update tag indexes
    this.keyTags.set(key, new Set(response.tags))

    for (const tag of response.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set())
      }
      this.tagIndex.get(tag)!.add(key)
    }
  }

  /**
   * Delete cached response
   */
  delete(key: string): boolean {
    const tags = this.keyTags.get(key)
    if (tags) {
      // Remove from tag indexes
      for (const tag of tags) {
        const tagKeys = this.tagIndex.get(tag)
        if (tagKeys) {
          tagKeys.delete(key)
          if (tagKeys.size === 0) {
            this.tagIndex.delete(tag)
          }
        }
      }
      this.keyTags.delete(key)
    }

    return this.cache.delete(key)
  }

  /**
   * Invalidate cache by tags
   */
  invalidateByTags(tags: string[]): number {
    const keysToDelete = new Set<string>()

    for (const tag of tags) {
      const tagKeys = this.tagIndex.get(tag)
      if (tagKeys) {
        for (const key of tagKeys) {
          keysToDelete.add(key)
        }
      }
    }

    for (const key of keysToDelete) {
      this.delete(key)
    }

    return keysToDelete.size
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
    this.tagIndex.clear()
    this.keyTags.clear()
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.cache.getStats(),
      totalTags: this.tagIndex.size,
      totalKeyTagMappings: this.keyTags.size,
    }
  }
}

/**
 * Global route cache manager instance
 */
export const routeCacheManager = new RouteCacheManager()

/**
 * Create route caching middleware
 */
export function createRouteCacheMiddleware(config: RouteCacheConfig) {
  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    // Check if caching condition is met
    if (config.condition && !config.condition(req)) {
      return await next()
    }

    // Only cache GET and HEAD requests by default
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return await next()
    }

    // Generate cache key
    const cacheKey = RouteCacheKeyGenerator.generateKey(req, config)

    // Try to get from cache
    const cached = await routeCacheManager.get(cacheKey)
    if (cached) {
      // Return cached response
      const headers = new Headers(cached.headers)

      // Add cache headers
      headers.set('X-Cache', 'HIT')
      headers.set('X-Cache-Key', cacheKey)

      if (cached.etag) {
        headers.set('ETag', cached.etag)

        // Check if client has matching ETag
        const clientETag = req.headers.get('If-None-Match')
        if (clientETag === cached.etag) {
          return new Response(null, { status: 304, headers })
        }
      }

      return new Response(cached.body, {
        status: cached.status,
        headers,
      })
    }

    // Execute route handler
    const response = await next()

    // Only cache successful responses
    if (response.status >= 200 && response.status < 300) {
      try {
        // Clone response to cache it
        const responseClone = response.clone()
        const body = await responseClone.arrayBuffer()

        // Generate ETag
        const etag = await generateETag(body)

        // Prepare headers for caching
        const headers: Record<string, string> = {}
        responseClone.headers.forEach((value, key) => {
          headers[key] = value
        })

        // Create cached response
        const cachedResponse: CachedResponse = {
          response: responseClone as Response,
          headers,
          status: response.status,
          body: new Uint8Array(body),
          timestamp: Date.now(),
          ttl: config.ttl,
          tags: config.tags || [],
          etag,
        }

        // Store in cache
        await routeCacheManager.set(cacheKey, cachedResponse)

        // Add cache headers to original response
        const originalHeaders = new Headers(response.headers)
        originalHeaders.set('X-Cache', 'MISS')
        originalHeaders.set('X-Cache-Key', cacheKey)
        originalHeaders.set('ETag', etag)

        return new Response(response.body, {
          status: response.status,
          headers: originalHeaders,
        })
      }
      catch (error) {
        console.error('Error caching response:', error)
        // Return original response if caching fails
        return response
      }
    }

    return response
  }
}

/**
 * Generate ETag from response body
 */
async function generateETag(body: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', body)
  const hashArray = Array.from(new Uint8Array(hash))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `"${hashHex.substring(0, 16)}"` // Use first 16 chars for ETag
}

/**
 * Factory functions for common cache configurations
 */
export const RouteCacheFactory = {
  /**
   * Short-term cache (5 minutes)
   */
  short: (tags: string[] = []): RouteCacheConfig => ({
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: 500,
    tags,
  }),

  /**
   * Medium-term cache (1 hour)
   */
  medium: (tags: string[] = []): RouteCacheConfig => ({
    ttl: 60 * 60 * 1000, // 1 hour
    maxSize: 1000,
    tags,
  }),

  /**
   * Long-term cache (24 hours)
   */
  long: (tags: string[] = []): RouteCacheConfig => ({
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 2000,
    tags,
  }),

  /**
   * API response cache with common settings
   */
  api: (tags: string[] = []): RouteCacheConfig => ({
    ttl: 15 * 60 * 1000, // 15 minutes
    maxSize: 1000,
    tags,
    varyBy: ['Authorization', 'Accept', 'Accept-Language'],
    excludeQuery: ['_t', 'timestamp', 'cache_bust'],
  }),

  /**
   * Static content cache
   */
  static: (tags: string[] = []): RouteCacheConfig => ({
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxSize: 5000,
    tags,
    varyBy: ['Accept-Encoding'],
  }),

  /**
   * User-specific cache
   */
  user: (tags: string[] = []): RouteCacheConfig => ({
    ttl: 30 * 60 * 1000, // 30 minutes
    maxSize: 2000,
    tags,
    varyBy: ['Authorization'],
    condition: req => !!req.headers.get('Authorization'),
  }),
}

/**
 * Cache invalidation utilities
 */
export const CacheInvalidation = {
  /**
   * Invalidate by tags
   */
  byTags: (tags: string[]): number => {
    return routeCacheManager.invalidateByTags(tags)
  },

  /**
   * Invalidate all user-related cache
   */
  forUser: (userId: string): number => {
    return routeCacheManager.invalidateByTags([`user:${userId}`])
  },

  /**
   * Invalidate model-related cache
   */
  forModel: (modelName: string, id?: string): number => {
    const tags = id ? [`${modelName}:${id}`, modelName] : [modelName]
    return routeCacheManager.invalidateByTags(tags)
  },

  /**
   * Clear all cache
   */
  all: (): void => {
    routeCacheManager.clear()
  },
}
