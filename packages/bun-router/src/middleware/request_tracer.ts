import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export interface TraceSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  operationName: string
  startTime: number
  endTime?: number
  duration?: number
  tags: Record<string, any>
  logs: Array<{
    timestamp: number
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    fields?: Record<string, any>
  }>
  status: 'ok' | 'error' | 'timeout'
  error?: string
  stackTrace?: string[]
}

export interface TracingOptions {
  enabled?: boolean
  sampleRate?: number
  maxSpans?: number
  includeHeaders?: boolean
  includeQueryParams?: boolean
  includeRequestBody?: boolean
  includeResponseBody?: boolean
  maxBodySize?: number
  exporters?: Array<{
    type: 'console' | 'jaeger' | 'zipkin' | 'otlp' | 'custom'
    endpoint?: string
    headers?: Record<string, string>
    customExporter?: (spans: TraceSpan[]) => Promise<void>
  }>
  propagation?: {
    enabled?: boolean
    headers?: string[]
  }
}

export default class RequestTracer {
  private options: TracingOptions
  private spans: Map<string, TraceSpan> = new Map()
  private activeSpans: Map<string, string> = new Map() // requestId -> spanId
  private exportQueue: TraceSpan[] = []
  private exportInterval?: Timer

  constructor(options: TracingOptions = {}) {
    const tracingConfig = (config.server?.performance?.monitoring as any)?.tracing || {}

    this.options = {
      enabled: options.enabled ?? tracingConfig.enabled ?? false,
      sampleRate: options.sampleRate ?? tracingConfig.sampleRate ?? 1.0,
      maxSpans: options.maxSpans ?? 10000,
      includeHeaders: options.includeHeaders ?? false,
      includeQueryParams: options.includeQueryParams ?? true,
      includeRequestBody: options.includeRequestBody ?? false,
      includeResponseBody: options.includeResponseBody ?? false,
      maxBodySize: options.maxBodySize ?? 1024 * 1024, // 1MB
      exporters: options.exporters ?? [{ type: 'console' }],
      propagation: {
        enabled: true,
        headers: ['x-trace-id', 'x-span-id', 'x-parent-span-id'],
        ...options.propagation,
      },
    }

    if (this.options.enabled) {
      this.startExportInterval()
    }
  }

  private startExportInterval(): void {
    this.exportInterval = setInterval(async () => {
      try {
        await this.exportSpans()
      }
      catch (error) {
        console.warn('Error exporting spans:', error)
      }
    }, 100) // Export every 100ms for faster testing
  }

