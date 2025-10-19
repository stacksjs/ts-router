/**
 * Development Tools - Route Debugging
 *
 * Comprehensive route debugging with detailed logging and inspection
 */

import type { EnhancedRequest } from '../types'

export interface RouteDebugConfig {
  enabled?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  includeHeaders?: boolean
  includeBody?: boolean
  includeParams?: boolean
  includeQuery?: boolean
  includeTimings?: boolean
  maxBodySize?: number
  colorOutput?: boolean
  outputFormat?: 'console' | 'json' | 'structured'
}

export interface RouteMatchAttempt {
  pattern: string
  method: string
  matched: boolean
  reason?: string
  params?: Record<string, string>
  score?: number
  timing: number
}

export interface RouteDebugInfo {
  requestId: string
  timestamp: number
  method: string
  url: string
  path: string
  headers?: Record<string, string>
  query?: Record<string, string>
  params?: Record<string, string>
  body?: any
  matchAttempts: RouteMatchAttempt[]
  finalMatch?: {
    pattern: string
    handler: string
    middleware: string[]
    params: Record<string, string>
  }
  timings: {
    routeMatching: number
    middlewareExecution: number
    handlerExecution: number
    total: number
  }
  performance: {
    memoryUsage: NodeJS.MemoryUsage
    cpuTime: number
  }
}

/**
 * Route debugger for development
 */
export class RouteDebugger {
  private config: RouteDebugConfig
  private debugSessions = new Map<string, RouteDebugInfo>()
  private routePatterns = new Map<string, { pattern: string, method: string, handler: Function, middleware: Function[] }>()

  constructor(config: RouteDebugConfig = {}) {
    this.config = {
      enabled: true,
      logLevel: 'debug',
      includeHeaders: true,
      includeBody: true,
      includeParams: true,
      includeQuery: true,
      includeTimings: true,
      maxBodySize: 1024 * 10, // 10KB
      colorOutput: true,
      outputFormat: 'console',
      ...config,
    }
  }

  /**
   * Start debugging a request
   */
  startDebugging(req: EnhancedRequest): string {
    if (!this.config.enabled)
      return ''

    const requestId = this.generateRequestId()
    const _startTime = performance.now()

    const debugInfo: RouteDebugInfo = {
      requestId,
      timestamp: Date.now(),
      method: req.method,
      url: req.url,
      path: new URL(req.url).pathname,
      matchAttempts: [],
      timings: {
        routeMatching: 0,
        middlewareExecution: 0,
        handlerExecution: 0,
        total: 0,
      },
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuTime: process.cpuUsage().user,
      },
    }

    // Include optional data based on config
    if (this.config.includeHeaders) {
      debugInfo.headers = Object.fromEntries(req.headers.entries())
    }

    if (this.config.includeQuery) {
      const url = new URL(req.url)
      debugInfo.query = Object.fromEntries(url.searchParams.entries())
    }

    if (this.config.includeParams && (req as any).params) {
      debugInfo.params = (req as any).params
    }

    if (this.config.includeBody && req.body) {
      this.captureRequestBody(req, debugInfo)
    }

    this.debugSessions.set(requestId, debugInfo)

    this.log('info', `🔍 Starting route debugging for ${req.method} ${debugInfo.path}`, {
      requestId,
      timestamp: new Date(debugInfo.timestamp).toISOString(),
    })

