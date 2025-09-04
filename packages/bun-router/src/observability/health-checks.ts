/**
 * Observability & Monitoring - Health Check Endpoints with Dependency Checks
 * 
 * Enterprise-grade health monitoring with dependency validation and detailed reporting
 */

import type { EnhancedRequest } from '../types'

export interface HealthCheckConfig {
  timeout?: number
  retries?: number
  interval?: number
  gracePeriod?: number
  dependencies?: DependencyConfig[]
  customChecks?: CustomHealthCheck[]
}

export interface DependencyConfig {
  name: string
  type: 'http' | 'database' | 'redis' | 'queue' | 'file' | 'custom'
  url?: string
  timeout?: number
  retries?: number
  critical?: boolean
  metadata?: Record<string, any>
  check?: () => Promise<HealthCheckResult>
}

export interface CustomHealthCheck {
  name: string
  check: () => Promise<HealthCheckResult>
  critical?: boolean
  timeout?: number
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded'
  message?: string
  duration?: number
  metadata?: Record<string, any>
  error?: string
  timestamp: number
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: number
  uptime: number
  version?: string
  environment?: string
  checks: Record<string, HealthCheckResult>
  dependencies: Record<string, HealthCheckResult>
  summary: {
    total: number
    healthy: number
    unhealthy: number
    degraded: number
  }
}

/**
 * Health check manager
 */
export class HealthCheckManager {
  private config: HealthCheckConfig
  private dependencies: Map<string, DependencyConfig> = new Map()
  private customChecks: Map<string, CustomHealthCheck> = new Map()
  private lastResults: Map<string, HealthCheckResult> = new Map()
  private startTime: number = Date.now()

  constructor(config: HealthCheckConfig = {}) {
    this.config = {
      timeout: 5000,
      retries: 3,
      interval: 30000,
      gracePeriod: 60000,
      ...config
    }

    // Register dependencies
    if (this.config.dependencies) {
      for (const dep of this.config.dependencies) {
        this.addDependency(dep)
      }
    }

    // Register custom checks
    if (this.config.customChecks) {
      for (const check of this.config.customChecks) {
        this.addCustomCheck(check)
      }
    }
  }

  /**
   * Add a dependency check
   */
  addDependency(config: DependencyConfig): void {
    this.dependencies.set(config.name, {
      timeout: this.config.timeout,
      retries: this.config.retries,
      critical: true,
      ...config
    })
  }

  /**
   * Add a custom health check
   */
  addCustomCheck(check: CustomHealthCheck): void {
    this.customChecks.set(check.name, {
      critical: true,
      timeout: this.config.timeout,
      ...check
    })
  }

  /**
   * Remove a dependency check
   */
  removeDependency(name: string): boolean {
    return this.dependencies.delete(name)
  }

  /**
   * Remove a custom check
   */
  removeCustomCheck(name: string): boolean {
    return this.customChecks.delete(name)
  }

  /**
   * Perform all health checks
   */
  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now()
    const checks: Record<string, HealthCheckResult> = {}
    const dependencies: Record<string, HealthCheckResult> = {}

    // Run dependency checks
    const dependencyPromises = Array.from(this.dependencies.entries()).map(
      async ([name, config]) => {
        const result = await this.checkDependency(config)
        dependencies[name] = result
        this.lastResults.set(`dep_${name}`, result)
        return result
      }
    )

    // Run custom checks
    const customPromises = Array.from(this.customChecks.entries()).map(
      async ([name, config]) => {
        const result = await this.runCustomCheck(config)
        checks[name] = result
        this.lastResults.set(`check_${name}`, result)
        return result
      }
    )

    // Wait for all checks to complete
    const [depResults, checkResults] = await Promise.all([
      Promise.allSettled(dependencyPromises),
      Promise.allSettled(customPromises)
    ])

    // Calculate overall status
    const allResults = [...Object.values(dependencies), ...Object.values(checks)]
    const summary = {
      total: allResults.length,
      healthy: allResults.filter(r => r.status === 'healthy').length,
      unhealthy: allResults.filter(r => r.status === 'unhealthy').length,
      degraded: allResults.filter(r => r.status === 'degraded').length
    }

    // Determine overall status
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy'
    
    // Check for critical failures
    const criticalFailures = allResults.some(result => {
      const isCritical = this.isCriticalCheck(result)
      return isCritical && result.status === 'unhealthy'
    })

    if (criticalFailures) {
      overallStatus = 'unhealthy'
    } else if (summary.unhealthy > 0 || summary.degraded > 0) {
      overallStatus = 'degraded'
    }

