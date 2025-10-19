/**
 * Development Tools - Performance Profiler
 *
 * Performance profiling, benchmarking, and optimization analysis
 */

import type { EnhancedRequest } from '../types'

export interface ProfileConfig {
  enabled?: boolean
  sampleRate?: number // 0-1, percentage of requests to profile
  includeMemory?: boolean
  includeCpu?: boolean
  includeGc?: boolean
  trackSlowQueries?: boolean
  slowQueryThreshold?: number // ms
  maxProfiles?: number
  outputFormat?: 'console' | 'json' | 'flamegraph'
}

export interface ProfilePoint {
  name: string
  timestamp: number
  duration?: number
  memory?: NodeJS.MemoryUsage
  cpu?: NodeJS.CpuUsage
  metadata?: Record<string, any>
}

export interface RouteProfile {
  id: string
  requestId: string
  method: string
  path: string
  pattern: string
  startTime: number
  endTime?: number
  totalDuration?: number
  phases: {
    routeMatching: ProfilePoint[]
    middlewareExecution: ProfilePoint[]
    handlerExecution: ProfilePoint[]
    responseGeneration: ProfilePoint[]
  }
  memory: {
    initial: NodeJS.MemoryUsage
    peak: NodeJS.MemoryUsage
    final?: NodeJS.MemoryUsage
    allocations: number
  }
  cpu: {
    initial: NodeJS.CpuUsage
    final?: NodeJS.CpuUsage
    userTime: number
    systemTime: number
  }
  gc?: {
    collections: number
    duration: number
    reclaimedMemory: number
  }
  queries?: Array<{
    query: string
    duration: number
    timestamp: number
  }>
  warnings: string[]
  recommendations: string[]
}

export interface PerformanceMetrics {
  averageResponseTime: number
  p50ResponseTime: number
  p95ResponseTime: number
  p99ResponseTime: number
  requestsPerSecond: number
  memoryUsageAverage: number
  memoryUsagePeak: number
  cpuUsageAverage: number
  gcPressure: number
  slowestRoutes: Array<{
    pattern: string
    averageTime: number
    count: number
  }>
  memoryLeaks: Array<{
    route: string
    memoryGrowth: number
    requests: number
  }>
}

/**
 * Performance profiler for route analysis
 */
export class PerformanceProfiler {
  private config: ProfileConfig
  private profiles = new Map<string, RouteProfile>()
  private activeProfiles = new Map<string, RouteProfile>()
  private metrics: PerformanceMetrics
  private gcObserver?: PerformanceObserver
  private memoryBaseline: NodeJS.MemoryUsage

  constructor(config: ProfileConfig = {}) {
    this.config = {
      enabled: true,
      sampleRate: 0.1, // 10% sampling by default
      includeMemory: true,
      includeCpu: true,
      includeGc: true,
      trackSlowQueries: true,
      slowQueryThreshold: 100,
      maxProfiles: 1000,
      outputFormat: 'console',
      ...config,
    }

    this.metrics = this.initializeMetrics()
    this.memoryBaseline = process.memoryUsage()

    if (this.config.includeGc) {
      this.setupGcObserver()
    }
  }

  /**
   * Start profiling a request
   */
  startProfiling(req: EnhancedRequest, pattern: string): string | null {
    if (!this.config.enabled || !this.shouldProfile()) {
      return null
    }

    const profileId = this.generateProfileId()
    const startTime = performance.now()

    const profile: RouteProfile = {
      id: profileId,
      requestId: this.extractRequestId(req),
      method: req.method,
      path: new URL(req.url).pathname,
      pattern,
      startTime,
      phases: {
        routeMatching: [],
        middlewareExecution: [],
        handlerExecution: [],
        responseGeneration: [],
      },
      memory: {
        initial: process.memoryUsage(),
        peak: process.memoryUsage(),
        allocations: 0,
      },
      cpu: {
        initial: process.cpuUsage(),
        userTime: 0,
        systemTime: 0,
      },
      queries: [],
      warnings: [],
      recommendations: [],
    }

    this.activeProfiles.set(profileId, profile)

    // Add profile reference to request
    ;(req as any).profileId = profileId
    ;(req as any).profiler = this

    return profileId
  }

  /**
   * Record a profile point
   */
  recordPoint(
    profileId: string,
    phase: keyof RouteProfile['phases'],
    name: string,
    metadata?: Record<string, any>,
  ): void {
    const profile = this.activeProfiles.get(profileId)
    if (!profile)
      return

    const timestamp = performance.now()
    const point: ProfilePoint = {
      name,
      timestamp,
      metadata,
    }

    if (this.config.includeMemory) {
      const currentMemory = process.memoryUsage()
      point.memory = currentMemory

      // Update peak memory
      if (currentMemory.heapUsed > profile.memory.peak.heapUsed) {
        profile.memory.peak = currentMemory
      }
    }

    if (this.config.includeCpu) {
      point.cpu = process.cpuUsage()
    }

    profile.phases[phase].push(point)
  }

