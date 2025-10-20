/**
 * Hot Reload Development
 *
 * Hot reload for development using Bun's --hot mode with state preservation
 */

import { watch } from 'node:fs'
import { join, resolve } from 'node:path'

export interface HotReloadConfig {
  enabled?: boolean
  watchPaths?: string[]
  ignorePaths?: string[]
  extensions?: string[]
  debounceMs?: number
  preserveState?: boolean
  onReload?: (changedFiles: string[]) => void
  onError?: (error: Error) => void
  verbose?: boolean
}

export interface HotReloadState {
  reloadCount: number
  lastReload: number
  changedFiles: string[]
  preservedState: Record<string, any>
  watchers: Map<string, any>
}

declare global {
  // eslint-disable-next-line vars-on-top
  var __HOT_RELOAD_STATE__: HotReloadState | undefined
  // eslint-disable-next-line vars-on-top
  var __HOT_RELOAD_PRESERVE__: Record<string, any>
}

/**
 * Hot reload manager for development
 */
export class HotReloadManager {
  private config: Required<HotReloadConfig>
  private state: HotReloadState = {
    reloadCount: 0,
    lastReload: Date.now(),
    changedFiles: [],
    preservedState: {},
    watchers: new Map(),
  }

  private debounceTimer?: Timer
  private isReloading = false

  constructor(config: HotReloadConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      watchPaths: config.watchPaths ?? ['.'],
      ignorePaths: config.ignorePaths ?? ['node_modules', '.git', 'dist', 'build'],
      extensions: config.extensions ?? ['.ts', '.js', '.json', '.env'],
      debounceMs: config.debounceMs ?? 100,
      preserveState: config.preserveState ?? true,
      onReload: config.onReload ?? (() => {}),
      onError: config.onError ?? (error => console.error('Hot reload error:', error)),
      verbose: config.verbose ?? false,
      ...config,
    }

    this.initializeState()
    this.setupWatchers()
  }

  /**
   * Initialize or restore hot reload state
   */
  private initializeState(): void {
    if (globalThis.__HOT_RELOAD_STATE__) {
      // Restore existing state
      this.state = globalThis.__HOT_RELOAD_STATE__
      this.state.reloadCount++
      this.state.lastReload = Date.now()

      if (this.config.verbose) {
        console.log(`🔥 Hot reload #${this.state.reloadCount}`)
        if (this.state.changedFiles.length > 0) {
          console.log('📝 Changed files:', this.state.changedFiles)
        }
      }
    }
    else {
      // Initialize new state
      this.state = {
        reloadCount: 0,
        lastReload: Date.now(),
        changedFiles: [],
        preservedState: globalThis.__HOT_RELOAD_PRESERVE__ || {},
        watchers: new Map(),
      }

      globalThis.__HOT_RELOAD_STATE__ = this.state
      globalThis.__HOT_RELOAD_PRESERVE__ = this.state.preservedState

      if (this.config.verbose) {
        console.log('🔥 Hot reload initialized')
      }
    }
  }

  /**
   * Setup file watchers
   */
  private setupWatchers(): void {
    if (!this.config.enabled)
      return

    // Clear existing watchers
    this.state.watchers.forEach((watcher) => {
      try {
        watcher.close()
      }
      catch {
        // Ignore errors when closing watchers
      }
    })
    this.state.watchers.clear()

    // Setup new watchers
    for (const watchPath of this.config.watchPaths) {
      try {
        const resolvedPath = resolve(watchPath)
        const watcher = watch(resolvedPath, { recursive: true }, (eventType, filename) => {
          if (filename) {
            this.handleFileChange(eventType, join(resolvedPath, filename))
          }
        })

        this.state.watchers.set(watchPath, watcher)

        if (this.config.verbose) {
          console.log(`👀 Watching: ${resolvedPath}`)
        }
      }
      catch (err) {
        this.config.onError(err as Error)
      }
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(eventType: string, filePath: string): void {
    if (this.isReloading)
      return

    // Check if file should be ignored
    if (this.shouldIgnoreFile(filePath))
      return

    // Check if file extension is watched
    if (!this.shouldWatchFile(filePath))
      return

    if (this.config.verbose) {
      console.log(`📁 File ${eventType}: ${filePath}`)
    }

    // Add to changed files
    if (!this.state.changedFiles.includes(filePath)) {
      this.state.changedFiles.push(filePath)
    }

    // Debounce reload
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.triggerReload()
    }, this.config.debounceMs)
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnoreFile(filePath: string): boolean {
    return this.config.ignorePaths.some(ignorePath =>
      filePath.includes(ignorePath),
    )
  }

  /**
   * Check if file should be watched
   */
  private shouldWatchFile(filePath: string): boolean {
    if (this.config.extensions.length === 0)
      return true

    return this.config.extensions.some(ext =>
      filePath.endsWith(ext),
    )
  }

  /**
   * Trigger hot reload
   */
  private triggerReload(): void {
    if (this.isReloading)
      return

    this.isReloading = true

    try {
      // Call reload callback
      this.config.onReload(this.state.changedFiles)

      // Update state
      this.state.lastReload = Date.now()

      if (this.config.verbose) {
        console.log(`🔄 Hot reload triggered for ${this.state.changedFiles.length} files`)
      }

      // Clear changed files
      this.state.changedFiles = []
    }
    catch (error) {
      this.config.onError(error as Error)
    }
    finally {
      this.isReloading = false
    }
  }

  /**
   * Preserve state across reloads
   */
  preserveState<T>(key: string, value: T): void {
    if (this.config.preserveState) {
      this.state.preservedState[key] = value
      globalThis.__HOT_RELOAD_PRESERVE__[key] = value
    }
  }

  /**
   * Restore preserved state
   */
  restoreState<T>(key: string, defaultValue?: T): T | undefined {
    if (this.config.preserveState && key in this.state.preservedState) {
      return this.state.preservedState[key] as T
    }
    return defaultValue
  }

  /**
   * Clear preserved state
   */
  clearState(key?: string): void {
    if (key) {
      delete this.state.preservedState[key]
      delete globalThis.__HOT_RELOAD_PRESERVE__[key]
    }
    else {
      this.state.preservedState = {}
      globalThis.__HOT_RELOAD_PRESERVE__ = {}
    }
  }

  /**
   * Get hot reload statistics
   */
  getStats(): {
    reloadCount: number
    lastReload: number
    uptime: number
    watchedPaths: string[]
    preservedKeys: string[]
  } {
    return {
      reloadCount: this.state.reloadCount,
      lastReload: this.state.lastReload,
      uptime: Date.now() - this.state.lastReload,
      watchedPaths: Array.from(this.state.watchers.keys()),
      preservedKeys: Object.keys(this.state.preservedState),
    }
  }

  /**
   * Stop hot reload
   */
  stop(): void {
    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    // Close all watchers
    this.state.watchers.forEach((watcher) => {
      try {
        watcher.close()
      }
      catch {
        // Ignore errors when closing watchers
      }
    })
    this.state.watchers.clear()

    if (this.config.verbose) {
      console.log('🛑 Hot reload stopped')
    }
  }
}

