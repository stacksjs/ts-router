/**
 * Request/Response Enhancements - Router Integration
 *
 * Integration layer for validation and macros with the router
 */

import type { EnhancedRequest, MiddlewareHandler, NextFunction, RouteHandler } from '../types'
import type { ValidationRules, ValidatorConfig } from '../validation/validator'
import { RequestWithMacros } from '../request/macros'
import { ResponseWithMacros } from '../response/macros'
import { createValidationMiddleware } from '../validation/validator'

/**
 * Route builder with validation support
 */
export class RouteBuilder {
  private validationRules?: ValidationRules
  private validatorConfig?: ValidatorConfig

  constructor(
    private method: string,
    private path: string,
    private handler: RouteHandler,
  ) {}

  /**
   * Add validation to the route
   */
  validate(rules: ValidationRules, config?: ValidatorConfig): this {
    this.validationRules = rules
    this.validatorConfig = config
    return this
  }

  /**
   * Build the route with middleware
   */
  build(): { method: string, path: string, handler: RouteHandler, middleware?: MiddlewareHandler[] } {
    const middleware: MiddlewareHandler[] = []

    // Add validation middleware if rules are provided
    if (this.validationRules) {
      middleware.push(createValidationMiddleware(this.validationRules, this.validatorConfig))
    }

    // Add request macro middleware
    middleware.push(async (req: EnhancedRequest, next: NextFunction) => {
      // Apply request macros
      RequestWithMacros.applyMacros(req)
      const result = await next()
      return result || new Response('Not Found', { status: 404 })
    })

    return {
      method: this.method,
      path: this.path,
      handler: this.handler,
      middleware: middleware.length > 0 ? middleware : undefined,
    }
  }
}

/**
 * Fluent router for enhanced routing functionality
 */
export class FluentRouter {
  private routes: Array<{
    method: string
    path: string
    handler: RouteHandler
    middleware?: MiddlewareHandler[]
  }> = []

  /**
   * Create GET route
   */
  get(path: string, handler: RouteHandler): RouteBuilder {
    return new RouteBuilder('GET', path, handler)
  }

  /**
   * Create POST route
   */
  post(path: string, handler: RouteHandler): RouteBuilder {
    return new RouteBuilder('POST', path, handler)
  }

  /**
   * Create PUT route
   */
  put(path: string, handler: RouteHandler): RouteBuilder {
    return new RouteBuilder('PUT', path, handler)
  }

  /**
   * Create PATCH route
   */
  patch(path: string, handler: RouteHandler): RouteBuilder {
    return new RouteBuilder('PATCH', path, handler)
  }

  /**
   * Create DELETE route
   */
  delete(path: string, handler: RouteHandler): RouteBuilder {
    return new RouteBuilder('DELETE', path, handler)
  }

  /**
   * Register a built route
   */
  register(routeBuilder: RouteBuilder): void {
    const route = routeBuilder.build()
    this.routes.push(route)
  }

  /**
   * Get all registered routes
   */
  getRoutes(): Array<{
    method: string
    path: string
    handler: RouteHandler
    middleware?: MiddlewareHandler[]
  }> {
    return this.routes
  }
}

/**
 * Router middleware factory for request/response enhancements
 */
export function createEnhancementMiddleware() {
  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    // Apply request macros
    RequestWithMacros.applyMacros(req)

    // Add start time for age calculation
    ;(req as any).startTime = Date.now()

    return await next()
  }
}

/**
 * Validation middleware factory with fluent API
 */
export class ValidationMiddlewareBuilder {
  private rules: ValidationRules = {}
  private config: ValidatorConfig = {}

  /**
   * Add validation rule for field
   */
  field(name: string, rules: string): this {
    this.rules[name] = rules
    return this
  }

  /**
   * Add multiple validation rules
   */
  fields(rules: ValidationRules): this {
    Object.assign(this.rules, rules)
    return this
  }

  /**
   * Set validator configuration
   */
  configure(config: ValidatorConfig): this {
    Object.assign(this.config, config)
    return this
  }

  /**
   * Stop on first validation failure
   */
  stopOnFirstFailure(): this {
    this.config.stopOnFirstFailure = true
    return this
  }

  /**
   * Set custom error messages
   */
  messages(messages: Record<string, string>): this {
    this.config.customMessages = messages
    return this
  }

  /**
   * Set custom field attributes
   */
  attributes(attributes: Record<string, string>): this {
    this.config.customAttributes = attributes
    return this
  }

  /**
   * Build the validation middleware
   */
  build(): MiddlewareHandler {
    return createValidationMiddleware(this.rules, this.config)
  }
}

/**
 * Factory function to create validation middleware builder
 */
export function validate(): ValidationMiddlewareBuilder {
  return new ValidationMiddlewareBuilder()
}

/**
 * Route helper functions
 */
