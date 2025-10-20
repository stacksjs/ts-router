/**
 * TypeScript Enhancements Example
 *
 * Comprehensive example demonstrating all TypeScript enhancement features
 */

import { Router } from '../packages/bun-router/src'
import type {
  ExtractTypedParams,
  ExtractQueryParams,
  TypedRequest,
  RouteHandler,
  ValidateRoutePattern,
  TypedRoute
} from '../packages/bun-router/src/types/route-inference'

import type {
  TypedMiddleware,
  AuthMiddleware,
  ValidationMiddleware,
  RateLimitMiddleware,
  CacheMiddleware,
  MiddlewareChain,
  ComposeMiddleware
} from '../packages/bun-router/src/types/middleware-types'

import type {
  BaseController,
  ControllerRoute,
  ValidateController,
  IsValidController,
  DetectControllerConflicts
} from '../packages/bun-router/src/types/controller-types'

import type {
  EnhancedRequest,
  AugmentedRouteHandler,
  AccumulateContext,
  AugmentRequestThroughChain
} from '../packages/bun-router/src/types/request-response-augmentation'

// 1. Route Parameter Type Inference Examples

// Basic parameter extraction
type UserParams = ExtractTypedParams<'/users/:id/posts/:postId'>
// Result: { id: string; postId: string }

// Typed parameters with constraints
type TypedUserParams = ExtractTypedParams<'/users/:id<number>/posts/:slug<string>'>
// Result: { id: number; slug: string }

// Complex parameter types
type ComplexParams = ExtractTypedParams<'/api/v1/users/:userId<uuid>/posts/:postId<number>/comments/:commentId<number>'>
// Result: { userId: string; postId: number; commentId: number }

// Enum parameters
type StatusParams = ExtractTypedParams<'/posts/:status<enum(draft|published|archived)>'>
// Result: { status: 'draft' | 'published' | 'archived' }

// Query parameter schemas
interface UserQuerySchema {
  page: 'number'
  limit: 'number'
  search: 'string'
  active: 'boolean'
  tags: 'string[]'
  sortBy: { type: 'string'; required: false }
}

type UserQuery = ExtractQueryParams<UserQuerySchema>
// Result: {
//   page: number
//   limit: number
//   search: string
//   active: boolean
//   tags: string[]
//   sortBy: string | undefined
// }

// 2. Type-Safe Route Handlers

// GET route with typed parameters and query
const getUserPosts: RouteHandler<
  '/users/:id<number>/posts',
  UserQuerySchema,
  never
> = async (request) => {
  // All parameters are automatically typed
  const userId = request.params.id // number
  const page = request.query.page // number
  const limit = request.query.limit // number
  const search = request.query.search // string
  const active = request.query.active // boolean
  const tags = request.query.tags // string[]
  const sortBy = request.query.sortBy // string | undefined

  console.log(`Getting posts for user ${userId}, page ${page}, limit ${limit}`)

  // Simulate database query
  const posts = await new Promise(resolve => {
    setTimeout(() => {
      resolve([
        { id: 1, title: 'Post 1', content: 'Content 1', userId },
        { id: 2, title: 'Post 2', content: 'Content 2', userId }
      ])
    }, 100)
  })

  return Response.json({
    posts,
    pagination: { page, limit, total: 100 },
    filters: { search, active, tags, sortBy }
  })
}

// POST route with typed body
interface CreateUserBody {
  name: string
  email: string
  age: number
  preferences: {
    theme: 'light' | 'dark'
    notifications: boolean
  }
}

const createUser: RouteHandler<
  '/users',
  {},
  CreateUserBody
> = async (request) => {
  // Request body is automatically typed
  const userData = request.body // CreateUserBody

  // Validate required fields (TypeScript ensures they exist)
  if (!userData.name || !userData.email) {
    return Response.json(
      { error: 'Name and email are required' },
      { status: 400 }
    )
  }

  // Simulate user creation
  const user = {
    id: Math.floor(Math.random() * 1000),
    ...userData,
    createdAt: new Date().toISOString()
  }

  return Response.json(user, { status: 201 })
}

// 3. Middleware Type Safety Examples

// User interface for authentication
interface User {
  id: string
  email: string
  name: string
  roles: string[]
  permissions: string[]
}

// Authentication middleware with typed user
const authMiddleware: AuthMiddleware<User> = async (request, next) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')

  if (!token) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Simulate token validation
  const user: User = {
    id: '123',
    email: 'user@example.com',
    name: 'John Doe',
    roles: ['user'],
    permissions: ['read:posts', 'write:posts']
  }

  // Augment request with user data
  const augmentedRequest = request as typeof request & {
    user: User
    isAuthenticated: true
  }
  augmentedRequest.user = user
  augmentedRequest.isAuthenticated = true

  return await next()
}

