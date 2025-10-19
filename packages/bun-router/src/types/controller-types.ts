/**
 * Controller Method Type Checking at Compile Time
 *
 * Advanced TypeScript utilities for compile-time controller method validation
 */

import type { TypedMiddleware } from './middleware-types'
import type {
  ExtractQueryParams,
  ExtractTypedParams,
  RouteHandler,
  RouteMethod,
  TypedRequest,
} from './route-inference'

// Base controller interface
export interface BaseController {
  [key: string]: any
}

// Controller method metadata
export interface ControllerMethodMetadata {
  path: string
  method: RouteMethod
  middleware?: TypedMiddleware<any, any, any, any>[]
  description?: string
  tags?: string[]
  deprecated?: boolean
  operationId?: string
}

// Controller method decorator metadata
export interface MethodDecoratorMetadata extends ControllerMethodMetadata {
  parameterTypes?: any[]
  returnType?: any
  target: any
  propertyKey: string | symbol
}

// Extract controller method names
export type ControllerMethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never
}[keyof T]

// Extract controller methods
export type ControllerMethods<T> = Pick<T, ControllerMethodNames<T>>

// Controller method signature validation
export type ValidateControllerMethod<T> = T extends (
  request: infer TRequest,
  ...args: any[]
) => infer TReturn
  ? TRequest extends TypedRequest<any, any, any, any>
    ? TReturn extends Promise<Response> | Response
      ? T
      : `Invalid return type: Controller method must return Response or Promise<Response>`
    : `Invalid parameter type: First parameter must be TypedRequest`
  : `Invalid method signature: Controller method must be a function`

// Controller method type inference
export type InferControllerMethodType<T> = T extends (
  request: TypedRequest<infer TPath, infer TQuery, infer TBody, infer TContext>,
  ...args: any[]
) => Promise<Response> | Response
  ? {
      path: TPath
      query: TQuery
      body: TBody
      context: TContext
      params: ExtractTypedParams<TPath>
    }
  : never

// Controller route registration
export interface ControllerRoute<
  TPath extends string = string,
  TQuery extends Record<string, any> = object,
  TBody = unknown,
  TContext = object,
> {
  method: RouteMethod
  path: TPath
  handler: RouteHandler<TPath, TQuery, TBody, TContext>
  controllerMethod: string
  middleware?: TypedMiddleware<any, any, any, any>[]
  metadata?: ControllerMethodMetadata
}

// Controller class decorator
export interface ControllerDecorator<TPrefix extends string = ''> {
  prefix?: TPrefix
  middleware?: TypedMiddleware<any, any, any, any>[]
  tags?: string[]
  description?: string
}

// Route method decorators
export type RouteDecorator<
  TPath extends string,
  TQuery extends Record<string, any> = object,
  TBody = unknown,
> = <T extends BaseController>(
  target: T,
  propertyKey: keyof T,
  descriptor: TypedPropertyDescriptor<RouteHandler<TPath, TQuery, TBody, any>>
) => void

// HTTP method decorators
export type GetDecorator<TPath extends string, TQuery extends Record<string, any> = object> =
  RouteDecorator<TPath, TQuery, never>

export type PostDecorator<TPath extends string, TQuery extends Record<string, any> = object, TBody = unknown> =
  RouteDecorator<TPath, TQuery, TBody>

export type PutDecorator<TPath extends string, TQuery extends Record<string, any> = object, TBody = unknown> =
  RouteDecorator<TPath, TQuery, TBody>

export type PatchDecorator<TPath extends string, TQuery extends Record<string, any> = object, TBody = unknown> =
  RouteDecorator<TPath, TQuery, TBody>

export type DeleteDecorator<TPath extends string, TQuery extends Record<string, any> = object> =
  RouteDecorator<TPath, TQuery, never>

// Parameter decorators
export interface ParameterDecorator<_T = any> {
  <TController extends BaseController>(
    target: TController,
    propertyKey: keyof TController,
    parameterIndex: number
  ): void
}

