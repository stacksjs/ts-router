import type { EnhancedRequest, MiddlewareHandler } from '../types'

/**
 * Test client configuration options
 */
export interface TestClientConfig {
  baseUrl?: string
  defaultHeaders?: Record<string, string>
  timeout?: number
  followRedirects?: boolean
  validateStatus?: (status: number) => boolean
}

/**
 * Test request options
 */
export interface TestRequestOptions {
  headers?: Record<string, string>
  query?: Record<string, string | string[]>
  body?: any
  files?: TestFile[]
  cookies?: Record<string, string>
  session?: any
  user?: any
  context?: Record<string, any>
  timeout?: number
  followRedirects?: boolean
}

/**
 * Test file for upload testing
 */
export interface TestFile {
  fieldName: string
  filename: string
  content: string | ArrayBuffer | Uint8Array
  mimetype?: string
}

/**
 * Test response interface
 */
export interface TestResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: any
  text: string
  json: any
  cookies: Record<string, string>
  redirected: boolean
  url: string
  ok: boolean
  type: string
}

/**
 * Middleware test context
 */
export interface MiddlewareTestContext {
  request: EnhancedRequest
  response?: Response
  next: ReturnType<typeof import('bun:test').mock<() => Promise<Response | null>>>
  error?: Error
}

/**
 * Authentication test user
 */
export interface TestUser {
  id: string | number
  email?: string
  username?: string
  roles?: string[]
  permissions?: string[]
  [key: string]: any
}

/**
 * JWT test options
 */
export interface JWTTestOptions {
  secret?: string
  expiresIn?: string
  algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256'
  payload?: Record<string, any>
  headers?: Record<string, any>
}

/**
 * Session test options
 */
export interface SessionTestOptions {
  sessionId?: string
  data?: Record<string, any>
  maxAge?: number
  secure?: boolean
  httpOnly?: boolean
}

/**
 * Model binding test options
 */
export interface ModelBindingTestOptions {
  modelClass?: any
  routeKey?: string
  constraints?: Record<string, any>
  customResolver?: (value: string) => Promise<any>
}

/**
 * Performance test metrics
 */
export interface PerformanceMetrics {
  responseTime: number
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }
  cpuUsage: {
    user: number
    system: number
  }
  requestsPerSecond?: number
  concurrentRequests?: number
}

/**
 * Load test configuration
 */
export interface LoadTestConfig {
  duration: number
  concurrency: number
  rampUp?: number
  rampDown?: number
  requestsPerSecond?: number
  maxRequests?: number
}

/**
 * WebSocket test message
 */
export interface WSTestMessage {
  type: 'text' | 'binary'
  data: string | ArrayBuffer | Uint8Array
  timestamp?: number
}

/**
 * WebSocket test client
 */
export interface WSTestClient {
  send: (message: string | ArrayBuffer | Uint8Array) => void
  close: (code?: number, reason?: string) => void
  ping: (data?: Uint8Array) => void
  pong: (data?: Uint8Array) => void
  messages: WSTestMessage[]
  isConnected: boolean
  readyState: number
}

/**
 * Test assertion helpers
 */
export interface TestAssertions {
  toHaveStatus: (status: number) => void
  toHaveHeader: (name: string, value?: string) => void
  toHaveBody: (body: any) => void
  toHaveJson: (json: any) => void
  toHaveCookie: (name: string, value?: string) => void
  toBeRedirected: (url?: string) => void
  toHaveValidationError: (field?: string, message?: string) => void
  toBeAuthenticated: (user?: any) => void
  toBeUnauthenticated: () => void
  toHaveMiddleware: (middleware: string | MiddlewareHandler) => void
  toHaveModel: (model: any) => void
  toHaveUploadedFile: (fieldName: string, filename?: string) => void
  toRespondWithin: (milliseconds: number) => void
}

/**
 * Mock factory options
 */
export interface MockFactoryOptions {
  count?: number
  overrides?: Record<string, any>
  relations?: Record<string, any>
}

/**
 * Database test helpers
 */
export interface DatabaseTestHelpers {
  seed: (data: any[]) => Promise<void>
  truncate: (tables?: string[]) => Promise<void>
  factory: <T>(model: string, options?: MockFactoryOptions) => T[]
  create: <T>(model: string, data?: Partial<T>) => Promise<T>
  transaction: <T>(callback: () => Promise<T>) => Promise<T>
}

/**
 * Test environment configuration
 */
export interface TestEnvironment {
  database?: DatabaseTestHelpers
  cache?: {
    clear: () => Promise<void>
    get: (key: string) => Promise<any>
    set: (key: string, value: any, ttl?: number) => Promise<void>
  }
  storage?: {
    clear: () => Promise<void>
    put: (path: string, content: string | ArrayBuffer) => Promise<void>
    get: (path: string) => Promise<string | ArrayBuffer | null>
    delete: (path: string) => Promise<void>
  }
  queue?: {
    clear: () => Promise<void>
    push: (job: any) => Promise<void>
    process: () => Promise<void>
  }
}