  private shouldSample(): boolean {
    return Math.random() < (this.options.sampleRate || 1.0)
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15)
      + Math.random().toString(36).substring(2, 15)
  }

  private extractPropagationHeaders(req: EnhancedRequest): {
    traceId?: string
    parentSpanId?: string
  } {
    if (!this.options.propagation?.enabled) {
      return {}
    }

    const headers = this.options.propagation.headers || []
    let traceId: string | undefined

    // Try to find trace ID from configured headers
    for (const header of headers) {
      const value = req.headers.get(header)
      if (value) {
        traceId = value
        break
      }
    }

    // Look for parent span ID
    const parentSpanId = req.headers.get('x-parent-span-id') || undefined

    return { traceId, parentSpanId }
  }

  private async captureRequestBody(req: EnhancedRequest): Promise<any> {
    if (!this.options.includeRequestBody)
      return undefined

    try {
      const contentType = req.headers.get('content-type') || ''
      const contentLength = Number.parseInt(req.headers.get('content-length') || '0', 10)

      if (contentLength > (this.options.maxBodySize || 1024 * 1024)) {
        return { truncated: true, reason: 'Body too large', size: contentLength }
      }

      if (contentType.includes('application/json')) {
        const cloned = req.clone()
        return await cloned.json()
      }
      else if (contentType.includes('application/x-www-form-urlencoded')) {
        const cloned = req.clone()
        const formData = await cloned.formData()
        const result: Record<string, any> = {}
        for (const [key, value] of formData.entries()) {
          result[key] = value
        }
        return result
      }
      else if (contentType.includes('text/')) {
        const cloned = req.clone()
        return await cloned.text()
      }
    }
    catch (error) {
      return { error: 'Failed to capture body', message: error instanceof Error ? error.message : String(error) }
    }

    return undefined
  }

  private async captureResponseBody(response: Response): Promise<any> {
    if (!this.options.includeResponseBody)
      return undefined

    try {
      const contentType = response.headers.get('content-type') || ''
      const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10)

      if (contentLength > (this.options.maxBodySize || 1024 * 1024)) {
        return { truncated: true, reason: 'Body too large', size: contentLength }
      }

      if (contentType.includes('application/json')) {
        const cloned = response.clone()
        return await cloned.json()
      }
      else if (contentType.includes('text/')) {
        const cloned = response.clone()
        return await cloned.text()
      }
    }
    catch (error) {
      return { error: 'Failed to capture body', message: error instanceof Error ? error.message : String(error) }
    }

    return undefined
  }

  private createSpan(
    traceId: string,
    spanId: string,
    operationName: string,
    parentSpanId?: string,
  ): TraceSpan {
    return {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime: performance.now(),
      tags: {},
      logs: [],
      status: 'ok',
    }
  }

  private addSpanTag(spanId: string, key: string, value: any): void {
    const span = this.spans.get(spanId)
    if (span) {
      span.tags[key] = value
    }
  }

  private addSpanLog(
    spanId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, any>,
  ): void {
    const span = this.spans.get(spanId)
    if (span) {
      span.logs.push({
        timestamp: performance.now(),
        level,
        message,
        fields,
      })
    }
  }

  private finishSpan(spanId: string, status: 'ok' | 'error' | 'timeout' = 'ok', error?: string): void {
    const span = this.spans.get(spanId)
    if (span) {
      span.endTime = performance.now()
      span.duration = span.endTime - span.startTime
      span.status = status
      if (error) {
        span.error = error
        if (this.options.includeHeaders) {
          span.stackTrace = new Error('Trace error stack').stack?.split('\n')
        }
      }

      // Move to export queue
      this.exportQueue.push(span)
      this.spans.delete(spanId)
    }
  }

  private async exportSpans(): Promise<void> {
    // For debugging
    console.warn(`[RequestTracer] Exporting spans, queue size: ${this.exportQueue.length}, active spans: ${this.spans.size}`)

    if (this.exportQueue.length === 0) {
      // Also check if there are any finished spans that need to be exported
      // This ensures spans are exported even if they weren't properly moved to the queue
      const finishedSpans = Array.from(this.spans.values()).filter(span => span.endTime !== undefined)
      if (finishedSpans.length > 0) {
        console.warn(`[RequestTracer] Found ${finishedSpans.length} finished spans to export`)
        // Move finished spans to export queue
        this.exportQueue.push(...finishedSpans)
        // Remove them from the spans map
        for (const span of finishedSpans) {
          this.spans.delete(span.spanId)
        }
      }

      // If still no spans to export, return
      if (this.exportQueue.length === 0) {
        return
      }
    }

    const spansToExport = [...this.exportQueue]
    this.exportQueue = []

    // Make sure we have exporters configured
    const exporters = this.options.exporters || []
    if (exporters.length === 0) {
      // Default to console if no exporters configured
      this.exportToConsole(spansToExport)
      return
    }

    for (const exporter of exporters) {
      try {
        switch (exporter.type) {
          case 'console':
            this.exportToConsole(spansToExport)
            break
          case 'jaeger':
            await this.exportToJaeger(spansToExport, exporter)
            break
          case 'zipkin':
            await this.exportToZipkin(spansToExport, exporter)
            break
          case 'custom':
            if (typeof exporter.customExporter === 'function') {
              await exporter.customExporter(spansToExport)
            }
            break
        }
      }
      catch (error) {
        // Use allowed console method
        console.warn(`Failed to export spans to ${exporter.type}:`, error)
      }
    }
  }

  private exportToConsole(spans: TraceSpan[]): void {
    for (const span of spans) {
      // Use allowed console method
      console.warn('Trace Span:', {
        traceId: span.traceId,
        spanId: span.spanId,
        operation: span.operationName,
        duration: `${Math.round((span.duration || 0) * 100) / 100}ms`,
        status: span.status,
        tags: span.tags,
        logs: span.logs.length,
        error: span.error,
      })
    }
  }

  private async exportToJaeger(spans: TraceSpan[], exporter: any): Promise<void> {
    if (!exporter.endpoint)
      return

    const jaegerSpans = spans.map(span => ({
      traceID: span.traceId,
      spanID: span.spanId,
      parentSpanID: span.parentSpanId,
      operationName: span.operationName,
      startTime: Math.floor(span.startTime * 1000), // microseconds
      duration: Math.floor((span.duration || 0) * 1000),
      tags: Object.entries(span.tags).map(([key, value]) => ({
        key,
        type: typeof value === 'string' ? 'string' : 'number',
        value: String(value),
      })),
      logs: span.logs.map(log => ({
        timestamp: Math.floor(log.timestamp * 1000),
        fields: [
          { key: 'level', value: log.level },
          { key: 'message', value: log.message },
          ...(log.fields ? Object.entries(log.fields).map(([k, v]) => ({ key: k, value: String(v) })) : []),
        ],
      })),
      process: {
        serviceName: 'bun-router',
        tags: [
          { key: 'hostname', value: Bun.env.HOSTNAME || 'localhost' },
          { key: 'pid', value: String(123) }, // Use a placeholder since Bun.pid is not available
        ],
      },
    }))

    await fetch(`${exporter.endpoint}/api/traces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...exporter.headers,
      },
      body: JSON.stringify({ data: [{ spans: jaegerSpans }] }),
    })
  }

  private async exportToZipkin(spans: TraceSpan[], exporter: any): Promise<void> {
    if (!exporter.endpoint)
      return

    const zipkinSpans = spans.map(span => ({
      traceId: span.traceId,
      id: span.spanId,
      parentId: span.parentSpanId,
      name: span.operationName,
      timestamp: Math.floor(span.startTime * 1000), // microseconds
      duration: Math.floor((span.duration || 0) * 1000),
      kind: 'SERVER',
      localEndpoint: {
        serviceName: 'bun-router',
      },
      tags: span.tags,
      annotations: span.logs.map(log => ({
        timestamp: Math.floor(log.timestamp * 1000),
        value: `${log.level}: ${log.message}`,
      })),
    }))

    await fetch(`${exporter.endpoint}/api/v2/spans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...exporter.headers,
      },
      body: JSON.stringify(zipkinSpans),
    })
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    if (!this.options.enabled || !this.shouldSample()) {
      const response = await next()
      return response || new Response('Internal Server Error', { status: 500 })
    }

    const requestId = req.requestId || this.generateId()
    const propagation = this.extractPropagationHeaders(req)
    const traceId = propagation.traceId || this.generateId()
    const spanId = this.generateId()
    const url = new URL(req.url)

    // For debugging
    console.warn(`[RequestTracer] Creating span for ${req.method} ${url.pathname}, traceId=${traceId}, spanId=${spanId}`)

    // Create main request span
    const span = this.createSpan(
      traceId,
      spanId,
      `${req.method} ${url.pathname}`,
      propagation.parentSpanId,
    )

    this.spans.set(spanId, span)
    this.activeSpans.set(requestId, spanId)

    // Add trace info to request
    req.traceId = traceId
    req.spanId = spanId

    // Ensure these properties are accessible
    Object.defineProperties(req, {
      traceId: {
        value: traceId,
        writable: true,
        enumerable: true,
        configurable: true,
      },
      spanId: {
        value: spanId,
        writable: true,
        enumerable: true,
        configurable: true,
      },
    })

    // Add basic tags
    this.addSpanTag(spanId, 'http.method', req.method)
    this.addSpanTag(spanId, 'http.url', req.url)
    this.addSpanTag(spanId, 'http.path', url.pathname)
    this.addSpanTag(spanId, 'user_agent', req.headers.get('user-agent'))

    if (this.options.includeHeaders) {
      const headers: Record<string, string> = {}
      for (const [key, value] of req.headers.entries()) {
        headers[key] = value
      }
      this.addSpanTag(spanId, 'http.headers', headers)
    }

    if (this.options.includeQueryParams && url.searchParams.size > 0) {
      const params: Record<string, string> = {}
      for (const [key, value] of url.searchParams.entries()) {
        params[key] = value
      }
      this.addSpanTag(spanId, 'http.query_params', params)
    }

    // Capture request body if enabled
    if (this.options.includeRequestBody && req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        const body = await this.captureRequestBody(req)
        if (body !== undefined) {
          this.addSpanTag(spanId, 'http.request_body', body)
        }
      }
      catch (error) {
        this.addSpanLog(spanId, 'warn', 'Failed to capture request body', { error: String(error) })
      }
    }

    this.addSpanLog(spanId, 'info', 'Request started')

    let response: Response
    let error: string | undefined

    try {
      const nextResponse = await next()
      response = nextResponse || new Response('Internal Server Error', { status: 500 })

      // Add response tags
      this.addSpanTag(spanId, 'http.status_code', response.status)
      this.addSpanTag(spanId, 'http.status_text', response.statusText)

      if (this.options.includeResponseBody) {
        try {
          const body = await this.captureResponseBody(response)
          if (body !== undefined) {
            this.addSpanTag(spanId, 'http.response_body', body)
          }
        }
        catch (err) {
          this.addSpanLog(spanId, 'warn', 'Failed to capture response body', { error: String(err) })
        }
      }

      this.addSpanLog(spanId, 'info', 'Request completed', {
        status: response.status,
        statusText: response.statusText,
      })

      // Mark as error if status code is 4xx or 5xx
      const isError = response.status >= 400
      if (isError) {
        this.addSpanTag(spanId, 'error', true)
        this.addSpanTag(spanId, 'error.status_code', response.status)
      }

      this.finishSpan(spanId, isError ? 'error' : 'ok', isError ? `HTTP ${response.status}` : undefined)
    }
    catch (err) {
      error = err instanceof Error ? err.message : String(err)
      this.addSpanTag(spanId, 'error', true)
      this.addSpanTag(spanId, 'error.message', error)
      this.addSpanTag(spanId, 'error.type', err instanceof Error ? err.constructor.name : 'Unknown')
      this.addSpanLog(spanId, 'error', 'Request failed', { error })

      // Ensure the span is properly finished with error status
      this.finishSpan(spanId, 'error', error)

      // Force immediate export of this error span
      const errorSpan = this.spans.get(spanId)
      if (errorSpan) {
        // Make sure it's finished
        if (errorSpan.endTime === undefined) {
          errorSpan.endTime = performance.now()
          errorSpan.duration = errorSpan.endTime - errorSpan.startTime
          errorSpan.status = 'error'
          errorSpan.error = error
        }

        // Add to export queue and remove from spans
        this.exportQueue.push(errorSpan)
        this.spans.delete(spanId)

        // Force immediate export
        this.exportSpans().catch((exportErr) => {
          console.warn('Failed to export error span:', exportErr)
        })
      }

      response = new Response('Internal Server Error', { status: 500 })
    }

    // Cleanup
    this.activeSpans.delete(requestId)

    // Add trace headers to response for propagation
    if (this.options.propagation?.enabled) {
      response.headers.set('x-trace-id', traceId)
      response.headers.set('x-span-id', spanId)
    }

    return response
  }

  // Public API methods
  getActiveSpans(): TraceSpan[] {
    return Array.from(this.spans.values())
  }

  getSpanById(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId)
  }

  createChildSpan(parentSpanId: string, operationName: string): string | null {
    const parentSpan = this.spans.get(parentSpanId)
    if (!parentSpan)
      return null

    const childSpanId = this.generateId()
    const childSpan = this.createSpan(
      parentSpan.traceId,
      childSpanId,
      operationName,
      parentSpanId,
    )

    this.spans.set(childSpanId, childSpan)
    return childSpanId
  }

  addTag(spanId: string, key: string, value: any): void {
    this.addSpanTag(spanId, key, value)
  }

  addLog(spanId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, fields?: Record<string, any>): void {
    this.addSpanLog(spanId, level, message, fields)
  }

  finish(spanId: string, status: 'ok' | 'error' | 'timeout' = 'ok', error?: string): void {
    this.finishSpan(spanId, status, error)
  }

  async flush(): Promise<void> {
    // Force all active spans to be finished and exported
    const activeSpanIds = Array.from(this.spans.keys())
    console.warn(`[RequestTracer] Flushing ${activeSpanIds.length} active spans`)

    // Finish any active spans
    for (const spanId of activeSpanIds) {
      const span = this.spans.get(spanId)
      if (span && !span.endTime) {
        this.finishSpan(spanId, 'ok')
      }
    }

    // Export all spans in the queue
    await this.exportSpans()
  }

  destroy(): void {
    if (this.exportInterval) {
      clearInterval(this.exportInterval)
    }
    this.spans.clear()
    this.activeSpans.clear()
    this.exportQueue = []
  }
}

// Factory function for easy use
export function requestTracer(options: TracingOptions = {}): (req: EnhancedRequest, next: NextFunction) => Promise<Response> {
  const instance = new RequestTracer(options)
  return async (req: EnhancedRequest, next: NextFunction) => instance.handle(req, next)
}
