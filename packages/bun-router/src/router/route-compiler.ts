import type { HTTPMethod, MatchResult, Route } from '../types'
import type { CompiledRoute } from './route-trie'
import { RouteTrie } from './route-trie'

/**
 * Route compilation options
 */
export interface RouteCompilerOptions {
  enableCaching: boolean
  enableMethodGrouping: boolean
  enablePriorityOptimization: boolean
  cacheSize: number
  precompilePatterns: boolean
}

/**
 * Route matching statistics for performance monitoring
 */
export interface RouteMatchStats {
  totalMatches: number
  cacheHits: number
  cacheMisses: number
  averageMatchTime: number
  trieDepth: number
  methodDistribution: Record<string, number>
}

/**
 * High-performance route compiler with pre-compilation and optimization
 */
export class RouteCompiler {
  private trie: RouteTrie
  private matchCache: Map<string, MatchResult | null> = new Map()
  private stats: RouteMatchStats = {
    totalMatches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageMatchTime: 0,
    trieDepth: 0,
    methodDistribution: {},
  }

  private options: RouteCompilerOptions

  constructor(options: Partial<RouteCompilerOptions> = {}) {
    this.options = {
      enableCaching: true,
      enableMethodGrouping: true,
      enablePriorityOptimization: true,
      cacheSize: 1000,
      precompilePatterns: true,
      ...options,
    }

    this.trie = new RouteTrie()
  }

  /**
   * Add a route to the compiler
   */
  addRoute(route: Route): void {
    // Pre-compile the route pattern if enabled
    if (this.options.precompilePatterns) {
      this.precompileRoutePattern(route)
    }

    // Add to trie for fast matching
    this.trie.addRoute(route)

    // Clear cache when routes change
    if (this.options.enableCaching) {
      this.matchCache.clear()
    }

    // Update method distribution stats
    const method = route.method
    this.stats.methodDistribution[method] = (this.stats.methodDistribution[method] || 0) + 1
  }

  /**
   * Pre-compile route patterns for faster matching
   */
  private precompileRoutePattern(route: Route): void {
    if (!route.pattern && route.path.includes('{')) {
      // Convert Laravel-style parameters to URLPattern
      const pattern = this.convertToURLPattern(route.path)
      route.pattern = {
        exec: (url: URL) => {
          const match = pattern.exec(url.pathname)
          if (!match)
            return null

          return {
            pathname: {
              groups: match.groups || {},
            },
          }
        },
      }
    }
  }

  /**
   * Convert Laravel-style route to a simple regex pattern
   */
  private convertToURLPattern(path: string): { exec: (pathname: string) => { groups?: Record<string, string> } | null } {
    // Convert {param} to named capture groups and {param:pattern} to constrained capture groups
    let regexPattern = path.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (match, name, pattern) => {
      if (pattern) {
        return `(?<${name}>${pattern})`
      }
      return `(?<${name}>[^/]+)`
    })

    // Escape forward slashes and add anchors
    regexPattern = `^${regexPattern.replace(/\//g, '\\/')}$`
    const regex = new RegExp(regexPattern)

