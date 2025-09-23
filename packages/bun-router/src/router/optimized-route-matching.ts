import type { HTTPMethod, MatchResult, Route } from '../types'
import type { Router } from './router'
import { RouteCompiler } from './route-compiler'

/**
 * Optimized route matching extension for Router class
 * Replaces the original route matching with high-performance trie-based matching
 */
export function registerOptimizedRouteMatching(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Initialize the route compiler
     */
    initializeRouteCompiler: {
      value() {
        if (!this.routeCompiler) {
          this.routeCompiler = new RouteCompiler({
            enableCaching: true,
            enableMethodGrouping: true,
            enablePriorityOptimization: true,
            cacheSize: 1000,
            precompilePatterns: true,
          })
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Add route to the optimized compiler
     */
    addRouteToCompiler: {
      value(route: Route) {
        this.initializeRouteCompiler()
        this.routeCompiler.addRoute(route)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Optimized route matching using trie structure
     */
    matchRoute: {
      value(path: string, method: HTTPMethod, domain?: string): MatchResult | undefined {
        this.initializeRouteCompiler()

        // Use the optimized compiler for matching
        const match = this.routeCompiler.match(path, method)

        if (match) {
          // Check domain constraints if specified
          if (domain && match.route.domain && match.route.domain !== domain) {
            return undefined
          }

          return match
        }

        // Fallback to original matching for edge cases
        return this.fallbackMatchRoute(path, method, domain)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Fallback to original route matching logic
     */
    fallbackMatchRoute: {
      value(path: string, method: HTTPMethod, domain?: string): MatchResult | undefined {
        const url = new URL(path, 'http://localhost')

        // Generate cache key
        const cacheKey = `${domain || ''}:${method}:${url.pathname}`

        // Check legacy cache first
        if (this.routeCache.has(cacheKey)) {
          return this.routeCache.get(cacheKey)
        }

        // Fast path for static routes
        if (this.staticRoutes.has(method)) {
          const staticRoute = this.staticRoutes.get(method)!.get(url.pathname)
          if (staticRoute && (!domain || !staticRoute.domain || staticRoute.domain === domain)) {
            const result = {
              route: staticRoute,
              params: {},
            }
            this.routeCache.set(cacheKey, result)
            return result
          }
        }

        // Get potential routes - either all routes or domain-specific routes
        const potentialRoutes: Route[] = domain && this.domains[domain]
          ? this.domains[domain]
          : this.routes

        // Filter routes to only those matching the HTTP method
        const methodRoutes = potentialRoutes.filter((route: Route) => route.method === method)

        // First, try to find an exact match
        for (const route of methodRoutes) {
          if (route.path === url.pathname) {
            const result = {
              route,
              params: {},
            }
            this.routeCache.set(cacheKey, result)
            return result
          }
        }

        // If no exact match, try matching patterns
        for (const route of methodRoutes) {
          if (route.pattern) {
            const match = route.pattern.exec(url)
            if (match) {
              const result = {
                route,
                params: match.pathname.groups,
              }
              this.routeCache.set(cacheKey, result)
              return result
            }
          }
        }

        return undefined
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get route matching statistics
     */
    getRouteStats: {
      value() {
        this.initializeRouteCompiler()
        return this.routeCompiler.getStats()
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get cache statistics
     */
    getCacheStats: {
      value() {
        this.initializeRouteCompiler()
        return this.routeCompiler.getCacheStats()
      },
      writable: true,
      configurable: true,
    },

    /**
     * Warm up the route cache with common paths
     */
    warmRouteCache: {
      value(commonPaths: Array<{ path: string, method: HTTPMethod }>) {
        this.initializeRouteCompiler()
        this.routeCompiler.warmCache(commonPaths)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get routes grouped by HTTP method for debugging
     */
    getRoutesByMethod: {
      value() {
        this.initializeRouteCompiler()
        return this.routeCompiler.getRoutesByMethod()
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get route conflicts for debugging
     */
    getRouteConflicts: {
      value() {
        this.initializeRouteCompiler()
        return this.routeCompiler.getRouteConflicts()
      },
      writable: true,
      configurable: true,
    },

    /**
     * Clear route compiler caches
     */
    clearRouteCache: {
      value() {
        if (this.routeCompiler) {
          this.routeCompiler.clear()
        }
        // Also clear legacy caches
        this.routeCache.clear()
      },
      writable: true,
      configurable: true,
    },

    /**
     * Rebuild route compiler with current routes
     */
    rebuildRouteCompiler: {
      value() {
        this.routeCompiler = new RouteCompiler({
          enableCaching: true,
          enableMethodGrouping: true,
          enablePriorityOptimization: true,
          cacheSize: 1000,
          precompilePatterns: true,
        })

        // Re-add all routes
        for (const route of this.routes) {
          this.routeCompiler.addRoute(route)
        }

        // Re-add domain-specific routes
        for (const domainRoutes of Object.values(this.domains)) {
          for (const route of domainRoutes) {
            this.routeCompiler.addRoute(route)
          }
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Optimize route order based on usage patterns
     */
    optimizeRoutes: {
      value(usageStats: Record<string, number> = {}) {
        this.initializeRouteCompiler()
        this.routeCompiler.optimizeRouteOrder(usageStats)
      },
      writable: true,
      configurable: true,
    },
  })
}
