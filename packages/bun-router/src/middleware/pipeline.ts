import type { EnhancedRequest, MiddlewareHandler, NextFunction } from '../types'

/**
 * Middleware pipeline with composition caching, conditional execution,
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
 * Middleware pipeline with advanced optimization features
 */
export class MiddlewarePipeline {
  private compiledPipelines = new Map<string, CompiledMiddleware[]>()
  private dependencyRegistry = new Map<string, MiddlewareDependency>()
  private singletonInstances = new Map<string, any>()
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
   * Register a dependency for injection into middleware
   */
  registerDependency(dependency: MiddlewareDependency): void {
    this.dependencyRegistry.set(dependency.name, dependency)
  }

  /**
   * Compile middleware chain for a specific route
   */
  compileMiddleware(
    routeKey: string,
    middleware: MiddlewareHandler[],
    skipConditions: MiddlewareSkipCondition[] = [],
  ): void {
    const compiled: CompiledMiddleware[] = []

    for (let i = 0; i < middleware.length; i++) {
      const handler = middleware[i]
      const name = handler.name || `middleware_${i}`

      compiled.push({
        handler,
        name,
        skipConditions: skipConditions.filter(condition => 
          condition.name.includes(name) || condition.name === 'global'
        ),
        dependencies: this.extractDependencies(handler),
        canShortCircuit: this.canShortCircuit(handler),
        priority: i,
      })
    }

    this.compiledPipelines.set(routeKey, compiled)
  }

  /**
   * Execute compiled middleware pipeline
   */
  async execute(
    routeKey: string,
    request: EnhancedRequest,
    finalHandler: () => Promise<Response>,
  ): Promise<Response> {
    const startTime = performance.now()
    this.stats.totalExecutions++

    const pipeline = this.compiledPipelines.get(routeKey)
    if (!pipeline) {
      this.stats.cacheMisses++
      return await finalHandler()
    }

    this.stats.cacheHits++

    const context: MiddlewareContext = {
      request,
      dependencies: new Map(),
      metadata: {},
    }

    // Resolve dependencies
    await this.resolveDependencies(context, pipeline)

    // Execute middleware chain
    let currentIndex = 0

    const next: NextFunction = async (): Promise<Response | null> => {
      if (currentIndex >= pipeline.length) {
        return await finalHandler()
      }

      const middleware = pipeline[currentIndex++]

      // Check skip conditions
      if (await this.shouldSkip(middleware, context)) {
        this.stats.skippedMiddleware++
        return await next()
      }

      // Execute middleware
      const result = await middleware.handler(request, next)

      // Handle short-circuiting
      if (result instanceof Response && middleware.canShortCircuit) {
        this.stats.shortCircuits++
        return result
      }

      return result
    }

    const result = await next()
    const executionTime = performance.now() - startTime
    this.updateAverageExecutionTime(executionTime)

    return result || new Response('Internal Server Error', { status: 500 })
  }

  /**
   * Check if middleware should be skipped
   */
  private async shouldSkip(
    middleware: CompiledMiddleware,
    context: MiddlewareContext,
  ): Promise<boolean> {
    for (const skipCondition of middleware.skipConditions) {
      if (await skipCondition.condition(context)) {
        return true
      }
    }
    return false
  }

  /**
   * Resolve dependencies for middleware
   */
  private async resolveDependencies(
    context: MiddlewareContext,
    pipeline: CompiledMiddleware[],
  ): Promise<void> {
    const allDependencies = new Set<string>()
    
    for (const middleware of pipeline) {
      for (const dep of middleware.dependencies) {
        allDependencies.add(dep)
      }
    }

    for (const depName of allDependencies) {
      const dependency = this.dependencyRegistry.get(depName)
      if (!dependency) continue

      this.stats.dependencyResolutions++

      if (dependency.singleton && this.singletonInstances.has(depName)) {
        context.dependencies!.set(depName, this.singletonInstances.get(depName))
      } else {
        const instance = await dependency.factory(context)
        context.dependencies!.set(depName, instance)
        
        if (dependency.singleton) {
          this.singletonInstances.set(depName, instance)
        }
      }
    }
  }

  /**
   * Extract dependency names from middleware function
   */
  private extractDependencies(handler: MiddlewareHandler): string[] {
    // Simple dependency extraction based on function parameters
    const funcStr = handler.toString()
    const dependencies: string[] = []
    
    // Look for common dependency patterns
    if (funcStr.includes('database') || funcStr.includes('db')) dependencies.push('database')
    if (funcStr.includes('logger') || funcStr.includes('log')) dependencies.push('logger')
    if (funcStr.includes('cache')) dependencies.push('cache')
    if (funcStr.includes('httpClient') || funcStr.includes('http')) dependencies.push('httpClient')
    
    return dependencies
  }

  /**
   * Check if middleware can short-circuit the pipeline
   */
  private canShortCircuit(handler: MiddlewareHandler): boolean {
    const funcStr = handler.toString()
    return funcStr.includes('return') && funcStr.includes('Response')
  }

  /**
   * Update average execution time
   */
  private updateAverageExecutionTime(executionTime: number): void {
    const totalTime = this.stats.averageExecutionTime * (this.stats.totalExecutions - 1)
    this.stats.averageExecutionTime = (totalTime + executionTime) / this.stats.totalExecutions
  }

  /**
   * Get pipeline statistics
   */
  getStats(): MiddlewarePipelineStats {
    return { ...this.stats }
  }

