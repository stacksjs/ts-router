/**
 * Development Tools - Main Integration
 *
 * Unified development tools with router integration and middleware
 */

import type { EnhancedRequest } from '../types'
import { createPerformanceProfilingMiddleware, initializePerformanceProfiler, PerformanceProfiler, PerformanceProfilingHelpers } from './performance-profiler'
import { createRouteDebugMiddleware, initializeRouteDebugger, RouteDebugger, RouteDebugHelpers } from './route-debugger'
import { initializeRouteInspector, RouteInspectionHelpers, RouteInspector } from './route-inspector'
import { initializeTypeScriptUtilities, TypeScriptHelpers, TypeScriptUtilities } from './typescript-utilities'

export interface DevelopmentConfig {
  debug?: {
    enabled?: boolean
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
    includeHeaders?: boolean
    includeBody?: boolean
    colorOutput?: boolean
  }
  profiling?: {
    enabled?: boolean
    sampleRate?: number
    includeMemory?: boolean
    includeCpu?: boolean
  }
  inspection?: {
    enabled?: boolean
    trackStats?: boolean
    generateReports?: boolean
  }
  typescript?: {
    generateTypes?: boolean
    validateTypes?: boolean
    generateSchemas?: boolean
  }
}

/**
 * Development tools manager
 */
export class DevelopmentTools {
  private debugger: RouteDebugger
  private inspector: RouteInspector
  private profiler: PerformanceProfiler
  private tsUtils: TypeScriptUtilities
  private config: DevelopmentConfig

  constructor(config: DevelopmentConfig = {}) {
    this.config = {
      debug: { enabled: true, ...config.debug },
      profiling: { enabled: true, sampleRate: 0.1, ...config.profiling },
      inspection: { enabled: true, trackStats: true, ...config.inspection },
      typescript: { generateTypes: true, ...config.typescript },
      ...config,
    }

    // Initialize components
    this.debugger = initializeRouteDebugger(this.config.debug)
    this.inspector = initializeRouteInspector()
    this.profiler = initializePerformanceProfiler(this.config.profiling)
    this.tsUtils = initializeTypeScriptUtilities(this.config.typescript)
  }

