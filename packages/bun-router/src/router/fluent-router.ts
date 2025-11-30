/**
 * Fluent Routing Extensions
 *
 * Implements fluent routing patterns with full TypeScript support
 */

import type {
  ActionHandler,
  EnhancedRequest,
  MiddlewareHandler,
  Route,
  RouteHandler,
} from '../types'
import type { Router } from './router'
import { matchPath } from '../utils'

// ============================================================================
// Types
// ============================================================================

/**
 * Controller class interface
 */
export interface ControllerClass {
  new (): Controller
}

/**
 * Base controller interface
 */
export interface Controller {
  [key: string]: RouteHandler | unknown
}

/**
 * Resource controller methods
 */
export type ResourceMethod = 'index' | 'create' | 'store' | 'show' | 'edit' | 'update' | 'destroy'

/**
 * API resource methods (no create/edit views)
 */
export type ApiResourceMethod = 'index' | 'store' | 'show' | 'update' | 'destroy'

/**
 * Singleton resource methods
 */
export type SingletonMethod = 'show' | 'edit' | 'update'

/**
 * Resource configuration
 */
export interface ResourceOptions {
  only?: ResourceMethod[]
  except?: ResourceMethod[]
  middleware?: (string | MiddlewareHandler)[]
  names?: Partial<Record<ResourceMethod, string>>
  parameters?: Record<string, string>
  shallow?: boolean
}

/**
 * Route builder for fluent API
 */
export interface FluentRoute {
  name: (name: string) => FluentRoute
  middleware: (...middleware: (string | MiddlewareHandler)[]) => FluentRoute
  withoutMiddleware: (...middleware: string[]) => FluentRoute
  where: (param: string, pattern: string | RegExp) => FluentRoute
  whereNumber: (param: string) => FluentRoute
  whereAlpha: (param: string) => FluentRoute
  whereAlphaNumeric: (param: string) => FluentRoute
  whereUuid: (param: string) => FluentRoute
  whereSlug: (param: string) => FluentRoute
  can: (ability: string, model?: string) => FluentRoute
  missing: (handler: (req: EnhancedRequest) => Response) => FluentRoute
  withTrashed: () => FluentRoute
  scopeBindings: () => FluentRoute
}

/**
 * Group builder for fluent API
 */
export interface GroupBuilder {
  prefix: (prefix: string) => GroupBuilder
  name: (name: string) => GroupBuilder
  middleware: (...middleware: (string | MiddlewareHandler)[]) => GroupBuilder
  domain: (domain: string) => GroupBuilder
  controller: (controller: ControllerClass) => GroupBuilder
  routes: (callback: (router: FluentRouter) => void) => void
}

// ============================================================================
// Fluent Router Implementation
// ============================================================================

/**
 * Fluent router with chainable API
 */
export class FluentRouter {
  private router: Router
  private currentPrefix: string = ''
  private currentNamePrefix: string = ''
  private currentMiddleware: (string | MiddlewareHandler)[] = []
  private currentDomain: string | null = null
  private currentController: ControllerClass | null = null
  private excludedMiddleware: Set<string> = new Set()

  constructor(router: Router) {
    this.router = router
  }

  // ============================================================================
  // HTTP Methods
  // ============================================================================

  /**
   * Register a GET route
   */
  get(path: string, handler: RouteHandler | string): FluentRouteBuilder {
    return this.addRoute('GET', path, handler)
  }

  /**
   * Register a POST route
   */
  post(path: string, handler: RouteHandler | string): FluentRouteBuilder {
    return this.addRoute('POST', path, handler)
  }

  /**
   * Register a PUT route
   */
  put(path: string, handler: RouteHandler | string): FluentRouteBuilder {
    return this.addRoute('PUT', path, handler)
  }

  /**
   * Register a PATCH route
   */
  patch(path: string, handler: RouteHandler | string): FluentRouteBuilder {
    return this.addRoute('PATCH', path, handler)
  }

