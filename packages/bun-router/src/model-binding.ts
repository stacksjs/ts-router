import type { EnhancedRequest } from './types'

/**
 * Laravel-style model binding that integrates with bun-query-builder models
 */

/**
 * Base model interface compatible with bun-query-builder
 */
export interface Model {
  id: string | number
  [key: string]: any

  /**
   * Get the route key for the model (Laravel-style)
   */
  getRouteKeyName?: () => string

  /**
   * Resolve route binding for this model instance (Laravel-style)
   */
  resolveRouteBinding?: (value: string | number, field?: string) => Promise<this | null>
}

/**
 * Query builder model resolver interface for integration layer
 */
export interface QueryBuilderModelResolver<TModel extends Model = Model> {
  table: string
  queryBuilder?: any

  /**
   * Find a model by ID or custom key
   */
  find: (id: string | number, keyName?: string) => Promise<TModel | null>

  /**
   * Find a model by ID or throw if not found
   */
  findOrFail: (id: string | number, keyName?: string) => Promise<TModel>

  /**
   * Get the route key name for this model
   */
  getRouteKeyName?: () => string

  /**
   * Apply constraints to a query (for scoped binding)
   */
  applyConstraints?: (query: any, context: Record<string, Model>) => any
}

/**
 * Wrapper for bun-query-builder models to add Laravel-style route binding
 */
export class BunQueryBuilderModel<T extends Model = Model> {
  constructor(
    public definition: any, // bun-query-builder model definition
    public queryBuilder: any, // bun-query-builder instance
  ) {}

  /**
   * Get table name from bun-query-builder definition
   */
  getTableName(): string {
    return this.definition.table || `${this.definition.name.toLowerCase()}s`
  }

  /**
   * Find a model by ID using bun-query-builder's find method
   */
  async find(id: string | number): Promise<T | null> {
    try {
      const result = await this.queryBuilder.find(this.getTableName(), id)
      return result || null
    }
    catch (error) {
      console.error(`Error finding ${this.definition.name}:`, error)
      return null
    }
  }

  /**
   * Find a model by ID or throw using bun-query-builder's findOrFail method
   */
  async findOrFail(id: string | number): Promise<T> {
    try {
      return await this.queryBuilder.findOrFail(this.getTableName(), id)
    }
    catch (_error) {
      throw new ModelNotFoundError(this.definition.name, id)
    }
  }

  /**
   * Find by custom field using bun-query-builder's where method
   */
  async where(field: string, value: any): Promise<T | null> {
    try {
      const result = await this.queryBuilder
        .selectFrom(this.getTableName())
        .where(field, '=', value)
        .first()
      return result || null
    }
    catch (error) {
      console.error(`Error finding ${this.definition.name} by ${field}:`, error)
      return null
    }
  }

  /**
   * Get the default route key name for this model
   */
  getRouteKeyName(): string {
    return this.definition.primaryKey || 'id'
  }

  /**
   * Custom route binding resolution (can be overridden)
   */
  async resolveRouteBinding(value: string | number, field?: string): Promise<T | null> {
    const keyName = field || this.getRouteKeyName()

    if (keyName === 'id' || keyName === this.definition.primaryKey) {
      return await this.find(value)
    }

    return await this.where(keyName, value)
  }
}

/**
 * Parse route parameter to extract model name and custom key
 * Examples: {user} -> {name: 'user', key: undefined}
 *          {post:slug} -> {name: 'post', key: 'slug'}
 */
/**
 * Parse multiple route parameters from path
 */
export function parseRouteParameters(path: string): Array<{ name: string, key?: string }> {
  return extractModelParameters(path)
}

export function parseRouteParameter(param: string): { name: string, key?: string } {
  const match = param.match(/^\{(\w+)(?::(\w+))?\}$/)
  if (!match) {
    throw new Error(`Invalid route parameter format: ${param}`)
  }

  return {
    name: match[1],
    key: match[2],
  }
}

/**
 * Extract model parameters from route path
 */
export function extractModelParameters(path: string): Array<{ name: string, key?: string }> {
  const paramMatches = path.match(/\{[^}]+\}/g) || []
  return paramMatches.map(parseRouteParameter)
}

/**
 * Model not found error
 */
export class ModelNotFoundError extends Error {
  constructor(
    public modelName: string,
    public value: string | number,
    public field: string = 'id',
  ) {
    super(`${modelName} not found with ${field}: ${value}`)
    this.name = 'ModelNotFoundError'
  }
}

/**
 * Model binding registry for explicit bindings (Laravel Route::model and Route::bind)
 */
export class ModelBindingRegistry {
  private bindings = new Map<string, BunQueryBuilderModel | ((value: string) => Promise<Model | null>)>()

