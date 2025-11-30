/**
 * Advanced Error Handling - Graceful Degradation
 *
 * Handles partial failures with fallback mechanisms and service degradation
 */

import type { EnhancedRequest } from '../types'
import type { ErrorContext, RouterException } from './exceptions'

export interface DegradationConfig {
  enabled: boolean
  fallbackStrategies: {
    [serviceName: string]: FallbackStrategy
  }
  healthChecks: {
    [serviceName: string]: HealthCheckConfig
  }
  monitoring: {
    enabled: boolean
    alertThresholds: {
      errorRate: number
      responseTime: number
      availability: number
    }
  }
}

export interface FallbackStrategy {
  type: 'cache' | 'static' | 'simplified' | 'redirect' | 'custom'
  priority: number
  timeout: number
  retries: number
  backoff: {
    type: 'fixed' | 'exponential'
    delay: number
    maxDelay?: number
  }
  fallbackHandler?: (error: RouterException, context: ErrorContext) => Promise<Response>
  cacheConfig?: {
    key: string
    ttl: number
    staleWhileRevalidate: boolean
  }
  staticResponse?: {
    status: number
    body: any
    headers?: Record<string, string>
  }
  redirectConfig?: {
    url: string
    permanent: boolean
  }
}

export interface HealthCheckConfig {
  enabled: boolean
  endpoint: string
  interval: number
  timeout: number
  retries: number
  expectedStatus: number[]
  expectedBody?: string | RegExp
  headers?: Record<string, string>
  onHealthy?: () => void
  onUnhealthy?: (error: Error) => void
}

export interface ServiceHealth {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastCheck: Date
  responseTime: number
  errorRate: number
  availability: number
  consecutiveFailures: number
  metadata?: Record<string, any>
}

export interface DegradationContext {
  request: EnhancedRequest
  serviceName: string
  error: RouterException
  attemptCount: number
  startTime: Date
  metadata?: Record<string, any>
}

/**
 * Service health monitor
 */
export class ServiceHealthMonitor {
  private healthStatus = new Map<string, ServiceHealth>()
  private healthCheckIntervals = new Map<string, NodeJS.Timeout>()
  private config: DegradationConfig

  constructor(config: DegradationConfig) {
    this.config = config
    this.initializeHealthChecks()
  }

  private initializeHealthChecks(): void {
    for (const [serviceName, healthConfig] of Object.entries(this.config.healthChecks)) {
      if (!healthConfig.enabled)
        continue

      // Initialize health status
      this.healthStatus.set(serviceName, {
        name: serviceName,
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: 0,
        errorRate: 0,
        availability: 100,
        consecutiveFailures: 0,
      })

      // Start health check interval
      const interval = setInterval(
        () => this.performHealthCheck(serviceName, healthConfig),
        healthConfig.interval,
      )
      this.healthCheckIntervals.set(serviceName, interval)
    }
  }

  private async performHealthCheck(serviceName: string, config: HealthCheckConfig): Promise<void> {
    const startTime = Date.now()
    let isHealthy = false

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeout)

      const response = await fetch(config.endpoint, {
        signal: controller.signal,
        headers: config.headers,
        method: 'GET',
      })

      clearTimeout(timeoutId)

      // Check status code
      isHealthy = config.expectedStatus.includes(response.status)

