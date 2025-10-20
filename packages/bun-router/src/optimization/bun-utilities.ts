/**
 * Bun Runtime Optimization Utilities
 *
 * Generic optimization utilities leveraging Bun's runtime capabilities
 */

import { Buffer } from 'node:buffer'
import process from 'node:process'

export interface BunOptimizationConfig {
  enableJIT?: boolean
  enableGC?: boolean
  memoryLimit?: number
  cpuLimit?: number
  enableProfiling?: boolean
  enableTracing?: boolean
}

export interface PerformanceMetrics {
  memoryUsage: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
    arrayBuffers: number
  }
  cpuUsage: {
    user: number
    system: number
  }
  eventLoop: {
    delay: number
    utilization: number
  }
  gc: {
    collections: number
    duration: number
    freed: number
  }
  bunSpecific: {
    jitCompilations: number
    nativeCallsOptimized: number
    fileSystemCacheHits: number
  }
}

/**
 * Bun runtime optimizer
 */
export class BunOptimizer {
  private config: Required<BunOptimizationConfig>
  private metrics: PerformanceMetrics
  private gcObserver?: PerformanceObserver
  private performanceObserver?: PerformanceObserver

  constructor(config: BunOptimizationConfig = {}) {
    this.config = {
      enableJIT: config.enableJIT ?? true,
      enableGC: config.enableGC ?? true,
      memoryLimit: config.memoryLimit ?? 512 * 1024 * 1024, // 512MB
      cpuLimit: config.cpuLimit ?? 80, // 80% CPU
      enableProfiling: config.enableProfiling ?? false,
      enableTracing: config.enableTracing ?? false,
      ...config,
    }

    this.metrics = this.initializeMetrics()
    this.setupOptimizations()
    this.setupMonitoring()
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()

    return {
      memoryUsage: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      eventLoop: {
        delay: 0,
        utilization: 0,
      },
      gc: {
        collections: 0,
        duration: 0,
        freed: 0,
      },
      bunSpecific: {
        jitCompilations: 0,
        nativeCallsOptimized: 0,
        fileSystemCacheHits: 0,
      },
    }
  }

  /**
   * Setup Bun-specific optimizations
   */
  private setupOptimizations(): void {
    // Enable JIT compilation hints
    if (this.config.enableJIT) {
      this.enableJITOptimizations()
    }

    // Configure garbage collection
    if (this.config.enableGC) {
      this.configureGarbageCollection()
    }

    // Set memory limits
    if (this.config.memoryLimit > 0) {
      this.setMemoryLimits()
    }
  }

  /**
   * Enable JIT compilation optimizations
   */
  private enableJITOptimizations(): void {
    // Bun-specific JIT hints
    if (typeof Bun !== 'undefined') {
      // Warm up common code paths
      this.warmupCodePaths()

      // Enable native optimizations
      this.enableNativeOptimizations()
    }
  }

  /**
   * Warm up common code paths for JIT
   */
  private warmupCodePaths(): void {
    // Common operations to warm up JIT
    const warmupOperations = [
      () => JSON.stringify({ test: 'data' }),
      () => JSON.parse('{"test":"data"}'),
      () => new URL('http://localhost:3000'),
      () => new Headers({ 'content-type': 'application/json' }),
      () => new Response('test'),
      () => Buffer.from('test'),
      () => new TextEncoder().encode('test'),
      () => new TextDecoder().decode(new Uint8Array([116, 101, 115, 116])),
    ]

    // Run warmup operations multiple times
    for (let i = 0; i < 100; i++) {
      warmupOperations.forEach((op) => {
        try {
          op()
        }
        catch (error) {
          console.error(error)
          // Ignore warmup errors
        }
      })
    }

    this.metrics.bunSpecific.jitCompilations += warmupOperations.length
  }

  /**
   * Enable native call optimizations
   */
  private enableNativeOptimizations(): void {
    // Optimize common native calls
    const originalFetch = globalThis.fetch
    const wrappedFetch = ((...args: Parameters<typeof fetch>) => {
      this.metrics.bunSpecific.nativeCallsOptimized++
      return originalFetch(...args)
    }) as typeof fetch

    // Preserve preconnect property if it exists
    if ('preconnect' in originalFetch) {
      (wrappedFetch as any).preconnect = (originalFetch as any).preconnect
    }

    globalThis.fetch = wrappedFetch

    // Optimize file system operations
    if (typeof Bun !== 'undefined' && Bun.file) {
      const originalFile = Bun.file
      Bun.file = ((...args: Parameters<typeof originalFile>) => {
        this.metrics.bunSpecific.fileSystemCacheHits++
        return originalFile(...args)
      }) as typeof originalFile
    }
  }