/**
 * Hot reload middleware for preserving server state
 */
export function createHotReloadMiddleware(hotReload: HotReloadManager) {
  return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
    // Add hot reload info to response headers in development
    const response = await next()

    if (hotReload.getStats().reloadCount > 0) {
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Hot-Reload-Count', hotReload.getStats().reloadCount.toString())
      newHeaders.set('X-Hot-Reload-Last', new Date(hotReload.getStats().lastReload).toISOString())

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    }

    return response
  }
}

/**
 * Hot reload utilities
 */
export const HotReloadUtils = {
  /**
   * Check if running in hot reload mode
   */
  isHotReloadEnabled: (): boolean => {
    return !!globalThis.__HOT_RELOAD_STATE__
  },

  /**
   * Get current reload count
   */
  getReloadCount: (): number => {
    return globalThis.__HOT_RELOAD_STATE__?.reloadCount || 0
  },

  /**
   * Create hot-reloadable module cache
   */
  createModuleCache: <T>() => {
    const cache = new Map<string, T>()

    return {
      get: (key: string): T | undefined => cache.get(key),
      set: (key: string, value: T): void => {
        cache.set(key, value)
      },
      clear: (): void => cache.clear(),
      delete: (key: string): boolean => cache.delete(key),
      has: (key: string): boolean => cache.has(key),
      size: (): number => cache.size,
    }
  },

  /**
   * Create hot-reloadable configuration
   */
  createHotConfig: <T>(initialConfig: T, configPath?: string): {
    get: () => T
    reload: () => Promise<T>
    onChange: (callback: (config: T) => void) => void
  } => {
    let currentConfig = initialConfig
    const changeCallbacks: Array<(config: T) => void> = []

    const reloadConfig = async (): Promise<T> => {
      if (configPath) {
        try {
          // Clear require cache for config file
          // Note: Dynamic config reloading would require proper import handling
          const newConfig = {}
          currentConfig = { ...currentConfig, ...newConfig }

          // Notify change callbacks
          changeCallbacks.forEach(callback => callback(currentConfig))
        }
        catch (err) {
          console.error('Failed to reload config:', err)
        }
      }
      return currentConfig
    }

    return {
      get: () => currentConfig,
      reload: reloadConfig,
      onChange: (callback: (config: T) => void) => {
        changeCallbacks.push(callback)
      },
    }
  },
}

/**
 * Hot reload helpers for common patterns
 */
