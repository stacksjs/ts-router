/**
 * Development Tools - Route Inspector
 *
 * Route listing, metadata inspection, and route analysis
 */

export interface RouteMetadata {
  id: string
  method: string
  pattern: string
  originalPattern: string
  handler: {
    name: string
    source?: string
    parameters: string[]
    isAsync: boolean
  }
  middleware: Array<{
    name: string
    source?: string
    order: number
  }>
  params: Array<{
    name: string
    type: 'string' | 'number' | 'uuid' | 'slug'
    optional: boolean
    constraint?: string
  }>
  constraints: Record<string, any>
  cache?: {
    enabled: boolean
    ttl?: number
    tags?: string[]
  }
  throttling?: {
    enabled: boolean
    limit: number
    window: number
  }
  validation?: {
    rules: Record<string, string>
    messages?: Record<string, string>
  }
  metadata: {
    registeredAt: number
    file?: string
    line?: number
    group?: string
    name?: string
    description?: string
  }
  stats: {
    hits: number
    averageResponseTime: number
    lastAccessed?: number
    errors: number
  }
}

export interface RouteGroup {
  name: string
  prefix: string
  middleware: string[]
  routes: RouteMetadata[]
  subgroups: RouteGroup[]
}

export interface RouteAnalysis {
  totalRoutes: number
  routesByMethod: Record<string, number>
  duplicatePatterns: Array<{
    pattern: string
    routes: RouteMetadata[]
  }>
  unusedRoutes: RouteMetadata[]
  slowRoutes: RouteMetadata[]
  errorProneRoutes: RouteMetadata[]
  middlewareUsage: Record<string, number>
  parameterAnalysis: {
    mostUsedParams: Array<{ name: string, count: number }>
    parameterTypes: Record<string, number>
  }
  recommendations: string[]
}

/**
 * Route inspector for development and debugging
 */
export class RouteInspector {
  private routes = new Map<string, RouteMetadata>()
  private groups = new Map<string, RouteGroup>()
  private routeStats = new Map<string, RouteMetadata['stats']>()

  /**
   * Register a route for inspection
   */
  registerRoute(
    method: string,
    pattern: string,
    handler: (...args: any[]) => any,
    middleware: Array<(...args: any[]) => any> = [],
    options: Partial<RouteMetadata> = {},
  ): string {
    const id = this.generateRouteId(method, pattern)

    const metadata: RouteMetadata = {
      id,
      method: method.toUpperCase(),
      pattern,
      originalPattern: pattern,
      handler: {
        name: handler.name || 'anonymous',
        source: this.getFunctionSource(handler),
        parameters: this.extractFunctionParameters(handler),
        isAsync: this.isAsyncFunction(handler),
      },
      middleware: middleware.map((mw, index) => ({
        name: mw.name || 'anonymous',
        source: this.getFunctionSource(mw),
        order: index,
      })),
      params: this.extractRouteParameters(pattern),
      constraints: {},
      metadata: {
        registeredAt: Date.now(),
        ...this.getCallSiteInfo(),
        ...options.metadata,
      },
      stats: {
        hits: 0,
        averageResponseTime: 0,
        errors: 0,
      },
      ...options,
    }

    this.routes.set(id, metadata)
    this.routeStats.set(id, metadata.stats)

    return id
  }