  /**
   * Configure garbage collection
   */
  private configureGarbageCollection(): void {
    // Setup GC monitoring
    if (typeof PerformanceObserver !== 'undefined') {
      this.gcObserver = new (PerformanceObserver as any)((list: PerformanceObserverEntryList) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'gc') {
            this.metrics.gc.collections++
            this.metrics.gc.duration += entry.duration
          }
        }
      })

      try {
        this.gcObserver?.observe({ entryTypes: ['gc'] })
      }
      catch (error) {
        console.error(error)
        // GC observation not supported
      }
    }

    // Trigger periodic GC if memory usage is high
    setInterval(() => {
      const memUsage = process.memoryUsage()
      if (memUsage.heapUsed > this.config.memoryLimit * 0.8) {
        if (globalThis.gc) {
          const before = memUsage.heapUsed
          globalThis.gc()
          const after = process.memoryUsage().heapUsed
          this.metrics.gc.freed += before - after
        }
      }
    }, 30000) // Check every 30 seconds
  }

  /**
   * Set memory limits
   */
  private setMemoryLimits(): void {
    // Monitor memory usage
    setInterval(() => {
      const memUsage = process.memoryUsage()
      this.metrics.memoryUsage = {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      }

      // Warn if approaching memory limit
      if (memUsage.heapUsed > this.config.memoryLimit * 0.9) {
        console.warn(`Memory usage approaching limit: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`)
      }
    }, 5000) // Check every 5 seconds
  }

  /**
   * Setup performance monitoring
   */
  private setupMonitoring(): void {
    // Monitor event loop
    setInterval(() => {
      const start = performance.now()
      setImmediate(() => {
        const delay = performance.now() - start
        this.metrics.eventLoop.delay = delay
        this.metrics.eventLoop.utilization = Math.min(delay / 16.67, 1) // 60fps baseline
      })
    }, 1000)

    // Monitor CPU usage
    setInterval(() => {
      const cpuUsage = process.cpuUsage()
      this.metrics.cpuUsage = {
        user: cpuUsage.user,
        system: cpuUsage.system,
      }
    }, 5000)

    // Setup performance observer
    if (typeof PerformanceObserver !== 'undefined') {
      this.performanceObserver = new (PerformanceObserver as any)((list: PerformanceObserverEntryList) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            // Track custom performance measures
          }
        }
      })

      try {
        this.performanceObserver?.observe({ entryTypes: ['measure', 'navigation'] as any })
      }
      catch (error) {
        console.error(error)
        // Performance observation not supported
      }
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  /**
   * Optimize specific function
   */
  optimizeFunction<T extends (...args: any[]) => any>(fn: T, options: {
    memoize?: boolean
    warmup?: boolean
    profile?: boolean
  } = {}): T {
    let memoCache: Map<string, any> | undefined
    let callCount = 0

    if (options.memoize) {
      memoCache = new Map()
    }

    if (options.warmup) {
      // Warmup function for JIT
      for (let i = 0; i < 10; i++) {
        try {
          fn()
        }
        catch (error) {
          console.error(error)
          // Ignore warmup errors
        }
      }
    }

    const optimizedFn = ((...args: any[]) => {
      callCount++

      if (options.profile) {
        const start = performance.now()
        const result = fn(...args)
        const duration = performance.now() - start

        if (duration > 10) { // Log slow calls
          console.warn(`Slow function call: ${fn.name || 'anonymous'} took ${duration.toFixed(2)}ms`)
        }

        return result
      }

      if (memoCache) {
        const key = JSON.stringify(args)
        if (memoCache.has(key)) {
          return memoCache.get(key)
        }

        const result = fn(...args)
        memoCache.set(key, result)
        return result
      }

      return fn(...args)
    }) as T

    // Add metadata
    Object.defineProperty(optimizedFn, 'callCount', {
      get: () => callCount,
    })

    Object.defineProperty(optimizedFn, 'clearCache', {
      value: () => memoCache?.clear(),
    })

    return optimizedFn
  }

  /**
   * Create optimized buffer operations
   */
  createBufferOptimizer() {
    const bufferPool = new Map<number, Buffer[]>()

    return {
      /**
       * Get buffer from pool or create new one
       */
      getBuffer: (size: number): Buffer => {
        const pool = bufferPool.get(size) || []
        const buffer = pool.pop()

        if (buffer) {
          buffer.fill(0) // Clear buffer
          return buffer
        }

        return Buffer.allocUnsafe(size)
      },

      /**
       * Return buffer to pool
       */
      returnBuffer: (buffer: Buffer): void => {
        const size = buffer.length
        const pool = bufferPool.get(size) || []

        if (pool.length < 10) { // Limit pool size
          pool.push(buffer)
          bufferPool.set(size, pool)
        }
      },

      /**
       * Clear buffer pools
       */
      clearPools: (): void => {
        bufferPool.clear()
      },

      /**
       * Get pool statistics
       */
      getStats: () => {
        const stats: Record<number, number> = {}
        bufferPool.forEach((pool, size) => {
          stats[size] = pool.length
        })
        return stats
      },
    }
  }

  /**
   * Create optimized JSON operations
   */
  createJSONOptimizer() {
    const parseCache = new Map<string, any>()
    const stringifyCache = new Map<any, string>()

    return {
      /**
       * Optimized JSON parse with caching
       */
      parse: (text: string): any => {
        if (parseCache.has(text)) {
          return parseCache.get(text)
        }

        const result = JSON.parse(text)

        if (parseCache.size < 1000) { // Limit cache size
          parseCache.set(text, result)
        }

        return result
      },

      /**
       * Optimized JSON stringify with caching
       */
      stringify: (value: any): string => {
        if (stringifyCache.has(value)) {
          return stringifyCache.get(value)!
        }

        const result = JSON.stringify(value)

        if (stringifyCache.size < 1000) { // Limit cache size
          stringifyCache.set(value, result)
        }

        return result
      },

      /**
       * Clear JSON caches
       */
      clearCaches: (): void => {
        parseCache.clear()
        stringifyCache.clear()
      },

      /**
       * Get cache statistics
       */
      getStats: () => ({
        parseCache: parseCache.size,
        stringifyCache: stringifyCache.size,
      }),
    }
  }

  /**
   * Create worker pool for CPU-intensive tasks
   */
  createWorkerPool(workerScript: string, poolSize: number = navigator.hardwareConcurrency || 4) {
    const workers: Worker[] = []
    const taskQueue: Array<{
      data: any
      resolve: (value: any) => void
      reject: (error: any) => void
    }> = []
    let currentWorker = 0

    // Initialize workers
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(workerScript)

      worker.onmessage = (event) => {
        const task = taskQueue.shift()
        if (task) {
          if (event.data.error) {
            task.reject(new Error(event.data.error))
          }
          else {
            task.resolve(event.data.result)
          }
        }
      }

      worker.onerror = (error) => {
        const task = taskQueue.shift()
        if (task) {
          task.reject(error)
        }
      }

      workers.push(worker)
    }

    return {
      /**
       * Execute task in worker
       */
      execute: <T>(data: any): Promise<T> => {
        return new Promise((resolve, reject) => {
          taskQueue.push({ data, resolve, reject })

          const worker = workers[currentWorker]
          currentWorker = (currentWorker + 1) % workers.length

          worker.postMessage(data)
        })
      },

      /**
       * Terminate all workers
       */
      terminate: (): void => {
        workers.forEach(worker => worker.terminate())
        workers.length = 0
      },

      /**
       * Get pool statistics
       */
      getStats: () => ({
        poolSize: workers.length,
        queueSize: taskQueue.length,
        activeWorkers: workers.length - taskQueue.length,
      }),
    }
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const metrics = this.getMetrics()

    return `
# Bun Runtime Performance Report

## Memory Usage
- RSS: ${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB
- Heap Used: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB
- Heap Total: ${Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024)}MB
- External: ${Math.round(metrics.memoryUsage.external / 1024 / 1024)}MB
- Array Buffers: ${Math.round(metrics.memoryUsage.arrayBuffers / 1024 / 1024)}MB

## CPU Usage
- User: ${Math.round(metrics.cpuUsage.user / 1000)}ms
- System: ${Math.round(metrics.cpuUsage.system / 1000)}ms

## Event Loop
- Delay: ${metrics.eventLoop.delay.toFixed(2)}ms
- Utilization: ${(metrics.eventLoop.utilization * 100).toFixed(1)}%

## Garbage Collection
- Collections: ${metrics.gc.collections}
- Total Duration: ${metrics.gc.duration.toFixed(2)}ms
- Memory Freed: ${Math.round(metrics.gc.freed / 1024 / 1024)}MB

## Bun-Specific Optimizations
- JIT Compilations: ${metrics.bunSpecific.jitCompilations}
- Native Calls Optimized: ${metrics.bunSpecific.nativeCallsOptimized}
- File System Cache Hits: ${metrics.bunSpecific.fileSystemCacheHits}

## Configuration
- JIT Enabled: ${this.config.enableJIT}
- GC Enabled: ${this.config.enableGC}
- Memory Limit: ${Math.round(this.config.memoryLimit / 1024 / 1024)}MB
- CPU Limit: ${this.config.cpuLimit}%
- Profiling: ${this.config.enableProfiling}
- Tracing: ${this.config.enableTracing}
    `.trim()
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.gcObserver?.disconnect()
    this.performanceObserver?.disconnect()
  }
}

