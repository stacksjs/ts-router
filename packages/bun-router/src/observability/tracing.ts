/**
 * Observability & Monitoring - Distributed Tracing with OpenTelemetry
 *
 * Enterprise-grade distributed tracing for request correlation and performance monitoring
 */

import type { EnhancedRequest } from '../types'

export interface TraceConfig {
  serviceName: string
  serviceVersion?: string
  environment?: string
  endpoint?: string
  headers?: Record<string, string>
  sampleRate?: number
  enableConsoleExporter?: boolean
  enableJaegerExporter?: boolean
  enableOTLPExporter?: boolean
  jaegerEndpoint?: string
  otlpEndpoint?: string
  attributes?: Record<string, any>
}

export interface SpanContext {
  traceId: string
  spanId: string
  parentSpanId?: string
  flags: number
  baggage?: Record<string, string>
}

export interface Span {
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
    fields: Record<string, any>
  }>
  status: 'ok' | 'error' | 'timeout'
  statusMessage?: string
}

export interface TraceData {
  traceId: string
  spans: Span[]
  startTime: number
  endTime?: number
  duration?: number
  serviceName: string
  environment: string
}

/**
 * Distributed tracing implementation
 */
export class DistributedTracer {
  private config: TraceConfig
  private activeSpans: Map<string, Span> = new Map()
  private traces: Map<string, TraceData> = new Map()
  private spanCounter = 0

  constructor(config: TraceConfig) {
    this.config = {
      sampleRate: 1.0,
      environment: 'development',
      enableConsoleExporter: true,
      ...config,
    }
  }

