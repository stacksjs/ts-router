import type { Server, ServerWebSocket } from 'bun'

export interface Contact {
  name?: string
  email?: string
  url?: string
}

export interface SecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect'
  scheme?: string
  bearerFormat?: string
  name?: string
  in?: 'header' | 'query' | 'cookie'
  flows?: any // OAuth2 flows configuration
}

export interface DocsConfig {
  output: string
  groupBy: 'path' | 'method' | 'tag'
  includeExamples: boolean
  title: string
  description: string
  version: string
  baseUrl: string
  contact?: Contact
  security?: Record<string, SecurityScheme>
}

export interface CorsConfig {
  enabled?: boolean
  origin?: string | string[]
  methods?: string[]
  allowedHeaders?: string[]
  exposedHeaders?: string[]
  credentials?: boolean
  maxAge?: number
  preflightContinue?: boolean
  optionsSuccessStatus?: number
  privateNetworkAccess?: boolean
}

export interface RateLimitConfig {
  enabled?: boolean
  max?: number
  timeWindow?: number
  message?: string
  draftMode?: boolean
  advanced?: {
    tokensPerInterval?: number
    interval?: number
    burst?: number
    skipFailedRequests?: boolean
    keyGenerator?: (req: Request) => string
    algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket'
  }
  stores?: {
    type: 'memory' | 'redis'
    redis?: {
      url: string
      prefix?: string
    }
  }
}

export interface CompressionConfig {
  enabled: boolean
  level: number
  threshold: number
}

export interface StaticConfig {
  enabled: boolean
  dir: string
  maxAge: number
}

export interface CacheConfig {
  enabled: boolean
  type: 'memory' | 'redis' | 'custom'
  ttl: number
  max?: number
  redis?: {
    url: string
    prefix: string
    maxRetries: number
    connectTimeout: number
    cluster?: {
      nodes: string[]
      options?: {
        scaleReads: 'master' | 'slave' | 'all'
        maxRedirections: number
      }
    }
  }
  customAdapter?: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any, ttl?: number) => Promise<void>
    del: (key: string) => Promise<void>
    clear?: () => Promise<void>
    stats?: () => Promise<{ hits: number, misses: number, keys: number }>
  }
  routeCache?: {
    enabled: boolean
    ttl: number
    methods: string[]
    excludePaths: string[]
    varyByHeaders: string[]
    varyByQuery: string[]
    maxSize?: number
    purgeConditions?: {
      maxAge: number
      maxItems: number
      lowMemory: boolean
    }
  }
  strategies?: {
    [key: string]: {
      type: 'stale-while-revalidate' | 'cache-first' | 'network-first'
      ttl: number
      staleWhileRevalidateTtl?: number
    }
  }
}

export interface PerformanceConfig {
  cache: CacheConfig
  prefetch: {
    enabled: boolean
    paths: string[]
    maxConcurrent: number
    preloadPatterns?: string[]
    warmupStrategy?: 'gradual' | 'aggressive'
    prefetchHeaders?: Record<string, string>
  }
  optimization: {
    minify: boolean
    compress: boolean
    treeshake: boolean
    lazyLoad: boolean
    chunkSize: number
    imageOptimization?: {
      enabled: boolean
      quality: number
      formats: ('webp' | 'avif' | 'jpeg' | 'png')[]
      maxWidth: number
      responsive: boolean
    }
    fontOptimization?: {
      enabled: boolean
      inlineSize: number
      preload: boolean
      formats: ('woff2' | 'woff')[]
    }
    cssOptimization?: {
      minify: boolean
      purge: boolean
      splitChunks: boolean
      criticalPath: boolean
    }
  }
  monitoring?: {
    enabled?: boolean
    sampleRate?: number
    storage?: {
      type?: 'memory' | 'file' | 'custom'
      maxEntries?: number
      filePath?: string
      customHandler?: (metrics: any[]) => Promise<void>
    }
    alerting?: {
      enabled?: boolean
      thresholds?: {
        responseTime?: number
        errorRate?: number
        memoryUsage?: number
      }
      webhookUrl?: string
      slackWebhook?: string
      emailConfig?: {
        smtp?: {
          host?: string
          port?: number
          secure?: boolean
          auth?: {
            user?: string
            pass?: string
          }
        }
        to?: string[]
        from?: string
        cache: boolean
        queue: boolean
      }
    }
    profiling?: {
      enabled: boolean
      sampleRate: number
      includeHeapSnapshot: boolean
      gcStats: boolean
    }
    logging: {
      level: 'debug' | 'info' | 'warn' | 'error'
      format: 'json' | 'pretty'
      destination: 'console' | 'file'
      rotation?: {
        size: string
        interval: string
        maxFiles: number
      }
    }
  }
}

