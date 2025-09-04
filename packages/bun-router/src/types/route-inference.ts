/**
 * Route Parameter Type Inference
 *
 * Advanced TypeScript utilities for inferring route parameter types from URL patterns
 */

// Base types for route parameter extraction
export type ExtractRouteParams<T extends string> = T extends `${infer _Start}:${infer Param}/${infer Rest}`
  ? { [K in Param]: string } & ExtractRouteParams<`/${Rest}`>
  : T extends `${infer _Start}:${infer Param}?${infer Rest}`
    ? { [K in Param]?: string } & ExtractRouteParams<Rest>
    : T extends `${infer _Start}:${infer Param}`
      ? { [K in Param]: string }
      : T extends `${infer _Start}*${infer Rest}`
        ? { '*': string } & ExtractRouteParams<Rest>
        : {}

// Advanced parameter extraction with type constraints
export type ExtractTypedParams<T extends string> = T extends `${infer _Start}:${infer Param}<${infer Type}>${infer Rest}`
  ? { [K in Param]: ParseParamType<Type> } & ExtractTypedParams<Rest>
  : T extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? { [K in Param]: string } & ExtractTypedParams<`/${Rest}`>
    : T extends `${infer _Start}:${infer Param}?${infer Rest}`
      ? { [K in Param]?: string } & ExtractTypedParams<Rest>
      : T extends `${infer _Start}:${infer Param}`
        ? { [K in Param]: string }
        : {}

// Type parsing for parameter constraints
export type ParseParamType<T extends string> =
  T extends 'number' | 'int' | 'integer' ? number :
    T extends 'boolean' | 'bool' ? boolean :
      T extends 'date' ? Date :
        T extends 'uuid' ? string :
          T extends 'email' ? string :
            T extends 'url' ? string :
              T extends `enum(${infer Values})` ? ParseEnumValues<Values> :
                T extends `range(${infer Min},${infer Max})` ? number :
                  T extends `length(${infer MinMax})` ? string :
                    T extends `pattern(${infer _Pattern})` ? string :
                      string

// Enum value parsing
export type ParseEnumValues<T extends string> = T extends `${infer First}|${infer Rest}`
  ? First | ParseEnumValues<Rest>
  : T

// Query parameter extraction
export type ExtractQueryParams<T extends Record<string, any>> = {
  [K in keyof T]: T[K] extends 'string' ? string :
    T[K] extends 'number' ? number :
      T[K] extends 'boolean' ? boolean :
        T[K] extends 'string[]' ? string[] :
          T[K] extends 'number[]' ? number[] :
            T[K] extends { type: infer Type, required: true } ?
              Type extends 'string' ? string :
                Type extends 'number' ? number :
                  Type extends 'boolean' ? boolean : string :
              T[K] extends { type: infer Type, required: false } ?
                Type extends 'string' ? string | undefined :
                  Type extends 'number' ? number | undefined :
                    Type extends 'boolean' ? boolean | undefined : string | undefined :
                string
}

// Route pattern validation
export type ValidateRoutePattern<T extends string> =
  T extends `${infer _}:${infer Param}:${infer _}`
    ? `Invalid route pattern: consecutive parameters not allowed in "${T}"`
    : T extends `${infer _}::${infer _}`
      ? `Invalid route pattern: empty parameter name in "${T}"`
      : T extends `${infer _}:${infer Param}`
        ? Param extends `${infer Name}${infer Rest}`
          ? Name extends ''
            ? `Invalid route pattern: empty parameter name in "${T}"`
            : Rest extends `<${infer Type}>`
              ? ValidateParamType<Type> extends never
                ? `Invalid parameter type "${Type}" in route "${T}"`
                : T
              : T
          : T
        : T

// Parameter type validation
export type ValidateParamType<T extends string> =
  T extends 'string' | 'number' | 'int' | 'integer' | 'boolean' | 'bool' | 'date' | 'uuid' | 'email' | 'url'
    ? T
    : T extends `enum(${infer Values})`
      ? Values extends '' ? never : T
      : T extends `range(${infer Min},${infer Max})`
        ? Min extends `${number}`
          ? Max extends `${number}` ? T : never
          : never
        : T extends `length(${infer MinMax})`
          ? MinMax extends `${number}` | `${number},${number}` ? T : never
          : T extends `pattern(${infer Pattern})`
            ? Pattern extends '' ? never : T
            : never

// Route method types
export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

// Route handler type with inferred parameters
export type RouteHandler<
  TPath extends string,
  TQuery extends Record<string, any> = {},
  TBody = unknown,
  TContext = {},
> = (request: TypedRequest<TPath, TQuery, TBody, TContext>) => Promise<Response> | Response

