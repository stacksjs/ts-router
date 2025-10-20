/**
 * Development Tools - TypeScript Utilities
 *
 * TypeScript development utilities, type checking, and code generation
 */

import type { EnhancedRequest } from '../types'

export interface TypeScriptConfig {
  strictMode?: boolean
  generateTypes?: boolean
  validateTypes?: boolean
  outputDir?: string
  includeComments?: boolean
  generateSchemas?: boolean
}

export interface RouteTypeInfo {
  method: string
  pattern: string
  requestType: string
  responseType: string
  paramsType: string
  queryType: string
  bodyType: string
  middlewareTypes: string[]
  handlerSignature: string
}

export interface TypeDefinition {
  name: string
  type: 'interface' | 'type' | 'enum' | 'class'
  definition: string
  imports: string[]
  exports: string[]
  documentation?: string
}

export interface ValidationSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean'
  properties?: Record<string, ValidationSchema>
  items?: ValidationSchema
  required?: string[]
  pattern?: string
  minimum?: number
  maximum?: number
  enum?: any[]
}

/**
 * TypeScript utilities for development
 */
export class TypeScriptUtilities {
  private config: TypeScriptConfig
  private routeTypes = new Map<string, RouteTypeInfo>()
  private typeDefinitions = new Map<string, TypeDefinition>()

  constructor(config: TypeScriptConfig = {}) {
    this.config = {
      strictMode: true,
      generateTypes: true,
      validateTypes: true,
      outputDir: './types',
      includeComments: true,
      generateSchemas: true,
      ...config,
    }
  }

  /**
   * Register route type information
   */
  registerRouteTypes(
    method: string,
    pattern: string,
    options: {
      requestType?: string
      responseType?: string
      paramsType?: string
      queryType?: string
      bodyType?: string
      middlewareTypes?: string[]
      handlerSignature?: string
    } = {},
  ): void {
    const routeKey = `${method.toUpperCase()}:${pattern}`

    const typeInfo: RouteTypeInfo = {
      method: method.toUpperCase(),
      pattern,
      requestType: options.requestType || 'EnhancedRequest',
      responseType: options.responseType || 'Response',
      paramsType: options.paramsType || this.inferParamsType(pattern),
      queryType: options.queryType || 'Record<string, string>',
      bodyType: options.bodyType || 'unknown',
      middlewareTypes: options.middlewareTypes || [],
      handlerSignature: options.handlerSignature || this.generateHandlerSignature(options),
    }

    this.routeTypes.set(routeKey, typeInfo)
  }

  /**
   * Generate TypeScript definitions for all routes
   */
  generateRouteTypes(): string {
    const routes = Array.from(this.routeTypes.values())
    let output = ''

    // Add imports
    output += this.generateImports()
    output += '\n\n'

    // Generate parameter types
    output += this.generateParamTypes(routes)
    output += '\n\n'

    // Generate handler types
    output += this.generateHandlerTypes(routes)
    output += '\n\n'

    // Generate route registry type
    output += this.generateRouteRegistryType(routes)
    output += '\n\n'

    // Generate utility types
    output += this.generateUtilityTypes()

    return output
  }

  /**
   * Generate validation schemas from TypeScript types
   */
  generateValidationSchemas(): Record<string, ValidationSchema> {
    const schemas: Record<string, ValidationSchema> = {}

    this.routeTypes.forEach((typeInfo, routeKey) => {
      // Generate schema for request body
      if (typeInfo.bodyType && typeInfo.bodyType !== 'unknown') {
        schemas[`${routeKey}_body`] = this.typeToSchema(typeInfo.bodyType)
      }

      // Generate schema for query parameters
      if (typeInfo.queryType && typeInfo.queryType !== 'Record<string, string>') {
        schemas[`${routeKey}_query`] = this.typeToSchema(typeInfo.queryType)
      }

      // Generate schema for route parameters
      if (typeInfo.paramsType && typeInfo.paramsType !== 'Record<string, string>') {
        schemas[`${routeKey}_params`] = this.typeToSchema(typeInfo.paramsType)
      }
    })

    return schemas
  }

