import type { EnhancedRequest } from '../types'
import type { ModelBindingTestOptions } from './types'
import { mock } from 'bun:test'
import { createMockRequest } from './test-request'

/**
 * Model binding testing utilities
 */
export class ModelBindingTester {
  private request: EnhancedRequest
  private options: ModelBindingTestOptions

  constructor(options: ModelBindingTestOptions = {}) {
    this.options = options
    this.request = createMockRequest()
  }

  /**
   * Set the request for testing
   */
  withRequest(request: EnhancedRequest): ModelBindingTester {
    this.request = request
    return this
  }

  /**
   * Set route parameters
   */
  withParams(params: Record<string, string>): ModelBindingTester {
    this.request.params = { ...this.request.params, ...params }
    return this
  }

  /**
   * Set the model class to test
   */
  withModel(modelClass: any): ModelBindingTester {
    this.options.modelClass = modelClass
    return this
  }

  /**
   * Set the route key for model binding
   */
  withRouteKey(routeKey: string): ModelBindingTester {
    this.options.routeKey = routeKey
    return this
  }

  /**
   * Set constraints for model binding
   */
  withConstraints(constraints: Record<string, any>): ModelBindingTester {
    this.options.constraints = constraints
    return this
  }

  /**
   * Set a custom resolver function
   */
  withResolver(resolver: (value: string) => Promise<any>): ModelBindingTester {
    this.options.customResolver = resolver
    return this
  }

  /**
   * Test model resolution
   */
  async testResolution(paramValue: string): Promise<any> {
    if (this.options.customResolver) {
      return await this.options.customResolver(paramValue)
    }

    // Mock default resolution behavior
    if (this.options.modelClass) {
      return new this.options.modelClass({ id: paramValue })
    }

    return { id: paramValue }
  }

  /**
   * Test model not found scenario
   */
  async testNotFound(paramValue: string): Promise<void> {
    try {
      await this.testResolution(paramValue)
      throw new Error('Expected model not found error')
    }
    catch (error) {
      if (error instanceof Error && error.message !== 'Model not found') {
        throw error
      }
    }
  }

  /**
   * Get the configured request
   */
  getRequest(): EnhancedRequest {
    return this.request
  }
}

/**
 * Mock model factories
 */
export const modelMocks = {
  /**
   * Create a mock model class
   */
  createModel: (name: string, attributes: Record<string, any> = {}) => {
    return class MockModel {
      public id: any
      public attributes: Record<string, any>

      constructor(data: Record<string, any> = {}) {
        this.id = data.id
        this.attributes = { ...attributes, ...data }
      }

      static modelName = name

      static async find(id: any): Promise<MockModel | null> {
        if (id === 'not-found')
          return null
        return new MockModel({ id, ...attributes })
      }

      static async findOrFail(id: any): Promise<MockModel> {
        const model = await this.find(id)
        if (!model)
          throw new Error('Model not found')
        return model
      }

      static async where(conditions: Record<string, any>): Promise<MockModel[]> {
        return [new MockModel({ id: 1, ...attributes, ...conditions })]
      }

      static async create(data: Record<string, any>): Promise<MockModel> {
        return new MockModel({ id: Date.now(), ...data })
      }

      async save(): Promise<MockModel> {
        return this
      }

      async delete(): Promise<void> {
        // Mock deletion
      }

      toJSON(): Record<string, any> {
        return { id: this.id, ...this.attributes }
      }
    }
  },

  /**
   * Create a User model mock
   */
  User: class MockUser {
    public id: number
    public email: string
    public name: string

    constructor(data: { id: number, email?: string, name?: string } = { id: 1 }) {
      this.id = data.id
      this.email = data.email || 'test@example.com'
      this.name = data.name || 'Test User'
    }

    static async find(id: any): Promise<MockUser | null> {
      if (id === 'not-found')
        return null
      return new MockUser({ id: Number.parseInt(id) })
    }

    static async findOrFail(id: any): Promise<MockUser> {
      const user = await this.find(id)
      if (!user)
        throw new Error('User not found')
      return user
    }

    toJSON(): Record<string, any> {
      return { id: this.id, email: this.email, name: this.name }
    }
  },

  /**
   * Create a Post model mock
   */
  Post: class MockPost {
    public id: number
    public title: string
    public content: string
    public userId: number

    constructor(data: { id: number, title?: string, content?: string, userId?: number } = { id: 1 }) {
      this.id = data.id
      this.title = data.title || 'Test Post'
      this.content = data.content || 'Test content'
      this.userId = data.userId || 1
    }

    static async find(id: any): Promise<MockPost | null> {
      if (id === 'not-found')
        return null
      return new MockPost({ id: Number.parseInt(id) })
    }

    static async findOrFail(id: any): Promise<MockPost> {
      const post = await this.find(id)
      if (!post)
        throw new Error('Post not found')
      return post
    }

    async belongsTo(userId: number): Promise<boolean> {
      return this.userId === userId
    }

    toJSON(): Record<string, any> {
      return { id: this.id, title: this.title, content: this.content, userId: this.userId }
    }
  },
}

/**
 * Model binding constraint helpers
 */