// Parameter extraction types
export type ParamDecorator<_TName extends string> = ParameterDecorator<string>
export type QueryDecorator<_TName extends string> = ParameterDecorator<string>
export type BodyDecorator<T = any> = ParameterDecorator<T>
export type HeaderDecorator<_TName extends string> = ParameterDecorator<string>
export type CookieDecorator<_TName extends string> = ParameterDecorator<string>
export type RequestDecorator = ParameterDecorator<Request>
export type ResponseDecorator = ParameterDecorator<Response>

// Controller method parameter types
export type ControllerMethodParams<T> = T extends (
  ...args: infer TParams
) => any
  ? TParams
  : never

// Validate controller method parameters
export type ValidateControllerParams<T extends any[]> = {
  [K in keyof T]: T[K] extends TypedRequest<any, any, any, any>
    ? T[K]
    : T[K] extends string | number | boolean | object
      ? T[K]
      : `Invalid parameter type at index ${K}: ${T[K]}`
}

// Controller dependency injection
export interface ControllerDependency<T = any> {
  token: string | symbol | ((...args: any[]) => any)
  value?: T
  factory?: () => T
  singleton?: boolean
}

export interface DependencyContainer {
  register: <T>(dependency: ControllerDependency<T>) => void
  resolve: <T>(token: string | symbol | ((...args: any[]) => any)) => T
  has: (token: string | symbol | ((...args: any[]) => any)) => boolean
}

// Injectable decorator
export interface InjectableDecorator {
  <T extends new (...args: any[]) => any>(constructor: T): T
}

// Inject decorator
export interface InjectDecorator<T = any> {
  (token: string | symbol | ((...args: any[]) => any)): ParameterDecorator<T>
}

// Controller factory
export interface ControllerFactory<T extends BaseController> {
  create: (container?: DependencyContainer) => T
  getRoutes: () => ControllerRoute[]
  getMetadata: () => ControllerDecorator
}

// Controller registry
export interface ControllerRegistry {
  register: <T extends BaseController>(
    controller: new (...args: any[]) => T,
    metadata?: ControllerDecorator
  ) => void

  get: <T extends BaseController>(
    controller: new (...args: any[]) => T
  ) => ControllerFactory<T> | undefined

  getAll: () => Array<{
    controller: new (...args: any[]) => BaseController
    factory: ControllerFactory<BaseController>
  }>

  resolve: (container?: DependencyContainer) => ControllerRoute[]
}

// Controller method validation at compile time
export type ValidateController<T extends BaseController> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? ValidateControllerMethod<T[K]> extends string
      ? ValidateControllerMethod<T[K]>
      : T[K]
    : T[K]
}

// Controller route extraction
export type ExtractControllerRoutes<T extends BaseController> = {
  [K in keyof T]: T[K] extends RouteHandler<infer TPath, infer TQuery, infer TBody, infer TContext>
    ? ControllerRoute<TPath, TQuery, TBody, TContext>
    : never
}[keyof T]

// Controller method binding
export type BindControllerMethod<
  TController extends BaseController,
  TMethod extends keyof TController,
> = TController[TMethod] extends RouteHandler<infer TPath, infer TQuery, infer TBody, infer TContext>
  ? (this: TController, request: TypedRequest<TPath, TQuery, TBody, TContext>) => Promise<Response> | Response
  : never

// Controller instance type
export type ControllerInstance<T extends BaseController> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? BindControllerMethod<T, K>
    : T[K]
}

// Controller method metadata extraction
export type ExtractMethodMetadata<T extends BaseController> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? InferControllerMethodType<T[K]> extends never
      ? never
      : {
          method: K
          route: InferControllerMethodType<T[K]>
          metadata?: ControllerMethodMetadata
        }
    : never
}[keyof T]

// Controller validation errors
export type ControllerValidationError<T extends BaseController> = {
  [K in keyof T]: ValidateController<T>[K] extends string
    ? { method: K, error: ValidateController<T>[K] }
    : never
}[keyof T]

