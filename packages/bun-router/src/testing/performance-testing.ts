import type { EnhancedRequest } from '../types'
import type { TestClient } from './test-client'
import type { LoadTestConfig, PerformanceMetrics } from './types'
import { mock } from 'bun:test'
import process from 'node:process'
import { createMockRequest } from './test-request'

/**
 * Performance testing utilities
 */
export class PerformanceTester {
  private metrics: PerformanceMetrics[] = []
  private startTime: number = 0
  private endTime: number = 0

  /**
   * Start performance measurement
   */
  start(): PerformanceTester {
    this.startTime = performance.now()
    return this
  }

  /**
   * End performance measurement
   */
  end(): PerformanceTester {
    this.endTime = performance.now()
    return this
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetrics): PerformanceTester {
    this.metrics.push(metric)
    return this
  }

  /**
   * Get elapsed time
   */
  getElapsedTime(): number {
    return this.endTime - this.startTime
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics]
  }

  /**
   * Get average response time
   */
  getAverageResponseTime(): number {
    if (this.metrics.length === 0)
      return 0
    const total = this.metrics.reduce((sum, metric) => sum + metric.responseTime, 0)
    return total / this.metrics.length
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    averageHeapUsed: number
    maxHeapUsed: number
    averageRSS: number
    maxRSS: number
  } {
    if (this.metrics.length === 0) {
      return { averageHeapUsed: 0, maxHeapUsed: 0, averageRSS: 0, maxRSS: 0 }
    }

    const heapUsed = this.metrics.map(m => m.memoryUsage.heapUsed)
    const rss = this.metrics.map(m => m.memoryUsage.rss)

    return {
      averageHeapUsed: heapUsed.reduce((sum, val) => sum + val, 0) / heapUsed.length,
      maxHeapUsed: Math.max(...heapUsed),
      averageRSS: rss.reduce((sum, val) => sum + val, 0) / rss.length,
      maxRSS: Math.max(...rss),
    }
  }

  /**
   * Clear all metrics
   */
  clear(): PerformanceTester {
    this.metrics = []
    this.startTime = 0
    this.endTime = 0
    return this
  }
}

/**
 * Load testing utilities
 */
export class LoadTester {
  private client: TestClient
  private config: LoadTestConfig

  constructor(client: TestClient, config: LoadTestConfig) {
    this.client = client
    this.config = config
  }

  /**
   * Run load test
   */
  async run(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    requestOptions: any = {},
  ): Promise<{
      totalRequests: number
      successfulRequests: number
      failedRequests: number
      averageResponseTime: number
      requestsPerSecond: number
      errors: Array<{ error: string, count: number }>
    }> {
    const results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
      errors: [] as Array<{ error: string, count: number }>,
    }

    const responseTimes: number[] = []
    const errorCounts = new Map<string, number>()
    const startTime = Date.now()

    // Calculate total requests based on duration and rate
    const totalRequests = this.config.maxRequests
      || Math.floor((this.config.duration / 1000) * (this.config.requestsPerSecond || this.config.concurrency))

    const requestPromises: Promise<void>[] = []

    for (let i = 0; i < totalRequests; i++) {
      const requestPromise = this.makeRequest(path, method, requestOptions)
        .then((responseTime) => {
          responseTimes.push(responseTime)
          results.successfulRequests++
        })
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          errorCounts.set(errorMessage, (errorCounts.get(errorMessage) || 0) + 1)
          results.failedRequests++
        })

      requestPromises.push(requestPromise)

      // Apply rate limiting if specified
      if (this.config.requestsPerSecond) {
        const delay = 1000 / this.config.requestsPerSecond
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Apply concurrency limiting
      if (requestPromises.length >= this.config.concurrency) {
        await Promise.race(requestPromises)
        // Remove completed promises
        const completedPromises = requestPromises.filter(p =>
          p.then(() => true).catch(() => true),
        )
        completedPromises.forEach((p) => {
          const index = requestPromises.indexOf(p)
          if (index > -1)
            requestPromises.splice(index, 1)
        })
      }
    }

    // Wait for all remaining requests to complete
    await Promise.allSettled(requestPromises)

    const endTime = Date.now()
    const totalTime = (endTime - startTime) / 1000

    results.totalRequests = totalRequests
    results.averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0
    results.requestsPerSecond = totalRequests / totalTime
    results.errors = Array.from(errorCounts.entries()).map(([error, count]) => ({ error, count }))

    return results
  }

  private async makeRequest(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    options: any,
  ): Promise<number> {
    const startTime = performance.now()

    try {
      await this.client.request(method, path, options)
      const endTime = performance.now()
      return endTime - startTime
    }
    catch (error) {
      const endTime = performance.now()
      throw error
    }
  }
}

/**
 * Benchmark testing utilities
 */