export const constraintHelpers = {
  /**
   * Create a belongsTo constraint
   */
  belongsTo: (userIdField: string = 'userId') => mock(async (model: any, request: EnhancedRequest) => {
    if (!request.user)
      return false
    return model[userIdField] === request.user.id
  }),

  /**
   * Create a belongsToUser constraint
   */
  belongsToUser: () => mock(async (model: any, request: EnhancedRequest) => {
    if (!request.user)
      return false
    return model.userId === request.user.id
  }),

  /**
   * Create a published constraint
   */
  published: () => mock(async (model: any) => {
    return model.published === true || model.status === 'published'
  }),

  /**
   * Create a visible constraint
   */
  visible: () => mock(async (model: any) => {
    return model.visible !== false && model.hidden !== true
  }),

  /**
   * Create a custom constraint
   */
  custom: (constraintFn: (model: any, request: EnhancedRequest) => Promise<boolean>) =>
    mock(constraintFn),

  /**
   * Combine multiple constraints with AND logic
   */
  combine: (...constraints: Array<(model: any, request: EnhancedRequest) => Promise<boolean>>) =>
    mock(async (model: any, request: EnhancedRequest) => {
      for (const constraint of constraints) {
        if (!(await constraint(model, request))) {
          return false
        }
      }
      return true
    }),
}

/**
 * Model resolver factory for testing
 */
export class ModelResolverTester {
  private resolvers: Map<string, (value: string) => Promise<any>> = new Map()

  /**
   * Register a model resolver
   */
  register(key: string, resolver: (value: string) => Promise<any>): ModelResolverTester {
    this.resolvers.set(key, mock(resolver))
    return this
  }

  /**
   * Register a model class resolver
   */
  registerModel(key: string, modelClass: any): ModelResolverTester {
    const resolver = mock(async (value: string) => {
      if (modelClass.find) {
        const model = await modelClass.find(value)
        if (!model)
          throw new Error(`${modelClass.name || 'Model'} not found`)
        return model
      }
      return new modelClass({ id: value })
    })

    this.resolvers.set(key, resolver)
    return this
  }

  /**
   * Test model resolution
   */
  async resolve(key: string, value: string): Promise<any> {
    const resolver = this.resolvers.get(key)
    if (!resolver) {
      throw new Error(`No resolver registered for key: ${key}`)
    }
    return await resolver(value)
  }

  /**
   * Test all registered resolvers
   */
  async testAll(testValue: string = '1'): Promise<Record<string, any>> {
    const results: Record<string, any> = {}

    for (const [key, resolver] of this.resolvers) {
      try {
        results[key] = await resolver(testValue)
      }
      catch (error) {
        results[key] = { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }

    return results
  }

  /**
   * Get all registered resolver keys
   */
  getKeys(): string[] {
    return Array.from(this.resolvers.keys())
  }

  /**
   * Clear all resolvers
   */
  clear(): ModelResolverTester {
    this.resolvers.clear()
    return this
  }
}

/**
 * Route model binding test helpers
 */
export const routeModelHelpers = {
  /**
   * Test route with model binding
   */
  testRoute: async (
    path: string,
    params: Record<string, string>,
    modelBindings: Record<string, any>,
  ): Promise<EnhancedRequest> => {
    const request = createMockRequest('GET', path)
    request.params = params

    // Simulate model binding resolution
    for (const [key, model] of Object.entries(modelBindings)) {
      request.context = request.context || {}
      request.context[key] = model
    }

    return request
  },

  /**
   * Create a route handler that expects model binding
   */
  createHandler: (expectedModels: string[]) => mock(async (request: EnhancedRequest) => {
    const context = request.context || {}

    for (const modelKey of expectedModels) {
      if (!context[modelKey]) {
        return new Response(`Model ${modelKey} not found`, { status: 404 })
      }
    }

    return new Response(JSON.stringify({
      params: request.params,
      models: Object.fromEntries(
        expectedModels.map(key => [key, context[key]]),
      ),
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }),

  /**
   * Test model binding middleware
   */
  testBindingMiddleware: (
    bindings: Record<string, any>,
  ) => mock(async (request: EnhancedRequest, next: any) => {
    request.context = request.context || {}

    for (const [key, resolver] of Object.entries(bindings)) {
      const paramValue = request.params[key]
      if (paramValue) {
        try {
          if (typeof resolver === 'function') {
            request.context[key] = await resolver(paramValue)
          }
          else {
            request.context[key] = resolver
          }
        }
        catch (error) {
          return new Response(`${key} not found`, { status: 404 })
        }
      }
    }

    return await next()
  }),
}

/**
 * Factory functions
 */
export function createModelBindingTester(options?: ModelBindingTestOptions): ModelBindingTester {
  return new ModelBindingTester(options)
}

export function createModelResolverTester(): ModelResolverTester {
  return new ModelResolverTester()
}

/**
 * Test utilities for scoped model binding
 */
export const scopedBindingHelpers = {
  /**
   * Test user-scoped model binding
   */
  testUserScoped: async (
    model: any,
    user: any,
    constraint: (model: any, user: any) => Promise<boolean> = async (m, u) => m.userId === u.id,
  ): Promise<boolean> => {
    return await constraint(model, user)
  },

  /**
   * Test role-based model access
   */
  testRoleAccess: async (
    model: any,
    user: any,
    requiredRoles: string[],
  ): Promise<boolean> => {
    if (!user.roles)
      return false
    return requiredRoles.some(role => user.roles.includes(role))
  },

  /**
   * Test permission-based model access
   */
  testPermissionAccess: async (
    model: any,
    user: any,
    requiredPermissions: string[],
  ): Promise<boolean> => {
    if (!user.permissions)
      return false
    return requiredPermissions.every(permission => user.permissions.includes(permission))
  },
}
