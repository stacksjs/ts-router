/**
 * Core Type Definitions
 *
 * Narrowly typed interfaces to replace all `any` types throughout the codebase.
 * These types provide strict type safety while maintaining flexibility.
 */

import type { ServerWebSocket } from 'bun'

// ============================================================================
// OAuth2 Types
// ============================================================================

/**
 * OAuth2 Authorization Code Flow configuration
 */
export interface OAuth2AuthorizationCodeFlow {
  authorizationUrl: string
  tokenUrl: string
  refreshUrl?: string
  scopes: Record<string, string>
}

/**
 * OAuth2 Implicit Flow configuration
 */
export interface OAuth2ImplicitFlow {
  authorizationUrl: string
  refreshUrl?: string
  scopes: Record<string, string>
}

/**
 * OAuth2 Client Credentials Flow configuration
 */
export interface OAuth2ClientCredentialsFlow {
  tokenUrl: string
  refreshUrl?: string
  scopes: Record<string, string>
}

/**
 * OAuth2 Password Flow configuration
 */
export interface OAuth2PasswordFlow {
  tokenUrl: string
  refreshUrl?: string
  scopes: Record<string, string>
}

/**
 * OAuth2 Flows configuration - replaces `flows?: any`
 */
export interface OAuth2Flows {
  implicit?: OAuth2ImplicitFlow
  password?: OAuth2PasswordFlow
  clientCredentials?: OAuth2ClientCredentialsFlow
  authorizationCode?: OAuth2AuthorizationCodeFlow
}

/**
 * OAuth2 Profile from provider - replaces `profile: any`
 */