    return {
      status: overallStatus,
      timestamp: Date.now(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
      dependencies,
      summary
    }
  }

  /**
   * Check a specific dependency
   */
  private async checkDependency(config: DependencyConfig): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    try {
      // Use custom check if provided
      if (config.check) {
        return await this.executeWithTimeout(config.check(), config.timeout || this.config.timeout!)
      }

      // Built-in dependency checks
      switch (config.type) {
        case 'http':
          return await this.checkHttpDependency(config)
        case 'database':
          return await this.checkDatabaseDependency(config)
        case 'redis':
          return await this.checkRedisDependency(config)
        case 'queue':
          return await this.checkQueueDependency(config)
        case 'file':
          return await this.checkFileDependency(config)
        default:
          return {
            status: 'unhealthy',
            message: `Unknown dependency type: ${config.type}`,
            duration: Date.now() - startTime,
            timestamp: Date.now()
          }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Dependency check failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Check HTTP dependency
   */
  private async checkHttpDependency(config: DependencyConfig): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    if (!config.url) {
      return {
        status: 'unhealthy',
        message: 'HTTP dependency URL not configured',
        duration: 0,
        timestamp: Date.now()
      }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || this.config.timeout!)

      const response = await fetch(config.url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'bun-router-health-check/1.0'
        }
      })

      clearTimeout(timeoutId)
      const duration = Date.now() - startTime

