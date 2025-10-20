import type { Model, QueryBuilderModelResolver } from './model-binding'

/**
 * Factory function to create model resolvers with bun-query-builder integration
 */
export function createModelResolver<TModel extends Model = Model>(
  tableName: string,
  options: {
    keyName?: string
    applyConstraints?: (query: any, context: Record<string, Model>) => any
  } = {},
): QueryBuilderModelResolver<TModel> {
  const { keyName = 'id', applyConstraints } = options

  return {
    table: tableName,
    queryBuilder: undefined, // Will be injected by the router

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

        return result || null
      }
      catch (error) {
        console.error(`Error finding ${tableName} with ${searchKey}: ${id}`, error)
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
    },

    applyConstraints,
  }
}

/**
 * Create a scoped model resolver that applies constraints based on parent models
 */
export function createScopedModelResolver<TModel extends Model = Model>(
  tableName: string,
  constraintFn: (query: any, context: Record<string, Model>) => any,
  options: {
    keyName?: string
  } = {},
): QueryBuilderModelResolver<TModel> {
  return createModelResolver<TModel>(tableName, {
    ...options,
    applyConstraints: constraintFn,
  })
}

/**
 * Common constraint functions for scoped bindings
 */
export const constraints = {
  /**
   * Ensure a model belongs to a specific parent model
   */
  belongsTo: (parentKey: string, foreignKey: string): ((query: any, context: Record<string, Model>) => any) =>
    (query: any, context: Record<string, Model>) => {
      const parent = context[parentKey]
      if (parent) {
        return query.where(foreignKey, '=', parent.id)
      }
      return query
    },

  /**
   * Ensure a model belongs to the authenticated user
   */
  belongsToUser: (userKey = 'user', foreignKey = 'user_id'): ((query: any, context: Record<string, Model>) => any) =>
    (query: any, context: Record<string, Model>) => {
      const user = context[userKey]
      if (user) {
        return query.where(foreignKey, '=', user.id)
      }
      return query
    },

  /**
   * Apply multiple constraints
   */
  combine: (...constraintFns: Array<(query: any, context: Record<string, Model>) => any>): ((query: any, context: Record<string, Model>) => any) =>
    (query: any, context: Record<string, Model>) => {
      return constraintFns.reduce((q, fn) => fn(q, context), query)
    },
}