      // Check response body if configured
      if (isHealthy && config.expectedBody) {
        const body = await response.text()
        if (typeof config.expectedBody === 'string') {
          isHealthy = body.includes(config.expectedBody)
        }
        else {
          isHealthy = config.expectedBody.test(body)
        }
      }
    }
    catch (error) {
      console.error(error)
      isHealthy = false
    }

    const responseTime = Date.now() - startTime
    this.updateHealthStatus(serviceName, isHealthy, responseTime)

    // Call health callbacks
    if (isHealthy && config.onHealthy) {
      config.onHealthy()
    }
    else if (!isHealthy && config.onUnhealthy) {
      config.onUnhealthy(new Error(`Health check failed for ${serviceName}`))
    }
  }

  private updateHealthStatus(serviceName: string, isHealthy: boolean, responseTime: number): void {
    const current = this.healthStatus.get(serviceName)
    if (!current)
      return

    const updated: ServiceHealth = {
      ...current,
      lastCheck: new Date(),
      responseTime,
      consecutiveFailures: isHealthy ? 0 : current.consecutiveFailures + 1,
    }

    // Update status based on consecutive failures
    if (updated.consecutiveFailures === 0) {
      updated.status = 'healthy'
    }
    else if (updated.consecutiveFailures < 3) {
      updated.status = 'degraded'
    }
    else {
      updated.status = 'unhealthy'
    }

    // Calculate availability (simple moving average)
    const healthyCount = isHealthy ? 1 : 0
    updated.availability = (current.availability * 0.9) + (healthyCount * 10)

    this.healthStatus.set(serviceName, updated)
  }

  getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.healthStatus.get(serviceName)
  }

  getAllServiceHealth(): ServiceHealth[] {
    return Array.from(this.healthStatus.values())
  }

  isServiceHealthy(serviceName: string): boolean {
    const health = this.healthStatus.get(serviceName)
    return health?.status === 'healthy'
  }

  isServiceDegraded(serviceName: string): boolean {
    const health = this.healthStatus.get(serviceName)
    return health?.status === 'degraded'
  }

  stop(): void {
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval)
    }
    this.healthCheckIntervals.clear()
  }
}

/**
 * Graceful degradation manager
 */
export class GracefulDegradationManager {
  private config: DegradationConfig
  private healthMonitor: ServiceHealthMonitor
  private cache = new Map<string, { data: any, expires: Date }>()
  private metrics = new Map<string, { requests: number, errors: number, totalTime: number }>()

  constructor(config: DegradationConfig) {
    this.config = config
    this.healthMonitor = new ServiceHealthMonitor(config)
  }

  /**
   * Handle service failure with graceful degradation
   */
  async handleFailure(
    serviceName: string,
    error: RouterException,
    request: EnhancedRequest,
    originalHandler: () => Promise<Response>,
  ): Promise<Response> {
    if (!this.config.enabled) {
      throw error
    }

    const strategy = this.config.fallbackStrategies[serviceName]
    if (!strategy) {
      throw error
    }

    const context: DegradationContext = {
      request,
      serviceName,
      error,
      attemptCount: 1,
      startTime: new Date(),
    }

    return this.executeFallbackStrategy(strategy, context, originalHandler)
  }

