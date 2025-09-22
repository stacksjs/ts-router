import type { Server } from 'bun'
import type {
  ActionHandler,
  EnhancedRequest,
  MiddlewareHandler,
  Route,
  RouteGroup,
  RouteHandler,
  RouterConfig,
  WebSocketConfig,
} from '../types'
import { createRateLimitMiddleware, parseThrottleString } from '../routing/route-throttling'

// Re-export types for module augmentation
export type {
  ActionHandler,
  MiddlewareHandler,
  Route,
  RouteGroup,
  RouteHandler,
  RouterConfig,
  WebSocketConfig,
}

// Middleware condition type
export type MiddlewareCondition = (req: EnhancedRequest) => boolean

/**
 * Unified Router class with advanced middleware patterns
 */
export class Router {
  routes: Route[] = []
  currentGroup: RouteGroup | null = null
  globalMiddleware: MiddlewareHandler[] = []
  namedRoutes: Map<string, Route> = new Map()
  fallbackHandler: ActionHandler | null = null
  patterns: Map<string, string> = new Map()
  currentDomain: string | null = null
  domains: Record<string, Route[]> = {}
  serverInstance: Server | null = null
  wsConfig: WebSocketConfig | null = null
  errorHandler: ((error: Error) => Response | Promise<Response>) | null = null
  templateCache: Map<string, string> = new Map<string, string>()
  routeCache: Map<string, { route: Route, params: Record<string, string> }> = new Map()
  staticRoutes: Map<string, Map<string, Route>> = new Map()
  precompiledPatterns: Map<string, RegExp> = new Map()
  domainPatternCache: Map<string, RegExp> = new Map()
  routeCompiler: any = null // Will be initialized by optimized route matching

  // Advanced middleware features
  private middlewareGroups: Map<string, MiddlewareHandler[]> = new Map()
  private namedMiddleware: Map<string, (params?: string) => MiddlewareHandler> = new Map()
  private conditionalMiddleware: Array<{ condition: MiddlewareCondition, middleware: MiddlewareHandler[] }> = []

  config: RouterConfig = {
    verbose: false,
    routesPath: 'routes',
    apiRoutesPath: 'routes/api.ts',
    webRoutesPath: 'routes/web.ts',
    apiPrefix: '/api',
    webPrefix: '',
    defaultMiddleware: {
      api: [],
      web: [],
    },
  }

  constructor(config: Partial<RouterConfig> = {}) {
    this.routes = []
    this.config = { ...this.config, ...config }
    this.initializeDefaultMiddleware()
  }

  /**
   * Initialize default named middleware
   */
  private initializeDefaultMiddleware(): void {
    // Auth middleware
    this.namedMiddleware.set('auth', () => async (req: EnhancedRequest, next: any) => {
      const token = req.headers.get('authorization')?.replace('Bearer ', '')
      if (!token) {
        return new Response('Unauthorized', { status: 401 })
      }
      return await next()
    })

    // Throttle middleware with parameters
    this.namedMiddleware.set('throttle', (params?: string) => {
      const config = params ? parseThrottleString(params) : { maxRequests: 60, windowMs: 60000 }
      return createRateLimitMiddleware({
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        keyGenerator: (req: EnhancedRequest) => req.headers.get('x-forwarded-for') || 'anonymous',
      })
    })

    // CORS middleware
    this.namedMiddleware.set('cors', () => async (req: EnhancedRequest, next: any) => {
      const response = await next()
      response.headers.set('Access-Control-Allow-Origin', '*')
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      return response
    })
  }

  /**
   * Register a middleware group
   */
  middlewareGroup(name: string, middlewareNames: string[]): this {
    const middlewareHandlers: MiddlewareHandler[] = []

    for (const middlewareName of middlewareNames) {
      const [name, params] = middlewareName.split(':')
      const middlewareFactory = this.namedMiddleware.get(name)

      if (middlewareFactory) {
        middlewareHandlers.push(middlewareFactory(params))
      }
    }

    this.middlewareGroups.set(name, middlewareHandlers)
    return this
  }

