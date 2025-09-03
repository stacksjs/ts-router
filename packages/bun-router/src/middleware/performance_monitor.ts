import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export interface PerformanceMetrics {
  requestId: string
  method: string
  path: string
  statusCode: number
  responseTime: number
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }
  cpuUsage: {
    user: number
    system: number
  }
  timestamp: number
  userAgent?: string
  ip?: string
  contentLength?: number
  queryParams?: number
  headers?: Record<string, string>
  error?: string
  traceId?: string
  spanId?: string
}

export interface PerformanceThresholds {
  responseTime: {
    warning: number
    critical: number
  }
  memoryUsage: {
    warning: number
    critical: number
  }
  errorRate: {
    warning: number
    critical: number
  }
}

export interface PerformanceMonitorOptions {
  enabled?: boolean
  collectMetrics?: {
    responseTime?: boolean
    memoryUsage?: boolean
    cpuUsage?: boolean
    requestDetails?: boolean
    headers?: boolean
    queryParams?: boolean
  }
  sampling?: {
    rate?: number
    maxRequestsPerSecond?: number
  }
  thresholds?: PerformanceThresholds
  storage?: {
    type: 'memory' | 'file' | 'database' | 'custom'
    maxEntries?: number
    retentionPeriod?: number
    filePath?: string
    customHandler?: (metrics: PerformanceMetrics) => Promise<void>
  }
  alerting?: {
    enabled?: boolean
    webhookUrl?: string
    emailConfig?: {
      smtp: string
      from: string
      to: string[]
    }
    slackConfig?: {
      webhookUrl: string
      channel: string
    }
  }
  profiling?: {
    enabled?: boolean
    sampleRate?: number
    includeStackTrace?: boolean
    maxStackDepth?: number
  }
  tracing?: {
    enabled?: boolean
    sampleRate?: number
    exporters?: ('console' | 'jaeger' | 'zipkin' | 'otlp')[]
  }
}

interface RequestContext {
  startTime: number
  startCpuUsage: NodeJS.CpuUsage
  startMemory: NodeJS.MemoryUsage
  traceId?: string
  spanId?: string
  samples?: Array<{
    timestamp: number
    memory: NodeJS.MemoryUsage
    cpu: NodeJS.CpuUsage
  }>
}

export default class PerformanceMonitor {
  private options: PerformanceMonitorOptions
  private metrics: PerformanceMetrics[] = []
  private requestContexts: Map<string, RequestContext> = new Map()
  private samplingCounter = 0
  private alertCooldowns: Map<string, number> = new Map()
  private cleanupInterval?: Timer

