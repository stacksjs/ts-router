/* eslint-disable no-console */
/**
 * Observability & Monitoring - Integration Layer
 *
 * Unified integration for tracing, metrics, health checks, and correlation
 */

import type { EnhancedRequest } from '../types'
import type { CorrelationConfig } from './correlation'
import type { HealthCheckConfig } from './health-checks'
import type { MetricConfig } from './metrics'
import type { TraceConfig } from './tracing'
import process from 'node:process'
import {
  CorrelationEndpoints,
  createCorrelationMiddleware,
  initializeCorrelation,
} from './correlation'
import {

  HealthEndpoints,
  initializeHealthChecks,
} from './health-checks'
import {
  createMetricsHandler,
  createMetricsMiddleware,
  initializeMetrics,

} from './metrics'
import {
  createTracingMiddleware,
  initializeTracer,

} from './tracing'

export interface ObservabilityConfig {
  tracing?: TraceConfig
  metrics?: MetricConfig
  healthChecks?: HealthCheckConfig
  correlation?: CorrelationConfig
  enableTracing?: boolean
  enableMetrics?: boolean
  enableHealthChecks?: boolean
  enableCorrelation?: boolean
  endpoints?: {
    metrics?: string
    health?: string
    ready?: string
    live?: string
    startup?: string
    trace?: string
    correlationStats?: string
  }
}

/**
 * Observability manager - coordinates all observability features
 */
export class ObservabilityManager {
  private config: ObservabilityConfig
  private initialized = false

  constructor(config: ObservabilityConfig = {}) {
    this.config = {
      enableTracing: true,
      enableMetrics: true,
      enableHealthChecks: true,
      enableCorrelation: true,
      endpoints: {
        metrics: '/metrics',
        health: '/health',
        ready: '/health/ready',
        live: '/health/live',
        startup: '/health/startup',
        trace: '/trace',
        correlationStats: '/correlation/stats',
      },
      ...config,
    }
  }

  /**
   * Initialize all observability components
   */
  initialize(): void {
    if (this.initialized) {
      console.warn('Observability already initialized')
      return
    }

    // Initialize tracing
    if (this.config.enableTracing && this.config.tracing) {
      initializeTracer(this.config.tracing)
      console.log('✓ Distributed tracing initialized')
    }

    // Initialize metrics
    if (this.config.enableMetrics) {
      initializeMetrics(this.config.metrics)
      console.log('✓ Metrics collection initialized')
    }

    // Initialize health checks
    if (this.config.enableHealthChecks) {
      initializeHealthChecks(this.config.healthChecks)
      console.log('✓ Health checks initialized')
    }

    // Initialize correlation
    if (this.config.enableCorrelation) {
      initializeCorrelation(this.config.correlation)
      console.log('✓ Request correlation initialized')
    }

    this.initialized = true
    console.log('🔍 Observability & Monitoring fully initialized')
  }

  /**
   * Create observability middleware stack
   */
  createMiddleware() {
    const middlewares: Array<(req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>> = []

    // Add correlation middleware first (provides context for others)
    if (this.config.enableCorrelation) {
      middlewares.push(createCorrelationMiddleware(this.config.correlation))
    }

    // Add tracing middleware
    if (this.config.enableTracing) {
      middlewares.push(createTracingMiddleware(this.config.tracing))
    }

    // Add metrics middleware
    if (this.config.enableMetrics) {
      middlewares.push(createMetricsMiddleware(this.config.metrics))
    }

    return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      // Execute middleware stack
      let index = 0

      const executeNext = async (): Promise<Response> => {
        if (index >= middlewares.length) {
          return await next()
        }

        const middleware = middlewares[index++]
        return await middleware(req, executeNext)
      }

      return await executeNext()
    }
  }

  /**
   * Create observability route handlers
   */
  createRouteHandlers(): Record<string, (req: EnhancedRequest) => Promise<Response>> {
    const handlers: Record<string, (req: EnhancedRequest) => Promise<Response>> = {}

    // Metrics endpoint
    if (this.config.enableMetrics && this.config.endpoints?.metrics) {
      handlers[this.config.endpoints.metrics] = createMetricsHandler()
    }

    // Health check endpoints
    if (this.config.enableHealthChecks) {
      if (this.config.endpoints?.health) {
        handlers[this.config.endpoints.health] = HealthEndpoints.health
      }
      if (this.config.endpoints?.ready) {
        handlers[this.config.endpoints.ready] = HealthEndpoints.ready
      }
      if (this.config.endpoints?.live) {
        handlers[this.config.endpoints.live] = HealthEndpoints.live
      }
      if (this.config.endpoints?.startup) {
        handlers[this.config.endpoints.startup] = HealthEndpoints.startup
      }
    }

    // Correlation endpoints
    if (this.config.enableCorrelation) {
      if (this.config.endpoints?.trace) {
        handlers[this.config.endpoints.trace] = CorrelationEndpoints.trace
      }
      if (this.config.endpoints?.correlationStats) {
        handlers[this.config.endpoints.correlationStats] = CorrelationEndpoints.stats
      }
    }

    return handlers
  }