  /**
   * Apply middleware group to routes
   */
  middlewareGroupRoutes(name: string): RouteGroupBuilder {
    const middlewareHandlers = this.middlewareGroups.get(name) || []
    return new RouteGroupBuilder(this, middlewareHandlers)
  }

  /**
   * Conditional middleware execution
   */
  when(condition: MiddlewareCondition): ConditionalBuilder {
    return new ConditionalBuilder(this, condition)
  }

  /**
   * Apply middleware with parameters
   */
  middleware(middlewareName: string): MiddlewareBuilder {
    const [name, params] = middlewareName.split(':')
    const middlewareFactory = this.namedMiddleware.get(name)

    if (!middlewareFactory) {
      throw new Error(`Unknown middleware: ${name}`)
    }

    const middlewareHandler = middlewareFactory(params)
    return new MiddlewareBuilder(this, [middlewareHandler])
  }

  /**
   * Get the server instance
   */
  getServer(): Server | null {
    return this.serverInstance
  }

  /**
   * Extend the router with custom methods
   */
  extend(methods: Record<string, (...args: any[]) => any>): Router {
    for (const [name, method] of Object.entries(methods)) {
      if (typeof method === 'function') {
        // @ts-expect-error - dynamically extending the object
        this[name] = method.bind(this)
      }
    }
    return this
  }

  /**
   * Invalidate route caches
   */
  invalidateCache(): void {
    this.routeCache.clear()
  }

  // Core HTTP Methods
  async get(_path: string, _handler: RouteHandler, _middlewareOrGroup?: string | MiddlewareHandler | (string | MiddlewareHandler)[], _routeName?: string, _middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('HTTP methods not implemented - use router extensions')
  }

  async post(_path: string, _handler: RouteHandler, _middlewareOrGroup?: string | MiddlewareHandler | (string | MiddlewareHandler)[], _routeName?: string, _middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('HTTP methods not implemented - use router extensions')
  }

  async put(_path: string, _handler: RouteHandler, _middlewareOrGroup?: string | MiddlewareHandler | (string | MiddlewareHandler)[], _routeName?: string, _middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('HTTP methods not implemented - use router extensions')
  }

  async patch(_path: string, _handler: RouteHandler, _middlewareOrGroup?: string | MiddlewareHandler | (string | MiddlewareHandler)[], _routeName?: string, _middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('HTTP methods not implemented - use router extensions')
  }

  async delete(_path: string, _handler: RouteHandler, _middlewareOrGroup?: string | MiddlewareHandler | (string | MiddlewareHandler)[], _routeName?: string, _middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('HTTP methods not implemented - use router extensions')
  }

  async head(_path: string, _handler: RouteHandler, _middlewareOrGroup?: string | MiddlewareHandler | (string | MiddlewareHandler)[], _routeName?: string, _middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('HTTP methods not implemented - use router extensions')
  }

  async options(_path: string, _handler: RouteHandler, _middlewareOrGroup?: string | MiddlewareHandler | (string | MiddlewareHandler)[], _routeName?: string, _middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('HTTP methods not implemented - use router extensions')
  }

  // Server Methods
  async serve(_options?: { port?: number, hostname?: string }): Promise<Server> {
    throw new Error('Server methods not implemented - use router extensions')
  }

  async handleRequest(_request: Request): Promise<Response> {
    throw new Error('Server methods not implemented - use router extensions')
  }

  // Middleware
  use(_middleware: MiddlewareHandler | string): Router {
    throw new Error('Middleware methods not implemented - use router extensions')
  }

  // Route Groups
  group(_options: { prefix?: string, middleware?: (string | MiddlewareHandler)[] }, _callback: () => void): Router {
    throw new Error('Route group methods not implemented - use router extensions')
  }

  // Health Check
  async health(): Promise<Router> {
    throw new Error('Health check methods not implemented - use router extensions')
  }

