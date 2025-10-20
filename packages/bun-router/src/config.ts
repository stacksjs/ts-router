import type { RouterConfig } from './types'
import process from 'node:process'
import { loadConfig } from 'bunfig'

/**
 * Default configuration for the router
 */
export const defaultConfig: RouterConfig = {
  // General settings
  verbose: false,

  // Route paths
  routesPath: 'routes',
  apiRoutesPath: 'routes/api.ts',
  webRoutesPath: 'routes/web.ts',

  // URL prefixes
  apiPrefix: '/api',
  webPrefix: '',

  // Default middleware configuration
  defaultMiddleware: {
    api: [
      'security',
      'helmet',
      'cors',
      'rate_limit',
      'json_body',
      'request_id',
    ],
    web: [
      'security',
      'helmet',
      'ddos_protection',
      'session',
      'csrf',
    ],
  },

  // Documentation settings
  docs: {
    output: 'api-reference.md',
    groupBy: 'path' as const,
    includeExamples: true,
    title: 'API Reference',
    description: 'API documentation for the application.',
    version: '1.0.0',
    baseUrl: 'http://localhost:3000',
    contact: {
      name: 'API Support',
      email: 'support@example.com',
      url: 'https://example.com/support',
    },
    security: {
      bearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },

  // Server settings
  server: {
    port: 3000,
    hostname: 'localhost',
    development: process.env.NODE_ENV !== 'production',
    cors: {
      enabled: true,
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['X-Request-Id'],
      credentials: false,
      maxAge: 86400,
    },
    rateLimit: {
      enabled: true,
      max: 100,
      timeWindow: 60000, // 1 minute
      message: 'Too many requests, please try again later',
    },
    compression: {
      enabled: true,
      level: 6,
      threshold: 1024, // bytes
    },
    static: {
      enabled: true,
      dir: 'public',
      maxAge: 86400,
    },
    performance: {
      cache: {
        enabled: false,
        type: 'memory',
        ttl: 3600,
      },
      prefetch: {
        enabled: false,
        paths: [],
        maxConcurrent: 5,
      },
      optimization: {
        minify: false,
        compress: false,
        treeshake: false,
        lazyLoad: false,
        chunkSize: 50000,
      },
      monitoring: {
        enabled: false,
        metrics: {
          responseTime: true,
          memoryUsage: true,
          cpuUsage: true,
          errorRate: true,
          requestRate: true,
          cacheStats: true,
        },
        tracing: {
          enabled: false,
          sampleRate: 0.1,
          // @ts-expect-error - Extended tracing config supports exporters array
          exporters: ['console'],
          propagation: ['w3c'],
        },
        logging: {
          level: 'info',
          format: 'json',
          destination: 'console',
        },
      },
    },
    security: {
      schemes: {},
      rateLimit: {
        enabled: true,
        max: 100,
        timeWindow: 60000,
      },
      cors: {
        enabled: true,
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      csrf: {
        enabled: true,
        secret: 'csrf-secret',
        cookie: {
          name: 'csrf-token',
          options: {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
          },
        },
      },
      helmet: {
        enabled: true,
        contentSecurityPolicy: {
          directives: {
            'default-src': ['\'self\''],
            'script-src': ['\'self\'', '\'unsafe-inline\''],
            'style-src': ['\'self\'', '\'unsafe-inline\''],
            'img-src': ['\'self\'', 'data:', 'https:'],
            'font-src': ['\'self\''],
            'connect-src': ['\'self\''],
            'media-src': ['\'self\''],
            'object-src': ['\'none\''],
            'child-src': ['\'self\''],
            'worker-src': ['\'self\''],
            'frame-ancestors': ['\'none\''],
            'form-action': ['\'self\''],
            'base-uri': ['\'self\''],
            'manifest-src': ['\'self\''],
          },
        },
        xssFilter: true,
        noSniff: true,
        frameOptions: 'DENY',
        hidePoweredBy: true,
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        referrerPolicy: 'strict-origin-when-cross-origin',
      },
      ddos: {
        enabled: true,
        maxRequestsPerSecond: 10,
        maxRequestsPerMinute: 100,
        maxRequestsPerHour: 1000,
        burstLimit: 20,
        windowSize: 60000,
        blockDuration: 300000,
        whitelistedIPs: [],
        blacklistedIPs: [],
        trustProxy: true,
        store: 'memory',
      },
      inputValidation: {
        enabled: true,
        sanitizeByDefault: true,
        strictMode: false,
        allowUnknownFields: true,
        maxDepth: 10,
      },
      attackPrevention: {
        enabled: true,
        sqlInjection: true,
        xss: true,
        pathTraversal: true,
        commandInjection: true,
        ldapInjection: true,
        xxe: true,
        customPatterns: [],
      },
      requestFiltering: {
        enabled: true,
        blockSuspiciousPatterns: true,
        maxRequestsPerMinute: 1000,
        blockUserAgents: [
          'sqlmap',
          'nikto',
          'nessus',
          'openvas',
          'nmap',
          'masscan',
          'zap',
          'w3af',
        ],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        requireUserAgent: false,
        maxBodySize: 10485760, // 10MB
        maxUrlLength: 2048,
        maxHeaderSize: 8192,
        allowedContentTypes: [
          'application/json',
          'application/x-www-form-urlencoded',
          'multipart/form-data',
          'text/plain',
          'text/html',
          'application/xml',
          'text/xml',
        ],
      },
      ipFiltering: {
        enabled: false,
        whitelist: [],
        blacklist: [],
        blockPrivateIPs: false,
        blockCloudProviders: false,
        geoBlocking: {
          enabled: false,
          allowedCountries: [],
          blockedCountries: [],
        },
      },
      responseSecurity: {
        enabled: true,
        removeServerHeaders: true,
        addSecurityHeaders: true,
        sanitizeErrors: true,
        preventInfoDisclosure: true,
      },
      auth: {
        jwt: {
          secret: 'jwt-secret',
          expiresIn: '1h',
          algorithm: 'HS256',
        },
        session: {
          enabled: false,
          secret: 'session-secret',
          name: 'session',
          resave: false,
          rolling: true,
          saveUninitialized: false,
          cookie: {
            maxAge: 86400000,
            secure: true,
            httpOnly: true,
            sameSite: 'strict',
          },
        },
      },
    },
    cluster: {
      enabled: false,
      workers: 'auto',
      sticky: true,
    },
    gracefulShutdown: {
      enabled: true,
      timeout: 30000,
      signals: ['SIGTERM', 'SIGINT'],
      forceTimeout: 10000,
    },
    middleware: {
      order: [],
      global: [],
    },
    hooks: {},
  },
}

// eslint-disable-next-line antfu/no-top-level-await
export const config: RouterConfig = await loadConfig({
  name: 'router',
  defaultConfig,
})
