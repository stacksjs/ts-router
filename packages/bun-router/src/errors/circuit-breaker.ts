// @ts-nocheck
/**
 * Advanced Error Handling - Circuit Breaker Pattern
 *
 * Prevents cascading failures by monitoring external service health
 * and temporarily blocking requests when services are failing
 */

import type { ErrorContext } from './exceptions'
import { CircuitBreakerOpenException, ExternalServiceException, TimeoutException } from './exceptions'

export interface CircuitBreakerConfig {
  name: string
  failureThreshold: number
  recoveryTimeout: number
  timeout: number
  monitoringPeriod: number
  minimumRequests: number
  errorThresholdPercentage: number
  halfOpenMaxCalls: number
  resetTimeout: number
  onStateChange?: (state: CircuitBreakerState, name: string) => void
  onFailure?: (error: Error, name: string) => void
  onSuccess?: (name: string) => void
  shouldTripOnError?: (error: Error) => boolean
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  timeouts: number
  averageResponseTime: number
  lastFailureTime?: Date
  lastSuccessTime?: Date
  state: CircuitBreakerState
  nextAttemptTime?: Date
  consecutiveFailures: number
  consecutiveSuccesses: number
}

export interface CircuitBreakerCall<T> {
  execute: () => Promise<T>
  fallback?: () => Promise<T>
  timeout?: number
  retries?: number
  context?: ErrorContext
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig
  private state: CircuitBreakerState = 'CLOSED'
  private metrics: CircuitBreakerMetrics
  private nextAttemptTime?: Date
  private halfOpenCallCount = 0
  private recentRequests: Array<{ timestamp: Date, success: boolean, responseTime: number }> = []

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      timeout: 30000,
      monitoringPeriod: 60000,
      minimumRequests: 10,
      errorThresholdPercentage: 50,
      halfOpenMaxCalls: 3,
      resetTimeout: 60000,
      ...config,
    }

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      averageResponseTime: 0,
      state: this.state,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    }

    // Clean up old requests periodically
    setInterval(() => this.cleanupOldRequests(), this.config.monitoringPeriod / 4)
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(call: CircuitBreakerCall<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (this.nextAttemptTime && new Date() < this.nextAttemptTime) {
        // Circuit is still open, reject immediately
        const error = new CircuitBreakerOpenException(
          this.config.name,
          this.nextAttemptTime,
          call.context,
        )

        if (call.fallback) {
          try {
            return await call.fallback()
          }
          catch (fallbackError) {
            console.error(fallbackError)
          }
        }

        throw error
      }
      else {
        // Time to try half-open
        this.transitionToHalfOpen()
      }
    }

    // Check half-open call limit
    if (this.state === 'HALF_OPEN' && this.halfOpenCallCount >= this.config.halfOpenMaxCalls) {
      const error = new CircuitBreakerOpenException(
        this.config.name,
        this.nextAttemptTime || new Date(Date.now() + this.config.recoveryTimeout),
        call.context,
      )

      if (call.fallback) {
        try {
          return await call.fallback()
        }
        catch (fallbackError) {
          console.error(fallbackError)

          throw error
        }
      }

      throw error
    }

    const startTime = Date.now()
    let result: T
    let error: Error | null = null

    try {
      // Increment call count for half-open state
      if (this.state === 'HALF_OPEN') {
        this.halfOpenCallCount++
      }

      // Execute with timeout
      const timeout = call.timeout || this.config.timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutException(`Circuit breaker timeout for ${this.config.name}`, timeout, call.context))
        }, timeout)
      })

      result = await Promise.race([call.execute(), timeoutPromise])

      // Success
      this.onSuccess(Date.now() - startTime)
      return result
    }
    catch (err) {
      error = err as Error
      this.onFailure(error, Date.now() - startTime)

      // Try fallback if available
      if (call.fallback) {
        try {
          return await call.fallback()
        }
        catch (fallbackError) {
          console.error(fallbackError)
          throw error
        }
      }
      else {
        throw error
      }
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      ...this.metrics,
      state: this.state,
      nextAttemptTime: this.nextAttemptTime,
    }
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.transitionToOpen()
  }

  /**
   * Force circuit breaker to closed state
   */
  forceClosed(): void {
    this.transitionToClosed()
  }

  /**
   * Reset circuit breaker metrics
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      averageResponseTime: 0,
      state: this.state,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    }
    this.recentRequests = []
  }

  private onSuccess(responseTime: number): void {
    this.metrics.totalRequests++
    this.metrics.successfulRequests++
    this.metrics.consecutiveSuccesses++
    this.metrics.consecutiveFailures = 0
    this.metrics.lastSuccessTime = new Date()

    // Update average response time
    this.updateAverageResponseTime(responseTime)

    // Add to recent requests
    this.recentRequests.push({
      timestamp: new Date(),
      success: true,
      responseTime,
    })

    // Handle state transitions
    if (this.state === 'HALF_OPEN') {
      if (this.metrics.consecutiveSuccesses >= this.config.halfOpenMaxCalls) {
        this.transitionToClosed()
      }
    }

    if (this.config.onSuccess) {
      this.config.onSuccess(this.config.name)
    }
  }

  private onFailure(error: Error, responseTime: number): void {
    this.metrics.totalRequests++
    this.metrics.failedRequests++
    this.metrics.consecutiveFailures++
    this.metrics.consecutiveSuccesses = 0
    this.metrics.lastFailureTime = new Date()

    if (error instanceof TimeoutException) {
      this.metrics.timeouts++
    }

    // Update average response time
    this.updateAverageResponseTime(responseTime)

    // Add to recent requests
    this.recentRequests.push({
      timestamp: new Date(),
      success: false,
      responseTime,
    })

    // Check if we should trip the circuit breaker
    if (this.shouldTrip(error)) {
      if (this.state === 'CLOSED') {
        this.transitionToOpen()
      }
      else if (this.state === 'HALF_OPEN') {
        this.transitionToOpen()
      }
    }

    if (this.config.onFailure) {
      this.config.onFailure(error, this.config.name)
    }
  }

  private shouldTrip(error: Error): boolean {
    // Custom error check
    if (this.config.shouldTripOnError && !this.config.shouldTripOnError(error)) {
      return false
    }

    // Check consecutive failures threshold
    if (this.metrics.consecutiveFailures >= this.config.failureThreshold) {
      return true
    }

    // Check error rate over monitoring period
    const recentRequests = this.getRecentRequests()
    if (recentRequests.length >= this.config.minimumRequests) {
      const failedRequests = recentRequests.filter(r => !r.success).length
      const errorRate = (failedRequests / recentRequests.length) * 100

      if (errorRate >= this.config.errorThresholdPercentage) {
        return true
      }
    }

    return false
  }

  private transitionToClosed(): void {
    this.state = 'CLOSED'
    this.nextAttemptTime = undefined
    this.halfOpenCallCount = 0
    this.metrics.state = this.state

    if (this.config.onStateChange) {
      this.config.onStateChange(this.state, this.config.name)
    }
  }

  private transitionToOpen(): void {
    this.state = 'OPEN'
    this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout)
    this.halfOpenCallCount = 0
    this.metrics.state = this.state
    this.metrics.nextAttemptTime = this.nextAttemptTime

    if (this.config.onStateChange) {
      this.config.onStateChange(this.state, this.config.name)
    }
  }

  private transitionToHalfOpen(): void {
    this.state = 'HALF_OPEN'
    this.halfOpenCallCount = 0
    this.metrics.state = this.state

    if (this.config.onStateChange) {
      this.config.onStateChange(this.state, this.config.name)
    }
  }

  private updateAverageResponseTime(responseTime: number): void {
    if (this.metrics.totalRequests === 1) {
      this.metrics.averageResponseTime = responseTime
    }
    else {
      // Exponential moving average
      const alpha = 0.1
      this.metrics.averageResponseTime
        = (alpha * responseTime) + ((1 - alpha) * this.metrics.averageResponseTime)
    }
  }

  private getRecentRequests(): Array<{ timestamp: Date, success: boolean, responseTime: number }> {
    const cutoff = new Date(Date.now() - this.config.monitoringPeriod)
    return this.recentRequests.filter(r => r.timestamp > cutoff)
  }

  private cleanupOldRequests(): void {
    const cutoff = new Date(Date.now() - this.config.monitoringPeriod)
    this.recentRequests = this.recentRequests.filter(r => r.timestamp > cutoff)
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>()
  private configs = new Map<string, CircuitBreakerConfig>()

  /**
   * Register a new circuit breaker
   */
  register(config: CircuitBreakerConfig): CircuitBreaker {
    const breaker = new CircuitBreaker(config)
    this.breakers.set(config.name, breaker)
    this.configs.set(config.name, config)
    return breaker
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name)
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(name: string, call: CircuitBreakerCall<T>): Promise<T> {
    const breaker = this.breakers.get(name)
    if (!breaker) {
      throw new Error(`Circuit breaker '${name}' not found`)
    }
    return breaker.execute(call)
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {}
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics()
    }
    return metrics
  }

  /**
   * Get circuit breakers by state
   */
  getBreakersByState(state: CircuitBreakerState): string[] {
    const names: string[] = []
    for (const [name, breaker] of this.breakers) {
      if (breaker.getState() === state) {
        names.push(name)
      }
    }
    return names
  }

  /**
   * Force all circuit breakers to closed state
   */
  forceAllClosed(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClosed()
    }
  }

  /**
   * Reset all circuit breaker metrics
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset()
    }
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): boolean {
    this.configs.delete(name)
    return this.breakers.delete(name)
  }

  /**
   * Get all registered circuit breaker names
   */
  getNames(): string[] {
    return Array.from(this.breakers.keys())
  }
}

