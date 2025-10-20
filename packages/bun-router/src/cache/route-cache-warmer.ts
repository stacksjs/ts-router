import type { LRUCache } from './lru-cache'
import type { StreamingCache } from './streaming-cache'

/**
 * Route cache warming system for pre-populating caches with common routes
 */

export interface WarmupRoute {
  path: string
  method: string
  priority: number // Higher number = higher priority
  frequency: number // Expected requests per minute
  params?: Record<string, string>
  query?: Record<string, string>
  headers?: Record<string, string>
  warmupData?: any // Pre-computed data for the route
}

export interface AnalyticsRoute {
  path: string
  method: string
  frequency: number
}

export interface RecentRoute {
  path: string
  method: string
  timestamp: number
}

export interface PrecomputeRoute {
  path: string
  method: string
  computeFunction: () => Promise<any>
  cacheKey?: string
  ttl?: number
}

export interface UserSegment {
  segment: string
  commonRoutes: string[]
  priority: number
}

export interface TimeRange {
  start: number
  end: number
}

export interface TimeBasedPattern {
  timeRange: TimeRange
  routes: string[]
  priority: number
}

export interface GeographicPattern {
  region: string
  routes: string[]
  priority: number
}

export interface IntelligentWarmupPatterns {
  userSegments?: UserSegment[]
  timeBasedPatterns?: TimeBasedPattern[]
  geographicPatterns?: GeographicPattern[]
}

export interface WarmupConfig {
  enabled: boolean
  maxConcurrency: number // Maximum concurrent warmup requests
  warmupTimeout: number // Timeout for individual warmup requests
  retryAttempts: number
  retryDelay: number
  scheduleInterval?: number // Auto-warmup interval in milliseconds
  priorityThreshold: number // Minimum priority to warmup
}

export interface WarmupStats {
  totalRoutes: number
  successfulWarmups: number
  failedWarmups: number
  averageWarmupTime: number
  lastWarmupTime: number
  cacheHitRateImprovement: number
}

/**
 * Route cache warmer for pre-populating caches with frequently accessed routes
 */
export class RouteCacheWarmer {
  private routes: WarmupRoute[] = []
  private routeCache: LRUCache<any>
  private streamingCache?: StreamingCache
  private stats: WarmupStats = {
    totalRoutes: 0,
    successfulWarmups: 0,
    failedWarmups: 0,
    averageWarmupTime: 0,
    lastWarmupTime: 0,
    cacheHitRateImprovement: 0,
  }

  private warmupTimer?: Timer

  constructor(
    private config: WarmupConfig,
    routeCache: LRUCache<any>,
    streamingCache?: StreamingCache,
  ) {
    this.routeCache = routeCache
    this.streamingCache = streamingCache

    if (config.scheduleInterval) {
      this.schedulePeriodicWarmup()
    }
  }

  /**
   * Register routes for cache warming
   */
  registerRoutes(routes: WarmupRoute[]): void {
    this.routes = [...this.routes, ...routes]
      .sort((a, b) => b.priority - a.priority) // Sort by priority descending
    this.stats.totalRoutes = this.routes.length
  }

  /**
   * Register a single route for cache warming
   */
  registerRoute(route: WarmupRoute): void {
    this.routes.push(route)
    this.routes.sort((a, b) => b.priority - a.priority)
    this.stats.totalRoutes = this.routes.length
  }

  /**
   * Warm cache with registered routes
   */
  async warmCache(options: {
    routes?: string[] // Specific routes to warm (by path)
    maxRoutes?: number // Maximum number of routes to warm
    skipLowPriority?: boolean
  } = {}): Promise<WarmupStats> {
    if (!this.config.enabled) {
      return this.stats
    }

    const startTime = Date.now()
    let routesToWarm = this.routes

    // Filter routes if specific routes requested
    if (options.routes) {
      routesToWarm = routesToWarm.filter(route =>
        options.routes!.includes(route.path),
      )
    }

    // Filter by priority threshold
    if (options.skipLowPriority) {
      routesToWarm = routesToWarm.filter(route =>
        route.priority >= this.config.priorityThreshold,
      )
    }

    // Limit number of routes
    if (options.maxRoutes) {
      routesToWarm = routesToWarm.slice(0, options.maxRoutes)
    }

    // Warm routes with concurrency control
    const results = await this.warmRoutesWithConcurrency(routesToWarm)

    // Update statistics
    this.stats.successfulWarmups += results.successful
    this.stats.failedWarmups += results.failed
    this.stats.lastWarmupTime = Date.now()
    this.stats.averageWarmupTime
      = (this.stats.averageWarmupTime + (Date.now() - startTime)) / 2

    return this.stats
  }

