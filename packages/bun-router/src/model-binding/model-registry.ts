import type {
  EnhancedRequest,
  ModelResolver,
  ModelTransformerFn,
  ModelValidatorFn,
} from '../types'

/**
 * Model resolution result
 */
export interface ModelResolutionResult<T = any> {
  model: T | null
  error?: string
  status?: number
}

/**
 * Model binding configuration for a specific model
 */
export interface ModelBindingConfig<T = any> {
  resolver: ModelResolver<T>
  validator?: ModelValidatorFn<T>
  transformer?: ModelTransformerFn<T>
  cache?: {
    enabled: boolean
    ttl: number
    key?: (params: Record<string, string>) => string
  }
  errorHandling?: {
    notFound?: (params: Record<string, string>) => Response
    validation?: (model: T, error: string) => Response
    transform?: (error: string) => Response
  }
}

/**
 * Model cache entry
 */
interface ModelCacheEntry<T> {
  model: T
  timestamp: number
  ttl: number
}

/**
 * Model registry for managing model bindings
 */
export class ModelRegistry {
  private models = new Map<string, ModelBindingConfig>()
  private cache = new Map<string, ModelCacheEntry<any>>()

  /**
   * Register a model binding
   */
  register<T>(name: string, config: ModelBindingConfig<T>): void {
    this.models.set(name, config as ModelBindingConfig)
  }

  /**
   * Get model binding configuration
   */
  get(name: string): ModelBindingConfig | undefined {
    return this.models.get(name)
  }

  /**
   * Check if model is registered
   */
  has(name: string): boolean {
    return this.models.has(name)
  }

  /**
   * Resolve a model using its binding
   */
  async resolve<T>(
    modelName: string,
    params: Record<string, string>,
    req?: EnhancedRequest,
  ): Promise<ModelResolutionResult<T>> {
    const config = this.models.get(modelName)
    if (!config) {
      return {
        model: null,
        error: `Model binding '${modelName}' not found`,
        status: 500,
      }
    }

    try {
      // Check cache first
      if (config.cache?.enabled) {
        const cached = this.getCachedModel<T>(modelName, params, config)
        if (cached) {
          return { model: cached }
        }
      }

      // Resolve the model
      const model = await config.resolver(params, req)

      if (model === null || model === undefined) {
        return {
          model: null,
          error: `${modelName} not found`,
          status: 404,
        }
      }

      // Validate the model
      if (config.validator) {
        const validationResult = await config.validator(model, params, req)
        if (!validationResult.valid) {
          return {
            model: null,
            error: validationResult.error || 'Model validation failed',
            status: validationResult.status || 422,
          }
        }
      }

      // Transform the model
      let finalModel = model
      if (config.transformer) {
        finalModel = await config.transformer(model, params, req)
      }

      // Cache the result
      if (config.cache?.enabled) {
        this.cacheModel(modelName, params, finalModel, config)
      }

      return { model: finalModel }
    }
    catch (error) {
      return {
        model: null,
        error: error instanceof Error ? error.message : 'Model resolution failed',
        status: 500,
      }
    }
  }