export interface LoadBalancerConfig {
  enabled: boolean
  strategy: 'round-robin' | 'least-connections' | 'ip-hash' | 'weighted-round-robin' | 'fastest-response'
  healthCheck: {
    enabled: boolean
    interval: number
    timeout: number
    unhealthyThreshold: number
    healthyThreshold: number
    path: string
    expectedStatus?: number
    expectedBody?: string
    headers?: Record<string, string>
  }
  sticky: {
    enabled: boolean
    cookieName: string
    ttl: number
    secret?: string
    path?: string
    domain?: string
  }
  retries: {
    attempts: number
    timeout: number
    codes: number[]
    backoff?: {
      type: 'fixed' | 'exponential' | 'fibonacci'
      initialDelay: number
      maxDelay: number
      factor: number
    }
  }
  nodes?: {
    [key: string]: {
      url: string
      weight?: number
      backup?: boolean
      maxFails?: number
      failTimeout?: number
    }
  }
}

export interface SecurityConfig {
  schemes: Record<string, SecurityScheme>
  rateLimit: RateLimitConfig & {
    advanced?: {
      tokensPerInterval: number
      interval: number
      burst?: number
      skipFailedRequests?: boolean
      keyGenerator?: (req: Request) => string
    }
    stores?: {
      type: 'memory' | 'redis'
      redis?: {
        url: string
        prefix: string
      }
    }
  }
  cors: CorsConfig & {
    preflightContinue?: boolean
    optionsSuccessStatus?: number
    privateNetworkAccess?: boolean
    exposedHeaders?: string[]
  }
  csrf: {
    enabled: boolean
    secret: string
    cookie: {
      name: string
      options: {
        httpOnly: boolean
        secure: boolean
        sameSite: 'strict' | 'lax' | 'none'
      }
    }
    ignoreMethods?: string[]
    ignorePaths?: string[]
    tokenLength?: number
  }
  helmet: {
    enabled: boolean
    contentSecurityPolicy: boolean | {
      directives: Record<string, string[]>
      reportOnly?: boolean
      reportUri?: string
      upgradeInsecureRequests?: boolean
      blockAllMixedContent?: boolean
    }
    crossOriginEmbedderPolicy?: boolean | {
      policy?: 'require-corp' | 'credentialless'
    }
    crossOriginOpenerPolicy?: boolean | {
      policy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none'
    }
    crossOriginResourcePolicy?: boolean | {
      policy?: 'same-site' | 'same-origin' | 'cross-origin'
    }
    dnsPrefetchControl?: boolean | {
      allow?: boolean
    }
    xssFilter: boolean | {
      setOnOldIE?: boolean
    }
    noSniff: boolean
    frameOptions: 'DENY' | 'SAMEORIGIN'
    hidePoweredBy: boolean
    hsts?: {
      maxAge: number
      includeSubDomains: boolean
      preload: boolean
    }
    referrerPolicy?: string | {
      policy?: string | string[]
    }
    expectCt?: {
      enforce: boolean
      maxAge: number
      reportUri?: string
    }
    ieNoOpen?: boolean
    originAgentCluster?: boolean
    permittedCrossDomainPolicies?: boolean | {
      permittedPolicies?: 'none' | 'master-only' | 'by-content-type' | 'all'
    }
  }
  ddos?: {
    enabled?: boolean
    maxRequestsPerSecond?: number
    maxRequestsPerMinute?: number
    maxRequestsPerHour?: number
    burstLimit?: number
    windowSize?: number
    blockDuration?: number
    whitelistedIPs?: string[]
    blacklistedIPs?: string[]
    trustProxy?: boolean
    skipSuccessfulRequests?: boolean
    skipFailedRequests?: boolean
    keyGenerator?: (req: any) => string
    store?: 'memory' | 'redis'
    redis?: {
      url: string
      prefix?: string
    }
  }
  inputValidation?: {
    enabled?: boolean
    sanitizeByDefault?: boolean
    strictMode?: boolean
    allowUnknownFields?: boolean
    maxDepth?: number
    schemas?: {
      query?: Record<string, any>
      body?: Record<string, any>
      headers?: Record<string, any>
      params?: Record<string, any>
    }
  }
  attackPrevention?: {
    enabled?: boolean
    sqlInjection?: boolean
    xss?: boolean
    pathTraversal?: boolean
    commandInjection?: boolean
    ldapInjection?: boolean
    xxe?: boolean
    customPatterns?: Array<{
      name: string
      pattern: RegExp
      action: 'block' | 'log' | 'sanitize'
    }>
  }
  requestFiltering?: {
    enabled?: boolean
    blockSuspiciousPatterns?: boolean
    maxRequestsPerMinute?: number
    blockUserAgents?: string[]
    allowedMethods?: string[]
    requireUserAgent?: boolean
    maxBodySize?: number
    maxUrlLength?: number
    maxHeaderSize?: number
    allowedContentTypes?: string[]
  }
  ipFiltering?: {
    enabled?: boolean
    whitelist?: string[]
    blacklist?: string[]
    blockPrivateIPs?: boolean
    blockCloudProviders?: boolean
    geoBlocking?: {
      enabled?: boolean
      allowedCountries?: string[]
      blockedCountries?: string[]
    }
  }
  responseSecurity?: {
    enabled?: boolean
    removeServerHeaders?: boolean
    addSecurityHeaders?: boolean
    sanitizeErrors?: boolean
    preventInfoDisclosure?: boolean
  }
  auth: {
    jwt: {
      secret: string
      expiresIn: string
      algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256'
      issuer?: string
      audience?: string
      refreshToken?: {
        enabled: boolean
        expiresIn: string
        renewBeforeExpiry?: number
      }
      rotation?: {
        enabled: boolean
        interval: number
        maxAge: number
      }
    }
    session: {
      enabled: boolean
      secret: string
      name: string
      resave: boolean
      rolling: boolean
      saveUninitialized: boolean
      cookie: {
        maxAge: number
        secure: boolean
        httpOnly: boolean
        sameSite: 'strict' | 'lax' | 'none'
        domain?: string
        path?: string
      }
      store?: {
        type: 'memory' | 'redis' | 'custom'
        redis?: {
          url: string
          prefix: string
          ttl?: number
          scanCount?: number
          serializer?: {
            stringify: (data: any) => string
            parse: (data: string) => any
          }
        }
        custom?: {
          get: (sid: string) => Promise<any>
          set: (sid: string, session: any, ttl?: number) => Promise<void>
          destroy: (sid: string) => Promise<void>
          touch?: (sid: string, session: any, ttl?: number) => Promise<void>
          all?: () => Promise<{ [sid: string]: any }>
          length?: () => Promise<number>
          clear?: () => Promise<void>
        }
      }
    }
    oauth2?: {
      enabled: boolean
      providers: {
        [key: string]: {
          clientId: string
          clientSecret: string
          callbackURL: string
          scope: string[]
          authorizationURL?: string
          tokenURL?: string
          profileURL?: string
          validateProfile?: (profile: any) => Promise<boolean>
        }
      }
    }
  }
  encryption?: {
    enabled: boolean
    algorithm: string
    key: string
    iv?: string
    encoding: 'hex' | 'base64'
  }
  sanitization?: {
    enabled: boolean
    rules: {
      [key: string]: {
        type: 'escape' | 'strip' | 'validate'
        options?: any
      }
    }
  }
}