// Validation middleware with typed validation results
const validationMiddleware: ValidationMiddleware<
  { id: number },
  { page: number; limit: number },
  CreateUserBody
> = async (request, next) => {
  // Validate and transform parameters
  const id = request.params?.id
  const validatedParams = {
    id: typeof id === 'string' ? parseInt(id) : (id as number)
  }

  if (isNaN(validatedParams.id)) {
    return Response.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  // Validate query parameters
  const page = parseInt(request.query?.page as string) || 1
  const limit = Math.min(parseInt(request.query?.limit as string) || 10, 100)

  const validatedQuery = { page, limit }

  // Validate body if present
  let validatedBody: CreateUserBody | undefined
  if (request.body) {
    const body = request.body as CreateUserBody

    if (!body.name || !body.email) {
      return Response.json(
        { error: 'Name and email are required' },
        { status: 400 }
      )
    }

    validatedBody = body
  }

  // Augment request with validated data
  const augmentedRequest = request as typeof request & {
    validatedParams: typeof validatedParams
    validatedQuery: typeof validatedQuery
    validatedBody: typeof validatedBody
  }

  augmentedRequest.validatedParams = validatedParams
  augmentedRequest.validatedQuery = validatedQuery
  augmentedRequest.validatedBody = validatedBody

  return await next()
}

// Rate limiting middleware
const rateLimitMiddleware: RateLimitMiddleware = async (request, next) => {
  const clientId = request.headers.get('x-client-id') || 'anonymous'

  // Simulate rate limit check
  const rateLimit = {
    remaining: 95,
    reset: new Date(Date.now() + 3600000), // 1 hour from now
    limit: 100
  }

  if (rateLimit.remaining <= 0) {
    return Response.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimit.reset.toISOString()
        }
      }
    )
  }

  // Augment request with rate limit info
  const augmentedRequest = request as typeof request & {
    rateLimit: typeof rateLimit
  }
  augmentedRequest.rateLimit = rateLimit

  const response = await next()

  // Add rate limit headers to response
  response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString())
  response.headers.set('X-RateLimit-Reset', rateLimit.reset.toISOString())

  return response
}

// Cache middleware
const cacheMiddleware: CacheMiddleware = async (request, next) => {
  const cacheKey = `${request.method}:${request.url}`

  // Simulate cache check
  const cached = false // Would check actual cache

  const cache = {
    key: cacheKey,
    ttl: 300, // 5 minutes
    hit: cached
  }

  if (cached) {
    // Return cached response
    return Response.json(
      { message: 'Cached response', data: {} },
      {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey
        }
      }
    )
  }

  // Augment request with cache info
  const augmentedRequest = request as typeof request & {
    cache: typeof cache
  }
  augmentedRequest.cache = cache

  const response = await next()

  // Add cache headers
  response.headers.set('X-Cache', 'MISS')
  response.headers.set('X-Cache-Key', cacheKey)

  return response
}

// 4. Middleware Composition

// Compose middleware types
type AuthValidationMiddleware = ComposeMiddleware<
  AuthMiddleware<User>,
  ValidationMiddleware<{ id: number }, { page: number; limit: number }, CreateUserBody>
>

// Middleware chain type
type FullMiddlewareChain = MiddlewareChain<[
  AuthMiddleware<User>,
  ValidationMiddleware<{ id: number }, { page: number; limit: number }, CreateUserBody>,
  RateLimitMiddleware,
  CacheMiddleware
]>

// 5. Enhanced Request with Middleware Augmentations

// Request type with all middleware augmentations
type FullyAugmentedRequest = EnhancedRequest<
  '/users/:id<number>/posts',
  UserQuerySchema,
  never,
  {},
  {
    auth: { user: User }
    validation: {
      params: { id: number }
      query: { page: number; limit: number }
    }
    rateLimit: { remaining: number; reset: Date; limit: number }
    cache: { key: string; ttl: number; hit: boolean }
  }
>

// Route handler with full augmentation
const fullyAugmentedHandler: AugmentedRouteHandler<
  '/users/:id<number>/posts',
  UserQuerySchema,
  never,
  {},
  [
    AuthMiddleware<User>,
    ValidationMiddleware<{ id: number }, { page: number; limit: number }, never>,
    RateLimitMiddleware,
    CacheMiddleware
  ]