  /**
   * Create development middleware stack
   */
  createMiddleware(): Array<(req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>> {
    const middleware: Array<(req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>> = []

    // Add debugging middleware
    if (this.config.debug?.enabled) {
      middleware.push(createRouteDebugMiddleware(this.config.debug))
    }

    // Add profiling middleware
    if (this.config.profiling?.enabled) {
      middleware.push(createPerformanceProfilingMiddleware(this.config.profiling))
    }

    // Add inspection middleware
    if (this.config.inspection?.enabled) {
      middleware.push(this.createInspectionMiddleware())
    }

    return middleware
  }

  /**
   * Register route with all development tools
   */
  registerRoute(
    method: string,
    pattern: string,
    handler: (...args: any[]) => any,
    middleware: ((...args: any[]) => any)[] = [],
    options: any = {},
  ): string {
    // Register with debugger
    this.debugger.registerRoute(method, pattern, handler, middleware)

    // Register with inspector
    const routeId = this.inspector.registerRoute(method, pattern, handler, middleware, options)

    // Register with TypeScript utilities
    this.tsUtils.registerRouteTypes(method, pattern, options.types || {})

    return routeId
  }

  /**
   * Get route debugging information
   */
  debug(): {
    listRoutes: typeof RouteInspectionHelpers.listRoutes
    analyzeRoutes: typeof RouteInspectionHelpers.analyzeRoutes
    exportRoutes: typeof RouteInspectionHelpers.exportRoutes
    getDebugSession: (requestId: string) => import('./route-debugger').RouteDebugInfo | undefined
    clearSessions: () => void
  } {
    const debuggerInstance = this.debugger
    return {
      listRoutes: RouteInspectionHelpers.listRoutes,
      analyzeRoutes: RouteInspectionHelpers.analyzeRoutes,
      exportRoutes: RouteInspectionHelpers.exportRoutes,
      getDebugSession: (requestId: string): import('./route-debugger').RouteDebugInfo | undefined => debuggerInstance.getDebugSession(requestId),
      clearSessions: (): void => debuggerInstance.clearSessions(),
    }
  }

  /**
   * Get route listing and analysis
   */
  routes(): {
    list: (filter?: any) => import('./route-inspector').RouteMetadata[]
    analyze: () => import('./route-inspector').RouteAnalysis
    export: (format?: 'json' | 'csv' | 'markdown' | 'openapi') => string
    groups: () => import('./route-inspector').RouteGroup[]
    find: (method: string, path: string) => import('./route-inspector').RouteMetadata[]
  } {
    const inspectorInstance = this.inspector
    return {
      list: (filter?: any): import('./route-inspector').RouteMetadata[] => inspectorInstance.getRoutes(filter),
      analyze: (): import('./route-inspector').RouteAnalysis => inspectorInstance.analyzeRoutes(),
      export: (format?: 'json' | 'csv' | 'markdown' | 'openapi'): string => inspectorInstance.exportRoutes(format),
      groups: (): import('./route-inspector').RouteGroup[] => inspectorInstance.getGroups(),
      find: (method: string, path: string): import('./route-inspector').RouteMetadata[] => inspectorInstance.findMatchingRoutes(method, path),
    }
  }

  /**
   * Get performance profiling information
   */
  profile(): {
    getMetrics: () => import('./performance-profiler').PerformanceMetrics
    getProfiles: (filter?: any) => import('./performance-profiler').RouteProfile[]
    generateReport: () => string
    clear: () => void
  } {
    const profilerInstance = this.profiler
    return {
      getMetrics: (): import('./performance-profiler').PerformanceMetrics => profilerInstance.getMetrics(),
      getProfiles: (filter?: any): import('./performance-profiler').RouteProfile[] => profilerInstance.getProfiles(filter),
      generateReport: (): string => profilerInstance.generateReport(),
      clear: (): void => profilerInstance.clear(),
    }
  }

  /**
   * Get TypeScript utilities
   */
  typescript(): {
    generateTypes: () => string
    generateSchemas: () => Record<string, import('./typescript-utilities').ValidationSchema>
    generateOpenAPI: () => any
    generateRouteBuilder: () => string
    validateRequest: (req: EnhancedRequest, routeKey: string) => { valid: boolean, errors: string[], warnings: string[] }
  } {
    const tsUtilsInstance = this.tsUtils
    return {
      generateTypes: (): string => tsUtilsInstance.generateRouteTypes(),
      generateSchemas: (): Record<string, import('./typescript-utilities').ValidationSchema> => tsUtilsInstance.generateValidationSchemas(),
      generateOpenAPI: (): any => tsUtilsInstance.generateOpenAPISchema(),
      generateRouteBuilder: (): string => tsUtilsInstance.generateRouteBuilder(),
      validateRequest: (req: EnhancedRequest, routeKey: string): { valid: boolean, errors: string[], warnings: string[] } => tsUtilsInstance.validateRequest(req, routeKey),
    }
  }

  /**
   * Generate comprehensive development report
   */
  generateReport(): string {
    let report = '# Development Tools Report\n\n'

    // Route analysis
    const analysis = this.inspector.analyzeRoutes()
    report += '## Route Analysis\n'
    report += `- Total Routes: ${analysis.totalRoutes}\n`
    report += `- Routes by Method: ${JSON.stringify(analysis.routesByMethod)}\n`
    report += `- Unused Routes: ${analysis.unusedRoutes.length}\n`
    report += `- Slow Routes: ${analysis.slowRoutes.length}\n`
    report += `- Error-prone Routes: ${analysis.errorProneRoutes.length}\n\n`

    // Performance metrics
    const metrics = this.profiler.getMetrics()
    report += '## Performance Metrics\n'
    report += `- Average Response Time: ${metrics.averageResponseTime.toFixed(2)}ms\n`
    report += `- P95 Response Time: ${metrics.p95ResponseTime.toFixed(2)}ms\n`
    report += `- P99 Response Time: ${metrics.p99ResponseTime.toFixed(2)}ms\n`
    report += `- Memory Usage (Avg): ${(metrics.memoryUsageAverage / 1024 / 1024).toFixed(2)}MB\n`
    report += `- Memory Usage (Peak): ${(metrics.memoryUsagePeak / 1024 / 1024).toFixed(2)}MB\n\n`

    // Recommendations
    if (analysis.recommendations.length > 0) {
      report += '## Recommendations\n'
      analysis.recommendations.forEach((rec, index) => {
        report += `${index + 1}. ${rec}\n`
      })
      report += '\n'
    }

    // TypeScript information
    const routeTypes = this.tsUtils.getRouteTypes()
    report += '## TypeScript Information\n'
    report += `- Routes with Type Information: ${routeTypes.length}\n`
    report += `- Generated Type Definitions: Available\n`
    report += `- Validation Schemas: Available\n\n`

    return report
  }

  /**
   * Clear all development data
   */
  clear(): void {
    this.debugger.clearSessions()
    this.inspector.clear()
    this.profiler.clear()
    this.tsUtils.clear()
  }

  /**
   * Create inspection middleware
   */
  private createInspectionMiddleware() {
    return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      const startTime = performance.now()
      const _pattern = (req as any).route?.pattern || req.url
      const routeId = (req as any).route?.id

      try {
        const response = await next()

        if (routeId && this.config.inspection?.trackStats) {
          const duration = performance.now() - startTime
          this.inspector.recordRouteAccess(routeId, duration, false)
        }

        return response
      }
      catch (error) {
        if (routeId && this.config.inspection?.trackStats) {
          const duration = performance.now() - startTime
          this.inspector.recordRouteAccess(routeId, duration, true)
        }
        throw error
      }
    }
  }
}

/**
 * Router extension for development tools
 */
export class DevelopmentRouter {
  private devTools: DevelopmentTools
  private routes = new Map<string, any>()