// Controller type guards
export type IsValidController<T> = T extends BaseController
  ? ControllerValidationError<T> extends never
    ? true
    : false
  : false

export type IsValidControllerMethod<T> = ValidateControllerMethod<T> extends string
  ? false
  : true

// Controller composition
export type ComposeControllers<T extends readonly BaseController[]> = T extends readonly [
  infer First,
  ...infer Rest,
]
  ? First extends BaseController
    ? Rest extends readonly BaseController[]
      ? First & ComposeControllers<Rest>
      : First
    : object
  : object

// Controller middleware application
export type ApplyControllerMiddleware<
  TController extends BaseController,
  TMiddleware extends TypedMiddleware<any, any, any, any>,
> = {
  [K in keyof TController]: TController[K] extends RouteHandler<infer TPath, infer TQuery, infer TBody, infer TContext>
    ? TMiddleware extends TypedMiddleware<any, any, infer TNewContext, any>
      ? RouteHandler<TPath, TQuery, TBody, TContext & TNewContext>
      : TController[K]
    : TController[K]
}

// Controller route conflict detection
export type DetectControllerConflicts<T extends BaseController> = {
  [K in keyof T]: {
    [J in keyof T]: K extends J
      ? never
      : T[K] extends RouteHandler<infer Path1, any, any, any>
        ? T[J] extends RouteHandler<infer Path2, any, any, any>
          ? Path1 extends Path2
            ? `Route conflict in controller: methods "${string & K}" and "${string & J}" both handle "${Path1}"`
            : never
          : never
        : never
  }[keyof T]
}[keyof T]

// Controller OpenAPI generation
export interface GenerateControllerOpenAPI<T extends BaseController> {
  paths: {
    [K in keyof T]: T[K] extends RouteHandler<infer TPath, infer TQuery, infer TBody, any>
      ? {
          [M in RouteMethod]: {
            operationId: string & K
            parameters: Array<{
              name: keyof ExtractTypedParams<TPath>
              in: 'path'
              required: true
              schema: { type: 'string' }
            }> | Array<{
              name: keyof ExtractQueryParams<TQuery>
              in: 'query'
              required: boolean
              schema: { type: 'string' }
            }>
            requestBody?: TBody extends never ? never : {
              content: {
                'application/json': { schema: any }
              }
            }
            responses: {
              200: {
                description: 'Success'
                content: {
                  'application/json': { schema: any }
                }
              }
            }
          }
        }
      : never
  }
}

// Controller testing utilities
export interface ControllerTestUtils<T extends BaseController> {
  createInstance: (overrides?: Partial<T>) => T
  mockMethod: <K extends keyof T>(method: K, implementation: T[K]) => void
  callMethod: <K extends keyof T>(
    method: K,
    ...args: T[K] extends (...args: infer TArgs) => any ? TArgs : never
  ) => T[K] extends (...args: any[]) => infer TReturn ? TReturn : never
  getRoutes: () => ControllerRoute[]
  validateRoutes: () => ControllerValidationError<T>[]
}

// Controller performance monitoring
export interface ControllerPerformanceMetrics {
  controllerName: string
  methodName: string
  executionTime: number
  memoryUsage: number
  callCount: number
  errorCount: number
  lastCalled: Date
}

export interface PerformanceTrackingController<T extends BaseController> extends T {
  getPerformanceMetrics: () => ControllerPerformanceMetrics[]
  resetMetrics: () => void
}

// Controller lifecycle hooks
export interface ControllerLifecycleHooks {
  onInit?: () => Promise<void> | void
  onDestroy?: () => Promise<void> | void
  beforeMethod?: (methodName: string, args: any[]) => Promise<void> | void
  afterMethod?: (methodName: string, result: any, args: any[]) => Promise<void> | void
  onError?: (error: Error, methodName: string, args: any[]) => Promise<void> | void
}

// Controller with lifecycle
export type LifecycleController<T extends BaseController> = T & ControllerLifecycleHooks
