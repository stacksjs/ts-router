/**
 * Request/Response Type Augmentation Based on Middleware
 *
 * Advanced TypeScript utilities for augmenting request/response types through middleware
 */

import type {
  AuthenticatedRequest,
  AuthorizedRequest,
  CachedRequest,
  CORSRequest,
  FileUploadRequest,
  LoggedRequest,
  MiddlewareChain,
  RateLimitedRequest,
  SessionRequest,
  TypedMiddleware,
  ValidatedRequest,
} from './middleware-types'
import type {
  ExtractQueryParams,
  ExtractTypedParams,
  TypedRequest,
} from './route-inference'

// Base augmentation interface
export interface RequestAugmentation {
  [key: string]: any
}

export interface ResponseAugmentation {
  [key: string]: any
}

// Middleware augmentation extraction
export type ExtractMiddlewareAugmentation<T> =
  T extends TypedMiddleware<infer Input, infer Output, infer Context, any>
    ? {
        input: Input
        output: Output
        context: Context
        augmentation: Output extends Input & infer Aug ? Aug : {}
      }
    : never

// Request augmentation through middleware chain
export type AugmentRequestThroughChain<
  TRequest,
  TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[],
> = TMiddlewares extends readonly [infer First, ...infer Rest]
  ? First extends TypedMiddleware<TRequest, infer Output, any, any>
    ? Rest extends readonly TypedMiddleware<any, any, any, any>[]
      ? AugmentRequestThroughChain<Output, Rest>
      : Output
    : TRequest
  : TRequest

// Context accumulation through middleware chain
export type AccumulateContext<
  TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[],
> = TMiddlewares extends readonly [infer First, ...infer Rest]
  ? First extends TypedMiddleware<any, any, infer Context, any>
    ? Rest extends readonly TypedMiddleware<any, any, any, any>[]
      ? Context & AccumulateContext<Rest>
      : Context
    : {}
  : {}

// Enhanced request with middleware augmentations
export interface EnhancedRequest<
  TPath extends string = string,
  TQuery extends Record<string, any> = {},
  TBody = unknown,
  TContext = {},
  TAugmentations = {},
> extends TypedRequest<TPath, TQuery, TBody, TContext> {
  // Core request properties
  params: ExtractTypedParams<TPath>
  query: ExtractQueryParams<TQuery>
  body: TBody
  context: TContext & TAugmentations

  // Middleware augmentations (conditionally added)
  user?: TAugmentations extends { auth: any }
    ? TAugmentations['auth']['user']
    : never

  isAuthenticated?: TAugmentations extends { auth: any }
    ? boolean
    : never

  permissions?: TAugmentations extends { authz: any }
    ? TAugmentations['authz']['permissions']
    : never

  hasPermission?: TAugmentations extends { authz: any }
    ? (permission: string) => boolean
    : never

  validatedParams?: TAugmentations extends { validation: any }
    ? TAugmentations['validation']['params']
    : never

  validatedQuery?: TAugmentations extends { validation: any }
    ? TAugmentations['validation']['query']
    : never

  validatedBody?: TAugmentations extends { validation: any }
    ? TAugmentations['validation']['body']
    : never

  rateLimit?: TAugmentations extends { rateLimit: any }
    ? TAugmentations['rateLimit']
    : never

  cache?: TAugmentations extends { cache: any }
    ? TAugmentations['cache']
    : never

  requestId?: TAugmentations extends { logging: any }
    ? string
    : never

  logger?: TAugmentations extends { logging: any }
    ? TAugmentations['logging']['logger']
    : never

  cors?: TAugmentations extends { cors: any }
    ? TAugmentations['cors']
    : never

  files?: TAugmentations extends { upload: any }
    ? TAugmentations['upload']['files']
    : never

  session?: TAugmentations extends { session: any }
    ? TAugmentations['session']
    : never
}

// Enhanced response with middleware augmentations
export interface EnhancedResponse<TAugmentations = {}> extends Response {
  // Middleware-added properties
  cached?: TAugmentations extends { cache: any }
    ? boolean
    : never

  rateLimited?: TAugmentations extends { rateLimit: any }
    ? boolean
    : never

  requestId?: TAugmentations extends { logging: any }
    ? string
    : never

