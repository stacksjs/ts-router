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
  type: CacheType
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
      type: CacheStrategy
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
    metrics?: {
      responseTime?: boolean
      memoryUsage?: boolean
      cpuUsage?: boolean
      errorRate?: boolean
      requestRate?: boolean
      cacheStats?: boolean
    }
    tracing?: {
      enabled?: boolean
      sampleRate?: number
      serviceName?: string
      serviceVersion?: string
      environment?: string
      jaegerEndpoint?: string
      zipkinEndpoint?: string
    }
    storage?: {
      type?: CacheType
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
    store?: Extract<CacheType, 'memory' | 'redis'>
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
        type: CacheType
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
  engine: TemplateEngine
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

/**
 * Action handler path with strict pattern validation
 */
export type ActionPath = `Actions/${string}Action` | `actions/${string}Action` | `${string}Controller@${string}`

/**
 * Strongly typed action handler with better type safety
 */
export type ActionHandler<TPath extends string = string> =
  | ActionPath
  | TypedRouteHandler<TPath>
  | RouteHandler
  | (new () => ActionHandlerClass)

/**
 * Controller method reference with strict typing
 */
export type ControllerMethod<
  TController extends string = string,
  TMethod extends string = string
> = `${TController}@${TMethod}`

/**
 * Action class constructor with typed handle method
 */
export interface TypedActionHandlerClass<TPath extends string = string> {
  handle: (request: EnhancedRequest & { params: ExtractRouteParams<TPath> }) => Promise<Response>
}

/**
 * Discriminated union for different action handler types
 */
export type ActionHandlerVariant<TPath extends string = string> =
  | { type: 'path'; value: ActionPath }
  | { type: 'function'; value: TypedRouteHandler<TPath> }
  | { type: 'class'; value: new () => TypedActionHandlerClass<TPath> }
  | { type: 'controller'; value: ControllerMethod }

export type NextFunction = () => Promise<Response | null> | Response | null
export type MiddlewareHandler = (req: EnhancedRequest, next: NextFunction) => Promise<Response | null> | Response | null

export interface Middleware {
  handle: MiddlewareHandler
}

/**
 * Strict middleware configuration with narrow types
 */
export interface StrictMiddlewareConfig {
  name: BuiltInMiddleware
  enabled: boolean
  priority: number
  timing: MiddlewareTiming
  params?: Record<string, string | number | boolean>
}

/**
 * Conditional middleware with narrow type constraints
 */
export interface ConditionalMiddleware<T extends BuiltInMiddleware = BuiltInMiddleware> {
  name: T
  condition: (req: EnhancedRequest) => boolean
  handler: MiddlewareHandler
  priority?: number
}

/**
 * Middleware group configuration with strict typing
 */
export interface MiddlewareGroup {
  name: string
  middleware: (BuiltInMiddleware | MiddlewareWithParams<BuiltInMiddleware>)[]
  priority: number
  description?: string
}

/**
 * Throttle middleware parameters with narrow types
 */
export interface ThrottleMiddlewareParams {
  pattern: ThrottlePattern
  name?: string
  keyGenerator?: (req: EnhancedRequest) => string
  skipIf?: (req: EnhancedRequest) => boolean
}

/**
 * CORS middleware configuration with strict options
 */
export interface CorsMiddlewareConfig {
  origin: string | string[] | boolean | ((origin: string) => boolean)
  methods: HTTPMethod[]
  allowedHeaders: string[]
  exposedHeaders?: string[]
  credentials: boolean
  maxAge: number
  preflightContinue: boolean
  optionsSuccessStatus: ResponseStatus
}

/**
 * Auth middleware configuration with narrow types
 */
export interface AuthMiddlewareConfig {
  type: 'jwt' | 'session' | 'apikey' | 'basic' | 'bearer'
  required: boolean
  realm?: string
  validateUser?: (user: any) => boolean
  onUnauthorized?: (req: EnhancedRequest) => Response
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
 * Type definition for route configuration with strict typing.
 */
export interface RouteDefinition<
  TPath extends string = string,
  TMethod extends HTTPMethod = HTTPMethod,
  THandler extends ActionHandler = ActionHandler
> {
  /**
   * The path pattern for the route
   */
  path: TPath
  /**
   * The HTTP method for the route
   */
  method: TMethod
  /**
   * The action handler for the route - can be a string path, function, or class
   */
  handler: THandler
  /**
   * Optional array of middleware to be executed before the handler
   */
  middleware?: (BuiltInMiddleware | MiddlewareWithParams<BuiltInMiddleware> | MiddlewareHandler)[]
  /**
   * Optional route type to distinguish between API and web routes
   */
  type?: 'api' | 'web'
  /**
   * Optional route name for reverse routing
   */
  name?: string
  /**
   * Route parameter constraints
   */
  constraints?: {
    [K in keyof ExtractRouteParams<TPath>]: RouteConstraint
  }
  /**
   * Optional route metadata for documentation or other purposes
   */
  meta?: Record<string, any>
  /**
   * Cache configuration for this specific route
   */
  cache?: {
    enabled: boolean
    ttl: number
    tags?: string[]
    strategy?: CacheStrategy
  }
  /**
   * Rate limiting configuration for this route
   */
  throttle?: ThrottlePattern | ThrottleMiddlewareParams
}

/**
 * HTTP Methods type - extremely narrow
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'TRACE' | 'CONNECT'

/**
 * Narrow throttle pattern types
 */
export type ThrottlePattern =
  | `${number}`                    // e.g., "60" (60 requests per 1 minute)
  | `${number},${number}`         // e.g., "60,1" (60 requests per 1 minute)
  | `${number},${number}min`      // e.g., "60,5min" (60 requests per 5 minutes)
  | `${number},${number}m`        // e.g., "60,5m" (60 requests per 5 minutes)
  | `${number},${number}sec`      // e.g., "100,30sec" (100 requests per 30 seconds)
  | `${number},${number}s`        // e.g., "100,30s" (100 requests per 30 seconds)
  | `${number},${number}hour`     // e.g., "1000,1hour" (1000 requests per 1 hour)
  | `${number},${number}h`        // e.g., "1000,1h" (1000 requests per 1 hour)

/**
 * Cache strategy types - narrow and specific
 */
export type CacheStrategy = 'stale-while-revalidate' | 'cache-first' | 'network-first'

/**
 * Cache type narrow definition
 */
export type CacheType = 'memory' | 'redis' | 'custom'

/**
 * File extension types for views
 */
export type ViewExtension = '.html' | '.stx' | '.hbs' | '.ejs' | '.pug' | '.mustache'

/**
 * Template engine types
 */
export type TemplateEngine = 'auto' | 'stx' | 'html' | 'handlebars' | 'ejs' | 'pug' | 'mustache' | 'custom'

/**
 * Route parameter constraint patterns
 */
export type RouteConstraint =
  | 'number'           // Only numbers
  | 'alpha'            // Only letters
  | 'alphanumeric'     // Letters and numbers
  | 'uuid'             // UUID format
  | 'slug'             // URL-friendly slug
  | RegExp             // Custom regex
  | string             // Custom pattern string

/**
 * Middleware execution timing
 */
export type MiddlewareTiming = 'before' | 'after' | 'around'

/**
 * Security header types
 */
export type SecurityHeader =
  | 'Content-Security-Policy'
  | 'X-Frame-Options'
  | 'X-Content-Type-Options'
  | 'Referrer-Policy'
  | 'Permissions-Policy'
  | 'Strict-Transport-Security'

/**
 * Built-in middleware names - extremely narrow
 */
export type BuiltInMiddleware =
  | 'auth'
  | 'cors'
  | 'csrf'
  | 'helmet'
  | 'json'
  | 'compress'
  | 'static'
  | 'session'
  | 'rateLimiter'
  | 'requestId'
  | 'logger'
  | 'throttle'

/**
 * Middleware with parameters
 */
export type MiddlewareWithParams<T extends string = string> =
  | T
  | `${T}:${string}`

/**
 * Route path parameter types - narrow template literals
 */
export type RouteParam<T extends string> = T extends `{${infer P}}` ? P : never

/**
 * Extract parameters from route path
 */
export type ExtractRouteParams<T extends string> =
  T extends `${string}{${infer Param}}${infer Rest}`
    ? { [K in Param]: string } & ExtractRouteParams<Rest>
    : {}

/**
 * Route method constraints
 */
export type RouteMethodConstraint<M extends HTTPMethod = HTTPMethod> = M

/**
 * File MIME types for uploads
 */
export type AllowedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  | 'image/svg+xml'
  | 'application/pdf'
  | 'application/json'
  | 'text/plain'
  | 'text/csv'
  | 'application/octet-stream'

/**
 * Response status codes - narrow and specific
 */
export type ResponseStatus =
  | 200 | 201 | 202 | 204 // Success
  | 301 | 302 | 304       // Redirects
  | 400 | 401 | 403 | 404 | 405 | 409 | 422 | 429 // Client errors
  | 500 | 502 | 503 | 504 // Server errors

/**
 * Content types - narrow
 */
export type ContentType =
  | 'application/json'
  | 'application/xml'
  | 'text/html'
  | 'text/plain'
  | 'text/csv'
  | 'application/pdf'
  | 'application/octet-stream'
  | 'multipart/form-data'
  | 'application/x-www-form-urlencoded'

/**
 * Strongly typed route method signatures
 */
export interface TypedRouteHandler<TPath extends string> {
  (req: EnhancedRequest & { params: ExtractRouteParams<TPath> }): Response | Promise<Response>
}

/**
 * Strongly typed route definition for specific HTTP methods
 */
export interface GetRoute<TPath extends string> extends RouteDefinition<TPath, 'GET'> {
  method: 'GET'
  handler: TypedRouteHandler<TPath> | ActionHandler
}

export interface PostRoute<TPath extends string> extends RouteDefinition<TPath, 'POST'> {
  method: 'POST'
  handler: TypedRouteHandler<TPath> | ActionHandler
}

export interface PutRoute<TPath extends string> extends RouteDefinition<TPath, 'PUT'> {
  method: 'PUT'
  handler: TypedRouteHandler<TPath> | ActionHandler
}

export interface DeleteRoute<TPath extends string> extends RouteDefinition<TPath, 'DELETE'> {
  method: 'DELETE'
  handler: TypedRouteHandler<TPath> | ActionHandler
}

export interface PatchRoute<TPath extends string> extends RouteDefinition<TPath, 'PATCH'> {
  method: 'PATCH'
  handler: TypedRouteHandler<TPath> | ActionHandler
}

/**
 * Union of all typed route definitions
 */
export type TypedRouteDefinition<TPath extends string = string> =
  | GetRoute<TPath>
  | PostRoute<TPath>
  | PutRoute<TPath>
  | DeleteRoute<TPath>
  | PatchRoute<TPath>

/**
 * Route validation helpers
 */
export interface RouteValidation<TPath extends string> {
  path: TPath
  params: ExtractRouteParams<TPath>
  validate: (req: EnhancedRequest) => req is EnhancedRequest & { params: ExtractRouteParams<TPath> }
}

/**
 * Common route patterns with strict template literal types
 */
export type CommonRoutePatterns =
  | '/'                           // Root
  | '/health'                     // Health check
  | '/api'                        // API root
  | '/api/v1'                     // Versioned API
  | '/api/v1/users'              // User collection
  | '/api/v1/users/{id}'         // User resource
  | '/api/v1/users/{userId}/posts'  // Nested resource
  | '/api/v1/users/{userId}/posts/{postId}'  // Nested resource item
  | '/admin'                      // Admin panel
  | '/admin/{section}'           // Admin section
  | '/auth/login'                // Authentication
  | '/auth/logout'               // Logout
  | '/auth/register'             // Registration
  | '/auth/forgot-password'      // Password reset
  | '/uploads/{filename}'        // File uploads
  | '/assets/{path}'             // Static assets

/**
 * RESTful resource route patterns
 */
export type ResourceRoutePatterns<T extends string> =
  | `/${T}`                      // Collection: GET /users
  | `/${T}/{id}`                 // Item: GET /users/123
  | `/${T}/create`               // Create form: GET /users/create
  | `/${T}/{id}/edit`           // Edit form: GET /users/123/edit
  | `/${T}/{id}/show`           // Show item: GET /users/123/show

/**
 * API versioning patterns
 */
export type ApiVersionPattern<V extends string, Path extends string> = `/api/${V}${Path}`

/**
 * Nested resource patterns
 */
export type NestedResourcePattern<
  Parent extends string,
  Child extends string,
  ParentId extends string = 'id',
  ChildId extends string = 'id'
> = `/${Parent}/{${ParentId}}/${Child}` | `/${Parent}/{${ParentId}}/${Child}/{${ChildId}}`

/**
 * Route parameter patterns with constraints
 */
export type IdPattern = '{id}'
export type UuidPattern = '{uuid}'
export type SlugPattern = '{slug}'
export type NumberPattern = '{number}'

/**
 * File path patterns
 */
export type FilePathPattern = '{filepath}' | '{*filepath}' | '{path...}'

/**
 * Discriminated union for cache configurations
 */
export type CacheConfigVariant =
  | { type: 'memory'; maxSize: number; ttl: number }
  | { type: 'redis'; url: string; prefix: string; ttl: number; maxRetries: number }
  | { type: 'custom'; adapter: CacheConfig['customAdapter']; ttl: number }

/**
 * Discriminated union for authentication configurations
 */
export type AuthConfigVariant =
  | { type: 'jwt'; secret: string; expiresIn: string; algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' }
  | { type: 'session'; secret: string; store: CacheType; maxAge: number }
  | { type: 'apikey'; keyName: string; location: 'header' | 'query' | 'cookie' }
  | { type: 'basic'; realm: string; users: Record<string, string> }
  | { type: 'bearer'; validate: (token: string) => Promise<boolean> }

/**
 * Discriminated union for rate limiting configurations
 */
export type RateLimitConfigVariant =
  | { type: 'memory'; maxAttempts: number; windowMs: number; keyGenerator?: (req: EnhancedRequest) => string }
  | { type: 'redis'; maxAttempts: number; windowMs: number; redisUrl: string; keyPrefix: string }
  | { type: 'pattern'; pattern: ThrottlePattern; name?: string }

/**
 * Discriminated union for middleware configurations
 */
export type MiddlewareConfigVariant =
  | { type: 'throttle'; config: RateLimitConfigVariant }
  | { type: 'cors'; config: CorsMiddlewareConfig }
  | { type: 'auth'; config: AuthConfigVariant }
  | { type: 'cache'; config: CacheConfigVariant }
  | { type: 'custom'; name: string; handler: MiddlewareHandler; params?: Record<string, any> }

/**
 * Discriminated union for route handlers
 */
export type RouteHandlerVariant<TPath extends string = string> =
  | { type: 'action'; path: ActionPath }
  | { type: 'function'; handler: TypedRouteHandler<TPath> }
  | { type: 'class'; constructor: new () => TypedActionHandlerClass<TPath> }
  | { type: 'controller'; method: ControllerMethod }

/**
 * Discriminated union for validation rules
 */
export type ValidationRuleVariant =
  | { type: 'required'; message?: string }
  | { type: 'string'; minLength?: number; maxLength?: number; pattern?: RegExp }
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'email'; message?: string }
  | { type: 'url'; protocols?: string[] }
  | { type: 'custom'; validate: (value: any) => boolean | Promise<boolean>; message: string }

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

/**
 * Advanced Error Handling Types
 */
export interface ErrorContext {
  requestId?: string
  userId?: string
  traceId?: string
  spanId?: string
  route?: string
  method?: string
  url?: string
  userAgent?: string
  ip?: string
  timestamp?: Date
  metadata?: Record<string, any>
}

export interface ErrorReportingConfig {
  enabled: boolean
  service: 'sentry' | 'bugsnag' | 'custom'
  dsn?: string
  apiKey?: string
  environment?: string
  release?: string
  sampleRate?: number
  beforeSend?: (error: any, context: ErrorContext) => any
  filters?: {
    ignoreErrors?: (string | RegExp)[]
    ignoreCodes?: string[]
    ignoreUrls?: (string | RegExp)[]
    allowUrls?: (string | RegExp)[]
  }
  tags?: Record<string, string>
  user?: {
    id?: string
    email?: string
    username?: string
  }
  extra?: Record<string, any>
  breadcrumbs?: {
    enabled: boolean
    maxBreadcrumbs: number
  }
  performance?: {
    enabled: boolean
    tracesSampleRate: number
  }
}

export interface CircuitBreakerConfig {
  name: string
  failureThreshold: number
  recoveryTimeout: number
  timeout: number
  monitoringPeriod: number
  minimumRequests: number
  errorThresholdPercentage: number
  halfOpenMaxCalls: number
  resetTimeout: number
  onStateChange?: (state: 'CLOSED' | 'OPEN' | 'HALF_OPEN', name: string) => void
  onFailure?: (error: Error, name: string) => void
  onSuccess?: (name: string) => void
  shouldTripOnError?: (error: Error) => boolean
}

export interface DegradationConfig {
  enabled: boolean
  fallbackStrategies: {
    [serviceName: string]: {
      type: 'cache' | 'static' | 'simplified' | 'redirect' | 'custom'
      priority: number
      timeout: number
      retries: number
      backoff: {
        type: 'fixed' | 'exponential'
        delay: number
        maxDelay?: number
      }
      fallbackHandler?: (error: any, context: ErrorContext) => Promise<Response>
      cacheConfig?: {
        key: string
        ttl: number
        staleWhileRevalidate: boolean
      }
      staticResponse?: {
        status: number
        body: any
        headers?: Record<string, string>
      }
      redirectConfig?: {
        url: string
        permanent: boolean
      }
    }
  }
  healthChecks: {
    [serviceName: string]: {
      enabled: boolean
      endpoint: string
      interval: number
      timeout: number
      retries: number
      expectedStatus: number[]
      expectedBody?: string | RegExp
      headers?: Record<string, string>
      onHealthy?: () => void
      onUnhealthy?: (error: Error) => void
    }
  }
  monitoring: {
    enabled: boolean
    alertThresholds: {
      errorRate: number
      responseTime: number
      availability: number
    }
  }
}

/**
 * Request/Response Enhancement Types
 */
export interface RequestMacroMethods {
  // Content type detection
  wantsJson: () => boolean
  wantsHtml: () => boolean
  wantsXml: () => boolean
  expectsJson: () => boolean
  
  // Request information
  isAjax: () => boolean
  isPjax: () => boolean
  isMobile: () => boolean
  isBot: () => boolean
  isSecure: () => boolean
  
  // Client information
  ip: () => string
  ips: () => string[]
  userAgent: () => string
  referer: () => string | null
  
  // Authentication
  bearerToken: () => string | null
  basicAuth: () => { username: string, password: string } | null
  
  // Headers
  hasHeader: (name: string) => boolean
  header: (name: string, defaultValue?: string) => string | null
  allHeaders: () => Record<string, string>
  
  // Input handling
  input: (key: string, defaultValue?: any) => any
  all: () => Record<string, any>
  only: (keys: string[]) => Record<string, any>
  except: (keys: string[]) => Record<string, any>
  
  // Validation checks
  has: (key: string) => boolean
  hasAny: (keys: string[]) => boolean
  missing: (key: string) => boolean
  filled: (key: string) => boolean
  
  // Query and params
  getQuery: (key?: string, defaultValue?: any) => any
  param: (key: string, defaultValue?: any) => any
  
  // Cookies
  cookie: (name: string, defaultValue?: string) => string | null
  cookies: () => Record<string, string>
  
  // Files
  file: (name: string) => any
  hasFile: (name: string) => boolean
  
  // URL utilities
  path: () => string
  fullUrl: () => string
  root: () => string
  is: (pattern: string) => boolean
  route: () => string | null
  
  // Utilities
  fingerprint: () => string
  signature: (secret: string) => string
  merge: (data: Record<string, any>) => void
  replace: (data: Record<string, any>) => void
  age: () => number
  isFromTrustedProxy: (trustedProxies?: string[]) => boolean
  contentLength: () => number
  contentType: () => string | null
  isContentType: (type: string) => boolean
}

// Extend the existing EnhancedRequest interface
declare module './types' {
  interface EnhancedRequest extends Omit<RequestMacroMethods, 'ip'> {
    validated?: Record<string, any>
    ip?: string  // Override to allow optional string property
  }
}