  /**
   * Generate trace ID
   */
  generateTraceId(): string {
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)).join('')
  }

  /**
   * Generate span ID
   */
  generateSpanId(): string {
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)).join('')
  }

  /**
   * Start a new trace
   */
  startTrace(operationName: string, parentContext?: SpanContext): Span {
    const traceId = parentContext?.traceId || this.generateTraceId()
    const spanId = this.generateSpanId()

    const span: Span = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      operationName,
      startTime: Date.now(),
      tags: {
        'service.name': this.config.serviceName,
        'service.version': this.config.serviceVersion || '1.0.0',
        'environment': this.config.environment,
        ...this.config.attributes,
      },
      logs: [],
      status: 'ok',
    }

    this.activeSpans.set(spanId, span)

    // Initialize trace data if not exists
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, {
        traceId,
        spans: [],
        startTime: Date.now(),
        serviceName: this.config.serviceName,
        environment: this.config.environment || 'development',
      })
    }

    return span
  }

  /**
   * Start a child span
   */
  startChildSpan(operationName: string, parentSpan: Span): Span {
    return this.startTrace(operationName, {
      traceId: parentSpan.traceId,
      spanId: parentSpan.spanId,
      flags: 1,
    })
  }

  /**
   * Finish a span
   */
  finishSpan(span: Span): void {
    span.endTime = Date.now()
    span.duration = span.endTime - span.startTime

    // Add span to trace
    const trace = this.traces.get(span.traceId)
    if (trace) {
      trace.spans.push({ ...span })

      // Update trace end time and duration
      trace.endTime = Math.max(trace.endTime || 0, span.endTime)
      if (trace.startTime) {
        trace.duration = trace.endTime - trace.startTime
      }
    }

    this.activeSpans.delete(span.spanId)

    // Export span if sampling allows
    if (this.shouldSample()) {
      this.exportSpan(span)
    }
  }

  /**
   * Add tags to span
   */
  setSpanTags(span: Span, tags: Record<string, any>): void {
    Object.assign(span.tags, tags)
  }

  /**
   * Add log to span
   */
  logToSpan(span: Span, fields: Record<string, any>): void {
    span.logs.push({
      timestamp: Date.now(),
      fields,
    })
  }

  /**
   * Set span status
   */
  setSpanStatus(span: Span, status: 'ok' | 'error' | 'timeout', message?: string): void {
    span.status = status
    if (message) {
      span.statusMessage = message
    }
  }

  /**
   * Extract trace context from headers
   */
  extractTraceContext(headers: Headers): SpanContext | null {
    // Support for multiple trace header formats
    const traceParent = headers.get('traceparent')
    const traceState = headers.get('tracestate')
    const jaegerTrace = headers.get('uber-trace-id')
    const b3Trace = headers.get('x-b3-traceid')

    if (traceParent) {
      return this.parseTraceParent(traceParent)
    }

    if (jaegerTrace) {
      return this.parseJaegerTrace(jaegerTrace)
    }

    if (b3Trace) {
      return this.parseB3Trace(headers)
    }

    return null
  }

  /**
   * Inject trace context into headers
   */
  injectTraceContext(span: Span, headers: Record<string, string>): void {
    // W3C Trace Context format
    const traceParent = `00-${span.traceId}-${span.spanId}-01`
    headers.traceparent = traceParent

    // Add correlation ID
    headers['x-correlation-id'] = span.traceId
    headers['x-span-id'] = span.spanId
  }

  /**
   * Parse W3C traceparent header
   */
  private parseTraceParent(traceParent: string): SpanContext | null {
    const parts = traceParent.split('-')
    if (parts.length !== 4)
      return null

    const [version, traceId, spanId, flags] = parts
    if (version !== '00')
      return null

    return {
      traceId,
      spanId,
      flags: Number.parseInt(flags, 16),
    }
  }

  /**
   * Parse Jaeger trace header
   */
  private parseJaegerTrace(jaegerTrace: string): SpanContext | null {
    const parts = jaegerTrace.split(':')
    if (parts.length < 4)
      return null

    const [traceId, spanId, parentSpanId, flags] = parts

    return {
      traceId: traceId.padStart(32, '0'),
      spanId: spanId.padStart(16, '0'),
      parentSpanId: parentSpanId !== '0' ? parentSpanId.padStart(16, '0') : undefined,
      flags: Number.parseInt(flags, 16),
    }
  }

  /**
   * Parse B3 trace headers
   */
  private parseB3Trace(headers: Headers): SpanContext | null {
    const traceId = headers.get('x-b3-traceid')
    const spanId = headers.get('x-b3-spanid')
    const parentSpanId = headers.get('x-b3-parentspanid')
    const flags = headers.get('x-b3-flags') || headers.get('x-b3-sampled')

    if (!traceId || !spanId)
      return null

    return {
      traceId: traceId.padStart(32, '0'),
      spanId: spanId.padStart(16, '0'),
      parentSpanId: parentSpanId?.padStart(16, '0'),
      flags: flags ? Number.parseInt(flags, 16) : 0,
    }
  }

  /**
   * Check if span should be sampled
   */
  private shouldSample(): boolean {
    return Math.random() < (this.config.sampleRate || 1.0)
  }

  /**
   * Export span to configured exporters
   */
  private exportSpan(span: Span): void {
    if (this.config.enableConsoleExporter) {
      this.exportToConsole(span)
    }

    if (this.config.enableJaegerExporter && this.config.jaegerEndpoint) {
      this.exportToJaeger(span)
    }

    if (this.config.enableOTLPExporter && this.config.otlpEndpoint) {
      this.exportToOTLP(span)
    }
  }

  /**
   * Export to console
   */
  private exportToConsole(span: Span): void {
    console.log(`[TRACE] ${span.operationName}`, {
      traceId: span.traceId,
      spanId: span.spanId,
      duration: span.duration,
      status: span.status,
      tags: span.tags,
    })
  }

  /**
   * Export to Jaeger (simplified)
   */
  private async exportToJaeger(span: Span): Promise<void> {
    try {
      const jaegerSpan = {
        traceID: span.traceId,
        spanID: span.spanId,
        parentSpanID: span.parentSpanId,
        operationName: span.operationName,
        startTime: span.startTime * 1000, // microseconds
        duration: (span.duration || 0) * 1000,
        tags: Object.entries(span.tags).map(([key, value]) => ({
          key,
          type: typeof value === 'string' ? 'string' : 'number',
          value: String(value),
        })),
        logs: span.logs.map(log => ({
          timestamp: log.timestamp * 1000,
          fields: Object.entries(log.fields).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        })),
        process: {
          serviceName: this.config.serviceName,
          tags: [
            { key: 'service.version', value: this.config.serviceVersion || '1.0.0' },
            { key: 'environment', value: this.config.environment || 'development' },
          ],
        },
      }

      await fetch(`${this.config.jaegerEndpoint}/api/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify({
          data: [{
            traceID: span.traceId,
            spans: [jaegerSpan],
          }],
        }),
      })
    }
    catch (error) {
      console.error('Failed to export to Jaeger:', error)
    }
  }

  /**
   * Export to OTLP endpoint
   */
  private async exportToOTLP(span: Span): Promise<void> {
    try {
      const otlpSpan = {
        traceId: this.hexToBytes(span.traceId),
        spanId: this.hexToBytes(span.spanId),
        parentSpanId: span.parentSpanId ? this.hexToBytes(span.parentSpanId) : undefined,
        name: span.operationName,
        kind: 1, // SPAN_KIND_SERVER
        startTimeUnixNano: span.startTime * 1000000,
        endTimeUnixNano: (span.endTime || span.startTime) * 1000000,
        attributes: Object.entries(span.tags).map(([key, value]) => ({
          key,
          value: {
            stringValue: String(value),
          },
        })),
        events: span.logs.map(log => ({
          timeUnixNano: log.timestamp * 1000000,
          name: 'log',
          attributes: Object.entries(log.fields).map(([key, value]) => ({
            key,
            value: { stringValue: String(value) },
          })),
        })),
        status: {
          code: span.status === 'ok' ? 1 : 2,
          message: span.statusMessage,
        },
      }

      await fetch(`${this.config.otlpEndpoint}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-protobuf',
          ...this.config.headers,
        },
        body: JSON.stringify({
          resourceSpans: [{
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: this.config.serviceName } },
                { key: 'service.version', value: { stringValue: this.config.serviceVersion || '1.0.0' } },
              ],
            },
            instrumentationLibrarySpans: [{
              instrumentationLibrary: {
                name: 'bun-router',
                version: '1.0.0',
              },
              spans: [otlpSpan],
            }],
          }],
        }),
      })
    }
    catch (error) {
      console.error('Failed to export to OTLP:', error)
    }
  }

  /**
   * Convert hex string to bytes
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = Number.parseInt(hex.substr(i, 2), 16)
    }
    return bytes
  }

  /**
   * Get active spans
   */
  getActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values())
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): TraceData | undefined {
    return this.traces.get(traceId)
  }

  /**
   * Get all traces
   */
  getAllTraces(): TraceData[] {
    return Array.from(this.traces.values())
  }

  /**
   * Clear old traces (cleanup)
   */
  cleanup(maxAge = 3600000): void { // 1 hour default
    const cutoff = Date.now() - maxAge

    for (const [traceId, trace] of this.traces.entries()) {
      if (trace.startTime < cutoff) {
        this.traces.delete(traceId)
      }
    }
  }
}

