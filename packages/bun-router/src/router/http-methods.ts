import type { ActionHandler, EnhancedRequest, MiddlewareHandler, Route } from '../types'
import type { Router } from './core'
import { extractParamNames, joinPaths, matchPath } from '../utils'

/**
 * HTTP methods extension for Router class
 * Uses a class extension pattern instead of prototype manipulation
 */
export function registerHttpMethods(RouterClass: typeof Router): void {
  // Extend the Router class with HTTP methods
  Object.defineProperties(RouterClass.prototype, {
    // Add a route to the router
    addRoute: {
      async value(
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

        // Add to optimized route compiler if available
        if (this.addRouteToCompiler) {
          this.addRouteToCompiler(route)
        }

        // Clear route cache when new routes are added
        this.routeCache.clear()

        return this
      },
      writable: true,
      configurable: true,
    },

    // HTTP GET method
    get: {
      async value(
        path: string,
        handler: ActionHandler,
        type?: 'api' | 'web',
        name?: string,
        middleware?: (string | MiddlewareHandler)[],
      ): Promise<Router> {
        return this.addRoute('GET', path, handler, type, name, middleware)
      },
      writable: true,
      configurable: true,
    },

    // HTTP POST method
    post: {
      async value(
        path: string,
        handler: ActionHandler,
        type?: 'api' | 'web',
        name?: string,
        middleware?: (string | MiddlewareHandler)[],
      ): Promise<Router> {
        return this.addRoute('POST', path, handler, type, name, middleware)
      },
      writable: true,
      configurable: true,
    },

    // HTTP PUT method
    put: {
      async value(
        path: string,
        handler: ActionHandler,
        type?: 'api' | 'web',
        name?: string,
        middleware?: (string | MiddlewareHandler)[],
      ): Promise<Router> {
        return this.addRoute('PUT', path, handler, type, name, middleware)
      },
      writable: true,
      configurable: true,
    },

    // HTTP PATCH method
    patch: {
      async value(
        path: string,
        handler: ActionHandler,
        type?: 'api' | 'web',
        name?: string,
        middleware?: (string | MiddlewareHandler)[],
      ): Promise<Router> {
        return this.addRoute('PATCH', path, handler, type, name, middleware)
      },
      writable: true,
      configurable: true,
    },

    // HTTP DELETE method
    delete: {
      async value(
        path: string,
        handler: ActionHandler,
        type?: 'api' | 'web',
        name?: string,
        middleware?: (string | MiddlewareHandler)[],
      ): Promise<Router> {
        return this.addRoute('DELETE', path, handler, type, name, middleware)
      },
      writable: true,
      configurable: true,
    },

    // HTTP OPTIONS method
    options: {
      async value(
        path: string,
        handler: ActionHandler,
        type?: 'api' | 'web',
        name?: string,
        middleware?: (string | MiddlewareHandler)[],
      ): Promise<Router> {
        return this.addRoute('OPTIONS', path, handler, type, name, middleware)
      },
      writable: true,
      configurable: true,
    },

    // Register a route that responds to multiple HTTP methods
    match: {
      async value(
        methods: string[],
        path: string,
        handler: ActionHandler,
        type?: 'api' | 'web',
        name?: string,
        middleware?: (string | MiddlewareHandler)[],
      ): Promise<Router> {
        for (const method of methods) {
          await this.addRoute(method, path, handler, type, name, middleware)
        }
        return this
      },
      writable: true,
      configurable: true,
    },

    // Register a route that responds to ANY HTTP method
    any: {
      async value(
        path: string,
        handler: ActionHandler,
        type?: 'api' | 'web',
        name?: string,
        middleware?: (string | MiddlewareHandler)[],
      ): Promise<Router> {
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
        return this.match(methods, path, handler, type, name, middleware)
      },
      writable: true,
      configurable: true,
    },

    // Register a fallback handler for unmatched routes
    fallback: {
      value(handler: ActionHandler): Router {
        this.fallbackHandler = handler
        return this
      },
      writable: true,
      configurable: true,
    },

    // Generate a URL for a named route
    route: {
      value(name: string, params: Record<string, string> = {}): string {
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
      },
      writable: true,
      configurable: true,
    },
  })
}

/**
 * Register redirect methods on the Router class
 */
export function registerRedirectMethods(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    redirect: {
      value(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
        const headers = new Headers()
        headers.set('Location', url)
        return new Response(null, {
          status,
          headers,
        })
      },
      writable: true,
      configurable: true,
    },

    permanentRedirect: {
      value(url: string): Response {
        return this.redirect(url, 301)
      },
      writable: true,
      configurable: true,
    },

    redirectRoute: {
      async value(from: string, to: string, status: 301 | 302 | 303 | 307 | 308 = 302): Promise<Router> {
        await this.get(from, (_req: EnhancedRequest) => {
          return this.redirect(to, status)
        })
        return this
      },
      writable: true,
      configurable: true,
    },

    permanentRedirectRoute: {
      async value(from: string, to: string): Promise<Router> {
        return this.redirectRoute(from, to, 301)
      },
      writable: true,
      configurable: true,
    },
  })
}
