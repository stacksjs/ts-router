/**
 * Observability & Monitoring - Request Correlation IDs across Services
 *
 * Enterprise-grade request correlation for distributed systems tracing
 */

import type { EnhancedRequest } from '../types'

export interface CorrelationConfig {
  headerName?: string
  generateId?: () => string
  propagateHeaders?: string[]
  enableLogging?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  maxIdLength?: number
  validateId?: (id: string) => boolean
}

export interface CorrelationContext {
  correlationId: string
  parentId?: string
  spanId?: string
  traceId?: string
  userId?: string
  sessionId?: string
  requestId?: string
  metadata: Record<string, any>
  startTime: number
  headers: Record<string, string>
}

export interface ServiceCall {
  serviceName: string
  method: string
  url: string
  correlationId: string
  parentId?: string
  startTime: number
  endTime?: number
  duration?: number
  status?: number
  error?: string
  metadata?: Record<string, any>
}

/**
 * Correlation ID manager
 */
export class CorrelationManager {
  private config: CorrelationConfig
  private contexts = new Map<string, CorrelationContext>()
  private serviceCalls = new Map<string, ServiceCall[]>()
  private activeRequests = new Set<string>()

  constructor(config: CorrelationConfig = {}) {
    this.config = {
      headerName: 'x-correlation-id',
      generateId: this.generateUUID,
      propagateHeaders: [
        'x-correlation-id',
        'x-request-id',
        'x-trace-id',
        'x-span-id',
        'x-user-id',
        'x-session-id',
      ],
      enableLogging: true,
      logLevel: 'info',
      maxIdLength: 128,
      validateId: this.isValidId,
      ...config,
    }
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Validate correlation ID format
   */
  private isValidId(id: string): boolean {
    return typeof id === 'string'
      && id.length > 0
      && id.length <= 128
      && /^[\w\-]+$/.test(id)
  }

  /**
   * Extract correlation context from request
   */
  extractContext(req: EnhancedRequest): CorrelationContext {
    const headers = req.headers

    // Try to get existing correlation ID
    let correlationId = headers.get(this.config.headerName!)
      || headers.get('x-request-id')
      || headers.get('x-trace-id')

    // Generate new ID if not found or invalid
    if (!correlationId || !this.config.validateId!(correlationId)) {
      correlationId = this.config.generateId!()
    }

    // Extract other correlation headers
    const parentId = headers.get('x-parent-id')
    const spanId = headers.get('x-span-id')
    const traceId = headers.get('x-trace-id')
    const userId = headers.get('x-user-id')
    const sessionId = headers.get('x-session-id')
    const requestId = headers.get('x-request-id')

    // Build propagation headers
    const propagationHeaders: Record<string, string> = {}
    for (const headerName of this.config.propagateHeaders!) {
      const value = headers.get(headerName)
      if (value) {
        propagationHeaders[headerName] = value
      }
    }

    // Ensure correlation ID is in propagation headers
    propagationHeaders[this.config.headerName!] = correlationId

    const context: CorrelationContext = {
      correlationId,
      parentId: parentId || undefined,
      spanId: spanId || undefined,
      traceId: traceId || correlationId,
      userId: userId || undefined,
      sessionId: sessionId || undefined,
      requestId: requestId || correlationId,
      metadata: {
        method: req.method,
        url: req.url,
        userAgent: headers.get('user-agent') || '',
        remoteAddr: headers.get('x-forwarded-for')
          || headers.get('x-real-ip')
          || 'unknown',
      },
      startTime: Date.now(),
      headers: propagationHeaders,
    }

    // Store context
    this.contexts.set(correlationId, context)
    this.activeRequests.add(correlationId)

    // Log context creation
    if (this.config.enableLogging) {
      this.log('info', `Created correlation context: ${correlationId}`, {
        correlationId,
        method: req.method,
        url: req.url,
        parentId,
      })
    }

    return context
  }

  /**
   * Get correlation context by ID
   */
  getContext(correlationId: string): CorrelationContext | undefined {
    return this.contexts.get(correlationId)
  }

  /**
   * Update correlation context
   */
  updateContext(correlationId: string, updates: Partial<CorrelationContext>): void {
    const context = this.contexts.get(correlationId)
    if (context) {
      Object.assign(context, updates)
      this.contexts.set(correlationId, context)
    }
  }

  /**
   * Add metadata to correlation context
   */
  addMetadata(correlationId: string, metadata: Record<string, any>): void {
    const context = this.contexts.get(correlationId)
    if (context) {
      Object.assign(context.metadata, metadata)
    }
  }

  /**
   * Create child correlation context
   */
  createChildContext(parentId: string, serviceName: string): CorrelationContext {
    const parent = this.contexts.get(parentId)
    if (!parent) {
      throw new Error(`Parent context not found: ${parentId}`)
    }

    const childId = this.config.generateId!()
    const childContext: CorrelationContext = {
      correlationId: childId,
      parentId: parent.correlationId,
      spanId: childId,
      traceId: parent.traceId,
      userId: parent.userId,
      sessionId: parent.sessionId,
      requestId: parent.requestId,
      metadata: {
        ...parent.metadata,
        serviceName,
        parentService: parent.metadata.serviceName,
      },
      startTime: Date.now(),
      headers: {
        ...parent.headers,
        [this.config.headerName!]: childId,
        'x-parent-id': parent.correlationId,
        'x-span-id': childId,
      },
    }

    this.contexts.set(childId, childContext)
    this.activeRequests.add(childId)

    return childContext
  }

  /**
   * Record service call
   */
  recordServiceCall(call: Omit<ServiceCall, 'startTime'>): void {
    const serviceCall: ServiceCall = {
      ...call,
      startTime: Date.now(),
    }

    const calls = this.serviceCalls.get(call.correlationId) || []
    calls.push(serviceCall)
    this.serviceCalls.set(call.correlationId, calls)

    if (this.config.enableLogging) {
      this.log('debug', `Service call started: ${call.serviceName}`, {
        correlationId: call.correlationId,
        service: call.serviceName,
        method: call.method,
        url: call.url,
      })
    }
  }

  /**
   * Complete service call
   */
  completeServiceCall(
    correlationId: string,
    serviceName: string,
    status: number,
    error?: string,
    metadata?: Record<string, any>,
  ): void {
    const calls = this.serviceCalls.get(correlationId) || []
    const call = calls.find(c => c.serviceName === serviceName && !c.endTime)

    if (call) {
      call.endTime = Date.now()
      call.duration = call.endTime - call.startTime
      call.status = status
      call.error = error
      call.metadata = metadata

      if (this.config.enableLogging) {
        const level = status >= 400 ? 'warn' : 'debug'
        this.log(level, `Service call completed: ${serviceName}`, {
          correlationId,
          service: serviceName,
          status,
          duration: call.duration,
          error,
        })
      }
    }
  }

  /**
   * Get service calls for correlation ID
   */
  getServiceCalls(correlationId: string): ServiceCall[] {
    return this.serviceCalls.get(correlationId) || []
  }

  /**
   * Finish correlation context
   */
  finishContext(correlationId: string, status?: number, error?: string): void {
    const context = this.contexts.get(correlationId)
    if (context) {
      const duration = Date.now() - context.startTime

      // Add completion metadata
      context.metadata.endTime = Date.now()
      context.metadata.duration = duration
      context.metadata.status = status
      context.metadata.error = error

      this.activeRequests.delete(correlationId)

      if (this.config.enableLogging) {
        const level = status && status >= 400 ? 'warn' : 'info'
        this.log(level, `Correlation context finished: ${correlationId}`, {
          correlationId,
          duration,
          status,
          error,
          serviceCalls: this.getServiceCalls(correlationId).length,
        })
      }
    }
  }

  /**
   * Create HTTP client with correlation propagation
   */
  createHttpClient(correlationId: string) {
    const context = this.contexts.get(correlationId)
    if (!context) {
      throw new Error(`Correlation context not found: ${correlationId}`)
    }

    return {
      fetch: async (url: string, options: RequestInit = {}): Promise<Response> => {
        const serviceName = new URL(url).hostname

        // Record service call start
        this.recordServiceCall({
          serviceName,
          method: options.method || 'GET',
          url,
          correlationId,
          parentId: context.correlationId,
        })

        // Add correlation headers
        const headers = new Headers(options.headers)
        Object.entries(context.headers).forEach(([key, value]) => {
          headers.set(key, value)
        })

        try {
          const response = await fetch(url, {
            ...options,
            headers,
          })

          // Record completion
          this.completeServiceCall(
            correlationId,
            serviceName,
            response.status,
            response.ok ? undefined : `HTTP ${response.status}`,
            {
              responseHeaders: Object.fromEntries(response.headers.entries()),
            },
          )

          return response
        }
        catch (error) {
          // Record error
          this.completeServiceCall(
            correlationId,
            serviceName,
            0,
            error instanceof Error ? error.message : String(error),
          )
          throw error
        }
      },

      get: (url: string, options?: RequestInit) =>
        this.createHttpClient(correlationId).fetch(url, { ...options, method: 'GET' }),

      post: (url: string, options?: RequestInit) =>
        this.createHttpClient(correlationId).fetch(url, { ...options, method: 'POST' }),

      put: (url: string, options?: RequestInit) =>
        this.createHttpClient(correlationId).fetch(url, { ...options, method: 'PUT' }),

      delete: (url: string, options?: RequestInit) =>
        this.createHttpClient(correlationId).fetch(url, { ...options, method: 'DELETE' }),
    }
  }

  /**
   * Get correlation trace
   */
  getTrace(correlationId: string): {
    context: CorrelationContext
    serviceCalls: ServiceCall[]
    children: string[]
  } | null {
    const context = this.contexts.get(correlationId)
    if (!context)
      return null

    const serviceCalls = this.getServiceCalls(correlationId)

    // Find child contexts
    const children = Array.from(this.contexts.values())
      .filter(ctx => ctx.parentId === correlationId)
      .map(ctx => ctx.correlationId)

    return {
      context,
      serviceCalls,
      children,
    }
  }

  /**
   * Get full trace tree
   */
  getFullTrace(rootCorrelationId: string): any {
    const buildTrace = (correlationId: string): any => {
      const trace = this.getTrace(correlationId)
      if (!trace)
        return null

      return {
        ...trace,
        children: trace.children.map(childId => buildTrace(childId)).filter(Boolean),
      }
    }

    return buildTrace(rootCorrelationId)
  }

  /**
   * Cleanup old contexts
   */
  cleanup(maxAge = 3600000): void { // 1 hour default
    const cutoff = Date.now() - maxAge

    for (const [id, context] of this.contexts.entries()) {
      if (context.startTime < cutoff && !this.activeRequests.has(id)) {
        this.contexts.delete(id)
        this.serviceCalls.delete(id)
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeContexts: number
    totalContexts: number
    totalServiceCalls: number
    averageCallsPerContext: number
  } {
    const totalServiceCalls = Array.from(this.serviceCalls.values())
      .reduce((sum, calls) => sum + calls.length, 0)

    return {
      activeContexts: this.activeRequests.size,
      totalContexts: this.contexts.size,
      totalServiceCalls,
      averageCallsPerContext: this.contexts.size > 0 ? totalServiceCalls / this.contexts.size : 0,
    }
  }

  /**
   * Log with correlation context
   */
  private log(level: string, message: string, data: any): void {
    if (!this.config.enableLogging)
      return

    const logData = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    }

    console.log(`[CORRELATION] ${JSON.stringify(logData)}`)
  }
}

/**
 * Global correlation manager
 */
let globalCorrelationManager: CorrelationManager | null = null

/**
 * Initialize global correlation manager
 */
export function initializeCorrelation(config?: CorrelationConfig): CorrelationManager {
  globalCorrelationManager = new CorrelationManager(config)
  return globalCorrelationManager
}

/**
 * Get global correlation manager
 */
export function getCorrelationManager(): CorrelationManager | null {
  return globalCorrelationManager
}

/**
 * Correlation middleware factory
 */
export function createCorrelationMiddleware(config?: Partial<CorrelationConfig>) {
  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    const manager = getCorrelationManager()
    if (!manager) {
      return await next()
    }

    // Extract correlation context
    const context = manager.extractContext(req)

    // Add context to request
    ;(req as any).correlationId = context.correlationId
    ;(req as any).correlationContext = context
    ;(req as any).httpClient = manager.createHttpClient(context.correlationId)

    let response: Response
    try {
      response = await next()

      // Finish context with success
      manager.finishContext(context.correlationId, response.status)
    }
    catch (error) {
      // Finish context with error
      manager.finishContext(
        context.correlationId,
        500,
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }

    // Add correlation headers to response
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set(config?.headerName || 'x-correlation-id', context.correlationId)
    responseHeaders.set('x-request-id', context.requestId || context.correlationId)

    if (context.traceId) {
      responseHeaders.set('x-trace-id', context.traceId)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  }
}

/**
 * Correlation helper functions
 */
export const CorrelationHelpers = {
  /**
   * Get correlation ID from request
   */
  getId: (req: EnhancedRequest): string | null => {
    return (req as any).correlationId || null
  },

  /**
   * Get correlation context from request
   */
  getContext: (req: EnhancedRequest): CorrelationContext | null => {
    return (req as any).correlationContext || null
  },

  /**
   * Get HTTP client from request
   */
  getHttpClient: (req: EnhancedRequest): any => {
    return (req as any).httpClient || null
  },

  /**
   * Add metadata to current correlation
   */
  addMetadata: (req: EnhancedRequest, metadata: Record<string, any>): void => {
    const manager = getCorrelationManager()
    const correlationId = CorrelationHelpers.getId(req)

    if (manager && correlationId) {
      manager.addMetadata(correlationId, metadata)
    }
  },

  /**
   * Create child context for service call
   */
  createChild: (req: EnhancedRequest, serviceName: string): CorrelationContext | null => {
    const manager = getCorrelationManager()
    const correlationId = CorrelationHelpers.getId(req)

    if (manager && correlationId) {
      return manager.createChildContext(correlationId, serviceName)
    }

    return null
  },

  /**
   * Get trace for current request
   */
  getTrace: (req: EnhancedRequest): any => {
    const manager = getCorrelationManager()
    const correlationId = CorrelationHelpers.getId(req)

    if (manager && correlationId) {
      return manager.getFullTrace(correlationId)
    }

    return null
  },
}

/**
 * Correlation endpoint handlers
 */
export const CorrelationEndpoints = {
  /**
   * Get correlation trace endpoint
   */
  trace: async (req: EnhancedRequest): Promise<Response> => {
    const manager = getCorrelationManager()
    if (!manager) {
      return new Response('Correlation not initialized', { status: 500 })
    }

    const url = new URL(req.url)
    const correlationId = url.searchParams.get('id') || CorrelationHelpers.getId(req)

    if (!correlationId) {
      return new Response('Correlation ID required', { status: 400 })
    }

    const trace = manager.getFullTrace(correlationId)
    if (!trace) {
      return new Response('Trace not found', { status: 404 })
    }

    return new Response(JSON.stringify(trace, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    })
  },

  /**
   * Get correlation statistics endpoint
   */
  stats: async (req: EnhancedRequest): Promise<Response> => {
    const manager = getCorrelationManager()
    if (!manager) {
      return new Response('Correlation not initialized', { status: 500 })
    }

    const stats = manager.getStats()

    return new Response(JSON.stringify(stats, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    })
  },
}