export interface ServerConfig {
  port: number
  hostname: string
  development: boolean
  cors: CorsConfig
  rateLimit: RateLimitConfig
  compression: CompressionConfig
  static: StaticConfig
  performance: PerformanceConfig
  loadBalancer?: LoadBalancerConfig
  security: SecurityConfig
  cluster: {
    enabled: boolean
    workers: number | 'auto'
    sticky: boolean
    strategy?: 'rr' | 'lc'
    maxMemory?: number
    restartOnMemory?: boolean
    ipcTimeout?: number
  }
  gracefulShutdown: {
    enabled: boolean
    timeout: number
    signals: string[]
    forceTimeout: number
    preShutdown?: () => Promise<void>
    drain?: {
      enabled: boolean
      timeout: number
      waitForStreams: boolean
    }
  }
  middleware: {
    errorHandler?: (error: Error, req: Request) => Promise<Response>
    notFound?: (req: Request) => Promise<Response>
    timeout?: number
    order?: string[]
    global?: MiddlewareHandler[]
  }
  hooks: {
    onStart?: () => Promise<void>
    onStop?: () => Promise<void>
    onRequest?: (req: Request) => Promise<Request | Response>
    onResponse?: (res: Response) => Promise<Response>
    onError?: (error: Error) => Promise<void>
    onMetric?: (metric: { name: string, value: number, tags?: Record<string, string> }) => Promise<void>
    onTrace?: (span: { name: string, duration: number, attributes: Record<string, any> }) => Promise<void>
  }
  experimental?: {
    http3: boolean
    webTransport: boolean
    earlyHints: boolean
    webSocket: {
      enabled: boolean
      compression?: boolean
      maxPayload?: number
    }
  }
}