  /**
   * Warm specific route patterns based on analytics
   */
  async warmFromAnalytics(analytics: {
    topRoutes: AnalyticsRoute[]
    recentRoutes: RecentRoute[]
  }): Promise<void> {
    const analyticsRoutes: WarmupRoute[] = []

    // Convert top routes to warmup routes
    for (const route of analytics.topRoutes) {
      analyticsRoutes.push({
        path: route.path,
        method: route.method,
        priority: Math.min(route.frequency * 10, 100), // Scale frequency to priority
        frequency: route.frequency,
      })
    }

    // Add recent routes with lower priority
    for (const route of analytics.recentRoutes) {
      const age = Date.now() - route.timestamp
      const priority = Math.max(50 - (age / (60 * 1000)), 10) // Decay priority with age

      analyticsRoutes.push({
        path: route.path,
        method: route.method,
        priority,
        frequency: 1,
      })
    }

    this.registerRoutes(analyticsRoutes)
    await this.warmCache({ maxRoutes: 50 })
  }

  /**
   * Pre-compute and cache expensive route operations
   */
  async precomputeRoutes(routes: PrecomputeRoute[]): Promise<number> {
    let precomputedCount = 0

    for (const route of routes) {
      try {
        const startTime = Date.now()
        const result = await Promise.race([
          route.computeFunction(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.config.warmupTimeout),
          ),
        ])

        const cacheKey = route.cacheKey || `${route.method}:${route.path}`
        this.routeCache.set(cacheKey, result, route.ttl)

        precomputedCount++
        console.log(`Precomputed ${cacheKey} in ${Date.now() - startTime}ms`)
      }
      catch (error) {
        console.warn(`Failed to precompute ${route.path}:`, error)
      }
    }

