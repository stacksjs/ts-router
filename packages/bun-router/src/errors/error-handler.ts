/**
 * Advanced Error Handling - Main Error Handler Middleware
 *
 * Unified error handling middleware that integrates all error handling components
 */

import type { CircuitBreakerConfig, DegradationConfig, EnhancedRequest, ErrorContext, ErrorReportingConfig } from '../types'
import { CircuitBreakerRegistry } from './circuit-breaker'
import { ErrorReportingManager } from './error-reporting'
import { ErrorFactory, RouterException } from './exceptions'
import { GracefulDegradationManager } from './graceful-degradation'

export interface AdvancedErrorHandlerConfig {
  errorReporting?: ErrorReportingConfig[]
  gracefulDegradation?: DegradationConfig
  circuitBreakers?: CircuitBreakerConfig[]
  globalErrorHandler?: (error: RouterException, req: EnhancedRequest) => Promise<Response>
  development?: boolean
  includeStackTrace?: boolean
  sanitizeErrors?: boolean
  logErrors?: boolean
  customErrorPages?: {
    [statusCode: number]: string | ((error: RouterException, req: EnhancedRequest) => Promise<Response>)
  }
}

/**
 * Advanced error handler middleware
 */
export class AdvancedErrorHandler {
  private errorReporting?: ErrorReportingManager
  private gracefulDegradation?: GracefulDegradationManager
  private circuitBreakerRegistry?: CircuitBreakerRegistry
  private config: AdvancedErrorHandlerConfig

  constructor(config: AdvancedErrorHandlerConfig = {}) {
    this.config = {
      development: false,
      includeStackTrace: false,
      sanitizeErrors: true,
      logErrors: true,
      ...config,
    }

    this.initializeComponents()
  }

  private initializeComponents(): void {
    // Initialize error reporting
    if (this.config.errorReporting?.length) {
      this.errorReporting = new ErrorReportingManager(this.config.errorReporting)
    }

    // Initialize graceful degradation
    if (this.config.gracefulDegradation?.enabled) {
      this.gracefulDegradation = new GracefulDegradationManager(this.config.gracefulDegradation)
    }

    // Initialize circuit breakers
    if (this.config.circuitBreakers?.length) {
      this.circuitBreakerRegistry = new CircuitBreakerRegistry()
      for (const config of this.config.circuitBreakers) {
        this.circuitBreakerRegistry.register(config)
      }
    }
  }