  /**
   * Clear compiled pipelines and reset stats
   */
  clear(): void {
    this.compiledPipelines.clear()
    this.singletonInstances.clear()
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
}

/**
 * Skip condition factory functions
 */
export const SkipConditions = {
  skipForMethods: (methods: string[]): MiddlewareSkipCondition => ({
    name: `skip_for_methods_${methods.join('_')}`,
    condition: (context) => methods.includes(context.request.method),
  }),

  skipForPaths: (paths: string[]): MiddlewareSkipCondition => ({
    name: `skip_for_paths_${paths.join('_').replace(/\//g, '_')}`,
    condition: (context) => {
      const url = new URL(context.request.url)
      return paths.some(path => url.pathname.startsWith(path))
    },
  }),

  skipForHeaders: (headers: Record<string, string>): MiddlewareSkipCondition => ({
    name: `skip_for_headers_${Object.keys(headers).join('_')}`,
    condition: (context) => {
      return Object.entries(headers).some(([key, value]) => 
        context.request.headers.get(key) === value
      )
    },
  }),

  skipForRoles: (roles: string[]): MiddlewareSkipCondition => ({
    name: `skip_for_roles_${roles.join('_')}`,
    condition: (context) => {
      const userRoles = context.request.user?.roles || []
      return !roles.some(role => userRoles.includes(role))
    },
  }),

  skipForEnvironment: (environments: string[]): MiddlewareSkipCondition => ({
    name: `skip_for_env_${environments.join('_')}`,
    condition: () => {
      const env = process.env.NODE_ENV || 'development'
      return environments.includes(env)
    },
  }),
}

/**
 * Dependency factory functions
 */
export const Dependencies = {
  database: (connectionString?: string): MiddlewareDependency => ({
    name: 'database',
    factory: async () => {
      // Mock database connection
      return {
        query: async (sql: string) => ({ rows: [] }),
        close: async () => {},
        connectionString: connectionString || 'mock://database',
      }
    },
    singleton: true,
  }),

  logger: (level: string = 'info'): MiddlewareDependency => ({
    name: 'logger',
    factory: () => ({
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      error: (msg: string) => console.error(`[ERROR] ${msg}`),
      warn: (msg: string) => console.warn(`[WARN] ${msg}`),
      debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
      level,
    }),
    singleton: true,
  }),

  cache: (maxSize: number = 1000): MiddlewareDependency => ({
    name: 'cache',
    factory: () => {
      const cache = new Map()
      return {
        get: (key: string) => cache.get(key),
        set: (key: string, value: any) => {
          if (cache.size >= maxSize) {
            const firstKey = cache.keys().next().value
            cache.delete(firstKey)
          }
          cache.set(key, value)
        },
        delete: (key: string) => cache.delete(key),
        clear: () => cache.clear(),
        size: () => cache.size,
      }
    },
    singleton: true,
  }),

  httpClient: (baseURL?: string): MiddlewareDependency => ({
    name: 'httpClient',
    factory: () => ({
      get: async (url: string) => fetch(baseURL ? `${baseURL}${url}` : url),
      post: async (url: string, data: any) => 
        fetch(baseURL ? `${baseURL}${url}` : url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      put: async (url: string, data: any) => 
        fetch(baseURL ? `${baseURL}${url}` : url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      delete: async (url: string) => 
        fetch(baseURL ? `${baseURL}${url}` : url, { method: 'DELETE' }),
    }),
    singleton: true,
  }),
}

/**
 * Middleware factory functions
 */
export const MiddlewareFactory = {
  auth: (options: { secret?: string; skipPaths?: string[] } = {}): MiddlewareHandler => {
    return async (req, next) => {
      const url = new URL(req.url)
      if (options.skipPaths?.some(path => url.pathname.startsWith(path))) {
        return await next()
      }

      const token = req.headers.get('Authorization')?.replace('Bearer ', '')
      if (!token) {
        return new Response('Unauthorized', { status: 401 })
      }

      // Mock JWT verification
      try {
        ;(req as any).user = { id: '123', roles: ['user'] }
        return await next()
      } catch {
        return new Response('Invalid token', { status: 401 })
      }
    }
  },

  rateLimit: (options: { maxRequests: number; windowMs: number }): MiddlewareHandler => {
    const requests = new Map<string, number[]>()
    
    return async (req, next) => {
      const ip = req.headers.get('x-forwarded-for') || 'unknown'
      const now = Date.now()
      const windowStart = now - options.windowMs
      
      if (!requests.has(ip)) {
        requests.set(ip, [])
      }
      
      const userRequests = requests.get(ip)!
      const recentRequests = userRequests.filter(time => time > windowStart)
      
      if (recentRequests.length >= options.maxRequests) {
        return new Response('Too Many Requests', { status: 429 })
      }
      
      recentRequests.push(now)
      requests.set(ip, recentRequests)
      
      return await next()
    }
  },

  cors: (options: { origin?: string; methods?: string[] } = {}): MiddlewareHandler => {
    return async (req, next) => {
      const response = await next()
      
      if (response) {
        const headers = new Headers(response.headers)
        headers.set('Access-Control-Allow-Origin', options.origin || '*')
        headers.set('Access-Control-Allow-Methods', options.methods?.join(', ') || 'GET, POST, PUT, DELETE')
        headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }
      
      return response
    }
  },

  logging: (options: { level?: string } = {}): MiddlewareHandler => {
    return async (req, next) => {
      const start = performance.now()
      const url = new URL(req.url)
      
      console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`)
      
      const response = await next()
      const duration = performance.now() - start
      
      if (response) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname} - ${response.status} (${duration.toFixed(2)}ms)`)
      }
      
      return response
    }
  },
}

/**
 * Global middleware pipeline instance
 */
export const globalMiddlewarePipeline = new MiddlewarePipeline()