export const benchmarkTests = {
  /**
   * Benchmark route handler performance
   */
  routeHandler: async (
    handler: (req: EnhancedRequest) => Promise<Response>,
    iterations: number = 1000,
  ): Promise<{
    averageTime: number
    minTime: number
    maxTime: number
    totalTime: number
    throughput: number
  }> => {
    const times: number[] = []
    const request = createMockRequest()

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      await handler(request)
      const end = performance.now()
      times.push(end - start)
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0)
    const averageTime = totalTime / iterations
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const throughput = (iterations / totalTime) * 1000 // requests per second

    return {
      averageTime,
      minTime,
      maxTime,
      totalTime,
      throughput,
    }
  },

  /**
   * Benchmark middleware performance
   */
  middleware: async (
    middleware: (req: EnhancedRequest, next: () => Promise<Response | null>) => Promise<Response | null>,
    iterations: number = 1000,
  ): Promise<{
    averageTime: number
    minTime: number
    maxTime: number
    totalTime: number
  }> => {
    const times: number[] = []
    const request = createMockRequest()
    const next = mock(async () => new Response('OK'))

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      await middleware(request, next)
      const end = performance.now()
      times.push(end - start)
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0)
    const averageTime = totalTime / iterations
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)

    return {
      averageTime,
      minTime,
      maxTime,
      totalTime,
    }
  },

  /**
   * Benchmark JSON serialization
   */
  jsonSerialization: async (
    data: any,
    iterations: number = 10000,
  ): Promise<{
    averageTime: number
    minTime: number
    maxTime: number
    totalTime: number
    dataSize: number
  }> => {
    const times: number[] = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      const serialized = JSON.stringify(data)
      const end = performance.now()
      times.push(end - start)
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0)
    const averageTime = totalTime / iterations
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const dataSize = JSON.stringify(data).length

    return {
      averageTime,
      minTime,
      maxTime,
      totalTime,
      dataSize,
    }
  },

  /**
   * Benchmark route matching
   */
  routeMatching: async (
    routes: Array<{ path: string, handler: any }>,
    testPaths: string[],
    iterations: number = 1000,
  ): Promise<{
    averageTime: number
    minTime: number
    maxTime: number
    totalTime: number
    matchRate: number
  }> => {
    const times: number[] = []
    let matches = 0

    for (let i = 0; i < iterations; i++) {
      const testPath = testPaths[i % testPaths.length]
      const start = performance.now()

      // Simple route matching simulation
      const match = routes.find((route) => {
        const pattern = route.path.replace(/:\w+/g, '[^/]+')
        const regex = new RegExp(`^${pattern}$`)
        return regex.test(testPath)
      })

      if (match)
        matches++

      const end = performance.now()
      times.push(end - start)
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0)
    const averageTime = totalTime / iterations
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const matchRate = matches / iterations

    return {
      averageTime,
      minTime,
      maxTime,
      totalTime,
      matchRate,
    }
  },
}

/**
 * Memory testing utilities
 */
export const memoryTests = {
  /**
   * Test memory usage of a function
   */
  measureMemoryUsage: async <T>(
    fn: () => Promise<T> | T,
    iterations: number = 100,
  ): Promise<{
    averageHeapUsed: number
    maxHeapUsed: number
    memoryLeakDetected: boolean
    results: T[]
  }> => {
    const results: T[] = []
    const heapUsages: number[] = []

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    const initialHeap = process.memoryUsage().heapUsed

    for (let i = 0; i < iterations; i++) {
      const result = await fn()
      results.push(result)

      const memUsage = process.memoryUsage()
      heapUsages.push(memUsage.heapUsed)

      // Periodic garbage collection
      if (i % 10 === 0 && global.gc) {
        global.gc()
      }
    }

    // Final garbage collection
    if (global.gc) {
      global.gc()
    }

    const finalHeap = process.memoryUsage().heapUsed
    const averageHeapUsed = heapUsages.reduce((sum, usage) => sum + usage, 0) / heapUsages.length
    const maxHeapUsed = Math.max(...heapUsages)

    // Simple memory leak detection
    const memoryLeakDetected = (finalHeap - initialHeap) > (1024 * 1024) // 1MB threshold

    return {
      averageHeapUsed,
      maxHeapUsed,
      memoryLeakDetected,
      results,
    }
  },

  /**
   * Test for memory leaks in route handlers
   */
  testRouteHandlerMemoryLeaks: async (
    handler: (req: EnhancedRequest) => Promise<Response>,
    iterations: number = 1000,
  ): Promise<{
    memoryLeakDetected: boolean
    initialMemory: number
    finalMemory: number
    memoryGrowth: number
  }> => {
    if (global.gc)
      global.gc()
    const initialMemory = process.memoryUsage().heapUsed

    for (let i = 0; i < iterations; i++) {
      const request = createMockRequest()
      await handler(request)

      if (i % 100 === 0 && global.gc) {
        global.gc()
      }
    }

    if (global.gc)
      global.gc()
    const finalMemory = process.memoryUsage().heapUsed
    const memoryGrowth = finalMemory - initialMemory
    const memoryLeakDetected = memoryGrowth > (5 * 1024 * 1024) // 5MB threshold

    return {
      memoryLeakDetected,
      initialMemory,
      finalMemory,
      memoryGrowth,
    }
  },
}