/**
 * Global tracer instance
 */
let globalTracer: DistributedTracer | null = null

/**
 * Initialize global tracer
 */
export function initializeTracer(config: TraceConfig): DistributedTracer {
  globalTracer = new DistributedTracer(config)
  return globalTracer
}

/**
 * Get global tracer
 */
export function getTracer(): DistributedTracer | null {
  return globalTracer
}

/**
 * Tracing middleware factory
 */
export function createTracingMiddleware(config?: Partial<TraceConfig>) {
  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    const tracer = getTracer()
    if (!tracer) {
      return await next()
    }

    // Extract parent context from headers
    const parentContext = tracer.extractTraceContext(req.headers)

    // Start span for this request
    const span = tracer.startTrace(`${req.method} ${new URL(req.url).pathname}`, parentContext || undefined)

    // Add request tags
    tracer.setSpanTags(span, {
      'http.method': req.method,
      'http.url': req.url,
      'http.user_agent': req.headers.get('user-agent') || '',
      'http.remote_addr': req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    })

    // Add span to request for access in handlers
    ;(req as any).span = span
    ;(req as any).tracer = tracer

    let response: Response
    try {
      response = await next()

      // Add response tags
      tracer.setSpanTags(span, {
        'http.status_code': response.status,
        'http.response.size': response.headers.get('content-length') || '0',
      })

      // Set span status based on response
      if (response.status >= 400) {
        tracer.setSpanStatus(span, 'error', `HTTP ${response.status}`)
      }
      else {
        tracer.setSpanStatus(span, 'ok')
      }
    }
    catch (error) {
      // Log error and set span status
      tracer.logToSpan(span, {
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      tracer.setSpanStatus(span, 'error', error instanceof Error ? error.message : String(error))
      throw error
    }
    finally {
      // Finish span
      tracer.finishSpan(span)
    }

    // Inject trace context into response headers
    const responseHeaders = new Headers(response.headers)
    const traceHeaders: Record<string, string> = {}
    tracer.injectTraceContext(span, traceHeaders)

    Object.entries(traceHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  }
}

/**
 * Trace helper functions
 */
export const TraceHelpers = {
  /**
   * Start a span within a request context
   */
  startSpan: (req: EnhancedRequest, operationName: string): Span | null => {
    const tracer = (req as any).tracer as DistributedTracer
    const parentSpan = (req as any).span as Span

    if (!tracer || !parentSpan)
      return null

    return tracer.startChildSpan(operationName, parentSpan)
  },

  /**
   * Finish a span
   */
  finishSpan: (req: EnhancedRequest, span: Span): void => {
    const tracer = (req as any).tracer as DistributedTracer
    if (tracer) {
      tracer.finishSpan(span)
    }
  },

  /**
   * Add tags to current span
   */
  addTags: (req: EnhancedRequest, tags: Record<string, any>): void => {
    const tracer = (req as any).tracer as DistributedTracer
    const span = (req as any).span as Span

    if (tracer && span) {
      tracer.setSpanTags(span, tags)
    }
  },

  /**
   * Log to current span
   */
  log: (req: EnhancedRequest, fields: Record<string, any>): void => {
    const tracer = (req as any).tracer as DistributedTracer
    const span = (req as any).span as Span

    if (tracer && span) {
      tracer.logToSpan(span, fields)
    }
  },
}
