# Performance Monitoring

The bun-router performance monitoring system provides comprehensive observability for your applications with metrics collection, distributed tracing, real-time alerting, and visual dashboards.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Components](#components)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

## Overview

The performance monitoring system consists of four main components:

1. **PerformanceMonitor** - Collects detailed metrics about requests, responses, and system resources
2. **RequestTracer** - Provides distributed tracing with span creation and context propagation
3. **PerformanceAlerting** - Rule-based alerting system with multiple notification channels
4. **PerformanceDashboard** - Web-based dashboard for real-time monitoring and historical analysis

## Quick Start

### Basic Setup

```typescript
import { Router } from 'bun-router'
import { 
  performanceMonitor, 
  requestTracer, 
  performanceDashboard,
  performanceAlerting 
} from 'bun-router/middleware'

const router = new Router()

// Add performance monitoring
router.use(performanceMonitor({
  enabled: true,
  sampleRate: 0.1, // Sample 10% of requests
  storage: {
    type: 'memory',
    maxEntries: 10000
  }
}))

// Add distributed tracing
router.use(requestTracer({
  enabled: true,
  sampleRate: 0.05, // Sample 5% of requests
  exporters: [
    { type: 'console' },
    { 
      type: 'jaeger',
      endpoint: 'http://jaeger:14268'
    }
  ]
}))

// Add performance dashboard
router.use(performanceDashboard({
  enabled: true,
  path: '/performance',
  authentication: {
    enabled: true,
    username: 'admin',
    password: process.env.DASHBOARD_PASSWORD
  }
}))

// Set up alerting
const alerting = performanceAlerting({
  enabled: true,
  channels: [
    {
      type: 'slack',
      enabled: true,
      config: {
        url: process.env.SLACK_WEBHOOK_URL,
        channel: '#alerts'
      }
    }
  ]
})

export default router
```

### Environment Variables

```bash
# Dashboard authentication
DASHBOARD_PASSWORD=your-secure-password

# Alerting
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
WEBHOOK_URL=https://your-webhook-endpoint.com/alerts

# Tracing
JAEGER_ENDPOINT=http://jaeger:14268
ZIPKIN_ENDPOINT=http://zipkin:9411
```

## Components

### PerformanceMonitor

Collects comprehensive metrics about your application's performance:

```typescript
import { PerformanceMonitor } from 'bun-router/middleware'

const monitor = new PerformanceMonitor({
  enabled: true,
  sampleRate: 0.1,
  storage: {
    type: 'file',
    filePath: './metrics.jsonl',
    maxEntries: 100000
  },
  profiling: {
    enabled: true,
    interval: 5000 // Profile every 5 seconds
  },
  alerting: {
    enabled: true,
    thresholds: {
      responseTime: 1000, // Alert if response time > 1s
      errorRate: 0.05,    // Alert if error rate > 5%
      memoryUsage: 512 * 1024 * 1024 // Alert if memory > 512MB
    }
  }
})

// Get current metrics
const metrics = monitor.getMetrics()

// Get aggregated metrics for the last hour
const aggregated = monitor.getAggregatedMetrics(3600000)

// Get system profiles
const profiles = monitor.getProfiles()
```

**Collected Metrics:**
- Response time (ms)
- Memory usage (bytes)
- CPU usage (percentage)
- Request count and rate
- Error rate and status code distribution
- Path and method distribution
- User agent analysis

### RequestTracer

Provides distributed tracing capabilities:

```typescript
import { RequestTracer } from 'bun-router/middleware'

const tracer = new RequestTracer({
  enabled: true,
  sampleRate: 0.1,
  includeHeaders: false,
  includeQueryParams: true,
  includeRequestBody: false,
  includeResponseBody: false,
  exporters: [
    {
      type: 'jaeger',
      endpoint: 'http://jaeger:14268',
      headers: {
        'Authorization': 'Bearer your-token'
      }
    },
    {
      type: 'custom',
      customExporter: async (spans) => {
        // Custom export logic
        console.log('Exporting spans:', spans.length)
      }
    }
  ],
  propagation: {
    enabled: true,
    headers: ['x-trace-id', 'x-span-id']
  }
})

// Create child spans in your handlers
router.get('/users/:id', async (req) => {
  const childSpanId = tracer.createChildSpan(req.spanId!, 'database-query')
  
  if (childSpanId) {
    tracer.addTag(childSpanId, 'db.table', 'users')
    tracer.addTag(childSpanId, 'user.id', req.params.id)
    
    try {
      const user = await getUserById(req.params.id)
      tracer.addLog(childSpanId, 'info', 'User found')
      tracer.finish(childSpanId, 'ok')
      
      return Response.json(user)
    } catch (error) {
      tracer.addLog(childSpanId, 'error', 'Database error', { error: error.message })
      tracer.finish(childSpanId, 'error', error.message)
      throw error
    }
  }
})
```

**Supported Exporters:**
- Console (development)
- Jaeger (production tracing)
- Zipkin (alternative tracing)
- Custom exporters

### PerformanceAlerting

Rule-based alerting system:

```typescript
import { PerformanceAlerting } from 'bun-router/middleware'

const alerting = new PerformanceAlerting({
  enabled: true,
  rules: [
    {
      id: 'high-response-time',
      name: 'High Response Time',
      enabled: true,
      metric: 'responseTime',
      condition: 'gt',
      threshold: 2000, // 2 seconds
      duration: 60000, // Evaluate over 1 minute
      severity: 'warning',
      cooldown: 300000 // 5 minute cooldown
    },
    {
      id: 'high-error-rate',
      name: 'High Error Rate',
      enabled: true,
      metric: 'errorRate',
      condition: 'gt',
      threshold: 0.1, // 10%
      duration: 120000, // Evaluate over 2 minutes
      severity: 'critical'
    },
    {
      id: 'custom-rule',
      name: 'Custom Business Logic',
      enabled: true,
      metric: 'custom',
      condition: 'gt',
      threshold: 0,
      severity: 'warning',
      customEvaluator: (metrics) => {
        // Custom logic: alert if too many 404s
        const notFoundCount = metrics.filter(m => m.statusCode === 404).length
        return notFoundCount > 10
      }
    }
  ],
  channels: [
    {
      type: 'slack',
      enabled: true,
      config: {
        url: process.env.SLACK_WEBHOOK_URL,
        channel: '#alerts'
      },
      filters: {
        severities: ['warning', 'critical'],
        rules: ['high-response-time', 'high-error-rate']
      }
    },
    {
      type: 'webhook',
      enabled: true,
      config: {
        url: 'https://your-webhook.com/alerts',
        token: 'your-webhook-token'
      }
    },
    {
      type: 'email',
      enabled: true,
      config: {
        email: 'alerts@yourcompany.com'
      },
      filters: {
        severities: ['critical']
      }
    }
  ]
})

// Manage rules dynamically
alerting.addRule({
  id: 'memory-usage',
  name: 'High Memory Usage',
  enabled: true,
  metric: 'memoryUsage',
  condition: 'gt',
  threshold: 1024 * 1024 * 1024, // 1GB
  severity: 'warning'
})

// Update existing rules
alerting.updateRule('high-response-time', {
  threshold: 1500,
  severity: 'critical'
})

// Get active alerts
const activeAlerts = alerting.getActiveAlerts()

// Resolve alerts manually
alerting.resolveAlert('alert-id-123')
```

### PerformanceDashboard

Web-based monitoring dashboard:

```typescript
import { PerformanceDashboard } from 'bun-router/middleware'

const dashboard = new PerformanceDashboard({
  enabled: true,
  path: '/performance',
  title: 'My App Performance',
  refreshInterval: 5000, // 5 seconds
  authentication: {
    enabled: true,
    username: 'admin',
    password: process.env.DASHBOARD_PASSWORD,
    apiKey: process.env.DASHBOARD_API_KEY
  },
  features: {
    realTimeMetrics: true,
    historicalCharts: true,
    alertsPanel: true,
    tracingView: true,
    systemMetrics: true
  }
})

// Add custom alerts to dashboard
dashboard.addAlert('warning', 'High response time detected')
dashboard.addAlert('critical', 'Service is experiencing errors')

// Update metrics history (usually done automatically)
dashboard.updateMetricsHistory({
  responseTime: 150,
  memoryUsage: 256 * 1024 * 1024,
  requestCount: 1,
  errorCount: 0
})
```

## Configuration

### Global Configuration

Add performance monitoring configuration to your router config:

```typescript
// config.ts
export const config = {
  server: {
    performance: {
      monitoring: {
        enabled: true,
        sampleRate: 0.1,
        storage: {
          type: 'memory',
          maxEntries: 10000
        },
        alerting: {
          enabled: true,
          thresholds: {
            responseTime: 1000,
            errorRate: 0.05,
            memoryUsage: 512 * 1024 * 1024
          }
        },
        profiling: {
          enabled: true,
          interval: 5000
        },
        tracing: {
          enabled: true,
          sampleRate: 0.05
        }
      }
    }
  }
}
```

### Environment-Specific Configuration

```typescript
// Production configuration
const productionConfig = {
  monitoring: {
    enabled: true,
    sampleRate: 0.01, // Lower sampling in production
    storage: {
      type: 'file',
      filePath: '/var/log/app/metrics.jsonl'
    }
  },
  tracing: {
    enabled: true,
    sampleRate: 0.001, // Very low sampling for tracing
    exporters: [
      {
        type: 'jaeger',
        endpoint: process.env.JAEGER_ENDPOINT
      }
    ]
  }
}

// Development configuration
const developmentConfig = {
  monitoring: {
    enabled: true,
    sampleRate: 1.0, // Sample everything in development
    storage: { type: 'memory' }
  },
  tracing: {
    enabled: true,
    sampleRate: 0.1,
    exporters: [{ type: 'console' }]
  }
}
```

## Usage Examples

### Basic Monitoring Setup

```typescript
import { Router } from 'bun-router'
import { performanceMonitor } from 'bun-router/middleware'

const router = new Router()

router.use(performanceMonitor({
  enabled: process.env.NODE_ENV === 'production',
  sampleRate: 0.1
}))

router.get('/api/users', async () => {
  const users = await db.users.findMany()
  return Response.json(users)
})

export default router
```

### Advanced Tracing

```typescript
import { Router } from 'bun-router'
import { requestTracer } from 'bun-router/middleware'

const router = new Router()

const tracer = requestTracer({
  enabled: true,
  sampleRate: 0.1,
  includeHeaders: true,
  includeQueryParams: true,
  exporters: [
    {
      type: 'jaeger',
      endpoint: 'http://localhost:14268'
    }
  ]
})

router.use(tracer)

router.get('/api/users/:id', async (req) => {
  // Create a span for database operation
  const dbSpanId = tracer.createChildSpan(req.spanId!, 'database-query')
  
  if (dbSpanId) {
    tracer.addTag(dbSpanId, 'db.operation', 'select')
    tracer.addTag(dbSpanId, 'db.table', 'users')
    
    try {
      const user = await db.users.findUnique({
        where: { id: req.params.id }
      })
      
      tracer.addLog(dbSpanId, 'info', 'User query completed')
      tracer.finish(dbSpanId, 'ok')
      
      if (!user) {
        return new Response('Not Found', { status: 404 })
      }
      
      return Response.json(user)
    } catch (error) {
      tracer.addLog(dbSpanId, 'error', 'Database error', { 
        error: error.message 
      })
      tracer.finish(dbSpanId, 'error', error.message)
      throw error
    }
  }
})
```

### Custom Alerting Rules

```typescript
import { PerformanceAlerting } from 'bun-router/middleware'

const alerting = new PerformanceAlerting({
  enabled: true,
  rules: [
    // Business-specific rule
    {
      id: 'payment-errors',
      name: 'Payment Processing Errors',
      enabled: true,
      metric: 'custom',
      condition: 'gt',
      threshold: 0,
      severity: 'critical',
      customEvaluator: (metrics) => {
        const paymentErrors = metrics.filter(m => 
          m.path.includes('/payment') && m.statusCode >= 400
        ).length
        return paymentErrors > 5 // Alert if more than 5 payment errors
      }
    },
    // Geographic performance rule
    {
      id: 'regional-latency',
      name: 'High Regional Latency',
      enabled: true,
      metric: 'custom',
      condition: 'gt',
      threshold: 0,
      severity: 'warning',
      customEvaluator: (metrics) => {
        const regionalMetrics = metrics.filter(m => 
          m.userAgent?.includes('Region=US-WEST')
        )
        if (regionalMetrics.length === 0) return false
        
        const avgLatency = regionalMetrics.reduce((sum, m) => 
          sum + m.responseTime, 0
        ) / regionalMetrics.length
        
        return avgLatency > 2000 // Alert if US-WEST avg > 2s
      }
    }
  ],
  channels: [
    {
      type: 'slack',
      enabled: true,
      config: {
        url: process.env.SLACK_WEBHOOK_URL,
        channel: '#payments'
      },
      filters: {
        rules: ['payment-errors']
      }
    }
  ]
})
```

### Dashboard with Custom Authentication

```typescript
import { PerformanceDashboard } from 'bun-router/middleware'

const dashboard = new PerformanceDashboard({
  enabled: true,
  path: '/admin/performance',
  title: 'Production Performance Dashboard',
  authentication: {
    enabled: true,
    apiKey: process.env.DASHBOARD_API_KEY
  },
  features: {
    realTimeMetrics: true,
    historicalCharts: true,
    alertsPanel: true,
    tracingView: process.env.NODE_ENV === 'development',
    systemMetrics: true
  }
})

// Access dashboard at: /admin/performance
// With header: X-API-Key: your-api-key
```

## Best Practices

### Sampling Strategy

```typescript
// Production: Low sampling rates to reduce overhead
const productionSampling = {
  monitoring: 0.01,  // 1% of requests
  tracing: 0.001     // 0.1% of requests
}

// Staging: Medium sampling for testing
const stagingSampling = {
  monitoring: 0.1,   // 10% of requests
  tracing: 0.01      // 1% of requests
}

// Development: High sampling for debugging
const developmentSampling = {
  monitoring: 1.0,   // 100% of requests
  tracing: 0.1       // 10% of requests
}
```

### Storage Configuration

```typescript
// Memory storage (development)
const memoryStorage = {
  type: 'memory',
  maxEntries: 1000
}

// File storage (production)
const fileStorage = {
  type: 'file',
  filePath: '/var/log/app/metrics.jsonl',
  maxEntries: 100000
}

// Custom storage (advanced)
const customStorage = {
  type: 'custom',
  customHandler: async (metrics) => {
    // Send to external service
    await fetch('https://metrics-api.com/ingest', {
      method: 'POST',
      body: JSON.stringify(metrics)
    })
  }
}
```

### Alert Rule Design

```typescript
// Good: Specific, actionable alerts
const goodRules = [
  {
    id: 'api-response-time',
    name: 'API Response Time',
    metric: 'responseTime',
    condition: 'gt',
    threshold: 2000,
    duration: 300000, // 5 minutes
    severity: 'warning'
  }
]

// Avoid: Too sensitive, noisy alerts
const avoidRules = [
  {
    id: 'any-error',
    name: 'Any Error',
    metric: 'errorRate',
    condition: 'gt',
    threshold: 0, // Will alert on any error
    duration: 1000, // Too short
    severity: 'critical'
  }
]
```

### Performance Optimization

```typescript
// Optimize middleware order
router.use(performanceMonitor({ sampleRate: 0.01 })) // First
router.use(requestTracer({ sampleRate: 0.001 }))     // Second
router.use(otherMiddleware())                         // Other middleware
router.use(performanceDashboard())                    // Last
```

## Troubleshooting

### Common Issues

**High Memory Usage**
```typescript
// Reduce sampling rates
const config = {
  monitoring: { sampleRate: 0.001 },
  tracing: { sampleRate: 0.0001 }
}

// Use file storage instead of memory
const storage = {
  type: 'file',
  filePath: './metrics.jsonl',
  maxEntries: 10000
}
```

**Missing Traces**
```typescript
// Check sampling rate
const tracer = requestTracer({
  sampleRate: 0.1, // Increase if too low
  enabled: true    // Ensure it's enabled
})

// Verify exporter configuration
const exporters = [
  {
    type: 'jaeger',
    endpoint: 'http://jaeger:14268' // Check endpoint
  }
]
```

**Dashboard Not Loading**
```typescript
// Check authentication
const dashboard = performanceDashboard({
  authentication: {
    enabled: false // Disable for testing
  }
})

// Verify path configuration
const dashboard = performanceDashboard({
  path: '/performance' // Check URL path
})
```

### Debug Mode

```typescript
// Enable debug logging
const monitor = new PerformanceMonitor({
  enabled: true,
  debug: true, // Add debug flag
  storage: {
    type: 'custom',
    customHandler: async (metrics) => {
      console.log('Storing metrics:', metrics.length)
    }
  }
})
```

## API Reference

### PerformanceMonitor

```typescript
class PerformanceMonitor {
  constructor(options: PerformanceOptions)
  
  // Middleware handler
  handle(req: EnhancedRequest, next: NextFunction): Promise<Response>
  
  // Get raw metrics
  getMetrics(): PerformanceMetrics[]
  
  // Get aggregated metrics for time window
  getAggregatedMetrics(timeWindow: number): AggregatedMetrics
  
  // Get system profiles
  getProfiles(): SystemProfile[]
  
  // Clear stored metrics
  clearMetrics(): void
}
```

### RequestTracer

```typescript
class RequestTracer {
  constructor(options: TracingOptions)
  
  // Middleware handler
  handle(req: EnhancedRequest, next: NextFunction): Promise<Response>
  
  // Create child span
  createChildSpan(parentSpanId: string, operationName: string): string | null
  
  // Add tags to span
  addTag(spanId: string, key: string, value: any): void
  
  // Add logs to span
  addLog(spanId: string, level: string, message: string, fields?: Record<string, any>): void
  
  // Finish span
  finish(spanId: string, status?: string, error?: string): void
  
  // Get active spans
  getActiveSpans(): TraceSpan[]
  
  // Flush pending spans
  flush(): Promise<void>
}
```

### PerformanceAlerting

```typescript
class PerformanceAlerting {
  constructor(options: AlertingOptions)
  
  // Add metrics for evaluation
  addMetrics(metrics: PerformanceMetrics): void
  
  // Manage rules
  addRule(rule: AlertRule): void
  updateRule(ruleId: string, updates: Partial<AlertRule>): void
  removeRule(ruleId: string): void
  
  // Manage channels
  addChannel(channel: AlertChannel): void
  removeChannel(index: number): void
  
  // Get alerts
  getActiveAlerts(): AlertNotification[]
  getAllNotifications(): AlertNotification[]
  
  // Resolve alerts
  resolveAlert(alertId: string): void
}
```

### PerformanceDashboard

```typescript
class PerformanceDashboard {
  constructor(options: DashboardOptions)
  
  // Middleware handler
  handle(req: EnhancedRequest, next: NextFunction): Promise<Response>
  
  // Manage alerts
  addAlert(type: 'warning' | 'critical', message: string): void
  resolveAlert(id: string): void
  
  // Update metrics history
  updateMetricsHistory(data: MetricsHistoryData): void
}
```

For more detailed API documentation, see the TypeScript definitions in the source code.
