/**
 * Advanced Error Handling - Exception Hierarchy
 *
 * Comprehensive exception types with metadata, stack traces, and context information
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

export interface ErrorDetails {
  code: string
  message: string
  context?: ErrorContext
  cause?: Error
  statusCode?: number
  retryable?: boolean
  severity?: 'low' | 'medium' | 'high' | 'critical'
  category?: 'validation' | 'authentication' | 'authorization' | 'network' | 'database' | 'external' | 'system' | 'business'
}

/**
 * Base exception class for all router errors
 */
export abstract class RouterException extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly context: ErrorContext
  public readonly retryable: boolean
  public readonly severity: 'low' | 'medium' | 'high' | 'critical'
  public readonly category: string
  public readonly timestamp: Date
  public readonly cause?: Error

  constructor(details: ErrorDetails) {
    super(details.message)
    this.name = this.constructor.name
    this.code = details.code
    this.statusCode = details.statusCode || 500
    this.context = details.context || {}
    this.retryable = details.retryable || false
    this.severity = details.severity || 'medium'
    this.category = details.category || 'system'
    this.timestamp = new Date()
    this.cause = details.cause

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Convert error to JSON for logging/reporting
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
      retryable: this.retryable,
      severity: this.severity,
      category: this.category,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    }
  }

  /**
   * Create HTTP response for this error
   */
  toResponse(): Response {
    const body = {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        timestamp: this.timestamp.toISOString(),
        requestId: this.context.requestId,
      },
    }

    return new Response(JSON.stringify(body), {
      status: this.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Code': this.code,
        'X-Request-ID': this.context.requestId || '',
      },
    })
  }
}

/**
 * Validation errors (400)
 */
export class ValidationException extends RouterException {
  public readonly fields: Record<string, string[]>

  constructor(message: string, fields: Record<string, string[]> = {}, context?: ErrorContext) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      statusCode: 400,
      context,
      retryable: false,
      severity: 'low',
      category: 'validation',
    })
    this.fields = fields
  }

  toResponse(): Response {
    const body = {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        timestamp: this.timestamp.toISOString(),
        requestId: this.context.requestId,
        fields: this.fields,
      },
    }

    return new Response(JSON.stringify(body), {
      status: this.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Code': this.code,
        'X-Request-ID': this.context.requestId || '',
      },
    })
  }
}

/**
 * Authentication errors (401)
 */
export class AuthenticationException extends RouterException {
  constructor(message: string = 'Authentication required', context?: ErrorContext) {
    super({
      code: 'AUTHENTICATION_ERROR',
      message,
      statusCode: 401,
      context,
      retryable: false,
      severity: 'medium',
      category: 'authentication',
    })
  }
}

/**
 * Authorization errors (403)
 */
export class AuthorizationException extends RouterException {
  public readonly requiredPermissions?: string[]

  constructor(message: string = 'Access denied', requiredPermissions?: string[], context?: ErrorContext) {
    super({
      code: 'AUTHORIZATION_ERROR',
      message,
      statusCode: 403,
      context,
      retryable: false,
      severity: 'medium',
      category: 'authorization',
    })
    this.requiredPermissions = requiredPermissions
  }
}

/**
 * Resource not found errors (404)
 */
export class NotFoundException extends RouterException {
  public readonly resource?: string
  public readonly resourceId?: string

  constructor(message: string = 'Resource not found', resource?: string, resourceId?: string, context?: ErrorContext) {
    super({
      code: 'NOT_FOUND',
      message,
      statusCode: 404,
      context,
      retryable: false,
      severity: 'low',
      category: 'business',
    })
    this.resource = resource
    this.resourceId = resourceId
  }
}

/**
 * Method not allowed errors (405)
 */
export class MethodNotAllowedException extends RouterException {
  public readonly allowedMethods: string[]

