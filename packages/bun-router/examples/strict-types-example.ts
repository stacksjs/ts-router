/**
 * Comprehensive example showcasing the extremely narrow and strict types
 * in the bun-router with Laravel-style design patterns.
 */

import type {
  ThrottlePattern,
  RouteDefinition,
  GetRoute,
  PostRoute,
  TypedRouteHandler,
  ExtractRouteParams,
  BuiltInMiddleware,
  MiddlewareWithParams,
  ActionPath,
  CommonRoutePatterns,
  ResourceRoutePatterns,
  CacheStrategy,
  HTTPMethod,
  ResponseStatus,
  ContentType,
} from '../src/types'

// Example 1: Extremely narrow throttle patterns
const strictThrottlePatterns: ThrottlePattern[] = [
  '60',           // 60 requests per 1 minute (default)
  '60,1',         // 60 requests per 1 minute (explicit)
  '100,30s',      // 100 requests per 30 seconds
  '1000,1h',      // 1000 requests per 1 hour
  '50,5min',      // 50 requests per 5 minutes
]

// Example 2: Strongly typed route handlers with parameter extraction
const userHandler: TypedRouteHandler<'/users/{id}'> = async (req) => {
  // TypeScript knows req.params has an 'id' property of type string
  const userId = req.params.id // Type: string

  return new Response(`User ID: ${userId}`)
}

const nestedHandler: TypedRouteHandler<'/users/{userId}/posts/{postId}'> = async (req) => {
  // TypeScript knows both userId and postId are available
  const { userId, postId } = req.params // Both are string type

  return new Response(`User ${userId}, Post ${postId}`)
}

// Example 3: Strongly typed route definitions
const getRoute: GetRoute<'/users/{id}'> = {
  method: 'GET',
  path: '/users/{id}',
  handler: userHandler,
  middleware: ['auth', 'throttle:60,1'],
  constraints: {
    id: 'number', // Type-safe constraint for the 'id' parameter
  },
  cache: {
    enabled: true,
    ttl: 300,
    strategy: 'stale-while-revalidate' as CacheStrategy,
  },
  throttle: '60,1' as ThrottlePattern,
}

const postRoute: PostRoute<'/users'> = {
  method: 'POST',
  path: '/users',
  handler: 'Actions/User/CreateAction' as ActionPath,
  middleware: ['auth', 'csrf'] as BuiltInMiddleware[],
  throttle: '100,30s' as ThrottlePattern,
}

// Example 4: Common route patterns with strict typing
const commonRoutes: RouteDefinition<CommonRoutePatterns>[] = [
  {
    path: '/',
    method: 'GET' as HTTPMethod,
    handler: 'Actions/Home/IndexAction' as ActionPath,
  },
  {
    path: '/health',
    method: 'GET' as HTTPMethod,
    handler: async () => new Response('OK', {
      status: 200 as ResponseStatus,
      headers: { 'Content-Type': 'text/plain' as ContentType }
    }),
  },
  {
    path: '/api/v1/users',
    method: 'GET' as HTTPMethod,
    handler: 'Actions/Api/User/IndexAction' as ActionPath,
    middleware: ['throttle:1000,1h'] as MiddlewareWithParams<BuiltInMiddleware>[],
  },
]

// Example 5: RESTful resource routes with strict typing
const userResourceRoutes: RouteDefinition<ResourceRoutePatterns<'users'>>[] = [
  {
    path: '/users',
    method: 'GET',
    handler: 'Actions/User/IndexAction' as ActionPath,
  },
  {
    path: '/users/{id}',
    method: 'GET',
    handler: 'Actions/User/ShowAction' as ActionPath,
    constraints: {
      id: 'uuid', // Strict UUID constraint
    },
  },
  {
    path: '/users/create',
    method: 'GET',
    handler: 'Actions/User/CreateFormAction' as ActionPath,
  },
  {
    path: '/users/{id}/edit',
    method: 'GET',
    handler: 'Actions/User/EditFormAction' as ActionPath,
    constraints: {
      id: 'uuid',
    },
  },
]

// Example 6: Advanced middleware with strict parameter typing
const middlewareExamples: MiddlewareWithParams<BuiltInMiddleware>[] = [
  'auth',                    // Simple middleware
  'throttle:60,1',          // Middleware with throttle pattern
  'throttle:100,30s',       // Middleware with seconds
  'throttle:1000,1h',       // Middleware with hours
  'cors',                   // CORS middleware
  'compress',               // Compression middleware
]

// Example 7: Type-safe parameter extraction utility
function extractParams<T extends string>(
  path: T,
  url: string
): ExtractRouteParams<T> | null {
  // This function would implement path matching
  // and return strongly typed parameters
  // Implementation details omitted for brevity
  return null as any
}

// Usage example with full type safety
const params1 = extractParams('/users/{id}', '/users/123')
// params1 has type: { id: string } | null

const params2 = extractParams('/users/{userId}/posts/{postId}', '/users/123/posts/456')
// params2 has type: { userId: string; postId: string } | null

// Example 8: Compile-time route validation
function defineRoute<TPath extends string>(
  config: RouteDefinition<TPath>
): RouteDefinition<TPath> {
  // This function provides compile-time validation
  // of route configurations with full type safety
  return config
}

// Usage with full IntelliSense and type checking
const typedRoute = defineRoute({
  path: '/api/v1/users/{userId}/posts/{postId}',
  method: 'GET',
  handler: async (req) => {
    // TypeScript automatically infers req.params.userId and req.params.postId
    const { userId, postId } = req.params
    return new Response(`User: ${userId}, Post: ${postId}`)
  },
  middleware: ['auth', 'throttle:60,1'],
  constraints: {
    userId: 'uuid',    // Type-safe constraint
    postId: 'number',  // Type-safe constraint
  },
  throttle: '100,30s', // Compile-time validated throttle pattern
})

// Example 9: Laravel-style fluent API with strict typing
class StrictFluentRoute<TPath extends string> {
  constructor(
    private method: HTTPMethod,
    private path: TPath,
    private handler: TypedRouteHandler<TPath>
  ) {}

  middleware(middleware: BuiltInMiddleware | MiddlewareWithParams<BuiltInMiddleware>): this {
    // Implementation with type safety
    return this
  }

  throttle(pattern: ThrottlePattern): this {
    // Compile-time validated throttle patterns
    return this
  }

  name(name: string): this {
    return this
  }

  cache(strategy: CacheStrategy, ttl: number): this {
    return this
  }

  constraints(constraints: {
    [K in keyof ExtractRouteParams<TPath>]: 'number' | 'alpha' | 'uuid' | 'slug'
  }): this {
    return this
  }
}

// Usage with complete type safety and IntelliSense
const fluentRoute = new StrictFluentRoute('GET', '/users/{id}/posts/{postId}', async (req) => {
  const { id, postId } = req.params // Fully typed
  return new Response(`User ${id}, Post ${postId}`)
})
  .middleware('auth')
  .throttle('60,1')          // Compile-time validated
  .cache('stale-while-revalidate', 300)
  .constraints({
    id: 'uuid',              // Type-safe constraint
    postId: 'number',        // Type-safe constraint
  })
  .name('users.posts.show')

console.log('All examples demonstrate extremely narrow and strict TypeScript types!')
console.log('Every string literal, pattern, and configuration is validated at compile-time.')
console.log('IntelliSense provides accurate autocompletion for all options.')