// Typed request interface
export interface TypedRequest<
  TPath extends string = string,
  TQuery extends Record<string, any> = {},
  TBody = unknown,
  TContext = {},
> extends Request {
  params: ExtractTypedParams<TPath>
  query: ExtractQueryParams<TQuery>
  body: TBody
  context: TContext
}

// Route definition with type inference
export interface TypedRoute<
  TPath extends string,
  TQuery extends Record<string, any> = {},
  TBody = unknown,
  TContext = {},
> {
  method: RouteMethod
  path: ValidateRoutePattern<TPath>
  handler: RouteHandler<TPath, TQuery, TBody, TContext>
  middleware?: TypedMiddleware<any, any, any, TContext>[]
  schema?: {
    params?: RouteParamSchema<ExtractTypedParams<TPath>>
    query?: TQuery
    body?: BodySchema<TBody>
    response?: ResponseSchema
  }
}

// Parameter schema for validation
export type RouteParamSchema<T extends Record<string, any>> = {
  [K in keyof T]: {
    type: T[K] extends string ? 'string' :
      T[K] extends number ? 'number' :
        T[K] extends boolean ? 'boolean' :
          T[K] extends Date ? 'date' : 'string'
    required?: boolean
    pattern?: string
    min?: number
    max?: number
    enum?: T[K][]
    transform?: (value: string) => T[K]
    validate?: (value: T[K]) => boolean | string
  }
}

// Body schema types
export interface BodySchema<T = unknown> {
  type: 'json' | 'form' | 'text' | 'buffer' | 'stream'
  schema?: T extends object ? {
    [K in keyof T]: {
      type: T[K] extends string ? 'string' :
        T[K] extends number ? 'number' :
          T[K] extends boolean ? 'boolean' :
            T[K] extends Date ? 'date' :
              T[K] extends Array<infer U> ? 'array' : 'object'
      required?: boolean
      items?: T[K] extends Array<infer U> ? BodySchema<U> : never
      properties?: T[K] extends object ? BodySchema<T[K]> : never
    }
  } : never
  required?: (keyof T)[]
  additionalProperties?: boolean
}

// Response schema types
export interface ResponseSchema {
  [statusCode: number]: {
    description?: string
    headers?: Record<string, string>
    content?: {
      'application/json'?: any
      'text/plain'?: string
      'text/html'?: string
      'application/octet-stream'?: ArrayBuffer
    }
  }
}

// Utility types for route building
export type InferRouteParams<T> = T extends TypedRoute<infer Path, any, any, any>
  ? ExtractTypedParams<Path>
  : never

export type InferRouteQuery<T> = T extends TypedRoute<any, infer Query, any, any>
  ? ExtractQueryParams<Query>
  : never

export type InferRouteBody<T> = T extends TypedRoute<any, any, infer Body, any>
  ? Body
  : never

export type InferRouteContext<T> = T extends TypedRoute<any, any, any, infer Context>
  ? Context
  : never

// Route group types
export interface RouteGroup<TPrefix extends string = '', TContext = {}> {
  prefix: TPrefix
  middleware?: TypedMiddleware<any, any, any, TContext>[]
  routes: TypedRoute<any, any, any, TContext>[]
}

// Middleware type (forward declaration - will be defined in middleware types)
export interface TypedMiddleware<
  TRequest = any,
  TResponse = any,
  TNext = any,
  TContext = {},
> {
  (request: TRequest, next: TNext): Promise<TResponse> | TResponse
}

// Route builder helper types
export interface RouteBuilder<TContext = {}> {
  get: <TPath extends string, TQuery extends Record<string, any> = {}>(
    path: ValidateRoutePattern<TPath>,
    handler: RouteHandler<TPath, TQuery, never, TContext>
  ) => TypedRoute<TPath, TQuery, never, TContext>

  post: <TPath extends string, TQuery extends Record<string, any> = {}, TBody = unknown>(
    path: ValidateRoutePattern<TPath>,
    handler: RouteHandler<TPath, TQuery, TBody, TContext>
  ) => TypedRoute<TPath, TQuery, TBody, TContext>

  put: <TPath extends string, TQuery extends Record<string, any> = {}, TBody = unknown>(
    path: ValidateRoutePattern<TPath>,
    handler: RouteHandler<TPath, TQuery, TBody, TContext>
  ) => TypedRoute<TPath, TQuery, TBody, TContext>

  patch: <TPath extends string, TQuery extends Record<string, any> = {}, TBody = unknown>(
    path: ValidateRoutePattern<TPath>,
    handler: RouteHandler<TPath, TQuery, TBody, TContext>
  ) => TypedRoute<TPath, TQuery, TBody, TContext>

