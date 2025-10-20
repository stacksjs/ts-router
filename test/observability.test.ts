/**
 * Observability & Monitoring - Comprehensive Test Suite
 */

import type { EnhancedRequest } from '../packages/bun-router/src/types'
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  // Correlation
  CorrelationManager,
  // Metrics
  Counter,
  createCorrelationMiddleware,
  createMetricsHandler,

  createMetricsMiddleware,
  createTracingMiddleware,
  DependencyChecks,
  // Tracing
  DistributedTracer,
  Gauge,
  getCorrelationManager,
  getHealthManager,
  getMetricsRegistry,
  getTracer,

  // Health Checks
  HealthCheckManager,
  HealthEndpoints,
  Histogram,
  initializeCorrelation,
  initializeHealthChecks,

  initializeMetrics,
  initializeObservability,
  initializeTracer,
  MetricsRegistry,
  ObservabilityIntegration,

  // Integration
  ObservabilityManager,
  ObservabilityPresets,
  ObservabilityUtils,
  Summary,
} from '../packages/bun-router/src/observability'

// Mock request helper
function createMockRequest(
  method = 'GET',
  url = 'http://localhost:3000/test',
  headers: Record<string, string> = {},
): EnhancedRequest {
  const headersObj = new Headers(headers)
  return {
    method,
    url,
    headers: headersObj,
    body: null,
    bodyUsed: false,
    cache: 'default',
    credentials: 'same-origin',
    destination: '',
    integrity: '',
    keepalive: false,
    mode: 'cors',
    redirect: 'follow',
    referrer: '',
    referrerPolicy: '',
    signal: new AbortController().signal,
    clone: () => createMockRequest(method, url, headers),
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    json: async () => ({}),
    text: async () => '',
  } as EnhancedRequest
}