  /**
   * Register a DELETE route
   */
  delete(path: string, handler: RouteHandler | string): FluentRouteBuilder {
    return this.addRoute('DELETE', path, handler)
  }

  /**
   * Register an OPTIONS route
   */
  options(path: string, handler: RouteHandler | string): FluentRouteBuilder {
    return this.addRoute('OPTIONS', path, handler)
  }

  /**
   * Register a route for any HTTP method
   */
  any(path: string, handler: RouteHandler | string): FluentRouteBuilder {
    return this.addRoute('*', path, handler)
  }

  /**
   * Register a route for multiple HTTP methods
   */
  match(methods: string[], path: string, handler: RouteHandler | string): FluentRouteBuilder {
    const fullPath = this.buildPath(path)
    const resolvedHandler = this.resolveHandler(handler)
    const middleware = this.buildMiddleware()

    for (const method of methods) {
      const route: Route = {
        path: fullPath,
        method: method.toUpperCase(),
        handler: resolvedHandler,
        middleware,
        domain: this.currentDomain || undefined,
        pattern: this.createPattern(fullPath),
      }
      // Use direct push to routes array to avoid conflict with http-methods.ts addRoute
      this.router.routes.push(route)
    }

    return new FluentRouteBuilder(this.router, fullPath, methods[0])
  }

  // ============================================================================
  // Resource Routes
  // ============================================================================

  /**
   * Register a resource controller
   */
  resource(name: string, Controller: ControllerClass, options: ResourceOptions = {}): this {
    const methods = this.getResourceMethods(options)
    const paramName = options.parameters?.[name] || 'id'

    const controllerInstance = new Controller()

    for (const method of methods) {
      const { httpMethod, path, handlerName } = this.getResourceRoute(name, method, paramName)
      const handler = controllerInstance[handlerName] as RouteHandler | undefined

      if (handler) {
        const fullPath = this.buildPath(path)
        const routeName = options.names?.[method] || `${name}.${method}`

        const route: Route = {
          path: fullPath,
          method: httpMethod,
          handler,
          middleware: this.buildMiddleware(options.middleware),
          name: this.currentNamePrefix + routeName,
          domain: this.currentDomain || undefined,
          pattern: this.createPattern(fullPath),
        }
        // Use direct push to routes array to avoid conflict with http-methods.ts addRoute
        this.router.routes.push(route)
        if (route.name) {
          this.router.namedRoutes.set(route.name, route)
        }
      }
    }

    return this
  }

  /**
   * Register an API resource controller (no create/edit views)
   */
  apiResource(name: string, controller: ControllerClass, options: ResourceOptions = {}): this {
    const apiMethods: ApiResourceMethod[] = ['index', 'store', 'show', 'update', 'destroy']
    const filteredOptions: ResourceOptions = {
      ...options,
      only: options.only?.filter((m): m is ResourceMethod => apiMethods.includes(m as ApiResourceMethod)) || apiMethods,
    }
    return this.resource(name, controller, filteredOptions)
  }

  /**
   * Register a singleton resource (no index, create, store, destroy)
   */
  singleton(name: string, Controller: ControllerClass, options: ResourceOptions = {}): this {
    const singletonMethods: SingletonMethod[] = ['show', 'edit', 'update']
    const controllerInstance = new Controller()

    for (const method of singletonMethods) {
      if (options.except?.includes(method))
        continue
      if (options.only && !options.only.includes(method))
        continue

      const { httpMethod, handlerName } = this.getSingletonRoute(name, method)
      const handler = controllerInstance[handlerName] as RouteHandler | undefined

      if (handler) {
        const fullPath = this.buildPath(`/${name}${method === 'edit' ? '/edit' : ''}`)
        const routeName = options.names?.[method] || `${name}.${method}`

        const route: Route = {
          path: fullPath,
          method: httpMethod,
          handler,
          middleware: this.buildMiddleware(options.middleware),
          name: this.currentNamePrefix + routeName,
          domain: this.currentDomain || undefined,
          pattern: this.createPattern(fullPath),
        }
        // Use direct push to routes array to avoid conflict with http-methods.ts addRoute
        this.router.routes.push(route)
        if (route.name) {
          this.router.namedRoutes.set(route.name, route)
        }
      }
    }

    return this
  }