  /**
   * Start timing a specific operation
   */
  startTiming(profileId: string, phase: keyof RouteProfile['phases'], name: string): string {
    const timingId = `${profileId}_${phase}_${name}_${Date.now()}`
    this.recordPoint(profileId, phase, `${name}_start`, { timingId })
    return timingId
  }

  /**
   * End timing a specific operation
   */
  endTiming(profileId: string, phase: keyof RouteProfile['phases'], timingId: string): void {
    const profile = this.activeProfiles.get(profileId)
    if (!profile)
      return

    const endTime = performance.now()
    const startPoint = profile.phases[phase].find(p =>
      p.metadata?.timingId === timingId && p.name.endsWith('_start'),
    )

    if (startPoint) {
      const duration = endTime - startPoint.timestamp
      const endName = startPoint.name.replace('_start', '_end')

      this.recordPoint(profileId, phase, endName, {
        timingId,
        duration,
        startTime: startPoint.timestamp,
        endTime,
      })
    }
  }

  /**
   * Record database query
   */
  recordQuery(profileId: string, query: string, duration: number): void {
    if (!this.config.trackSlowQueries)
      return

    const profile = this.activeProfiles.get(profileId)
    if (!profile)
      return

    profile.queries!.push({
      query: query.length > 200 ? `${query.substring(0, 200)}...` : query,
      duration,
      timestamp: performance.now(),
    })

    if (duration > (this.config.slowQueryThreshold || 100)) {
      profile.warnings.push(`Slow query detected: ${duration.toFixed(2)}ms`)
    }
  }

  /**
   * Finish profiling a request
   */
  finishProfiling(profileId: string, _response?: Response): RouteProfile | null {
    const profile = this.activeProfiles.get(profileId)
    if (!profile)
      return null

    const endTime = performance.now()
    profile.endTime = endTime
    profile.totalDuration = endTime - profile.startTime

    // Finalize memory and CPU metrics
    if (this.config.includeMemory) {
      profile.memory.final = process.memoryUsage()
      profile.memory.allocations = profile.memory.final.heapUsed - profile.memory.initial.heapUsed
    }

    if (this.config.includeCpu) {
      const finalCpu = process.cpuUsage()
      profile.cpu.final = finalCpu
      profile.cpu.userTime = finalCpu.user - profile.cpu.initial.user
      profile.cpu.systemTime = finalCpu.system - profile.cpu.initial.system
    }

    // Generate recommendations
    this.generateRecommendations(profile)

    // Store completed profile
    this.profiles.set(profileId, profile)
    this.activeProfiles.delete(profileId)

    // Update metrics
    this.updateMetrics(profile)

    // Cleanup old profiles if needed
    this.cleanupProfiles()

    // Log profile if configured
    this.logProfile(profile)

    return profile
  }

  /**
   * Get profile by ID
   */
  getProfile(profileId: string): RouteProfile | undefined {
    return this.profiles.get(profileId) || this.activeProfiles.get(profileId)
  }

  /**
   * Get all profiles
   */
  getProfiles(filter?: {
    method?: string
    pattern?: string
    minDuration?: number
    maxDuration?: number
    hasWarnings?: boolean
  }): RouteProfile[] {
    let profiles = Array.from(this.profiles.values())

    if (filter) {
      if (filter.method) {
        profiles = profiles.filter(p => p.method === filter.method)
      }

      if (filter.pattern) {
        profiles = profiles.filter(p => p.pattern.includes(filter.pattern))
      }

      if (filter.minDuration !== undefined) {
        profiles = profiles.filter(p => (p.totalDuration || 0) >= filter.minDuration!)
      }

      if (filter.maxDuration !== undefined) {
        profiles = profiles.filter(p => (p.totalDuration || 0) <= filter.maxDuration!)
      }

      if (filter.hasWarnings) {
        profiles = profiles.filter(p => p.warnings.length > 0)
      }
    }

    return profiles.sort((a, b) => (b.totalDuration || 0) - (a.totalDuration || 0))
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const profiles = this.getProfiles()
    const metrics = this.getMetrics()

    let report = '# Performance Profile Report\n\n'

    // Summary
    report += '## Summary\n'
    report += `- Total Profiles: ${profiles.length}\n`
    report += `- Average Response Time: ${metrics.averageResponseTime.toFixed(2)}ms\n`
    report += `- P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms\n`
    report += `- P99 Response Time: ${metrics.p99ResponseTime.toFixed(2)}ms\n`
    report += `- Requests/Second: ${metrics.requestsPerSecond.toFixed(2)}\n`
    report += `- Average Memory Usage: ${(metrics.memoryUsageAverage / 1024 / 1024).toFixed(2)}MB\n`
    report += `- Peak Memory Usage: ${(metrics.memoryUsagePeak / 1024 / 1024).toFixed(2)}MB\n\n`

    // Slowest routes
    if (metrics.slowestRoutes.length > 0) {
      report += '## Slowest Routes\n'
      metrics.slowestRoutes.forEach((route, index) => {
        report += `${index + 1}. ${route.pattern} - ${route.averageTime.toFixed(2)}ms (${route.count} requests)\n`
      })
      report += '\n'
    }

    // Memory leaks
    if (metrics.memoryLeaks.length > 0) {
      report += '## Potential Memory Leaks\n'
      metrics.memoryLeaks.forEach((leak, index) => {
        report += `${index + 1}. ${leak.route} - ${(leak.memoryGrowth / 1024 / 1024).toFixed(2)}MB growth over ${leak.requests} requests\n`
      })
      report += '\n'
    }

    // Warnings and recommendations
    const profilesWithWarnings = profiles.filter(p => p.warnings.length > 0)
    if (profilesWithWarnings.length > 0) {
      report += '## Warnings\n'
      profilesWithWarnings.forEach((profile) => {
        report += `### ${profile.method} ${profile.pattern}\n`
        profile.warnings.forEach((warning) => {
          report += `- ${warning}\n`
        })
        profile.recommendations.forEach((rec) => {
          report += `- 💡 ${rec}\n`
        })
        report += '\n'
      })
    }

    return report
  }