  executionTime?: TAugmentations extends { logging: any }
    ? number
    : never
}

// Middleware-aware route handler
export type AugmentedRouteHandler<
  TPath extends string,
  TQuery extends Record<string, any> = {},
  TBody = unknown,
  TContext = {},
  TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[] = [],
> = (
  request: EnhancedRequest<
    TPath,
    TQuery,
    TBody,
    TContext,
    AccumulateContext<TMiddlewares>
  >
) => Promise<EnhancedResponse<AccumulateContext<TMiddlewares>>> | EnhancedResponse<AccumulateContext<TMiddlewares>>

// Type-safe middleware application
export type ApplyMiddleware<
  TRequest,
  TMiddleware extends TypedMiddleware<any, any, any, any>,
> = TMiddleware extends TypedMiddleware<TRequest, infer Output, infer Context, any>
  ? {
      request: Output
      context: Context
    }
  : never

// Sequential middleware application
export type ApplyMiddlewareSequence<
  TRequest,
  TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[],
> = TMiddlewares extends readonly [infer First, ...infer Rest]
  ? First extends TypedMiddleware<TRequest, infer Output, infer Context, any>
    ? Rest extends readonly TypedMiddleware<any, any, any, any>[]
      ? ApplyMiddlewareSequence<Output, Rest> extends {
        request: infer FinalRequest
        context: infer RestContext
      }
        ? {
            request: FinalRequest
            context: Context & RestContext
          }
        : {
            request: Output
            context: Context
          }
      : {
          request: Output
          context: Context
        }
    : {
        request: TRequest
        context: {}
      }
  : {
      request: TRequest
      context: {}
    }

// Conditional augmentation based on middleware presence
export type ConditionalAugmentation<
  TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[],
  TAugmentation,
> = TMiddlewares extends readonly []
  ? {}
  : TAugmentation

// Authentication augmentation
export type AuthAugmentation<TUser = any> = ConditionalAugmentation<
  [TypedMiddleware<any, any, { auth: { user: TUser } }, any>],
  AuthenticatedRequest<TUser>
>

// Authorization augmentation
export type AuthzAugmentation<TPermissions extends string = string> = ConditionalAugmentation<
  [TypedMiddleware<any, any, { authz: { permissions: TPermissions[] } }, any>],
  AuthorizedRequest<TPermissions>
>

// Validation augmentation
export type ValidationAugmentation<TParams = any, TQuery = any, TBody = any> = ConditionalAugmentation<
  [TypedMiddleware<any, any, { validation: { params: TParams, query: TQuery, body: TBody } }, any>],
  ValidatedRequest<TParams, TQuery, TBody>
>

// Rate limiting augmentation
export type RateLimitAugmentation = ConditionalAugmentation<
  [TypedMiddleware<any, any, { rateLimit: RateLimitedRequest['rateLimit'] }, any>],
  RateLimitedRequest
>

// Caching augmentation
export type CacheAugmentation = ConditionalAugmentation<
  [TypedMiddleware<any, any, { cache: CachedRequest['cache'] }, any>],
  CachedRequest
>

// Logging augmentation
export type LoggingAugmentation = ConditionalAugmentation<
  [TypedMiddleware<any, any, { logging: { requestId: string, logger: LoggedRequest['logger'] } }, any>],
  LoggedRequest
>

// CORS augmentation
export type CORSAugmentation = ConditionalAugmentation<
  [TypedMiddleware<any, any, { cors: CORSRequest['cors'] }, any>],
  CORSRequest
>

// File upload augmentation
export type FileUploadAugmentation<TFiles extends Record<string, any> = Record<string, File>> = ConditionalAugmentation<
  [TypedMiddleware<any, any, { upload: { files: TFiles } }, any>],
  FileUploadRequest<TFiles>
>

// Session augmentation
export type SessionAugmentation<TSession = any> = ConditionalAugmentation<
  [TypedMiddleware<any, any, { session: SessionRequest<TSession>['session'] }, any>],
  SessionRequest<TSession>
>

// Combined augmentations
export type CombineAugmentations<T extends Record<string, any>[]> = T extends [
  infer First,
  ...infer Rest,
]
  ? First extends Record<string, any>
    ? Rest extends Record<string, any>[]
      ? First & CombineAugmentations<Rest>
      : First
    : {}
  : {}