  private async executeFallbackStrategy(
    strategy: FallbackStrategy,
    context: DegradationContext,
    originalHandler: () => Promise<Response>,
  ): Promise<Response> {
    // Try with retries and backoff
    if (context.attemptCount <= strategy.retries) {
      try {
        // Apply backoff delay
        if (context.attemptCount > 1) {
          const delay = this.calculateBackoffDelay(strategy.backoff, context.attemptCount)
          await this.sleep(delay)
        }

        // Retry original handler with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), strategy.timeout)
        })

        const result = await Promise.race([originalHandler(), timeoutPromise])

        // Success - update metrics and return
        this.updateMetrics(context.serviceName, true, Date.now() - context.startTime.getTime())
        return result
      }
      catch (retryError) {
        console.error(retryError)
        context.attemptCount++
        if (context.attemptCount <= strategy.retries) {
          return this.executeFallbackStrategy(strategy, context, originalHandler)
        }
        // Fall through to fallback strategies
      }
    }

    // Update metrics for failure
    this.updateMetrics(context.serviceName, false, Date.now() - context.startTime.getTime())

    // Execute fallback based on strategy type
    switch (strategy.type) {
      case 'cache':
        return this.handleCacheFallback(strategy, context)
      case 'static':
        return this.handleStaticFallback(strategy, context)
      case 'simplified':
        return this.handleSimplifiedFallback(strategy, context)
      case 'redirect':
        return this.handleRedirectFallback(strategy, context)
      case 'custom':
        return this.handleCustomFallback(strategy, context)
      default:
        throw context.error
    }
  }

  private async handleCacheFallback(strategy: FallbackStrategy, context: DegradationContext): Promise<Response> {
    if (!strategy.cacheConfig) {
      throw context.error
    }

    const cacheKey = this.generateCacheKey(strategy.cacheConfig.key, context)
    const cached = this.cache.get(cacheKey)

    if (cached && (cached.expires > new Date() || strategy.cacheConfig.staleWhileRevalidate)) {
      // Return cached response
      const headers = new Headers({
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Degraded': 'true',
        'X-Service-Status': this.healthMonitor.getServiceHealth(context.serviceName)?.status || 'unknown',
      })

      if (strategy.cacheConfig.staleWhileRevalidate && cached.expires <= new Date()) {
        headers.set('X-Cache', 'STALE')
      }

      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers,
      })
    }

    throw context.error
  }

  private async handleStaticFallback(strategy: FallbackStrategy, context: DegradationContext): Promise<Response> {
    if (!strategy.staticResponse) {
      throw context.error
    }

    const headers = new Headers(strategy.staticResponse.headers || {})
    headers.set('X-Degraded', 'true')
    headers.set('X-Fallback-Type', 'static')
    headers.set('X-Service-Status', this.healthMonitor.getServiceHealth(context.serviceName)?.status || 'unknown')

    return new Response(
      typeof strategy.staticResponse.body === 'string'
        ? strategy.staticResponse.body
        : JSON.stringify(strategy.staticResponse.body),
      {
        status: strategy.staticResponse.status,
        headers,
      },
    )
  }

  private async handleSimplifiedFallback(strategy: FallbackStrategy, context: DegradationContext): Promise<Response> {
    // Return a simplified version of the response
    const simplifiedData = {
      message: 'Service temporarily unavailable. Showing simplified view.',
      status: 'degraded',
      timestamp: new Date().toISOString(),
      requestId: context.request.requestId,
    }

    return new Response(JSON.stringify(simplifiedData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Degraded': 'true',
        'X-Fallback-Type': 'simplified',
        'X-Service-Status': this.healthMonitor.getServiceHealth(context.serviceName)?.status || 'unknown',
      },
    })
  }

  private async handleRedirectFallback(strategy: FallbackStrategy, context: DegradationContext): Promise<Response> {
    if (!strategy.redirectConfig) {
      throw context.error
    }

    return new Response(null, {
      status: strategy.redirectConfig.permanent ? 301 : 302,
      headers: {
        'Location': strategy.redirectConfig.url,
        'X-Degraded': 'true',
        'X-Fallback-Type': 'redirect',
      },
    })
  }

  private async handleCustomFallback(strategy: FallbackStrategy, context: DegradationContext): Promise<Response> {
    if (!strategy.fallbackHandler) {
      throw context.error
    }

    try {
      const response = await strategy.fallbackHandler(context.error, context.error.context)

      // Add degradation headers
      response.headers.set('X-Degraded', 'true')
      response.headers.set('X-Fallback-Type', 'custom')
      response.headers.set('X-Service-Status', this.healthMonitor.getServiceHealth(context.serviceName)?.status || 'unknown')

      return response
    }
    catch (fallbackError) {
      console.error(fallbackError)
      throw context.error
    }
  }

  /**
   * Cache successful responses for fallback use
   */
  cacheResponse(serviceName: string, key: string, data: any, ttl: number): void {
    const strategy = this.config.fallbackStrategies[serviceName]
    if (strategy?.type === 'cache' && strategy.cacheConfig) {
      const cacheKey = this.generateCacheKey(key, { serviceName } as DegradationContext)
      this.cache.set(cacheKey, {
        data,
        expires: new Date(Date.now() + ttl * 1000),
      })
    }
  }

  /**
   * Get service metrics
   */
  getServiceMetrics(serviceName: string): { errorRate: number, avgResponseTime: number, totalRequests: number } {
    const metrics = this.metrics.get(serviceName)
    if (!metrics || metrics.requests === 0) {
      return { errorRate: 0, avgResponseTime: 0, totalRequests: 0 }
    }

    return {
      errorRate: (metrics.errors / metrics.requests) * 100,
      avgResponseTime: metrics.totalTime / metrics.requests,
      totalRequests: metrics.requests,
    }
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): { status: 'healthy' | 'degraded' | 'unhealthy', services: ServiceHealth[] } {
    const services = this.healthMonitor.getAllServiceHealth()
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length
    const degradedCount = services.filter(s => s.status === 'degraded').length

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (unhealthyCount > 0) {
      status = unhealthyCount > services.length / 2 ? 'unhealthy' : 'degraded'
    }
    else if (degradedCount > 0) {
      status = 'degraded'
    }

    return { status, services }
  }

  private calculateBackoffDelay(backoff: FallbackStrategy['backoff'], attempt: number): number {
    if (backoff.type === 'fixed') {
      return backoff.delay
    }

    // Exponential backoff
    const delay = backoff.delay * 2 ** (attempt - 1)
    return Math.min(delay, backoff.maxDelay || 30000)
  }

  private generateCacheKey(template: string, context: DegradationContext): string {
    return template
      .replace('{service}', context.serviceName)
      .replace('{url}', context.request.url)
      .replace('{method}', context.request.method)
      .replace('{userId}', String(context.request.user?.id || 'anonymous'))
  }

  private updateMetrics(serviceName: string, success: boolean, responseTime: number): void {
    const current = this.metrics.get(serviceName) || { requests: 0, errors: 0, totalTime: 0 }

    current.requests++
    current.totalTime += responseTime
    if (!success) {
      current.errors++
    }

    this.metrics.set(serviceName, current)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  stop(): void {
    this.healthMonitor.stop()
  }
}

