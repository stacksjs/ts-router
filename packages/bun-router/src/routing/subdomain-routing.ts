import type { EnhancedRequest, MiddlewareHandler, RouteHandler } from '../types'

/**
 * Domain pattern configuration
 */
export interface DomainPattern {
  pattern: string // e.g., '{account}.app.com', 'api.{domain}.com'
  parameters: string[] // Extracted parameter names
  regex: RegExp // Compiled regex for matching
}

/**
 * Domain group configuration
 */
export interface DomainGroupConfig {
  domain: string
  middleware?: MiddlewareHandler[]
  prefix?: string
  name?: string
}

/**
 * Subdomain route information
 */
export interface SubdomainRouteInfo {
  domain: string
  parameters: Record<string, string>
  subdomain?: string
  rootDomain?: string
}

/**
 * Domain pattern parser and matcher
 */
export class DomainMatcher {
  /**
   * Parse domain pattern into regex and parameter names
   */
  static parseDomainPattern(pattern: string): DomainPattern {
    const parameters: string[] = []

    // Extract parameters from pattern (e.g., {account}, {subdomain})
    const paramMatches = pattern.match(/\{([^}]+)\}/g) || []

    for (const match of paramMatches) {
      const paramName = match.slice(1, -1) // Remove { }
      parameters.push(paramName)
    }

    // Convert pattern to regex
    let regexPattern = pattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\{([^}]+)\}/g, '([^.]+)') // Replace {param} with capture group

    // Ensure full domain match
    regexPattern = `^${regexPattern}$`

    const regex = new RegExp(regexPattern, 'i') // Case insensitive

    return {
      pattern,
      parameters,
      regex,
    }
  }

  /**
   * Match domain against pattern and extract parameters
   */
  static matchDomain(domain: string, pattern: DomainPattern): Record<string, string> | null {
    const match = domain.match(pattern.regex)
    if (!match) {
      return null
    }

    const parameters: Record<string, string> = {}

    // Extract parameter values from regex groups
    for (let i = 0; i < pattern.parameters.length; i++) {
      const paramName = pattern.parameters[i]
      const paramValue = match[i + 1] // match[0] is full match, parameters start at index 1
      parameters[paramName] = paramValue
    }

    return parameters
  }

  /**
   * Extract subdomain information from domain
   */
  static extractSubdomainInfo(domain: string): SubdomainRouteInfo {
    const parts = domain.split('.')

    if (parts.length <= 2) {
      // No subdomain (e.g., example.com)
      return {
        domain,
        parameters: {},
        rootDomain: domain,
      }
    }

    // Has subdomain (e.g., api.example.com, user.api.example.com)
    const subdomain = parts[0]
    const rootDomain = parts.slice(1).join('.')

    return {
      domain,
      parameters: { subdomain },
      subdomain,
      rootDomain,
    }
  }
}

/**
 * Domain group for organizing routes by domain patterns
 */
export class DomainGroup {
  private routes: Array<{
    method: string
    path: string
    handler: RouteHandler
    middleware: MiddlewareHandler[]
    name?: string
  }> = []

  constructor(
    public pattern: DomainPattern,
    public config: DomainGroupConfig,
  ) {}

  /**
   * Add route to domain group
   */
  addRoute(
    method: string,
    path: string,
    handler: RouteHandler,
    middleware: MiddlewareHandler[] = [],
    name?: string,
  ): void {
    // Combine group middleware with route middleware
    const allMiddleware = [
      ...(this.config.middleware || []),
      ...middleware,
    ]

    // Add prefix if configured
    const fullPath = this.config.prefix ? `${this.config.prefix}${path}` : path

    this.routes.push({
      method: method.toUpperCase(),
      path: fullPath,
      handler,
      middleware: allMiddleware,
      name: name || (this.config.name ? `${this.config.name}.${method.toLowerCase()}${path}` : undefined),
    })
  }

  /**
   * Get all routes in this domain group
   */
  getRoutes(): Array<{ method: string, path: string, handler: RouteHandler, middleware: MiddlewareHandler[] }> {
    return [...this.routes] as Array<{ method: string, path: string, handler: RouteHandler, middleware: MiddlewareHandler[] }>
  }