    return requestId
  }

  /**
   * Record route match attempt
   */
  recordMatchAttempt(
    requestId: string,
    pattern: string,
    method: string,
    matched: boolean,
    reason?: string,
    params?: Record<string, string>,
  ): void {
    if (!this.config.enabled || !requestId)
      return

    const debugInfo = this.debugSessions.get(requestId)
    if (!debugInfo)
      return

    const timing = performance.now()

    const attempt: RouteMatchAttempt = {
      pattern,
      method,
      matched,
      reason,
      params,
      timing,
    }

    debugInfo.matchAttempts.push(attempt)

    const status = matched ? '✅' : '❌'
    const reasonText = reason ? ` (${reason})` : ''

    this.log('debug', `${status} Route match: ${method} ${pattern}${reasonText}`, {
      requestId,
      pattern,
      method,
      matched,
      reason,
      params,
    })
  }

  /**
   * Record final route match
   */
  recordFinalMatch(
    requestId: string,
    pattern: string,
    handler: Function,
    middleware: Function[],
    params: Record<string, string>,
  ): void {
    if (!this.config.enabled || !requestId)
      return

    const debugInfo = this.debugSessions.get(requestId)
    if (!debugInfo)
      return

    debugInfo.finalMatch = {
      pattern,
      handler: handler.name || 'anonymous',
      middleware: middleware.map(m => m.name || 'anonymous'),
      params,
    }

    this.log('info', `🎯 Final route match: ${pattern}`, {
      requestId,
      pattern,
      handler: debugInfo.finalMatch.handler,
      middleware: debugInfo.finalMatch.middleware,
      params,
    })
  }

  /**
   * Record timing information
   */
  recordTiming(requestId: string, phase: keyof RouteDebugInfo['timings'], duration: number): void {
    if (!this.config.enabled || !requestId)
      return

    const debugInfo = this.debugSessions.get(requestId)
    if (!debugInfo)
      return

    debugInfo.timings[phase] = duration

    if (this.config.includeTimings) {
      this.log('debug', `⏱️  ${phase}: ${duration.toFixed(2)}ms`, {
        requestId,
        phase,
        duration,
      })
    }
  }

  /**
   * Finish debugging session
   */
  finishDebugging(requestId: string, response?: Response): RouteDebugInfo | null {
    if (!this.config.enabled || !requestId)
      return null

    const debugInfo = this.debugSessions.get(requestId)
    if (!debugInfo)
      return null

    // Calculate total time
    debugInfo.timings.total = Object.values(debugInfo.timings)
      .filter(t => t > 0)
      .reduce((sum, t) => sum + t, 0)

    // Update performance metrics
    const endMemory = process.memoryUsage()
    const endCpuTime = process.cpuUsage().user

    debugInfo.performance = {
      memoryUsage: {
        rss: endMemory.rss - debugInfo.performance.memoryUsage.rss,
        heapTotal: endMemory.heapTotal - debugInfo.performance.memoryUsage.heapTotal,
        heapUsed: endMemory.heapUsed - debugInfo.performance.memoryUsage.heapUsed,
        external: endMemory.external - debugInfo.performance.memoryUsage.external,
        arrayBuffers: endMemory.arrayBuffers - debugInfo.performance.memoryUsage.arrayBuffers,
      },
      cpuTime: endCpuTime - debugInfo.performance.cpuTime,
    }

    // Log summary
    this.logSummary(debugInfo, response)

    // Clean up session
    this.debugSessions.delete(requestId)

    return debugInfo
  }

  /**
   * Register route pattern for debugging
   */
  registerRoute(method: string, pattern: string, handler: Function, middleware: Function[] = []): void {
    const key = `${method}:${pattern}`
    this.routePatterns.set(key, { pattern, method, handler, middleware })
  }

  /**
   * Get all registered routes
   */
  getRegisteredRoutes(): Array<{ method: string, pattern: string, handler: string, middleware: string[] }> {
    return Array.from(this.routePatterns.values()).map(route => ({
      method: route.method,
      pattern: route.pattern,
      handler: route.handler.name || 'anonymous',
      middleware: route.middleware.map(m => m.name || 'anonymous'),
    }))
  }

  /**
   * Get debug session
   */
  getDebugSession(requestId: string): RouteDebugInfo | undefined {
    return this.debugSessions.get(requestId)
  }

  /**
   * Clear all debug sessions
   */
  clearSessions(): void {
    this.debugSessions.clear()
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Capture request body safely
   */
  private async captureRequestBody(req: EnhancedRequest, debugInfo: RouteDebugInfo): Promise<void> {
    try {
      if (req.headers.get('content-type')?.includes('application/json')) {
        const text = await req.text()
        if (text.length <= (this.config.maxBodySize || 1024 * 10)) {
          debugInfo.body = JSON.parse(text)
        }
        else {
          debugInfo.body = `[Body too large: ${text.length} bytes]`
        }
      }
      else if (req.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData()
        debugInfo.body = Object.fromEntries(formData.entries())
      }
    }
    catch (error) {
      debugInfo.body = `[Error reading body: ${error instanceof Error ? error.message : String(error)}]`
    }
  }

  /**
   * Log debug message
   */
  private log(level: string, message: string, data?: any): void {
    if (!this.shouldLog(level))
      return

    const timestamp = new Date().toISOString()

    switch (this.config.outputFormat) {
      case 'json':
        console.log(JSON.stringify({ timestamp, level, message, data }))
        break

      case 'structured':
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`)
        if (data)
          console.log('  Data:', JSON.stringify(data, null, 2))
        break

      default: // console
        if (this.config.colorOutput) {
          const colors = {
            debug: '\x1B[36m', // cyan
            info: '\x1B[32m', // green
            warn: '\x1B[33m', // yellow
            error: '\x1B[31m', // red
          }
          const reset = '\x1B[0m'
          const color = colors[level as keyof typeof colors] || ''
          console.log(`${color}[ROUTE-DEBUG]${reset} ${message}`)
        }
        else {
          console.log(`[ROUTE-DEBUG] ${message}`)
        }
        if (data && level !== 'debug') {
          console.log('  ', data)
        }
        break
    }
  }

  /**
   * Log debugging summary
   */
  private logSummary(debugInfo: RouteDebugInfo, response?: Response): void {
    const { timings, matchAttempts, finalMatch } = debugInfo

    this.log('info', `📊 Route debugging summary for ${debugInfo.method} ${debugInfo.path}`, {
      requestId: debugInfo.requestId,
      totalTime: `${timings.total.toFixed(2)}ms`,
      matchAttempts: matchAttempts.length,
      successfulMatch: !!finalMatch,
      responseStatus: response?.status,
      memoryDelta: `${(debugInfo.performance.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      cpuTime: `${(debugInfo.performance.cpuTime / 1000).toFixed(2)}ms`,
    })

    // Log failed matches if any
    const failedMatches = matchAttempts.filter(attempt => !attempt.matched)
    if (failedMatches.length > 0) {
      this.log('warn', `❌ ${failedMatches.length} failed route matches:`, failedMatches.map(attempt => `${attempt.method} ${attempt.pattern} (${attempt.reason})`),
      )
    }

    // Log performance warnings
    if (timings.total > 1000) {
      this.log('warn', `⚠️  Slow request detected: ${timings.total.toFixed(2)}ms`)
    }

    if (debugInfo.performance.memoryUsage.heapUsed > 50 * 1024 * 1024) { // 50MB
      this.log('warn', `⚠️  High memory usage: ${(debugInfo.performance.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`)
    }
  }

  /**
   * Check if should log at level
   */
  private shouldLog(level: string): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 }
    const currentLevel = levels[this.config.logLevel as keyof typeof levels] || 0
    const messageLevel = levels[level as keyof typeof levels] || 0
    return messageLevel >= currentLevel
  }
}