// Middleware type detection
export type HasAuthMiddleware<T extends readonly TypedMiddleware<any, any, any, any>[]> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends TypedMiddleware<any, any, { auth: any }, any>
      ? true
      : Rest extends readonly TypedMiddleware<any, any, any, any>[]
        ? HasAuthMiddleware<Rest>
        : false
    : false

export type HasValidationMiddleware<T extends readonly TypedMiddleware<any, any, any, any>[]> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends TypedMiddleware<any, any, { validation: any }, any>
      ? true
      : Rest extends readonly TypedMiddleware<any, any, any, any>[]
        ? HasValidationMiddleware<Rest>
        : false
    : false

export type HasRateLimitMiddleware<T extends readonly TypedMiddleware<any, any, any, any>[]> =
  T extends readonly [infer First, ...infer Rest]
    ? First extends TypedMiddleware<any, any, { rateLimit: any }, any>
      ? true
      : Rest extends readonly TypedMiddleware<any, any, any, any>[]
        ? HasRateLimitMiddleware<Rest>
        : false
    : false

// Augmentation builder
export interface AugmentationBuilder<TBase = Request> {
  withAuth: <TUser>(
    middleware: TypedMiddleware<any, any, { auth: { user: TUser } }, any>
  ) => AugmentationBuilder<TBase & AuthenticatedRequest<TUser>>

  withValidation: <TParams, TQuery, TBody>(
    middleware: TypedMiddleware<any, any, { validation: { params: TParams, query: TQuery, body: TBody } }, any>
  ) => AugmentationBuilder<TBase & ValidatedRequest<TParams, TQuery, TBody>>

  withRateLimit: (
    middleware: TypedMiddleware<any, any, { rateLimit: RateLimitedRequest['rateLimit'] }, any>
  ) => AugmentationBuilder<TBase & RateLimitedRequest>

  withCache: (
    middleware: TypedMiddleware<any, any, { cache: CachedRequest['cache'] }, any>
  ) => AugmentationBuilder<TBase & CachedRequest>

  withLogging: (
    middleware: TypedMiddleware<any, any, { logging: { requestId: string, logger: LoggedRequest['logger'] } }, any>
  ) => AugmentationBuilder<TBase & LoggedRequest>

  withCORS: (
    middleware: TypedMiddleware<any, any, { cors: CORSRequest['cors'] }, any>
  ) => AugmentationBuilder<TBase & CORSRequest>

  withFileUpload: <TFiles extends Record<string, any>>(
    middleware: TypedMiddleware<any, any, { upload: { files: TFiles } }, any>
  ) => AugmentationBuilder<TBase & FileUploadRequest<TFiles>>

  withSession: <TSession>(
    middleware: TypedMiddleware<any, any, { session: SessionRequest<TSession>['session'] }, any>
  ) => AugmentationBuilder<TBase & SessionRequest<TSession>>

  build: () => TBase
}

// Route with augmented types
export interface AugmentedRoute<
  TPath extends string,
  TQuery extends Record<string, any> = {},
  TBody = unknown,
  TContext = {},
  TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[] = [],
> {
  method: string
  path: TPath
  handler: AugmentedRouteHandler<TPath, TQuery, TBody, TContext, TMiddlewares>
  middleware: TMiddlewares
  augmentedRequest: EnhancedRequest<TPath, TQuery, TBody, TContext, AccumulateContext<TMiddlewares>>
  augmentedResponse: EnhancedResponse<AccumulateContext<TMiddlewares>>
}

// Type-safe route builder with augmentation
export interface AugmentedRouteBuilder<TContext = {}> {
  get: <
    TPath extends string,
    TQuery extends Record<string, any> = {},
    TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[] = [],
  >(
    path: TPath,
    middleware: TMiddlewares,
    handler: AugmentedRouteHandler<TPath, TQuery, never, TContext, TMiddlewares>
  ) => AugmentedRoute<TPath, TQuery, never, TContext, TMiddlewares>