  constructor(method: string, allowedMethods: string[], context?: ErrorContext) {
    super({
      code: 'METHOD_NOT_ALLOWED',
      message: `Method ${method} not allowed. Allowed methods: ${allowedMethods.join(', ')}`,
      statusCode: 405,
      context,
      retryable: false,
      severity: 'low',
      category: 'business',
    })
    this.allowedMethods = allowedMethods
  }

  toResponse(): Response {
    const response = super.toResponse()
    response.headers.set('Allow', this.allowedMethods.join(', '))
    return response
  }
}

/**
 * Request timeout errors (408)
 */
export class TimeoutException extends RouterException {
  public readonly timeoutMs: number

  constructor(message: string = 'Request timeout', timeoutMs: number, context?: ErrorContext) {
    super({
      code: 'REQUEST_TIMEOUT',
      message,
      statusCode: 408,
      context,
      retryable: true,
      severity: 'medium',
      category: 'network',
    })
    this.timeoutMs = timeoutMs
  }
}

/**
 * Rate limit exceeded errors (429)
 */
export class RateLimitException extends RouterException {
  public readonly retryAfter: number
  public readonly limit: number
  public readonly remaining: number

  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter: number,
    limit: number,
    remaining: number = 0,
    context?: ErrorContext,
  ) {
    super({
      code: 'RATE_LIMIT_EXCEEDED',
      message,
      statusCode: 429,
      context,
      retryable: true,
      severity: 'medium',
      category: 'network',
    })
    this.retryAfter = retryAfter
    this.limit = limit
    this.remaining = remaining
  }

  toResponse(): Response {
    const response = super.toResponse()
    response.headers.set('Retry-After', this.retryAfter.toString())
    response.headers.set('X-RateLimit-Limit', this.limit.toString())
    response.headers.set('X-RateLimit-Remaining', this.remaining.toString())
    return response
  }
}

/**
 * Internal server errors (500)
 */
export class InternalServerException extends RouterException {
  constructor(message: string = 'Internal server error', cause?: Error, context?: ErrorContext) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message,
      statusCode: 500,
      context,
      cause,
      retryable: true,
      severity: 'high',
      category: 'system',
    })
  }
}

/**
 * Service unavailable errors (503)
 */
export class ServiceUnavailableException extends RouterException {
  public readonly retryAfter?: number

  constructor(message: string = 'Service unavailable', retryAfter?: number, context?: ErrorContext) {
    super({
      code: 'SERVICE_UNAVAILABLE',
      message,
      statusCode: 503,
      context,
      retryable: true,
      severity: 'high',
      category: 'system',
    })
    this.retryAfter = retryAfter
  }

  toResponse(): Response {
    const response = super.toResponse()
    if (this.retryAfter) {
      response.headers.set('Retry-After', this.retryAfter.toString())
    }
    return response
  }
}

/**
 * Database errors
 */
export class DatabaseException extends RouterException {
  public readonly query?: string
  public readonly operation?: string

  constructor(message: string, operation?: string, query?: string, cause?: Error, context?: ErrorContext) {
    super({
      code: 'DATABASE_ERROR',
      message,
      statusCode: 500,
      context,
      cause,
      retryable: true,
      severity: 'high',
      category: 'database',
    })
    this.operation = operation
    this.query = query
  }
}

/**
 * External service errors
 */
export class ExternalServiceException extends RouterException {
  public readonly service: string
  public readonly endpoint?: string

  constructor(
    message: string,
    service: string,
    endpoint?: string,
    statusCode: number = 502,
    cause?: Error,
    context?: ErrorContext,
  ) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      message,
      statusCode,
      context,
      cause,
      retryable: true,
      severity: 'medium',
      category: 'external',
    })
    this.service = service
    this.endpoint = endpoint
  }
}

/**
 * Circuit breaker open errors
 */
export class CircuitBreakerOpenException extends RouterException {
  public readonly service: string
  public readonly nextAttemptAt: Date

