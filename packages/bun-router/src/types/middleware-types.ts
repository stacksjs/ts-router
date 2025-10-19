/**
 * Middleware Type Safety with Generic Constraints
 *
 * Advanced TypeScript utilities for type-safe middleware with generic constraints
 */

import type { RouteHandler, TypedRequest } from './route-inference'

// Base middleware interface with generic constraints
export interface TypedMiddleware<
  TInput = any,
  TOutput = TInput,
  _TContext = object,
  TNext = any,
> {
  (
    request: TInput,
    next: TNext
  ): Promise<TOutput> | TOutput
}

// Middleware context augmentation
export type AugmentContext<TBase, TAddition> = TBase & TAddition

// Request augmentation through middleware
export type AugmentRequest<TRequest, TAugmentation> = TRequest & TAugmentation

// Middleware chain type inference
export type MiddlewareChain<T extends readonly any[]> = T extends readonly [
  infer First,
  ...infer Rest,
]
  ? First extends TypedMiddleware<infer Input, infer Output, infer Context, any>
    ? Rest extends readonly []
      ? TypedMiddleware<Input, Output, Context, any>
      : Rest extends readonly TypedMiddleware<Output, any, any, any>[]
        ? MiddlewareChain<Rest> extends TypedMiddleware<Output, infer FinalOutput, infer RestContext, any>
          ? TypedMiddleware<Input, FinalOutput, Context & RestContext, any>
          : never
        : never
    : never
  : never

// Middleware composition types
export type ComposeMiddleware<
  TFirst extends TypedMiddleware<any, any, any, any>,
  TSecond extends TypedMiddleware<any, any, any, any>,
> = TFirst extends TypedMiddleware<infer Input1, infer Output1, infer Context1, any>
  ? TSecond extends TypedMiddleware<Output1, infer Output2, infer Context2, any>
    ? TypedMiddleware<Input1, Output2, Context1 & Context2, any>
    : never
  : never

// Authentication middleware types
export interface AuthenticatedRequest<TUser = any> {
  user: TUser
  isAuthenticated: true
}

export interface UnauthenticatedRequest {
  user?: never
  isAuthenticated: false
}

export type AuthMiddleware<TUser = any> = TypedMiddleware<
  Request,
  Request & AuthenticatedRequest<TUser>,
  { auth: { user: TUser } },
  any
>

// Authorization middleware types
export interface AuthorizedRequest<TPermissions extends string = string> {
  permissions: TPermissions[]
  hasPermission: (permission: TPermissions) => boolean
}

export type AuthzMiddleware<TPermissions extends string = string> = TypedMiddleware<
  Request & AuthenticatedRequest,
  Request & AuthenticatedRequest & AuthorizedRequest<TPermissions>,
  { authz: { permissions: TPermissions[] } },
  any
>

// Validation middleware types
export interface ValidatedRequest<TParams = any, TQuery = any, TBody = any> {
  validatedParams: TParams
  validatedQuery: TQuery
  validatedBody: TBody
}

export type ValidationMiddleware<TParams = any, TQuery = any, TBody = any> = TypedMiddleware<
  Request,
  Request & ValidatedRequest<TParams, TQuery, TBody>,
  { validation: { params: TParams, query: TQuery, body: TBody } },
  any
>

// Rate limiting middleware types
export interface RateLimitedRequest {
  rateLimit: {
    remaining: number
    reset: Date
    limit: number
  }
}

export type RateLimitMiddleware = TypedMiddleware<
  Request,
  Request & RateLimitedRequest,
  { rateLimit: RateLimitedRequest['rateLimit'] },
  any
>

// Caching middleware types
export interface CachedRequest {
  cache: {
    key: string
    ttl: number
    hit: boolean
  }
}

export type CacheMiddleware = TypedMiddleware<
  Request,
  Request & CachedRequest,
  { cache: CachedRequest['cache'] },
  any
>

// Logging middleware types
export interface LoggedRequest {
  requestId: string
  startTime: number
  logger: {
    info: (message: string, meta?: any) => void
    warn: (message: string, meta?: any) => void
    error: (message: string, meta?: any) => void
  }
}

export type LoggingMiddleware = TypedMiddleware<
  Request,
  Request & LoggedRequest,
  { logging: { requestId: string, logger: LoggedRequest['logger'] } },
  any
>

// CORS middleware types
export interface CORSRequest {
  cors: {
    origin: string
    methods: string[]
    headers: string[]
    credentials: boolean
  }
}

