/**
 * Enhanced Router Error Messages
 *
 * Provides detailed, actionable error messages for common router issues
 * including route conflicts, circular dependencies, and configuration errors.
 */

import type { ErrorContext } from './exceptions'
import { RouterException } from './exceptions'

/**
 * Route conflict error with detailed information about conflicting routes
 */
export class RouteConflictException extends RouterException {
  public readonly conflictingRoutes: RouteConflictInfo[]
  public readonly suggestion: string

  constructor(
    conflictingRoutes: RouteConflictInfo[],
    context?: ErrorContext,
  ) {
    const message = RouteConflictException.buildMessage(conflictingRoutes)
    const suggestion = RouteConflictException.buildSuggestion(conflictingRoutes)

    super({
      code: 'ROUTE_CONFLICT',
      message,
      statusCode: 500,
      context,
      retryable: false,
      severity: 'critical',
      category: 'system',
    })

    this.conflictingRoutes = conflictingRoutes
    this.suggestion = suggestion
  }

  private static buildMessage(routes: RouteConflictInfo[]): string {
    const lines = [
      'Route conflict detected! Multiple routes match the same path pattern.',
      '',
      'Conflicting routes:',
    ]

    for (const route of routes) {
      lines.push(`  • ${route.method} ${route.path}`)
      if (route.name) {
        lines.push(`    Name: "${route.name}"`)
      }
      if (route.definedAt) {
        lines.push(`    Defined at: ${route.definedAt}`)
      }
    }

    return lines.join('\n')
  }

  private static buildSuggestion(routes: RouteConflictInfo[]): string {
    const suggestions: string[] = []

    // Check for static vs dynamic conflict
    const hasStatic = routes.some(r => !r.path.includes('{'))
    const hasDynamic = routes.some(r => r.path.includes('{'))

    if (hasStatic && hasDynamic) {
      suggestions.push(
        '• Static routes should be defined before dynamic routes',
        '• Consider using route constraints (whereNumber, whereUuid) to differentiate',
      )
    }

    // Check for similar dynamic patterns
    const dynamicRoutes = routes.filter(r => r.path.includes('{'))
    if (dynamicRoutes.length > 1) {
      suggestions.push(
        '• Use different parameter names or add constraints:',
        '  router.get("/users/{id}").whereNumber("id")',
        '  router.get("/users/{slug}").whereAlpha("slug")',
      )
    }

    // Check for wildcard conflicts
    const hasWildcard = routes.some(r => r.path.includes('*'))
    if (hasWildcard) {
      suggestions.push(
        '• Wildcard routes should be defined last',
        '• Consider using more specific path prefixes',
      )
    }

    if (suggestions.length === 0) {
      suggestions.push(
        '• Rename one of the conflicting routes',
        '• Use route groups with different prefixes',
        '• Add parameter constraints to differentiate routes',
      )
    }

    return `How to fix:\n${suggestions.join('\n')}`
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      conflictingRoutes: this.conflictingRoutes,
      suggestion: this.suggestion,
    }
  }
}

export interface RouteConflictInfo {
  method: string
  path: string
  name?: string
  definedAt?: string
  pattern?: string
}

/**
 * Circular dependency error with dependency chain visualization
 */
export class CircularDependencyException extends RouterException {
  public readonly dependencyChain: string[]
  public readonly suggestion: string

  constructor(
    dependencyChain: string[],
    context?: ErrorContext,
  ) {
    const message = CircularDependencyException.buildMessage(dependencyChain)
    const suggestion = CircularDependencyException.buildSuggestion(dependencyChain)

    super({
      code: 'CIRCULAR_DEPENDENCY',
      message,
      statusCode: 500,
      context,
      retryable: false,
      severity: 'critical',
      category: 'system',
    })

    this.dependencyChain = dependencyChain
    this.suggestion = suggestion
  }