/**
 * Decorator for circuit breaker protection
 */
export function circuitBreaker(config: CircuitBreakerConfig) {
  const breaker = new CircuitBreaker(config)

  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>,
  ) {
    const method = descriptor.value!

    descriptor.value = async function (...args: any[]) {
      return breaker.execute({
        execute: () => method.apply(this, args),
        context: {
          method: propertyName,
          timestamp: new Date(),
        },
      })
    } as T
  }
}

/**
 * HTTP client with circuit breaker protection
 */
export class CircuitBreakerHttpClient {
  private registry: CircuitBreakerRegistry

  constructor(registry?: CircuitBreakerRegistry) {
    this.registry = registry || new CircuitBreakerRegistry()
  }

  /**
   * Make HTTP request with circuit breaker protection
   */
  async fetch(
    url: string,
    options: RequestInit & {
      circuitBreaker?: string | CircuitBreakerConfig
      fallback?: () => Promise<Response>
      context?: ErrorContext
    } = {},
  ): Promise<Response> {
    const { circuitBreaker, fallback, context, ...fetchOptions } = options

    // Determine circuit breaker to use
    let breakerName: string
    if (typeof circuitBreaker === 'string') {
      breakerName = circuitBreaker
    }
    else if (circuitBreaker) {
      breakerName = circuitBreaker.name
      if (!this.registry.get(breakerName)) {
        this.registry.register(circuitBreaker)
      }
    }
    else {
      // Create default circuit breaker based on hostname
      const hostname = new URL(url).hostname
      breakerName = `http-${hostname}`
      if (!this.registry.get(breakerName)) {
        this.registry.register({
          name: breakerName,
          failureThreshold: 5,
          recoveryTimeout: 60000,
          timeout: 30000,
          monitoringPeriod: 60000,
          minimumRequests: 10,
          errorThresholdPercentage: 50,
          halfOpenMaxCalls: 3,
          resetTimeout: 60000,
        })
      }
    }

    return this.registry.execute(breakerName, {
      execute: async () => {
        const response = await fetch(url, fetchOptions)

        // Consider 5xx status codes as failures
        if (response.status >= 500) {
          throw new ExternalServiceException(
            `HTTP ${response.status}: ${response.statusText}`,
            breakerName,
            url,
            response.status,
            undefined,
            context,
          )
        }

        return response
      },
      fallback,
      context,
    })
  }