  constructor(options: PerformanceMonitorOptions = {}) {
    const monitoringConfig = config.server?.performance?.monitoring || {}

    this.options = {
      enabled: options.enabled ?? monitoringConfig.enabled ?? true,
      collectMetrics: {
        responseTime: true,
        memoryUsage: true,
        cpuUsage: true,
        requestDetails: true,
        headers: false,
        queryParams: true,
        ...options.collectMetrics,
      },
      sampling: {
        rate: options.sampling?.rate ?? 1.0, // 100% by default
        maxRequestsPerSecond: options.sampling?.maxRequestsPerSecond ?? 1000,
        ...options.sampling,
      },
      thresholds: {
        responseTime: {
          warning: 1000, // 1 second
          critical: 5000, // 5 seconds
        },
        memoryUsage: {
          warning: 512 * 1024 * 1024, // 512MB
          critical: 1024 * 1024 * 1024, // 1GB
        },
        errorRate: {
          warning: 0.05, // 5%
          critical: 0.1, // 10%
        },
        ...options.thresholds,
      },
      storage: {
        type: 'memory',
        maxEntries: 10000,
        retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
        ...options.storage,
      },
      alerting: {
        enabled: false,
        ...options.alerting,
      },
      profiling: {
        enabled: false,
        sampleRate: 0.01, // 1%
        includeStackTrace: false,
        maxStackDepth: 10,
        ...options.profiling,
      },
      tracing: {
        enabled: false,
        sampleRate: 0.1, // 10%
        exporters: ['console'],
        ...options.tracing,
      },
    }

    // Start cleanup interval for memory storage
    if (this.options.storage?.type === 'memory') {
      this.startCleanupInterval()
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics()
    }, 60000) // Cleanup every minute
  }

  private cleanupOldMetrics(): void {
    const now = Date.now()
    const retentionPeriod = this.options.storage?.retentionPeriod || 24 * 60 * 60 * 1000

    this.metrics = this.metrics.filter(metric =>
      now - metric.timestamp < retentionPeriod,
    )

    // Limit total entries
    const maxEntries = this.options.storage?.maxEntries || 10000
    if (this.metrics.length > maxEntries) {
      this.metrics = this.metrics.slice(-maxEntries)
    }
  }

  private shouldSample(): boolean {
    const rate = this.options.sampling?.rate || 1.0
    return Math.random() < rate
  }

  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15)
      + Math.random().toString(36).substring(2, 15)
  }

  private generateSpanId(): string {
    return Math.random().toString(36).substring(2, 10)
  }

  private getClientIP(req: EnhancedRequest): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || req.headers.get('cf-connecting-ip')
      || 'unknown'
  }

  private async collectSystemMetrics(): Promise<{
    memory: NodeJS.MemoryUsage
    cpu: NodeJS.CpuUsage
  }> {
    const memory = process.memoryUsage()
    const cpu = process.cpuUsage()

    return { memory, cpu }
  }

  private calculateCpuPercent(start: NodeJS.CpuUsage, end: NodeJS.CpuUsage, duration: number): {
    user: number
    system: number
  } {
    const userDiff = end.user - start.user
    const systemDiff = end.system - start.system

    return {
      user: (userDiff / duration) * 100,
      system: (systemDiff / duration) * 100,
    }
  }

  private async storeMetrics(metrics: PerformanceMetrics): Promise<void> {
    switch (this.options.storage?.type) {
      case 'memory':
        this.metrics.push(metrics)
        break

      case 'file':
        if (this.options.storage.filePath) {
          const logEntry = `${JSON.stringify(metrics)}\n`
          await Bun.write(this.options.storage.filePath, logEntry, { createPath: true })
        }
        break

      case 'custom':
        if (this.options.storage.customHandler) {
          await this.options.storage.customHandler(metrics)
        }
        break

      default:
        // Default to memory storage
        this.metrics.push(metrics)
    }
  }

  private async checkThresholds(metrics: PerformanceMetrics): Promise<void> {
    if (!this.options.alerting?.enabled)
      return

    const alerts: string[] = []
    const thresholds = this.options.thresholds!

    // Check response time
    if (metrics.responseTime > thresholds.responseTime.critical) {
      alerts.push(`Critical response time: ${metrics.responseTime}ms (threshold: ${thresholds.responseTime.critical}ms)`)
    }
    else if (metrics.responseTime > thresholds.responseTime.warning) {
      alerts.push(`Warning response time: ${metrics.responseTime}ms (threshold: ${thresholds.responseTime.warning}ms)`)
    }

    // Check memory usage
    if (metrics.memoryUsage.heapUsed > thresholds.memoryUsage.critical) {
      alerts.push(`Critical memory usage: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`)
    }
    else if (metrics.memoryUsage.heapUsed > thresholds.memoryUsage.warning) {
      alerts.push(`Warning memory usage: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`)
    }

    // Send alerts if any
    if (alerts.length > 0) {
      await this.sendAlerts(alerts, metrics)
    }
  }

  private async sendAlerts(alerts: string[], metrics: PerformanceMetrics): Promise<void> {
    const alertKey = `${metrics.path}-${alerts.join(',')}`
    const now = Date.now()
    const cooldownPeriod = 5 * 60 * 1000 // 5 minutes

    // Check cooldown
    const lastAlert = this.alertCooldowns.get(alertKey)
    if (lastAlert && now - lastAlert < cooldownPeriod) {
      return
    }

    this.alertCooldowns.set(alertKey, now)

    const alertMessage = {
      timestamp: new Date(metrics.timestamp).toISOString(),
      requestId: metrics.requestId,
      path: metrics.path,
      method: metrics.method,
      alerts,
      metrics: {
        responseTime: metrics.responseTime,
        memoryUsage: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
        statusCode: metrics.statusCode,
      },
    }

    // Send to webhook
    if (this.options.alerting?.webhookUrl) {
      try {
        await fetch(this.options.alerting.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertMessage),
        })
      }
      catch (error) {
        console.error('Failed to send webhook alert:', error)
      }
    }

    // Send to Slack
    if (this.options.alerting?.slackConfig?.webhookUrl) {
      try {
        await fetch(this.options.alerting.slackConfig.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: this.options.alerting.slackConfig.channel,
            text: `🚨 Performance Alert: ${alerts.join(', ')}`,
            attachments: [{
              color: 'danger',
              fields: [
                { title: 'Path', value: metrics.path, short: true },
                { title: 'Response Time', value: `${metrics.responseTime}ms`, short: true },
                { title: 'Memory Usage', value: `${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`, short: true },
                { title: 'Status Code', value: metrics.statusCode.toString(), short: true },
              ],
            }],
          }),
        })
      }
      catch (error) {
        console.error('Failed to send Slack alert:', error)
      }
    }

    // Log to console
    console.warn('Performance Alert:', alertMessage)
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    if (!this.options.enabled || !this.shouldSample()) {
      return await next()
    }

    const requestId = req.requestId || this.generateTraceId()
    const traceId = this.options.tracing?.enabled ? this.generateTraceId() : undefined
    const spanId = this.options.tracing?.enabled ? this.generateSpanId() : undefined

    // Start timing and collect initial metrics
    const startTime = performance.now()
    const startSystemMetrics = await this.collectSystemMetrics()

    const context: RequestContext = {
      startTime,
      startCpuUsage: startSystemMetrics.cpu,
      startMemory: startSystemMetrics.memory,
      traceId,
      spanId,
      samples: [],
    }

    this.requestContexts.set(requestId, context)

    // Add tracing info to request
    if (traceId)
      req.traceId = traceId
    if (spanId)
      req.spanId = spanId

    let response: Response
    let error: string | undefined

    try {
      // Start profiling if enabled
      if (this.options.profiling?.enabled && Math.random() < (this.options.profiling.sampleRate || 0.01)) {
        // Collect periodic samples during request processing
        const sampleInterval = setInterval(async () => {
          const sampleMetrics = await this.collectSystemMetrics()
          context.samples?.push({
            timestamp: performance.now(),
            memory: sampleMetrics.memory,
            cpu: sampleMetrics.cpu,
          })
        }, 100) // Sample every 100ms

        response = await next()
        clearInterval(sampleInterval)
      }
      else {
        response = await next()
      }
    }
    catch (err) {
      error = err instanceof Error ? err.message : String(err)
      response = new Response('Internal Server Error', { status: 500 })
    }

    // Calculate metrics
    const endTime = performance.now()
    const responseTime = endTime - startTime
    const endSystemMetrics = await this.collectSystemMetrics()
    const cpuUsage = this.calculateCpuPercent(
      context.startCpuUsage,
      endSystemMetrics.cpu,
      responseTime,
    )

    const url = new URL(req.url)
    const metrics: PerformanceMetrics = {
      requestId,
      method: req.method,
      path: url.pathname,
      statusCode: response.status,
      responseTime: Math.round(responseTime * 100) / 100, // Round to 2 decimal places
      memoryUsage: {
        heapUsed: endSystemMetrics.memory.heapUsed,
        heapTotal: endSystemMetrics.memory.heapTotal,
        external: endSystemMetrics.memory.external,
        rss: endSystemMetrics.memory.rss,
      },
      cpuUsage,
      timestamp: Date.now(),
      traceId,
      spanId,
    }

    // Add optional metrics
    if (this.options.collectMetrics?.requestDetails) {
      metrics.userAgent = req.headers.get('user-agent') || undefined
      metrics.ip = this.getClientIP(req)
      metrics.contentLength = Number.parseInt(req.headers.get('content-length') || '0', 10) || undefined
    }

    if (this.options.collectMetrics?.queryParams) {
      metrics.queryParams = url.searchParams.size
    }

    if (this.options.collectMetrics?.headers) {
      metrics.headers = {}
      for (const [key, value] of req.headers.entries()) {
        metrics.headers[key] = value
      }
    }

    if (error) {
      metrics.error = error
    }

    // Store metrics and check thresholds
    await this.storeMetrics(metrics)
    await this.checkThresholds(metrics)

    // Cleanup request context
    this.requestContexts.delete(requestId)

    return response
  }

  // Public API methods
  getMetrics(options?: {
    startTime?: number
    endTime?: number
    path?: string
    method?: string
    statusCode?: number
    limit?: number
  }): PerformanceMetrics[] {
    let filtered = this.metrics

    if (options?.startTime) {
      filtered = filtered.filter(m => m.timestamp >= options.startTime!)
    }

    if (options?.endTime) {
      filtered = filtered.filter(m => m.timestamp <= options.endTime!)
    }

    if (options?.path) {
      filtered = filtered.filter(m => m.path === options.path)
    }

    if (options?.method) {
      filtered = filtered.filter(m => m.method === options.method)
    }

    if (options?.statusCode) {
      filtered = filtered.filter(m => m.statusCode === options.statusCode)
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit)
    }

    return filtered
  }

  getAggregatedMetrics(timeWindow: number = 60000): {
    totalRequests: number
    averageResponseTime: number
    medianResponseTime: number
    p95ResponseTime: number
    p99ResponseTime: number
    errorRate: number
    averageMemoryUsage: number
    requestsPerSecond: number
    statusCodeDistribution: Record<number, number>
    pathDistribution: Record<string, number>
  } {
    const now = Date.now()
    const windowStart = now - timeWindow
    const windowMetrics = this.metrics.filter(m => m.timestamp >= windowStart)

    if (windowMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        medianResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        averageMemoryUsage: 0,
        requestsPerSecond: 0,
        statusCodeDistribution: {},
        pathDistribution: {},
      }
    }

    const responseTimes = windowMetrics.map(m => m.responseTime).sort((a, b) => a - b)
    const errorCount = windowMetrics.filter(m => m.statusCode >= 400).length
    const memoryUsages = windowMetrics.map(m => m.memoryUsage.heapUsed)

    const statusCodeDistribution: Record<number, number> = {}
    const pathDistribution: Record<string, number> = {}

    windowMetrics.forEach((m) => {
      statusCodeDistribution[m.statusCode] = (statusCodeDistribution[m.statusCode] || 0) + 1
      pathDistribution[m.path] = (pathDistribution[m.path] || 0) + 1
    })

    return {
      totalRequests: windowMetrics.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      medianResponseTime: responseTimes[Math.floor(responseTimes.length / 2)],
      p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.99)],
      errorRate: errorCount / windowMetrics.length,
      averageMemoryUsage: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
      requestsPerSecond: windowMetrics.length / (timeWindow / 1000),
      statusCodeDistribution,
      pathDistribution,
    }
  }

  clearMetrics(): void {
    this.metrics = []
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.requestContexts.clear()
    this.alertCooldowns.clear()
  }
}

// Factory function for easy use
export function performanceMonitor(options: PerformanceMonitorOptions = {}): (req: EnhancedRequest, next: NextFunction) => Promise<Response> {
  const instance = new PerformanceMonitor(options)
  return async (req: EnhancedRequest, next: NextFunction) => instance.handle(req, next)
}