/**
 * Middleware for graceful degradation
 */
export function createGracefulDegradationMiddleware(config: DegradationConfig) {
  const manager = new GracefulDegradationManager(config)

  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    try {
      const response = await next()

      // Cache successful responses if configured
      const serviceName = req.context?.serviceName as string
      if (serviceName && response.ok) {
        const strategy = config.fallbackStrategies[serviceName]
        if (strategy?.type === 'cache' && strategy.cacheConfig) {
          try {
            const data = await response.clone().json()
            manager.cacheResponse(serviceName, strategy.cacheConfig.key, data, strategy.cacheConfig.ttl)
          }
          catch {
            // Ignore cache errors
          }
        }
      }

      return response
    }
    catch (error) {
      const serviceName = req.context?.serviceName as string

      if (serviceName && error instanceof Error) {
        // Convert to RouterException if needed
        const routerError = error as RouterException

        try {
          return await manager.handleFailure(serviceName, routerError, req, next)
        }
        catch (fallbackError) {
          console.error(fallbackError)
          // If all fallbacks fail, throw original error
          throw error
        }
      }

      throw error
    }
  }
}

/**
 * Factory functions for common degradation strategies
 */
export const DegradationStrategies = {
  cacheFirst: (ttl: number = 3600, staleWhileRevalidate = true): FallbackStrategy => ({
    type: 'cache',
    priority: 1,
    timeout: 5000,
    retries: 2,
    backoff: { type: 'exponential', delay: 1000, maxDelay: 5000 },
    cacheConfig: {
      key: '{service}:{url}:{method}',
      ttl,
      staleWhileRevalidate,
    },
  }),

  staticFallback: (body: any, status = 200): FallbackStrategy => ({
    type: 'static',
    priority: 2,
    timeout: 1000,
    retries: 0,
    backoff: { type: 'fixed', delay: 0 },
    staticResponse: {
      status,
      body,
      headers: { 'Content-Type': 'application/json' },
    },
  }),

  simplifiedView: (): FallbackStrategy => ({
    type: 'simplified',
    priority: 3,
    timeout: 1000,
    retries: 0,
    backoff: { type: 'fixed', delay: 0 },
  }),

  redirectToMaintenance: (url: string): FallbackStrategy => ({
    type: 'redirect',
    priority: 4,
    timeout: 1000,
    retries: 0,
    backoff: { type: 'fixed', delay: 0 },
    redirectConfig: {
      url,
      permanent: false,
    },
  }),
}