  /**
   * Main error handling middleware
   */
  middleware() {
    return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      try {
        // Add error context to request
        const errorContext: ErrorContext = {
          requestId: req.requestId,
          userId: req.user?.id,
          traceId: req.traceId,
          spanId: req.spanId,
          route: req.params?.route || req.url,
          method: req.method,
          url: req.url,
          userAgent: (req as any).userAgent?.() || undefined,
          ip: (req as any).ip?.() || undefined,
          timestamp: new Date(),
        }

        req.context = { ...req.context, errorContext }

        // Execute request with circuit breaker protection if configured
        if (this.circuitBreakerRegistry && req.context?.serviceName) {
          const breaker = this.circuitBreakerRegistry.get(req.context.serviceName as string)
          if (breaker) {
            return await breaker.execute({
              execute: next,
              context: errorContext,
            })
          }
        }

        return await next()
      }
      catch (error) {
        return this.handleError(error, req)
      }
    }
  }

  /**
   * Handle errors with full advanced error handling pipeline
   */
  async handleError(error: unknown, req: EnhancedRequest): Promise<Response> {
    // Convert to RouterException if needed
    const routerError = this.normalizeError(error, req)

    // Add breadcrumb for error reporting
    if (this.errorReporting) {
      this.errorReporting.addBreadcrumb(
        `Error in ${req.method} ${req.url}`,
        'error',
        {
          code: routerError.code,
          severity: routerError.severity,
          statusCode: routerError.statusCode,
        },
      )
    }

    // Log error if configured
    if (this.config.logErrors) {
      this.logError(routerError, req)
    }

    // Try graceful degradation if configured
    if (this.gracefulDegradation && req.context?.serviceName) {
      try {
        return await this.gracefulDegradation.handleFailure(
          req.context.serviceName as string,
          routerError,
          req,
          async () => {
            throw routerError // This will trigger fallback strategies
          },
        )
      }
      catch {
        // Graceful degradation failed, continue with normal error handling
      }
    }

    // Report error to external services
    if (this.errorReporting) {
      try {
        await this.errorReporting.report(routerError, routerError.context)
      }
      catch (reportingError) {
        console.error('Failed to report error:', reportingError)
      }
    }

    // Use custom global error handler if provided
    if (this.config.globalErrorHandler) {
      try {
        return await this.config.globalErrorHandler(routerError, req)
      }
      catch (handlerError) {
        console.error('Global error handler failed:', handlerError)
      }
    }

    // Use custom error page if configured
    const customPage = this.config.customErrorPages?.[routerError.statusCode]
    if (customPage) {
      try {
        if (typeof customPage === 'string') {
          return new Response(customPage, {
            status: routerError.statusCode,
            headers: { 'Content-Type': 'text/html' },
          })
        }
        else {
          return await customPage(routerError, req)
        }
      }
      catch (pageError) {
        console.error('Custom error page failed:', pageError)
      }
    }

    // Default error response
    return this.createErrorResponse(routerError, req)
  }

  /**
   * Convert any error to RouterException
   */
  private normalizeError(error: unknown, req: EnhancedRequest): RouterException {
    const errorContext: ErrorContext = {
      requestId: req.requestId,
      userId: req.user?.id,
      traceId: req.traceId,
      spanId: req.spanId,
      route: req.params?.route || req.url,
      method: req.method,
      url: req.url,
      userAgent: (req as any).userAgent?.() || undefined,
      ip: (req as any).ip?.() || undefined,
      timestamp: new Date(),
      metadata: req.context,
    }

    // Already a RouterException
    if (error instanceof RouterException) {
      return error
    }

    // Standard Error
    if (error instanceof Error) {
      // Check for specific error types
      if (error.name === 'ValidationError') {
        return ErrorFactory.validation(error.message, {}, errorContext)
      }

      if (error.name === 'UnauthorizedError' || error.message.includes('unauthorized')) {
        return ErrorFactory.authentication(error.message, errorContext)
      }

      if (error.name === 'ForbiddenError' || error.message.includes('forbidden')) {
        return ErrorFactory.authorization(error.message, [], errorContext)
      }

      if (error.name === 'NotFoundError' || error.message.includes('not found')) {
        return ErrorFactory.notFound(undefined, undefined, errorContext)
      }

      if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
        return ErrorFactory.timeout(30000, error.message, errorContext)
      }

      // Generic internal server error
      return ErrorFactory.internalServer(error.message, error, errorContext)
    }

    // String error
    if (typeof error === 'string') {
      return ErrorFactory.internalServer(error, undefined, errorContext)
    }

    // Unknown error type
    return ErrorFactory.internalServer('An unknown error occurred', undefined, errorContext)
  }

  /**
   * Create standardized error response
   */
  private createErrorResponse(error: RouterException, _req: EnhancedRequest): Response {
    const isDevelopment = this.config.development
    const includeStackTrace = this.config.includeStackTrace || isDevelopment
    const sanitizeErrors = this.config.sanitizeErrors && !isDevelopment

    // Sanitize error message for production
    let message = error.message
    if (sanitizeErrors && error.statusCode >= 500) {
      message = 'An internal server error occurred'
    }

    const errorResponse: any = {
      error: {
        code: error.code,
        message,
        statusCode: error.statusCode,
        timestamp: error.timestamp.toISOString(),
        requestId: error.context.requestId,
        traceId: error.context.traceId,
      },
    }

    // Add additional fields in development
    if (isDevelopment) {
      errorResponse.error.category = error.category
      errorResponse.error.severity = error.severity
      errorResponse.error.retryable = error.retryable
      errorResponse.error.context = error.context
    }

    // Add stack trace if configured
    if (includeStackTrace) {
      errorResponse.error.stack = error.stack
      if (error.cause) {
        errorResponse.error.cause = {
          name: error.cause.name,
          message: error.cause.message,
          stack: error.cause.stack,
        }
      }
    }

    // Add validation fields for validation errors
    if ('fields' in error) {
      errorResponse.error.fields = (error as any).fields
    }

    // Add specific error type fields
    if ('allowedMethods' in error) {
      errorResponse.error.allowedMethods = (error as any).allowedMethods
    }

    if ('retryAfter' in error) {
      errorResponse.error.retryAfter = (error as any).retryAfter
    }

    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Error-Code': error.code,
      'X-Request-ID': error.context.requestId || '',
      'X-Trace-ID': error.context.traceId || '',
    })

    // Add specific headers for certain error types
    if ('allowedMethods' in error) {
      headers.set('Allow', (error as any).allowedMethods.join(', '))
    }

    if ('retryAfter' in error) {
      headers.set('Retry-After', (error as any).retryAfter.toString())
    }

    if ('limit' in error) {
      headers.set('X-RateLimit-Limit', (error as any).limit.toString())
      headers.set('X-RateLimit-Remaining', (error as any).remaining.toString())
    }

    return new Response(JSON.stringify(errorResponse), {
      status: error.statusCode,
      headers,
    })
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: RouterException, req: EnhancedRequest): void {
    const logData = {
      error: error.toJSON(),
      request: {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
        userAgent: (req as any).userAgent?.() || undefined,
        ip: (req as any).ip?.() || undefined,
        requestId: req.requestId,
        traceId: req.traceId,
      },
    }

    switch (error.severity) {
      case 'critical':
        console.error('[CRITICAL ERROR]', logData)
        break
      case 'high':
        console.error('[ERROR]', logData)
        break
      case 'medium':
        console.warn('[WARNING]', logData)
        break
      case 'low':
        console.warn('[INFO]', logData)
        break
      default:
        console.error('[ERROR]', logData)
    }
  }

  /**
   * Get error handler statistics
   */
  getStats(): {
    errorReporting?: any
    gracefulDegradation?: any
    circuitBreakers?: any
  } {
    return {
      errorReporting: this.errorReporting
        ? {
            breadcrumbs: this.errorReporting.getBreadcrumbs().length,
          }
        : undefined,
      gracefulDegradation: this.gracefulDegradation
        ? this.gracefulDegradation.getSystemHealth()
        : undefined,
      circuitBreakers: this.circuitBreakerRegistry
        ? this.circuitBreakerRegistry.getAllMetrics()
        : undefined,
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.errorReporting) {
      await this.errorReporting.close()
    }

    if (this.gracefulDegradation) {
      this.gracefulDegradation.stop()
    }
  }
}