  // Additional Route Methods
  async match(_methods: string[], _path: string, _handler: RouteHandler, _middleware?: string | MiddlewareHandler | (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('Route methods not implemented - use router extensions')
  }

  async any(_path: string, _handler: RouteHandler, _middleware?: string | MiddlewareHandler | (string | MiddlewareHandler)[]): Promise<Router> {
    throw new Error('Route methods not implemented - use router extensions')
  }

  // Route Constraints
  where(_constraints: Record<string, string>): Router {
    throw new Error('Route constraint methods not implemented - use router extensions')
  }

  whereNumber(_param: string): Router {
    throw new Error('Route constraint methods not implemented - use router extensions')
  }

  // Named Routes
  route(_name: string, _params?: Record<string, any>): string {
    throw new Error('Named route methods not implemented - use router extensions')
  }

  // Redirects

  // Streaming Methods
  async stream(_path: string, _generator: any, _options?: any): Promise<void> {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  async streamSSE(_path: string, _generator: any, _options?: any): Promise<void> {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  async streamDirect(_path: string, _handler: any, _options?: any): Promise<void> {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  async streamBuffered(_path: string, _handler: any, _options?: any): Promise<void> {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  streamFile(_path: string, _options?: any): Response {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  async streamFileWithRanges(_path: string, _req: Request): Promise<Response> {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  transformStream(_transform: any, _options?: any): (req: Request) => Response {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  streamResponse(_generator: any, _options?: any): Response {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  streamAsyncIterator(_iterator: AsyncIterable<any>, _options?: any): Response {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  // Model Binding Methods
  modelRegistry: any = null
  modelNotFoundHandler: any = null

  bindModel(_name: string, _resolver: any): Router {
    throw new Error('Model binding methods not implemented - use router extensions')
  }

  onModelNotFound(_handler: any): Router {
    throw new Error('Model binding methods not implemented - use router extensions')
  }

  async getWithBinding(_path: string, _handler: any, _options?: any): Promise<Router> {
    throw new Error('Model binding methods not implemented - use router extensions')
  }

  async postWithBinding(_path: string, _handler: any, _options?: any): Promise<Router> {
    throw new Error('Model binding methods not implemented - use router extensions')
  }

  async putWithBinding(_path: string, _handler: any, _options?: any): Promise<Router> {
    throw new Error('Model binding methods not implemented - use router extensions')
  }

  async deleteWithBinding(_path: string, _handler: any, _options?: any): Promise<Router> {
    throw new Error('Model binding methods not implemented - use router extensions')
  }

  async patchWithBinding(_path: string, _handler: any, _options?: any): Promise<Router> {
    throw new Error('Model binding methods not implemented - use router extensions')
  }

  async resourceWithBinding(_path: string, _controller: string, _options?: any): Promise<Router> {
    throw new Error('Model binding methods not implemented - use router extensions')
  }
}

/**
 * Builder for conditional middleware
 */
export class ConditionalBuilder {
  constructor(
    private router: Router,
    private condition: MiddlewareCondition,
  ) {}

  middleware(middlewareName: string): this {
    const [name, params] = middlewareName.split(':')
    const middlewareFactory = (this.router as any).namedMiddleware.get(name)
    
    if (!middlewareFactory) {
      throw new Error(`Unknown middleware: ${name}`)
    }
    
    const middlewareHandler = middlewareFactory(params);
    (this.router as any).conditionalMiddleware.push({
      condition: this.condition,
      middleware: [middlewareHandler],
    })
    
    return this
  }
}

/**
 * Builder for middleware with parameters
 */
export class MiddlewareBuilder {
  constructor(
    private router: Router,
    private middleware: MiddlewareHandler[],
  ) {}

  get(path: string, handler: RouteHandler): this {
    // This would integrate with the router's route registration
    return this
  }

  post(path: string, handler: RouteHandler): this {
    return this
  }

  put(path: string, handler: RouteHandler): this {
    return this
  }

  delete(path: string, handler: RouteHandler): this {
    return this
  }
}

/**
 * Builder for route groups with middleware
 */
export class RouteGroupBuilder {
  constructor(
    private router: Router,
    private middleware: MiddlewareHandler[],
  ) {}

  get(path: string, handler: RouteHandler): this {
    // This would integrate with the router's route registration
    return this
  }

  post(path: string, handler: RouteHandler): this {
    return this
  }

  put(path: string, handler: RouteHandler): this {
    return this
  }

  delete(path: string, handler: RouteHandler): this {
    return this
  }
}
