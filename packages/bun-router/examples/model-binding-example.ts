import { Router } from '../src/router'
import type { EnhancedRequest } from '../src/types'
import { 
  BunQueryBuilderModel, 
  createModelWrapper, 
  createModelBindingMiddleware,
  extractModelParameters,
  modelRegistry
} from '../src/model-binding'

// Example bun-query-builder model definitions (these would come from your models)
const UserModel = {
  name: 'User',
  table: 'users',
  primaryKey: 'id',
  attributes: {
    id: { validation: { rule: {} } },
    name: { validation: { rule: {} } },
    email: { validation: { rule: {} } },
    slug: { validation: { rule: {} } }
  }
}

const PostModel = {
  name: 'Post',
  table: 'posts',
  primaryKey: 'id',
  attributes: {
    id: { validation: { rule: {} } },
    title: { validation: { rule: {} } },
    slug: { validation: { rule: {} } },
    content: { validation: { rule: {} } },
    user_id: { validation: { rule: {} } }
  }
}

// Mock query builder (in real usage, this would be your bun-query-builder instance)
const mockQueryBuilder = {
  async find(table: string, id: string | number) {
    if (table === 'users' && id === '1') {
      return { id: 1, name: 'John Doe', email: 'john@example.com', slug: 'john-doe' }
    }
    if (table === 'posts' && id === '1') {
      return { id: 1, title: 'Hello World', slug: 'hello-world', content: 'First post', user_id: 1 }
    }
    return null
  },

  async findOrFail(table: string, id: string | number) {
    const result = await this.find(table, id)
    if (!result) throw new Error(`Record not found in ${table} with id ${id}`)
    return result
  },

  selectFrom(table: string) {
    return {
      where: (field: string, op: string, value: any) => ({
        async first() {
          if (table === 'users' && field === 'slug' && value === 'john-doe') {
            return { id: 1, name: 'John Doe', email: 'john@example.com', slug: 'john-doe' }
          }
          if (table === 'posts' && field === 'slug' && value === 'hello-world') {
            return { id: 1, title: 'Hello World', slug: 'hello-world', content: 'First post', user_id: 1 }
          }
          return null
        }
      })
    }
  }
}

// Create model wrappers
const userWrapper = createModelWrapper(UserModel, mockQueryBuilder)
const postWrapper = createModelWrapper(PostModel, mockQueryBuilder)

// Create router
const router = new Router()

// Register model wrappers for implicit binding
const modelWrappers = {
  user: userWrapper,
  post: postWrapper
}

// Laravel-style implicit binding routes
// Route: GET /users/{user}
const userRoute = '/users/{user}'
const userParams = extractModelParameters(userRoute)
const userMiddleware = createModelBindingMiddleware(userParams, modelWrappers)

router.get(userRoute, userMiddleware, (req: EnhancedRequest) => {
  const user = (req as any).models.user
  return Response.json({
    message: `Hello ${user.name}!`,
    user
  })
})

// Route: GET /users/{user:slug} - using custom key
const userSlugRoute = '/users/{user:slug}'
const userSlugParams = extractModelParameters(userSlugRoute)
const userSlugMiddleware = createModelBindingMiddleware(userSlugParams, modelWrappers)

router.get(userSlugRoute, userSlugMiddleware, (req: EnhancedRequest) => {
  const user = (req as any).models.user
  return Response.json({
    message: `Hello ${user.name} (found by slug)!`,
    user
  })
})

// Route: GET /users/{user}/posts/{post:slug} - nested with custom key
const nestedRoute = '/users/{user}/posts/{post:slug}'
const nestedParams = extractModelParameters(nestedRoute)
const nestedMiddleware = createModelBindingMiddleware(nestedParams, modelWrappers)

router.get(nestedRoute, nestedMiddleware, (req: EnhancedRequest) => {
  const user = (req as any).models.user
  const post = (req as any).models.post

  return Response.json({
    message: `Post "${post.title}" by ${user.name}`,
    user,
    post
  })
})

// Laravel Route::model style explicit binding
modelRegistry.model('user', userWrapper)
modelRegistry.model('post', postWrapper)

// Laravel Route::bind style custom resolver
modelRegistry.bind('user', async (value: string) => {
  // Custom logic - maybe find by email instead of ID
  if (value.includes('@')) {
    return await mockQueryBuilder.selectFrom('users').where('email', '=', value).first()
  }
  return await userWrapper.find(value)
})

// Example usage with explicit binding
const explicitRoute = '/admin/users/{user}'
const explicitParams = extractModelParameters(explicitRoute)
const explicitMiddleware = createModelBindingMiddleware(explicitParams, {})

router.get(explicitRoute, explicitMiddleware, (req: EnhancedRequest) => {
  const user = (req as any).models.user
  return Response.json({
    message: `Admin view for ${user.name}`,
    user
  })
})

// Start server
const server = Bun.serve({
  port: 3000,
  fetch: router.handle.bind(router)
})

console.log('Laravel-style model binding server running on http://localhost:3000')
console.log('Try these routes:')
console.log('- GET /users/1 (implicit binding by ID)')
console.log('- GET /users/john-doe (implicit binding by slug)')
console.log('- GET /users/1/posts/hello-world (nested binding)')
console.log('- GET /admin/users/john@example.com (explicit binding with custom resolver)')

export { router, userWrapper, postWrapper, modelWrappers }
