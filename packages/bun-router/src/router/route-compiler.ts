import type { HTTPMethod, MatchResult, PatternMatchResult, Route } from '../types'
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
  private cacheKeys: string[] = [] // For LRU tracking
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
   * @returns true if route was added, false if it's a duplicate
   */
  addRoute(route: Route): boolean {
    // Pre-compile the route pattern if enabled
    if (this.options.precompilePatterns) {
      this.precompileRoutePattern(route)
    }

    // Check for exact duplicates before adding
    const isDuplicate = this.checkForDuplicateRoute(route)
    if (isDuplicate) {
      return false
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

    return true
  }

  /**
   * Check if a route is an exact duplicate of an existing route
   */
  private checkForDuplicateRoute(route: Route): boolean {
    const routes = this.trie.getAllRoutes()

    for (const existingRoute of routes) {
      if (
        existingRoute.route.path === route.path
        && existingRoute.route.method === route.method
      ) {
        return true
      }
    }

    return false
  }

  /**
   * Pre-compile route patterns for faster matching
   */
  // Pattern cache for memory optimization
  private patternCache: Map<string, { exec: (url: URL) => PatternMatchResult | null }> = new Map()

  /**
   * Extract parameter names from a route path
   */
  private extractParamNames(path: string): string[] {
    const paramNames: string[] = []
    const regex = /\{([^}:]+)(?::[^}]+)?\}/g

    // Using a safe approach to avoid lint error with assignment in while condition
    let tempMatch: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while (tempMatch = regex.exec(path)) {
      paramNames.push(tempMatch[1])
    }

    return paramNames
  }

  /**
   * Pre-compile route patterns for faster matching
   */
  private precompileRoutePattern(route: Route): void {
    if (!route.pattern && route.path.includes('{')) {
      // Generate a cache key that includes constraints if present
      let cacheKey = route.path
      if (route.constraints && !Array.isArray(route.constraints)) {
        // Sort constraint keys for consistent cache key generation
        // Type assertion to handle the Record<string, string> case
        const constraintsRecord = route.constraints as Record<string, string>
        const constraintKeys = Object.keys(constraintsRecord).sort()
        const constraintString = constraintKeys
          .map(key => `${key}:${constraintsRecord[key]}`)
          .join('|')
        cacheKey = `${route.path}#${constraintString}`
      }

      // Check if we already have this pattern cached
      if (this.patternCache.has(cacheKey)) {
        route.pattern = this.patternCache.get(cacheKey)!
        return
      }

      // Convert Laravel-style parameters to URLPattern with constraints
      const pattern = this.convertToURLPattern(
        route.path, 
        route.constraints && !Array.isArray(route.constraints) ? route.constraints : undefined
      )

      // Create a URL pattern adapter that matches the expected interface
      const urlPatternAdapter = {
        exec: (url: URL): PatternMatchResult | null => {
          const pathname = url.pathname
          const result = pattern.exec(pathname)
          if (!result)
            return null

          return {
            pathname: {
              groups: result.groups || {},
            },
          }
        },
      }

      // Cache the compiled pattern
      this.patternCache.set(cacheKey, urlPatternAdapter)

      // Assign the pattern to the route
      route.pattern = urlPatternAdapter
    }
  }

  /**
   * Convert Laravel-style route to a simple regex pattern
   * @param path The route path with Laravel-style parameters
   * @param constraints Optional constraints for route parameters
   */
  private convertToURLPattern(
    path: string,
    constraints?: Record<string, string>
  ): { exec: (pathname: string) => { groups?: Record<string, string> } | null } {
    // Convert {param} to named capture groups and {param:pattern} to constrained capture groups
    let regexPattern = path.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (match, name, pattern) => {
      // If there's a constraint for this parameter, use it instead of the default pattern
      if (constraints && constraints[name]) {
        return `(?<${name}>${constraints[name]})`
      }
      // If there's an inline pattern in the route path, use it
      else if (pattern) {
        return `(?<${name}>${pattern})`
      }
      // Default pattern for parameters without constraints
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

        // Update LRU order - move this key to the end (most recently used)
        this.updateCacheLRU(cacheKey)

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
        params: trieMatch.params,
      }
    }

    // Cache the result if enabled
    if (this.options.enableCaching) {
      const cacheKey = `${method}:${path}`
      this.addToCache(cacheKey, result)
    }

    this.updateMatchTime(startTime)
    return result
  }

  /**
   * Add an entry to the cache with LRU eviction if needed
   */
  private addToCache(key: string, value: MatchResult | null): void {
    // If cache is full, evict least recently used item
    if (this.matchCache.size >= this.options.cacheSize && !this.matchCache.has(key)) {
      // Remove least recently used item (first in array)
      if (this.cacheKeys.length > 0) {
        const lruKey = this.cacheKeys.shift()!
        this.matchCache.delete(lruKey)
      }
    }

    // Add new item to cache
    this.matchCache.set(key, value)

    // Update LRU tracking
    this.updateCacheLRU(key)
  }

  /**
   * Update LRU tracking for a cache key
   */
  private updateCacheLRU(key: string): void {
    // Remove key from current position if it exists
    const index = this.cacheKeys.indexOf(key)
    if (index !== -1) {
      this.cacheKeys.splice(index, 1)
    }

    // Add key to end of array (most recently used)
    this.cacheKeys.push(key)
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
   * @param commonPaths Array of paths and methods to pre-cache
   * @param options Optional warming options
   * @param options.force If true, enables caching temporarily even if disabled in compiler options
   * @param options.precompile If true, performs a second match to ensure cache hits are recorded
   * @returns Statistics about the warming operation
   */
  warmCache(
    commonPaths: Array<{ path: string, method: HTTPMethod }>,
    options: { force?: boolean, precompile?: boolean } = {},
  ): { warmedPaths: number, cacheSize: number, hitRate: number } {
    if (!this.options.enableCaching && !options.force) {
      return { warmedPaths: 0, cacheSize: 0, hitRate: 0 }
    }

    // Enable caching temporarily if force is true
    const originalCachingState = this.options.enableCaching
    if (options.force && !this.options.enableCaching) {
      this.options.enableCaching = true
    }

    // Clear existing cache entries for these paths to ensure fresh warming
    if (options.precompile) {
      for (const { path, method } of commonPaths) {
        const cacheKey = `${method}:${path}`
        this.matchCache.delete(cacheKey)
      }
    }

    // Warm the cache by matching each path
    const initialCacheSize = this.matchCache.size
    const initialHits = this.stats.cacheHits
    const initialTotal = this.stats.totalMatches

    for (const { path, method } of commonPaths) {
      // First match will cache the result
      this.match(path, method)

      // Second match should be a cache hit
      if (options.precompile) {
        this.match(path, method)
      }
    }

    // Calculate statistics
    const newCacheEntries = this.matchCache.size - initialCacheSize
    const newHits = this.stats.cacheHits - initialHits
    const newTotal = this.stats.totalMatches - initialTotal
    const hitRate = newTotal > 0 ? newHits / newTotal : 0

    // Restore original caching state if needed
    if (options.force && !originalCachingState) {
      this.options.enableCaching = originalCachingState
    }

    return {
      warmedPaths: newCacheEntries,
      cacheSize: this.matchCache.size,
      hitRate,
    }
  }

  /**
   * Clear all caches and reset statistics
   */
  clear(): void {
    this.trie.clear()
    this.matchCache.clear()
    this.cacheKeys = []
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

    // If routes have different methods, they don't conflict
    if (route1.route.method !== route2.route.method) {
      return false
    }

    // Check if patterns could match the same paths
    return this.patternsOverlap(route1.segments, route2.segments)
  }

  /**
   * Check if two route patterns overlap
   */
  private patternsOverlap(segments1: any[], segments2: any[]): boolean {
    // If segment lengths differ and neither has optional parameters or wildcards,
    // they can't overlap
    const hasOptionalOrWildcard1 = segments1.some(seg => seg.optional || seg.type === 'wildcard')
    const hasOptionalOrWildcard2 = segments2.some(seg => seg.optional || seg.type === 'wildcard')

    if (segments1.length !== segments2.length && !hasOptionalOrWildcard1 && !hasOptionalOrWildcard2) {
      return false
    }

    const maxLength = Math.max(segments1.length, segments2.length)
    let potentialOverlap = true

    for (let i = 0; i < maxLength; i++) {
      const seg1 = i < segments1.length ? segments1[i] : null
      const seg2 = i < segments2.length ? segments2[i] : null

      // If one segment is missing and the other isn't optional, they can't overlap
      if (!seg1 && seg2 && !seg2.optional) {
        return false
      }
      if (!seg2 && seg1 && !seg1.optional) {
        return false
      }

      // If both segments are missing, continue
      if (!seg1 || !seg2) {
        continue
      }

      // Static segments must match exactly
      if (seg1.type === 'static' && seg2.type === 'static') {
        if (seg1.value !== seg2.value) {
          return false
        }
      }
      // Check for parameter constraints
      else if (seg1.type === 'parameter' && seg2.type === 'parameter') {
        // If both have patterns/constraints, check if they're mutually exclusive
        if (seg1.pattern && seg2.pattern) {
          // Simple check: if patterns are different, assume they might overlap
          // A more sophisticated check would analyze the regex patterns
          if (seg1.pattern.toString() === seg2.pattern.toString()) {
            potentialOverlap = true
          }
        }

        // If parameter names are the same, they likely represent the same entity
        // This is a heuristic that helps identify conflicts
        if (seg1.paramName === seg2.paramName) {
          potentialOverlap = true
        }
      }
      // One static, one parameter
      else if (
        (seg1.type === 'static' && seg2.type === 'parameter')
        || (seg1.type === 'parameter' && seg2.type === 'static')
      ) {
        const staticSeg = seg1.type === 'static' ? seg1 : seg2
        const paramSeg = seg1.type === 'parameter' ? seg1 : seg2

        // If parameter has a pattern, check if static value matches the pattern
        if (paramSeg.pattern) {
          if (!paramSeg.pattern.test(staticSeg.value)) {
            return false
          }
        }
      }
      // Wildcard matches anything
      else if (seg1.type === 'wildcard' || seg2.type === 'wildcard') {
        return true
      }
    }

    return potentialOverlap
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

    // Check for ambiguous parameter patterns
    const hasAmbiguousParams = this.hasAmbiguousParameters(route1, route2)
    if (hasAmbiguousParams) {
      return 'ambiguous'
    }

    // Check for similar priority
    if (Math.abs(route1.priority - route2.priority) < 10) {
      return 'ambiguous'
    }

    return 'overlap'
  }

  /**
   * Check if routes have ambiguous parameters
   */
  private hasAmbiguousParameters(route1: CompiledRoute, route2: CompiledRoute): boolean {
    // If routes have different segment counts, they're less likely to be ambiguous
    if (Math.abs(route1.segments.length - route2.segments.length) > 1) {
      return false
    }

    // Count parameter segments in each route
    const paramCount1 = route1.segments.filter(s => s.type === 'parameter').length
    const paramCount2 = route2.segments.filter(s => s.type === 'parameter').length

    // If both routes have parameters in the same positions, they might be ambiguous
    if (paramCount1 > 0 && paramCount2 > 0) {
      const minLength = Math.min(route1.segments.length, route2.segments.length)
      let samePositionParams = 0

      for (let i = 0; i < minLength; i++) {
        if (route1.segments[i].type === 'parameter' && route2.segments[i].type === 'parameter') {
          samePositionParams++

          // If parameters have different constraints, they might still be distinct
          const hasPattern1 = !!route1.segments[i].pattern
          const hasPattern2 = !!route2.segments[i].pattern

          if (hasPattern1 !== hasPattern2) {
            return true // One has constraint, one doesn't = ambiguous
          }
        }
      }

      // If more than half of parameters are in the same positions, likely ambiguous
      return samePositionParams > 0
        && samePositionParams >= Math.min(paramCount1, paramCount2) / 2
    }

    return false
  }
}
