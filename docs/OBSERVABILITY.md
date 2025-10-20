# Observability & Monitoring

Enterprise-grade observability features for distributed systems including distributed tracing, metrics collection, health checks, and request correlation.

## Features

- **Distributed Tracing** - OpenTelemetry-compatible tracing with multiple exporters
- **Metrics Collection** - Prometheus-format metrics with custom collectors
- **Health Checks** - Comprehensive health monitoring with dependency checks
- **Request Correlation** - Cross-service request correlation and tracking

## Quick Start

```typescript
import { setupProductionObservability } from 'bun-router'

// Initialize observability with production preset
const observability = setupProductionObservability()

// Use with your router
router.use(observability.createMiddleware())

// Add observability endpoints
const handlers = observability.createRouteHandlers()
Object.entries(handlers).forEach(([path, handler]) => {
  router.get(path, handler)
})
```

## Configuration Presets

### Development

```typescript
import { setupDevelopmentObservability } from 'bun-router'

const observability = setupDevelopmentObservability()
// - Console tracing enabled
// - Full sampling (100%)
// - Debug logging enabled
// - All features enabled
```

### Production

```typescript
import { setupProductionObservability } from 'bun-router'

const observability = setupProductionObservability()
// - OTLP tracing to external systems
// - 10% sampling for performance
// - Logging disabled
// - Optimized for performance
```

### Kubernetes

```typescript
import { setupKubernetesObservability } from 'bun-router'

const observability = setupKubernetesObservability()
// - Environment variable configuration
// - Standard k8s health endpoints
// - OTLP export to cluster collectors
```

### Microservices

```typescript
import { setupMicroservicesObservability } from 'bun-router'

const observability = setupMicroservicesObservability()
// - Enhanced correlation tracking
// - Jaeger tracing
// - Higher sampling rate (20%)
// - Extended header propagation
```

## Distributed Tracing

### Basic Usage

```typescript
import {
  initializeTracer,
  createTracingMiddleware,
  TraceHelpers
} from 'bun-router'

// Initialize tracer
const tracer = initializeTracer({
  serviceName: 'my-service',
  environment: 'production',
  enableOTLPExporter: true,
  otlpEndpoint: 'http://jaeger:14268/api/traces',
  sampleRate: 0.1
})

// Add tracing middleware
router.use(createTracingMiddleware())

// Use in handlers
router.get('/api/users', async (req) => {
  // Start custom span
  const span = TraceHelpers.startSpan(req, 'database-query')

  try {
    // Add tags and logs
    TraceHelpers.addTags(req, {
      'db.table': 'users',
      'query.type': 'select'
    })

    const users = await db.users.findMany()

    TraceHelpers.log(req, {
      message: 'Query completed',
      count: users.length
    })

    return Response.json(users)
  } finally {
    if (span) TraceHelpers.finishSpan(req, span)
  }
})
```

### Trace Context Propagation

```typescript
// Automatic header injection/extraction
router.get('/api/proxy', async (req) => {
  // Trace context automatically propagated
  const response = await fetch('http://downstream-service/api/data', {
    headers: {
      // Correlation headers automatically added
      'Authorization': 'Bearer token'
    }
  })

  return response
})
```

### Supported Trace Formats

- **W3C Trace Context** (`traceparent`, `tracestate`)
- **Jaeger** (`uber-trace-id`)
- **B3** (`x-b3-traceid`, `x-b3-spanid`)

## Metrics Collection

### Built-in Metrics

```typescript
import { initializeMetrics } from 'bun-router'

const registry = initializeMetrics({
  enableDefaultMetrics: true,
  collectInterval: 30000
})

// Automatic metrics:
// - http_requests_total
// - http_request_duration_seconds
// - http_request_size_bytes
// - http_response_size_bytes
// - process_uptime_seconds
// - process_memory_usage_bytes
// - active_connections
```

### Custom Metrics

```typescript
import { getMetricsRegistry } from 'bun-router'

const registry = getMetricsRegistry()

// Counter - monotonically increasing
const orderCounter = registry.createCounter(
  'orders_total',
  'Total number of orders processed'
)

// Gauge - can go up and down
const queueSize = registry.createGauge(
  'queue_size',
  'Current queue size'
)

// Histogram - distribution of values
const responseTime = registry.createHistogram(
  'response_time_seconds',
  'Response time distribution',
  [0.001, 0.01, 0.1, 1, 5] // Custom buckets
)

// Summary - quantiles over time window
const requestSize = registry.createSummary(
  'request_size_bytes',
  'Request size summary',
  [0.5, 0.9, 0.95, 0.99] // Quantiles
)

// Use in handlers
router.post('/api/orders', async (req) => {
  const startTime = Date.now()

  try {
    orderCounter.inc()
    queueSize.inc()

    const order = await processOrder(req)

    const duration = (Date.now() - startTime) / 1000
    responseTime.observe(duration)

    return Response.json(order)
  } finally {
    queueSize.dec()
  }
})
```

