import type { EnhancedRequest, MiddlewareHandler, NextFunction } from '../types'

/**
 * Enhanced middleware pipeline with composition caching, conditional execution,
 * dependency injection, and short-circuiting capabilities
 */

export interface MiddlewareContext {
  request: EnhancedRequest
  route?: any
  skipConditions?: MiddlewareSkipCondition[]
  dependencies?: Map<string, any>
  metadata?: Record<string, any>
}

export interface MiddlewareSkipCondition {
  name: string
  condition: (context: MiddlewareContext) => boolean | Promise<boolean>
}

export interface MiddlewareDependency {
  name: string
  factory: (context: MiddlewareContext) => any | Promise<any>
  singleton?: boolean
  dependencies?: string[]
}

export interface CompiledMiddleware {
  handler: MiddlewareHandler
  name: string
  skipConditions: MiddlewareSkipCondition[]
  dependencies: string[]
  canShortCircuit: boolean
  priority: number
}

export interface MiddlewarePipelineStats {
  totalExecutions: number
  cacheHits: number
  cacheMisses: number
  shortCircuits: number
  skippedMiddleware: number
  averageExecutionTime: number
  dependencyResolutions: number
}

/**
 * Enhanced middleware pipeline with advanced optimization features
 */
export class EnhancedMiddlewarePipeline {
  private compiledPipelines = new Map<string, CompiledMiddleware[]>()
  private dependencyRegistry = new Map<string, MiddlewareDependency>()
  private dependencyCache = new Map<string, any>()
  private skipConditions = new Map<string, MiddlewareSkipCondition[]>()
  private stats: MiddlewarePipelineStats = {
    totalExecutions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    shortCircuits: 0,
    skippedMiddleware: 0,
    averageExecutionTime: 0,
    dependencyResolutions: 0,
  }

  /**
   * Register a dependency that can be injected into middleware
   */
  registerDependency(dependency: MiddlewareDependency): void {
    this.dependencyRegistry.set(dependency.name, dependency)
  }

  /**
   * Register skip conditions for middleware
   */
  registerSkipConditions(middlewareName: string, conditions: MiddlewareSkipCondition[]): void {
    this.skipConditions.set(middlewareName, conditions)
  }

  /**
   * Compile middleware pipeline for a specific route pattern
   * This pre-builds the middleware chain for optimal runtime performance
   */
  compilePipeline(
    routeKey: string,
    middleware: MiddlewareHandler[],
    options: {
      allowShortCircuit?: boolean
      enableConditionalExecution?: boolean
      resolveDependencies?: boolean
    } = {},
  ): void {
    const compiled: CompiledMiddleware[] = []

    for (let i = 0; i < middleware.length; i++) {
      const handler = middleware[i]
      const name = this.getMiddlewareName(handler)

      compiled.push({
        handler,
        name,
        skipConditions: this.skipConditions.get(name) || [],
        dependencies: this.getMiddlewareDependencies(name),
        canShortCircuit: options.allowShortCircuit ?? true,
        priority: i, // Lower number = higher priority
      })
    }

    // Sort by priority (optional optimization)
    compiled.sort((a, b) => a.priority - b.priority)

    this.compiledPipelines.set(routeKey, compiled)
  }

  /**
   * Execute the compiled middleware pipeline with all enhancements
   */
  async execute(
    routeKey: string,
    request: EnhancedRequest,
    finalHandler: () => Promise<Response>,
  ): Promise<Response> {
    const startTime = performance.now()
    this.stats.totalExecutions++

    // Check if we have a compiled pipeline
    const pipeline = this.compiledPipelines.get(routeKey)
    if (!pipeline) {
      this.stats.cacheMisses++
      // Fallback to basic execution
      return finalHandler()
    }

    this.stats.cacheHits++

    // Create middleware context
    const context: MiddlewareContext = {
      request,
      dependencies: new Map(),
      metadata: {},
    }

    // Resolve dependencies upfront
    await this.resolveDependencies(context, pipeline)

    // Execute pipeline with enhancements
    const result = await this.executeEnhancedPipeline(pipeline, context, finalHandler)

    // Update stats
    const executionTime = performance.now() - startTime
    this.stats.averageExecutionTime
      = (this.stats.averageExecutionTime * (this.stats.totalExecutions - 1) + executionTime)
        / this.stats.totalExecutions

    return result
  }

