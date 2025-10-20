# TypeScript Enhancements

This guide covers the comprehensive TypeScript enhancements in bun-router, including route parameter type inference, middleware type safety, controller method type checking, and request/response type augmentation.

## Table of Contents

- [Route Parameter Type Inference](#route-parameter-type-inference)
- [Middleware Type Safety](#middleware-type-safety)
- [Controller Method Type Checking](#controller-method-type-checking)
- [Request/Response Type Augmentation](#requestresponse-type-augmentation)
- [Advanced Type Features](#advanced-type-features)
- [Best Practices](#best-practices)

## Route Parameter Type Inference

Automatic type inference from URL patterns with compile-time validation.

### Basic Parameter Extraction

```typescript
import type { ExtractTypedParams, TypedRequest, RouteHandler } from 'bun-router'

// Basic string parameters
type UserParams = ExtractTypedParams<'/users/:id/posts/:postId'>
// Result: { id: string; postId: string }

// Optional parameters
type OptionalParams = ExtractTypedParams<'/users/:id?/posts'>
// Result: { id?: string }

// Wildcard parameters
type WildcardParams = ExtractTypedParams<'/files/*'>
// Result: { '*': string }
```

### Typed Parameters with Constraints

```typescript
// Typed parameters with validation
type TypedParams = ExtractTypedParams<'/users/:id<number>/posts/:slug<string>'>
// Result: { id: number; slug: string }

// Enum parameters
type StatusParams = ExtractTypedParams<'/posts/:status<enum(draft|published|archived)>'>
// Result: { status: 'draft' | 'published' | 'archived' }

// Date parameters
type DateParams = ExtractTypedParams<'/events/:date<date>'>
// Result: { date: Date }

// UUID parameters
type UUIDParams = ExtractTypedParams<'/resources/:id<uuid>'>
// Result: { id: string } (with UUID validation)
```

### Advanced Parameter Types

```typescript
// Range constraints
type RangeParams = ExtractTypedParams<'/items/:page<range(1,100)>'>
// Result: { page: number } (validated between 1-100)

// Length constraints
type LengthParams = ExtractTypedParams<'/search/:query<length(3,50)>'>
// Result: { query: string } (validated length 3-50)

// Pattern constraints
type PatternParams = ExtractTypedParams<'/users/:username<pattern([a-zA-Z0-9_]+)>'>
// Result: { username: string } (validated against regex)
```

### Query Parameter Inference

```typescript
// Query parameter schema
interface UserQuerySchema {
  page: 'number'
  limit: 'number'
  search: 'string'
  active: 'boolean'
  tags: 'string[]'
}

type UserQuery = ExtractQueryParams<UserQuerySchema>
// Result: {
//   page: number
//   limit: number
//   search: string
//   active: boolean
//   tags: string[]
// }

// Optional query parameters
interface OptionalQuerySchema {
  required: { type: 'string'; required: true }
  optional: { type: 'number'; required: false }
}

type OptionalQuery = ExtractQueryParams<OptionalQuerySchema>
// Result: {
//   required: string
//   optional: number | undefined
// }
```

### Type-Safe Route Handlers

```typescript
// Fully typed route handler
const getUserPosts: RouteHandler<
  '/users/:id<number>/posts',
  { page: 'number'; limit: 'number' },
  never
> = async (request) => {
  // request.params.id is automatically typed as number
  // request.query.page is automatically typed as number
  // request.query.limit is automatically typed as number

  const userId = request.params.id // number
  const page = request.query.page // number
  const limit = request.query.limit // number

  const posts = await getPostsForUser(userId, { page, limit })
  return Response.json(posts)
}

// POST route with body
const createUser: RouteHandler<
  '/users',
  {},
  { name: string; email: string; age: number }
> = async (request) => {
  // request.body is automatically typed
  const userData = request.body // { name: string; email: string; age: number }

  const user = await createUserInDB(userData)
  return Response.json(user, { status: 201 })
}
```

## Middleware Type Safety

Type-safe middleware with generic constraints and automatic type propagation.

### Basic Middleware Types

```typescript
import type { TypedMiddleware, AuthMiddleware, ValidationMiddleware } from 'bun-router'

// Authentication middleware
interface User {
  id: string
  email: string
  roles: string[]
}

const authMiddleware: AuthMiddleware<User> = async (request, next) => {
  const token = request.headers.get('authorization')

  if (!token) {
    return new Response('Unauthorized', { status: 401 })
  }

  const user = await validateToken(token)

  // Augment request with user
  const augmentedRequest = request as typeof request & {
    user: User
    isAuthenticated: true
  }
  augmentedRequest.user = user
  augmentedRequest.isAuthenticated = true

  return await next()
}

// Validation middleware
const validationMiddleware: ValidationMiddleware<
  { id: number },
  { page: number },
  { name: string }
> = async (request, next) => {
  // Validate and transform parameters
  const validatedParams = {
    id: parseInt(request.params.id)
  }

  const validatedQuery = {
    page: parseInt(request.query.page) || 1
  }

  const validatedBody = request.body as { name: string }

  // Augment request
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
```

### Middleware Composition

```typescript
import type { ComposeMiddleware, MiddlewareChain } from 'bun-router'

// Compose two middleware types
type AuthValidationMiddleware = ComposeMiddleware<
  AuthMiddleware<User>,
  ValidationMiddleware<{ id: number }, {}, { name: string }>
>

// Middleware chain
type MiddlewareStack = MiddlewareChain<[
  AuthMiddleware<User>,
  ValidationMiddleware<{ id: number }, {}, { name: string }>,
  RateLimitMiddleware
]>

// Usage with route
const protectedRoute: RouteHandler<
  '/users/:id<number>',
  {},
  { name: string },
  // Context accumulated from middleware
  {
    auth: { user: User }
    validation: { params: { id: number }; body: { name: string } }
    rateLimit: { remaining: number; reset: Date }
  }
> = async (request) => {
  // All middleware augmentations are available
  const user = request.user // User (from auth middleware)
  const userId = request.validatedParams.id // number (from validation middleware)
  const userData = request.validatedBody // { name: string }
  const rateLimit = request.rateLimit // { remaining: number; reset: Date }

  return Response.json({ success: true })
}
```

### Conditional Middleware

```typescript
import type { ConditionalMiddleware } from 'bun-router'

// Middleware that only applies under certain conditions
type AdminOnlyMiddleware = ConditionalMiddleware<
  (req: Request & { user: User }) => boolean,
  AuthzMiddleware<'admin'>
>

const adminCheck = (req: Request & { user: User }) =>
  req.user.roles.includes('admin')

const adminMiddleware: AdminOnlyMiddleware = async (request, next) => {
  if (!adminCheck(request)) {
    return new Response('Forbidden', { status: 403 })
  }

  return await next()
}
```

## Controller Method Type Checking

Compile-time validation of controller methods with automatic route inference.

### Basic Controller Definition

```typescript
import type { BaseController, ControllerRoute } from 'bun-router'

interface UserController extends BaseController {
  // GET /users
  getUsers(
    request: TypedRequest<'/users', { page: 'number'; limit: 'number' }, never>
  ): Promise<Response>

  // GET /users/:id
  getUser(
    request: TypedRequest<'/users/:id<number>', {}, never>
  ): Promise<Response>

  // POST /users
  createUser(
    request: TypedRequest<'/users', {}, { name: string; email: string }>
  ): Promise<Response>

  // PUT /users/:id
  updateUser(
    request: TypedRequest<'/users/:id<number>', {}, { name?: string; email?: string }>
  ): Promise<Response>

  // DELETE /users/:id
  deleteUser(
    request: TypedRequest<'/users/:id<number>', {}, never>
  ): Promise<Response>
}
```

### Controller with Decorators

```typescript
import type {
  ControllerDecorator,
  GetDecorator,
  PostDecorator,
  PutDecorator,
  DeleteDecorator,
  ParamDecorator,
  BodyDecorator,
  QueryDecorator
} from 'bun-router'

// Controller decorator
@Controller({ prefix: '/api/v1/users' })
class UserController implements BaseController {

  @Get<'/'>()
  async getUsers(
    @Query<'page'>() page: number,
    @Query<'limit'>() limit: number
  ): Promise<Response> {
    const users = await getUsersFromDB({ page, limit })
    return Response.json(users)
  }

  @Get<'/:id<number>'>()
  async getUser(
    @Param<'id'>() id: number
  ): Promise<Response> {
    const user = await getUserFromDB(id)
    if (!user) {
      return new Response('User not found', { status: 404 })
    }
    return Response.json(user)
  }

  @Post<'/'>()
  async createUser(
    @Body() userData: { name: string; email: string }
  ): Promise<Response> {
    const user = await createUserInDB(userData)
    return Response.json(user, { status: 201 })
  }

  @Put<'/:id<number>'>()
  async updateUser(
    @Param<'id'>() id: number,
    @Body() updates: { name?: string; email?: string }
  ): Promise<Response> {
    const user = await updateUserInDB(id, updates)
    return Response.json(user)
  }

  @Delete<'/:id<number>'>()
  async deleteUser(
    @Param<'id'>() id: number
  ): Promise<Response> {
    await deleteUserFromDB(id)
    return new Response(null, { status: 204 })
  }
}
```

### Controller Validation

```typescript
import type {
  ValidateController,
  IsValidController,
  DetectControllerConflicts
} from 'bun-router'

// Validate controller at compile time
type UserControllerValidation = ValidateController<UserController>
// If invalid, shows specific error messages for each method

// Check if controller is valid
type IsValid = IsValidController<UserController>
// Result: true | false

// Detect route conflicts
type Conflicts = DetectControllerConflicts<UserController>
// Shows any conflicting route definitions
```

### Controller with Middleware

```typescript
interface AuthenticatedUserController extends BaseController {
  getProfile(
    request: EnhancedRequest<
      '/profile',
      {},
      never,
      {},
      { auth: { user: User } }
    >
  ): Promise<Response>

  updateProfile(
    request: EnhancedRequest<
      '/profile',
      {},
      { name?: string; email?: string },
      {},
      {
        auth: { user: User }
        validation: { body: { name?: string; email?: string } }
      }
    >
  ): Promise<Response>
}

@Controller({
  prefix: '/api/v1',
  middleware: [authMiddleware, validationMiddleware]
})
class AuthenticatedUserController implements AuthenticatedUserController {

  @Get<'/profile'>()
  async getProfile(request) {
    // request.user is automatically available and typed
    const user = request.user // User
    return Response.json(user)
  }

  @Put<'/profile'>()
  async updateProfile(request) {
    const user = request.user // User
    const updates = request.validatedBody // { name?: string; email?: string }

    const updatedUser = await updateUserInDB(user.id, updates)
    return Response.json(updatedUser)
  }
}
```

## Request/Response Type Augmentation

Automatic type augmentation based on applied middleware.

### Enhanced Request Types

```typescript
import type {
  EnhancedRequest,
  AugmentRequestThroughChain,
  AccumulateContext
} from 'bun-router'

// Request augmented through middleware chain
type MiddlewareStack = [
  AuthMiddleware<User>,
  ValidationMiddleware<{ id: number }, { page: number }, { name: string }>,
  RateLimitMiddleware,
  CacheMiddleware
]

type AugmentedRequest = EnhancedRequest<
  '/users/:id<number>',
  { page: 'number' },
  { name: string },
  {},
  AccumulateContext<MiddlewareStack>
>

// The augmented request automatically has:
// - request.user: User
// - request.isAuthenticated: boolean
// - request.validatedParams: { id: number }
// - request.validatedQuery: { page: number }
// - request.validatedBody: { name: string }
// - request.rateLimit: { remaining: number; reset: Date; limit: number }
// - request.cache: { key: string; ttl: number; hit: boolean }
```

### Conditional Augmentation

```typescript
// Augmentation only applied when middleware is present
type ConditionallyAugmented<T extends readonly TypedMiddleware<any, any, any, any>[]> =
  EnhancedRequest<
    '/api/resource',
    {},
    never,
    {},
    AccumulateContext<T>
  >

// With auth middleware
type WithAuth = ConditionallyAugmented<[AuthMiddleware<User>]>
// Has: request.user, request.isAuthenticated

// Without auth middleware
type WithoutAuth = ConditionallyAugmented<[]>
// Does not have auth properties
```

### Response Augmentation

```typescript
import type { EnhancedResponse } from 'bun-router'

// Response augmented with middleware context
type AugmentedResponse = EnhancedResponse<{
  cache: { key: string; hit: boolean }
  rateLimit: { remaining: number }
  logging: { requestId: string }
}>

// The augmented response automatically has:
// - response.cached?: boolean
// - response.rateLimited?: boolean
// - response.requestId?: string
// - response.executionTime?: number
```

### Middleware-Aware Route Building

```typescript
import type { AugmentedRouteBuilder, AugmentedRoute } from 'bun-router'

const routeBuilder: AugmentedRouteBuilder = {
  get<TPath, TQuery, TMiddlewares>(
    path: TPath,
    middleware: TMiddlewares,
    handler: AugmentedRouteHandler<TPath, TQuery, never, {}, TMiddlewares>
  ) {
    return {
      method: 'GET',
      path,
      middleware,
      handler
    }
  }
}

// Usage
const userRoute = routeBuilder.get(
  '/users/:id<number>',
  [authMiddleware, validationMiddleware],
  async (request) => {
    // request is automatically typed with all middleware augmentations
    const user = request.user // User (from auth)
    const userId = request.validatedParams.id // number (from validation)

    return Response.json({ user, userId })
  }
)
```

## Advanced Type Features

### Route Pattern Validation

```typescript
import type { ValidateRoutePattern, ValidateParamType } from 'bun-router'

// Valid patterns
type Valid1 = ValidateRoutePattern<'/users/:id/posts/:postId'>
// Result: '/users/:id/posts/:postId'

type Valid2 = ValidateRoutePattern<'/items/:id<number>'>
// Result: '/items/:id<number>'

// Invalid patterns (compile-time errors)
type Invalid1 = ValidateRoutePattern<'/users/:id:postId'>
// Result: "Invalid route pattern: consecutive parameters not allowed"

type Invalid2 = ValidateRoutePattern<'/items/:id<invalid>'>
// Result: "Invalid parameter type 'invalid' in route"
```

### Type-Safe Route Matching

```typescript
import type { MatchRoute, ExtractParamsFromPath } from 'bun-router'

// Route matching
type Match1 = MatchRoute<'/users/:id', '/users/123'>
// Result: true

type Match2 = MatchRoute<'/users/:id', '/posts/123'>
// Result: false

// Parameter extraction
type Params = ExtractParamsFromPath<'/users/:id/posts/:postId', '/users/123/posts/456'>
// Result: { id: '123'; postId: '456' }
```

### OpenAPI Schema Generation

```typescript
import type { GenerateOpenAPISchema } from 'bun-router'

type UserRoutes = TypedRoute<'/users/:id<number>', { include: 'string' }, { name: string }>

type OpenAPISchema = GenerateOpenAPISchema<UserRoutes>
// Automatically generates OpenAPI schema with:
// - Path parameters with correct types
// - Query parameters with validation
// - Request/response body schemas
// - Operation IDs and descriptions
```

### Conflict Detection

```typescript
import type { DetectRouteConflicts } from 'bun-router'

type Routes = [
  TypedRoute<'/users/:id', {}, never>,
  TypedRoute<'/users/:userId', {}, never>  // Conflict!
]

type Conflicts = DetectRouteConflicts<Routes>
// Result: "Route conflict: '/users/:id' is defined multiple times"
```

## Best Practices

### 1. Use Typed Parameters

```typescript
// ✅ Good: Use typed parameters for validation
type UserRoute = '/users/:id<number>/posts/:slug<string>'

// ❌ Avoid: Plain string parameters without validation
type PlainRoute = '/users/:id/posts/:slug'
```

### 2. Leverage Middleware Type Safety

```typescript
// ✅ Good: Compose middleware with proper types
const secureRoute = routeBuilder.post(
  '/api/users',
  [authMiddleware, validationMiddleware, rateLimitMiddleware],
  async (request) => {
    // All middleware augmentations are properly typed
    const user = request.user
    const validatedData = request.validatedBody
    const rateLimit = request.rateLimit

    return Response.json({ success: true })
  }
)

// ❌ Avoid: Untyped middleware usage
const unsafeRoute = (request: any) => {
  const user = request.user // No type safety
  return Response.json(user)
}
```

### 3. Use Controller Validation

```typescript
// ✅ Good: Validate controllers at compile time
interface UserController extends BaseController {
  getUser(request: TypedRequest<'/users/:id<number>', {}, never>): Promise<Response>
}

type IsValid = IsValidController<UserController> // true

// ❌ Avoid: Invalid controller methods
interface BadController extends BaseController {
  badMethod(wrongParam: string): string // Invalid signature
}

type IsInvalid = IsValidController<BadController> // false
```

### 4. Leverage Type Inference

```typescript
// ✅ Good: Let TypeScript infer types from patterns
const handler: RouteHandler<'/users/:id<number>', { page: 'number' }> =
  async (request) => {
    // TypeScript automatically knows:
    // request.params.id is number
    // request.query.page is number

    return Response.json({ id: request.params.id, page: request.query.page })
  }
```

### 5. Use Augmentation Builders

```typescript
// ✅ Good: Use builders for complex augmentations
const augmentedRequest = new AugmentationBuilder<Request>()
  .withAuth(authMiddleware)
  .withValidation(validationMiddleware)
  .withRateLimit(rateLimitMiddleware)
  .build()

// Type is automatically: Request & AuthenticatedRequest & ValidatedRequest & RateLimitedRequest
```

### 6. Validate Route Conflicts

```typescript
// ✅ Good: Check for conflicts at compile time
type Routes = [
  TypedRoute<'/users/:id', {}, never>,
  TypedRoute<'/users/profile', {}, never>,  // OK: specific before parameter
  TypedRoute<'/posts/:id', {}, never>       // OK: different path
]

type NoConflicts = DetectRouteConflicts<Routes> // never (no conflicts)
```

### 7. Use Factory Functions

```typescript
// ✅ Good: Create reusable typed factories
function createCRUDController<T, TId = string>(
  resource: string,
  idType: 'string' | 'number' = 'string'
) {
  return {
    list: (request: TypedRequest<`/${typeof resource}`, { page: 'number' }>) =>
      Promise<Response>,

    get: (request: TypedRequest<`/${typeof resource}/:id<${typeof idType}>`, {}>) =>
      Promise<Response>,

    create: (request: TypedRequest<`/${typeof resource}`, {}, T>) =>
      Promise<Response>,

    update: (request: TypedRequest<`/${typeof resource}/:id<${typeof idType}>`, {}, Partial<T>>) =>
      Promise<Response>,

    delete: (request: TypedRequest<`/${typeof resource}/:id<${typeof idType}>`, {}>) =>
      Promise<Response>
  }
}

// Usage
const userController = createCRUDController<User, 'number'>('users', 'number')
```

This comprehensive TypeScript enhancement system provides compile-time safety, automatic type inference, and excellent developer experience while maintaining runtime performance.
