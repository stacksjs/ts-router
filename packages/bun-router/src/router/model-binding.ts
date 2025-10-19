import type {
  EnhancedRequest,
  MiddlewareHandler,
} from '../types'
import type { Router } from './router'
import {
  modelRegistry,
} from '../model-binding/model-registry'

/**
 * Model binding extension for Router class
 */
export function registerModelBinding(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Model binding registry for this router instance
     */
    modelRegistry: {
      value: modelRegistry,
      writable: true,
      configurable: true,
    },

    /**
     * Laravel-style Route::model() - Explicit binding
     * Explicitly bind a route parameter to a model
     */
    model: {
      value<T>(
        this: Router,
        key: string,
        modelClass: string | ((value: string) => Promise<T | null>),
        callback?: (model: T | null) => Response | null,
      ): Router {
        if (typeof modelClass === 'string') {
          // Register string-based model class
          this.modelRegistry.register(key, {
            resolver: async (params) => {
              // For string-based registration, we'll just pass through
              // In a real Laravel app, this would resolve the model class
              console.warn(`Model class ${modelClass} not implemented`)
              // Return a mock model for testing
              return { id: params[key], modelClass }
            },
            errorHandling: callback
              ? {
                  notFound: _params => callback(null) || new Response('Not Found', { status: 404 }),
                }
              : undefined,
          })
        }
        else {
          // Register function-based resolver
          this.modelRegistry.register(key, {
            resolver: async (params) => {
              const value = params[key]
              if (!value)
                return null
              return modelClass(value)
            },
            errorHandling: callback
              ? {
                  notFound: _params => callback(null) || new Response('Not Found', { status: 404 }),
                }
              : undefined,
          })
        }
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Laravel-style implicit binding middleware
     * Automatically resolves models based on route parameters
     */
    implicitBinding: {
      value(this: Router): MiddlewareHandler {
        return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
          if (!req.params)
            return next()

          // Resolve all parameters that might be models
          for (const [paramName, _paramValue] of Object.entries(req.params)) {
            // Check if we have a registered model for this parameter
            if (this.modelRegistry.has(paramName)) {
              try {
                const result = await this.modelRegistry.resolve(paramName, req.params, req)

                if (result.model === null) {
                  if (result.status === 500) {
                    // Handle resolver errors
                    return new Response(JSON.stringify({
                      error: 'Internal Server Error',
                      message: result.error || 'Model resolution failed',
                    }), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' },
                    })
                  }
                  else if (result.status === 404) {
                    return this.modelRegistry.createErrorResponse(paramName, result, req.params)
                  }
                }
                else {
                  // Attach the resolved model to the request
                  ;(req as any)[paramName] = result.model
                }
              }
              catch (error) {
                // Handle unexpected errors in model resolution
                return new Response(JSON.stringify({
                  error: 'Internal Server Error',
                  message: error instanceof Error ? error.message : 'Model resolution failed',
                }), {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' },
                })
              }
            }
          }

          return next()
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Laravel-style missing() method for customizing 404 responses
     */
    missing: {
      value(
        this: Router,
        callback: (req: EnhancedRequest) => Response,
      ): MiddlewareHandler {
        return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
          try {
            return await next()
          }
          catch (_error) {
            // If it's a model not found error, use the custom callback
            return callback(req)
          }
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Laravel-style scoped bindings
     * Scope a model binding to its parent
     */
    scopedBindings: {
      value(this: Router, bindings: Record<string, string>): MiddlewareHandler {
        return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
          if (!req.params)
            return next()

          // Apply scoped bindings
          for (const [childParam, parentParam] of Object.entries(bindings)) {
            if (req.params[childParam] && req.params[parentParam]) {
              // This would validate that the child belongs to the parent
              // For now, we just pass through
            }
          }

          return next()
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Clear model cache
     */
    clearModelCache: {
      value(modelName?: string): Router {
        if (modelName) {
          this.modelRegistry.clearCache(modelName)
        }
        else {
          this.modelRegistry.clearAllCache()
        }
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get model registry statistics
     */
    getModelStats: {
      value() {
        return this.modelRegistry.getCacheStats()
      },
      writable: true,
      configurable: true,
    },
  })
}