export interface ViewEngineConfig {
  /**
   * The path to view files
   */
  viewsPath: string
  /**
   * File extensions to look for when resolving views
   */
  extensions: string[]
  /**
   * Default layout to use for views
   */
  defaultLayout?: string
  /**
   * Whether to cache compiled templates
   */
  cache: boolean
  /**
   * Template engine to use
   */
  engine: 'auto' | 'stx' | 'html' | 'custom'
  /**
   * Custom render function for template processing
   */
  customRenderer?: (template: string, data: Record<string, any>, options: ViewRenderOptions) => Promise<string>
  /**
   * HTML minification options
   */
  minify?: {
    enabled: boolean
    options?: {
      removeComments?: boolean
      collapseWhitespace?: boolean
      conservativeCollapse?: boolean
      minifyJS?: boolean
      minifyCSS?: boolean
    }
  }
  /**
   * Template helpers
   */
  helpers?: Record<string, (...args: any[]) => any>
}

export interface ViewRenderOptions {
  layout?: string
  partials?: Record<string, string>
  components?: Record<string, string>
  helpers?: Record<string, (...args: any[]) => any>
  sections?: Record<string, string>
}

export interface RouterConfig {
  verbose: boolean
  routesPath?: string
  apiRoutesPath?: string
  webRoutesPath?: string
  apiPrefix?: string
  webPrefix?: string
  defaultMiddleware?: {
    api?: (string | MiddlewareHandler)[]
    web?: (string | MiddlewareHandler)[]
  }
  /**
   * View engine configuration
   */
  views?: ViewEngineConfig
  docs?: DocsConfig
  server?: ServerConfig
}

export type RouterOptions = Partial<RouterConfig>

export interface RouteParams {
  [key: string]: string
}

/**
 * Cookie map interface for working with cookies
 */
export interface CookieMap {
  get: (name: string) => string | undefined
  set: (name: string, value: string, options?: CookieOptions) => void
  delete: (name: string, options?: Pick<CookieOptions, 'path' | 'domain'>) => void
  getAll: () => Record<string, string>
}

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
}

export interface EnhancedRequest extends Request {
  /**
   * Route parameters extracted from the URL
   */
  params: Record<string, string>
  /**
   * Query parameters from the URL
   */
  query: Record<string, string | string[]>
  /**
   * Parsed JSON body (if Content-Type is application/json)
   */
  jsonBody?: any
  /**
   * Form body data (if Content-Type is multipart/form-data or application/x-www-form-urlencoded)
   */
  formBody?: Record<string, any>
  /**
   * Uploaded files (if Content-Type is multipart/form-data)
   */
  files?: UploadedFile[]
  /**
   * Session data (if session middleware is used)
   */
  session?: any
  /**
   * User data (if authentication middleware is used)
   */
  user?: any
  /**
   * Additional context data that can be set by middleware
   */
  context?: Record<string, any>
  /**
   * Request ID for tracing
   */
  requestId?: string
  /**
   * IP address of the client
   */
  ip?: string
  /**
   * User agent string
   */
  userAgent?: string
  /**
   * Cookies parsed from the request
   */
  cookies?: Record<string, string>
  /**
   * Flash messages (temporary messages for the next request)
   */
  flash?: Record<string, any>
  /**
   * CSRF token
   */
  csrfToken?: string
  /**
   * Request start time for performance monitoring
   */
  startTime?: number
  /**
   * Trace ID for distributed tracing
   */
  traceId?: string
  /**
   * Span ID for distributed tracing
   */
  spanId?: string
  /**
   * Security middleware additions
   */
  nonce?: string
  validatedBody?: any
}

export interface UploadedFile {
  fieldName: string
  originalName: string
  filename: string
  path: string
  size: number
  mimetype: string
  buffer: ArrayBuffer
}

export type RouteHandler = (req: EnhancedRequest) => Response | Promise<Response>

/**
 * Interface for handling route actions.
 * All action handlers must implement this interface.
 */
export interface ActionHandlerClass {
  /**
   * Handles an incoming HTTP request and returns a response.
   * @param request The incoming HTTP request
   * @returns A Promise that resolves to a Response object
   */
  handle: (request: EnhancedRequest) => Promise<Response>
}

export type ActionHandler = string | RouteHandler | (new () => ActionHandlerClass)