/**
 * Stress testing utilities
 */
export const stressTests = {
  /**
   * Stress test with increasing load
   */
  rampUpTest: async (
    client: TestClient,
    path: string,
    options: {
      startConcurrency: number
      endConcurrency: number
      rampUpTime: number
      testDuration: number
    },
  ): Promise<Array<{
    concurrency: number
    requestsPerSecond: number
    averageResponseTime: number
    errorRate: number
  }>> => {
    const results: Array<{
      concurrency: number
      requestsPerSecond: number
      averageResponseTime: number
      errorRate: number
    }> = []

    const steps = 10
    const stepDuration = options.testDuration / steps
    const concurrencyStep = (options.endConcurrency - options.startConcurrency) / steps

    for (let step = 0; step < steps; step++) {
      const concurrency = Math.round(options.startConcurrency + (concurrencyStep * step))

      const loadTester = new LoadTester(client, {
        duration: stepDuration,
        concurrency,
        requestsPerSecond: concurrency * 2, // Allow higher RPS than concurrency
      })

      const result = await loadTester.run(path)

      results.push({
        concurrency,
        requestsPerSecond: result.requestsPerSecond,
        averageResponseTime: result.averageResponseTime,
        errorRate: result.failedRequests / result.totalRequests,
      })
    }

    return results
  },

  /**
   * Spike test - sudden load increase
   */
  spikeTest: async (
    client: TestClient,
    path: string,
    options: {
      normalLoad: number
      spikeLoad: number
      spikeDuration: number
    },
  ): Promise<{
    normalPhase: any
    spikePhase: any
    recoveryPhase: any
  }> => {
    // Normal load phase
    const normalTester = new LoadTester(client, {
      duration: 30000, // 30 seconds
      concurrency: options.normalLoad,
    })
    const normalPhase = await normalTester.run(path)

    // Spike phase
    const spikeTester = new LoadTester(client, {
      duration: options.spikeDuration,
      concurrency: options.spikeLoad,
    })
    const spikePhase = await spikeTester.run(path)

    // Recovery phase
    const recoveryTester = new LoadTester(client, {
      duration: 30000, // 30 seconds
      concurrency: options.normalLoad,
    })
    const recoveryPhase = await recoveryTester.run(path)

    return {
      normalPhase,
      spikePhase,
      recoveryPhase,
    }
  },
}

/**
 * Performance assertion helpers
 */
export const performanceAssertions = {
  /**
   * Assert response time is within acceptable range
   */
  responseTimeWithin: (actualTime: number, maxTime: number): void => {
    if (actualTime > maxTime) {
      throw new Error(`Response time ${actualTime}ms exceeds maximum ${maxTime}ms`)
    }
  },

  /**
   * Assert throughput meets minimum requirements
   */
  throughputAtLeast: (actualThroughput: number, minThroughput: number): void => {
    if (actualThroughput < minThroughput) {
      throw new Error(`Throughput ${actualThroughput} RPS is below minimum ${minThroughput} RPS`)
    }
  },

  /**
   * Assert error rate is acceptable
   */
  errorRateBelow: (errorRate: number, maxErrorRate: number): void => {
    if (errorRate > maxErrorRate) {
      throw new Error(`Error rate ${(errorRate * 100).toFixed(2)}% exceeds maximum ${(maxErrorRate * 100).toFixed(2)}%`)
    }
  },

  /**
   * Assert memory usage is within limits
   */
  memoryUsageWithin: (actualUsage: number, maxUsage: number): void => {
    if (actualUsage > maxUsage) {
      throw new Error(`Memory usage ${(actualUsage / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(maxUsage / 1024 / 1024).toFixed(2)}MB`)
    }
  },

  /**
   * Assert no memory leaks detected
   */
  noMemoryLeaks: (memoryGrowth: number, threshold: number = 5 * 1024 * 1024): void => {
    if (memoryGrowth > threshold) {
      throw new Error(`Potential memory leak detected: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`)
    }
  },
}

/**
 * Factory functions
 */
export function createPerformanceTester(): PerformanceTester {
  return new PerformanceTester()
}

export function createLoadTester(client: TestClient, config: LoadTestConfig): LoadTester {
  return new LoadTester(client, config)
}

/**
 * Performance test utilities
 */
export const performanceUtils = {
  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage: (): PerformanceMetrics['memoryUsage'] => {
    const usage = process.memoryUsage()
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
    }
  },

  /**
   * Get CPU usage
   */
  getCPUUsage: (): PerformanceMetrics['cpuUsage'] => {
    const usage = process.cpuUsage()
    return {
      user: usage.user,
      system: usage.system,
    }
  },

  /**
   * Create performance metric snapshot
   */
  createMetricSnapshot: (responseTime: number): PerformanceMetrics => ({
    responseTime,
    memoryUsage: performanceUtils.getCurrentMemoryUsage(),
    cpuUsage: performanceUtils.getCPUUsage(),
  }),

  /**
   * Format performance results for display
   */
  formatResults: (results: any): string => {
    return JSON.stringify(results, null, 2)
  },
}
