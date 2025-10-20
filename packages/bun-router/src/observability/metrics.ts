/**
 * Observability & Monitoring - Custom Metrics Collection with Prometheus Format
 *
 * Enterprise-grade metrics collection and Prometheus-compatible exposition
 */

import type { EnhancedRequest } from '../types'
import process from 'node:process'

export interface MetricConfig {
  prefix?: string
  labels?: Record<string, string>
  enableDefaultMetrics?: boolean
  collectInterval?: number
  maxHistogramBuckets?: number
  maxSummaryAge?: number
}

export interface MetricLabels {
  [key: string]: string
}

export interface HistogramBucket {
  le: number
  count: number
}

export interface SummaryQuantile {
  quantile: number
  value: number
}

/**
 * Base metric interface
 */
export abstract class Metric {
  public readonly name: string
  public readonly help: string
  public readonly type: string
  public readonly labels: MetricLabels

  constructor(name: string, help: string, type: string, labels: MetricLabels = {}) {
    this.name = name
    this.help = help
    this.type = type
    this.labels = labels
  }

  abstract getValue(): number | string
  abstract reset(): void
  abstract toPrometheusString(): string
}

/**
 * Counter metric - monotonically increasing value
 */
export class Counter extends Metric {
  private value = 0
  private labeledCounters = new Map<string, number>()

  constructor(name: string, help: string, labels: MetricLabels = {}) {
    super(name, help, 'counter', labels)
  }

  inc(value = 1, labels: MetricLabels = {}): void {
    if (Object.keys(labels).length === 0) {
      this.value += value
    }
    else {
      const key = this.getLabelKey(labels)
      this.labeledCounters.set(key, (this.labeledCounters.get(key) || 0) + value)
    }
  }

  getValue(): number {
    return this.value
  }

  reset(): void {
    this.value = 0
    this.labeledCounters.clear()
  }

  private getLabelKey(labels: MetricLabels): string {
    return Object.entries({ ...this.labels, ...labels })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')
  }

  toPrometheusString(): string {
    let output = `# HELP ${this.name} ${this.help}\n`
    output += `# TYPE ${this.name} counter\n`

    if (this.labeledCounters.size === 0) {
      const labelStr = Object.keys(this.labels).length > 0
        ? `{${this.getLabelKey(this.labels)}}`
        : ''
      output += `${this.name}${labelStr} ${this.value}\n`
    }
    else {
      for (const [labelKey, value] of this.labeledCounters.entries()) {
        output += `${this.name}{${labelKey}} ${value}\n`
      }
    }

    return output
  }
}

/**
 * Gauge metric - can go up and down
 */
export class Gauge extends Metric {
  private value = 0
  private labeledGauges = new Map<string, number>()

  constructor(name: string, help: string, labels: MetricLabels = {}) {
    super(name, help, 'gauge', labels)
  }

  set(value: number, labels: MetricLabels = {}): void {
    if (Object.keys(labels).length === 0) {
      this.value = value
    }
    else {
      const key = this.getLabelKey(labels)
      this.labeledGauges.set(key, value)
    }
  }

  inc(value = 1, labels: MetricLabels = {}): void {
    if (Object.keys(labels).length === 0) {
      this.value += value
    }
    else {
      const key = this.getLabelKey(labels)
      this.labeledGauges.set(key, (this.labeledGauges.get(key) || 0) + value)
    }
  }

  dec(value = 1, labels: MetricLabels = {}): void {
    this.inc(-value, labels)
  }

  getValue(): number {
    return this.value
  }

  reset(): void {
    this.value = 0
    this.labeledGauges.clear()
  }

  private getLabelKey(labels: MetricLabels): string {
    return Object.entries({ ...this.labels, ...labels })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')
  }

  toPrometheusString(): string {
    let output = `# HELP ${this.name} ${this.help}\n`
    output += `# TYPE ${this.name} gauge\n`

    if (this.labeledGauges.size === 0) {
      const labelStr = Object.keys(this.labels).length > 0
        ? `{${this.getLabelKey(this.labels)}}`
        : ''
      output += `${this.name}${labelStr} ${this.value}\n`
    }
    else {
      for (const [labelKey, value] of this.labeledGauges.entries()) {
        output += `${this.name}{${labelKey}} ${value}\n`
      }
    }

    return output
  }
}

/**
 * Histogram metric - tracks distribution of values
 */
export class Histogram extends Metric {
  private buckets: Map<number, number> = new Map()
  private sum = 0
  private count = 0
  private readonly bucketBounds: number[]