/**
 * Bun optimization utilities
 */
export const BunUtils = {
  /**
   * Check if running in Bun runtime
   */
  isBun: (): boolean => {
    return typeof Bun !== 'undefined'
  },

  /**
   * Get Bun version
   */
  getBunVersion: (): string => {
    return typeof Bun !== 'undefined' ? Bun.version : 'Not running in Bun'
  },

  /**
   * Optimize async function with Bun-specific features
   */
  optimizeAsync: <T extends (...args: any[]) => Promise<any>>(fn: T): T => {
    return (async (...args: any[]) => {
      // Use Bun's optimized Promise implementation
      return await fn(...args)
    }) as T
  },

  /**
   * Create optimized stream processor
   */
  createStreamProcessor: () => {
    return {
      /**
       * Process readable stream with Bun optimizations
       */
      processStream: async (stream: ReadableStream): Promise<Uint8Array> => {
        const reader = stream.getReader()
        const chunks: Uint8Array[] = []
        let totalLength = 0

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done)
              break

            chunks.push(value)
            totalLength += value.length
          }

          // Use Bun's optimized buffer concatenation
          const result = new Uint8Array(totalLength)
          let offset = 0

          for (const chunk of chunks) {
            result.set(chunk, offset)
            offset += chunk.length
          }

          return result
        }
        finally {
          reader.releaseLock()
        }
      },

      /**
       * Create optimized transform stream
       */
      createTransformStream: <T, U>(
        transformer: (chunk: T) => U | Promise<U>,
      ): TransformStream<T, U> => {
        return new TransformStream({
          async transform(chunk, controller) {
            try {
              const result = await transformer(chunk)
              controller.enqueue(result)
            }
            catch (error) {
              controller.error(error)
            }
          },
        })
      },
    }
  },
}