  /**
   * Create error response for model binding failure
   */
  createErrorResponse(
    modelName: string,
    result: ModelResolutionResult,
    params: Record<string, string>,
  ): Response {
    const config = this.models.get(modelName)
    const status = result.status || 404
    const error = result.error || 'Model not found'

    // Use custom error handler if available
    if (config?.errorHandling) {
      if (status === 404 && config.errorHandling.notFound) {
        return config.errorHandling.notFound(params)
      }
      if (status === 422 && config.errorHandling.validation) {
        return config.errorHandling.validation(null, error)
      }
      if (config.errorHandling.transform) {
        return config.errorHandling.transform(error)
      }
    }

    // Default error response
    return new Response(
      JSON.stringify({
        error,
        status,
        message: `Failed to resolve ${modelName}`,
      }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  /**
   * Clear cache for a specific model
   */
  clearCache(modelName: string, params?: Record<string, string>): void {
    if (params) {
      const config = this.models.get(modelName)
      if (config?.cache) {
        const cacheKey = this.generateCacheKey(modelName, params, config)
        this.cache.delete(cacheKey)
      }
    }
    else {
      // Clear all cache entries for this model
      const keysToDelete: string[] = []
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${modelName}:`)) {
          keysToDelete.push(key)
        }
      }
      for (const key of keysToDelete) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const now = Date.now()
    let validEntries = 0
    let expiredEntries = 0

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredEntries++
      }
      else {
        validEntries++
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      models: this.models.size,
    }
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache(): number {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key)
    }

    return keysToDelete.length
  }

  /**
   * Get cached model if available and valid
   */
  private getCachedModel<T>(
    modelName: string,
    params: Record<string, string>,
    config: ModelBindingConfig,
  ): T | null {
    if (!config.cache?.enabled)
      return null

    const cacheKey = this.generateCacheKey(modelName, params, config)
    const cached = this.cache.get(cacheKey)

    if (!cached)
      return null

    const now = Date.now()
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(cacheKey)
      return null
    }

    return cached.model
  }

  /**
   * Cache a model
   */
  private cacheModel<T>(
    modelName: string,
    params: Record<string, string>,
    model: T,
    config: ModelBindingConfig,
  ): void {
    if (!config.cache?.enabled)
      return

    const cacheKey = this.generateCacheKey(modelName, params, config)
    this.cache.set(cacheKey, {
      model,
      timestamp: Date.now(),
      ttl: config.cache.ttl,
    })
  }

  /**
   * Generate cache key for model
   */
  private generateCacheKey(
    modelName: string,
    params: Record<string, string>,
    config: ModelBindingConfig,
  ): string {
    if (config.cache?.key) {
      return `${modelName}:${config.cache.key(params)}`
    }

    const paramString = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&')

    return `${modelName}:${paramString}`
  }
}

/**
 * Global model registry instance
 */
export const modelRegistry = new ModelRegistry()

/**
 * Model binding utilities
 */
export const ModelUtils = {
  /**
   * Create a simple resolver for database models
   */
  dbResolver<T>(
    tableName: string,
    idField: string = 'id',
    db?: any,
  ): ModelResolver<T> {
    return async (params) => {
      const id = params[idField]
      if (!id)
        return null

      // This is a placeholder - replace with your actual database logic
      if (db && typeof db.query === 'function') {
        const result = await db.query(`SELECT * FROM ${tableName} WHERE ${idField} = ?`, [id])
        return result[0] || null
      }

      // Fallback for demo purposes
      console.warn('No database connection provided to dbResolver')
      return null
    }
  },

  /**
   * Create a validator that checks required fields
   */
  requiredFieldsValidator<T extends Record<string, any>>(
    fields: (keyof T)[],
  ): ModelValidatorFn<T> {
    return async (model) => {
      for (const field of fields) {
        if (model[field] === undefined || model[field] === null) {
          return {
            valid: false,
            error: `Required field '${String(field)}' is missing`,
            status: 422,
          }
        }
      }
      return { valid: true }
    }
  },

  /**
   * Create a transformer that picks specific fields
   */
  pickFieldsTransformer<T, K extends keyof T>(
    fields: K[],
  ): ModelTransformerFn<T> {
    return async (model) => {
      const result = {} as Pick<T, K>
      for (const field of fields) {
        result[field] = model[field]
      }
      return result as T
    }
  },

  /**
   * Create a transformer that excludes specific fields
   */
  omitFieldsTransformer<T, K extends keyof T>(
    fields: K[],
  ): ModelTransformerFn<T> {
    return async (model) => {
      const result = { ...model }
      for (const field of fields) {
        delete result[field]
      }
      return result
    }
  },

  /**
   * Create a UUID validator
   */
  uuidValidator<T extends { id: string }>(): ModelValidatorFn<T> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    return async (model) => {
      if (!uuidRegex.test(model.id)) {
        return {
          valid: false,
          error: 'Invalid UUID format',
          status: 422,
        }
      }
      return { valid: true }
    }
  },

  /**
   * Create ownership validator (checks if user owns the model)
   */
  ownershipValidator<T extends { userId?: string | number }>(
    userIdField: string = 'userId',
  ): ModelValidatorFn<T> {
    return async (model, params, req) => {
      const userId = req?.user?.id
      if (!userId) {
        return {
          valid: false,
          error: 'Authentication required',
          status: 401,
        }
      }

      const modelUserId = (model as any)[userIdField]
      if (modelUserId && modelUserId.toString() !== userId.toString()) {
        return {
          valid: false,
          error: 'Access denied',
          status: 403,
        }
      }

      return { valid: true }
    }
  },
}

/**
 * Common model binding factories
 */
export const ModelFactory = {
  /**
   * Create a simple model binding for database entities
   */
  entity<T>(
    tableName: string,
    options: {
      idField?: string
      cache?: boolean
      cacheTtl?: number
      validator?: ModelValidatorFn<T>
      transformer?: ModelTransformerFn<T>
      db?: any
    } = {},
  ): ModelBindingConfig<T> {
    const {
      idField = 'id',
      cache = false,
      cacheTtl = 300000, // 5 minutes
      validator,
      transformer,
      db,
    } = options

    return {
      resolver: ModelUtils.dbResolver<T>(tableName, idField, db),
      validator,
      transformer,
      cache: cache ? { enabled: true, ttl: cacheTtl } : { enabled: false, ttl: 0 },
    }
  },

  /**
   * Create a user model binding with ownership validation
   */
  user<T extends { id: string, userId?: string }>(
    tableName: string = 'users',
    options: {
      cache?: boolean
      cacheTtl?: number
      db?: any
    } = {},
  ): ModelBindingConfig<T> {
    const { cache = true, cacheTtl = 600000, db } = options // 10 minutes cache

    return {
      resolver: ModelUtils.dbResolver<T>(tableName, 'id', db),
      validator: ModelUtils.uuidValidator<T>(),
      transformer: ModelUtils.omitFieldsTransformer(['password', 'passwordHash'] as any),
      cache: { enabled: cache, ttl: cacheTtl },
    }
  },

  /**
   * Create a resource model binding with ownership check
   */
  ownedResource<T extends { id: string, userId: string }>(
    tableName: string,
    options: {
      idField?: string
      userIdField?: string
      cache?: boolean
      cacheTtl?: number
      db?: any
    } = {},
  ): ModelBindingConfig<T> {
    const {
      idField = 'id',
      userIdField = 'userId',
      cache = true,
      cacheTtl = 300000,
      db,
    } = options

    return {
      resolver: ModelUtils.dbResolver<T>(tableName, idField, db),
      validator: async (model, params, req) => {
        // First validate UUID
        const uuidResult = await ModelUtils.uuidValidator<T>()(model, params, req)
        if (!uuidResult.valid)
          return uuidResult

        // Then validate ownership
        return ModelUtils.ownershipValidator<T>(userIdField)(model, params, req)
      },
      cache: { enabled: cache, ttl: cacheTtl },
    }
  },
}