  // ============================================================================
  // Group Methods
  // ============================================================================

  /**
   * Create a route group with prefix
   */
  prefix(prefix: string): GroupBuilderImpl {
    return new GroupBuilderImpl(this).prefix(prefix)
  }

  /**
   * Create a route group with name prefix
   */
  name(namePrefix: string): GroupBuilderImpl {
    return new GroupBuilderImpl(this).name(namePrefix)
  }

  /**
   * Create a route group with middleware
   */
  middleware(...middleware: (string | MiddlewareHandler)[]): GroupBuilderImpl {
    return new GroupBuilderImpl(this).middleware(...middleware)
  }

  /**
   * Create a route group for a domain
   */
  domain(domain: string): GroupBuilderImpl {
    return new GroupBuilderImpl(this).domain(domain)
  }

  /**
   * Create a route group with a controller
   */
  controller(controller: ControllerClass): GroupBuilderImpl {
    return new GroupBuilderImpl(this).controller(controller)
  }

  /**
   * Create a route group
   */
  group(options: GroupOptions, callback: (router: FluentRouter) => void): this {
    const previousPrefix = this.currentPrefix
    const previousNamePrefix = this.currentNamePrefix
    const previousMiddleware = [...this.currentMiddleware]
    const previousDomain = this.currentDomain
    const previousController = this.currentController

    if (options.prefix)
      this.currentPrefix = this.buildPath(options.prefix)
    if (options.as)
      this.currentNamePrefix = this.currentNamePrefix + options.as
    if (options.middleware)
      this.currentMiddleware.push(...options.middleware)
    if (options.domain)
      this.currentDomain = options.domain
    if (options.controller)
      this.currentController = options.controller

    callback(this)

    this.currentPrefix = previousPrefix
    this.currentNamePrefix = previousNamePrefix
    this.currentMiddleware = previousMiddleware
    this.currentDomain = previousDomain
    this.currentController = previousController

    return this
  }

  // ============================================================================
  // Route Information
  // ============================================================================

  /**
   * Check if a named route exists
   */
  has(name: string): boolean {
    return this.router.namedRoutes.has(name)
  }

  /**
   * Get the current route (from request context)
   */
  current(): Route | null {
    // This would need to be set during request handling
    return null
  }

  /**
   * Get the current route name
   */
  currentRouteName(): string | null {
    const route = this.current()
    return route?.name || null
  }