  /**
   * Generate OpenAPI schema from route types
   */
  generateOpenAPISchema(): any {
    const routes = Array.from(this.routeTypes.values())
    const openapi = {
      openapi: '3.0.0',
      info: {
        title: 'API Documentation',
        version: '1.0.0',
      },
      paths: {} as Record<string, any>,
      components: {
        schemas: {} as Record<string, any>,
      },
    }

    routes.forEach((route) => {
      const path = route.pattern.replace(/\{([^}:]+)(?::[^}]+)?\}/g, '{$1}')
      const method = route.method.toLowerCase()

      if (!openapi.paths[path]) {
        openapi.paths[path] = {}
      }

      const operation: any = {
        summary: `${route.method} ${route.pattern}`,
        operationId: `${method}${this.pathToOperationId(path)}`,
        responses: {
          200: {
            description: 'Success',
            content: {
              'application/json': {
                schema: this.typeToOpenAPISchema(route.responseType),
              },
            },
          },
        },
      }

      // Add parameters
      const params = this.extractPathParameters(route.pattern)
      if (params.length > 0) {
        operation.parameters = params.map(param => ({
          name: param.name,
          in: 'path',
          required: true,
          schema: { type: param.type === 'number' ? 'integer' : 'string' },
        }))
      }

      // Add request body for POST/PUT/PATCH
      if (['post', 'put', 'patch'].includes(method) && route.bodyType !== 'unknown') {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: this.typeToOpenAPISchema(route.bodyType),
            },
          },
        }
      }

      openapi.paths[path][method] = operation
    })

    return openapi
  }

  /**
   * Validate request against TypeScript types
   */
  validateRequest(req: EnhancedRequest, routeKey: string): {
    valid: boolean
    errors: string[]
    warnings: string[]
  } {
    const typeInfo = this.routeTypes.get(routeKey)
    if (!typeInfo) {
      return { valid: false, errors: ['Route type information not found'], warnings: [] }
    }

    const errors: string[] = []
    const warnings: string[] = []

    // Validate parameters
    if (typeInfo.paramsType !== 'Record<string, string>') {
      const paramErrors = this.validateParams(req, typeInfo.paramsType)
      errors.push(...paramErrors)
    }

    // Validate query parameters
    if (typeInfo.queryType !== 'Record<string, string>') {
      const queryErrors = this.validateQuery(req, typeInfo.queryType)
      errors.push(...queryErrors)
    }

    // Validate request body
    if (typeInfo.bodyType !== 'unknown' && req.body) {
      const bodyErrors = this.validateBody(req, typeInfo.bodyType)
      errors.push(...bodyErrors)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Generate type-safe route builder
   */
  generateRouteBuilder(): string {
    const routes = Array.from(this.routeTypes.values())

    let output = `/**
 * Type-safe route builder
 * Generated automatically from route definitions
 */

import type { EnhancedRequest } from '../types'

export class TypeSafeRouteBuilder {
`

    routes.forEach((route) => {
      const methodName = `${route.method.toLowerCase()}${this.pathToMethodName(route.pattern)}`

      output += `  /**
   * ${route.method} ${route.pattern}
   */
  ${methodName}(
    handler: (req: ${route.requestType} & { params: ${route.paramsType} }) => Promise<${route.responseType}>
  ): void {
    // Implementation would register the route with proper typing
  }

`
    })

    output += '}\n'
    return output
  }

  /**
   * Generate middleware type definitions
   */
  generateMiddlewareTypes(): string {
    const middlewareTypes = new Set<string>()

    this.routeTypes.forEach((route) => {
      route.middlewareTypes.forEach(type => middlewareTypes.add(type))
    })

    let output = `/**
 * Middleware type definitions
 */

export type MiddlewareFunction<T = any> = (
  req: EnhancedRequest,
  next: () => Promise<Response>
) => Promise<Response>

export type MiddlewareWithConfig<T> = (config: T) => MiddlewareFunction

`

    middlewareTypes.forEach((type) => {
      output += `export type ${type}Middleware = MiddlewareFunction\n`
    })

    return output
  }

  /**
   * Get route type information
   */
  getRouteTypes(): RouteTypeInfo[] {
    return Array.from(this.routeTypes.values())
  }

  /**
   * Get type definition
   */
  getTypeDefinition(name: string): TypeDefinition | undefined {
    return this.typeDefinitions.get(name)
  }

  /**
   * Register custom type definition
   */
  registerTypeDefinition(definition: TypeDefinition): void {
    this.typeDefinitions.set(definition.name, definition)
  }

  /**
   * Clear all type information
   */
  clear(): void {
    this.routeTypes.clear()
    this.typeDefinitions.clear()
  }

  /**
   * Infer parameter types from route pattern
   */
  private inferParamsType(pattern: string): string {
    const params = this.extractPathParameters(pattern)

    if (params.length === 0) {
      return 'Record<string, never>'
    }

    const properties = params.map((param) => {
      const type = param.type === 'number' ? 'number' : 'string'
      return `  ${param.name}: ${type}`
    }).join('\n')

    return `{\n${properties}\n}`
  }

  /**
   * Extract path parameters from pattern
   */
  private extractPathParameters(pattern: string): Array<{ name: string, type: string, optional: boolean }> {
    const params: Array<{ name: string, type: string, optional: boolean }> = []
    const paramRegex = /\{([^}]+)\}/g

    for (const match of pattern.matchAll(paramRegex)) {
      const paramDef = match[1]
      const [name, constraint] = paramDef.split(':')

      params.push({
        name: name.trim(),
        type: this.inferParamType(constraint),
        optional: paramDef.includes('?'),
      })
    }

    return params
  }

  /**
   * Infer parameter type from constraint
   */
  private inferParamType(constraint?: string): string {
    if (!constraint)
      return 'string'

    if (constraint.includes('number') || constraint.includes('int'))
      return 'number'
    if (constraint.includes('uuid'))
      return 'string'
    if (constraint.includes('slug'))
      return 'string'

    return 'string'
  }

  /**
   * Generate handler signature
   */
  private generateHandlerSignature(options: any): string {
    const requestType = options.requestType || 'EnhancedRequest'
    const responseType = options.responseType || 'Response'
    const paramsType = options.paramsType || 'Record<string, string>'

    return `(req: ${requestType} & { params: ${paramsType} }) => Promise<${responseType}>`
  }

  /**
   * Generate imports section
   */
  private generateImports(): string {
    return `import type { EnhancedRequest } from '../types'

// Generated route types`
  }

  /**
   * Generate parameter types
   */
  private generateParamTypes(routes: RouteTypeInfo[]): string {
    const paramTypes = new Set<string>()

    routes.forEach((route) => {
      if (route.paramsType !== 'Record<string, string>' && !route.paramsType.startsWith('{')) {
        paramTypes.add(route.paramsType)
      }
    })

    let output = '// Route parameter types\n'

    routes.forEach((route) => {
      if (route.paramsType.startsWith('{')) {
        const typeName = `${route.method}${this.pathToTypeName(route.pattern)}Params`
        output += `export interface ${typeName} ${route.paramsType}\n\n`
      }
    })

    return output
  }

  /**
   * Generate handler types
   */
  private generateHandlerTypes(routes: RouteTypeInfo[]): string {
    let output = '// Route handler types\n'

    routes.forEach((route) => {
      const handlerName = `${route.method}${this.pathToTypeName(route.pattern)}Handler`
      output += `export type ${handlerName} = ${route.handlerSignature}\n\n`
    })

    return output
  }

  /**
   * Generate route registry type
   */
  private generateRouteRegistryType(routes: RouteTypeInfo[]): string {
    let output = '// Route registry type\nexport interface RouteRegistry {\n'

    routes.forEach((route) => {
      const key = `'${route.method} ${route.pattern}'`
      const handlerType = `${route.method}${this.pathToTypeName(route.pattern)}Handler`
      output += `  ${key}: ${handlerType}\n`
    })

    output += '}\n'
    return output
  }

  /**
   * Generate utility types
   */
  private generateUtilityTypes(): string {
    return `// Utility types
export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

export type RoutePattern = keyof RouteRegistry

export type HandlerForRoute<T extends RoutePattern> = RouteRegistry[T]

export type ExtractParams<T extends string> =
  T extends \`\${string}{\${infer Param}}\${infer Rest}\`
    ? { [K in Param]: string } & ExtractParams<Rest>
    : {}

export type TypedRequest<T extends RoutePattern> = EnhancedRequest & {
  params: ExtractParams<T>
}
`
  }

  /**
   * Convert path to type name
   */
  private pathToTypeName(path: string): string {
    return path
      .replace(/[{}]/g, '')
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  }

  /**
   * Convert path to method name
   */
  private pathToMethodName(path: string): string {
    const typeName = this.pathToTypeName(path)
    return typeName.charAt(0).toLowerCase() + typeName.slice(1)
  }

  /**
   * Convert path to operation ID
   */
  private pathToOperationId(path: string): string {
    return this.pathToTypeName(path)
  }

  /**
   * Convert TypeScript type to validation schema
   */
  private typeToSchema(type: string): ValidationSchema {
    // Simplified type to schema conversion
    if (type.includes('string')) {
      return { type: 'string' }
    }
    else if (type.includes('number')) {
      return { type: 'number' }
    }
    else if (type.includes('boolean')) {
      return { type: 'boolean' }
    }
    else if (type.includes('[]')) {
      return { type: 'array', items: { type: 'string' } }
    }
    else {
      return { type: 'object' }
    }
  }

  /**
   * Convert TypeScript type to OpenAPI schema
   */
  private typeToOpenAPISchema(type: string): any {
    if (type.includes('string')) {
      return { type: 'string' }
    }
    else if (type.includes('number')) {
      return { type: 'number' }
    }
    else if (type.includes('boolean')) {
      return { type: 'boolean' }
    }
    else if (type.includes('[]')) {
      return { type: 'array', items: { type: 'string' } }
    }
    else {
      return { type: 'object' }
    }
  }

  /**
   * Validate request parameters
   */
  private validateParams(_req: EnhancedRequest, _expectedType: string): string[] {
    // Simplified validation - in a real implementation, this would use a proper type checker
    return []
  }

  /**
   * Validate query parameters
   */
  private validateQuery(_req: EnhancedRequest, _expectedType: string): string[] {
    // Simplified validation
    return []
  }

  /**
   * Validate request body
   */
  private validateBody(_req: EnhancedRequest, _expectedType: string): string[] {
    // Simplified validation
    return []
  }
}