  /**
   * Get observability status
   */
  getStatus(): {
    initialized: boolean
    components: {
      tracing: boolean
      metrics: boolean
      healthChecks: boolean
      correlation: boolean
    }
    endpoints: string[]
  } {
    const handlers = this.createRouteHandlers()

    return {
      initialized: this.initialized,
      components: {
        tracing: this.config.enableTracing || false,
        metrics: this.config.enableMetrics || false,
        healthChecks: this.config.enableHealthChecks || false,
        correlation: this.config.enableCorrelation || false,
      },
      endpoints: Object.keys(handlers),
    }
  }
}

/**
 * Global observability manager
 */
let globalObservabilityManager: ObservabilityManager | null = null

/**
 * Initialize global observability
 */
export function initializeObservability(config?: ObservabilityConfig): ObservabilityManager {
  globalObservabilityManager = new ObservabilityManager(config)
  globalObservabilityManager.initialize()
  return globalObservabilityManager
}

/**
 * Get global observability manager
 */
export function getObservabilityManager(): ObservabilityManager | null {
  return globalObservabilityManager
}

/**
 * Observability presets for common configurations
 */
export const ObservabilityPresets = {
  /**
   * Development preset - console logging, basic metrics
   */
  development: (): ObservabilityConfig => ({
    enableTracing: true,
    enableMetrics: true,
    enableHealthChecks: true,
    enableCorrelation: true,
    tracing: {
      serviceName: 'bun-router-dev',
      environment: 'development',
      enableConsoleExporter: true,
      sampleRate: 1.0,
    },
    metrics: {
      enableDefaultMetrics: true,
      collectInterval: 15000,
    },
    healthChecks: {
      timeout: 3000,
      interval: 30000,
    },
    correlation: {
      enableLogging: true,
      logLevel: 'debug',
    },
  }),

  /**
   * Production preset - optimized for performance
   */
  production: (): ObservabilityConfig => ({
    enableTracing: true,
    enableMetrics: true,
    enableHealthChecks: true,
    enableCorrelation: true,
    tracing: {
      serviceName: 'bun-router',
      environment: 'production',
      enableConsoleExporter: false,
      enableOTLPExporter: true,
      sampleRate: 0.1, // 10% sampling
    },
    metrics: {
      enableDefaultMetrics: true,
      collectInterval: 30000,
    },
    healthChecks: {
      timeout: 5000,
      interval: 60000,
    },
    correlation: {
      enableLogging: false,
    },
  }),

  /**
   * Kubernetes preset - optimized for k8s deployment
   */
  kubernetes: (): ObservabilityConfig => ({
    enableTracing: true,
    enableMetrics: true,
    enableHealthChecks: true,
    enableCorrelation: true,
    tracing: {
      serviceName: process.env.SERVICE_NAME || 'bun-router',
      environment: process.env.ENVIRONMENT || 'production',
      enableOTLPExporter: true,
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      sampleRate: Number.parseFloat(process.env.OTEL_SAMPLE_RATE || '0.1'),
    },
    metrics: {
      prefix: process.env.METRICS_PREFIX,
      enableDefaultMetrics: true,
      collectInterval: 30000,
    },
    healthChecks: {
      timeout: 10000,
      gracePeriod: 30000,
    },
    correlation: {
      enableLogging: process.env.NODE_ENV !== 'production',
    },
    endpoints: {
      metrics: '/metrics',
      health: '/health',
      ready: '/health/ready',
      live: '/health/live',
      startup: '/health/startup',
    },
  }),

  /**
   * Microservices preset - enhanced correlation and tracing
   */
  microservices: (): ObservabilityConfig => ({
    enableTracing: true,
    enableMetrics: true,
    enableHealthChecks: true,
    enableCorrelation: true,
    tracing: {
      serviceName: process.env.SERVICE_NAME || 'bun-router-service',
      environment: process.env.ENVIRONMENT || 'production',
      enableJaegerExporter: true,
      jaegerEndpoint: process.env.JAEGER_ENDPOINT,
      sampleRate: 0.2, // Higher sampling for microservices
    },
    metrics: {
      enableDefaultMetrics: true,
      collectInterval: 15000,
    },
    healthChecks: {
      timeout: 5000,
      dependencies: [
        // Add your service dependencies here
      ],
    },
    correlation: {
      propagateHeaders: [
        'x-correlation-id',
        'x-request-id',
        'x-trace-id',
        'x-span-id',
        'x-user-id',
        'x-session-id',
        'x-tenant-id',
      ],
      enableLogging: true,
    },
  }),

  /**
   * Minimal preset - basic observability
   */
  minimal: (): ObservabilityConfig => ({
    enableTracing: false,
    enableMetrics: true,
    enableHealthChecks: true,
    enableCorrelation: false,
    metrics: {
      enableDefaultMetrics: true,
      collectInterval: 60000,
    },
    healthChecks: {
      timeout: 3000,
    },
    endpoints: {
      metrics: '/metrics',
      health: '/health',
    },
  }),
}