    return precomputedCount
  }

  /**
   * Warm cache based on route patterns and user behavior
   */
  async intelligentWarmup(patterns: IntelligentWarmupPatterns): Promise<void> {
    const currentHour = new Date().getHours()
    const intelligentRoutes: WarmupRoute[] = []

    // Add user segment routes
    if (patterns.userSegments) {
      for (const segment of patterns.userSegments) {
        for (const route of segment.commonRoutes) {
          intelligentRoutes.push({
            path: route,
            method: 'GET',
            priority: segment.priority,
            frequency: 10,
          })
        }
      }
    }

    // Add time-based routes
    if (patterns.timeBasedPatterns) {
      for (const pattern of patterns.timeBasedPatterns) {
        if (currentHour >= pattern.timeRange.start && currentHour <= pattern.timeRange.end) {
          for (const route of pattern.routes) {
            intelligentRoutes.push({
              path: route,
              method: 'GET',
              priority: pattern.priority + 20, // Boost priority for current time
              frequency: 15,
            })
          }
        }
      }
    }

    this.registerRoutes(intelligentRoutes)
    await this.warmCache({ skipLowPriority: true })
  }

  /**
   * Get cache warming statistics
   */
  getStats(): WarmupStats {
    return { ...this.stats }
  }

  /**
   * Clear warmup statistics
   */
  resetStats(): void {
    this.stats = {
      totalRoutes: this.routes.length,
      successfulWarmups: 0,
      failedWarmups: 0,
      averageWarmupTime: 0,
      lastWarmupTime: 0,
      cacheHitRateImprovement: 0,
    }
  }

  /**
   * Stop periodic warmup
   */
  stop(): void {
    if (this.warmupTimer) {
      clearInterval(this.warmupTimer)
      this.warmupTimer = undefined
    }
  }

  /**
   * Warm routes with concurrency control
   */
  private async warmRoutesWithConcurrency(routes: WarmupRoute[]): Promise<{
    successful: number
    failed: number
  }> {
    let successful = 0
    let failed = 0
    const _semaphore = Array.from({ length: this.config.maxConcurrency }, () => null)

    const warmRoute = async (route: WarmupRoute): Promise<void> => {
      try {
        await this.warmSingleRoute(route)
        successful++
      }
      catch (error) {
        failed++
        console.warn(`Failed to warm route ${route.path}:`, error)
      }
    }

    // Process routes in batches with concurrency control
    for (let i = 0; i < routes.length; i += this.config.maxConcurrency) {
      const batch = routes.slice(i, i + this.config.maxConcurrency)
      await Promise.allSettled(batch.map(warmRoute))
    }

    return { successful, failed }
  }

  /**
   * Warm a single route
   */
  private async warmSingleRoute(route: WarmupRoute): Promise<void> {
    const url = this.buildRouteUrl(route)
    let attempt = 0

    while (attempt < this.config.retryAttempts) {
      try {
        const response = await Promise.race([
          fetch(url, {
            method: route.method,
            headers: route.headers,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.config.warmupTimeout),
          ),
        ])

        // Cache the response if streaming cache is available
        if (this.streamingCache && response.ok) {
          const cacheKey = `${route.method}:${route.path}`
          await this.streamingCache.cacheResponse(cacheKey, response.clone() as Response, {
            forceCache: true,
            generateETag: true,
          })
        }

        // Cache pre-computed data if available
        if (route.warmupData) {
          const cacheKey = `warmup:${route.method}:${route.path}`
          this.routeCache.set(cacheKey, route.warmupData)
        }

        return // Success
      }
      catch (error) {
        attempt++
        if (attempt < this.config.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay))
        }
        else {
          throw error
        }
      }
    }
  }

  /**
   * Build URL for route warming
   */
  private buildRouteUrl(route: WarmupRoute): string {
    let path = route.path

    // Replace path parameters
    if (route.params) {
      for (const [key, value] of Object.entries(route.params)) {
        path = path.replace(`{${key}}`, value).replace(`:${key}`, value)
      }
    }

    // Add query parameters
    if (route.query) {
      const queryString = new URLSearchParams(route.query).toString()
      path += `?${queryString}`
    }

    // For warmup, we'll use localhost - in production this would be the actual server
    return `http://localhost:3000${path}`
  }

  /**
   * Schedule periodic cache warmup
   */
  private schedulePeriodicWarmup(): void {
    this.warmupTimer = setInterval(async () => {
      try {
        await this.warmCache({ skipLowPriority: true, maxRoutes: 20 })
      }
      catch (error) {
        console.warn('Periodic warmup failed:', error)
      }
    }, this.config.scheduleInterval!)
  }
}

/**
 * Factory functions for creating route cache warmers
 */
export const createRouteCacheWarmer = {
  /**
   * Create warmer for development environment
   */
  development: (routeCache: LRUCache<any>, streamingCache?: StreamingCache): RouteCacheWarmer =>
    new RouteCacheWarmer(
      {
        enabled: true,
        maxConcurrency: 2,
        warmupTimeout: 5000,
        retryAttempts: 1,
        retryDelay: 1000,
        priorityThreshold: 30,
      },
      routeCache,
      streamingCache,
    ),

  /**
   * Create warmer for production environment
   */
  production: (routeCache: LRUCache<any>, streamingCache?: StreamingCache): RouteCacheWarmer =>
    new RouteCacheWarmer(
      {
        enabled: true,
        maxConcurrency: 10,
        warmupTimeout: 10000,
        retryAttempts: 3,
        retryDelay: 2000,
        scheduleInterval: 5 * 60 * 1000, // Every 5 minutes
        priorityThreshold: 50,
      },
      routeCache,
      streamingCache,
    ),

  /**
   * Create warmer with custom configuration
   */
  custom: (
    config: WarmupConfig,
    routeCache: LRUCache<any>,
    streamingCache?: StreamingCache,
  ): RouteCacheWarmer =>
    new RouteCacheWarmer(config, routeCache, streamingCache),
}
