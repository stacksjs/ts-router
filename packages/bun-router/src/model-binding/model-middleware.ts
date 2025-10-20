import type {
  EnhancedRequest,
  ExtractRouteParams,
  ModelBinding,
} from '../types'
import { modelRegistry } from './model-registry'

/**
 * Model binding middleware options
 */
export interface ModelBindingMiddlewareOptions {
  failOnError?: boolean
  attachToRequest?: boolean
  paramMapping?: Record<string, string>
}

/**
 * Simplified model binding configuration for middleware
 */
export interface ModelBindingRef {
  model: string
  parameter: string
  required?: boolean
  as?: string
}

/**
 * Create model binding middleware
 */
export function createModelBindingMiddleware(
  bindings: ModelBindingRef[],
  options: ModelBindingMiddlewareOptions = {},
) {
  const {
    failOnError = true,
    attachToRequest = true,
    paramMapping = {},
  } = options

  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    const models: Record<string, any> = {}
    const errors: Record<string, string> = {}

    // Resolve all model bindings
    for (const binding of bindings) {
      const paramName = paramMapping[binding.model] || binding.parameter
      const paramValue = req.params?.[paramName]

      if (!paramValue && binding.required !== false) {
        const error = `Required parameter '${paramName}' for model '${binding.model}' not found`
        errors[binding.model] = error

        if (failOnError) {
          return new Response(
            JSON.stringify({
              error,
              status: 400,
              message: 'Missing required parameter',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        continue
      }

      if (!paramValue) {
        continue // Skip optional parameters that are not provided
      }

      const params = { [paramName]: paramValue, ...req.params }
      const result = await modelRegistry.resolve(binding.model, params, req)

      if (result.model === null) {
        errors[binding.model] = result.error || 'Model not found'

        if (failOnError) {
          return modelRegistry.createErrorResponse(binding.model, result, params)
        }
        continue
      }

      models[binding.model] = result.model

      // Attach to request if enabled
      if (attachToRequest) {
        const propertyName = binding.as || binding.model
        ;(req as any)[propertyName] = result.model
      }
    }

    // Add models and errors to request context
    req.models = models
    req.modelErrors = errors

    return next()
  }
}

/**
 * Single model binding middleware
 */
export function bindModel(
  modelName: string,
  parameterName: string,
  options: {
    required?: boolean
    as?: string
    failOnError?: boolean
  } = {},
) {
  const {
    required = true,
    as,
    failOnError = true,
  } = options

  return createModelBindingMiddleware(
    [
      {
        model: modelName,
        parameter: parameterName,
        required,
        as,
      },
    ],
    { failOnError, attachToRequest: true },
  )
}

/**
 * Route parameter model binding decorator
 */
export function withModelBinding<TPath extends string>(
  bindings: ModelBindingRef[],
) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value

    descriptor.value = async function (
      req: EnhancedRequest & { params: ExtractRouteParams<TPath> },
      ...args: any[]
    ) {
      const middleware = createModelBindingMiddleware(bindings, {
        failOnError: true,
        attachToRequest: true,
      })

      const mockNext = () => {
        return Promise.resolve(new Response('OK'))
      }

      const response = await middleware(req, mockNext)

      // If middleware returned an error response, return it
      if (response.status >= 400) {
        return response
      }

      // Otherwise, call the original method
      return originalMethod.call(this, req, ...args)
    }

    return descriptor
  }
}

/**
 * Model binding utilities for middleware
 */
export const ModelBindingUtils = {
  /**
   * Create middleware for a specific model type
   */
  forModel<T>(
    modelName: string,
    paramName: string,
    options: {
      validator?: (model: T) => boolean | Promise<boolean>
      transformer?: (model: T) => T | Promise<T>
      cache?: boolean
    } = {},
  ) {
    return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      const paramValue = req.params?.[paramName]
      if (!paramValue) {
        return new Response('Missing required parameter', { status: 400 })
      }

      const result = await modelRegistry.resolve<T>(
        modelName,
        { [paramName]: paramValue, ...req.params },
        req,
      )

      if (result.model === null) {
        return modelRegistry.createErrorResponse(modelName, result, req.params || {})
      }

      let model = result.model

      // Apply custom validation
      if (options.validator && !(await options.validator(model))) {
        return new Response('Model validation failed', { status: 422 })
      }

      // Apply custom transformation
      if (options.transformer) {
        model = await options.transformer(model) as T
      }

      // Attach to request
      ;(req as any)[modelName] = model

      return next()
    }
  },

  /**
   * Create middleware that binds multiple models
   */
  multiple(bindings: Array<{ model: string, param: string, required?: boolean }>) {
    return createModelBindingMiddleware(
      bindings.map(binding => ({
        model: binding.model,
        parameter: binding.param,
        required: binding.required ?? true,
      })),
    )
  },

  /**
   * Create middleware that validates model ownership
   */
  requireOwnership<T extends { userId?: string | number }>(
    modelName: string,
    userIdField: string = 'userId',
  ) {
    return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      const model = (req as any)[modelName] as T
      if (!model) {
        return new Response(`Model '${modelName}' not found in request`, { status: 500 })
      }

      const userId = req.user?.id
      if (!userId) {
        return new Response('Authentication required', { status: 401 })
      }

      const modelUserId = (model as any)[userIdField]
      if (modelUserId && modelUserId.toString() !== userId.toString()) {
        return new Response('Access denied', { status: 403 })
      }

      return next()
    }
  },

  /**
   * Create middleware that caches resolved models
   */
  withCache(
    modelName: string,
    paramName: string,
    _options: {
      ttl?: number
      keyGenerator?: (params: Record<string, string>) => string
    } = {},
  ) {
    return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      // This would integrate with the model registry's caching system
      // For now, just resolve normally
      const paramValue = req.params?.[paramName]
      if (!paramValue) {
        return new Response('Missing required parameter', { status: 400 })
      }

      const result = await modelRegistry.resolve(
        modelName,
        { [paramName]: paramValue, ...req.params },
        req,
      )

      if (result.model === null) {
        return modelRegistry.createErrorResponse(modelName, result, req.params || {})
      }

      ;(req as any)[modelName] = result.model
      return next()
    }
  },

  /**
   * Create middleware that handles optional model binding
   */
  optional(modelName: string, paramName: string) {
    return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      const paramValue = req.params?.[paramName]
      if (!paramValue) {
        // Set model to null if parameter is not provided
        ;(req as any)[modelName] = null
        return next()
      }

      const result = await modelRegistry.resolve(
        modelName,
        { [paramName]: paramValue, ...req.params },
        req,
      )

      // For optional bindings, we don't fail on resolution errors
      ;(req as any)[modelName] = result.model || null

      return next()
    }
  },
}