  /**
   * Check if domain matches this group's pattern
   */
  matchesDomain(domain: string): Record<string, string> | null {
    return DomainMatcher.matchDomain(domain, this.pattern)
  }
}

/**
 * Subdomain router for managing domain-based routing
 */
export class SubdomainRouter {
  private domainGroups: DomainGroup[] = []
  private wildcardGroup?: DomainGroup // Fallback for unmatched domains

  /**
   * Create domain group with pattern
   */
  domain(pattern: string): DomainGroupBuilder {
    const domainPattern = DomainMatcher.parseDomainPattern(pattern)
    return new DomainGroupBuilder(this, domainPattern)
  }

  /**
   * Add domain group to router
   */
  addDomainGroup(group: DomainGroup): void {
    // Check if this is a wildcard pattern (no parameters, contains *)
    if (group.pattern.pattern.includes('*') && group.pattern.parameters.length === 0) {
      this.wildcardGroup = group
    }
    else {
      this.domainGroups.push(group)
    }
  }

  /**
   * Find matching domain group and extract parameters
   */
  findDomainGroup(domain: string): { group: DomainGroup, parameters: Record<string, string> } | null {
    // Try specific domain patterns first
    for (const group of this.domainGroups) {
      const parameters = group.matchesDomain(domain)
      if (parameters !== null) {
        return { group, parameters }
      }
    }

    // Fall back to wildcard group if available
    if (this.wildcardGroup) {
      return {
        group: this.wildcardGroup,
        parameters: DomainMatcher.extractSubdomainInfo(domain).parameters,
      }
    }

    return null
  }

  /**
   * Get all routes from all domain groups
   */
  getAllRoutes(): Array<{
    domainPattern: string
    domainParameters: Record<string, string>
    method: string
    path: string
    handler: RouteHandler
    middleware: MiddlewareHandler[]
    name?: string
  }> {
    const allRoutes: Array<{
      domainPattern: string
      domainParameters: Record<string, string>
      method: string
      path: string
      handler: RouteHandler
      middleware: MiddlewareHandler[]
      name?: string
    }> = []

    for (const group of this.domainGroups) {
      const routes = group.getRoutes()
      for (const route of routes) {
        allRoutes.push({
          domainPattern: group.pattern.pattern,
          domainParameters: {},
          ...route,
        })
      }
    }

    if (this.wildcardGroup) {
      const routes = this.wildcardGroup.getRoutes()
      for (const route of routes) {
        allRoutes.push({
          domainPattern: this.wildcardGroup.pattern.pattern,
          domainParameters: {},
          ...route,
        })
      }
    }

    return allRoutes
  }
}

/**
 * Domain group builder for fluent API
 */
export class DomainGroupBuilder {
  private group: DomainGroup

  constructor(
    private router: SubdomainRouter,
    private pattern: DomainPattern,
  ) {
    this.group = new DomainGroup(pattern, { domain: pattern.pattern })
  }

  /**
   * Set middleware for domain group
   */
  middleware(middleware: MiddlewareHandler[]): this {
    this.group.config.middleware = middleware
    return this
  }

  /**
   * Set prefix for all routes in group
   */
  prefix(prefix: string): this {
    this.group.config.prefix = prefix
    return this
  }

  /**
   * Set name prefix for routes in group
   */
  name(name: string): this {
    this.group.config.name = name
    return this
  }

  /**
   * Define routes within domain group
   */
  routes(callback: (builder: RouteGroupBuilder) => void): void {
    const routeBuilder = new RouteGroupBuilder(this.group)
    callback(routeBuilder)
    this.router.addDomainGroup(this.group)
  }

  /**
   * Add single route (shorthand)
   */
  get(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[]): void {
    this.group.addRoute('GET', path, handler, middleware)
    this.router.addDomainGroup(this.group)
  }

  post(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[]): void {
    this.group.addRoute('POST', path, handler, middleware)
    this.router.addDomainGroup(this.group)
  }

  put(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[]): void {
    this.group.addRoute('PUT', path, handler, middleware)
    this.router.addDomainGroup(this.group)
  }

  delete(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[]): void {
    this.group.addRoute('DELETE', path, handler, middleware)
    this.router.addDomainGroup(this.group)
  }