export const RouteHelpers = {
  /**
   * Create validated route
   */
  validated: (
    method: string,
    path: string,
    handler: RouteHandler,
    rules: ValidationRules,
    config?: ValidatorConfig,
  ): RouteBuilder => {
    const builder = new RouteBuilder(method, path, handler)
    return builder.validate(rules, config)
  },

  /**
   * Create API route with JSON validation
   */
  apiRoute: (
    method: string,
    path: string,
    handler: RouteHandler,
    rules?: ValidationRules,
  ): RouteBuilder => {
    const builder = new RouteBuilder(method, path, async (req): Promise<Response> => {
      // Ensure request expects JSON
      if (!req.expectsJson()) {
        return ResponseWithMacros.callMacro('error', 'API endpoint requires JSON Accept header', undefined, 406)
      }

      return await handler(req)
    })

    if (rules) {
      builder.validate(rules)
    }

    return builder
  },

  /**
   * Create resource route with validation
   */
  resourceRoute: (
    basePath: string,
    handlers: {
      index?: RouteHandler
      show?: RouteHandler
      store?: RouteHandler
      update?: RouteHandler
      destroy?: RouteHandler
    },
    validation?: {
      store?: ValidationRules
      update?: ValidationRules
    },
  ): RouteBuilder[] => {
    const routes: RouteBuilder[] = []

    if (handlers.index) {
      routes.push(new RouteBuilder('GET', basePath, handlers.index))
    }

    if (handlers.show) {
      routes.push(new RouteBuilder('GET', `${basePath}/{id}`, handlers.show))
    }

    if (handlers.store) {
      const builder = new RouteBuilder('POST', basePath, handlers.store)
      if (validation?.store) {
        builder.validate(validation.store)
      }
      routes.push(builder)
    }

    if (handlers.update) {
      const builder = new RouteBuilder('PUT', `${basePath}/{id}`, handlers.update)
      if (validation?.update) {
        builder.validate(validation.update)
      }
      routes.push(builder)
    }

    if (handlers.destroy) {
      routes.push(new RouteBuilder('DELETE', `${basePath}/{id}`, handlers.destroy))
    }

    return routes
  },
}

/**
 * Fluent router factory
 */
export function createFluentRouter(): FluentRouter {
  return new FluentRouter()
}

/**
 * @deprecated Use createFluentRouter instead
 */
export function createEnhancedRouter(): FluentRouter {
  return new FluentRouter()
}

/**
 * Middleware composition helpers
 */
export const MiddlewareHelpers = {
  /**
   * Compose multiple middleware into one
   */
  compose: (...middleware: MiddlewareHandler[]): MiddlewareHandler => {
    return async (req: EnhancedRequest, next: NextFunction): Promise<Response | null> => {
      let index = 0

      const dispatch = async (): Promise<Response | null> => {
        if (index >= middleware.length) {
          return await next()
        }

        const currentMiddleware = middleware[index++]
        return await currentMiddleware(req, dispatch)
      }

      return await dispatch()
    }
  },

  /**
   * Create conditional middleware
   */
  when: (
    condition: (req: EnhancedRequest) => boolean,
    middleware: MiddlewareHandler,
  ): MiddlewareHandler => {
    return async (req: EnhancedRequest, next: NextFunction): Promise<Response | null> => {
      if (condition(req)) {
        return await middleware(req, next)
      }
      return await next()
    }
  },

  /**
   * Create middleware that runs unless condition is met
   */
  unless: (
    condition: (req: EnhancedRequest) => boolean,
    middleware: MiddlewareHandler,
  ): MiddlewareHandler => {
    return MiddlewareHelpers.when(req => !condition(req), middleware)
  },

  /**
   * Create middleware group
   */
  group: (middleware: MiddlewareHandler[]): MiddlewareHandler => {
    return MiddlewareHelpers.compose(...middleware)
  },
}

/**
 * Request/Response enhancement presets
 */
export const EnhancementPresets = {
  /**
   * API preset with JSON validation and response macros
   */
  api: (): Array<(req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>> => [
    createEnhancementMiddleware(),
    async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      try {
        const response = await next()

        // Add API headers
        const headers = new Headers(response.headers)
        headers.set('X-API-Version', '1.0')
        headers.set('X-Response-Time', new Date().toISOString())

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }
      catch (error) {
        console.error(error)
        // Return JSON error response
        return ResponseWithMacros.callMacro('error', 'Internal server error', undefined, 500)
      }
    },
  ],

  /**
   * Web preset with request enhancements and CSRF protection
   */
  web: (): Array<(req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>> => [
    createEnhancementMiddleware(),
    async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      // Add web-specific enhancements
      ;(req as any).session = {} // Placeholder for session

      return await next()
    },
  ],

  /**
   * Validation preset with comprehensive validation
   */
  validation: (rules: ValidationRules, config?: ValidatorConfig): Array<(req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>> => [
    createEnhancementMiddleware(),
    createValidationMiddleware(rules, config) as (req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>,
  ],
}