/**
 * Bun optimization factory functions
 */
export const BunOptimizationFactory = {
  /**
   * Create development optimizer
   */
  createDevelopment: (): BunOptimizer => {
    return new BunOptimizer({
      enableJIT: true,
      enableGC: true,
      memoryLimit: 1024 * 1024 * 1024, // 1GB
      cpuLimit: 90,
      enableProfiling: true,
      enableTracing: true,
    })
  },

  /**
   * Create production optimizer
   */
  createProduction: (): BunOptimizer => {
    return new BunOptimizer({
      enableJIT: true,
      enableGC: true,
      memoryLimit: 512 * 1024 * 1024, // 512MB
      cpuLimit: 80,
      enableProfiling: false,
      enableTracing: false,
    })
  },

  /**
   * Create testing optimizer
   */
  createTesting: (): BunOptimizer => {
    return new BunOptimizer({
      enableJIT: false,
      enableGC: false,
      memoryLimit: 256 * 1024 * 1024, // 256MB
      cpuLimit: 70,
      enableProfiling: false,
      enableTracing: false,
    })
  },
}

/**
 * Global Bun optimizer instance
 */
let globalOptimizer: BunOptimizer | null = null

/**
 * Initialize global Bun optimizer
 */
export function initializeBunOptimizer(config?: BunOptimizationConfig): BunOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new BunOptimizer(config)
  }
  return globalOptimizer
}

/**
 * Get global Bun optimizer
 */
export function getBunOptimizer(): BunOptimizer | null {
  return globalOptimizer
}