  /**
   * Get circuit breaker registry
   */
  getRegistry(): CircuitBreakerRegistry {
    return this.registry
  }
}

/**
 * Middleware for circuit breaker protection
 */
export function createCircuitBreakerMiddleware(registry: CircuitBreakerRegistry) {
  return async (req: any, next: () => Promise<Response>): Promise<Response> => {
    const serviceName = req.context?.serviceName as string
    if (!serviceName) {
      return next()
    }

    const breaker = registry.get(serviceName)
    if (!breaker) {
      return next()
    }

    return breaker.execute({
      execute: next,
      context: {
        requestId: req.requestId,
        route: req.route,
        method: req.method,
        url: req.url,
      },
    })
  }
}

/**
 * Factory functions for common circuit breaker configurations
 */
export const CircuitBreakerPresets = {
  /**
   * Fast-failing circuit breaker for critical services
   */
  critical: (name: string): CircuitBreakerConfig => ({
    name,
    failureThreshold: 3,
    recoveryTimeout: 30000,
    timeout: 5000,
    monitoringPeriod: 30000,
    minimumRequests: 5,
    errorThresholdPercentage: 30,
    halfOpenMaxCalls: 2,
    resetTimeout: 30000,
  }),

  /**
   * Standard circuit breaker for regular services
   */
  standard: (name: string): CircuitBreakerConfig => ({
    name,
    failureThreshold: 5,
    recoveryTimeout: 60000,
    timeout: 30000,
    monitoringPeriod: 60000,
    minimumRequests: 10,
    errorThresholdPercentage: 50,
    halfOpenMaxCalls: 3,
    resetTimeout: 60000,
  }),

  /**
   * Tolerant circuit breaker for non-critical services
   */
  tolerant: (name: string): CircuitBreakerConfig => ({
    name,
    failureThreshold: 10,
    recoveryTimeout: 120000,
    timeout: 60000,
    monitoringPeriod: 120000,
    minimumRequests: 20,
    errorThresholdPercentage: 70,
    halfOpenMaxCalls: 5,
    resetTimeout: 120000,
  }),

  /**
   * Database circuit breaker with longer timeouts
   */
  database: (name: string): CircuitBreakerConfig => ({
    name,
    failureThreshold: 3,
    recoveryTimeout: 60000,
    timeout: 10000,
    monitoringPeriod: 60000,
    minimumRequests: 5,
    errorThresholdPercentage: 40,
    halfOpenMaxCalls: 2,
    resetTimeout: 60000,
    shouldTripOnError: (error) => {
      // Don't trip on validation errors or client errors
      return !(error.message.includes('validation') || error.message.includes('constraint'))
    },
  }),

  /**
   * External API circuit breaker
   */
  externalApi: (name: string): CircuitBreakerConfig => ({
    name,
    failureThreshold: 5,
    recoveryTimeout: 90000,
    timeout: 15000,
    monitoringPeriod: 90000,
    minimumRequests: 8,
    errorThresholdPercentage: 60,
    halfOpenMaxCalls: 3,
    resetTimeout: 90000,
    shouldTripOnError: (error) => {
      // Don't trip on 4xx client errors, only 5xx server errors
      if (error instanceof ExternalServiceException) {
        return error.statusCode >= 500
      }
      return true
    },
  }),
}

/**
 * Global circuit breaker registry instance
 */
export const globalCircuitBreakerRegistry = new CircuitBreakerRegistry()

/**
 * Convenience function to create and register a circuit breaker
 */
export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  return globalCircuitBreakerRegistry.register(config)
}

/**
 * Convenience function to execute with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  name: string,
  call: CircuitBreakerCall<T>,
): Promise<T> {
  return globalCircuitBreakerRegistry.execute(name, call)
}