export const HotReloadHelpers = {
  /**
   * Create hot-reloadable route handlers
   */
  createHotHandler: (_handlerPath: string) => {
    return async (_request: Request): Promise<Response> => {
      try {
        // Clear module cache in hot reload mode
        // Note: Dynamic handler loading would require proper import handling
        const handler = async () => new Response('Handler not available', { status: 501 })
        return await handler()
      }
      catch {
        console.error('Hot handler error')
        return new Response('Handler Error', { status: 500 })
      }
    }
  },

  /**
   * Create hot-reloadable middleware
   */
  createHotMiddleware: (_middlewarePath: string) => {
    return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
      try {
        // Note: Module cache clearing would require proper import handling

        // Note: Dynamic middleware loading would require proper import handling
        return await next()
      }
      catch {
        console.error('Hot middleware error')
        return await next()
      }
    }
  },

  /**
   * Create development server with hot reload
   */
  createDevelopmentServer: (config: {
    port?: number
    hostname?: string
    hotReload?: HotReloadConfig
    onReload?: () => void
  } = {}) => {
    const hotReload = new HotReloadManager({
      ...config.hotReload,
      onReload: (changedFiles) => {
        console.log(`🔥 Hot reload: ${changedFiles.length} files changed`)
        config.onReload?.()
        config.hotReload?.onReload?.(changedFiles)
      },
    })

    // Preserve server instance across reloads
    const serverKey = 'development_server'
    let server = hotReload.restoreState<any>(serverKey)

    if (!server) {
      server = Bun.serve({
        port: config.port || 3000,
        hostname: config.hostname || 'localhost',

        fetch: async (request) => {
          // Add hot reload middleware
          const hotReloadMiddleware = createHotReloadMiddleware(hotReload)

          return await hotReloadMiddleware(request, async () => {
            return new Response('Hot Reload Development Server', {
              headers: { 'Content-Type': 'text/plain' },
            })
          })
        },
      })

      hotReload.preserveState(serverKey, server)
      console.log(`🚀 Development server started on http://${config.hostname || 'localhost'}:${config.port || 3000}`)
    }
    else {
      console.log(`🔄 Development server reloaded`)
    }

    return {
      server: server,
      hotReload: hotReload,
      stop: (): void => {
        hotReload.stop()
        server.stop()
      },
    }
  },
}

/**
 * Hot reload decorators for classes and methods
 */
export const HotReloadDecorators = {
  /**
   * Class decorator for hot-reloadable classes
   */
  hotReloadable: <T extends new (...args: any[]) => any>(constructor: T): T => {
    const className = constructor.name

    return class extends constructor {
      constructor(...args: any[]) {
        super(...args)

        // Preserve instance state if hot reloading
        if (HotReloadUtils.isHotReloadEnabled()) {
          const stateKey = `class_${className}_${Date.now()}`
          const preserved = globalThis.__HOT_RELOAD_PRESERVE__?.[stateKey]

          if (preserved) {
            Object.assign(this, preserved)
          }

          // Save state on next tick
          setTimeout(() => {
            if (globalThis.__HOT_RELOAD_PRESERVE__) {
              globalThis.__HOT_RELOAD_PRESERVE__[stateKey] = { ...this }
            }
          }, 0)
        }
      }
    } as T
  },

  /**
   * Method decorator for hot-reloadable methods
   */
  hotMethod: (target: any, propertyKey: string, descriptor: PropertyDescriptor): void => {
    const originalMethod = descriptor.value

    descriptor.value = function (...args: any[]) {
      try {
        return originalMethod.apply(this, args)
      }
      catch (err) {
        console.error(`Hot method error in ${propertyKey}:`, err)
        throw err
      }
    }
  },
}

/**
 * Global hot reload instance
 */
let globalHotReload: HotReloadManager | null = null

/**
 * Initialize global hot reload
 */
export function initializeHotReload(config?: HotReloadConfig): HotReloadManager {
  if (!globalHotReload) {
    globalHotReload = new HotReloadManager(config)
  }
  return globalHotReload
}

/**
 * Get global hot reload instance
 */
export function getHotReload(): HotReloadManager | null {
  return globalHotReload
}

/**
 * Hot reload factory functions
 */
export const HotReloadFactory = {
  /**
   * Create development hot reload
   */
  createDevelopment: (): HotReloadManager => {
    return new HotReloadManager({
      enabled: true,
      watchPaths: ['.'],
      ignorePaths: ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt'],
      extensions: ['.ts', '.js', '.tsx', '.jsx', '.json', '.env'],
      debounceMs: 100,
      preserveState: true,
      verbose: true,
    })
  },

  /**
   * Create production hot reload (disabled)
   */
  createProduction: (): HotReloadManager => {
    return new HotReloadManager({
      enabled: false,
      preserveState: false,
      verbose: false,
    })
  },

  /**
   * Create testing hot reload
   */
  createTesting: (): HotReloadManager => {
    return new HotReloadManager({
      enabled: false,
      preserveState: true,
      verbose: false,
    })
  },
}
