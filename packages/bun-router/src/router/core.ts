import type { Server } from 'bun'
import type {
  ActionHandler,
  MiddlewareHandler,
  Route,
  RouteGroup,
  RouteHandler,
  RouterConfig,
  WebSocketConfig,
} from '../types'

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

/**
 * Core Router class that manages routes and handles requests
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
  redirect(_to: string, _status?: number): Response {
    throw new Error('Redirect methods not implemented - use router extensions')
  }

  permanentRedirect(_to: string): Response {
    throw new Error('Redirect methods not implemented - use router extensions')
  }

  async redirectRoute(_from: string, _to: string, _status?: number): Promise<Router> {
    throw new Error('Redirect methods not implemented - use router extensions')
  }

  // Error Handling
  async onError(_handler: (error: any) => Response): Promise<Router> {
    throw new Error('Error handling methods not implemented - use router extensions')
  }

  fallback(_handler: RouteHandler): Router {
    throw new Error('Error handling methods not implemented - use router extensions')
  }

  // Views
  async view(_path: string, _template: string, _data?: any): Promise<Router> {
    throw new Error('View methods not implemented - use router extensions')
  }

  async renderView(_template: string, _data?: any, _options?: any): Promise<string> {
    throw new Error('View methods not implemented - use router extensions')
  }

  // Resources
  async resource(_name: string, _controller: any, _options?: any): Promise<Router> {
    throw new Error('Resource methods not implemented - use router extensions')
  }

  // Domain Routing
  async domain(_domain: string, _callback: () => void): Promise<Router> {
    throw new Error('Domain methods not implemented - use router extensions')
  }

  // Additional Middleware
  middleware(..._middlewares: (string | MiddlewareHandler)[]): Router {
    throw new Error('Middleware methods not implemented - use router extensions')
  }

  // Streaming Methods
  async stream(_path: string, _generator: any, _options?: any): Promise<void> {
    throw new Error('Streaming methods not implemented - use router extensions')
  }

  async streamJSON(_path: string, _generator: any, _options?: any): Promise<void> {
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