  /**
   * Execute the enhanced pipeline with conditional execution and short-circuiting
   */
  private async executeEnhancedPipeline(
    pipeline: CompiledMiddleware[],
    context: MiddlewareContext,
    finalHandler: () => Promise<Response>,
  ): Promise<Response> {
    let currentIndex = 0

    const next: NextFunction = async (): Promise<Response | null> => {
      // Check if we've reached the end of the pipeline
      if (currentIndex >= pipeline.length) {
        return finalHandler()
      }

      const middleware = pipeline[currentIndex++]

      // Check skip conditions
      if (await this.shouldSkipMiddleware(middleware, context)) {
        this.stats.skippedMiddleware++
        return next() // Skip this middleware and continue
      }

      try {
        // Inject dependencies into request context
        this.injectDependencies(context, middleware.dependencies)

        // Execute middleware
        const result = await middleware.handler(context.request, next)

        // Handle short-circuiting
        if (result instanceof Response && middleware.canShortCircuit) {
          this.stats.shortCircuits++
          return result
        }

        // Continue to next middleware if no response returned
        return result || next()
      }
      catch (error) {
        // Enhanced error handling could be added here
        throw error
      }
    }

    const result = await next()
    return result instanceof Response ? result : new Response('Internal Server Error', { status: 500 })
  }

  /**
   * Check if middleware should be skipped based on conditions
   */
  private async shouldSkipMiddleware(
    middleware: CompiledMiddleware,
    context: MiddlewareContext,
  ): Promise<boolean> {
    for (const condition of middleware.skipConditions) {
      try {
        if (await condition.condition(context)) {
          return true
        }
      }
      catch (error) {
        // Log error but don't skip middleware on condition evaluation failure
        console.warn(`Skip condition '${condition.name}' failed:`, error)
      }
    }
    return false
  }

  /**
   * Resolve all dependencies for the pipeline
   */
  private async resolveDependencies(
    context: MiddlewareContext,
    pipeline: CompiledMiddleware[],
  ): Promise<void> {
    const allDependencies = new Set<string>()

    // Collect all unique dependencies
    for (const middleware of pipeline) {
      for (const dep of middleware.dependencies) {
        allDependencies.add(dep)
      }
    }

    // Resolve dependencies in dependency order
    const resolved = new Set<string>()
    const resolving = new Set<string>()

    for (const depName of allDependencies) {
      await this.resolveDependency(depName, context, resolved, resolving)
    }
  }

