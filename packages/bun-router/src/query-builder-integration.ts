import type { Model, QueryBuilderModelResolver } from './model-binding'

/**
 * Integration layer for bun-query-builder with model binding
 */
export class QueryBuilderIntegration {
  private queryBuilder: any
  private resolvers = new Map<string, QueryBuilderModelResolver>()

  constructor(queryBuilder: any) {
    this.queryBuilder = queryBuilder
  }

  /**
   * Register a model resolver and inject the query builder
   */
  registerResolver<TModel extends Model>(
    name: string, 
    resolver: QueryBuilderModelResolver<TModel>
  ): void {
    // Inject the query builder instance
    resolver.queryBuilder = this.queryBuilder
    this.resolvers.set(name, resolver)
  }

  /**
   * Get a registered resolver
   */
  getResolver<TModel extends Model>(name: string): QueryBuilderModelResolver<TModel> | undefined {
    return this.resolvers.get(name) as QueryBuilderModelResolver<TModel> | undefined
  }

  /**
   * Resolve a model by name and ID
   */
  async resolveModel<TModel extends Model>(
    name: string,
    id: string | number,
    keyName?: string,
    context: Record<string, Model> = {}
  ): Promise<TModel | null> {
    const resolver = this.getResolver<TModel>(name)
    if (!resolver) {
      throw new Error(`No resolver registered for model: ${name}`)
    }

    // Apply constraints if available
    if (resolver.applyConstraints) {
      const query = this.queryBuilder
        .select()
        .from(resolver.table)
        .where(keyName || resolver.getRouteKeyName?.() || 'id', '=', id)
      
      const constrainedQuery = resolver.applyConstraints(query, context)
      return await constrainedQuery.first() || null
    }

    // Use the resolver's find method
    return await resolver.find(id, keyName)
  }

  /**
   * Resolve a model or throw an error
   */
  async resolveModelOrFail<TModel extends Model>(
    name: string,
    id: string | number,
    keyName?: string,
    context: Record<string, Model> = {}
  ): Promise<TModel> {
    const model = await this.resolveModel<TModel>(name, id, keyName, context)
    if (!model) {
      throw new Error(`${name} not found with ${keyName || 'id'}: ${id}`)
    }
    return model
  }
}

/**
 * Create a query builder integration instance
 */
export function createQueryBuilderIntegration(queryBuilder: any): QueryBuilderIntegration {
  return new QueryBuilderIntegration(queryBuilder)
}

/**
 * Helper to create a basic model resolver using the query builder
 */
export function createBasicResolver<TModel extends Model>(
  tableName: string,
  options: {
    keyName?: string
    transform?: (row: any) => TModel
  } = {}
): QueryBuilderModelResolver<TModel> {
  const { keyName = 'id', transform } = options

  return {
    table: tableName,
    queryBuilder: undefined, // Will be injected

    async find(id: string | number, searchKey = keyName): Promise<TModel | null> {
      if (!this.queryBuilder) {
        throw new Error(`Query builder not initialized for table: ${tableName}`)
      }

      try {
        const result = await this.queryBuilder
          .select()
          .from(this.table)
          .where(searchKey, '=', id)
          .first()
        
        if (!result) return null
        
        return transform ? transform(result) : result as TModel
      } catch (error) {
        console.error(`Error finding ${tableName}:`, error)
        return null
      }
    },

    async findOrFail(id: string | number, searchKey = keyName): Promise<TModel> {
      const model = await this.find(id, searchKey)
      if (!model) {
        throw new Error(`${tableName} not found with ${searchKey}: ${id}`)
      }
      return model
    },

    getRouteKeyName(): string {
      return keyName
    }
  }
}