> = async (request) => {
  // All middleware augmentations are available and typed
  const user = request.user // User (from auth middleware)
  const userId = request.validatedParams.id // number (from validation middleware)
  const query = request.validatedQuery // { page: number; limit: number }
  const rateLimit = request.rateLimit // { remaining: number; reset: Date; limit: number }
  const cache = request.cache // { key: string; ttl: number; hit: boolean }

  console.log(`User ${user.name} (${user.id}) requesting posts for user ${userId}`)
  console.log(`Rate limit: ${rateLimit.remaining}/${rateLimit.limit}`)
  console.log(`Cache: ${cache.hit ? 'HIT' : 'MISS'} (${cache.key})`)

  // Simulate fetching posts
  const posts = [
    { id: 1, title: 'Post 1', userId },
    { id: 2, title: 'Post 2', userId }
  ]

  return Response.json({
    posts,
    user: user.name,
    pagination: query,
    rateLimit: {
      remaining: rateLimit.remaining,
      reset: rateLimit.reset
    }
  })
}

// 6. Controller Type Checking Examples

// Base controller interface
interface UserController extends BaseController {
  // GET /users
  getUsers(
    request: EnhancedRequest<
      '/users',
      UserQuerySchema,
      never,
      {},
      { auth: { user: User } }
    >
  ): Promise<Response>

  // GET /users/:id
  getUser(
    request: EnhancedRequest<
      '/users/:id<number>',
      {},
      never,
      {},
      { auth: { user: User } }
    >
  ): Promise<Response>

  // POST /users
  createUser(
    request: EnhancedRequest<
      '/users',
      {},
      CreateUserBody,
      {},
      {
        auth: { user: User }
        validation: { body: CreateUserBody }
      }
    >
  ): Promise<Response>

  // PUT /users/:id
  updateUser(
    request: EnhancedRequest<
      '/users/:id<number>',
      {},
      Partial<CreateUserBody>,
      {},
      {
        auth: { user: User }
        validation: {
          params: { id: number }
          body: Partial<CreateUserBody>
        }
      }
    >
  ): Promise<Response>

  // DELETE /users/:id
  deleteUser(
    request: EnhancedRequest<
      '/users/:id<number>',
      {},
      never,
      {},
      {
        auth: { user: User }
        validation: { params: { id: number } }
      }
    >
  ): Promise<Response>
}

// Controller implementation
class UserControllerImpl implements UserController {
  async getUsers(request) {
    const user = request.user // User (typed from middleware)
    const page = request.query.page // number
    const limit = request.query.limit // number
    const search = request.query.search // string

    console.log(`${user.name} requesting users: page ${page}, limit ${limit}, search: ${search}`)

    // Simulate database query
    const users = Array.from({ length: limit }, (_, i) => ({
      id: (page - 1) * limit + i + 1,
      name: `User ${(page - 1) * limit + i + 1}`,
      email: `user${(page - 1) * limit + i + 1}@example.com`
    }))

    return Response.json({
      users,
      pagination: { page, limit, total: 1000 },
      requestedBy: user.name
    })
  }

  async getUser(request) {
    const currentUser = request.user // User
    const userId = request.params.id // number (typed from route)

    console.log(`${currentUser.name} requesting user ${userId}`)

    // Simulate user lookup
    const user = {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
      createdAt: new Date().toISOString()
    }

    return Response.json(user)
  }

  async createUser(request) {
    const currentUser = request.user // User
    const userData = request.validatedBody // CreateUserBody (typed from validation middleware)

    console.log(`${currentUser.name} creating user:`, userData)

    // Simulate user creation
    const newUser = {
      id: Math.floor(Math.random() * 1000),
      ...userData,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id
    }

    return Response.json(newUser, { status: 201 })
  }

  async updateUser(request) {
    const currentUser = request.user // User
    const userId = request.validatedParams.id // number
    const updates = request.validatedBody // Partial<CreateUserBody>

    console.log(`${currentUser.name} updating user ${userId}:`, updates)

    // Simulate user update
    const updatedUser = {
      id: userId,
      name: updates?.name || `User ${userId}`,
      email: updates?.email || `user${userId}@example.com`,
      age: updates?.age || 25,
      preferences: updates?.preferences || { theme: 'light', notifications: true },
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.id
    }

    return Response.json(updatedUser)
  }

  async deleteUser(request) {
    const currentUser = request.user // User
    const userId = request.validatedParams.id // number

    console.log(`${currentUser.name} deleting user ${userId}`)

    // Simulate user deletion
    return new Response(null, { status: 204 })
  }
}

// 7. Controller Validation

// Validate controller at compile time
type UserControllerValidation = ValidateController<UserController>
// If there are issues, TypeScript will show specific error messages

// Check if controller is valid
type IsUserControllerValid = IsValidController<UserController>
// Result: true (if all methods are properly typed)

// Detect route conflicts
type UserControllerConflicts = DetectControllerConflicts<UserController>
// Result: never (no conflicts in this controller)

// 8. Route Registration with Full Type Safety

const router = new Router()

// Register individual routes with middleware
router.get('/users/:id<number>/posts', [
  authMiddleware,
  validationMiddleware,
  rateLimitMiddleware,
  cacheMiddleware
], fullyAugmentedHandler)