  delete: <TPath extends string, TQuery extends Record<string, any> = {}>(
    path: ValidateRoutePattern<TPath>,
    handler: RouteHandler<TPath, TQuery, never, TContext>
  ) => TypedRoute<TPath, TQuery, never, TContext>
}

// Advanced pattern matching types
export type MatchRoute<TPattern extends string, TPath extends string> =
  TPattern extends `${infer Start}:${infer Param}/${infer Rest}`
    ? TPath extends `${Start}${infer Value}/${infer PathRest}`
      ? Value extends ''
        ? false
        : MatchRoute<`/${Rest}`, `/${PathRest}`>
      : false
    : TPattern extends `${infer Start}:${infer Param}`
      ? TPath extends `${Start}${infer Value}`
        ? Value extends '' ? false : true
        : false
      : TPattern extends TPath
        ? true
        : false

// Route parameter extraction at runtime
export type ExtractParamsFromPath<TPattern extends string, TPath extends string> =
  TPattern extends `${infer Start}:${infer Param}/${infer Rest}`
    ? TPath extends `${Start}${infer Value}/${infer PathRest}`
      ? { [K in Param]: Value } & ExtractParamsFromPath<`/${Rest}`, `/${PathRest}`>
      : {}
    : TPattern extends `${infer Start}:${infer Param}`
      ? TPath extends `${Start}${infer Value}`
        ? { [K in Param]: Value }
        : {}
      : {}

// Type-safe route registration
export interface TypeSafeRouter<TContext = {}> {
  register: <TPath extends string, TQuery extends Record<string, any> = {}, TBody = unknown>(
    route: TypedRoute<TPath, TQuery, TBody, TContext>
  ) => void

  group: <TPrefix extends string>(
    prefix: TPrefix,
    configure: (builder: RouteBuilder<TContext>) => void
  ) => RouteGroup<TPrefix, TContext>

  use: <TNewContext>(
    middleware: TypedMiddleware<any, any, any, TNewContext>
  ) => TypeSafeRouter<TContext & TNewContext>
}

// Compile-time route validation
export type ValidateRoutes<T extends readonly TypedRoute<any, any, any, any>[]> = {
  [K in keyof T]: T[K] extends TypedRoute<infer Path, any, any, any>
    ? ValidateRoutePattern<Path> extends `Invalid ${string}`
      ? ValidateRoutePattern<Path>
      : T[K]
    : T[K]
}

// Route conflict detection
export type DetectRouteConflicts<T extends readonly TypedRoute<any, any, any, any>[]> = {
  [K in keyof T]: {
    [J in keyof T]: K extends J
      ? never
      : T[K] extends TypedRoute<infer Path1, any, any, any>
        ? T[J] extends TypedRoute<infer Path2, any, any, any>
          ? Path1 extends Path2
            ? `Route conflict: "${Path1}" is defined multiple times`
            : never
          : never
        : never
  }[keyof T]
}[keyof T]

// OpenAPI schema generation types
export interface GenerateOpenAPISchema<T extends TypedRoute<any, any, any, any>> {
  paths: {
    [K in T extends TypedRoute<infer Path, any, any, any> ? Path : never]: {
      [M in T extends TypedRoute<any, any, any, any> ? Lowercase<T['method']> : never]: {
        parameters?: Array<{
          name: string
          in: 'path' | 'query'
          required: boolean
          schema: { type: string, format?: string }
        }>
        requestBody?: {
          content: {
            'application/json': { schema: any }
          }
        }
        responses: {
          [status: number]: {
            description: string
            content?: {
              'application/json': { schema: any }
            }
          }
        }
      }
    }
  }
}

// Type utilities for testing
export type AssertEqual<T, U> = T extends U ? U extends T ? true : false : false
export type AssertExtends<T, U> = T extends U ? true : false
export type AssertNotEqual<T, U> = AssertEqual<T, U> extends true ? false : true

// Export all types for external use
export type {
  BodySchema,
  DetectRouteConflicts,
  ExtractParamsFromPath,
  ExtractQueryParams,
  ExtractRouteParams,
  ExtractTypedParams,
  GenerateOpenAPISchema,
  InferRouteBody,
  InferRouteContext,
  InferRouteParams,
  InferRouteQuery,
  MatchRoute,
  ParseEnumValues,
  ParseParamType,
  ResponseSchema,
  RouteBuilder,
  RouteGroup,
  RouteHandler,
  RouteMethod,
  RouteParamSchema,
  TypedRequest,
  TypedRoute,
  TypeSafeRouter,
  ValidateParamType,
  ValidateRoutePattern,
  ValidateRoutes,
}