/**
 * Global route debugger instance
 */
let globalDebugger: RouteDebugger | null = null

/**
 * Initialize global route debugger
 */
export function initializeRouteDebugger(config?: RouteDebugConfig): RouteDebugger {
  globalDebugger = new RouteDebugger(config)
  return globalDebugger
}

/**
 * Get global route debugger
 */
export function getRouteDebugger(): RouteDebugger | null {
  return globalDebugger
}

/**
 * Route debugging middleware factory
 */
export function createRouteDebugMiddleware(config?: RouteDebugConfig) {
  const routeDebugger = globalDebugger || new RouteDebugger(config)

  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    const requestId = routeDebugger.startDebugging(req)

    // Add debugger to request for route matching
    ;(req as any).debugger = routeDebugger
    ;(req as any).debugRequestId = requestId

    const startTime = performance.now()

    try {
      const response = await next()

      const endTime = performance.now()
      routeDebugger.recordTiming(requestId, 'total', endTime - startTime)

      routeDebugger.finishDebugging(requestId, response)

      return response
    }
    catch (error) {
      const endTime = performance.now()
      routeDebugger.recordTiming(requestId, 'total', endTime - startTime)

      routeDebugger.finishDebugging(requestId)
      throw error
    }
  }
}

/**
 * Route debugging helpers
 */
export const RouteDebugHelpers = {
  /**
   * Record route match attempt from request context
   */
  recordMatch: (req: EnhancedRequest, pattern: string, method: string, matched: boolean, reason?: string, params?: Record<string, string>) => {
    const routeDebugger = (req as any).debugger as RouteDebugger
    const requestId = (req as any).debugRequestId as string

    if (routeDebugger && requestId) {
      routeDebugger.recordMatchAttempt(requestId, pattern, method, matched, reason, params)
    }
  },

  /**
   * Record final match from request context
   */
  recordFinalMatch: (req: EnhancedRequest, pattern: string, handler: Function, middleware: Function[], params: Record<string, string>) => {
    const routeDebugger = (req as any).debugger as RouteDebugger
    const requestId = (req as any).debugRequestId as string

    if (routeDebugger && requestId) {
      routeDebugger.recordFinalMatch(requestId, pattern, handler, middleware, params)
    }
  },

  /**
   * Record timing from request context
   */
  recordTiming: (req: EnhancedRequest, phase: keyof RouteDebugInfo['timings'], duration: number) => {
    const routeDebugger = (req as any).debugger as RouteDebugger
    const requestId = (req as any).debugRequestId as string

    if (routeDebugger && requestId) {
      routeDebugger.recordTiming(requestId, phase, duration)
    }
  },
}
