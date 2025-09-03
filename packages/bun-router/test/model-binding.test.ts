import type { BunQueryBuilderModel } from '../src/model-binding'
import { beforeEach, describe, expect, it } from 'bun:test'
import {
  createModelBindingMiddleware,
  createModelWrapper,
  extractModelParameters,
  ModelNotFoundError,
  modelRegistry,
  parseRouteParameter,
} from '../src/model-binding'

// Mock bun-query-builder model definitions
const UserModel = {
  name: 'User',
  table: 'users',
  primaryKey: 'id',
  attributes: {
    id: { validation: { rule: {} } },
    name: { validation: { rule: {} } },
    email: { validation: { rule: {} } },
    slug: { validation: { rule: {} } },
  },
}

const PostModel = {
  name: 'Post',
  table: 'posts',
  primaryKey: 'id',
  attributes: {
    id: { validation: { rule: {} } },
    title: { validation: { rule: {} } },
    slug: { validation: { rule: {} } },
    user_id: { validation: { rule: {} } },
  },
}

// Mock query builder
class MockQueryBuilder {
  private users = [
    { id: 1, name: 'John Doe', email: 'john@example.com', slug: 'john-doe' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', slug: 'jane-smith' },
  ]

  private posts = [
    { id: 1, title: 'Hello World', slug: 'hello-world', user_id: 1 },
    { id: 2, title: 'Laravel Tips', slug: 'laravel-tips', user_id: 1 },
  ]

  async find(table: string, id: string | number) {
    const numId = Number(id)
    if (table === 'users') {
      return this.users.find(u => u.id === numId) || null
    }
    if (table === 'posts') {
      return this.posts.find(p => p.id === numId) || null
    }
    return null
  }

  async findOrFail(table: string, id: string | number) {
    const result = await this.find(table, id)
    if (!result)
      throw new Error(`Record not found in ${table} with id ${id}`)
    return result
  }

  selectFrom(table: string) {
    const self = this
    return {
      where: (field: string, _op: string, value: any) => ({
        async first() {
          if (table === 'users') {
            return self.users.find((u: any) => u[field] === value) || null
          }
          if (table === 'posts') {
            return self.posts.find((p: any) => p[field] === value) || null
          }
          return null
        },
      }),
    }
  }
}

describe('Laravel-Style Model Binding', () => {
  let mockQB: MockQueryBuilder
  let userWrapper: BunQueryBuilderModel
  let postWrapper: BunQueryBuilderModel

  beforeEach(() => {
    mockQB = new MockQueryBuilder()
    userWrapper = createModelWrapper(UserModel, mockQB)
    postWrapper = createModelWrapper(PostModel, mockQB)
  })

  describe('Route Parameter Parsing', () => {
    it('should parse simple route parameter', () => {
      const result = parseRouteParameter('{user}')
      expect(result).toEqual({ name: 'user', key: undefined })
    })

    it('should parse route parameter with custom key', () => {
      const result = parseRouteParameter('{post:slug}')
      expect(result).toEqual({ name: 'post', key: 'slug' })
    })

    it('should throw error for invalid parameter format', () => {
      expect(() => parseRouteParameter('user')).toThrow('Invalid route parameter format')
    })

    it('should extract multiple parameters from route path', () => {
      const result = extractModelParameters('/users/{user}/posts/{post:slug}')
      expect(result).toEqual([
        { name: 'user', key: undefined },
        { name: 'post', key: 'slug' },
      ])
    })
  })

  describe('BunQueryBuilderModel Wrapper', () => {
    it('should get table name from definition', () => {
      expect(userWrapper.getTableName()).toBe('users')
    })

    it('should get table name with fallback', () => {
      const modelWithoutTable = { name: 'Comment', attributes: {} }
      const wrapper = createModelWrapper(modelWithoutTable, mockQB)
      expect(wrapper.getTableName()).toBe('comments')
    })

    it('should find model by ID', async () => {
      const user = await userWrapper.find(1)
      expect(user).toEqual({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        slug: 'john-doe',
      })
    })

    it('should return null for non-existent model', async () => {
      const user = await userWrapper.find(999)
      expect(user).toBeNull()
    })

    it('should find model or fail', async () => {
      const user = await userWrapper.findOrFail(1)
      expect(user.name).toBe('John Doe')
    })

    it('should throw ModelNotFoundError when model not found', async () => {
      await expect(userWrapper.findOrFail(999)).rejects.toThrow(ModelNotFoundError)
    })

    it('should find model by custom field', async () => {
      const user = await userWrapper.where('slug', 'john-doe')
      expect(user?.name).toBe('John Doe')
    })

    it('should get route key name', () => {
      expect(userWrapper.getRouteKeyName()).toBe('id')
    })

    it('should resolve route binding by ID', async () => {
      const user = await userWrapper.resolveRouteBinding(1)
      expect(user?.name).toBe('John Doe')
    })

    it('should resolve route binding by custom field', async () => {
      const user = await userWrapper.resolveRouteBinding('john-doe', 'slug')
      expect(user?.name).toBe('John Doe')
    })
  })

  describe('Model Binding Registry', () => {
    beforeEach(() => {
      // Clear registry before each test
      ;(modelRegistry as any).bindings.clear()
    })

    it('should register model binding', () => {
      modelRegistry.model('user', userWrapper)
      expect(modelRegistry.hasBinding('user')).toBe(true)
    })

    it('should register custom binding resolver', () => {
      const customResolver = async (value: string) => {
        return await userWrapper.find(value)
      }

      modelRegistry.bind('user', customResolver)
      expect(modelRegistry.hasBinding('user')).toBe(true)
    })

    it('should get registered binding', () => {
      modelRegistry.model('user', userWrapper)
      const binding = modelRegistry.getBinding('user')
      expect(binding).toBe(userWrapper)
    })
  })

  describe('Model Binding Middleware', () => {
    it('should create middleware for single parameter', () => {
      const params = [{ name: 'user', key: undefined }]
      const modelWrappers = { user: userWrapper }
      const middleware = createModelBindingMiddleware(params, modelWrappers)

      expect(typeof middleware).toBe('function')
    })

    it('should resolve model in middleware', async () => {
      const params = [{ name: 'user', key: undefined }]
      const modelWrappers = { user: userWrapper }
      const middleware = createModelBindingMiddleware(params, modelWrappers)

      const mockReq = {
        params: { user: '1' },
      } as any

      const mockNext = async () => new Response('success')

      const response = await middleware(mockReq, mockNext)

      expect(mockReq.models.user.name).toBe('John Doe')
      expect(response.status).toBe(200)
    })

    it('should resolve model with custom key', async () => {
      const params = [{ name: 'user', key: 'slug' }]
      const modelWrappers = { user: userWrapper }
      const middleware = createModelBindingMiddleware(params, modelWrappers)

      const mockReq = {
        params: { user: 'john-doe' },
      } as any

      const mockNext = async () => new Response('success')

      const response = await middleware(mockReq, mockNext)

      expect(mockReq.models.user.name).toBe('John Doe')
      expect(response.status).toBe(200)
    })

    it('should return 404 when model not found', async () => {
      const params = [{ name: 'user', key: undefined }]
      const modelWrappers = { user: userWrapper }
      const middleware = createModelBindingMiddleware(params, modelWrappers)

      const mockReq = {
        params: { user: '999' },
      } as any

      const mockNext = async () => new Response('success')

      const response = await middleware(mockReq, mockNext)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('user not found')
    })

    it('should resolve multiple models', async () => {
      const params = [
        { name: 'user', key: undefined },
        { name: 'post', key: 'slug' },
      ]
      const modelWrappers = { user: userWrapper, post: postWrapper }
      const middleware = createModelBindingMiddleware(params, modelWrappers)

      const mockReq = {
        params: { user: '1', post: 'hello-world' },
      } as any

      const mockNext = async () => new Response('success')

      const response = await middleware(mockReq, mockNext)

      expect(mockReq.models.user.name).toBe('John Doe')
      expect(mockReq.models.post.title).toBe('Hello World')
      expect(response.status).toBe(200)
    })

    it('should use explicit binding when available', async () => {
      // Register explicit binding
      modelRegistry.model('user', userWrapper)

      const params = [{ name: 'user', key: undefined }]
      const modelWrappers = {} // Empty - should use explicit binding
      const middleware = createModelBindingMiddleware(params, modelWrappers)

      const mockReq = {
        params: { user: '1' },
      } as any

      const mockNext = async () => new Response('success')

      const response = await middleware(mockReq, mockNext)

      expect(mockReq.models.user.name).toBe('John Doe')
      expect(response.status).toBe(200)
    })

    it('should use custom resolver binding', async () => {
      // Register custom resolver
      modelRegistry.bind('user', async (value: string) => {
        if (value === 'admin') {
          return { id: 999, name: 'Admin User', email: 'admin@example.com' }
        }
        return await userWrapper.find(value)
      })

      const params = [{ name: 'user', key: undefined }]
      const modelWrappers = {}
      const middleware = createModelBindingMiddleware(params, modelWrappers)

      const mockReq = {
        params: { user: 'admin' },
      } as any

      const mockNext = async () => new Response('success')

      const response = await middleware(mockReq, mockNext)

      expect(mockReq.models.user.name).toBe('Admin User')
      expect(response.status).toBe(200)
    })

    it('should skip parameters without model wrappers', async () => {
      const params = [
        { name: 'user', key: undefined },
        { name: 'unknown', key: undefined },
      ]
      const modelWrappers = { user: userWrapper }
      const middleware = createModelBindingMiddleware(params, modelWrappers)

      const mockReq = {
        params: { user: '1', unknown: 'test' },
      } as any

      const mockNext = async () => new Response('success')

      const response = await middleware(mockReq, mockNext)

      expect(mockReq.models.user.name).toBe('John Doe')
      expect(mockReq.models.unknown).toBeUndefined()
      expect(response.status).toBe(200)
    })
  })

  describe('Error Handling', () => {
    it('should create ModelNotFoundError with correct properties', () => {
      const error = new ModelNotFoundError('User', 123, 'slug')
      expect(error.modelName).toBe('User')
      expect(error.value).toBe(123)
      expect(error.field).toBe('slug')
      expect(error.message).toBe('User not found with slug: 123')
    })

    it('should default field to id in ModelNotFoundError', () => {
      const error = new ModelNotFoundError('User', 123)
      expect(error.field).toBe('id')
      expect(error.message).toBe('User not found with id: 123')
    })
  })
})
