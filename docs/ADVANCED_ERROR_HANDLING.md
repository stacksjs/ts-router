# Advanced Error Handling

Comprehensive error handling system with exception hierarchy, error reporting integration, graceful degradation, and circuit breaker patterns.

## Features

- **Exception Hierarchy**: Custom exception types with metadata and context
- **Error Reporting**: Integration with Sentry, Bugsnag, and custom reporting services
- **Graceful Degradation**: Fallback strategies for partial service failures
- **Circuit Breaker**: Protection against cascading failures from external services
- **Unified Error Handler**: Middleware that integrates all error handling components

## Quick Start

```typescript
import { createAdvancedErrorHandler, ErrorHandlerPresets } from 'bun-router'

// Development setup
const errorHandler = createAdvancedErrorHandler(
  ErrorHandlerPresets.development()
)

// Production setup with Sentry
const errorHandler = createAdvancedErrorHandler(
  ErrorHandlerPresets.production('your-sentry-dsn')
)

// Add to your router
router.use(errorHandler)
```

## Exception Hierarchy

### Base RouterException

All errors extend from `RouterException` with rich metadata:

```typescript
import { ErrorFactory } from 'bun-router'

// Create specific error types
const validationError = ErrorFactory.validation('Invalid email', {
  email: ['Must be a valid email address']
})

const authError = ErrorFactory.authentication('Token expired')

const notFoundError = ErrorFactory.notFound('User', '123')
```

### Available Exception Types

- `ValidationException` (400) - Input validation errors
- `AuthenticationException` (401) - Authentication failures
- `AuthorizationException` (403) - Permission denied
- `NotFoundException` (404) - Resource not found
- `MethodNotAllowedException` (405) - HTTP method not allowed
- `TimeoutException` (408) - Request timeout
- `RateLimitException` (429) - Rate limit exceeded
- `InternalServerException` (500) - Internal server errors
- `ServiceUnavailableException` (503) - Service unavailable
- `DatabaseException` (500) - Database errors
- `ExternalServiceException` (502) - External service errors
- `CircuitBreakerOpenException` (503) - Circuit breaker open
- `BusinessLogicException` (422) - Business rule violations

### Error Context

Every exception includes rich context information:

```typescript
const error = ErrorFactory.internalServer('Database connection failed', cause, {
  requestId: 'req-123',
  userId: 'user-456',
  traceId: 'trace-789',
  route: '/api/users',
  method: 'GET',
  url: 'https://api.example.com/users',
  userAgent: 'Mozilla/5.0...',
  ip: '192.168.1.1',
  timestamp: new Date(),
  metadata: { query: 'SELECT * FROM users' }
})
```

## Error Reporting

### Sentry Integration

```typescript
import { ErrorReportingPresets } from 'bun-router'

const config = ErrorReportingPresets.sentry('your-dsn', 'production')

const errorHandler = createAdvancedErrorHandler({
  errorReporting: [config]
})
```

### Bugsnag Integration

```typescript
const config = ErrorReportingPresets.bugsnag('your-api-key', 'production')

const errorHandler = createAdvancedErrorHandler({
  errorReporting: [config]
})
```

### Custom Error Reporting

```typescript
import { CustomReporter } from 'bun-router'

const customReporter = new CustomReporter(
  { enabled: true, service: 'custom' },
  async (report) => {
    // Send to your custom error service
    await fetch('https://your-error-service.com/errors', {
      method: 'POST',
      body: JSON.stringify(report)
    })
    return 'custom-report-id'
  }
)

const manager = new ErrorReportingManager([])
manager.addReporter(customReporter)
```

### Breadcrumbs

Track user actions leading to errors:

```typescript
// In your middleware
errorReporting.addBreadcrumb('User logged in', 'auth', { userId: '123' })
errorReporting.addBreadcrumb('API call started', 'http', { endpoint: '/api/data' })
errorReporting.addBreadcrumb('Database query', 'db', { query: 'SELECT...' })
```

## Circuit Breaker Pattern

### Basic Usage