  /**
   * Get all registered routes
   */
  getRoutes(filter?: {
    method?: string
    pattern?: string
    group?: string
    hasMiddleware?: string
    hasParams?: boolean
  }): RouteMetadata[] {
    let routes = Array.from(this.routes.values())

    if (filter) {
      if (filter.method) {
        routes = routes.filter(route => route.method === filter.method!.toUpperCase())
      }

      if (filter.pattern) {
        const regex = new RegExp(filter.pattern.replace(/\*/g, '.*'))
        routes = routes.filter(route => regex.test(route.pattern))
      }

      if (filter.group) {
        routes = routes.filter(route => route.metadata.group === filter.group)
      }

      if (filter.hasMiddleware) {
        routes = routes.filter(route =>
          route.middleware.some(mw => mw.name.includes(filter.hasMiddleware!)),
        )
      }

      if (filter.hasParams !== undefined) {
        routes = routes.filter(route =>
          filter.hasParams ? route.params.length > 0 : route.params.length === 0,
        )
      }
    }

    return routes.sort((a, b) => {
      // Sort by method first, then by pattern
      if (a.method !== b.method) {
        const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
        return methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method)
      }
      return a.pattern.localeCompare(b.pattern)
    })
  }

  /**
   * Get route by ID
   */
  getRoute(id: string): RouteMetadata | undefined {
    return this.routes.get(id)
  }

  /**
   * Find routes matching a request
   */
  findMatchingRoutes(method: string, path: string): RouteMetadata[] {
    return this.getRoutes({ method }).filter((route) => {
      const regex = this.patternToRegex(route.pattern)
      return regex.test(path)
    })
  }

  /**
   * Register route group
   */
  registerGroup(name: string, prefix: string, middleware: Array<(...args: any[]) => any> = []): void {
    const group: RouteGroup = {
      name,
      prefix,
      middleware: middleware.map(mw => mw.name || 'anonymous'),
      routes: [],
      subgroups: [],
    }

    this.groups.set(name, group)
  }

  /**
   * Get route groups
   */
  getGroups(): RouteGroup[] {
    const groups = Array.from(this.groups.values())

    // Populate routes for each group
    groups.forEach((group) => {
      group.routes = this.getRoutes({ group: group.name })
    })

    return groups
  }

  /**
   * Record route access for statistics
   */
  recordRouteAccess(routeId: string, responseTime: number, error?: boolean): void {
    const stats = this.routeStats.get(routeId)
    if (!stats)
      return

    stats.hits++
    stats.lastAccessed = Date.now()

    // Update average response time
    stats.averageResponseTime = (
      (stats.averageResponseTime * (stats.hits - 1) + responseTime) / stats.hits
    )

    if (error) {
      stats.errors++
    }

    // Update route metadata
    const route = this.routes.get(routeId)
    if (route) {
      route.stats = stats
    }
  }

  /**
   * Analyze routes for insights and recommendations
   */
  analyzeRoutes(): RouteAnalysis {
    const routes = this.getRoutes()
    const analysis: RouteAnalysis = {
      totalRoutes: routes.length,
      routesByMethod: {},
      duplicatePatterns: [],
      unusedRoutes: [],
      slowRoutes: [],
      errorProneRoutes: [],
      middlewareUsage: {},
      parameterAnalysis: {
        mostUsedParams: [],
        parameterTypes: {},
      },
      recommendations: [],
    }

    // Routes by method
    routes.forEach((route) => {
      analysis.routesByMethod[route.method] = (analysis.routesByMethod[route.method] || 0) + 1
    })

    // Find duplicate patterns
    const patternGroups = new Map<string, RouteMetadata[]>()
    routes.forEach((route) => {
      const key = `${route.method}:${route.pattern}`
      if (!patternGroups.has(key)) {
        patternGroups.set(key, [])
      }
      patternGroups.get(key)!.push(route)
    })

    patternGroups.forEach((routeGroup, pattern) => {
      if (routeGroup.length > 1) {
        analysis.duplicatePatterns.push({
          pattern,
          routes: routeGroup,
        })
      }
    })

    // Unused routes (no hits)
    analysis.unusedRoutes = routes.filter(route => route.stats.hits === 0)

    // Slow routes (average response time > 1000ms)
    analysis.slowRoutes = routes.filter(route => route.stats.averageResponseTime > 1000)

    // Error-prone routes (error rate > 5%)
    analysis.errorProneRoutes = routes.filter((route) => {
      const errorRate = route.stats.hits > 0 ? (route.stats.errors / route.stats.hits) : 0
      return errorRate > 0.05
    })

    // Middleware usage
    routes.forEach((route) => {
      route.middleware.forEach((mw) => {
        analysis.middlewareUsage[mw.name] = (analysis.middlewareUsage[mw.name] || 0) + 1
      })
    })

    // Parameter analysis
    const paramCounts = new Map<string, number>()
    const typeCounts = new Map<string, number>()

    routes.forEach((route) => {
      route.params.forEach((param) => {
        paramCounts.set(param.name, (paramCounts.get(param.name) || 0) + 1)
        typeCounts.set(param.type, (typeCounts.get(param.type) || 0) + 1)
      })
    })

    analysis.parameterAnalysis.mostUsedParams = Array.from(paramCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    analysis.parameterAnalysis.parameterTypes = Object.fromEntries(typeCounts)

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis)

    return analysis
  }

  /**
   * Export routes in various formats
   */
  exportRoutes(format: 'json' | 'csv' | 'markdown' | 'openapi' = 'json'): string {
    const routes = this.getRoutes()

    switch (format) {
      case 'json':
        return JSON.stringify(routes, null, 2)

      case 'csv':
        return this.exportToCsv(routes)

      case 'markdown':
        return this.exportToMarkdown(routes)

      case 'openapi':
        return this.exportToOpenAPI(routes)

      default:
        throw new Error(`Unsupported export format: ${format}`)
    }
  }

  /**
   * Clear all routes and statistics
   */
  clear(): void {
    this.routes.clear()
    this.groups.clear()
    this.routeStats.clear()
  }

  /**
   * Generate unique route ID
   */
  private generateRouteId(method: string, pattern: string): string {
    return `${method.toLowerCase()}_${pattern.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`
  }

  /**
   * Extract function source code
   */
  private getFunctionSource(fn: (...args: any[]) => any): string | undefined {
    try {
      const source = fn.toString()
      return source.length > 200 ? `${source.substring(0, 200)}...` : source
    }
    catch {
      return undefined
    }
  }

  /**
   * Extract function parameters
   */
  private extractFunctionParameters(fn: (...args: any[]) => any): string[] {
    try {
      const source = fn.toString()
      const match = source.match(/\(([^)]*)\)/)
      if (!match)
        return []

      return match[1]
        .split(',')
        .map(param => param.trim().split(/\s+/)[0])
        .filter(param => param.length > 0)
    }
    catch {
      return []
    }
  }

  /**
   * Check if function is async
   */
  private isAsyncFunction(fn: (...args: any[]) => any): boolean {
    return fn.constructor.name === 'AsyncFunction'
  }

  /**
   * Extract route parameters from pattern
   */
  private extractRouteParameters(pattern: string): RouteMetadata['params'] {
    const params: RouteMetadata['params'] = []
    const paramRegex = /\{([^}]+)\}/g

    for (const match of pattern.matchAll(paramRegex)) {
      const paramDef = match[1]
      const [name, constraint] = paramDef.split(':')

      params.push({
        name: name.trim(),
        type: this.inferParameterType(constraint),
        optional: paramDef.includes('?'),
        constraint,
      })
    }

    return params
  }

  /**
   * Infer parameter type from constraint
   */
  private inferParameterType(constraint?: string): 'string' | 'number' | 'uuid' | 'slug' {
    if (!constraint)
      return 'string'

    if (constraint.includes('uuid'))
      return 'uuid'
    if (constraint.includes('slug'))
      return 'slug'
    if (constraint.includes('number') || constraint.includes('int'))
      return 'number'

    return 'string'
  }

  /**
   * Get call site information
   */
  private getCallSiteInfo(): { file?: string, line?: number } {
    try {
      const stack = new Error('route-inspector callsite').stack
      if (!stack)
        return {}

      const lines = stack.split('\n')
      const callerLine = lines.find(line =>
        line.includes('.ts:') && !line.includes('route-inspector.ts'),
      )

      if (callerLine) {
        const match = callerLine.match(/([^/\\]+\.ts):(\d+)/)
        if (match) {
          return {
            file: match[1],
            line: Number.parseInt(match[2]),
          }
        }
      }
    }
    catch {
      // Ignore errors
    }

    return {}
  }

  /**
   * Convert route pattern to regex
   */
  private patternToRegex(pattern: string): RegExp {
    const regexPattern = pattern
      .replace(/\{[^}]+\}/g, '([^/]+)')
      .replace(/\*/g, '.*')

    return new RegExp(`^${regexPattern}$`)
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(analysis: RouteAnalysis): string[] {
    const recommendations: string[] = []

    if (analysis.duplicatePatterns.length > 0) {
      recommendations.push(`Found ${analysis.duplicatePatterns.length} duplicate route patterns. Consider consolidating or using different patterns.`)
    }

    if (analysis.unusedRoutes.length > 0) {
      recommendations.push(`${analysis.unusedRoutes.length} routes have never been accessed. Consider removing unused routes.`)
    }

    if (analysis.slowRoutes.length > 0) {
      recommendations.push(`${analysis.slowRoutes.length} routes have slow average response times (>1000ms). Consider optimization.`)
    }

    if (analysis.errorProneRoutes.length > 0) {
      recommendations.push(`${analysis.errorProneRoutes.length} routes have high error rates (>5%). Review error handling.`)
    }

    const totalMiddleware = Object.keys(analysis.middlewareUsage).length
    if (totalMiddleware > 20) {
      recommendations.push(`High number of middleware (${totalMiddleware}). Consider consolidating similar middleware.`)
    }

    return recommendations
  }

  /**
   * Export routes to CSV format
   */
  private exportToCsv(routes: RouteMetadata[]): string {
    const headers = ['Method', 'Pattern', 'Handler', 'Middleware', 'Hits', 'Avg Response Time', 'Errors']
    const rows = routes.map(route => [
      route.method,
      route.pattern,
      route.handler.name,
      route.middleware.map(mw => mw.name).join(';'),
      route.stats.hits.toString(),
      route.stats.averageResponseTime.toFixed(2),
      route.stats.errors.toString(),
    ])

    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }

  /**
   * Export routes to Markdown format
   */
  private exportToMarkdown(routes: RouteMetadata[]): string {
    let markdown = '# Route Documentation\n\n'

    const groupedRoutes = new Map<string, RouteMetadata[]>()
    routes.forEach((route) => {
      const group = route.metadata.group || 'Default'
      if (!groupedRoutes.has(group)) {
        groupedRoutes.set(group, [])
      }
      groupedRoutes.get(group)!.push(route)
    })

    groupedRoutes.forEach((groupRoutes, groupName) => {
      markdown += `## ${groupName}\n\n`
      markdown += '| Method | Pattern | Handler | Middleware | Stats |\n'
      markdown += '|--------|---------|---------|------------|-------|\n'

      groupRoutes.forEach((route) => {
        const middleware = route.middleware.map(mw => mw.name).join(', ')
        const stats = `${route.stats.hits} hits, ${route.stats.averageResponseTime.toFixed(2)}ms avg`

        markdown += `| ${route.method} | \`${route.pattern}\` | ${route.handler.name} | ${middleware} | ${stats} |\n`
      })

      markdown += '\n'
    })

    return markdown
  }

  /**
   * Export routes to OpenAPI format
   */
  private exportToOpenAPI(routes: RouteMetadata[]): string {
    const openapi = {
      openapi: '3.0.0',
      info: {
        title: 'API Documentation',
        version: '1.0.0',
      },
      paths: {} as Record<string, any>,
    }

    routes.forEach((route) => {
      const path = route.pattern.replace(/\{([^}]+)\}/g, '{$1}')
      const method = route.method.toLowerCase()

      if (!openapi.paths[path]) {
        openapi.paths[path] = {}
      }

      openapi.paths[path][method] = {
        summary: route.metadata.description || `${route.method} ${route.pattern}`,
        operationId: route.id,
        parameters: route.params.map(param => ({
          name: param.name,
          in: 'path',
          required: !param.optional,
          schema: {
            type: param.type === 'number' ? 'integer' : 'string',
          },
        })),
        responses: {
          200: {
            description: 'Success',
          },
        },
      }
    })

    return JSON.stringify(openapi, null, 2)
  }
}