  private static buildMessage(chain: string[]): string {
    const lines = [
      'Circular dependency detected in the dependency injection container!',
      '',
      'Dependency chain:',
      '',
    ]

    // Build visual representation
    for (let i = 0; i < chain.length; i++) {
      const isLast = i === chain.length - 1
      const prefix = i === 0 ? '┌─►' : isLast ? '└─►' : '├─►'
      lines.push(`  ${prefix} ${chain[i]}`)

      if (!isLast) {
        lines.push('  │')
      }
    }

    // Show the cycle
    lines.push('  │')
    lines.push(`  └── cycles back to: ${chain[0]}`)

    return lines.join('\n')
  }

  private static buildSuggestion(chain: string[]): string {
    return `How to fix:

1. Break the cycle by introducing an interface:
   • Create an interface for one of the dependencies
   • Use lazy injection: container.bind('${chain[0]}').lazy()

2. Restructure your dependencies:
   • Extract shared logic into a separate service
   • Use events/callbacks instead of direct dependencies

3. Use setter injection instead of constructor injection:
   • Remove the dependency from the constructor
   • Set it after instantiation using a setter method

4. Check if the dependency is actually needed:
   • Sometimes circular dependencies indicate a design issue
   • Consider if the classes have too many responsibilities

Dependency chain involved:
${chain.map((dep, i) => `  ${i + 1}. ${dep}`).join('\n')}`
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      dependencyChain: this.dependencyChain,
      suggestion: this.suggestion,
    }
  }
}

/**
 * Middleware configuration error
 */
export class MiddlewareConfigurationException extends RouterException {
  public readonly middlewareName: string
  public readonly configErrors: string[]
  public readonly suggestion: string

  constructor(
    middlewareName: string,
    configErrors: string[],
    context?: ErrorContext,
  ) {
    const message = `Middleware "${middlewareName}" configuration error:\n${configErrors.map(e => `  • ${e}`).join('\n')}`

    super({
      code: 'MIDDLEWARE_CONFIGURATION_ERROR',
      message,
      statusCode: 500,
      context,
      retryable: false,
      severity: 'high',
      category: 'system',
    })

    this.middlewareName = middlewareName
    this.configErrors = configErrors
    this.suggestion = this.buildSuggestion()
  }

  private buildSuggestion(): string {
    return `How to fix:
• Check the middleware documentation for required options
• Ensure all required configuration values are provided
• Verify configuration value types match expected types

Example configuration:
  router.use(new ${this.middlewareName}({
    // Add required options here
  }))`
  }
}

/**
 * Route not found error with helpful suggestions
 */
export class RouteNotFoundException extends RouterException {
  public readonly requestedPath: string
  public readonly requestedMethod: string
  public readonly similarRoutes: SimilarRoute[]
  public readonly suggestion: string

  constructor(
    requestedMethod: string,
    requestedPath: string,
    similarRoutes: SimilarRoute[] = [],
    context?: ErrorContext,
  ) {
    const message = RouteNotFoundException.buildMessage(requestedMethod, requestedPath, similarRoutes)

    super({
      code: 'ROUTE_NOT_FOUND',
      message,
      statusCode: 404,
      context,
      retryable: false,
      severity: 'low',
      category: 'business',
    })

    this.requestedPath = requestedPath
    this.requestedMethod = requestedMethod
    this.similarRoutes = similarRoutes
    this.suggestion = this.buildSuggestion()
  }

  private static buildMessage(method: string, path: string, similarRoutes: SimilarRoute[]): string {
    const lines = [
      `Route not found: ${method} ${path}`,
    ]

    if (similarRoutes.length > 0) {
      lines.push('')
      lines.push('Did you mean one of these routes?')
      for (const route of similarRoutes.slice(0, 5)) {
        lines.push(`  • ${route.method} ${route.path}`)
        if (route.similarity) {
          lines.push(`    (${Math.round(route.similarity * 100)}% match)`)
        }
      }
    }

    return lines.join('\n')
  }