/**
 * Factory function to create advanced error handler middleware
 */
export function createAdvancedErrorHandler(config: AdvancedErrorHandlerConfig = {}): {
  middleware: (req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>
  getStats: () => { errorReporting?: any, gracefulDegradation?: any, circuitBreakers?: any }
  cleanup: () => Promise<void>
} {
  const handler = new AdvancedErrorHandler(config)
  return {
    middleware: handler.middleware(),
    getStats: (): { errorReporting?: any, gracefulDegradation?: any, circuitBreakers?: any } => handler.getStats(),
    cleanup: (): Promise<void> => handler.cleanup(),
  }
}

/**
 * Preset configurations for different environments
 */
export const ErrorHandlerPresets = {
  development: (): AdvancedErrorHandlerConfig => ({
    development: true,
    includeStackTrace: true,
    sanitizeErrors: false,
    logErrors: true,
    errorReporting: [],
  }),

  production: (sentryDsn?: string, bugsnagApiKey?: string): AdvancedErrorHandlerConfig => ({
    development: false,
    includeStackTrace: false,
    sanitizeErrors: true,
    logErrors: true,
    errorReporting: [
      ...(sentryDsn
        ? [{
            enabled: true,
            service: 'sentry' as const,
            dsn: sentryDsn,
            environment: 'production',
            sampleRate: 1.0,
            breadcrumbs: { enabled: true, maxBreadcrumbs: 100 },
            performance: { enabled: true, tracesSampleRate: 0.1 },
          }]
        : []),
      ...(bugsnagApiKey
        ? [{
            enabled: true,
            service: 'bugsnag' as const,
            apiKey: bugsnagApiKey,
            environment: 'production',
            breadcrumbs: { enabled: true, maxBreadcrumbs: 25 },
          }]
        : []),
    ],
  }),

  staging: (sentryDsn?: string): AdvancedErrorHandlerConfig => ({
    development: false,
    includeStackTrace: true,
    sanitizeErrors: false,
    logErrors: true,
    errorReporting: sentryDsn
      ? [{
          enabled: true,
          service: 'sentry',
          dsn: sentryDsn,
          environment: 'staging',
          sampleRate: 1.0,
          breadcrumbs: { enabled: true, maxBreadcrumbs: 100 },
        }]
      : [],
  }),

  resilient: (config: {
    sentryDsn?: string
    bugsnagApiKey?: string
    services?: string[]
  } = {}): AdvancedErrorHandlerConfig => ({
    development: false,
    includeStackTrace: false,
    sanitizeErrors: true,
    logErrors: true,
    errorReporting: [
      ...(config.sentryDsn
        ? [{
            enabled: true,
            service: 'sentry' as const,
            dsn: config.sentryDsn,
            environment: 'production',
            sampleRate: 1.0,
            breadcrumbs: { enabled: true, maxBreadcrumbs: 100 },
            performance: { enabled: true, tracesSampleRate: 0.1 },
          }]
        : []),
      ...(config.bugsnagApiKey
        ? [{
            enabled: true,
            service: 'bugsnag' as const,
            apiKey: config.bugsnagApiKey,
            environment: 'production',
            breadcrumbs: { enabled: true, maxBreadcrumbs: 25 },
          }]
        : []),
    ],
    gracefulDegradation: {
      enabled: true,
      fallbackStrategies: Object.fromEntries(
        (config.services || ['database', 'cache', 'external-api']).map(service => [
          service,
          {
            type: 'cache' as const,
            priority: 1,
            timeout: 5000,
            retries: 2,
            backoff: { type: 'exponential' as const, delay: 1000, maxDelay: 5000 },
            cacheConfig: {
              key: `${service}:{url}:{method}`,
              ttl: 3600,
              staleWhileRevalidate: true,
            },
          },
        ]),
      ),
      healthChecks: Object.fromEntries(
        (config.services || []).map(service => [
          service,
          {
            enabled: true,
            endpoint: `/health/${service}`,
            interval: 30000,
            timeout: 5000,
            retries: 3,
            expectedStatus: [200],
          },
        ]),
      ),
      monitoring: {
        enabled: true,
        alertThresholds: {
          errorRate: 10,
          responseTime: 5000,
          availability: 95,
        },
      },
    },
    circuitBreakers: (config.services || ['database', 'cache', 'external-api']).map(service => ({
      name: service,
      failureThreshold: 5,
      recoveryTimeout: 60000,
      timeout: 30000,
      monitoringPeriod: 60000,
      minimumRequests: 10,
      errorThresholdPercentage: 50,
      halfOpenMaxCalls: 3,
      resetTimeout: 60000,
    })),
  }),
}