```typescript
import { CircuitBreaker, CircuitBreakerPresets } from 'bun-router'

// Create circuit breaker for external service
const breaker = new CircuitBreaker(
  CircuitBreakerPresets.externalApi('payment-service')
)

// Execute with protection
const result = await breaker.execute({
  execute: async () => {
    return await fetch('https://payment-api.com/charge')
  },
  fallback: async () => {
    return { status: 'queued', message: 'Payment queued for processing' }
  }
})
```

### HTTP Client with Circuit Breaker

```typescript
import { CircuitBreakerHttpClient } from 'bun-router'

const client = new CircuitBreakerHttpClient()

// Automatic circuit breaker per hostname
const response = await client.fetch('https://api.external.com/data', {
  method: 'POST',
  body: JSON.stringify({ data: 'test' }),
  fallback: async () => {
    return new Response(JSON.stringify({ cached: true }), { status: 200 })
  }
})
```

### Circuit Breaker States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Circuit is open, requests fail fast
- **HALF_OPEN**: Testing if service has recovered

### Monitoring Circuit Breakers

```typescript
import { globalCircuitBreakerRegistry } from 'bun-router'

// Get all circuit breaker metrics
const metrics = globalCircuitBreakerRegistry.getAllMetrics()

// Get breakers by state
const openBreakers = globalCircuitBreakerRegistry.getBreakersByState('OPEN')

// Force circuit breaker states
globalCircuitBreakerRegistry.get('payment-service')?.forceOpen()
globalCircuitBreakerRegistry.get('payment-service')?.forceClosed()
```

## Graceful Degradation

### Configuration

```typescript
import { DegradationStrategies } from 'bun-router'

const degradationConfig = {
  enabled: true,
  fallbackStrategies: {
    'user-service': DegradationStrategies.cacheFirst(3600, true),
    'recommendation-service': DegradationStrategies.staticFallback({
      recommendations: [],
      message: 'Recommendations temporarily unavailable'
    }),
    'analytics-service': DegradationStrategies.simplifiedView()
  },
  healthChecks: {
    'user-service': {
      enabled: true,
      endpoint: 'https://user-service.com/health',
      interval: 30000,
      timeout: 5000,
      retries: 3,
      expectedStatus: [200]
    }
  },
  monitoring: {
    enabled: true,
    alertThresholds: {
      errorRate: 10,
      responseTime: 5000,
      availability: 95
    }
  }
}
```

### Fallback Strategies

#### Cache-First Strategy

```typescript
const strategy = DegradationStrategies.cacheFirst(3600, true) // TTL, stale-while-revalidate
```

#### Static Fallback

```typescript
const strategy = DegradationStrategies.staticFallback({
  data: [],
  message: 'Service temporarily unavailable'
}, 200)
```

#### Simplified View

```typescript
const strategy = DegradationStrategies.simplifiedView()
```

#### Custom Fallback

```typescript
const strategy = {
  type: 'custom',
  priority: 1,
  timeout: 5000,
  retries: 2,
  backoff: { type: 'exponential', delay: 1000, maxDelay: 5000 },
  fallbackHandler: async (error, context) => {
    // Custom fallback logic
    return new Response(JSON.stringify({
      message: 'Custom fallback response',
      error: error.code
    }), { status: 200 })
  }
}
```

### Health Monitoring

```typescript
import { GracefulDegradationManager } from 'bun-router'

const manager = new GracefulDegradationManager(degradationConfig)

// Get system health
const health = manager.getSystemHealth()
console.log(`System status: ${health.status}`)

// Get service metrics
const metrics = manager.getServiceMetrics('user-service')
console.log(`Error rate: ${metrics.errorRate}%`)
```

## Complete Integration Example