  post: <
    TPath extends string,
    TQuery extends Record<string, any> = {},
    TBody = unknown,
    TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[] = [],
  >(
    path: TPath,
    middleware: TMiddlewares,
    handler: AugmentedRouteHandler<TPath, TQuery, TBody, TContext, TMiddlewares>
  ) => AugmentedRoute<TPath, TQuery, TBody, TContext, TMiddlewares>

  put: <
    TPath extends string,
    TQuery extends Record<string, any> = {},
    TBody = unknown,
    TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[] = [],
  >(
    path: TPath,
    middleware: TMiddlewares,
    handler: AugmentedRouteHandler<TPath, TQuery, TBody, TContext, TMiddlewares>
  ) => AugmentedRoute<TPath, TQuery, TBody, TContext, TMiddlewares>

  patch: <
    TPath extends string,
    TQuery extends Record<string, any> = {},
    TBody = unknown,
    TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[] = [],
  >(
    path: TPath,
    middleware: TMiddlewares,
    handler: AugmentedRouteHandler<TPath, TQuery, TBody, TContext, TMiddlewares>
  ) => AugmentedRoute<TPath, TQuery, TBody, TContext, TMiddlewares>

  delete: <
    TPath extends string,
    TQuery extends Record<string, any> = {},
    TMiddlewares extends readonly TypedMiddleware<any, any, any, any>[] = [],
  >(
    path: TPath,
    middleware: TMiddlewares,
    handler: AugmentedRouteHandler<TPath, TQuery, never, TContext, TMiddlewares>
  ) => AugmentedRoute<TPath, TQuery, never, TContext, TMiddlewares>
}

// Augmentation validation
export type ValidateAugmentation<
  TRequest,
  TExpectedAugmentation,
> = TRequest extends TExpectedAugmentation
  ? true
  : false

// Augmentation compatibility checking
export type AugmentationCompatible<
  TMiddleware1 extends TypedMiddleware<any, any, any, any>,
  TMiddleware2 extends TypedMiddleware<any, any, any, any>,
> = TMiddleware1 extends TypedMiddleware<any, infer Output1, any, any>
  ? TMiddleware2 extends TypedMiddleware<Output1, any, any, any>
    ? true
    : false
  : false

// Runtime augmentation helpers
export interface RuntimeAugmentation {
  augmentRequest: <T>(request: Request, augmentation: T) => Request & T
  extractAugmentation: <T>(request: Request & T) => T
  hasAugmentation: <T>(request: Request, key: keyof T) => boolean
  getAugmentation: <T, K extends keyof T>(request: Request & T, key: K) => T[K]
}

// Augmentation metadata
export interface AugmentationMetadata {
  name: string
  version?: string
  description?: string
  dependencies?: string[]
  provides: string[]
  requires?: string[]
}

// Augmentation registry
export interface AugmentationRegistry {
  register: (
    name: string,
    middleware: TypedMiddleware<any, any, any, any>,
    metadata: AugmentationMetadata
  ) => void

  get: (name: string) => {
    middleware: TypedMiddleware<any, any, any, any>
    metadata: AugmentationMetadata
  } | undefined

  resolve: (requirements: string[]) => TypedMiddleware<any, any, any, any>[]

  validate: (middlewares: TypedMiddleware<any, any, any, any>[]) => {
    valid: boolean
    errors: string[]
    warnings: string[]
  }
}

// Export all augmentation types
export type {
  AccumulateContext,
  ApplyMiddleware,
  ApplyMiddlewareSequence,
  AugmentationBuilder,
  AugmentationCompatible,
  AugmentationMetadata,
  AugmentationRegistry,
  AugmentedRoute,
  AugmentedRouteBuilder,
  AugmentedRouteHandler,
  AugmentRequestThroughChain,
  AuthAugmentation,
  AuthzAugmentation,
  CacheAugmentation,
  CombineAugmentations,
  ConditionalAugmentation,
  CORSAugmentation,
  EnhancedRequest,
  EnhancedResponse,
  ExtractMiddlewareAugmentation,
  FileUploadAugmentation,
  HasAuthMiddleware,
  HasRateLimitMiddleware,
  HasValidationMiddleware,
  LoggingAugmentation,
  RateLimitAugmentation,
  RequestAugmentation,
  ResponseAugmentation,
  RuntimeAugmentation,
  SessionAugmentation,
  ValidateAugmentation,
  ValidationAugmentation,
}