  constructor(
    name: string,
    help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labels: MetricLabels = {},
  ) {
    super(name, help, 'histogram', labels)
    this.bucketBounds = [...buckets, Infinity].sort((a, b) => a - b)

    // Initialize buckets
    for (const bound of this.bucketBounds) {
      this.buckets.set(bound, 0)
    }
  }

  observe(value: number, _labels: MetricLabels = {}): void {
    this.sum += value
    this.count++

    // Increment appropriate buckets
    for (const bound of this.bucketBounds) {
      if (value <= bound) {
        this.buckets.set(bound, (this.buckets.get(bound) || 0) + 1)
      }
    }
  }

  getValue(): number {
    return this.sum
  }

  getCount(): number {
    return this.count
  }

  getSum(): number {
    return this.sum
  }

  getBuckets(): HistogramBucket[] {
    return Array.from(this.buckets.entries()).map(([le, count]) => ({ le, count }))
  }

  reset(): void {
    this.sum = 0
    this.count = 0
    for (const bound of this.bucketBounds) {
      this.buckets.set(bound, 0)
    }
  }

  toPrometheusString(): string {
    let output = `# HELP ${this.name} ${this.help}\n`
    output += `# TYPE ${this.name} histogram\n`

    const labelStr = Object.keys(this.labels).length > 0
      ? `{${Object.entries(this.labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
      : ''

    // Output buckets
    for (const [bound, count] of this.buckets.entries()) {
      const le = bound === Infinity ? '+Inf' : bound.toString()
      const bucketLabels = labelStr ? `{${labelStr.slice(1, -1)},le="${le}"}` : `{le="${le}"}`
      output += `${this.name}_bucket${bucketLabels} ${count}\n`
    }

    // Output sum and count
    output += `${this.name}_sum${labelStr} ${this.sum}\n`
    output += `${this.name}_count${labelStr} ${this.count}\n`

    return output
  }
}

/**
 * Summary metric - tracks quantiles over sliding time window
 */
export class Summary extends Metric {
  private observations: Array<{ value: number, timestamp: number }> = []
  private sum = 0
  private count = 0
  private readonly quantiles: number[]
  private readonly maxAge: number

  constructor(
    name: string,
    help: string,
    quantiles: number[] = [0.5, 0.9, 0.95, 0.99],
    maxAge = 600000, // 10 minutes
    labels: MetricLabels = {},
  ) {
    super(name, help, 'summary', labels)
    this.quantiles = quantiles.sort((a, b) => a - b)
    this.maxAge = maxAge
  }

  observe(value: number, _labels: MetricLabels = {}): void {
    const now = Date.now()
    this.observations.push({ value, timestamp: now })
    this.sum += value
    this.count++

    // Clean old observations
    this.cleanOldObservations(now)
  }

  getValue(): number {
    return this.sum
  }

  getCount(): number {
    return this.count
  }

  getSum(): number {
    return this.sum
  }

  getQuantiles(): SummaryQuantile[] {
    this.cleanOldObservations(Date.now())

    if (this.observations.length === 0) {
      return this.quantiles.map(q => ({ quantile: q, value: 0 }))
    }

    const sortedValues = this.observations
      .map(obs => obs.value)
      .sort((a, b) => a - b)

    return this.quantiles.map((quantile) => {
      const index = Math.ceil(quantile * sortedValues.length) - 1
      const value = sortedValues[Math.max(0, index)] || 0
      return { quantile, value }
    })
  }

  private cleanOldObservations(now: number): void {
    const cutoff = now - this.maxAge
    const oldLength = this.observations.length

    this.observations = this.observations.filter(obs => obs.timestamp >= cutoff)

    // Adjust sum and count for removed observations
    const removedCount = oldLength - this.observations.length
    if (removedCount > 0) {
      // Recalculate sum from remaining observations
      this.sum = this.observations.reduce((sum, obs) => sum + obs.value, 0)
      this.count = this.observations.length
    }
  }

  reset(): void {
    this.observations = []
    this.sum = 0
    this.count = 0
  }

  toPrometheusString(): string {
    let output = `# HELP ${this.name} ${this.help}\n`
    output += `# TYPE ${this.name} summary\n`

    const labelStr = Object.keys(this.labels).length > 0
      ? `{${Object.entries(this.labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
      : ''

    // Output quantiles
    const quantiles = this.getQuantiles()
    for (const { quantile, value } of quantiles) {
      const quantileLabels = labelStr
        ? `{${labelStr.slice(1, -1)},quantile="${quantile}"}`
        : `{quantile="${quantile}"}`
      output += `${this.name}${quantileLabels} ${value}\n`
    }

    // Output sum and count
    output += `${this.name}_sum${labelStr} ${this.sum}\n`
    output += `${this.name}_count${labelStr} ${this.count}\n`

    return output
  }
}

/**
 * Metrics registry
 */
export class MetricsRegistry {
  private metrics = new Map<string, Metric>()
  private config: MetricConfig
  private defaultMetrics: Map<string, Metric> = new Map()

  constructor(config: MetricConfig = {}) {
    this.config = {
      prefix: '',
      enableDefaultMetrics: true,
      collectInterval: 15000, // 15 seconds
      maxHistogramBuckets: 20,
      maxSummaryAge: 600000, // 10 minutes
      ...config,
    }

    if (this.config.enableDefaultMetrics) {
      this.registerDefaultMetrics()
    }
  }

  /**
   * Register a metric
   */
  register(metric: Metric): void {
    const name = this.config.prefix ? `${this.config.prefix}_${metric.name}` : metric.name
    this.metrics.set(name, metric)
  }

  /**
   * Get a metric by name
   */
  get(name: string): Metric | undefined {
    const fullName = this.config.prefix ? `${this.config.prefix}_${name}` : name
    return this.metrics.get(fullName)
  }

  /**
   * Create and register a counter
   */
  createCounter(name: string, help: string, labels: MetricLabels = {}): Counter {
    const counter = new Counter(name, help, labels)
    this.register(counter)
    return counter
  }

  /**
   * Create and register a gauge
   */
  createGauge(name: string, help: string, labels: MetricLabels = {}): Gauge {
    const gauge = new Gauge(name, help, labels)
    this.register(gauge)
    return gauge
  }

  /**
   * Create and register a histogram
   */
  createHistogram(
    name: string,
    help: string,
    buckets?: number[],
    labels: MetricLabels = {},
  ): Histogram {
    const histogram = new Histogram(name, help, buckets, labels)
    this.register(histogram)
    return histogram
  }

  /**
   * Create and register a summary
   */
  createSummary(
    name: string,
    help: string,
    quantiles?: number[],
    maxAge?: number,
    labels: MetricLabels = {},
  ): Summary {
    const summary = new Summary(name, help, quantiles, maxAge, labels)
    this.register(summary)
    return summary
  }

  /**
   * Register default system metrics
   */
  private registerDefaultMetrics(): void {
    // HTTP request metrics
    const httpRequestsTotal = this.createCounter(
      'http_requests_total',
      'Total number of HTTP requests',
    )

    const httpRequestDuration = this.createHistogram(
      'http_request_duration_seconds',
      'HTTP request duration in seconds',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    )

    const httpRequestSize = this.createHistogram(
      'http_request_size_bytes',
      'HTTP request size in bytes',
      [100, 1000, 10000, 100000, 1000000, 10000000],
    )

    const httpResponseSize = this.createHistogram(
      'http_response_size_bytes',
      'HTTP response size in bytes',
      [100, 1000, 10000, 100000, 1000000, 10000000],
    )

    // System metrics
    const processStartTime = this.createGauge(
      'process_start_time_seconds',
      'Start time of the process since unix epoch in seconds',
    )
    processStartTime.set(Date.now() / 1000)

    const processUptime = this.createGauge(
      'process_uptime_seconds',
      'Process uptime in seconds',
    )

    // Memory metrics
    const processMemoryUsage = this.createGauge(
      'process_memory_usage_bytes',
      'Process memory usage in bytes',
    )

    // Active connections
    const activeConnections = this.createGauge(
      'active_connections',
      'Number of active connections',
    )

    this.defaultMetrics.set('http_requests_total', httpRequestsTotal)
    this.defaultMetrics.set('http_request_duration_seconds', httpRequestDuration)
    this.defaultMetrics.set('http_request_size_bytes', httpRequestSize)
    this.defaultMetrics.set('http_response_size_bytes', httpResponseSize)
    this.defaultMetrics.set('process_uptime_seconds', processUptime)
    this.defaultMetrics.set('process_memory_usage_bytes', processMemoryUsage)
    this.defaultMetrics.set('active_connections', activeConnections)

    // Start collection interval for system metrics
    if (this.config.collectInterval && this.config.collectInterval > 0) {
      setInterval(() => {
        this.collectSystemMetrics()
      }, this.config.collectInterval)
    }
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    try {
      // Update uptime
      const uptimeGauge = this.defaultMetrics.get('process_uptime_seconds') as Gauge
      if (uptimeGauge) {
        uptimeGauge.set(process.uptime())
      }

      // Update memory usage
      const memoryGauge = this.defaultMetrics.get('process_memory_usage_bytes') as Gauge
      if (memoryGauge && typeof process.memoryUsage === 'function') {
        const memUsage = process.memoryUsage()
        memoryGauge.set(memUsage.rss)
      }
    }
    catch (error) {
      console.error('Error collecting system metrics:', error)
    }
  }

  /**
   * Get all metrics in Prometheus format
   */
  toPrometheusString(): string {
    let output = ''

    for (const metric of this.metrics.values()) {
      output += `${metric.toPrometheusString()}\n`
    }

    return output.trim()
  }

  /**
   * Get metrics as JSON
   */
  toJSON(): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [name, metric] of this.metrics.entries()) {
      result[name] = {
        type: metric.type,
        help: metric.help,
        value: metric.getValue(),
        labels: metric.labels,
      }
    }

    return result
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.reset()
    }
  }

  /**
   * Get metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys())
  }

  /**
   * Remove a metric
   */
  unregister(name: string): boolean {
    const fullName = this.config.prefix ? `${this.config.prefix}_${name}` : name
    return this.metrics.delete(fullName)
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear()
    this.defaultMetrics.clear()
  }
}

/**
 * Global metrics registry
 */
let globalRegistry: MetricsRegistry | null = null

/**
 * Initialize global metrics registry
 */
export function initializeMetrics(config?: MetricConfig): MetricsRegistry {
  globalRegistry = new MetricsRegistry(config)
  return globalRegistry
}

/**
 * Get global metrics registry
 */
export function getMetricsRegistry(): MetricsRegistry | null {
  return globalRegistry
}

/**
 * Metrics middleware factory
 */
export function createMetricsMiddleware(config?: Partial<MetricConfig>) {
  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    const registry = getMetricsRegistry()
    if (!registry) {
      return await next()
    }

    const startTime = Date.now()
    const url = new URL(req.url)

    // Get metrics
    const requestsTotal = registry.get('http_requests_total') as Counter
    const requestDuration = registry.get('http_request_duration_seconds') as Histogram
    const requestSize = registry.get('http_request_size_bytes') as Histogram
    const responseSize = registry.get('http_response_size_bytes') as Histogram
    const activeConnections = registry.get('active_connections') as Gauge

    // Increment active connections
    if (activeConnections) {
      activeConnections.inc()
    }

    // Record request size
    if (requestSize) {
      const contentLength = req.headers.get('content-length')
      if (contentLength) {
        requestSize.observe(Number.parseInt(contentLength, 10))
      }
    }

    let response: Response
    try {
      response = await next()

      // Record metrics
      const duration = (Date.now() - startTime) / 1000
      const labels = {
        method: req.method,
        status: response.status.toString(),
        path: url.pathname,
      }

      if (requestsTotal) {
        requestsTotal.inc(1, labels)
      }

      if (requestDuration) {
        requestDuration.observe(duration, labels)
      }

      if (responseSize) {
        const contentLength = response.headers.get('content-length')
        if (contentLength) {
          responseSize.observe(Number.parseInt(contentLength, 10), labels)
        }
      }
    }
    catch (error) {
      // Record error metrics
      const duration = (Date.now() - startTime) / 1000
      const labels = {
        method: req.method,
        status: '500',
        path: url.pathname,
      }

      if (requestsTotal) {
        requestsTotal.inc(1, labels)
      }

      if (requestDuration) {
        requestDuration.observe(duration, labels)
      }

      throw error
    }
    finally {
      // Decrement active connections
      if (activeConnections) {
        activeConnections.dec()
      }
    }

    return response
  }
}

/**
 * Metrics endpoint handler
 */
export function createMetricsHandler() {
  return async (req: EnhancedRequest): Promise<Response> => {
    const registry = getMetricsRegistry()
    if (!registry) {
      return new Response('Metrics not initialized', { status: 500 })
    }

    const format = new URL(req.url).searchParams.get('format') || 'prometheus'

    if (format === 'json') {
      return new Response(JSON.stringify(registry.toJSON(), null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Default to Prometheus format
    return new Response(registry.toPrometheusString(), {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  }
}