  private buildSuggestion(): string {
    const suggestions = [
      `• Verify the HTTP method is correct (you used ${this.requestedMethod})`,
      '• Check for typos in the URL path',
      '• Ensure the route is registered before the server starts',
      '• Check if the route requires specific middleware (e.g., auth)',
    ]

    if (this.requestedPath.includes('//')) {
      suggestions.push('• Remove duplicate slashes from the URL')
    }

    if (!this.requestedPath.startsWith('/')) {
      suggestions.push('• Ensure the path starts with a forward slash (/)')
    }

    return `How to fix:\n${suggestions.join('\n')}`
  }
}

export interface SimilarRoute {
  method: string
  path: string
  similarity?: number
}

/**
 * Handler resolution error
 */
export class HandlerResolutionException extends RouterException {
  public readonly handlerRef: string
  public readonly suggestion: string

  constructor(
    handlerRef: string,
    reason: string,
    context?: ErrorContext,
  ) {
    const message = `Failed to resolve handler "${handlerRef}": ${reason}`

    super({
      code: 'HANDLER_RESOLUTION_ERROR',
      message,
      statusCode: 500,
      context,
      retryable: false,
      severity: 'high',
      category: 'system',
    })

    this.handlerRef = handlerRef
    this.suggestion = this.buildSuggestion(handlerRef)
  }

  private buildSuggestion(handlerRef: string): string {
    const isControllerMethod = handlerRef.includes('@')
    const isActionPath = handlerRef.includes('/')

    if (isControllerMethod) {
      const [controller, method] = handlerRef.split('@')
      return `How to fix:
• Ensure the controller "${controller}" is registered in the container
• Verify the method "${method}" exists and is public
• Check the controller file is imported

Example:
  // Register the controller
  container.singleton('${controller}', ${controller})

  // Define the route
  router.get('/path', '${handlerRef}')`
    }

    if (isActionPath) {
      return `How to fix:
• Ensure the action class exists at the specified path
• Verify the action has a "handle" method
• Check the action file is properly exported

Example:
  // Action class at ${handlerRef}.ts
  export default class ${handlerRef.split('/').pop()} {
    handle(req: Request): Response {
      return new Response('OK')
    }
  }`
    }

    return `How to fix:
• Verify the handler reference is correct
• Ensure the handler function/class is exported
• Check for circular dependencies in the handler module`
  }
}

/**
 * Model binding error
 */
export class ModelBindingException extends RouterException {
  public readonly modelName: string
  public readonly paramName: string
  public readonly paramValue: string
  public readonly suggestion: string

  constructor(
    modelName: string,
    paramName: string,
    paramValue: string,
    reason: string,
    context?: ErrorContext,
  ) {
    const message = `Failed to bind model "${modelName}" for parameter "${paramName}" with value "${paramValue}": ${reason}`

    super({
      code: 'MODEL_BINDING_ERROR',
      message,
      statusCode: 404,
      context,
      retryable: false,
      severity: 'low',
      category: 'business',
    })

    this.modelName = modelName
    this.paramName = paramName
    this.paramValue = paramValue
    this.suggestion = this.buildSuggestion()
  }

  private buildSuggestion(): string {
    return `How to fix:
• Verify the ${this.paramName} "${this.paramValue}" exists in your data source
• Check if the model resolver is correctly configured
• Ensure the route parameter matches the model's identifier field

Example model binding:
  router.model('${this.paramName}', async (value) => {
    const ${this.modelName.toLowerCase()} = await db.${this.modelName.toLowerCase()}s.findUnique({
      where: { id: value }
    })
    if (!${this.modelName.toLowerCase()}) {
      throw new Error('${this.modelName} not found')
    }
    return ${this.modelName.toLowerCase()}
  })`
  }
}

/**
 * Utility to find similar routes using Levenshtein distance
 */
