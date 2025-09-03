import type {
  Model,
  ModelBindingConfig,
  ModelClass,
  ModelResolver,
  RouteBindingOptions,
} from '../model-binding'
import type { EnhancedRequest, MiddlewareHandler } from '../types'
import type { Router } from './core'
import {
  applyModelBindings,
  ModelBindingRegistry,
  ModelNotFoundError,
  modelRegistry,
  parseRouteParameters,
} from '../model-binding'

/**
 * Model binding extension for Router class
 */
export function registerModelBinding(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Model binding registry for this router instance
     */
    modelRegistry: {
      value: new ModelBindingRegistry(),
      writable: true,
      configurable: true,
    },

    /**
     * Bind a model resolver to the router
     */
    bindModel: {
      value<T extends Model>(
        this: Router,
        name: string,
        resolverOrClass: ModelResolver<T> | ModelClass<T>,
      ): Router {
        if (typeof resolverOrClass === 'function') {
          // It's a resolver function
          modelRegistry.bind(name, resolverOrClass as unknown as (value: string) => Promise<Model | null>)
        }
        else {
          // It's a model class, create a resolver function
          const resolver = (value: string) => (resolverOrClass as any).find(value)
          modelRegistry.bind(name, resolver)
        }
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Set global model not found handler
     */
    onModelNotFound: {
      value(
        this: Router,
        handler: (error: ModelNotFoundError, req: EnhancedRequest) => Response,
      ): Router {
        this.modelNotFoundHandler = handler
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Create model binding middleware for a route
     */
    createModelBindingMiddleware: {
      value(
        this: Router,
        path: string,
        options?: RouteBindingOptions,
      ): MiddlewareHandler {
        const parameters = parseRouteParameters(path)
        const hasModelBindings = parameters.length > 0

        if (!hasModelBindings) {
          // No model bindings, return pass-through middleware
          return async (req, next) => next()
        }

        const paramName = parameters[0]?.name
        if (paramName) {
          const explicitBinding = modelRegistry.getBinding(paramName)
          if (explicitBinding && typeof explicitBinding === 'function') {
            modelRegistry.bind(paramName, explicitBinding)
            return async (req, next) => next()
          }
        }

        return async (req: EnhancedRequest, next) => {
          try {
            await applyModelBindings(path, {}, options)
            return await next()
          }
          catch (error) {
            if (error instanceof ModelNotFoundError) {
              // Use custom response if provided
              if ((error as any).response) {
                return (error as any).response
              }

              // Use global handler if set
              if (this.modelNotFoundHandler) {
                return this.modelNotFoundHandler(error, req)
              }

              // Default 404 response
              return new Response(
                JSON.stringify({
                  error: 'Not Found',
                  message: error.message,
                  resource: (error as any).model,
                  id: (error as any).id,
                }),
                {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }
            throw error
          }
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Enhanced route registration that includes model binding
     */
    registerRouteWithBinding: {
      async value(
        this: Router,
        method: string,
        path: string,
        handler: any,
        _options?: RouteBindingOptions & { middleware?: (string | MiddlewareHandler)[] },
      ): Promise<Router> {
        const middleware = _options?.middleware || []

        // Add model binding middleware as the first middleware
        // Apply model bindings directly without middleware
        // const modelBindingMiddleware = this.createModelBindingMiddleware(path, options)
        const allMiddleware = [...middleware]

        // Register the route with enhanced middleware
        return await (this as any)[method.toLowerCase()](path, handler, {
          ..._options,
          middleware: allMiddleware,
        })
      },
      writable: true,
      configurable: true,
    },

    /**
     * Enhanced GET route with model binding
     */
    getWithBinding: {
      async value(
        this: Router,
        path: string,
        handler: any,
        _options?: RouteBindingOptions & { middleware?: (string | MiddlewareHandler)[] },
      ): Promise<Router> {
        // Use base get method for now
        return this.get(path, handler)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Enhanced POST route with model binding
     */
    postWithBinding: {
      async value(
        this: Router,
        path: string,
        handler: any,
        _options?: RouteBindingOptions & { middleware?: (string | MiddlewareHandler)[] },
      ): Promise<Router> {
        // Use base post method for now
        return this.post(path, handler)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Enhanced PUT route with model binding
     */
    putWithBinding: {
      async value(
        this: Router,
        path: string,
        handler: any,
        _options?: RouteBindingOptions & { middleware?: (string | MiddlewareHandler)[] },
      ): Promise<Router> {
        // Use base put method for now
        return this.put(path, handler)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Enhanced DELETE route with model binding
     */
    deleteWithBinding: {
      async value(
        this: Router,
        path: string,
        handler: any,
        _options?: RouteBindingOptions & { middleware?: (string | MiddlewareHandler)[] },
      ): Promise<Router> {
        // Use base delete method for now
        return this.delete(path, handler)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Enhanced PATCH route with model binding
     */
    patchWithBinding: {
      async value(
        this: Router,
        path: string,
        handler: any,
        _options?: RouteBindingOptions & { middleware?: (string | MiddlewareHandler)[] },
      ): Promise<Router> {
        // Use base patch method for now
        return this.patch(path, handler)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Create a resource route with automatic model binding
     */
    resourceWithBinding: {
      async value(
        this: Router,
        path: string,
        controller: string,
        options?: {
          model?: string
          scoped?: boolean
          only?: string[]
          except?: string[]
          bindings?: Record<string, ModelBindingConfig>
          middleware?: (string | MiddlewareHandler)[]
        },
      ): Promise<Router> {
        const actions = options?.only || ['index', 'show', 'store', 'update', 'destroy']
        const except = options?.except || []
        const finalActions = actions.filter(action => !except.includes(action))

        // Extract model name from path or use provided model
        const modelName = options?.model || 'model'
        const _singularPath = path.replace(/s$/, '')
        const paramName = 'id'

        for (const action of finalActions) {
          let routePath = path
          let method = 'GET'
          const actionMethod = 'index'

          switch (action) {
            case 'index':
              method = 'GET'
              break
            case 'show':
              method = 'GET'
              routePath = `${path}/{${paramName}:${modelName}}`
              break
            case 'store':
              method = 'POST'
              break
            case 'update':
              method = 'PUT'
              routePath = `${path}/{${paramName}:${modelName}}`
              break
            case 'destroy':
              method = 'DELETE'
              routePath = `${path}/{${paramName}:${modelName}}`
              break
          }

          const handler = `${controller}@${actionMethod}`

          // Use appropriate HTTP method
          const routeMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
          await (this as any)[routeMethod](routePath, handler, {
            bindings: options?.bindings,
            middleware: options?.middleware,
          })
        }

        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Extract model name from resource path
     */
    extractModelNameFromPath: {
      value(path: string): string {
        const segments = path.split('/').filter(Boolean)
        const lastSegment = segments[segments.length - 1]
        // Convert plural to singular and capitalize
        return this.singularize(lastSegment).charAt(0).toUpperCase()
          + this.singularize(lastSegment).slice(1)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get singular form of a path
     */
    getSingularPath: {
      value(path: string): string {
        const segments = path.split('/').filter(Boolean)
        const lastSegment = segments[segments.length - 1]
        return this.singularize(lastSegment)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get parameter name from path
     */
    getParamNameFromPath: {
      value(singularPath: string): string {
        return singularPath.toLowerCase()
      },
      writable: true,
      configurable: true,
    },

    /**
     * Simple pluralization helper (can be enhanced with a proper library)
     */
    singularize: {
      value(word: string): string {
        if (word.endsWith('ies')) {
          return `${word.slice(0, -3)}y`
        }
        if (word.endsWith('es')) {
          return word.slice(0, -2)
        }
        if (word.endsWith('s')) {
          return word.slice(0, -1)
        }
        return word
      },
      writable: true,
      configurable: true,
    },

    /**
     * Model not found handler
     */
    modelNotFoundHandler: {
      value: null as ((error: ModelNotFoundError, req: EnhancedRequest) => Response) | null,
      writable: true,
      configurable: true,
    },
  })
}