    return {
      exec: (pathname: string) => {
        const match = pathname.match(regex)
        if (!match) return null
        
        return {
          groups: match.groups || {}
        }
      }
    }
  }

  /**
   * Match a request path and method to a route
   */
  match(path: string, method: HTTPMethod): MatchResult | null {
    const startTime = performance.now()
    this.stats.totalMatches++

    // Check cache first if enabled
    if (this.options.enableCaching) {
      const cacheKey = `${method}:${path}`
      if (this.matchCache.has(cacheKey)) {
        this.stats.cacheHits++
        const cached = this.matchCache.get(cacheKey)
        this.updateMatchTime(startTime)
        return cached || null
      }
      this.stats.cacheMisses++
    }

    // Use trie for fast matching
    const trieMatch = this.trie.match(path, method)
    let result: MatchResult | null = null

    if (trieMatch) {
      result = {
        route: trieMatch.route,
        params: trieMatch.params
      }
    }

    // Cache the result if enabled
    if (this.options.enableCaching && this.matchCache.size < this.options.cacheSize) {
      const cacheKey = `${method}:${path}`
      this.matchCache.set(cacheKey, result)
    }

    this.updateMatchTime(startTime)
    return result
  }

  /**
   * Update average match time statistics
   */
  private updateMatchTime(startTime: number): void {
    const matchTime = performance.now() - startTime
    this.stats.averageMatchTime = (
      (this.stats.averageMatchTime * (this.stats.totalMatches - 1) + matchTime)
      / this.stats.totalMatches
    )
  }

  /**
   * Get all compiled routes sorted by priority
   */
  getCompiledRoutes(): CompiledRoute[] {
    const routes = this.trie.getAllRoutes()

    if (this.options.enablePriorityOptimization) {
      return routes.sort((a, b) => b.priority - a.priority)
    }

    return routes
  }

  /**
   * Get routes grouped by HTTP method
   */
  getRoutesByMethod(): Map<HTTPMethod, CompiledRoute[]> {
    const routesByMethod = new Map<HTTPMethod, CompiledRoute[]>()

    for (const compiled of this.trie.getAllRoutes()) {
      const method = compiled.route.method as HTTPMethod
      if (!routesByMethod.has(method)) {
        routesByMethod.set(method, [])
      }
      routesByMethod.get(method)!.push(compiled)
    }

    // Sort each method's routes by priority
    if (this.options.enablePriorityOptimization) {
      for (const [method, routes] of routesByMethod) {
        routes.sort((a, b) => b.priority - a.priority)
        routesByMethod.set(method, routes)
      }
    }

    return routesByMethod
  }

  /**
   * Warm up the cache with common routes
   */
  warmCache(commonPaths: Array<{ path: string, method: HTTPMethod }>): void {
    if (!this.options.enableCaching)
      return

    for (const { path, method } of commonPaths) {
      this.match(path, method)
    }
  }

  /**
   * Clear all caches and reset statistics
   */
  clear(): void {
    this.trie.clear()
    this.matchCache.clear()
    this.stats = {
      totalMatches: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageMatchTime: 0,
      trieDepth: 0,
      methodDistribution: {},
    }
  }

  /**
   * Get performance statistics
   */
  getStats(): RouteMatchStats {
    const trieStats = this.trie.getStats()
    return {
      ...this.stats,
      trieDepth: trieStats.averageDepth,
      methodDistribution: trieStats.methodDistribution,
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number
    maxSize: number
    hitRate: number
    enabled: boolean
  } {
    const hitRate = this.stats.totalMatches > 0
      ? this.stats.cacheHits / this.stats.totalMatches
      : 0

    return {
      size: this.matchCache.size,
      maxSize: this.options.cacheSize,
      hitRate,
      enabled: this.options.enableCaching,
    }
  }

  /**
   * Optimize route order based on usage patterns
   */
  optimizeRouteOrder(_usageStats: Record<string, number>): void {
    if (!this.options.enablePriorityOptimization)
      return

    // This would reorder routes based on actual usage patterns
    // For now, we'll just clear the cache to force recompilation
    this.matchCache.clear()
  }

  /**
   * Get route conflicts (overlapping patterns)
   */
  getRouteConflicts(): Array<{
    routes: CompiledRoute[]
    conflictType: 'overlap' | 'duplicate' | 'ambiguous'
    severity: 'low' | 'medium' | 'high'
  }> {
    const conflicts: Array<{
      routes: CompiledRoute[]
      conflictType: 'overlap' | 'duplicate' | 'ambiguous'
      severity: 'low' | 'medium' | 'high'
    }> = []

    const routes = this.trie.getAllRoutes()
    const routesByMethod = new Map<string, CompiledRoute[]>()

    // Group routes by method
    for (const route of routes) {
      const method = route.route.method
      if (!routesByMethod.has(method)) {
        routesByMethod.set(method, [])
      }
      routesByMethod.get(method)!.push(route)
    }

    // Check for conflicts within each method
    for (const [_method, methodRoutes] of routesByMethod) {
      for (let i = 0; i < methodRoutes.length; i++) {
        for (let j = i + 1; j < methodRoutes.length; j++) {
          const route1 = methodRoutes[i]
          const route2 = methodRoutes[j]

          if (this.routesConflict(route1, route2)) {
            const severity = this.getConflictSeverity(route1, route2)
            const conflictType = this.getConflictType(route1, route2)

            conflicts.push({
              routes: [route1, route2],
              conflictType,
              severity,
            })
          }
        }
      }
    }

    return conflicts
  }

  /**
   * Check if two routes conflict
   */
  private routesConflict(route1: CompiledRoute, route2: CompiledRoute): boolean {
    // Exact path match
    if (route1.route.path === route2.route.path) {
      return true
    }

    // Check if patterns could match the same paths
    return this.patternsOverlap(route1.segments, route2.segments)
  }

  /**
   * Check if two route patterns overlap
   */
  private patternsOverlap(segments1: any[], segments2: any[]): boolean {
    const minLength = Math.min(segments1.length, segments2.length)

    for (let i = 0; i < minLength; i++) {
      const seg1 = segments1[i]
      const seg2 = segments2[i]

      // Static segments must match exactly
      if (seg1.type === 'static' && seg2.type === 'static') {
        if (seg1.value !== seg2.value) {
          return false
        }
      }
      // One static, one dynamic = potential overlap
      else if (
        (seg1.type === 'static' && seg2.type !== 'static')
        || (seg1.type !== 'static' && seg2.type === 'static')
      ) {
        continue
      }
      // Both dynamic = potential overlap
      else if (seg1.type !== 'static' && seg2.type !== 'static') {
        continue
      }
    }

    return true
  }

  /**
   * Get conflict severity
   */
  private getConflictSeverity(route1: CompiledRoute, route2: CompiledRoute): 'low' | 'medium' | 'high' {
    if (route1.route.path === route2.route.path) {
      return 'high' // Exact duplicate
    }

    if (route1.staticScore === route2.staticScore) {
      return 'medium' // Same specificity
    }

    return 'low' // Different specificity, priority will resolve
  }

  /**
   * Get conflict type
   */
  private getConflictType(route1: CompiledRoute, route2: CompiledRoute): 'overlap' | 'duplicate' | 'ambiguous' {
    if (route1.route.path === route2.route.path) {
      return 'duplicate'
    }

    if (Math.abs(route1.priority - route2.priority) < 10) {
      return 'ambiguous'
    }

    return 'overlap'
  }
}