export type NextFunction = () => Promise<Response | null> | Response | null
export type MiddlewareHandler = (req: EnhancedRequest, next: NextFunction) => Promise<Response | null> | Response | null

export interface Middleware {
  handle: MiddlewareHandler
}

export interface RouteGroup {
  prefix?: string
  middleware?: (string | MiddlewareHandler)[]
}

export interface Route {
  path: string
  handler: ActionHandler
  method: string
  middleware: MiddlewareHandler[]
  type?: 'api' | 'web'
  name?: string
  constraints?: Record<string, string> | ((params: Record<string, string>) => boolean)[]
  domain?: string
  params?: Record<string, string>
  pattern?: {
    exec: (url: URL) => PatternMatchResult | null
  }
}

/**
 * WebSocket handler configuration
 */
export interface WebSocketConfig {
  open?: (ws: ServerWebSocket<any>) => void | Promise<void>
  message: (ws: ServerWebSocket<any>, message: string | Uint8Array | ArrayBuffer) => void | Promise<void>
  close?: (ws: ServerWebSocket<any>, code: number, reason: string) => void | Promise<void>
  ping?: (ws: ServerWebSocket<any>, data: Uint8Array) => void | Promise<void>
  pong?: (ws: ServerWebSocket<any>, data: Uint8Array) => void | Promise<void>
  drain?: (ws: ServerWebSocket<any>) => void | Promise<void>
  error?: (ws: ServerWebSocket<any>, error: Error) => void | Promise<void>
  maxPayloadLength?: number
  backpressureLimit?: number
  closeOnBackpressureLimit?: boolean
  idleTimeout?: number
  perMessageDeflate?: boolean | {
    compress?: boolean | Compressor
    decompress?: boolean | Compressor
  }
  sendPings?: boolean
  publishToSelf?: boolean
}

export type Compressor =
  | 'disable'
  | 'shared'
  | 'dedicated'
  | '3KB'
  | '4KB'
  | '8KB'
  | '16KB'
  | '32KB'
  | '64KB'
  | '128KB'
  | '256KB'

export interface ServerOptions extends Partial<Omit<Server, 'websocket'>> {
  websocket?: WebSocketConfig
}

/**
 * Type definition for route configuration.
 */
export interface RouteDefinition {
  /**
   * The path pattern for the route
   */
  path: string
  /**
   * The HTTP method for the route
   */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'TRACE' | 'CONNECT'
  /**
   * The action handler for the route - can be a string path, function, or class
   */
  handler: ActionHandler
  /**
   * Optional array of middleware to be executed before the handler
   */
  middleware?: (string | MiddlewareHandler)[]
  /**
   * Optional route type to distinguish between API and web routes
   */
  type?: 'api' | 'web'
  /**
   * Optional route name for reverse routing
   */
  name?: string
  /**
   * Optional route metadata for documentation or other purposes
   */
  meta?: Record<string, any>
}

/**
 * HTTP Methods type
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'TRACE' | 'CONNECT'

/**
 * Route matching result
 */
export interface MatchResult {
  route: Route
  params: Record<string, string>
}

/**
 * URL pattern match result
 */
export interface PatternMatchResult {
  pathname: {
    groups: Record<string, string>
  }
}

/**
 * Streaming response options
 */
export interface StreamingOptions {
  headers?: Record<string, string>
  status?: number
}

/**
 * SSE (Server-Sent Events) data structure
 */
export interface SSEData {
  data: any
  event?: string
  id?: string
  retry?: number
}

/**
 * Direct streaming writer interface
 */
export interface DirectStreamWriter {
  write: (chunk: string | Uint8Array) => void
  close: () => void
}

/**
 * Buffered streaming writer interface
 */
export interface BufferedStreamWriter {
  write: (chunk: string | Uint8Array) => void
  flush: () => void
  end: () => void
}

/**
 * Buffered streaming options
 */
export interface BufferedStreamOptions {
  highWaterMark?: number
  asUint8Array?: boolean
}

/**
 * Async generator function type for streaming
 */
export type StreamGenerator<T = any> = () => AsyncGenerator<T, void, unknown>

/**
 * Direct stream handler function type
 */
export type DirectStreamHandler = (writer: DirectStreamWriter) => Promise<void>

/**
 * Buffered stream handler function type
 */
export type BufferedStreamHandler = (writer: BufferedStreamWriter) => Promise<void>

/**
 * Transform function type for stream transformation
 */
export type TransformFunction<T = Uint8Array, R = string | Uint8Array> = (chunk: T) => R | Promise<R>