```typescript
import {
  createAdvancedErrorHandler,
  ErrorReportingPresets,
  CircuitBreakerPresets,
  DegradationStrategies
} from 'bun-router'

// Configure advanced error handling
const errorHandler = createAdvancedErrorHandler({
  development: process.env.NODE_ENV === 'development',

  // Error reporting
  errorReporting: [
    ErrorReportingPresets.sentry(process.env.SENTRY_DSN!, 'production')
  ],

  // Circuit breakers
  circuitBreakers: [
    CircuitBreakerPresets.database('postgres'),
    CircuitBreakerPresets.externalApi('payment-service'),
    CircuitBreakerPresets.standard('cache-service')
  ],

  // Graceful degradation
  gracefulDegradation: {
    enabled: true,
    fallbackStrategies: {
      'payment-service': DegradationStrategies.cacheFirst(1800),
      'recommendation-service': DegradationStrategies.staticFallback({
        recommendations: [],
        message: 'Recommendations temporarily unavailable'
      }),
      'analytics-service': DegradationStrategies.simplifiedView()
    },
    healthChecks: {
      'payment-service': {
        enabled: true,
        endpoint: 'https://payment.api.com/health',
        interval: 30000,
        timeout: 5000,
        retries: 3,
        expectedStatus: [200]
      }
    },
    monitoring: {
      enabled: true,
      alertThresholds: {
        errorRate: 5,
        responseTime: 3000,
        availability: 99
      }
    }
  },

  // Custom error pages
  customErrorPages: {
    404: '<h1>Page Not Found</h1><p>The requested resource was not found.</p>',
    500: async (error, req) => {
      return new Response(
        `<h1>Server Error</h1><p>Request ID: ${req.requestId}</p>`,
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      )
    }
  }
})

// Add to router
router.use(errorHandler)
```

## Middleware Usage

```typescript
import { Router } from 'bun-router'
import { createAdvancedErrorHandler, ErrorFactory } from 'bun-router'

const router = new Router()

// Add error handler middleware
router.use(createAdvancedErrorHandler({
  development: false,
  errorReporting: [/* your config */]
}))

// Your route handlers can throw RouterExceptions
router.get('/users/:id', async (req) => {
  const userId = req.params.id

  if (!userId) {
    throw ErrorFactory.validation('User ID is required')
  }

  const user = await getUserById(userId)
  if (!user) {
    throw ErrorFactory.notFound('User', userId)
  }

  return Response.json(user)
})
```

## Environment Presets

### Development

```typescript
const config = ErrorHandlerPresets.development()
// - Full stack traces
// - Detailed error information
// - Console logging
// - No error reporting
```

### Production

```typescript
const config = ErrorHandlerPresets.production(sentryDsn, bugsnagApiKey)
// - Sanitized error messages
// - Error reporting enabled
// - No stack traces in responses
// - Security headers
```

### Resilient (High Availability)

```typescript
const config = ErrorHandlerPresets.resilient({
  sentryDsn: 'your-sentry-dsn',
  services: ['database', 'cache', 'payment-api']
})
// - Full error reporting
// - Circuit breakers for all services
// - Graceful degradation strategies
// - Health monitoring
```

## Best Practices

1. **Use Specific Exception Types**: Choose the most appropriate exception type for better error categorization
2. **Include Rich Context**: Add request IDs, user IDs, and relevant metadata to errors
3. **Implement Fallbacks**: Always provide fallback mechanisms for critical services
4. **Monitor Circuit Breakers**: Set up alerts for circuit breaker state changes
5. **Test Error Scenarios**: Regularly test your error handling and fallback strategies
6. **Sanitize Production Errors**: Don't expose sensitive information in production error messages
7. **Use Breadcrumbs**: Track user actions to provide context for error investigation

## Monitoring and Observability

The advanced error handling system provides comprehensive metrics:

```typescript
// Get error handler statistics
const stats = errorHandler.getStats()

console.log('Error Reporting:', stats.errorReporting)
console.log('Circuit Breakers:', stats.circuitBreakers)
console.log('Graceful Degradation:', stats.gracefulDegradation)
```

## Testing

```typescript
import { describe, test, expect } from 'bun:test'
import { ErrorFactory, CircuitBreaker } from 'bun-router'

describe('Error Handling', () => {
  test('should handle validation errors', () => {
    const error = ErrorFactory.validation('Invalid input', {
      email: ['Required field']
    })

    expect(error.statusCode).toBe(400)
    expect(error.fields.email).toContain('Required field')
  })

  test('should trip circuit breaker', async () => {
    const breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 2,
      recoveryTimeout: 1000,
      timeout: 100
    })

    // Trigger failures
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute({
          execute: () => Promise.reject(new Error('Service down'))
        })
      } catch (e) {
        // Expected
      }
    }

    expect(breaker.getState()).toBe('OPEN')
  })
})
```