  patch(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[]): void {
    this.group.addRoute('PATCH', path, handler, middleware)
    this.router.addDomainGroup(this.group)
  }
}

/**
 * Route group builder for defining routes within domain groups
 */
export class RouteGroupBuilder {
  constructor(private group: DomainGroup) {}

  get(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[], name?: string): void {
    this.group.addRoute('GET', path, handler, middleware, name)
  }

  post(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[], name?: string): void {
    this.group.addRoute('POST', path, handler, middleware, name)
  }

  put(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[], name?: string): void {
    this.group.addRoute('PUT', path, handler, middleware, name)
  }

  delete(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[], name?: string): void {
    this.group.addRoute('DELETE', path, handler, middleware, name)
  }

  patch(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[], name?: string): void {
    this.group.addRoute('PATCH', path, handler, middleware, name)
  }

  options(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[], name?: string): void {
    this.group.addRoute('OPTIONS', path, handler, middleware, name)
  }

  head(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[], name?: string): void {
    this.group.addRoute('HEAD', path, handler, middleware, name)
  }

  any(path: string, handler: RouteHandler, middleware?: MiddlewareHandler[], name?: string): void {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
    for (const method of methods) {
      this.group.addRoute(method, path, handler, middleware, name)
    }
  }
}

/**
 * Create subdomain routing middleware
 */
export function createSubdomainMiddleware(subdomainRouter: SubdomainRouter) {
  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    const url = new URL(req.url)
    const domain = url.hostname

    // Find matching domain group
    const match = subdomainRouter.findDomainGroup(domain)
    if (match) {
      // Add domain parameters to request
      const enhancedReq = req as EnhancedRequest & { domainParams?: Record<string, string> }
      enhancedReq.domainParams = match.parameters

      // Also add to regular params for convenience
      Object.assign(req.params || {}, match.parameters)

      // Add subdomain info
      const subdomainInfo = DomainMatcher.extractSubdomainInfo(domain)
      ;(enhancedReq as any).subdomainInfo = subdomainInfo
    }

    return await next()
  }
}

/**
 * Utility functions for subdomain routing
 */
export const SubdomainUtils = {
  /**
   * Extract subdomain from request
   */
  getSubdomain: (req: EnhancedRequest): string | null => {
    const url = new URL(req.url)
    const info = DomainMatcher.extractSubdomainInfo(url.hostname)
    return info.subdomain || null
  },

  /**
   * Get domain parameters from request
   */
  getDomainParams: (req: EnhancedRequest): Record<string, string> => {
    return (req as any).domainParams || {}
  },

  /**
   * Check if request matches domain pattern
   */
  matchesDomain: (req: EnhancedRequest, pattern: string): boolean => {
    const url = new URL(req.url)
    const domainPattern = DomainMatcher.parseDomainPattern(pattern)
    return DomainMatcher.matchDomain(url.hostname, domainPattern) !== null
  },

  /**
   * Get full subdomain info from request
   */
  getSubdomainInfo: (req: EnhancedRequest): SubdomainRouteInfo | null => {
    return (req as any).subdomainInfo || null
  },
}

/**
 * Factory functions for common subdomain patterns
 */
export const SubdomainPatterns = {
  /**
   * Single subdomain pattern (e.g., api.example.com)
   */
  single: (subdomain: string, domain: string): string => `${subdomain}.${domain}`,

  /**
   * Wildcard subdomain pattern (e.g., {account}.example.com)
   */
  wildcard: (domain: string, paramName: string = 'subdomain'): string => `{${paramName}}.${domain}`,

  /**
   * Multi-level subdomain (e.g., {service}.{env}.example.com)
   */
  multiLevel: (domain: string, ...paramNames: string[]): string => {
    const params = paramNames.map(name => `{${name}}`).join('.')
    return `${params}.${domain}`
  },

  /**
   * API versioning pattern (e.g., v1.api.example.com)
   */
  apiVersion: (domain: string): string => `{version}.api.${domain}`,

  /**
   * Tenant pattern (e.g., {tenant}.app.example.com)
   */
  tenant: (domain: string): string => `{tenant}.app.${domain}`,

  /**
   * Environment pattern (e.g., {env}.example.com)
   */
  environment: (domain: string): string => `{env}.${domain}`,
}