  /**
   * Clear all profiles and reset metrics
   */
  clear(): void {
    this.profiles.clear()
    this.activeProfiles.clear()
    this.metrics = this.initializeMetrics()
  }

  /**
   * Determine if request should be profiled
   */
  private shouldProfile(): boolean {
    return Math.random() < (this.config.sampleRate || 0.1)
  }

  /**
   * Generate unique profile ID
   */
  private generateProfileId(): string {
    return `prof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Extract request ID from request
   */
  private extractRequestId(req: EnhancedRequest): string {
    return (req as any).id || (req as any).requestId || 'unknown'
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      averageResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      requestsPerSecond: 0,
      memoryUsageAverage: 0,
      memoryUsagePeak: 0,
      cpuUsageAverage: 0,
      gcPressure: 0,
      slowestRoutes: [],
      memoryLeaks: [],
    }
  }

  /**
   * Setup garbage collection observer
   */
  private setupGcObserver(): void {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          if (entry.entryType === 'gc') {
            // Update GC metrics for active profiles
            this.activeProfiles.forEach((profile) => {
              if (!profile.gc) {
                profile.gc = { collections: 0, duration: 0, reclaimedMemory: 0 }
              }
              profile.gc.collections++
              profile.gc.duration += entry.duration
            })
          }
        })
      })

      this.gcObserver.observe({ entryTypes: ['gc'] })
    }
    catch (error) {
      // GC observer not available in this environment
    }
  }

  /**
   * Generate recommendations for a profile
   */
  private generateRecommendations(profile: RouteProfile): void {
    const recommendations: string[] = []

    // Check response time
    if ((profile.totalDuration || 0) > 1000) {
      recommendations.push('Consider optimizing this route - response time exceeds 1 second')
    }

    // Check memory usage
    if (profile.memory.allocations > 50 * 1024 * 1024) { // 50MB
      recommendations.push('High memory allocation detected - consider memory optimization')
    }

    // Check CPU usage
    if (profile.cpu.userTime > 100000) { // 100ms CPU time
      recommendations.push('High CPU usage detected - consider algorithm optimization')
    }

    // Check slow queries
    const slowQueries = profile.queries?.filter(q => q.duration > (this.config.slowQueryThreshold || 100)) || []
    if (slowQueries.length > 0) {
      recommendations.push(`${slowQueries.length} slow database queries detected - consider query optimization`)
    }

    // Check middleware overhead
    const middlewareTime = profile.phases.middlewareExecution.reduce((total, point) => {
      return total + (point.duration || 0)
    }, 0)

    if (middlewareTime > (profile.totalDuration || 0) * 0.5) {
      recommendations.push('Middleware overhead is high - consider middleware optimization')
    }

    profile.recommendations = recommendations
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(_profile: RouteProfile): void {
    const profiles = Array.from(this.profiles.values())
    const durations = profiles.map(p => p.totalDuration || 0).sort((a, b) => a - b)

    if (durations.length > 0) {
      this.metrics.averageResponseTime = durations.reduce((sum, d) => sum + d, 0) / durations.length
      this.metrics.p50ResponseTime = durations[Math.floor(durations.length * 0.5)]
      this.metrics.p95ResponseTime = durations[Math.floor(durations.length * 0.95)]
      this.metrics.p99ResponseTime = durations[Math.floor(durations.length * 0.99)]
    }

    // Update memory metrics
    const memoryUsages = profiles.map(p => p.memory.peak.heapUsed)
    if (memoryUsages.length > 0) {
      this.metrics.memoryUsageAverage = memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length
      this.metrics.memoryUsagePeak = Math.max(...memoryUsages)
    }

    // Update slowest routes
    const routeStats = new Map<string, { totalTime: number, count: number }>()
    profiles.forEach((profile) => {
      const key = profile.pattern
      const existing = routeStats.get(key) || { totalTime: 0, count: 0 }
      existing.totalTime += profile.totalDuration || 0
      existing.count++
      routeStats.set(key, existing)
    })

    this.metrics.slowestRoutes = Array.from(routeStats.entries())
      .map(([pattern, stats]) => ({
        pattern,
        averageTime: stats.totalTime / stats.count,
        count: stats.count,
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10)
  }

  /**
   * Cleanup old profiles
   */
  private cleanupProfiles(): void {
    if (this.profiles.size > (this.config.maxProfiles || 1000)) {
      const profiles = Array.from(this.profiles.entries())
        .sort(([, a], [, b]) => (a.startTime || 0) - (b.startTime || 0))

      const toDelete = profiles.slice(0, profiles.length - (this.config.maxProfiles || 1000))
      toDelete.forEach(([id]) => this.profiles.delete(id))
    }
  }

  /**
   * Log profile information
   */
  private logProfile(profile: RouteProfile): void {
    if (this.config.outputFormat === 'json') {
      console.log(JSON.stringify(profile, null, 2))
    }
    else if (this.config.outputFormat === 'console') {
      console.log(`🔍 Profile: ${profile.method} ${profile.pattern} - ${(profile.totalDuration || 0).toFixed(2)}ms`)

      if (profile.warnings.length > 0) {
        console.log('  ⚠️  Warnings:', profile.warnings)
      }

      if (profile.recommendations.length > 0) {
        console.log('  💡 Recommendations:', profile.recommendations)
      }
    }
  }
}

/**
 * Global performance profiler instance
 */
let globalProfiler: PerformanceProfiler | null = null

/**
 * Initialize global performance profiler
 */
export function initializePerformanceProfiler(config?: ProfileConfig): PerformanceProfiler {
  globalProfiler = new PerformanceProfiler(config)
  return globalProfiler
}

/**
 * Get global performance profiler
 */
export function getPerformanceProfiler(): PerformanceProfiler | null {
  return globalProfiler
}

/**
 * Performance profiling middleware factory
 */
export function createPerformanceProfilingMiddleware(config?: ProfileConfig) {
  const profiler = globalProfiler || new PerformanceProfiler(config)

  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    const pattern = (req as any).route?.pattern || req.url
    const profileId = profiler.startProfiling(req, pattern)

    if (!profileId) {
      return await next()
    }

    try {
      // Record middleware execution start
      const middlewareTimingId = profiler.startTiming(profileId, 'middlewareExecution', 'total')

      const response = await next()

      // Record middleware execution end
      profiler.endTiming(profileId, 'middlewareExecution', middlewareTimingId)

      profiler.finishProfiling(profileId, response)

      return response
    }
    catch (error) {
      profiler.finishProfiling(profileId)
      throw error
    }
  }
}

/**
 * Performance profiling helpers
 */
export const PerformanceProfilingHelpers = {
  /**
   * Record timing from request context
   */
  startTiming: (req: EnhancedRequest, phase: keyof RouteProfile['phases'], name: string): string | null => {
    const profileId = (req as any).profileId as string
    const profiler = (req as any).profiler as PerformanceProfiler

    if (profiler && profileId) {
      return profiler.startTiming(profileId, phase, name)
    }

    return null
  },

  /**
   * End timing from request context
   */
  endTiming: (req: EnhancedRequest, phase: keyof RouteProfile['phases'], timingId: string): void => {
    const profileId = (req as any).profileId as string
    const profiler = (req as any).profiler as PerformanceProfiler

    if (profiler && profileId && timingId) {
      profiler.endTiming(profileId, phase, timingId)
    }
  },

  /**
   * Record database query from request context
   */
  recordQuery: (req: EnhancedRequest, query: string, duration: number): void => {
    const profileId = (req as any).profileId as string
    const profiler = (req as any).profiler as PerformanceProfiler

    if (profiler && profileId) {
      profiler.recordQuery(profileId, query, duration)
    }
  },

  /**
   * Record profile point from request context
   */
  recordPoint: (req: EnhancedRequest, phase: keyof RouteProfile['phases'], name: string, metadata?: Record<string, any>): void => {
    const profileId = (req as any).profileId as string
    const profiler = (req as any).profiler as PerformanceProfiler

    if (profiler && profileId) {
      profiler.recordPoint(profileId, phase, name, metadata)
    }
  },
}
