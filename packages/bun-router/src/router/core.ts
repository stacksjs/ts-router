import type { Server } from 'bun'
import type {
  ActionHandler,
  MiddlewareHandler,
  Route,
  RouteGroup,
  RouteHandler,
  RouterConfig,
  WebSocketConfig,
} from '../types'

// Re-export types for module augmentation
export type {
  ActionHandler,
  MiddlewareHandler,
  Route,
  RouteGroup,
  RouteHandler,
  RouterConfig,
  WebSocketConfig,
}

/**
 * Core Router class that manages routes and handles requests
 */
export class Router {
  routes: Route[] = []
  currentGroup: RouteGroup | null = null
  globalMiddleware: MiddlewareHandler[] = []
  namedRoutes: Map<string, Route> = new Map()
  fallbackHandler: ActionHandler | null = null
  patterns: Map<string, string> = new Map()
  currentDomain: string | null = null
  domains: Record<string, Route[]> = {}
  serverInstance: Server | null = null
  wsConfig: WebSocketConfig | null = null
  errorHandler: ((error: Error) => Response | Promise<Response>) | null = null
  templateCache: Map<string, string> = new Map<string, string>()
  routeCache: Map<string, { route: Route, params: Record<string, string> }> = new Map()
  staticRoutes: Map<string, Map<string, Route>> = new Map()
  precompiledPatterns: Map<string, RegExp> = new Map()
  domainPatternCache: Map<string, RegExp> = new Map()
  config: RouterConfig = {
    verbose: false,
    routesPath: 'routes',
    apiRoutesPath: 'routes/api.ts',
    webRoutesPath: 'routes/web.ts',
    apiPrefix: '/api',
    webPrefix: '',
    defaultMiddleware: {
      api: [],
      web: [],
    },
  }

  constructor(config: Partial<RouterConfig> = {}) {
    this.routes = []
    this.config = { ...this.config, ...config }
  }

  /**
   * Get the server instance
   */
  getServer(): Server | null {
    return this.serverInstance
  }

  /**
   * Extend the router with custom methods
   */
  extend(methods: Record<string, (...args: any[]) => any>): Router {
    for (const [name, method] of Object.entries(methods)) {
      if (typeof method === 'function') {
        // @ts-expect-error - dynamically extending the object
        this[name] = method.bind(this)
      }
    }
    return this
  }

  /**
   * Invalidate route caches
   */
  invalidateCache(): void {
    this.routeCache.clear()
  }
}