export type CORSMiddleware = TypedMiddleware<
  Request,
  Request & CORSRequest,
  { cors: CORSRequest['cors'] },
  any
>

// File upload middleware types
export interface FileUploadRequest<TFiles extends Record<string, any> = Record<string, File>> {
  files: TFiles
  formData: FormData
}

export type FileUploadMiddleware<TFiles extends Record<string, any> = Record<string, File>> = TypedMiddleware<
  Request,
  Request & FileUploadRequest<TFiles>,
  { upload: { files: TFiles } },
  any
>

// Session middleware types
export interface SessionRequest<TSession = any> {
  session: TSession & {
    id: string
    save: () => Promise<void>
    destroy: () => Promise<void>
    regenerate: () => Promise<void>
  }
}

export type SessionMiddleware<TSession = any> = TypedMiddleware<
  Request,
  Request & SessionRequest<TSession>,
  { session: SessionRequest<TSession>['session'] },
  any
>

// Middleware factory types
export interface MiddlewareFactory<TOptions = any, TMiddleware extends TypedMiddleware<any, any, any, any> = any> {
  (options?: TOptions): TMiddleware
}

// Conditional middleware types
export type ConditionalMiddleware<
  _TCondition extends (req: any) => boolean,
  TMiddleware extends TypedMiddleware<any, any, any, any>,
> = TypedMiddleware<
  Parameters<TMiddleware>[0],
  TMiddleware extends TypedMiddleware<any, infer Output, any, any> ? Output : never,
  TMiddleware extends TypedMiddleware<any, any, infer Context, any> ? Context : object,
  any
>

// Middleware group types
export interface MiddlewareGroup<TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[]> {
  middlewares: TMiddlewares
  compose: () => MiddlewareChain<TMiddlewares>
}

// Error handling middleware types
export interface ErrorHandlingRequest {
  error?: Error
  errorHandled: boolean
}

export type ErrorMiddleware = TypedMiddleware<
  Request & { error: Error },
  Response,
  { error: { handled: boolean } },
  any
>

// Middleware pipeline types
export interface MiddlewarePipeline<T extends readonly TypedMiddleware<any, any, any, any>[]> {
  readonly middlewares: T
  execute: <TRequest>(request: TRequest) => Promise<
    T extends readonly []
      ? TRequest
      : MiddlewareChain<T> extends TypedMiddleware<TRequest, infer Output, any, any>
        ? Output
        : never
  >
}

// Advanced middleware constraints
export interface MiddlewareConstraint<T> {
  input: T extends TypedMiddleware<infer Input, any, any, any> ? Input : never
  output: T extends TypedMiddleware<any, infer Output, any, any> ? Output : never
  context: T extends TypedMiddleware<any, any, infer Context, any> ? Context : never
}

// Middleware compatibility checking
export type MiddlewareCompatible<
  TFirst extends TypedMiddleware<any, any, any, any>,
  TSecond extends TypedMiddleware<any, any, any, any>,
> = MiddlewareConstraint<TFirst>['output'] extends MiddlewareConstraint<TSecond>['input']
  ? true
  : false

// Route-specific middleware types
export type RouteMiddleware<
  TPath extends string,
  TQuery extends Record<string, any> = object,
  TBody = unknown,
  TContext = object,
> = TypedMiddleware<
  TypedRequest<TPath, TQuery, TBody, TContext>,
  TypedRequest<TPath, TQuery, TBody, TContext>,
  TContext,
  RouteHandler<TPath, TQuery, TBody, TContext>
>

// Middleware builder interface
export interface MiddlewareBuilder<TContext = object> {
  use: <TNewContext>(
    middleware: TypedMiddleware<any, any, TNewContext, any>
  ) => MiddlewareBuilder<TContext & TNewContext>

  auth: <TUser>(
    middleware: AuthMiddleware<TUser>
  ) => MiddlewareBuilder<TContext & { auth: { user: TUser } }>

  validate: <TParams, TQuery, TBody>(
    middleware: ValidationMiddleware<TParams, TQuery, TBody>
  ) => MiddlewareBuilder<TContext & { validation: { params: TParams, query: TQuery, body: TBody } }>

  rateLimit: (
    middleware: RateLimitMiddleware
  ) => MiddlewareBuilder<TContext & { rateLimit: RateLimitedRequest['rateLimit'] }>