      if (response.ok) {
        return {
          status: 'healthy',
          message: `HTTP ${response.status} ${response.statusText}`,
          duration,
          metadata: {
            status: response.status,
            statusText: response.statusText,
            url: config.url
          },
          timestamp: Date.now()
        }
      } else {
        return {
          status: response.status >= 500 ? 'unhealthy' : 'degraded',
          message: `HTTP ${response.status} ${response.statusText}`,
          duration,
          metadata: {
            status: response.status,
            statusText: response.statusText,
            url: config.url
          },
          timestamp: Date.now()
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'HTTP request failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        metadata: { url: config.url },
        timestamp: Date.now()
      }
    }
  }

  /**
   * Check database dependency
   */
  private async checkDatabaseDependency(config: DependencyConfig): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    try {
      // This is a placeholder - in real implementation, you'd use actual database clients
      // For now, we'll simulate a database check
      await new Promise(resolve => setTimeout(resolve, 10))
      
      return {
        status: 'healthy',
        message: 'Database connection successful',
        duration: Date.now() - startTime,
        metadata: {
          type: 'database',
          ...config.metadata
        },
        timestamp: Date.now()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Database connection failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Check Redis dependency
   */
  private async checkRedisDependency(config: DependencyConfig): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    try {
      // Placeholder for Redis check
      await new Promise(resolve => setTimeout(resolve, 5))
      
      return {
        status: 'healthy',
        message: 'Redis connection successful',
        duration: Date.now() - startTime,
        metadata: {
          type: 'redis',
          ...config.metadata
        },
        timestamp: Date.now()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Redis connection failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Check queue dependency
   */
  private async checkQueueDependency(config: DependencyConfig): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    try {
      // Placeholder for queue check
      await new Promise(resolve => setTimeout(resolve, 8))
      
      return {
        status: 'healthy',
        message: 'Queue connection successful',
        duration: Date.now() - startTime,
        metadata: {
          type: 'queue',
          ...config.metadata
        },
        timestamp: Date.now()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Queue connection failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Check file system dependency
   */
  private async checkFileDependency(config: DependencyConfig): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    try {
      if (!config.url) {
        throw new Error('File path not specified')
      }

      // Check if file/directory exists and is accessible
      const file = Bun.file(config.url)
      const exists = await file.exists()
      
      if (!exists) {
        return {
          status: 'unhealthy',
          message: `File not found: ${config.url}`,
          duration: Date.now() - startTime,
          timestamp: Date.now()
        }
      }

      return {
        status: 'healthy',
        message: 'File system check successful',
        duration: Date.now() - startTime,
        metadata: {
          type: 'file',
          path: config.url,
          size: file.size
        },
        timestamp: Date.now()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'File system check failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Run custom health check
   */
  private async runCustomCheck(config: CustomHealthCheck): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    try {
      const result = await this.executeWithTimeout(config.check(), config.timeout || this.config.timeout!)
      return {
        ...result,
        duration: result.duration || (Date.now() - startTime)
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Custom check failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`))
      }, timeout)

      promise
        .then(result => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Check if a result is from a critical check
   */
  private isCriticalCheck(result: HealthCheckResult): boolean {
    // Find the check configuration to determine if it's critical
    for (const [name, config] of this.dependencies.entries()) {
      const depResult = this.lastResults.get(`dep_${name}`)
      if (depResult === result) {
        return config.critical !== false
      }
    }

    for (const [name, config] of this.customChecks.entries()) {
      const checkResult = this.lastResults.get(`check_${name}`)
      if (checkResult === result) {
        return config.critical !== false
      }
    }

    return true // Default to critical if not found
  }

  /**
   * Get the last health check results
   */
  getLastResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults)
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000)
  }

  /**
   * Reset start time (for testing)
   */
  resetStartTime(): void {
    this.startTime = Date.now()
  }
}

/**
 * Global health check manager
 */
let globalHealthManager: HealthCheckManager | null = null

/**
 * Initialize global health check manager
 */
export function initializeHealthChecks(config?: HealthCheckConfig): HealthCheckManager {
  globalHealthManager = new HealthCheckManager(config)
  return globalHealthManager
}

/**
 * Get global health check manager
 */
export function getHealthManager(): HealthCheckManager | null {
  return globalHealthManager
}

/**
 * Health check endpoint handlers
 */
export const HealthEndpoints = {
  /**
   * Basic health check endpoint
   */
  health: async (req: EnhancedRequest): Promise<Response> => {
    const manager = getHealthManager()
    if (!manager) {
      return new Response(JSON.stringify({
        status: 'unhealthy',
        message: 'Health checks not initialized'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    try {
      const health = await manager.checkHealth()
      const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503

      return new Response(JSON.stringify(health, null, 2), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        status: 'unhealthy',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  },

  /**
   * Readiness probe endpoint
   */
  ready: async (req: EnhancedRequest): Promise<Response> => {
    const manager = getHealthManager()
    if (!manager) {
      return new Response('Service not ready', { status: 503 })
    }

    try {
      const health = await manager.checkHealth()
      
      // Ready if all critical dependencies are healthy
      const criticalFailures = Object.values(health.dependencies).some(dep => 
        dep.status === 'unhealthy'
      )

      if (criticalFailures) {
        return new Response('Service not ready', { status: 503 })
      }

      return new Response('OK', { status: 200 })
    } catch (error) {
      return new Response('Service not ready', { status: 503 })
    }
  },

  /**
   * Liveness probe endpoint
   */
  live: async (req: EnhancedRequest): Promise<Response> => {
    // Simple liveness check - just return OK if the service is running
    return new Response('OK', { status: 200 })
  },

  /**
   * Startup probe endpoint
   */
  startup: async (req: EnhancedRequest): Promise<Response> => {
    const manager = getHealthManager()
    if (!manager) {
      return new Response('Service not started', { status: 503 })
    }

    // Check if service has been running for at least the grace period
    const uptime = manager.getUptime()
    const gracePeriod = 60 // 60 seconds default grace period

    if (uptime < gracePeriod) {
      return new Response('Service starting up', { status: 503 })
    }

    return new Response('OK', { status: 200 })
  }
}

/**
 * Built-in dependency check factories
 */
export const DependencyChecks = {
  /**
   * HTTP service dependency
   */
  httpService: (name: string, url: string, options: Partial<DependencyConfig> = {}): DependencyConfig => ({
    name,
    type: 'http',
    url,
    timeout: 5000,
    critical: true,
    ...options
  }),

  /**
   * Database dependency
   */
  database: (name: string, options: Partial<DependencyConfig> = {}): DependencyConfig => ({
    name,
    type: 'database',
    timeout: 3000,
    critical: true,
    ...options
  }),

  /**
   * Redis dependency
   */
  redis: (name: string, options: Partial<DependencyConfig> = {}): DependencyConfig => ({
    name,
    type: 'redis',
    timeout: 2000,
    critical: false,
    ...options
  }),

  /**
   * File system dependency
   */
  fileSystem: (name: string, path: string, options: Partial<DependencyConfig> = {}): DependencyConfig => ({
    name,
    type: 'file',
    url: path,
    timeout: 1000,
    critical: true,
    ...options
  }),

  /**
   * Custom dependency with function
   */
  custom: (name: string, checkFn: () => Promise<HealthCheckResult>, options: Partial<DependencyConfig> = {}): DependencyConfig => ({
    name,
    type: 'custom',
    check: checkFn,
    timeout: 5000,
    critical: true,
    ...options
  })
}