/**
 * Global TypeScript utilities instance
 */
let globalTsUtils: TypeScriptUtilities | null = null

/**
 * Initialize global TypeScript utilities
 */
export function initializeTypeScriptUtilities(config?: TypeScriptConfig): TypeScriptUtilities {
  globalTsUtils = new TypeScriptUtilities(config)
  return globalTsUtils
}

/**
 * Get global TypeScript utilities
 */
export function getTypeScriptUtilities(): TypeScriptUtilities | null {
  return globalTsUtils
}

/**
 * TypeScript development helpers
 */
export const TypeScriptHelpers = {
  /**
   * Generate types for current routes
   */
  generateTypes: (): string => {
    const tsUtils = getTypeScriptUtilities()
    if (!tsUtils) {
      throw new Error('TypeScript utilities not initialized')
    }
    return tsUtils.generateRouteTypes()
  },

  /**
   * Generate validation schemas
   */
  generateSchemas: (): Record<string, ValidationSchema> => {
    const tsUtils = getTypeScriptUtilities()
    if (!tsUtils) {
      throw new Error('TypeScript utilities not initialized')
    }
    return tsUtils.generateValidationSchemas()
  },

  /**
   * Generate OpenAPI documentation
   */
  generateOpenAPI: (): any => {
    const tsUtils = getTypeScriptUtilities()
    if (!tsUtils) {
      throw new Error('TypeScript utilities not initialized')
    }
    return tsUtils.generateOpenAPISchema()
  },

  /**
   * Validate request types
   */
  validateRequest: (req: EnhancedRequest, routeKey: string): { valid: boolean, errors: string[], warnings: string[] } => {
    const tsUtils = getTypeScriptUtilities()
    if (!tsUtils) {
      return { valid: true, errors: [], warnings: ['TypeScript utilities not initialized'] }
    }
    return tsUtils.validateRequest(req, routeKey)
  },
}