export function findSimilarRoutes(
  requestedPath: string,
  availableRoutes: Array<{ method: string, path: string }>,
  maxResults: number = 5,
): SimilarRoute[] {
  const results: SimilarRoute[] = []

  for (const route of availableRoutes) {
    const similarity = calculateSimilarity(requestedPath, route.path)
    if (similarity > 0.3) { // Only include routes with >30% similarity
      results.push({
        method: route.method,
        path: route.path,
        similarity,
      })
    }
  }

  return results
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, maxResults)
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length

  if (len1 === 0)
    return len2 === 0 ? 1 : 0
  if (len2 === 0)
    return 0

  const matrix: number[][] = []

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }

  const distance = matrix[len1][len2]
  const maxLen = Math.max(len1, len2)

  return 1 - distance / maxLen
}

/**
 * Detect route conflicts in a list of routes
 */
export function detectRouteConflicts(
  routes: Array<{ method: string, path: string, name?: string }>,
): RouteConflictInfo[][] {
  const conflicts: RouteConflictInfo[][] = []
  const checked = new Set<string>()

  for (let i = 0; i < routes.length; i++) {
    const route1 = routes[i]
    const key1 = `${route1.method}:${route1.path}`

    if (checked.has(key1))
      continue

    const conflicting: RouteConflictInfo[] = []

    for (let j = i + 1; j < routes.length; j++) {
      const route2 = routes[j]

      if (route1.method === route2.method && routesConflict(route1.path, route2.path)) {
        if (conflicting.length === 0) {
          conflicting.push({
            method: route1.method,
            path: route1.path,
            name: route1.name,
          })
        }

        conflicting.push({
          method: route2.method,
          path: route2.path,
          name: route2.name,
        })

        checked.add(`${route2.method}:${route2.path}`)
      }
    }

    if (conflicting.length > 0) {
      conflicts.push(conflicting)
    }

    checked.add(key1)
  }

  return conflicts
}

/**
 * Check if two route paths conflict
 */
function routesConflict(path1: string, path2: string): boolean {
  // Exact match
  if (path1 === path2)
    return true

  const segments1 = path1.split('/').filter(Boolean)
  const segments2 = path2.split('/').filter(Boolean)

  // Different segment counts - check for wildcards
  if (segments1.length !== segments2.length) {
    const hasWildcard1 = path1.includes('*')
    const hasWildcard2 = path2.includes('*')

    if (!hasWildcard1 && !hasWildcard2)
      return false
  }

  // Compare segments
  const maxLen = Math.max(segments1.length, segments2.length)

  for (let i = 0; i < maxLen; i++) {
    const seg1 = segments1[i] || ''
    const seg2 = segments2[i] || ''

    // Wildcard matches anything
    if (seg1 === '*' || seg2 === '*')
      return true

    // Both static segments
    const isDynamic1 = seg1.startsWith('{') && seg1.endsWith('}')
    const isDynamic2 = seg2.startsWith('{') && seg2.endsWith('}')

    if (!isDynamic1 && !isDynamic2) {
      if (seg1 !== seg2)
        return false
    }

    // One static, one dynamic - could conflict
    // Both dynamic - could conflict
  }

  return true
}

/**
 * Factory for creating router-specific errors
 */
export const RouterErrorFactory = {
  routeConflict: (routes: RouteConflictInfo[], context?: ErrorContext): RouteConflictException =>
    new RouteConflictException(routes, context),

  circularDependency: (chain: string[], context?: ErrorContext): CircularDependencyException =>
    new CircularDependencyException(chain, context),

  middlewareConfig: (name: string, errors: string[], context?: ErrorContext): MiddlewareConfigurationException =>
    new MiddlewareConfigurationException(name, errors, context),

  routeNotFound: (method: string, path: string, similarRoutes?: SimilarRoute[], context?: ErrorContext): RouteNotFoundException =>
    new RouteNotFoundException(method, path, similarRoutes, context),

  handlerResolution: (ref: string, reason: string, context?: ErrorContext): HandlerResolutionException =>
    new HandlerResolutionException(ref, reason, context),

  modelBinding: (model: string, param: string, value: string, reason: string, context?: ErrorContext): ModelBindingException =>
    new ModelBindingException(model, param, value, reason, context),
}