/**
 * Router integration helpers
 */
export const ObservabilityIntegration = {
  /**
   * Add observability to router
   */
  enhance: (router: any, config?: ObservabilityConfig) => {
    const manager = initializeObservability(config)
    const middleware = manager.createMiddleware()
    const handlers = manager.createRouteHandlers()

    // Add middleware to router
    router.use(middleware)

    // Add observability endpoints
    Object.entries(handlers).forEach(([path, handler]) => {
      router.get(path, handler)
    })

    return {
      manager,
      middleware,
      handlers,
      status: manager.getStatus(),
    }
  },

  /**
   * Create observability-enabled route builder
   */
  createRouteBuilder: (config?: ObservabilityConfig) => {
    const manager = initializeObservability(config)

    return {
      /**
       * Create route with observability
       */
      route: (method: string, path: string, handler: (req: EnhancedRequest) => Promise<Response>) => {
        const middleware = manager.createMiddleware()

        return {
          method,
          path,
          handler: async (req: EnhancedRequest) => {
            return await middleware(req, () => handler(req))
          },
        }
      },

      /**
       * Get observability endpoints
       */
      getEndpoints: () => manager.createRouteHandlers(),

      /**
       * Get manager instance
       */
      getManager: () => manager,
    }
  },
}

/**
 * Utility functions for observability
 */
export const ObservabilityUtils = {
  /**
   * Create observability configuration from environment
   */
  fromEnvironment: (): ObservabilityConfig => {
    const preset = process.env.OBSERVABILITY_PRESET as keyof typeof ObservabilityPresets

    if (preset && ObservabilityPresets[preset]) {
      return ObservabilityPresets[preset]()
    }

    // Default configuration from environment variables
    return {
      enableTracing: process.env.ENABLE_TRACING !== 'false',
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
      enableCorrelation: process.env.ENABLE_CORRELATION !== 'false',
      tracing: {
        serviceName: process.env.SERVICE_NAME || 'bun-router',
        environment: process.env.ENVIRONMENT || process.env.NODE_ENV || 'development',
        otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        jaegerEndpoint: process.env.JAEGER_ENDPOINT,
        sampleRate: Number.parseFloat(process.env.OTEL_SAMPLE_RATE || '1.0'),
      },
      metrics: {
        prefix: process.env.METRICS_PREFIX,
        collectInterval: Number.parseInt(process.env.METRICS_COLLECT_INTERVAL || '30000'),
      },
      correlation: {
        enableLogging: process.env.CORRELATION_LOGGING !== 'false',
      },
    }
  },

  /**
   * Validate observability configuration
   */
  validateConfig: (config: ObservabilityConfig): string[] => {
    const errors: string[] = []

    if (config.tracing?.sampleRate && (config.tracing.sampleRate < 0 || config.tracing.sampleRate > 1)) {
      errors.push('Tracing sample rate must be between 0 and 1')
    }

    if (config.metrics?.collectInterval && config.metrics.collectInterval < 1000) {
      errors.push('Metrics collect interval must be at least 1000ms')
    }

    if (config.healthChecks?.timeout && config.healthChecks.timeout < 100) {
      errors.push('Health check timeout must be at least 100ms')
    }

    return errors
  },

  /**
   * Get observability summary
   */
  getSummary: (): any => {
    const manager = getObservabilityManager()
    if (!manager) {
      return { status: 'not_initialized' }
    }

    return {
      status: 'initialized',
      ...manager.getStatus(),
    }
  },
}
