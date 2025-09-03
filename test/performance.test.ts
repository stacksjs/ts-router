import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Router } from '../packages/bun-router/src'
import {
  PerformanceAlerting,
  performanceAlerting,
  PerformanceDashboard,
  performanceDashboard,
  PerformanceMonitor,
  performanceMonitor,
  RequestTracer,
  requestTracer,
} from '../packages/bun-router/src/middleware'

describe('Performance Monitoring System', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  afterEach(() => {
    // Cleanup any running intervals or timers
  })

  describe('PerformanceMonitor', () => {
    test('should collect basic metrics', async () => {
      const monitor = new PerformanceMonitor({
        enabled: true,
        sampleRate: 1.0,
        storage: { type: 'memory', maxEntries: 100 },
      })

      router.use(async (req, next) => monitor.handle(req, next))
      router.get('/test', () => new Response('OK'))

      const response = await router.handle(new Request('http://localhost/test'))
      expect(response.status).toBe(200)

      const metrics = monitor.getMetrics()
      expect(metrics.length).toBe(1)
      expect(metrics[0]).toHaveProperty('responseTime')
      expect(metrics[0]).toHaveProperty('memoryUsage')
      expect(metrics[0]).toHaveProperty('statusCode', 200)
      expect(metrics[0]).toHaveProperty('method', 'GET')
      expect(metrics[0]).toHaveProperty('path', '/test')
    })

    test('should respect sampling rate', async () => {
      const monitor = new PerformanceMonitor({
        enabled: true,
        sampleRate: 0.0, // Never sample
        storage: { type: 'memory', maxEntries: 100 },
      })

      router.use(async (req, next) => monitor.handle(req, next))
      router.get('/test', () => new Response('OK'))

      await router.handle(new Request('http://localhost/test'))

      const metrics = monitor.getMetrics()
      expect(metrics.length).toBe(0)
    })

    test('should aggregate metrics correctly', async () => {
      const monitor = new PerformanceMonitor({
        enabled: true,
        sampleRate: 1.0,
        storage: { type: 'memory', maxEntries: 100 },
      })

      router.use(async (req, next) => monitor.handle(req, next))
      router.get('/test', () => new Response('OK'))
      router.get('/error', () => new Response('Error', { status: 500 }))

      // Make multiple requests
      await router.handle(new Request('http://localhost/test'))
      await router.handle(new Request('http://localhost/test'))
      await router.handle(new Request('http://localhost/error'))

      const aggregated = monitor.getAggregatedMetrics(60000) // Last minute
      expect(aggregated.totalRequests).toBe(3)
      expect(aggregated.errorRate).toBeCloseTo(1 / 3, 2)
      expect(aggregated.statusCodeDistribution[200]).toBe(2)
      expect(aggregated.statusCodeDistribution[500]).toBe(1)
      expect(aggregated.pathDistribution['/test']).toBe(2)
      expect(aggregated.pathDistribution['/error']).toBe(1)
    })

    test('should handle profiling', async () => {
      const monitor = new PerformanceMonitor({
        enabled: true,
        sampleRate: 1.0,
        profiling: {
          enabled: true,
          interval: 100,
        },
      })

      router.use(async (req, next) => monitor.handle(req, next))
      router.get('/test', () => new Response('OK'))

      await router.handle(new Request('http://localhost/test'))

      // Wait for profiling interval
      await new Promise(resolve => setTimeout(resolve, 150))

      const profiles = monitor.getProfiles()
      expect(profiles.length).toBeGreaterThan(0)
      expect(profiles[0]).toHaveProperty('timestamp')
      expect(profiles[0]).toHaveProperty('memoryUsage')
    })

    test('should trigger alerts on thresholds', async () => {
      let alertTriggered = false
      let alertData: any = null

      const monitor = new PerformanceMonitor({
        enabled: true,
        sampleRate: 1.0,
        alerting: {
          enabled: true,
          thresholds: {
            responseTime: 1, // Very low threshold to trigger alert
            errorRate: 0.5,
            memoryUsage: 1000000000, // High threshold
          },
          webhookUrl: 'http://test-webhook.com',
          customHandler: async (alert) => {
            alertTriggered = true
            alertData = alert
          },
        },
      })

      router.use(async (req, next) => monitor.handle(req, next))
      router.get('/slow', async () => {
        await new Promise(resolve => setTimeout(resolve, 10)) // Ensure it takes some time
        return new Response('OK')
      })

      await router.handle(new Request('http://localhost/slow'))

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(alertTriggered).toBe(true)
      expect(alertData).toHaveProperty('type', 'responseTime')
      expect(alertData).toHaveProperty('severity')
    })
  })

  describe('RequestTracer', () => {
    test('should create and export spans', async () => {
      const spans: any[] = []
      const tracer = new RequestTracer({
        enabled: true,
        sampleRate: 1.0,
        exporters: [{
          type: 'custom',
          customExporter: async (exportedSpans) => {
            spans.push(...exportedSpans)
          },
        }],
      })

      router.use(async (req, next) => tracer.handle(req, next))
      router.get('/test', () => new Response('OK'))

      const response = await router.handle(new Request('http://localhost/test'))
      expect(response.status).toBe(200)

      // Wait for export
      await new Promise(resolve => setTimeout(resolve, 100))
      await tracer.flush()

      expect(spans.length).toBe(1)
      expect(spans[0]).toHaveProperty('traceId')
      expect(spans[0]).toHaveProperty('spanId')
      expect(spans[0]).toHaveProperty('operationName', 'GET /test')
      expect(spans[0]).toHaveProperty('status', 'ok')
      expect(spans[0]).toHaveProperty('duration')
      expect(spans[0].tags).toHaveProperty('http.method', 'GET')
      expect(spans[0].tags).toHaveProperty('http.path', '/test')
      expect(spans[0].tags).toHaveProperty('http.status_code', 200)
    })

    test('should propagate trace context', async () => {
      const tracer = new RequestTracer({
        enabled: true,
        sampleRate: 1.0,
        propagation: {
          enabled: true,
          headers: ['x-trace-id'],
        },
      })

      router.use(async (req, next) => tracer.handle(req, next))
      router.get('/test', () => new Response('OK'))

      const request = new Request('http://localhost/test', {
        headers: { 'x-trace-id': 'existing-trace-123' },
      })

      const response = await router.handle(request)
      expect(response.headers.get('x-trace-id')).toBe('existing-trace-123')
    })

    test('should create child spans', async () => {
      const tracer = new RequestTracer({
        enabled: true,
        sampleRate: 1.0,
      })

      router.use(async (req, next) => tracer.handle(req, next))
      router.get('/test', (req) => {
        // Create a child span during request processing
        const childSpanId = tracer.createChildSpan(req.spanId!, 'database-query')
        if (childSpanId) {
          tracer.addTag(childSpanId, 'db.query', 'SELECT * FROM users')
          tracer.addLog(childSpanId, 'info', 'Query executed')
          tracer.finish(childSpanId, 'ok')
        }
        return new Response('OK')
      })

      const response = await router.handle(new Request('http://localhost/test'))
      expect(response.status).toBe(200)

      const activeSpans = tracer.getActiveSpans()
      // Main span should be finished, child span should be finished too
      expect(activeSpans.length).toBe(0)
    })

    test('should handle errors in spans', async () => {
      const spans: any[] = []
      const tracer = new RequestTracer({
        enabled: true,
        sampleRate: 1.0,
        exporters: [{
          type: 'custom',
          customExporter: async (exportedSpans) => {
            spans.push(...exportedSpans)
          },
        }],
      })

      router.use(async (req, next) => tracer.handle(req, next))
      router.get('/error', () => {
        throw new Error('Test error')
      })

      const response = await router.handle(new Request('http://localhost/error'))
      expect(response.status).toBe(500)

      await tracer.flush()

      expect(spans.length).toBe(1)
      expect(spans[0]).toHaveProperty('status', 'error')
      expect(spans[0]).toHaveProperty('error', 'Test error')
      expect(spans[0].tags).toHaveProperty('error', true)
    })
  })

  describe('PerformanceDashboard', () => {
    test('should serve dashboard HTML', async () => {
      const dashboard = new PerformanceDashboard({
        enabled: true,
        path: '/performance',
        authentication: { enabled: false },
      })

      router.use(async (req, next) => dashboard.handle(req, next))
      router.get('/test', () => new Response('OK'))

      const response = await router.handle(new Request('http://localhost/performance'))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/html')

      const html = await response.text()
      expect(html).toContain('Performance Dashboard')
      expect(html).toContain('Real-time Metrics')
    })

    test('should serve dashboard API data', async () => {
      const dashboard = new PerformanceDashboard({
        enabled: true,
        path: '/performance',
        authentication: { enabled: false },
      })

      router.use(async (req, next) => dashboard.handle(req, next))

      const response = await router.handle(new Request('http://localhost/performance/api/data'))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/json')

      const data = await response.json()
      expect(data).toHaveProperty('metrics')
      expect(data).toHaveProperty('alerts')
      expect(data).toHaveProperty('traces')
      expect(data).toHaveProperty('system')
      expect(data.system).toHaveProperty('uptime')
      expect(data.system).toHaveProperty('nodeVersion')
    })

    test('should require authentication when enabled', async () => {
      const dashboard = new PerformanceDashboard({
        enabled: true,
        path: '/performance',
        authentication: {
          enabled: true,
          username: 'admin',
          password: 'secret',
        },
      })

      router.use(async (req, next) => dashboard.handle(req, next))

      // Request without auth
      const response1 = await router.handle(new Request('http://localhost/performance'))
      expect(response1.status).toBe(401)

      // Request with correct auth
      const auth = btoa('admin:secret')
      const response2 = await router.handle(new Request('http://localhost/performance', {
        headers: { Authorization: `Basic ${auth}` },
      }))
      expect(response2.status).toBe(200)

      // Request with API key
      const response3 = await router.handle(new Request('http://localhost/performance', {
        headers: { 'X-API-Key': 'test-key' },
      }))
      expect(response3.status).toBe(401) // Wrong API key
    })

    test('should add and resolve alerts', async () => {
      const dashboard = new PerformanceDashboard({
        enabled: true,
        path: '/performance',
      })

      dashboard.addAlert('warning', 'Test warning message')
      dashboard.addAlert('critical', 'Test critical message')

      const response = await router.handle(new Request('http://localhost/performance/api/data'))
      const data = await response.json()

      expect(data.alerts.length).toBe(2)
      expect(data.alerts[0]).toHaveProperty('type', 'warning')
      expect(data.alerts[0]).toHaveProperty('message', 'Test warning message')
      expect(data.alerts[0]).toHaveProperty('resolved', false)

      // Resolve first alert
      dashboard.resolveAlert(data.alerts[0].id)

      const response2 = await router.handle(new Request('http://localhost/performance/api/data'))
      const data2 = await response2.json()

      expect(data2.alerts[0]).toHaveProperty('resolved', true)
    })
  })

  describe('PerformanceAlerting', () => {
    test('should evaluate rules and trigger alerts', async () => {
      const notifications: any[] = []

      const alerting = new PerformanceAlerting({
        enabled: true,
        rules: [{
          id: 'test-rule',
          name: 'Test Rule',
          enabled: true,
          metric: 'responseTime',
          condition: 'gt',
          threshold: 1, // 1ms threshold
          duration: 1000,
          severity: 'warning',
        }],
        channels: [{
          type: 'custom',
          enabled: true,
          config: {
            customHandler: async (notification) => {
              notifications.push(notification)
            },
          },
        }],
      })

      // Add metrics that should trigger the rule
      alerting.addMetrics({
        requestId: 'test-1',
        timestamp: Date.now(),
        responseTime: 10, // Above threshold
        memoryUsage: 1000000,
        statusCode: 200,
        method: 'GET',
        path: '/test',
        userAgent: 'test',
      })

      // Wait for rule evaluation
      await new Promise(resolve => setTimeout(resolve, 1100))

      expect(notifications.length).toBe(1)
      expect(notifications[0]).toHaveProperty('ruleId', 'test-rule')
      expect(notifications[0]).toHaveProperty('severity', 'warning')
      expect(notifications[0]).toHaveProperty('resolved', false)
    })

    test('should respect cooldown periods', async () => {
      const notifications: any[] = []

      const alerting = new PerformanceAlerting({
        enabled: true,
        defaultCooldown: 5000, // 5 second cooldown
        rules: [{
          id: 'cooldown-rule',
          name: 'Cooldown Test',
          enabled: true,
          metric: 'responseTime',
          condition: 'gt',
          threshold: 1,
          duration: 100,
          severity: 'warning',
        }],
        channels: [{
          type: 'custom',
          enabled: true,
          config: {
            customHandler: async (notification) => {
              notifications.push(notification)
            },
          },
        }],
      })

      // Add metrics twice quickly
      alerting.addMetrics({
        requestId: 'test-1',
        timestamp: Date.now(),
        responseTime: 10,
        memoryUsage: 1000000,
        statusCode: 200,
        method: 'GET',
        path: '/test',
        userAgent: 'test',
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      alerting.addMetrics({
        requestId: 'test-2',
        timestamp: Date.now(),
        responseTime: 10,
        memoryUsage: 1000000,
        statusCode: 200,
        method: 'GET',
        path: '/test',
        userAgent: 'test',
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      // Should only trigger once due to cooldown
      expect(notifications.length).toBeLessThanOrEqual(1)
    })

    test('should handle custom rule evaluators', async () => {
      const notifications: any[] = []

      const alerting = new PerformanceAlerting({
        enabled: true,
        rules: [{
          id: 'custom-rule',
          name: 'Custom Rule',
          enabled: true,
          metric: 'custom',
          condition: 'gt',
          threshold: 0,
          duration: 100,
          severity: 'critical',
          customEvaluator: (metrics) => {
            // Trigger if we have more than 2 error responses
            const errorCount = metrics.filter(m => m.statusCode >= 400).length
            return errorCount > 2
          },
        }],
        channels: [{
          type: 'custom',
          enabled: true,
          config: {
            customHandler: async (notification) => {
              notifications.push(notification)
            },
          },
        }],
      })

      // Add metrics with errors
      for (let i = 0; i < 4; i++) {
        alerting.addMetrics({
          requestId: `test-${i}`,
          timestamp: Date.now(),
          responseTime: 5,
          memoryUsage: 1000000,
          statusCode: 500, // Error status
          method: 'GET',
          path: '/test',
          userAgent: 'test',
        })
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(notifications.length).toBe(1)
      expect(notifications[0]).toHaveProperty('severity', 'critical')
    })

    test('should manage rules dynamically', async () => {
      const alerting = new PerformanceAlerting({
        enabled: true,
        rules: [],
      })

      // Add a rule
      alerting.addRule({
        id: 'dynamic-rule',
        name: 'Dynamic Rule',
        enabled: true,
        metric: 'responseTime',
        condition: 'gt',
        threshold: 100,
        severity: 'warning',
      })

      // Update the rule
      alerting.updateRule('dynamic-rule', {
        threshold: 50,
        severity: 'critical',
      })

      // Remove the rule
      alerting.removeRule('dynamic-rule')

      // Rule should be gone
      const activeAlerts = alerting.getActiveAlerts()
      expect(activeAlerts.length).toBe(0)
    })
  })

  describe('Integration Tests', () => {
    test('should work together as a complete monitoring stack', async () => {
      const alerts: any[] = []

      // Set up complete monitoring stack
      const monitor = new PerformanceMonitor({
        enabled: true,
        sampleRate: 1.0,
        storage: { type: 'memory', maxEntries: 1000 },
      })

      const tracer = new RequestTracer({
        enabled: true,
        sampleRate: 1.0,
        exporters: [{ type: 'console' }],
      })

      const alerting = new PerformanceAlerting({
        enabled: true,
        rules: [{
          id: 'integration-test',
          name: 'Integration Test Rule',
          enabled: true,
          metric: 'responseTime',
          condition: 'gt',
          threshold: 0, // Always trigger
          duration: 100,
          severity: 'info',
        }],
        channels: [{
          type: 'custom',
          enabled: true,
          config: {
            customHandler: async (notification) => {
              alerts.push(notification)
            },
          },
        }],
      })

      const dashboard = new PerformanceDashboard({
        enabled: true,
        path: '/metrics',
        authentication: { enabled: false },
      })

      // Set up router with all middleware
      router.use(async (req, next) => monitor.handle(req, next))
      router.use(async (req, next) => tracer.handle(req, next))
      router.use(async (req, next) => dashboard.handle(req, next))

      router.get('/api/users', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return new Response(JSON.stringify([{ id: 1, name: 'John' }]), {
          headers: { 'Content-Type': 'application/json' },
        })
      })

      // Make requests
      const response1 = await router.handle(new Request('http://localhost/api/users'))
      expect(response1.status).toBe(200)

      const response2 = await router.handle(new Request('http://localhost/api/users'))
      expect(response2.status).toBe(200)

      // Check metrics were collected
      const metrics = monitor.getMetrics()
      expect(metrics.length).toBe(2)

      // Feed metrics to alerting system
      for (const metric of metrics) {
        alerting.addMetrics(metric)
      }

      // Check dashboard data
      const dashboardResponse = await router.handle(new Request('http://localhost/metrics/api/data'))
      expect(dashboardResponse.status).toBe(200)

      const dashboardData = await dashboardResponse.json()
      expect(dashboardData.metrics.current.totalRequests).toBeGreaterThan(0)

      // Wait for alerts
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(alerts.length).toBeGreaterThan(0)
    })
  })

  describe('Factory Functions', () => {
    test('should create middleware instances via factory functions', () => {
      const monitor = performanceMonitor({ enabled: true })
      const tracer = requestTracer({ enabled: true })
      const dashboard = performanceDashboard({ enabled: true })
      const alerting = performanceAlerting({ enabled: true })

      expect(typeof monitor).toBe('function')
      expect(typeof tracer).toBe('function')
      expect(typeof dashboard).toBe('function')
      expect(alerting).toBeInstanceOf(PerformanceAlerting)
    })
  })
})