  constructor(service: string, nextAttemptAt: Date, context?: ErrorContext) {
    super({
      code: 'CIRCUIT_BREAKER_OPEN',
      message: `Circuit breaker is open for service: ${service}. Next attempt at: ${nextAttemptAt.toISOString()}`,
      statusCode: 503,
      context,
      retryable: true,
      severity: 'medium',
      category: 'external',
    })
    this.service = service
    this.nextAttemptAt = nextAttemptAt
  }
}

/**
 * Business logic errors
 */
export class BusinessLogicException extends RouterException {
  public readonly businessRule: string

  constructor(message: string, businessRule: string, context?: ErrorContext) {
    super({
      code: 'BUSINESS_LOGIC_ERROR',
      message,
      statusCode: 422,
      context,
      retryable: false,
      severity: 'low',
      category: 'business',
    })
    this.businessRule = businessRule
  }
}

/**
 * Configuration errors
 */
export class ConfigurationException extends RouterException {
  public readonly configKey: string

  constructor(message: string, configKey: string, context?: ErrorContext) {
    super({
      code: 'CONFIGURATION_ERROR',
      message,
      statusCode: 500,
      context,
      retryable: false,
      severity: 'critical',
      category: 'system',
    })
    this.configKey = configKey
  }
}

/**
 * File system errors
 */
export class FileSystemException extends RouterException {
  public readonly path: string
  public readonly operation: string

  constructor(message: string, path: string, operation: string, cause?: Error, context?: ErrorContext) {
    super({
      code: 'FILESYSTEM_ERROR',
      message,
      statusCode: 500,
      context,
      cause,
      retryable: false,
      severity: 'medium',
      category: 'system',
    })
    this.path = path
    this.operation = operation
  }
}

/**
 * Factory functions for common errors
 */
export const ErrorFactory = {
  validation: (message: string, fields?: Record<string, string[]>, context?: ErrorContext) =>
    new ValidationException(message, fields, context),

  authentication: (message?: string, context?: ErrorContext) =>
    new AuthenticationException(message, context),

  authorization: (message?: string, requiredPermissions?: string[], context?: ErrorContext) =>
    new AuthorizationException(message, requiredPermissions, context),

  notFound: (resource?: string, resourceId?: string, context?: ErrorContext) =>
    new NotFoundException(undefined, resource, resourceId, context),

  methodNotAllowed: (method: string, allowedMethods: string[], context?: ErrorContext) =>
    new MethodNotAllowedException(method, allowedMethods, context),

  timeout: (timeoutMs: number, message?: string, context?: ErrorContext) =>
    new TimeoutException(message, timeoutMs, context),

  rateLimit: (retryAfter: number, limit: number, remaining?: number, context?: ErrorContext) =>
    new RateLimitException(undefined, retryAfter, limit, remaining, context),

  internalServer: (message?: string, cause?: Error, context?: ErrorContext) =>
    new InternalServerException(message, cause, context),

  serviceUnavailable: (message?: string, retryAfter?: number, context?: ErrorContext) =>
    new ServiceUnavailableException(message, retryAfter, context),

  database: (message: string, operation?: string, query?: string, cause?: Error, context?: ErrorContext) =>
    new DatabaseException(message, operation, query, cause, context),

  externalService: (
    message: string,
    service: string,
    endpoint?: string,
    statusCode?: number,
    cause?: Error,
    context?: ErrorContext,
  ) => new ExternalServiceException(message, service, endpoint, statusCode, cause, context),

  circuitBreakerOpen: (service: string, nextAttemptAt: Date, context?: ErrorContext) =>
    new CircuitBreakerOpenException(service, nextAttemptAt, context),

  businessLogic: (message: string, businessRule: string, context?: ErrorContext) =>
    new BusinessLogicException(message, businessRule, context),

  configuration: (message: string, configKey: string, context?: ErrorContext) =>
    new ConfigurationException(message, configKey, context),

  fileSystem: (message: string, path: string, operation: string, cause?: Error, context?: ErrorContext) =>
    new FileSystemException(message, path, operation, cause, context),
}