export interface OAuth2Profile {
  id: string
  provider: string
  email?: string
  emailVerified?: boolean
  name?: string
  firstName?: string
  lastName?: string
  displayName?: string
  username?: string
  avatar?: string
  profileUrl?: string
  locale?: string
  timezone?: string
  raw?: Record<string, unknown>
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session data interface - replaces `session?: any`
 */
export interface SessionData {
  id?: string
  userId?: string
  createdAt?: number
  expiresAt?: number
  data?: Record<string, unknown>
  flash?: Record<string, unknown>
  csrfToken?: string
  regenerate?: () => Promise<void>
  destroy?: () => Promise<void>
  save?: () => Promise<void>
  touch?: () => Promise<void>
  [key: string]: unknown
}

/**
 * Session serializer interface - replaces serializer with `any`
 */
export interface SessionSerializer<T = SessionData> {
  stringify: (data: T) => string
  parse: (data: string) => T
}

/**
 * Session store interface - replaces custom store with `any`
 */
export interface SessionStore<T = SessionData> {
  get: (sid: string) => Promise<T | null>
  set: (sid: string, session: T, ttl?: number) => Promise<void>
  destroy: (sid: string) => Promise<void>
  touch?: (sid: string, session: T, ttl?: number) => Promise<void>
  all?: () => Promise<Record<string, T>>
  length?: () => Promise<number>
  clear?: () => Promise<void>
}

// ============================================================================
// User & Authentication Types
// ============================================================================

/**
 * Base user interface - replaces `user?: any`
 */
export interface User {
  id: string | number
  email?: string
  name?: string
  username?: string
  roles?: string[]
  permissions?: string[]
  emailVerifiedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
  metadata?: Record<string, unknown>
  plan?: string
  [key: string]: unknown
}

/**
 * Authenticated user with additional auth context
 */
export interface AuthenticatedUser extends User {
  tokenType?: 'jwt' | 'session' | 'apikey' | 'bearer'
  tokenExpiry?: number
  scopes?: string[]
  isAdmin?: boolean
  isSuperAdmin?: boolean
}

/**
 * Auth context - replaces `auth?: any`
 */
export interface AuthContext<TUser extends User = User> {
  user: TUser | null
  isAuthenticated: boolean
  check: () => boolean
  guest: () => boolean
  id: () => string | number | null
  validate: (credentials: { email: string, password: string }) => Promise<TUser | null>
  attempt: (credentials: { email: string, password: string }, remember?: boolean) => Promise<boolean>
  login: (user: TUser, remember?: boolean) => Promise<void>
  logout: () => Promise<void>
  hasRole: (role: string | string[]) => boolean
  hasPermission: (permission: string | string[]) => boolean
  can: (ability: string, resource?: unknown) => boolean
}

// ============================================================================
// Metrics & Monitoring Types
// ============================================================================

/**
 * Metric entry interface - replaces `metrics: any[]`
 */
export interface MetricEntry {
  name: string
  value: number
  timestamp: number
  type: 'counter' | 'gauge' | 'histogram' | 'summary'
  tags?: Record<string, string>
  unit?: string
  description?: string
}

/**
 * Performance metric
 */
export interface PerformanceMetric extends MetricEntry {
  type: 'histogram'
  percentiles?: {
    p50: number
    p75: number
    p90: number
    p95: number
    p99: number
  }
  min?: number
  max?: number
  avg?: number
  count?: number
}

/**
 * Trace span attributes - replaces `attributes: Record<string, any>`
 */
export interface TraceAttributes {
  'http.method'?: string
  'http.url'?: string
  'http.status_code'?: number
  'http.route'?: string
  'http.user_agent'?: string
  'http.request_content_length'?: number
  'http.response_content_length'?: number
  'net.peer.ip'?: string
  'net.peer.port'?: number
  'db.system'?: string
  'db.statement'?: string
  'db.operation'?: string
  'error'?: boolean
  'error.message'?: string
  'error.stack'?: string
  [key: string]: string | number | boolean | undefined
}

/**
 * Trace span interface
 */
export interface TraceSpan {
  name: string
  traceId: string
  spanId: string
  parentSpanId?: string
  startTime: number
  endTime?: number
  duration?: number
  status: 'OK' | 'ERROR' | 'UNSET'
  attributes: TraceAttributes
  events?: TraceEvent[]
}

/**
 * Trace event
 */
export interface TraceEvent {
  name: string
  timestamp: number
  attributes?: TraceAttributes
}

// ============================================================================
// WebSocket Types
// ============================================================================

/**
 * WebSocket data interface - replaces `ServerWebSocket<any>`
 */
export interface WebSocketData {
  id: string
  userId?: string | number
  channels?: Set<string>
  metadata?: Record<string, unknown>
  connectedAt: number
  lastPingAt?: number
  ip?: string
  userAgent?: string
}

/**
 * Typed ServerWebSocket
 */
export type TypedServerWebSocket<T extends WebSocketData = WebSocketData> = ServerWebSocket<T>

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation schema - replaces `schemas?: Record<string, any>`
 */
export interface ValidationSchema {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'email' | 'url' | 'uuid'
  required?: boolean
  nullable?: boolean
  default?: unknown
  rules?: ValidationRule[]
  message?: string
  transform?: (value: unknown) => unknown
  [key: string]: ValidationRule | ValidationSchema | unknown
}

/**
 * Validation rule
 */
export interface ValidationRule {
  name: string
  params?: unknown[]
  message?: string
}

/**
 * Input validation schemas
 */
export interface InputValidationSchemas {
  query?: ValidationSchema
  body?: ValidationSchema
  headers?: ValidationSchema
  params?: ValidationSchema
}

// ============================================================================
// Sanitization Types
// ============================================================================

/**
 * Sanitization options - replaces `options?: any`
 */
export interface SanitizationOptions {
  trim?: boolean
  lowercase?: boolean
  uppercase?: boolean
  escape?: boolean
  stripTags?: boolean
  normalizeEmail?: boolean
  toInt?: boolean
  toFloat?: boolean
  toBoolean?: boolean
  toDate?: boolean
  customSanitizer?: (value: unknown) => unknown
}

/**
 * Sanitization rule configuration
 */
export interface SanitizationRule {
  type: 'escape' | 'strip' | 'validate' | 'transform'
  options: SanitizationOptions
}

// ============================================================================
// Template & View Types
// ============================================================================

/**
 * Template helper function signature - replaces `(...args: any[]) => any`
 */
export type TemplateHelper = (...args: unknown[]) => string | number | boolean | null | undefined

/**
 * Template helpers map
 */
export type TemplateHelpers = Record<string, TemplateHelper>

// ============================================================================
// Cookie Types
// ============================================================================

/**
 * Cookie options interface
 */
export interface CookieOptions {
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  path?: string
  domain?: string
  sameSite?: 'strict' | 'lax' | 'none'
  priority?: 'low' | 'medium' | 'high'
  partitioned?: boolean
}

/**
 * Cookie to set - replaces `{ name: string, value: string, options: any }`
 */
export interface CookieToSet {
  name: string
  value: string
  options: CookieOptions
}

/**
 * Cookie to delete - replaces `{ name: string, options: any }`
 */
export interface CookieToDelete {
  name: string
  options: Pick<CookieOptions, 'path' | 'domain'>
}

// ============================================================================
// SSE Types
// ============================================================================

/**
 * SSE connection info - replaces `sse?: { id: string, eventSource?: any }`
 */
export interface SSEConnection {
  id: string
  controller?: ReadableStreamDefaultController<Uint8Array>
  eventSource?: unknown
  lastEventId?: string
  retryInterval?: number
  connectedAt?: number
}

// ============================================================================
// Request Context Types
// ============================================================================

/**
 * Logger interface for middleware
 */
export interface Logger {
  log: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  debug: (message: string, ...args: unknown[]) => void
}

/**
 * Simple cache interface for middleware
 */
export interface SimpleCache {
  get: <T = unknown>(key: string) => T | undefined
  set: <T = unknown>(key: string, value: T, ttl?: number) => void
  delete: (key: string) => boolean
  has: (key: string) => boolean
  clear: () => void
}

/**
 * Request context - replaces `context?: Record<string, any>`
 */
export interface RequestContext {
  startTime?: number
  requestId?: string
  traceId?: string
  spanId?: string
  route?: string
  routeName?: string
  locale?: string
  timezone?: string
  logger?: Logger
  cache?: SimpleCache
  [key: string]: unknown
}

/**
 * Validated data - replaces `validated?: Record<string, any>`
 */
export type ValidatedData<T = Record<string, unknown>> = T

/**
 * Flash messages - replaces `flash?: Record<string, any>`
 */
export interface FlashMessages {
  success?: string | string[]
  error?: string | string[]
  warning?: string | string[]
  info?: string | string[]
  [key: string]: string | string[] | undefined
}

// ============================================================================
// Model Binding Types
// ============================================================================

/**
 * Bound models - replaces `models?: Record<string, any>`
 */
export type BoundModels<T extends Record<string, unknown> = Record<string, unknown>> = T

// ============================================================================
// Form & Body Types
// ============================================================================

/**
 * JSON body data type - replaces `jsonBody?: any`
 */
export type JsonBodyData<T = unknown> = T

/**
 * Form body - replaces `formBody?: Record<string, any>`
 */
export interface FormBody {
  [key: string]: string | string[] | File | File[] | undefined
}

/**
 * Validated body - replaces `validatedBody?: any`
 */
export type ValidatedBody<T = unknown> = T

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache adapter interface - replaces custom adapter with `any`
 */
export interface CacheAdapter<T = unknown> {
  get: (key: string) => Promise<T | null>
  set: (key: string, value: T, ttl?: number) => Promise<void>
  del: (key: string) => Promise<void>
  clear?: () => Promise<void>
  has?: (key: string) => Promise<boolean>
  stats?: () => Promise<CacheStats>
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number
  misses: number
  keys: number
  size?: number
  hitRate?: number
}

// ============================================================================
// JWT Types
// ============================================================================

/**
 * JWT Header - replaces `header?: Record<string, any>`
 */
export interface JwtHeader {
  alg: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512' | 'PS256' | 'PS384' | 'PS512' | 'none'
  typ: 'JWT'
  kid?: string
  x5u?: string
  x5c?: string[]
  x5t?: string
  cty?: string
  crit?: string[]
  [key: string]: string | string[] | undefined
}

/**
 * JWT Payload - replaces index signature with `any`
 */
export interface JwtPayload {
  iss?: string
  sub?: string
  aud?: string | string[]
  exp?: number
  nbf?: number
  iat?: number
  jti?: string
  [key: string]: string | number | boolean | string[] | undefined
}

// ============================================================================
// Route Metadata Types
// ============================================================================

/**
 * Route metadata - replaces `meta?: Record<string, any>`
 */
export interface RouteMetadata {
  description?: string
  summary?: string
  tags?: string[]
  deprecated?: boolean
  version?: string
  permissions?: string[]
  roles?: string[]
  rateLimit?: string
  cache?: {
    enabled: boolean
    ttl: number
    tags?: string[]
  }
  openapi?: {
    operationId?: string
    requestBody?: unknown
    responses?: Record<string, unknown>
    parameters?: unknown[]
    security?: unknown[]
  }
  [key: string]: unknown
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error metadata - replaces `metadata?: Record<string, any>`
 */
export interface ErrorMetadata {
  code?: string
  field?: string
  value?: unknown
  constraint?: string
  expected?: unknown
  received?: unknown
  path?: string[]
  [key: string]: unknown
}

// ============================================================================
// Middleware Types
// ============================================================================

/**
 * Middleware params - replaces `params?: Record<string, any>`
 */
export interface MiddlewareParams {
  [key: string]: string | number | boolean | string[] | undefined
}

// ============================================================================
// Degradation Types
// ============================================================================

/**
 * Static response body - replaces `body: any`
 */
export type StaticResponseBody = string | Record<string, unknown> | unknown[]

/**
 * Fallback handler error - replaces `error: any`
 */
export type FallbackError = Error | { message: string, code?: string, status?: number }

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input value - replaces various `any` in input handling
 */
export type InputValue = string | number | boolean | null | undefined | InputValue[] | { [key: string]: InputValue }

/**
 * Request input - replaces `all(): Record<string, any>`
 */
export type RequestInput = Record<string, InputValue>

// ============================================================================
// File Types
// ============================================================================

/**
 * File info - replaces `file: (name: string) => any`
 */
export interface FileInfo {
  fieldName: string
  originalName: string
  filename: string
  path: string
  size: number
  mimetype: string
  buffer: ArrayBuffer
  encoding?: string
  hash?: string
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  AuthContext as AuthContextType,
  CookieOptions as CookieOptionsType,
  MetricEntry as MetricEntryType,
  OAuth2Flows as OAuth2FlowsType,
  OAuth2Profile as OAuth2ProfileType,
  SessionData as SessionDataType,
  TraceAttributes as TraceAttributesType,
  User as UserType,
  ValidationSchema as ValidationSchemaType,
  WebSocketData as WebSocketDataType,
}