  /**
   * Register explicit model binding (Laravel Route::model style)
   */
  model<T extends Model>(parameter: string, modelWrapper: BunQueryBuilderModel<T>): void {
    this.bindings.set(parameter, modelWrapper)
  }

  /**
   * Register custom binding resolver (Laravel Route::bind style)
   */
  bind(parameter: string, resolver: (value: string) => Promise<Model | null>): void {
    this.bindings.set(parameter, resolver)
  }

  /**
   * Get binding for parameter
   */
  getBinding(parameter: string): BunQueryBuilderModel | ((value: string) => Promise<Model | null>) | undefined {
    return this.bindings.get(parameter)
  }

  /**
   * Check if parameter has explicit binding
   */
  hasBinding(parameter: string): boolean {
    return this.bindings.has(parameter)
  }
}

/**
 * Global model binding registry instance
 */
export const modelRegistry: ModelBindingRegistry = new ModelBindingRegistry()

/**
 * Model binding configuration interface
 */
export interface ModelBindingConfig {
  model: string
  key?: string
  constraints?: Record<string, any>
}

/**
 * Model class interface
 */
export interface ModelClass<T extends Model = Model> {
  new (...args: any[]): T
  find: (id: string | number) => Promise<T | null>
  findOrFail: (id: string | number) => Promise<T>
}

/**
 * Model resolver interface
 */
export interface ModelResolver<T extends Model = Model> {
  find: (id: string | number, keyName?: string) => Promise<T | null>
  findOrFail: (id: string | number, keyName?: string) => Promise<T>
  getRouteKeyName?: () => string
}

/**
 * Route binding options interface
 */
export interface RouteBindingOptions {
  model?: string
  key?: string
  constraints?: Record<string, any>
  middleware?: string[]
}

/**
 * Resolve model from route parameter using bun-query-builder
 */
export async function resolveModel<T extends Model>(
  paramName: string,
  value: string | number,
  modelWrapper: BunQueryBuilderModel<T>,
  customKey?: string,
  _context: Record<string, Model> = {},
): Promise<T | null> {
  // Use custom key if provided in route (e.g., {post:slug})
  if (customKey) {
    return await modelWrapper.resolveRouteBinding(value, customKey)
  }

  // Use model's default route key or ID
  const routeKey = modelWrapper.getRouteKeyName()
  if (routeKey !== 'id') {
    return await modelWrapper.resolveRouteBinding(value, routeKey)
  }

  // Default to ID lookup
  return await modelWrapper.find(value)
}

/**
 * Route model binding middleware factory for bun-query-builder models
 */
export function createModelBindingMiddleware(
  modelParameters: Array<{ name: string, key?: string }>,
  modelWrappers: Record<string, BunQueryBuilderModel>,
): (req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response> {
  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    const resolvedModels: Record<string, Model> = {}

    try {
      // Resolve models in order (for potential scoped binding)
      for (const param of modelParameters) {
        const value = req.params?.[param.name]
        if (!value)
          continue

        // Check for explicit binding first
        const explicitBinding = modelRegistry.getBinding(param.name)
        if (explicitBinding) {
          let model: Model | null = null

          if (typeof explicitBinding === 'function') {
            // Custom resolver function
            model = await explicitBinding(value)
          }
          else {
            // Model wrapper
            model = await resolveModel(param.name, value, explicitBinding, param.key, resolvedModels)
          }

          if (!model) {
            throw new ModelNotFoundError(param.name, value, param.key || 'id')
          }

          resolvedModels[param.name] = model
          continue
        }

        // Implicit binding - look for registered model wrapper
        const modelWrapper = modelWrappers[param.name]
        if (!modelWrapper) {
          // Skip if no model wrapper registered for this parameter
          continue
        }

        const model = await resolveModel(param.name, value, modelWrapper, param.key, resolvedModels)
        if (!model) {
          throw new ModelNotFoundError(param.name, value, param.key || 'id')
        }

        resolvedModels[param.name] = model
      }

      // Attach resolved models to request
      ;(req as any).models = resolvedModels

      return await next()
    }
    catch (error) {
      if (error instanceof ModelNotFoundError) {
        return new Response(`${error.modelName} not found`, { status: 404 })
      }
      throw error
    }
  }
}

/**
 * Create a model wrapper from bun-query-builder model definition
 */
export function createModelWrapper<T extends Model>(
  modelDefinition: any,
  queryBuilder: any,
): BunQueryBuilderModel<T> {
  return new BunQueryBuilderModel<T>(modelDefinition, queryBuilder)
}

/**
 * Apply model bindings to a route
 */
export function applyModelBindings(
  path: string,
  modelWrappers: Record<string, BunQueryBuilderModel>,
  _options?: RouteBindingOptions,
): (req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response> {
  const modelParameters = extractModelParameters(path)
  return createModelBindingMiddleware(modelParameters, modelWrappers)
}