  constructor(config?: DevelopmentConfig) {
    this.devTools = new DevelopmentTools(config)
  }

  /**
   * Enable debugging for next route
   */
  debug(): {
    get: (pattern: string, handler: (...args: any[]) => any) => any
    post: (pattern: string, handler: (...args: any[]) => any) => any
    put: (pattern: string, handler: (...args: any[]) => any) => any
    patch: (pattern: string, handler: (...args: any[]) => any) => any
    delete: (pattern: string, handler: (...args: any[]) => any) => any
  } {
    return {
      get: (pattern: string, handler: (...args: any[]) => any): any => this.registerRoute('GET', pattern, handler, { debug: true }),
      post: (pattern: string, handler: (...args: any[]) => any): any => this.registerRoute('POST', pattern, handler, { debug: true }),
      put: (pattern: string, handler: (...args: any[]) => any): any => this.registerRoute('PUT', pattern, handler, { debug: true }),
      patch: (pattern: string, handler: (...args: any[]) => any): any => this.registerRoute('PATCH', pattern, handler, { debug: true }),
      delete: (pattern: string, handler: (...args: any[]) => any): any => this.registerRoute('DELETE', pattern, handler, { debug: true }),
    }
  }

  /**
   * Enable profiling for route group
   */
  profile(): {
    group: (callback: () => void) => void
  } {
    return {
      group: (callback: () => void): void => {
        // Enable profiling for routes registered in callback
        const originalRegister = this.registerRoute.bind(this)
        this.registerRoute = (method: string, pattern: string, handler: (...args: any[]) => any, options: any = {}): any => {
          return originalRegister(method, pattern, handler, { ...options, profile: true })
        }

        callback()

        // Restore original register function
        this.registerRoute = originalRegister
      },
    }
  }