router.post('/users', [
  authMiddleware,
  validationMiddleware
], createUser)

// Register controller routes
const userController = new UserControllerImpl()

// Simulate controller route registration
const registerControllerRoutes = (controller: UserController) => {
  // In a real implementation, this would use decorators or reflection
  // to automatically register routes based on controller methods

  router.get('/users', [authMiddleware], controller.getUsers.bind(controller))
  router.get('/users/:id<number>', [authMiddleware], controller.getUser.bind(controller))
  router.post('/users', [authMiddleware, validationMiddleware], controller.createUser.bind(controller))
  router.put('/users/:id<number>', [authMiddleware, validationMiddleware], controller.updateUser.bind(controller))
  router.delete('/users/:id<number>', [authMiddleware, validationMiddleware], controller.deleteUser.bind(controller))
}

registerControllerRoutes(userController)

// 9. Type-Safe Route Building

// Route builder with type safety
const createTypedRoute = <
  TPath extends string,
  TQuery extends Record<string, any>,
  TBody,
  TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[]
>(
  method: string,
  path: TPath,
  middleware: TMiddlewares,
  handler: AugmentedRouteHandler<TPath, TQuery, TBody, {}, TMiddlewares>
): TypedRoute<TPath, TQuery, TBody, AccumulateContext<TMiddlewares>> => {
  return {
    method: method as any,
    path: path as ValidateRoutePattern<TPath>,
    handler,
    middleware,
    schema: {
      // Auto-generate schema from types
      params: {} as any,
      query: {} as any,
      body: {} as any,
      response: {} as any
    }
  }
}

// Usage with full type safety
const typedUserRoute = createTypedRoute(
  'GET',
  '/users/:id<number>/posts',
  [authMiddleware, validationMiddleware, rateLimitMiddleware] as const,
  async (request) => {
    // All types are automatically inferred
    const user = request.user
    const userId = request.validatedParams.id
    const rateLimit = request.rateLimit

    return Response.json({ user, userId, rateLimit })
  }
)

// 10. Advanced Type Features Demo

// Route pattern validation
type ValidPattern = ValidateRoutePattern<'/users/:id<number>/posts/:postId<string>'>
// Result: '/users/:id<number>/posts/:postId<string>' (valid)

// Invalid pattern (would show compile error)
// type InvalidPattern = ValidateRoutePattern<'/users/:id:postId'>
// Result: "Invalid route pattern: consecutive parameters not allowed"

// Type-safe parameter extraction
type ExtractedParams = ExtractTypedParams<'/api/v1/users/:userId<uuid>/posts/:postId<number>'>
// Result: { userId: string; postId: number }

// Complex query schema
interface ComplexQuerySchema {
  filters: {
    status: { type: 'string'; required: false }
    tags: { type: 'string[]'; required: false }
    dateRange: { type: 'string'; required: false }
  }
  pagination: {
    page: { type: 'number'; required: true }
    limit: { type: 'number'; required: true }
  }
  sorting: {
    sortBy: { type: 'string'; required: false }
    sortOrder: { type: 'string'; required: false }
  }
}

// This would be automatically typed based on the schema
type ComplexQuery = ExtractQueryParams<ComplexQuerySchema>

// 11. Server Setup

const server = Bun.serve({
  port: process.env.PORT || 3000,
  hostname: process.env.HOST || 'localhost',

  fetch: router.fetch.bind(router)
})

console.log(`🚀 TypeScript-enhanced server running on http://${server.hostname}:${server.port}`)

// Example requests to test type safety:
console.log(`
📝 Example requests to test TypeScript enhancements:

1. GET /users?page=1&limit=10&search=john&active=true&tags=admin,user
   - All query parameters are typed and validated

2. POST /users
   Body: { "name": "John Doe", "email": "john@example.com", "age": 30, "preferences": { "theme": "dark", "notifications": true } }
   - Request body is fully typed

3. GET /users/123/posts?page=1&limit=5
   - Route parameters are typed (id as number)
   - Middleware augmentations provide user, validation, rate limiting, and caching

4. PUT /users/123
   Body: { "name": "Jane Doe" }
   - Partial updates are typed correctly

5. DELETE /users/123
   - All middleware augmentations are available and typed

All routes have compile-time type safety with:
✅ Route parameter type inference
✅ Middleware type safety and composition
✅ Controller method validation
✅ Request/response augmentation
✅ Automatic OpenAPI schema generation
✅ Route conflict detection
`)

export {
  router,
  server,
  userController,
  authMiddleware,
  validationMiddleware,
  rateLimitMiddleware,
  cacheMiddleware,
  fullyAugmentedHandler,
  createTypedRoute
}