describe('Observability & Monitoring', () => {
  beforeEach(() => {
    // Reset global state before each test
    ;(globalThis as any).globalTracer = null
    ;(globalThis as any).globalRegistry = null
    ;(globalThis as any).globalHealthManager = null
    ;(globalThis as any).globalCorrelationManager = null
    ;(globalThis as any).globalObservabilityManager = null
  })

  describe('Distributed Tracing', () => {
    test('should create and manage traces', () => {
      const tracer = new DistributedTracer({
        serviceName: 'test-service',
        environment: 'test',
      })

      const span = tracer.startTrace('test-operation')

      expect(span.traceId).toBeDefined()
      expect(span.spanId).toBeDefined()
      expect(span.operationName).toBe('test-operation')
      expect(span.tags['service.name']).toBe('test-service')
      expect(span.tags.environment).toBe('test')

      tracer.finishSpan(span)
      expect(span.endTime).toBeDefined()
      expect(span.duration).toBeGreaterThan(0)
    })

    test('should create child spans', () => {
      const tracer = new DistributedTracer({
        serviceName: 'test-service',
      })

      const parentSpan = tracer.startTrace('parent-operation')
      const childSpan = tracer.startChildSpan('child-operation', parentSpan)

      expect(childSpan.traceId).toBe(parentSpan.traceId)
      expect(childSpan.parentSpanId).toBe(parentSpan.spanId)
      expect(childSpan.operationName).toBe('child-operation')

      tracer.finishSpan(childSpan)
      tracer.finishSpan(parentSpan)
    })

    test('should extract trace context from headers', () => {
      const tracer = new DistributedTracer({
        serviceName: 'test-service',
      })

      const headers = new Headers({
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      })

      const context = tracer.extractTraceContext(headers)

      expect(context).toBeDefined()
      expect(context?.traceId).toBe('0af7651916cd43dd8448eb211c80319c')
      expect(context?.spanId).toBe('b7ad6b7169203331')
      expect(context?.flags).toBe(1)
    })

    test('should inject trace context into headers', () => {
      const tracer = new DistributedTracer({
        serviceName: 'test-service',
      })

      const span = tracer.startTrace('test-operation')
      const headers: Record<string, string> = {}

      tracer.injectTraceContext(span, headers)

      expect(headers.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/)
      expect(headers['x-correlation-id']).toBe(span.traceId)
      expect(headers['x-span-id']).toBe(span.spanId)

      tracer.finishSpan(span)
    })

    test('should initialize global tracer', () => {
      const tracer = initializeTracer({
        serviceName: 'global-test-service',
      })

      expect(tracer).toBeInstanceOf(DistributedTracer)
      expect(getTracer()).toBe(tracer)
    })

    test('should create tracing middleware', async () => {
      initializeTracer({
        serviceName: 'middleware-test',
      })

      const middleware = createTracingMiddleware()
      const req = createMockRequest()
      let nextCalled = false

      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      const response = await middleware(req, next)

      expect(nextCalled).toBe(true)
      expect(response.status).toBe(200)
      expect(response.headers.get('x-correlation-id')).toBeDefined()
    })
  })

  describe('Metrics Collection', () => {
    test('should create and increment counter', () => {
      const counter = new Counter('test_counter', 'Test counter metric')

      expect(counter.getValue()).toBe(0)

      counter.inc()
      expect(counter.getValue()).toBe(1)

      counter.inc(5)
      expect(counter.getValue()).toBe(6)
    })

    test('should create and manage gauge', () => {
      const gauge = new Gauge('test_gauge', 'Test gauge metric')

      expect(gauge.getValue()).toBe(0)

      gauge.set(10)
      expect(gauge.getValue()).toBe(10)

      gauge.inc(5)
      expect(gauge.getValue()).toBe(15)

      gauge.dec(3)
      expect(gauge.getValue()).toBe(12)
    })

    test('should create and observe histogram', () => {
      const histogram = new Histogram(
        'test_histogram',
        'Test histogram metric',
        [0.1, 0.5, 1.0, 2.0, 5.0],
      )

      histogram.observe(0.3)
      histogram.observe(1.5)
      histogram.observe(4.0)

      expect(histogram.getCount()).toBe(3)
      expect(histogram.getSum()).toBe(5.8)

      const buckets = histogram.getBuckets()
      expect(buckets.find(b => b.le === 0.5)?.count).toBe(1)
      expect(buckets.find(b => b.le === 2.0)?.count).toBe(2)
      expect(buckets.find(b => b.le === 5.0)?.count).toBe(3)
    })

    test('should create and observe summary', () => {
      const summary = new Summary(
        'test_summary',
        'Test summary metric',
        [0.5, 0.9, 0.99],
      )

      // Add some observations
      for (let i = 1; i <= 100; i++) {
        summary.observe(i)
      }

      expect(summary.getCount()).toBe(100)
      expect(summary.getSum()).toBe(5050)

      const quantiles = summary.getQuantiles()
      expect(quantiles.find(q => q.quantile === 0.5)?.value).toBeCloseTo(50, 5)
      expect(quantiles.find(q => q.quantile === 0.9)?.value).toBeCloseTo(90, 5)
    })

    test('should format metrics in Prometheus format', () => {
      const counter = new Counter('http_requests_total', 'Total HTTP requests')
      counter.inc(10)

      const prometheus = counter.toPrometheusString()

      expect(prometheus).toContain('# HELP http_requests_total Total HTTP requests')
      expect(prometheus).toContain('# TYPE http_requests_total counter')
      expect(prometheus).toContain('http_requests_total 10')
    })

    test('should create metrics registry', () => {
      const registry = new MetricsRegistry()

      const counter = registry.createCounter('test_counter', 'Test counter')
      const gauge = registry.createGauge('test_gauge', 'Test gauge')

      counter.inc(5)
      gauge.set(10)

      const prometheus = registry.toPrometheusString()
      expect(prometheus).toContain('test_counter 5')
      expect(prometheus).toContain('test_gauge 10')

      const json = registry.toJSON()
      expect(json.test_counter.value).toBe(5)
      expect(json.test_gauge.value).toBe(10)
    })

    test('should initialize global metrics registry', () => {
      const registry = initializeMetrics({
        enableDefaultMetrics: true,
      })

      expect(registry).toBeInstanceOf(MetricsRegistry)
      expect(getMetricsRegistry()).toBe(registry)

      // Should have default metrics
      expect(registry.get('http_requests_total')).toBeDefined()
      expect(registry.get('process_uptime_seconds')).toBeDefined()
    })

    test('should create metrics middleware', async () => {
      initializeMetrics()

      const middleware = createMetricsMiddleware()
      const req = createMockRequest()

      const next = async () => new Response('OK')
      const response = await middleware(req, next)

      expect(response.status).toBe(200)

      const registry = getMetricsRegistry()
      const requestsTotal = registry?.get('http_requests_total') as Counter
      expect(requestsTotal?.getValue()).toBeGreaterThan(0)
    })

    test('should create metrics handler', async () => {
      const registry = initializeMetrics()
      const counter = registry.createCounter('test_metric', 'Test metric')
      counter.inc(42)

      const handler = createMetricsHandler()
      const req = createMockRequest('GET', 'http://localhost/metrics')

      const response = await handler(req)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/plain')

      const body = await response.text()
      expect(body).toContain('test_metric 42')
    })
  })

  describe('Health Checks', () => {
    test('should create health check manager', () => {
      const manager = new HealthCheckManager({
        timeout: 5000,
      })

      expect(manager).toBeInstanceOf(HealthCheckManager)
      expect(manager.getUptime()).toBeGreaterThanOrEqual(0)
    })

    test('should add and check dependencies', async () => {
      const manager = new HealthCheckManager()

      manager.addDependency({
        name: 'test-service',
        type: 'custom',
        check: async () => ({
          status: 'healthy',
          message: 'Service is running',
          timestamp: Date.now(),
        }),
      })

      const health = await manager.checkHealth()

      expect(health.status).toBe('healthy')
      expect(health.dependencies['test-service']).toBeDefined()
      expect(health.dependencies['test-service'].status).toBe('healthy')
    })

    test('should handle unhealthy dependencies', async () => {
      const manager = new HealthCheckManager()

      manager.addDependency({
        name: 'failing-service',
        type: 'custom',
        critical: true,
        check: async () => ({
          status: 'unhealthy',
          message: 'Service is down',
          timestamp: Date.now(),
        }),
      })

      const health = await manager.checkHealth()

      expect(health.status).toBe('unhealthy')
      expect(health.dependencies['failing-service'].status).toBe('unhealthy')
    })

    test('should create HTTP dependency check', async () => {
      const manager = new HealthCheckManager()

      // Mock fetch for testing
      const originalFetch = globalThis.fetch
      const mockedFetch = mock(async () => new Response('OK', { status: 200 })) as unknown as typeof fetch
      ;(mockedFetch as any).preconnect = () => {}
      globalThis.fetch = mockedFetch

      manager.addDependency(
        DependencyChecks.httpService('api-service', 'http://api.example.com/health'),
      )

      const health = await manager.checkHealth()

      expect(health.dependencies['api-service']).toBeDefined()
      expect(health.dependencies['api-service'].status).toBe('healthy')

      // Restore fetch
      globalThis.fetch = originalFetch
    })

    test('should initialize global health manager', () => {
      const manager = initializeHealthChecks({
        timeout: 3000,
      })

      expect(manager).toBeInstanceOf(HealthCheckManager)
      expect(getHealthManager()).toBe(manager)
    })

    test('should create health endpoints', async () => {
      initializeHealthChecks()

      const req = createMockRequest('GET', 'http://localhost/health')
      const response = await HealthEndpoints.health(req)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/json')

      const body = await response.json() as any
      expect(body.status).toBeDefined()
      expect(body.timestamp).toBeDefined()
      expect(body.uptime).toBeDefined()
    })
  })

  describe('Request Correlation', () => {
    test('should create correlation manager', () => {
      const manager = new CorrelationManager({
        headerName: 'x-correlation-id',
      })

      expect(manager).toBeInstanceOf(CorrelationManager)
    })

    test('should extract correlation context', () => {
      const manager = new CorrelationManager()
      const req = createMockRequest('GET', 'http://localhost/test', {
        'x-correlation-id': 'test-correlation-123',
      })

      const context = manager.extractContext(req)

      expect(context.correlationId).toBe('test-correlation-123')
      expect(context.traceId).toBe('test-correlation-123')
      expect(context.metadata.method).toBe('GET')
      expect(context.metadata.url).toBe('http://localhost/test')
    })

    test('should generate correlation ID when not present', () => {
      const manager = new CorrelationManager()
      const req = createMockRequest()

      const context = manager.extractContext(req)

      expect(context.correlationId).toBeDefined()
      expect(context.correlationId).toMatch(/^[a-f0-9\-]+$/)
    })

    test('should create child context', () => {
      const manager = new CorrelationManager()
      const req = createMockRequest()

      const parentContext = manager.extractContext(req)
      const childContext = manager.createChildContext(parentContext.correlationId, 'child-service')

      expect(childContext.parentId).toBe(parentContext.correlationId)
      expect(childContext.traceId).toBe(parentContext.traceId!)
      expect(childContext.metadata.serviceName).toBe('child-service')
    })

    test('should record service calls', () => {
      const manager = new CorrelationManager()
      const req = createMockRequest()
      const context = manager.extractContext(req)

      manager.recordServiceCall({
        serviceName: 'api-service',
        method: 'GET',
        url: 'http://api.example.com/data',
        correlationId: context.correlationId,
      })

      const calls = manager.getServiceCalls(context.correlationId)
      expect(calls).toHaveLength(1)
      expect(calls[0].serviceName).toBe('api-service')
      expect(calls[0].method).toBe('GET')
    })

    test('should create HTTP client with correlation', async () => {
      const manager = new CorrelationManager()
      const req = createMockRequest()
      const context = manager.extractContext(req)

      // Mock fetch
      const originalFetch = globalThis.fetch
      const mockedFetch = mock(async (url, options) => {
        const headers = new Headers(options?.headers)
        expect(headers.get('x-correlation-id')).toBe(context.correlationId)
        return new Response('OK')
      }) as unknown as typeof fetch
      ;(mockedFetch as any).preconnect = () => {}
      globalThis.fetch = mockedFetch

      const httpClient = manager.createHttpClient(context.correlationId)
      await httpClient.fetch('http://api.example.com/test')

      // Restore fetch
      globalThis.fetch = originalFetch
    })

    test('should initialize global correlation manager', () => {
      const manager = initializeCorrelation({
        enableLogging: false,
      })

      expect(manager).toBeInstanceOf(CorrelationManager)
      expect(getCorrelationManager()).toBe(manager)
    })

    test('should create correlation middleware', async () => {
      initializeCorrelation()

      const middleware = createCorrelationMiddleware()
      const req = createMockRequest()

      const next = async () => new Response('OK')
      const response = await middleware(req, next)

      expect(response.status).toBe(200)
      expect(response.headers.get('x-correlation-id')).toBeDefined()
      expect((req as any).correlationId).toBeDefined()
    })
  })

  describe('Integration Layer', () => {
    test('should create observability manager', () => {
      const manager = new ObservabilityManager({
        enableTracing: true,
        enableMetrics: true,
        enableHealthChecks: true,
        enableCorrelation: true,
      })

      expect(manager).toBeInstanceOf(ObservabilityManager)
    })

    test('should initialize all components', () => {
      const manager = new ObservabilityManager({
        tracing: { serviceName: 'test-service' },
        metrics: { enableDefaultMetrics: true },
        healthChecks: { timeout: 3000 },
        correlation: { enableLogging: false },
      })

      manager.initialize()

      const status = manager.getStatus()
      expect(status.initialized).toBe(true)
      expect(status.components.tracing).toBe(true)
      expect(status.components.metrics).toBe(true)
      expect(status.components.healthChecks).toBe(true)
      expect(status.components.correlation).toBe(true)
    })

    test('should create middleware stack', async () => {
      const manager = initializeObservability({
        tracing: { serviceName: 'test-service' },
        metrics: { enableDefaultMetrics: true },
        correlation: { enableLogging: false },
      })

      const middleware = manager.createMiddleware()
      const req = createMockRequest()

      const next = async () => new Response('OK')
      const response = await middleware(req, next)

      expect(response.status).toBe(200)
      expect(response.headers.get('x-correlation-id')).toBeDefined()
      expect((req as any).correlationId).toBeDefined()
    })

    test('should create route handlers', () => {
      const manager = initializeObservability({
        enableMetrics: true,
        enableHealthChecks: true,
        enableCorrelation: true,
      })

      const handlers = manager.createRouteHandlers()

      expect(handlers['/metrics']).toBeDefined()
      expect(handlers['/health']).toBeDefined()
      expect(handlers['/health/ready']).toBeDefined()
      expect(handlers['/health/live']).toBeDefined()
      expect(handlers['/trace']).toBeDefined()
    })

    test('should use development preset', () => {
      const config = ObservabilityPresets.development()

      expect(config.enableTracing).toBe(true)
      expect(config.enableMetrics).toBe(true)
      expect(config.enableHealthChecks).toBe(true)
      expect(config.enableCorrelation).toBe(true)
      expect(config.tracing?.environment).toBe('development')
      expect(config.tracing?.enableConsoleExporter).toBe(true)
    })

    test('should use production preset', () => {
      const config = ObservabilityPresets.production()

      expect(config.enableTracing).toBe(true)
      expect(config.tracing?.environment).toBe('production')
      expect(config.tracing?.enableConsoleExporter).toBe(false)
      expect(config.tracing?.sampleRate).toBe(0.1)
      expect(config.correlation?.enableLogging).toBe(false)
    })

    test('should validate configuration', () => {
      const errors = ObservabilityUtils.validateConfig({
        tracing: {
          serviceName: 'test',
          sampleRate: 1.5, // Invalid
        },
        metrics: {
          collectInterval: 500, // Invalid
        },
      })

      expect(errors).toHaveLength(2)
      expect(errors[0]).toContain('sample rate')
      expect(errors[1]).toContain('collect interval')
    })

    test('should enhance router with observability', () => {
      const mockRouter = {
        use: mock(() => {}),
        get: mock(() => {}),
      }

      const result = ObservabilityIntegration.enhance(mockRouter, {
        tracing: { serviceName: 'test-service' },
      })

      expect(result.manager).toBeInstanceOf(ObservabilityManager)
      expect(result.middleware).toBeDefined()
      expect(result.handlers).toBeDefined()
      expect(result.status.initialized).toBe(true)

      expect(mockRouter.use).toHaveBeenCalled()
      expect(mockRouter.get).toHaveBeenCalledTimes(Object.keys(result.handlers).length)
    })
  })

  describe('Performance and Edge Cases', () => {
    test('should handle high-frequency metrics', () => {
      const counter = new Counter('high_freq_counter', 'High frequency counter')

      const start = Date.now()
      for (let i = 0; i < 10000; i++) {
        counter.inc()
      }
      const duration = Date.now() - start

      expect(counter.getValue()).toBe(10000)
      expect(duration).toBeLessThan(100) // Should be fast
    })

    test('should handle concurrent trace operations', async () => {
      const tracer = new DistributedTracer({ serviceName: 'concurrent-test' })

      const promises = Array.from({ length: 100 }, async (_, i) => {
        const span = tracer.startTrace(`operation-${i}`)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
        tracer.finishSpan(span)
        return span
      })

      const spans = await Promise.all(promises)

      expect(spans).toHaveLength(100)
      expect(new Set(spans.map(s => s.spanId)).size).toBe(100) // All unique
    })

    test('should cleanup old correlation contexts', () => {
      const manager = new CorrelationManager()
      const req = createMockRequest()

      // Create some contexts
      const context1 = manager.extractContext(req)
      const context2 = manager.extractContext(createMockRequest())

      // Manually set old timestamp
      context1.startTime = Date.now() - 7200000 // 2 hours ago

      manager.cleanup(3600000) // 1 hour max age

      // Should still have recent context
      expect(manager.getContext(context2.correlationId)).toBeDefined()
    })

    test('should handle invalid trace headers gracefully', () => {
      const tracer = new DistributedTracer({ serviceName: 'test' })

      const headers = new Headers({
        traceparent: 'invalid-header-format',
      })

      const context = tracer.extractTraceContext(headers)
      expect(context).toBeNull()
    })

    test('should handle metrics registry overflow', () => {
      const registry = new MetricsRegistry()

      // Create many metrics
      for (let i = 0; i < 1000; i++) {
        const counter = registry.createCounter(`counter_${i}`, `Counter ${i}`)
        counter.inc(i)
      }

      const prometheus = registry.toPrometheusString()
      expect(prometheus.split('\n').length).toBeGreaterThan(2000) // Should have many lines

      const json = registry.toJSON()
      expect(Object.keys(json)).toHaveLength(1000)
    })
  })
})