  /**
   * Get all registered routes
   */
  getRoutes(): import('./route-inspector').RouteMetadata[] {
    return this.devTools.routes().list()
  }

  /**
   * Register route with development tools
   */
  private registerRoute(method: string, pattern: string, handler: (...args: any[]) => any, options: any = {}) {
    const routeId = this.devTools.registerRoute(method, pattern, handler, [], options)

    const route = {
      id: routeId,
      method,
      pattern,
      handler,
      options,
    }

    this.routes.set(`${method}:${pattern}`, route)

    console.log(`🔧 Registered ${method} ${pattern} with development tools`)

    return route
  }
}

/**
 * Development presets for common configurations
 */
export const DevelopmentPresets = {
  /**
   * Full development mode with all features enabled
   */
  development: (): DevelopmentConfig => ({
    debug: {
      enabled: true,
      logLevel: 'debug',
      includeHeaders: true,
      includeBody: true,
      colorOutput: true,
    },
    profiling: {
      enabled: true,
      sampleRate: 1.0, // Profile all requests in development
      includeMemory: true,
      includeCpu: true,
    },
    inspection: {
      enabled: true,
      trackStats: true,
      generateReports: true,
    },
    typescript: {
      generateTypes: true,
      validateTypes: true,
      generateSchemas: true,
    },
  }),

  /**
   * Production debugging with minimal overhead
   */
  production: (): DevelopmentConfig => ({
    debug: {
      enabled: true,
      logLevel: 'warn',
      includeHeaders: false,
      includeBody: false,
      colorOutput: false,
    },
    profiling: {
      enabled: true,
      sampleRate: 0.01, // 1% sampling in production
      includeMemory: false,
      includeCpu: false,
    },
    inspection: {
      enabled: true,
      trackStats: true,
      generateReports: false,
    },
    typescript: {
      generateTypes: false,
      validateTypes: false,
      generateSchemas: false,
    },
  }),

  /**
   * Performance testing configuration
   */
  performance: (): DevelopmentConfig => ({
    debug: {
      enabled: false,
    },
    profiling: {
      enabled: true,
      sampleRate: 1.0,
      includeMemory: true,
      includeCpu: true,
    },
    inspection: {
      enabled: true,
      trackStats: true,
      generateReports: true,
    },
    typescript: {
      generateTypes: false,
      validateTypes: false,
      generateSchemas: false,
    },
  }),

  /**
   * TypeScript development configuration
   */
  typescript: (): DevelopmentConfig => ({
    debug: {
      enabled: true,
      logLevel: 'info',
    },
    profiling: {
      enabled: false,
    },
    inspection: {
      enabled: true,
      trackStats: false,
      generateReports: false,
    },
    typescript: {
      generateTypes: true,
      validateTypes: true,
      generateSchemas: true,
    },
  }),
}

// Export all components
export {
  PerformanceProfiler,
  PerformanceProfilingHelpers,
  RouteDebugger,
  RouteDebugHelpers,
  RouteInspectionHelpers,
  RouteInspector,
  TypeScriptHelpers,
  TypeScriptUtilities,
}

export type {
  ProfileConfig as ProfilerConfig,
  PerformanceMetrics as ProfilerMetrics,
  RouteProfile as ProfilerRouteProfile,
} from './performance-profiler'

// Export types
export type {
  RouteDebugConfig,
  RouteDebugInfo,
} from './route-debugger'

export type {
  RouteAnalysis as InspectorRouteAnalysis,
  RouteMetadata as InspectorRouteMetadata,
  RouteGroup,
} from './route-inspector'

export type {
  TypeScriptConfig as TSConfig,
  RouteTypeInfo as TSRouteTypeInfo,
  TypeDefinition as TSTypeDefinition,
  ValidationSchema as TSValidationSchema,
} from './typescript-utilities'