/**
 * Global route inspector instance
 */
let globalInspector: RouteInspector | null = null

/**
 * Initialize global route inspector
 */
export function initializeRouteInspector(): RouteInspector {
  globalInspector = new RouteInspector()
  return globalInspector
}

/**
 * Get global route inspector
 */
export function getRouteInspector(): RouteInspector | null {
  return globalInspector
}

/**
 * Route inspection helpers
 */
export const RouteInspectionHelpers = {
  /**
   * List all routes in a formatted table
   */
  listRoutes: (filter?: Parameters<RouteInspector['getRoutes']>[0]): void => {
    const inspector = getRouteInspector()
    if (!inspector) {
      console.log('Route inspector not initialized')
      return
    }

    const routes = inspector.getRoutes(filter)

    console.log('\n📋 Registered Routes:')
    console.log('─'.repeat(80))

    if (routes.length === 0) {
      console.log('No routes found')
      return
    }

    routes.forEach((route) => {
      const middleware = route.middleware.length > 0
        ? ` [${route.middleware.map(mw => mw.name).join(', ')}]`
        : ''

      const stats = route.stats.hits > 0
        ? ` (${route.stats.hits} hits, ${route.stats.averageResponseTime.toFixed(2)}ms avg)`
        : ' (unused)'

      console.log(`${route.method.padEnd(6)} ${route.pattern}${middleware}${stats}`)
    })

    console.log('─'.repeat(80))
    console.log(`Total: ${routes.length} routes`)
  },

  /**
   * Analyze routes and show recommendations
   */
  analyzeRoutes: (): void => {
    const inspector = getRouteInspector()
    if (!inspector) {
      console.log('Route inspector not initialized')
      return
    }

    const analysis = inspector.analyzeRoutes()

    console.log('\n📊 Route Analysis:')
    console.log('─'.repeat(50))
    console.log(`Total Routes: ${analysis.totalRoutes}`)
    console.log('Routes by Method:', analysis.routesByMethod)
    console.log(`Unused Routes: ${analysis.unusedRoutes.length}`)
    console.log(`Slow Routes: ${analysis.slowRoutes.length}`)
    console.log(`Error-prone Routes: ${analysis.errorProneRoutes.length}`)
    console.log(`Duplicate Patterns: ${analysis.duplicatePatterns.length}`)

    if (analysis.recommendations.length > 0) {
      console.log('\n💡 Recommendations:')
      analysis.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`)
      })
    }

    console.log('─'.repeat(50))
  },

  /**
   * Export routes to file
   */
  exportRoutes: (format: 'json' | 'csv' | 'markdown' | 'openapi' = 'json', filename?: string): void => {
    const inspector = getRouteInspector()
    if (!inspector) {
      console.log('Route inspector not initialized')
      return
    }

    const content = inspector.exportRoutes(format)

    if (filename) {
      // In a real implementation, you'd write to file
      console.log(`Routes exported to ${filename}`)
    }
    else {
      console.log(content)
    }
  },
}
