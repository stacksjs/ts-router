import type { EnhancedRequest, MiddlewareHandler, NextFunction, Route } from '../types'
import type { Router } from './router'
import { resolveHandler as resolveHandlerUtil, wrapResponse } from './handler-resolver'

/**
 * Middleware handling extension for Router class
 */
export function registerMiddlewareHandling(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Add middleware to the router
     */
    use: {
      async value(...middleware: (string | MiddlewareHandler)[]): Promise<Router> {
        for (const mw of middleware) {
          const resolvedMiddleware = await this.resolveMiddleware(mw)
          if (resolvedMiddleware) {
            this.globalMiddleware.push(resolvedMiddleware)
          }
        }
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Resolve a middleware string or function to a middleware handler
     */
    resolveMiddleware: {
      async value(middleware: string | MiddlewareHandler): Promise<MiddlewareHandler | null> {
        if (typeof middleware === 'function') {
          return middleware
        }

        if (typeof middleware === 'string') {
          try {
            // Try to import from project middleware directory
            const importedMiddleware = await import(`../middleware/${middleware}.ts`)
            if (importedMiddleware.default && typeof importedMiddleware.default === 'function') {
              return importedMiddleware.default
            }

            // If it's a class with a handle method, instantiate it
            if (importedMiddleware.default && typeof importedMiddleware.default.handle === 'function') {
              return (req: EnhancedRequest, next: NextFunction) => {
                return importedMiddleware.default.handle(req, next)
              }
            }
          }
          catch (error) {
            console.error(`Failed to load middleware "${middleware}":`, error)
          }
        }

        return null
      },
      writable: true,
      configurable: true,
    },

    /**
     * Build an optimized middleware chain
     */
    buildMiddlewareChain: {
      value(middlewares: MiddlewareHandler[]): (req: EnhancedRequest) => Promise<Response | null> {
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
      },
      writable: true,
      configurable: true,
    },

    /**
     * Run middleware stack for a request
     */
    runMiddleware: {
      async value(req: EnhancedRequest, middlewareStack: MiddlewareHandler[]): Promise<Response | null> {
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
      },
      writable: true,
      configurable: true,
    },

    /**
     * Add middleware to a route group
     */
    middleware: {
      value(...middleware: (string | MiddlewareHandler)[]): Router {
        if (this.currentGroup) {
          if (!this.currentGroup.middleware) {
            this.currentGroup.middleware = []
          }
          this.currentGroup.middleware.push(...middleware)
        }
        else {
          // Apply to the most recently added route
          const lastRoute = this.routes[this.routes.length - 1]
          if (lastRoute) {
            this.applyMiddlewareToRoute(lastRoute, middleware)
          }
        }

        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Apply middleware to a specific route
     */
    applyMiddlewareToRoute: {
      async value(route: Route, middleware: (string | MiddlewareHandler)[]): Promise<void> {
        for (const mw of middleware) {
          const resolvedMiddleware = await this.resolveMiddleware(mw)
          if (resolvedMiddleware) {
            route.middleware.push(resolvedMiddleware)
          }
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Resolve an action handler
     *
     * Supports:
     * - Functions returning Response or any value (auto-wrapped)
     * - String file paths like 'UserAction.ts', './actions/UserAction'
     * - Controller@method patterns like 'UserController@index'
     * - Class constructors with handle() method
     * - Class instances with handle() method
     */
    resolveHandler: {
      async value(handler: any, req: EnhancedRequest): Promise<Response> {
        return resolveHandlerUtil(handler, req, this.config)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Wrap a value in a Response object
     * Useful for handlers that return non-Response values
     */
    wrapResponse: {
      value: wrapResponse,
      writable: true,
      configurable: true,
    },

    /**
     * Register an error handler
     */
    onError: {
      async value(handler: (error: Error) => Response | Promise<Response>): Promise<Router> {
        this.errorHandler = handler
        return this
      },
      writable: true,
      configurable: true,
    },
  })
}