/**
 * Model binding middleware factory
 */
export class ModelBindingFactory {
  /**
   * Create binding for user model
   */
  static user(paramName: string = 'id', as: string = 'user') {
    return bindModel('user', paramName, { as, required: true })
  }

  /**
   * Create binding for post model
   */
  static post(paramName: string = 'postId', as: string = 'post') {
    return bindModel('post', paramName, { as, required: true })
  }

  /**
   * Create binding for category model
   */
  static category(paramName: string = 'categoryId', as: string = 'category') {
    return bindModel('category', paramName, { as, required: true })
  }

  /**
   * Create binding for any resource with ownership validation
   */
  static ownedResource(
    modelName: string,
    paramName: string,
    userIdField: string = 'userId',
  ) {
    return [
      bindModel(modelName, paramName),
      ModelBindingUtils.requireOwnership(modelName, userIdField),
    ]
  }

  /**
   * Create nested resource bindings (e.g., user -> posts)
   */
  static nested(
    parentModel: string,
    parentParam: string,
    childModel: string,
    childParam: string,
  ) {
    return createModelBindingMiddleware([
      {
        model: parentModel,
        parameter: parentParam,
        required: true,
      },
      {
        model: childModel,
        parameter: childParam,
        required: true,
      },
    ])
  }
}

/**
 * Type-safe model binding helpers
 */
export const TypedModelBinding = {
  /**
   * Create a typed model binding that preserves route parameter types
   */
  create<TPath extends string>(
    bindings: Array<{
      model: string
      param: keyof ExtractRouteParams<TPath>
      required?: boolean
      as?: string
    }>,
  ) {
    return createModelBindingMiddleware(
      bindings.map(binding => ({
        model: binding.model,
        parameter: String(binding.param),
        required: binding.required ?? true,
        as: binding.as,
      })),
    )
  },

  /**
   * Create a single typed model binding
   */
  single<TPath extends string>(
    modelName: string,
    param: keyof ExtractRouteParams<TPath>,
    options: {
      required?: boolean
      as?: string
    } = {},
  ) {
    return bindModel(modelName, String(param), options)
  },
}