  /**
   * Resolve a single dependency with circular dependency detection
   */
  private async resolveDependency(
    name: string,
    context: MiddlewareContext,
    resolved: Set<string>,
    resolving: Set<string>,
  ): Promise<void> {
    if (resolved.has(name))
      return
    if (resolving.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`)
    }

    const dependency = this.dependencyRegistry.get(name)
    if (!dependency) {
      throw new Error(`Dependency '${name}' not found`)
    }

    resolving.add(name)

    // Resolve sub-dependencies first
    if (dependency.dependencies) {
      for (const subDep of dependency.dependencies) {
        await this.resolveDependency(subDep, context, resolved, resolving)
      }
    }

    // Check singleton cache
    if (dependency.singleton && this.dependencyCache.has(name)) {
      context.dependencies!.set(name, this.dependencyCache.get(name))
    }
    else {
      // Create new instance
      const instance = await dependency.factory(context)
      context.dependencies!.set(name, instance)

      if (dependency.singleton) {
        this.dependencyCache.set(name, instance)
      }
    }

    this.stats.dependencyResolutions++
    resolving.delete(name)
    resolved.add(name)
  }

  /**
   * Inject resolved dependencies into request context
   */
  private injectDependencies(context: MiddlewareContext, dependencies: string[]): void {
    for (const depName of dependencies) {
      const instance = context.dependencies!.get(depName)
      if (instance) {
        // Inject into request context for middleware access
        if (!context.request.context) {
          context.request.context = {}
        }
        context.request.context[depName] = instance
      }
    }
  }

  /**
   * Get middleware name for identification
   */
  private getMiddlewareName(handler: MiddlewareHandler): string {
    return handler.name || `anonymous_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get dependencies for a middleware by name
   */
  private getMiddlewareDependencies(name: string): string[] {
    // This could be enhanced to read from decorators or metadata
    return []
  }

  /**
   * Clear compiled pipelines (useful for development/testing)
   */
  clearCache(): void {
    this.compiledPipelines.clear()
    this.dependencyCache.clear()
    this.stats = {
      totalExecutions: 0,
      cacheHits: 0,
      cacheMisses: 0,
      shortCircuits: 0,
      skippedMiddleware: 0,
      averageExecutionTime: 0,
      dependencyResolutions: 0,
    }
  }

  /**
   * Get pipeline performance statistics
   */
  getStats(): MiddlewarePipelineStats {
    return { ...this.stats }
  }

  /**
   * Get cache information
   */
  getCacheInfo(): {
    compiledPipelines: number
    dependencies: number
    cachedDependencies: number
  } {
    return {
      compiledPipelines: this.compiledPipelines.size,
      dependencies: this.dependencyRegistry.size,
      cachedDependencies: this.dependencyCache.size,
    }
  }
}

/**
 * Factory functions for common skip conditions
 */
export const SkipConditions = {
  /**
   * Skip middleware for specific HTTP methods
   */
  skipForMethods: (methods: string[]): MiddlewareSkipCondition => ({
    name: `skip_for_methods_${methods.join('_')}`,
    condition: context => methods.includes(context.request.method),
  }),

  /**
   * Skip middleware for specific paths
   */
  skipForPaths: (paths: string[]): MiddlewareSkipCondition => ({
    name: `skip_for_paths_${paths.length}`,
    condition: (context) => {
      const url = new URL(context.request.url)
      return paths.some(path => url.pathname.startsWith(path))
    },
  }),

  /**
   * Skip middleware based on request headers
   */
  skipForHeaders: (headerConditions: Record<string, string | RegExp>): MiddlewareSkipCondition => ({
    name: `skip_for_headers`,
    condition: (context) => {
      for (const [header, condition] of Object.entries(headerConditions)) {
        const value = context.request.headers.get(header)
        if (!value)
          continue

        if (typeof condition === 'string') {
          if (value === condition)
            return true
        }
        else if (condition instanceof RegExp) {
          if (condition.test(value))
            return true
        }
      }
      return false
    },
  }),

  /**
   * Skip middleware based on user authentication status
   */
  skipForUnauthenticated: (): MiddlewareSkipCondition => ({
    name: 'skip_for_unauthenticated',
    condition: context => !context.request.user,
  }),

  /**
   * Skip middleware based on user roles
   */
  skipForRoles: (roles: string[]): MiddlewareSkipCondition => ({
    name: `skip_for_roles_${roles.join('_')}`,
    condition: (context) => {
      const userRoles = context.request.user?.roles || []
      return !roles.some(role => userRoles.includes(role))
    },
  }),

  /**
   * Skip middleware based on environment
   */
  skipForEnvironment: (environments: string[]): MiddlewareSkipCondition => ({
    name: `skip_for_env_${environments.join('_')}`,
    condition: () => environments.includes(process.env.NODE_ENV || 'development'),
  }),
}

/**
 * Factory functions for common dependencies
 */
export const Dependencies = {
  /**
   * Database connection dependency
   */
  database: (connectionString: string): MiddlewareDependency => ({
    name: 'database',
    factory: async () => {
      // This would typically create a database connection
      return { connectionString, connected: true }
    },
    singleton: true,
  }),

  /**
   * Logger dependency
   */
  logger: (level: string = 'info'): MiddlewareDependency => ({
    name: 'logger',
    factory: () => ({
      level,
      log: (message: string) => console.log(`[${level.toUpperCase()}] ${message}`),
      error: (message: string) => console.error(`[ERROR] ${message}`),
      warn: (message: string) => console.warn(`[WARN] ${message}`),
      debug: (message: string) => console.debug(`[DEBUG] ${message}`),
    }),
    singleton: true,
  }),

  /**
   * Cache service dependency
   */
  cache: (config: { type: 'memory' | 'redis', ttl: number }): MiddlewareDependency => ({
    name: 'cache',
    factory: () => {
      const store = new Map<string, { value: any, expires: number }>()
      return {
        get: (key: string) => {
          const item = store.get(key)
          if (!item || Date.now() > item.expires) {
            store.delete(key)
            return null
          }
          return item.value
        },
        set: (key: string, value: any, ttl = config.ttl) => {
          store.set(key, { value, expires: Date.now() + ttl * 1000 })
        },
        delete: (key: string) => store.delete(key),
        clear: () => store.clear(),
      }
    },
    singleton: true,
  }),

  /**
   * HTTP client dependency
   */
  httpClient: (baseURL?: string): MiddlewareDependency => ({
    name: 'httpClient',
    factory: () => ({
      baseURL,
      get: async (url: string) => fetch(baseURL ? `${baseURL}${url}` : url),
      post: async (url: string, data: any) =>
        fetch(baseURL ? `${baseURL}${url}` : url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
    }),
    singleton: true,
  }),
}
