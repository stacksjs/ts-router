import type { Server } from 'bun'
import type { MiddlewareDependency, MiddlewarePipeline, MiddlewarePipelineStats, MiddlewareSkipCondition } from '../middleware/pipeline'
import type {
  ActionHandler,
  EnhancedRequest,
  MiddlewareHandler,
  NextFunction,
  Route,
  RouteGroup,
  RouteHandler,
  RouterConfig,
  ThrottlePattern,
  WebSocketConfig,
  WebSocketData,
} from '../types'
import { createRateLimitMiddleware, parseThrottleString } from '../routing/route-throttling'
import { extractParamNames, joinPaths, matchPath } from '../utils'

/**
 * Route compiler interface for pattern matching
 */
export interface RouteCompiler {
  compile: (path: string) => RegExp
  match: (path: string, pattern: RegExp) => Record<string, string> | null
}

/**
 * Middleware cache info interface
 */
export interface MiddlewareCacheInfo {
  size: number
  routes: string[]
  hitRate: number
}

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
  serverInstance: Server<WebSocketData> | null = null
  wsConfig: WebSocketConfig | null = null
  errorHandler: ((error: Error) => Response | Promise<Response>) | null = null
  templateCache: Map<string, string> = new Map<string, string>()
  routeCache: Map<string, { route: Route, params: Record<string, string> }> = new Map()
  staticRoutes: Map<string, Map<string, Route>> = new Map()
  precompiledPatterns: Map<string, RegExp> = new Map()
  domainPatternCache: Map<string, RegExp> = new Map()
  routeCompiler: RouteCompiler | null = null

  // Advanced middleware features
  private middlewareGroups: Map<string, MiddlewareHandler[]> = new Map()
  private namedMiddleware: Map<string, (params?: string) => MiddlewareHandler> = new Map()
  private conditionalMiddleware: Array<{ condition: MiddlewareCondition, middleware: MiddlewareHandler[] }> = []

  // Middleware pipeline for advanced features
  _middlewarePipeline?: MiddlewarePipeline

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
    this.namedMiddleware.set('auth', () => async (req: EnhancedRequest, next: NextFunction) => {
      const token = req.headers.get('authorization')?.replace('Bearer ', '')
      if (!token) {
        return new Response('Unauthorized', { status: 401 })
      }
      return await next()
    })

    // Throttle middleware with parameters
    this.namedMiddleware.set('throttle', (params?: string): MiddlewareHandler => {
      const config = params ? parseThrottleString(params as ThrottlePattern) : { maxAttempts: 60, windowMs: 60000 }
      return createRateLimitMiddleware({
        maxAttempts: config.maxAttempts || 60,
        windowMs: config.windowMs,
        keyGenerator: (req: EnhancedRequest) => req.headers.get('x-forwarded-for') || 'anonymous',
      })
    })

    // CORS middleware
    this.namedMiddleware.set('cors', () => async (_req: EnhancedRequest, next: NextFunction) => {
      const response = await next()
      if (response) {
        response.headers.set('Access-Control-Allow-Origin', '*')
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      }
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
  getServer(): Server<WebSocketData> | null {
    return this.serverInstance
  }

  /**
   * Extend the router with custom methods
   */
  extend(methods: Record<string, (...args: unknown[]) => unknown>): Router {
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

  /**
   * Internal method to add a route with full HTTP method support
   * This is the core route registration method used by get/post/put/patch/delete
   */
  async registerRoute(
    method: string,
    path: string,
    handler: ActionHandler,
    type?: 'api' | 'web',
    name?: string,
    middleware?: (string | MiddlewareHandler)[],
  ): Promise<Router> {
    // Apply current group settings if in a group
    let routePath = path
    let routeMiddleware: MiddlewareHandler[] = []
    const routeType = type || 'web'

    if (this.currentGroup) {
      // Apply prefix if it exists
      if (this.currentGroup.prefix) {
        routePath = joinPaths(this.currentGroup.prefix, path)
      }

      // Apply middleware if it exists
      if (this.currentGroup.middleware && this.currentGroup.middleware.length > 0) {
        routeMiddleware = [...this.currentGroup.middleware] as MiddlewareHandler[]
      }
    }

    // Apply route-specific middleware if provided
    if (middleware && middleware.length > 0) {
      for (const middlewareItem of middleware) {
        const resolved = await this.resolveMiddleware(middlewareItem)
        if (resolved) {
          routeMiddleware.push(resolved)
        }
      }
    }

    // Apply API/Web path prefixes
    if (routeType === 'api' && this.config.apiPrefix) {
      routePath = joinPaths(this.config.apiPrefix, routePath)
    }
    else if (routeType === 'web' && this.config.webPrefix) {
      routePath = joinPaths(this.config.webPrefix, routePath)
    }

    // Apply domain if in a domain group
    let domain: string | undefined
    if (this.currentDomain) {
      domain = this.currentDomain
    }

    // Create the route
    const route: Route = {
      method: method.toUpperCase(),
      path: routePath,
      handler,
      domain,
      params: {},
      middleware: routeMiddleware,
    }

    // Apply constraints from patterns map
    const paramNames = extractParamNames(routePath)
    const constraints: Record<string, string> = {}

    paramNames.forEach((param: string) => {
      // Remove optional marker for constraint lookup
      const baseParam = param.replace('?', '')
      if (this.patterns.has(baseParam)) {
        constraints[baseParam] = this.patterns.get(baseParam)!
      }
    })

    if (Object.keys(constraints).length > 0) {
      route.constraints = constraints
    }

    // Add pattern property for route matching
    route.pattern = {
      exec: (url: URL): { pathname: { groups: Record<string, string> } } | null => {
        const params: Record<string, string> = {}
        // Pass constraints directly to matchPath for more efficient matching
        const constraintsRecord = route.constraints && !Array.isArray(route.constraints)
          ? route.constraints as Record<string, string>
          : undefined

        const isMatch = matchPath(routePath, url.pathname, params, constraintsRecord)

        if (!isMatch) {
          return null
        }

        return {
          pathname: {
            groups: params,
          },
        }
      },
    }

    // Add to the appropriate collection
    if (domain) {
      if (!this.domains[domain]) {
        this.domains[domain] = []
      }
      this.domains[domain].push(route)
    }
    else {
      this.routes.push(route)
    }

    // Add to static routes map for fast lookup if it's a static route
    if (!routePath.includes('{') && !routePath.includes('*')) {
      if (!this.staticRoutes.has(method.toUpperCase())) {
        this.staticRoutes.set(method.toUpperCase(), new Map())
      }
      this.staticRoutes.get(method.toUpperCase())!.set(routePath, route)
    }

    // Add to named routes if name is provided
    if (name) {
      route.name = name
      this.namedRoutes.set(name, route)
    }

    // Clear route cache when new routes are added
    this.routeCache.clear()

    return this
  }

  /**
   * Resolve middleware from string or handler
   */
  async resolveMiddleware(middleware: string | MiddlewareHandler): Promise<MiddlewareHandler | null> {
    if (typeof middleware === 'function') {
      return middleware
    }

    // Parse middleware string like "auth:api" or "throttle:60,1"
    const [name, params] = middleware.split(':')
    const middlewareFactory = this.namedMiddleware.get(name)

    if (middlewareFactory) {
      return middlewareFactory(params)
    }

    return null
  }

  /**
   * HTTP GET method
   */
  async get(path: string, handler: ActionHandler, type?: 'api' | 'web', name?: string, middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    return this.registerRoute('GET', path, handler, type, name, middleware)
  }

  /**
   * HTTP POST method
   */
  async post(path: string, handler: ActionHandler, type?: 'api' | 'web', name?: string, middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    return this.registerRoute('POST', path, handler, type, name, middleware)
  }

  /**
   * HTTP PUT method
   */
  async put(path: string, handler: ActionHandler, type?: 'api' | 'web', name?: string, middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    return this.registerRoute('PUT', path, handler, type, name, middleware)
  }

  /**
   * HTTP PATCH method
   */
  async patch(path: string, handler: ActionHandler, type?: 'api' | 'web', name?: string, middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    return this.registerRoute('PATCH', path, handler, type, name, middleware)
  }

  /**
   * HTTP DELETE method
   */
  async delete(path: string, handler: ActionHandler, type?: 'api' | 'web', name?: string, middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    return this.registerRoute('DELETE', path, handler, type, name, middleware)
  }

  /**
   * HTTP OPTIONS method
   */
  async options(path: string, handler: ActionHandler, type?: 'api' | 'web', name?: string, middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    return this.registerRoute('OPTIONS', path, handler, type, name, middleware)
  }

  /**
   * Register route for multiple HTTP methods
   */
  async match(methods: string[], path: string, handler: ActionHandler, type?: 'api' | 'web', name?: string, middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    for (const method of methods) {
      await this.registerRoute(method, path, handler, type, name, middleware)
    }
    return this
  }

  /**
   * Register route for any HTTP method
   */
  async any(path: string, handler: ActionHandler, type?: 'api' | 'web', name?: string, middleware?: (string | MiddlewareHandler)[]): Promise<Router> {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
    return this.match(methods, path, handler, type, name, middleware)
  }

  /**
   * Set fallback handler for unmatched routes
   */
  fallback(handler: ActionHandler): Router {
    this.fallbackHandler = handler
    return this
  }

  /**
   * Generate URL for a named route
   */
  route(name: string, params: Record<string, string> = {}): string {
    const route = this.namedRoutes.get(name)
    if (!route) {
      throw new Error(`Route with name "${name}" not found`)
    }

    let url = route.path
    // Replace path parameters
    for (const [param, value] of Object.entries(params)) {
      url = url.replace(`{${param}}`, encodeURIComponent(value))
      url = url.replace(`{${param}?}`, encodeURIComponent(value))
    }

    return url
  }

  /**
   * Set error handler
   */
  onError(handler: (error: Error) => Response | Promise<Response>): Router {
    this.errorHandler = handler
    return this
  }

  /**
   * Create redirect response
   */
  redirect(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
    const headers = new Headers()
    headers.set('Location', url)
    return new Response(null, {
      status,
      headers,
    })
  }

  /**
   * Create permanent redirect response
   */
  permanentRedirect(url: string): Response {
    return this.redirect(url, 301)
  }

  /**
   * Register redirect route
   */
  async redirectRoute(from: string, to: string, status: 301 | 302 | 303 | 307 | 308 = 302): Promise<Router> {
    await this.get(from, (_req: EnhancedRequest) => {
      return this.redirect(to, status)
    })
    return this
  }

  /**
   * Start the HTTP server
   */
  async serve(options?: { port?: number, hostname?: string }): Promise<Server<WebSocketData>> {
    // Invalidate route cache before starting server
    this.invalidateCache()

    // Create server options
    const serverOptions: any = {
      ...options,
      fetch: this.handleRequest.bind(this),
    }

    // Apply WebSocket configuration if provided
    if (this.wsConfig) {
      serverOptions.websocket = this.wsConfig
    }

    // Start the server
    this.serverInstance = Bun.serve(serverOptions)

    if (this.config.verbose) {
      const port = this.serverInstance.port
      const hostname = this.serverInstance.hostname
      console.log(`Server running at http://${hostname}:${port}`)

      // Show routes in verbose mode
      console.log('\nRoutes:')
      const routesByMethod: Record<string, Route[]> = {}

      for (const route of this.routes) {
        if (!routesByMethod[route.method]) {
          routesByMethod[route.method] = []
        }
        routesByMethod[route.method].push(route)
      }

      for (const [method, routes] of Object.entries(routesByMethod)) {
        console.log(`\n${method}:`)
        for (const route of routes) {
          console.log(`  ${route.path}${route.name ? ` (${route.name})` : ''}`)
        }
      }

      console.log('\n')
    }

    return this.serverInstance
  }

  /**
   * Handle an HTTP request
   */
  async handleRequest(req: Request): Promise<Response> {
    try {
      // Create URL for route matching
      const url = new URL(req.url)

      // Get domain from the host header
      const hostname = url.hostname || req.headers.get('host')?.split(':')[0] || 'localhost'

      // Find a matching route
      const match = this.matchRoute(url.pathname, req.method as any, hostname)

      // Enhance the request with params and other utilities
      const enhancedReq = this.enhanceRequest(req, match?.params || {})

      if (match) {
        // Add the matched route to the request
        enhancedReq.route = match.route

        // Collect all middleware to run
        const middlewareStack = [...this.globalMiddleware]

        // Add route-specific middleware
        if (match.route.middleware && match.route.middleware.length > 0) {
          middlewareStack.push(...match.route.middleware)
        }

        // Create a final middleware that executes the route handler
        const routeHandlerMiddleware = async (req: EnhancedRequest, _next: any) => {
          return await this.resolveHandler(match.route.handler, req)
        }

        // Add the route handler as the final middleware
        middlewareStack.push(routeHandlerMiddleware)

        // Run middleware stack with the route handler at the end
        const response = await this.runMiddleware(enhancedReq, middlewareStack)

        // Apply modified cookies to the response
        if (response) {
          return this.applyModifiedCookies(response, enhancedReq)
        }

        // This should not happen since we're always returning a response now
        return new Response('No response from middleware chain', { status: 500 })
      }

      // No route found, try the fallback handler
      if (this.fallbackHandler) {
        const response = await this.resolveHandler(this.fallbackHandler, enhancedReq)
        return this.applyModifiedCookies(response, enhancedReq)
      }

      // No fallback handler, return a 404
      return new Response('Not Found', { status: 404 })
    }
    catch (error) {
      console.error('Error handling request:', error)

      // Use custom error handler if available
      if (this.errorHandler) {
        return this.errorHandler(error as Error)
      }

      // Default error response
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  /**
   * Match a route based on the path, method, and domain
   */
  matchRoute(path: string, method: string, domain?: string): { route: Route, params: Record<string, string> } | undefined {
    const url = new URL(path, 'http://localhost')

    // Generate cache key
    const cacheKey = `${domain || ''}:${method}:${url.pathname}`

    // Check cache first
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

    // If still no match, try domain-specific * (wildcard) routes
    if (domain && this.domains[domain]) {
      const wildcardRoutes = this.domains[domain].filter((route: Route) =>
        route.method === method && route.path.endsWith('*'),
      )

      for (const route of wildcardRoutes) {
        const basePath = route.path.slice(0, -1) // Remove the '*'
        if (url.pathname.startsWith(basePath)) {
          const result = {
            route,
            params: {
              wildcard: url.pathname.slice(basePath.length),
            },
          }
          this.routeCache.set(cacheKey, result)
          return result
        }
      }
    }

    // If no match in domain-specific routes, try global wildcard routes
    const globalWildcardRoutes = this.routes.filter((route: Route) =>
      route.method === method && route.path.endsWith('*') && (!domain || !route.domain),
    )

    for (const route of globalWildcardRoutes) {
      const basePath = route.path.slice(0, -1) // Remove the '*'
      if (url.pathname.startsWith(basePath)) {
        const result = {
          route,
          params: {
            wildcard: url.pathname.slice(basePath.length),
          },
        }
        this.routeCache.set(cacheKey, result)
        return result
      }
    }

    // If no match for specific method, try HEAD for GET requests
    if (method === 'HEAD') {
      return this.matchRoute(path, 'GET', domain)
    }

    // No matching route found
    return undefined
  }

  /**
   * Enhance a request with params and other utilities
   */
  enhanceRequest(req: Request, params: Record<string, string> = {}): EnhancedRequest {
    // Lazy cookie parsing
    let parsedCookies: Record<string, string> | null = null

    const getCookies = () => {
      if (parsedCookies === null) {
        parsedCookies = {}
        const cookieHeader = req.headers.get('cookie') || ''

        cookieHeader.split(';').forEach((cookie) => {
          const parts = cookie.trim().split('=')
          if (parts.length >= 2) {
            const name = parts[0].trim()
            const value = parts.slice(1).join('=').trim()
            parsedCookies![name] = decodeURIComponent(value)
          }
        })
      }
      return parsedCookies
    }

    // Create cookie utilities with lazy parsing
    const cookies = {
      get: (name: string) => getCookies()[name],
      set: (name: string, value: string, options: any = {}) => {
        const enhancedRequest = req as EnhancedRequest
        if (!enhancedRequest._cookiesToSet) {
          enhancedRequest._cookiesToSet = []
        }
        enhancedRequest._cookiesToSet.push({ name, value, options })
      },
      delete: (name: string, options: any = {}) => {
        const enhancedRequest = req as EnhancedRequest
        if (!enhancedRequest._cookiesToDelete) {
          enhancedRequest._cookiesToDelete = []
        }
        enhancedRequest._cookiesToDelete.push({ name, options })
      },
      getAll: () => ({ ...getCookies() }),
    }

    // Create enhanced request
    const enhancedReq = Object.assign(req, {
      params,
      cookies: getCookies(), // Set cookies as plain object for direct access
      _cookiesToSet: [],
      _cookiesToDelete: [],
    }) as unknown as EnhancedRequest

    // Add cookie methods to the request
    Object.assign(enhancedReq, { cookies: { ...getCookies(), ...cookies } })

    return enhancedReq
  }

  /**
   * Apply modified cookies to a response
   */
  applyModifiedCookies(response: Response, req: EnhancedRequest): Response {
    // Clone the response to modify headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })

    // Apply cookies to set
    if (req._cookiesToSet && req._cookiesToSet.length > 0) {
      for (const { name, value, options } of req._cookiesToSet) {
        const cookieString = this.serializeCookie(name, value, options)
        newResponse.headers.append('Set-Cookie', cookieString)
      }
    }

    // Apply cookies to delete
    if (req._cookiesToDelete && req._cookiesToDelete.length > 0) {
      for (const { name, options } of req._cookiesToDelete) {
        const deletionOptions = {
          ...options,
          expires: new Date(0), // Set expiration to past date
          maxAge: 0,
        }
        const cookieString = this.serializeCookie(name, '', deletionOptions)
        newResponse.headers.append('Set-Cookie', cookieString)
      }
    }

    return newResponse
  }

  /**
   * Serialize a cookie for the Set-Cookie header
   */
  serializeCookie(name: string, value: string, options: any = {}): string {
    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

    if (options.maxAge !== undefined) {
      cookie += `; Max-Age=${options.maxAge}`
    }

    if (options.expires && options.expires instanceof Date) {
      cookie += `; Expires=${options.expires.toUTCString()}`
    }

    if (options.path) {
      cookie += `; Path=${options.path}`
    }
    else {
      cookie += '; Path=/'
    }

    if (options.domain) {
      cookie += `; Domain=${options.domain}`
    }

    if (options.secure) {
      cookie += '; Secure'
    }

    if (options.httpOnly) {
      cookie += '; HttpOnly'
    }

    if (options.sameSite) {
      const sameSite = options.sameSite.toLowerCase()
      cookie += `; SameSite=${sameSite.charAt(0).toUpperCase() + sameSite.slice(1)}`
    }

    return cookie
  }

  /**
   * Build an optimized middleware chain
   */
  buildMiddlewareChain(middlewares: MiddlewareHandler[]): (req: EnhancedRequest) => Promise<Response | null> {
    if (middlewares.length === 0) {
      return async (_req: EnhancedRequest) => null
    }

    // Build the chain from the end to start for better performance
    let chain = async (_req: EnhancedRequest): Promise<Response | null> => null

    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i]
      const nextChain = chain
      chain = async (req: EnhancedRequest): Promise<Response | null> => {
        const next = async (): Promise<Response> => {
          const result = await nextChain(req)
          return result || new Response(null, { status: 200 })
        }
        return middleware(req, next)
      }
    }

    return chain
  }

  /**
   * Run middleware stack for a request
   */
  async runMiddleware(req: EnhancedRequest, middlewareStack: MiddlewareHandler[]): Promise<Response | null> {
    if (middlewareStack.length === 0) {
      return null // No middleware to run
    }

    try {
      // Build and execute optimized middleware chain
      const chain = this.buildMiddlewareChain(middlewareStack)
      return await chain(req)
    }
    catch (error) {
      if (this.errorHandler) {
        return this.errorHandler(error as Error)
      }
      throw error
    }
  }

  /**
   * Resolve an action handler
   */
  async resolveHandler(handler: any, req: EnhancedRequest): Promise<Response> {
    // If it's a function, call it with the request
    if (typeof handler === 'function' && !handler.prototype?.handle) {
      return await handler(req)
    }

    // If it's a class constructor, instantiate it and call handle
    if (typeof handler === 'function' && handler.prototype && typeof handler.prototype.handle === 'function') {
      const HandlerClass = handler
      const handlerInstance = new HandlerClass()
      return await handlerInstance.handle(req)
    }

    // If it's an object with a handle method
    if (handler && typeof handler.handle === 'function') {
      return await handler.handle(req)
    }

    throw new Error(`Invalid action handler: ${typeof handler}`)
  }

  /**
   * Add middleware to the router
   */
  async use(...middleware: (string | MiddlewareHandler)[]): Promise<Router> {
    for (const mw of middleware) {
      const resolvedMiddleware = await this.resolveMiddleware(mw)
      if (resolvedMiddleware) {
        this.globalMiddleware.push(resolvedMiddleware)
      }
    }
    return this
  }

  /**
   * Create a route group with prefix and middleware
   */
  group(options: { prefix?: string, middleware?: (string | MiddlewareHandler)[] }, callback: () => void | Promise<void>): Router {
    // Save current group state
    const previousGroup = this.currentGroup

    // Create new group
    this.currentGroup = {
      prefix: options.prefix || '',
      middleware: [],
    }

    // Resolve middleware if provided
    if (options.middleware) {
      for (const mw of options.middleware) {
        if (typeof mw === 'function') {
          this.currentGroup.middleware!.push(mw)
        }
      }
    }

    // Execute callback
    const result = callback()

    // Handle async callbacks
    if (result instanceof Promise) {
      result.then(() => {
        this.currentGroup = previousGroup
      })
    }
    else {
      // Restore previous group state
      this.currentGroup = previousGroup
    }

    return this
  }

  /**
   * Add route to the router
   */
  addRoute(route: Route): this {
    this.routes.push(route)
    if (route.name) {
      this.namedRoutes.set(route.name, route)
    }
    return this
  }

  /**
   * Register middleware dependency
   */
  registerMiddlewareDependency(dependency: MiddlewareDependency): this {
    if (this._middlewarePipeline) {
      this._middlewarePipeline.registerDependency(dependency)
    }
    return this
  }

  /**
   * Register middleware skip conditions
   */
  registerMiddlewareSkipConditions(_middlewareName: string, _conditions: MiddlewareSkipCondition[]): this {
    // Implementation would register skip conditions with the pipeline
    return this
  }

  /**
   * Get middleware statistics
   */
  getMiddlewareStats(): MiddlewarePipelineStats | Record<string, never> {
    if (this._middlewarePipeline) {
      return this._middlewarePipeline.getStats()
    }
    return {}
  }

  /**
   * Get middleware cache info
   */
  getMiddlewareCacheInfo(): MiddlewareCacheInfo {
    // Return cache info based on compiled pipelines
    return {
      size: 0,
      routes: [],
      hitRate: 0,
    }
  }

  /**
   * Clear middleware cache
   */
  clearMiddlewareCache(): this {
    if (this._middlewarePipeline) {
      this._middlewarePipeline.clear()
    }
    return this
  }

  /**
   * Execute middleware pipeline
   */
  async executeMiddleware(middleware: MiddlewareHandler[], request: EnhancedRequest, handler: () => Promise<Response>): Promise<Response> {
    if (middleware.length === 0) {
      return handler()
    }

    let currentIndex = 0

    const next = async (): Promise<Response> => {
      if (currentIndex >= middleware.length) {
        return handler()
      }

      const mw = middleware[currentIndex++]
      const result = await mw(request, next)
      return result || new Response('No response from middleware', { status: 500 })
    }

    return next()
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

  get(_path: string, _handler: RouteHandler): this {
    // This would integrate with the router's route registration
    return this
  }

  post(_path: string, _handler: RouteHandler): this {
    return this
  }

  put(_path: string, _handler: RouteHandler): this {
    return this
  }

  delete(_path: string, _handler: RouteHandler): this {
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

  get(_path: string, _handler: RouteHandler): this {
    // This would integrate with the router's route registration
    return this
  }

  post(_path: string, _handler: RouteHandler): this {
    return this
  }

  put(_path: string, _handler: RouteHandler): this {
    return this
  }

  delete(_path: string, _handler: RouteHandler): this {
    return this
  }
}