### Prometheus Endpoint

```typescript
// Metrics automatically available at /metrics
// GET /metrics
// Content-Type: text/plain; version=0.0.4; charset=utf-8

# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200",path="/api/users"} 1542

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",status="200",path="/api/users",le="0.001"} 0
http_request_duration_seconds_bucket{method="GET",status="200",path="/api/users",le="0.01"} 1234
http_request_duration_seconds_sum{method="GET",status="200",path="/api/users"} 12.34
http_request_duration_seconds_count{method="GET",status="200",path="/api/users"} 1542
```

## Health Checks

### Basic Health Checks

```typescript
import {
  initializeHealthChecks,
  HealthEndpoints,
  DependencyChecks
} from 'bun-router'

const healthManager = initializeHealthChecks({
  timeout: 5000,
  dependencies: [
    DependencyChecks.httpService('api-gateway', 'http://api.example.com/health'),
    DependencyChecks.database('postgres'),
    DependencyChecks.redis('cache'),
    DependencyChecks.fileSystem('uploads', '/app/uploads')
  ]
})

// Add health endpoints
router.get('/health', HealthEndpoints.health)
router.get('/health/ready', HealthEndpoints.ready)
router.get('/health/live', HealthEndpoints.live)
router.get('/health/startup', HealthEndpoints.startup)
```

### Custom Health Checks

```typescript
// Add custom dependency
healthManager.addDependency({
  name: 'external-api',
  type: 'custom',
  critical: true,
  timeout: 3000,
  check: async () => {
    try {
      const response = await fetch('https://api.external.com/status')

      if (response.ok) {
        return {
          status: 'healthy',
          message: 'External API is responding',
          timestamp: Date.now(),
          metadata: {
            responseTime: response.headers.get('x-response-time'),
            version: response.headers.get('x-api-version')
          }
        }
      } else {
        return {
          status: 'degraded',
          message: `External API returned ${response.status}`,
          timestamp: Date.now()
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'External API is unreachable',
        error: error.message,
        timestamp: Date.now()
      }
    }
  }
})

// Add custom health check
healthManager.addCustomCheck({
  name: 'memory-usage',
  critical: false,
  check: async () => {
    const memUsage = process.memoryUsage()
    const usedMB = memUsage.rss / 1024 / 1024

    if (usedMB > 1000) {
      return {
        status: 'degraded',
        message: `High memory usage: ${usedMB.toFixed(2)}MB`,
        timestamp: Date.now(),
        metadata: { memoryUsage: memUsage }
      }
    }

    return {
      status: 'healthy',
      message: `Memory usage normal: ${usedMB.toFixed(2)}MB`,
      timestamp: Date.now(),
      metadata: { memoryUsage: memUsage }
    }
  }
})
```

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": 1640995200000,
  "uptime": 3600,
  "checks": {
    "memory-usage": {
      "status": "healthy",
      "message": "Memory usage normal: 245.67MB",
      "duration": 2,
      "timestamp": 1640995200000,
      "metadata": {
        "memoryUsage": {
          "rss": 257654784,
          "heapTotal": 123456789,
          "heapUsed": 98765432
        }
      }
    }
  },
  "dependencies": {
    "postgres": {
      "status": "healthy",
      "message": "Database connection successful",
      "duration": 15,
      "timestamp": 1640995200000
    },
    "external-api": {
      "status": "degraded",
      "message": "External API returned 503",
      "duration": 3000,
      "timestamp": 1640995200000
    }
  },
  "summary": {
    "total": 3,
    "healthy": 2,
    "unhealthy": 0,
    "degraded": 1
  }
}
```

## Request Correlation

### Automatic Correlation

```typescript
import {
  initializeCorrelation,
  createCorrelationMiddleware,
  CorrelationHelpers
} from 'bun-router'

// Initialize correlation
initializeCorrelation({
  headerName: 'x-correlation-id',
  propagateHeaders: [
    'x-correlation-id',
    'x-request-id',
    'x-user-id',
    'x-session-id'
  ],
  enableLogging: true
})

// Add correlation middleware
router.use(createCorrelationMiddleware())

// Use in handlers
router.get('/api/users/:id', async (req) => {
  const correlationId = CorrelationHelpers.getId(req)
  const httpClient = CorrelationHelpers.getHttpClient(req)

  // Add metadata to correlation
  CorrelationHelpers.addMetadata(req, {
    userId: req.params.id,
    operation: 'get-user'
  })

  // HTTP client automatically propagates correlation headers
  const userProfile = await httpClient.get('http://profile-service/users/' + req.params.id)
  const userPrefs = await httpClient.get('http://prefs-service/users/' + req.params.id)

  return Response.json({
    profile: await userProfile.json(),
    preferences: await userPrefs.json()
  })
})
```

### Service Call Tracking

```typescript
// Automatic service call recording
router.get('/api/complex-operation', async (req) => {
  const httpClient = CorrelationHelpers.getHttpClient(req)

  // Each call is automatically tracked
  const step1 = await httpClient.post('http://service-a/process', { data: 'test' })
  const step2 = await httpClient.get('http://service-b/validate')
  const step3 = await httpClient.put('http://service-c/finalize', { result: 'ok' })

  return Response.json({ status: 'completed' })
})