  /**
   * Get URL for a named route
   */
  route(name: string, params: Record<string, string | number> = {}): string {
    const route = this.router.namedRoutes.get(name)
    if (!route) {
      throw new Error(`Route [${name}] not defined.`)
    }

    let url = route.path
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, String(value))
      url = url.replace(`:${key}`, String(value))
    }

    return url
  }

  // ============================================================================
  // Fallback & Error Handling
  // ============================================================================

  /**
   * Register a fallback route
   */
  fallback(handler: RouteHandler): this {
    this.router.fallbackHandler = handler
    return this
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private addRoute(method: string, path: string, handler: RouteHandler | string): FluentRouteBuilder {
    const fullPath = this.buildPath(path)
    const resolvedHandler = this.resolveHandler(handler)
    const middleware = this.buildMiddleware()

    const route: Route = {
      path: fullPath,
      method: method.toUpperCase(),
      handler: resolvedHandler,
      middleware,
      domain: this.currentDomain || undefined,
      pattern: this.createPattern(fullPath),
    }

    // Use direct push to routes array to avoid conflict with http-methods.ts addRoute
    this.router.routes.push(route)
    if (route.name) {
      this.router.namedRoutes.set(route.name, route)
    }
    return new FluentRouteBuilder(this.router, fullPath, method)
  }

  /**
   * Create a pattern object for route matching
   */
  private createPattern(routePath: string): { exec: (url: URL) => { pathname: { groups: Record<string, string> } } | null } {
    return {
      exec: (url: URL): { pathname: { groups: Record<string, string> } } | null => {
        const params: Record<string, string> = {}
        const isMatch = matchPath(routePath, url.pathname, params)

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
  }

  private buildPath(path: string): string {
    if (this.currentPrefix) {
      return `${this.currentPrefix}${path.startsWith('/') ? path : `/${path}`}`
    }
    return path.startsWith('/') ? path : `/${path}`
  }

  private buildMiddleware(additional?: (string | MiddlewareHandler)[]): MiddlewareHandler[] {
    const allMiddleware = [...this.currentMiddleware, ...(additional || [])]
    return allMiddleware
      .filter(m => typeof m !== 'string' || !this.excludedMiddleware.has(m))
      .map(m => this.resolveMiddleware(m))
  }

  private resolveHandler(handler: RouteHandler | string): ActionHandler {
    if (typeof handler === 'string') {
      if (this.currentController) {
        const ControllerClass = this.currentController
        const controllerInstance = new ControllerClass()
        const method = controllerInstance[handler] as RouteHandler | undefined
        if (method) {
          return method.bind(controllerInstance)
        }
      }
      return handler as ActionHandler
    }
    return handler
  }

  private resolveMiddleware(middleware: string | MiddlewareHandler): MiddlewareHandler {
    if (typeof middleware === 'function') {
      return middleware
    }
    // String middleware would be resolved from named middleware registry
    return async (_req, next) => next()
  }

  private getResourceMethods(options: ResourceOptions): ResourceMethod[] {
    const allMethods: ResourceMethod[] = ['index', 'create', 'store', 'show', 'edit', 'update', 'destroy']

    if (options.only) {
      return options.only
    }

    if (options.except) {
      return allMethods.filter(m => !options.except!.includes(m))
    }

    return allMethods
  }

  private getResourceRoute(name: string, method: ResourceMethod, paramName: string): { httpMethod: string, path: string, handlerName: string } {
    const routes: Record<ResourceMethod, { httpMethod: string, path: string, handlerName: string }> = {
      index: { httpMethod: 'GET', path: `/${name}`, handlerName: 'index' },
      create: { httpMethod: 'GET', path: `/${name}/create`, handlerName: 'create' },
      store: { httpMethod: 'POST', path: `/${name}`, handlerName: 'store' },
      show: { httpMethod: 'GET', path: `/${name}/{${paramName}}`, handlerName: 'show' },
      edit: { httpMethod: 'GET', path: `/${name}/{${paramName}}/edit`, handlerName: 'edit' },
      update: { httpMethod: 'PUT', path: `/${name}/{${paramName}}`, handlerName: 'update' },
      destroy: { httpMethod: 'DELETE', path: `/${name}/{${paramName}}`, handlerName: 'destroy' },
    }

    return routes[method]
  }

  private getSingletonRoute(name: string, method: SingletonMethod): { httpMethod: string, handlerName: string } {
    const routes: Record<SingletonMethod, { httpMethod: string, handlerName: string }> = {
      show: { httpMethod: 'GET', handlerName: 'show' },
      edit: { httpMethod: 'GET', handlerName: 'edit' },
      update: { httpMethod: 'PUT', handlerName: 'update' },
    }

    return routes[method]
  }
}

// ============================================================================
// Fluent Route Builder
// ============================================================================

/**
 * Fluent route builder for chaining route configuration
 */
export class FluentRouteBuilder implements FluentRoute {
  private router: Router
  private path: string
  private method: string
  private routeName: string | null = null
  private routeMiddleware: MiddlewareHandler[] = []
  private excludedMiddleware: string[] = []
  private constraints: Record<string, string | RegExp> = {}
  private missingHandler: ((req: EnhancedRequest) => Response) | null = null
  private includeTrashed: boolean = false
  private scopeBindingsEnabled: boolean = false
  private ability: string | null = null
  private abilityModel: string | null = null

  constructor(router: Router, path: string, method: string) {
    this.router = router
    this.path = path
    this.method = method
  }

  /**
   * Set the route name
   */
  name(name: string): this {
    this.routeName = name
    // Update the route in the router
    const route = this.findRoute()
    if (route) {
      route.name = name
      this.router.namedRoutes.set(name, route)
    }
    return this
  }

  /**
   * Add middleware to the route
   */
  middleware(...middleware: (string | MiddlewareHandler)[]): this {
    const route = this.findRoute()
    if (route) {
      for (const m of middleware) {
        if (typeof m === 'function') {
          route.middleware.push(m)
        }
      }
    }
    return this
  }

  /**
   * Exclude middleware from the route
   */
  withoutMiddleware(...middleware: string[]): this {
    this.excludedMiddleware.push(...middleware)
    const route = this.findRoute()
    if (route) {
      route.middleware = route.middleware.filter((m) => {
        const name = m.name || ''
        return !this.excludedMiddleware.includes(name)
      })
    }
    return this
  }

  /**
   * Add a parameter constraint
   */
  where(param: string, pattern: string | RegExp): this {
    this.constraints[param] = pattern
    const route = this.findRoute()
    if (route) {
      route.constraints = { ...route.constraints, [param]: String(pattern) }
    }
    return this
  }

  /**
   * Constrain parameter to numbers
   */
  whereNumber(param: string): this {
    return this.where(param, '[0-9]+')
  }

  /**
   * Constrain parameter to letters
   */
  whereAlpha(param: string): this {
    return this.where(param, '[a-zA-Z]+')
  }

  /**
   * Constrain parameter to alphanumeric
   */
  whereAlphaNumeric(param: string): this {
    return this.where(param, '[a-zA-Z0-9]+')
  }

  /**
   * Constrain parameter to UUID
   */
  whereUuid(param: string): this {
    return this.where(param, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
  }

  /**
   * Constrain parameter to slug format
   */
  whereSlug(param: string): this {
    return this.where(param, '[a-z0-9]+(?:-[a-z0-9]+)*')
  }

  /**
   * Add authorization check
   */
  can(ability: string, model?: string): this {
    this.ability = ability
    this.abilityModel = model || null
    // Add authorization middleware
    const authMiddleware: MiddlewareHandler = async (req, next) => {
      // Check if user can perform ability
      const user = req.user
      if (!user) {
        return new Response('Unauthorized', { status: 401 })
      }
      // Authorization logic would go here
      return next()
    }
    const route = this.findRoute()
    if (route) {
      route.middleware.push(authMiddleware)
    }
    return this
  }

  /**
   * Handle missing model binding
   */
  missing(handler: (req: EnhancedRequest) => Response): this {
    this.missingHandler = handler
    return this
  }

  /**
   * Include soft-deleted models
   */
  withTrashed(): this {
    this.includeTrashed = true
    return this
  }

  /**
   * Enable scoped bindings
   */
  scopeBindings(): this {
    this.scopeBindingsEnabled = true
    return this
  }

  private findRoute(): Route | undefined {
    return this.router.routes.find(r =>
      r.path === this.path && r.method === this.method.toUpperCase(),
    )
  }
}

// ============================================================================
// Group Builder Implementation
// ============================================================================

interface GroupOptions {
  prefix?: string
  as?: string
  middleware?: (string | MiddlewareHandler)[]
  domain?: string
  controller?: ControllerClass
}

class GroupBuilderImpl implements GroupBuilder {
  private fluentRouter: FluentRouter
  private options: GroupOptions = {}

  constructor(router: FluentRouter) {
    this.fluentRouter = router
  }

  prefix(prefix: string): this {
    this.options.prefix = prefix
    return this
  }

  name(name: string): this {
    this.options.as = name
    return this
  }

  middleware(...middleware: (string | MiddlewareHandler)[]): this {
    this.options.middleware = [...(this.options.middleware || []), ...middleware]
    return this
  }

  domain(domain: string): this {
    this.options.domain = domain
    return this
  }

  controller(controller: ControllerClass): this {
    this.options.controller = controller
    return this
  }

  routes(callback: (router: FluentRouter) => void): void {
    this.fluentRouter.group(this.options, callback)
  }
}

// ============================================================================
// Router Extension
// ============================================================================

/**
 * Extend Router with fluent routing methods
 */
export function registerFluentRouting(RouterClass: typeof import('./router').Router): void {
  const proto = RouterClass.prototype as Router & {
    fluent?: () => FluentRouter
    resourceController?: (name: string, controller: ControllerClass, options?: ResourceOptions) => Router
    apiResourceController?: (name: string, controller: ControllerClass, options?: ResourceOptions) => Router
    singletonResource?: (name: string, controller: ControllerClass, options?: ResourceOptions) => Router
    hasRoute?: (name: string) => boolean
    currentRoute?: () => Route | null
    currentRouteName?: () => string | null
    routeUrl?: (name: string, params?: Record<string, string | number>) => string
  }

  /**
   * Get fluent router instance
   */
  proto.fluent = function (this: Router): FluentRouter {
    return new FluentRouter(this)
  }

  /**
   * Register a controller-based resource
   */
  proto.resourceController = function (
    this: Router,
    name: string,
    controller: ControllerClass,
    options?: ResourceOptions,
  ): Router {
    new FluentRouter(this).resource(name, controller, options)
    return this
  }

  /**
   * Register an API resource controller
   */
  proto.apiResourceController = function (
    this: Router,
    name: string,
    controller: ControllerClass,
    options?: ResourceOptions,
  ): Router {
    new FluentRouter(this).apiResource(name, controller, options)
    return this
  }

  /**
   * Register a singleton resource
   */
  proto.singletonResource = function (
    this: Router,
    name: string,
    controller: ControllerClass,
    options?: ResourceOptions,
  ): Router {
    new FluentRouter(this).singleton(name, controller, options)
    return this
  }

  /**
   * Check if a named route exists
   */
  proto.hasRoute = function (this: Router, name: string): boolean {
    return this.namedRoutes.has(name)
  }

  /**
   * Get the current route
   */
  proto.currentRoute = function (this: Router): Route | null {
    // Would need request context
    return null
  }

  /**
   * Get the current route name
   */
  proto.currentRouteName = function (this: Router): string | null {
    const route = this.currentRoute?.()
    return route?.name || null
  }

  /**
   * Get URL for a named route
   */
  proto.routeUrl = function (
    this: Router,
    name: string,
    params: Record<string, string | number> = {},
  ): string {
    const route = this.namedRoutes.get(name)
    if (!route) {
      throw new Error(`Route [${name}] not defined.`)
    }

    let url = route.path
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, String(value))
      url = url.replace(`:${key}`, String(value))
    }

    return url
  }
}

// ============================================================================
// Type Augmentation
// ============================================================================

declare module './router' {
  interface Router {
    /**
     * Get fluent router instance
     */
    fluent: () => FluentRouter

    /**
     * Register a controller-based resource
     * Note: Use `resourceController` to avoid conflict with existing `resource` method
     */
    resourceController: (name: string, controller: ControllerClass, options?: ResourceOptions) => Router

    /**
     * Register an API resource controller (no create/edit views)
     */
    apiResourceController: (name: string, controller: ControllerClass, options?: ResourceOptions) => Router

    /**
     * Register a singleton resource
     */
    singletonResource: (name: string, controller: ControllerClass, options?: ResourceOptions) => Router

    /**
     * Check if a named route exists
     */
    hasRoute: (name: string) => boolean

    /**
     * Get the current route
     */
    currentRoute: () => Route | null

    /**
     * Get the current route name
     */
    currentRouteName: () => string | null

    /**
     * Get URL for a named route
     */
    routeUrl: (name: string, params?: Record<string, string | number>) => string
  }
}