  cache: (
    middleware: CacheMiddleware
  ) => MiddlewareBuilder<TContext & { cache: CachedRequest['cache'] }>

  cors: (
    middleware: CORSMiddleware
  ) => MiddlewareBuilder<TContext & { cors: CORSRequest['cors'] }>

  session: <TSession>(
    middleware: SessionMiddleware<TSession>
  ) => MiddlewareBuilder<TContext & { session: SessionRequest<TSession>['session'] }>

  build: () => TypedMiddleware<Request, Request & TContext, TContext, any>[]
}

// Middleware execution context
export interface MiddlewareExecutionContext<TContext = object> {
  request: Request
  response?: Response
  context: TContext
  next: () => Promise<Response>
  skip: () => void
  abort: (response: Response) => void
}

// Middleware hooks
export interface MiddlewareHooks<TContext = object> {
  beforeExecution?: (context: MiddlewareExecutionContext<TContext>) => Promise<void> | void
  afterExecution?: (context: MiddlewareExecutionContext<TContext>, result: any) => Promise<void> | void
  onError?: (context: MiddlewareExecutionContext<TContext>, error: Error) => Promise<Response> | Response
}

// Async middleware types
export type AsyncMiddleware<
  TInput = any,
  TOutput = TInput,
  TContext = object,
  TNext = any,
> = TypedMiddleware<TInput, Promise<TOutput>, TContext, TNext>

// Middleware metadata
export interface MiddlewareMetadata {
  name: string
  version?: string
  description?: string
  dependencies?: string[]
  tags?: string[]
  priority?: number
}

// Decorated middleware
export interface DecoratedMiddleware<
  TInput = any,
  TOutput = TInput,
  TContext = object,
  TNext = any,
> extends TypedMiddleware<TInput, TOutput, TContext, TNext> {
  metadata: MiddlewareMetadata
}

// Middleware registry
export interface MiddlewareRegistry {
  register: <T extends TypedMiddleware<any, any, any, any>>(
    name: string,
    middleware: T,
    metadata?: Partial<MiddlewareMetadata>
  ) => void

  get: <T extends TypedMiddleware<any, any, any, any>>(name: string) => T | undefined

  list: () => Array<{ name: string, middleware: TypedMiddleware<any, any, any, any>, metadata: MiddlewareMetadata }>

  resolve: (dependencies: string[]) => TypedMiddleware<any, any, any, any>[]
}

// Middleware composition utilities
export type Compose<T extends readonly TypedMiddleware<any, any, any, any>[]> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends TypedMiddleware<infer Input, infer Output, infer Context, any>
      ? Rest extends readonly TypedMiddleware<any, any, any, any>[]
        ? Rest extends readonly []
          ? TypedMiddleware<Input, Output, Context, any>
          : Compose<Rest> extends TypedMiddleware<Output, infer FinalOutput, infer RestContext, any>
            ? TypedMiddleware<Input, FinalOutput, Context & RestContext, any>
            : never
        : never
      : never
    : TypedMiddleware<any, any, object, any>

// Middleware type guards
export type IsMiddleware<T> = T extends TypedMiddleware<any, any, any, any> ? true : false

export type IsCompatibleMiddleware<T1, T2> =
  T1 extends TypedMiddleware<any, infer Output1, any, any>
    ? T2 extends TypedMiddleware<Output1, any, any, any>
      ? true
      : false
    : false

// Middleware transformation types
export type TransformMiddleware<
  TMiddleware extends TypedMiddleware<any, any, any, any>,
  TNewInput,
  TNewOutput = TNewInput,
> = TMiddleware extends TypedMiddleware<any, any, infer Context, any>
  ? TypedMiddleware<TNewInput, TNewOutput, Context, any>
  : never

// Route-aware middleware
export type RouteAwareMiddleware<TRoutes extends Record<string, any> = object> = {
  [K in keyof TRoutes]: TRoutes[K] extends RouteHandler<infer Path, infer Query, infer Body, infer Context>
    ? RouteMiddleware<Path, Query, Body, Context>
    : never
}

// Middleware performance tracking
export interface MiddlewarePerformance {
  name: string
  executionTime: number
  memoryUsage: number
  callCount: number
  errorCount: number
}

export type PerformanceTrackingMiddleware<T extends TypedMiddleware<any, any, any, any>> =
  T & {
    getPerformanceMetrics: () => MiddlewarePerformance
    resetMetrics: () => void
  }

// Export all middleware types