// View correlation trace at /trace?id=correlation-id
```

### Correlation Trace Response

```json
{
  "context": {
    "correlationId": "abc123-def456-ghi789",
    "traceId": "abc123-def456-ghi789",
    "startTime": 1640995200000,
    "metadata": {
      "method": "GET",
      "url": "http://localhost:3000/api/complex-operation",
      "userId": "user123",
      "operation": "complex-operation"
    }
  },
  "serviceCalls": [
    {
      "serviceName": "service-a",
      "method": "POST",
      "url": "http://service-a/process",
      "startTime": 1640995201000,
      "endTime": 1640995201150,
      "duration": 150,
      "status": 200
    },
    {
      "serviceName": "service-b",
      "method": "GET",
      "url": "http://service-b/validate",
      "startTime": 1640995201200,
      "endTime": 1640995201280,
      "duration": 80,
      "status": 200
    }
  ],
  "children": []
}
```

## Integration Examples

### Complete Setup

```typescript
import {
  initializeObservability,
  ObservabilityIntegration
} from 'bun-router'

// Initialize with custom configuration
const observability = initializeObservability({
  enableTracing: true,
  enableMetrics: true,
  enableHealthChecks: true,
  enableCorrelation: true,

  tracing: {
    serviceName: 'my-api',
    environment: 'production',
    enableOTLPExporter: true,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    sampleRate: 0.1
  },

  metrics: {
    prefix: 'myapi',
    enableDefaultMetrics: true,
    collectInterval: 30000
  },

  healthChecks: {
    timeout: 5000,
    dependencies: [
      {
        name: 'database',
        type: 'database',
        critical: true
      },
      {
        name: 'redis',
        type: 'redis',
        critical: false
      }
    ]
  },

  correlation: {
    enableLogging: false,
    propagateHeaders: [
      'x-correlation-id',
      'x-request-id',
      'x-user-id'
    ]
  }
})

// Enhance router with observability
const { middleware, handlers } = ObservabilityIntegration.enhance(router, {
  // Configuration options
})

// Or manually add components
router.use(observability.createMiddleware())

const endpoints = observability.createRouteHandlers()
Object.entries(endpoints).forEach(([path, handler]) => {
  router.get(path, handler)
})
```

### Environment Configuration

```bash
# .env
SERVICE_NAME=my-api
ENVIRONMENT=production
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
OTEL_SAMPLE_RATE=0.1
JAEGER_ENDPOINT=http://jaeger:14268
METRICS_PREFIX=myapi
ENABLE_CORRELATION_LOGGING=false
```

```typescript
import { setupObservabilityFromEnv } from 'bun-router'

// Automatically configure from environment
const observability = setupObservabilityFromEnv()
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - SERVICE_NAME=my-api
      - ENVIRONMENT=production
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
      - OTEL_SAMPLE_RATE=0.1
    depends_on:
      - jaeger
      - prometheus

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "4317:4317"

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  template:
    spec:
      containers:
      - name: api
        image: my-api:latest
        env:
        - name: SERVICE_NAME
          value: "my-api"
        - name: ENVIRONMENT
          value: "production"
        - name: OTEL_EXPORTER_OTLP_ENDPOINT
          value: "http://jaeger-collector:4317"
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        startupProbe:
          httpGet:
            path: /health/startup
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          failureThreshold: 30
```

## Best Practices

### Performance Considerations

1. **Sampling**: Use appropriate sampling rates in production (10-20%)
2. **Metrics**: Avoid high-cardinality labels
3. **Health Checks**: Set reasonable timeouts and intervals
4. **Correlation**: Clean up old contexts regularly

### Security

1. **Headers**: Don't expose sensitive data in trace headers
2. **Logs**: Sanitize correlation logs in production
3. **Endpoints**: Secure observability endpoints appropriately

### Monitoring

1. **Alerts**: Set up alerts on health check failures
2. **Dashboards**: Create dashboards for key metrics
3. **Traces**: Use distributed tracing for debugging complex flows
4. **Correlation**: Track request flows across services

## API Reference

See the TypeScript definitions for complete API documentation. All interfaces and types are fully documented with JSDoc comments.

## Troubleshooting

### Common Issues

1. **Missing Traces**: Check sampling rate and exporter configuration
2. **High Memory Usage**: Reduce trace retention and clean up old contexts
3. **Health Check Timeouts**: Increase timeout values for slow dependencies
4. **Missing Correlation**: Ensure middleware is properly configured

### Debug Mode

```typescript
// Enable debug logging
const observability = initializeObservability({
  tracing: {
    enableConsoleExporter: true
  },
  correlation: {
    enableLogging: true,
    logLevel: 'debug'
  }
})
```
