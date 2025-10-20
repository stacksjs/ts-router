import fs from 'node:fs/promises'
import process from 'node:process'
import { chalk } from './colors'

/**
 * Options for the openapi command
 */
export interface OpenAPIOptions {
  output?: string
  title?: string
  version?: string
  description?: string
  basePath?: string
  servers?: string
  tags?: boolean
  security?: boolean
}

/**
 * Generate OpenAPI specification for API routes
 */
export async function generateOpenAPISpec(options: OpenAPIOptions): Promise<void> {
  try {
    // Try to load router instance from the application
    const routesFile = `${process.cwd()}/routes/index.ts`
    const { router } = await import(routesFile)

    if (!router) {
      console.error(chalk.red(`Could not find router instance in ${routesFile}.`))
      process.exit(1)
    }

    // Get routes from router
    const routes = (router as any).routes || []

    if (routes.length === 0) {
      console.log(chalk.yellow('No routes defined. Creating empty OpenAPI specification.'))
    }

    // Filter API routes - typically these start with /api or have type 'api'
    const apiRoutes = routes.filter((route: any) => {
      return route.type === 'api' || route.path.startsWith('/api')
    })

    // Define base structure for OpenAPI spec
    const openapi: any = {
      openapi: '3.0.3',
      info: {
        title: options.title || 'API Documentation',
        version: options.version || '1.0.0',
        description: options.description || 'Generated API documentation',
      },
      servers: generateServers(options),
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {},
      },
      tags: [],
    }

    // Collect unique tags if enabled
    const uniqueTags = new Set<string>()

    // Process routes and add them to the paths
    for (const route of apiRoutes) {
      const pathItem: any = openapi.paths[route.path] || {}

      // Extract tag from route path or route metadata
      let tag = ''
      if (options.tags !== false) {
        tag = route.tag || extractTagFromPath(route.path)
        uniqueTags.add(tag)
      }

      // Convert route to OpenAPI operation
      const operation: any = {
        summary: route.summary || `${route.method.toUpperCase()} ${route.path}`,
        description: route.description || '',
        operationId: route.name || generateOperationId(route.method, route.path),
        parameters: generateParameters(route),
        responses: generateResponses(route),
      }

      // Add tag if available
      if (tag) {
        operation.tags = [tag]
      }

      // Add request body for applicable methods
      if (['post', 'put', 'patch'].includes(route.method.toLowerCase())) {
        operation.requestBody = generateRequestBody(route)
      }

      // Add security if enabled and available in route
      if (options.security !== false && route.middleware) {
        const securityItems = extractSecurityFromMiddleware(route.middleware)
        if (securityItems.length > 0) {
          operation.security = securityItems
        }
      }

      // Add operation to path
      pathItem[route.method.toLowerCase()] = operation
      openapi.paths[route.path] = pathItem
    }

    // Add tags to OpenAPI spec if enabled
    if (options.tags !== false) {
      openapi.tags = Array.from(uniqueTags).map(tag => ({
        name: tag,
        description: `Operations related to ${tag}`,
      }))
    }

    // Write the OpenAPI spec to the output file
    const outputPath = options.output || 'openapi.json'
    await fs.writeFile(outputPath, JSON.stringify(openapi, null, 2))
    console.log(chalk.green(`✨ OpenAPI specification generated at ${outputPath}`))
    console.log(chalk.blue(`Import this file into Postman, Swagger UI, or other API tools to explore your API.`))
  }
  catch (error: any) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(chalk.red(`Routes file not found at ${process.cwd()}/routes/index.ts`))
      console.error(chalk.yellow('Make sure your routes are defined and exported as "router" in routes/index.ts'))
    }
    else {
      console.error(chalk.red(`Error generating OpenAPI specification: ${error.message}`))
    }
    throw error
  }
}

/**
 * Generate server objects for OpenAPI spec
 */
function generateServers(options: OpenAPIOptions): any[] {
  const servers = []

  // Add servers from options
  if (options.servers) {
    const serverUrls = options.servers.split(',').map((url: string) => url.trim())
    for (const url of serverUrls) {
      servers.push({
        url,
        description: `Server ${servers.length + 1}`,
      })
    }
  }

  // If no servers provided, add default
  if (servers.length === 0) {
    servers.push({
      url: options.basePath || '/',
      description: 'Default server',
    })
  }

  return servers
}

/**
 * Extract tag from route path
 */
function extractTagFromPath(path: string): string {
  // Extract first meaningful segment from path
  const segments = path.split('/').filter(Boolean)
  if (segments.length > 0) {
    // If first segment is 'api', use second segment
    if (segments[0].toLowerCase() === 'api' && segments.length > 1) {
      return segments[1]
    }
    return segments[0]
  }
  return 'default'
}

/**
 * Generate a camelCase operation ID from method and path
 */
function generateOperationId(method: string, path: string): string {
  const pathWithoutParams = path.replace(/\{([^}]+)\}/g, '_$1')
  const segments = pathWithoutParams.split('/').filter(Boolean)

  if (segments.length === 0) {
    return method.toLowerCase()
  }

  let operationId = method.toLowerCase()

  for (const segment of segments) {
    operationId += segment.charAt(0).toUpperCase() + segment.slice(1)
  }

  return operationId
}

/**
 * Generate OpenAPI parameters from route path
 */
function generateParameters(route: any): any[] {
  const parameters = []

  // Path parameters
  const pathParams = route.path.match(/\{([^}]+)\}/g)
  if (pathParams) {
    for (const param of pathParams) {
      const paramName = param.slice(1, -1)
      parameters.push({
        name: paramName,
        in: 'path',
        required: true,
        schema: {
          type: 'string',
        },
        description: `Path parameter: ${paramName}`,
      })
    }
  }

  // Add query parameters if defined in the route
  if (route.params && route.params.query) {
    for (const [name, schema] of Object.entries(route.params.query)) {
      parameters.push({
        name,
        in: 'query',
        schema: mapSchemaType(schema as any),
        required: (schema as any).required === true,
        description: (schema as any).description || `Query parameter: ${name}`,
      })
    }
  }

  return parameters
}

/**
 * Map schema type to OpenAPI schema
 */
function mapSchemaType(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return { type: 'string' }
  }

  const openApiSchema: any = {}

  if (schema.type) {
    openApiSchema.type = schema.type
  }

  if (schema.format) {
    openApiSchema.format = schema.format
  }

  if (schema.enum) {
    openApiSchema.enum = schema.enum
  }

  if (schema.default !== undefined) {
    openApiSchema.default = schema.default
  }

  return openApiSchema
}

/**
 * Generate responses object for OpenAPI
 */
function generateResponses(route: any): any {
  const responses: any = {
    200: {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: {},
        },
      },
    },
  }

  // Add common error responses
  responses['400'] = {
    description: 'Bad request',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }

  responses['401'] = {
    description: 'Unauthorized',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }

  responses['404'] = {
    description: 'Not found',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }

  responses['500'] = {
    description: 'Server error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }

  // Add custom responses from route if available
  if (route.responses) {
    for (const [status, response] of Object.entries(route.responses)) {
      responses[status] = {
        description: (response as any).description || `Response with status ${status}`,
        content: {
          'application/json': {
            schema: (response as any).schema || {},
          },
        },
      }
    }
  }

  return responses
}

/**
 * Generate request body object for OpenAPI
 */
function generateRequestBody(route: any): any {
  // Default empty request body
  const requestBody: any = {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
        },
      },
    },
  }

  // Add schema from route if available
  if (route.params && route.params.body) {
    requestBody.content['application/json'].schema = route.params.body
  }

  return requestBody
}

/**
 * Extract security requirements from middleware
 */
function extractSecurityFromMiddleware(middleware: any[]): any[] {
  const securityItems = []

  // Check for common auth middleware like jwt, oauth, apiKey, etc.
  for (const mw of middleware) {
    const name = typeof mw === 'string' ? mw : mw.name

    if (name && name.toLowerCase().includes('auth')) {
      // Add security scheme based on middleware type
      if (name.toLowerCase().includes('jwt')) {
        securityItems.push({ BearerAuth: [] })
      }
      else if (name.toLowerCase().includes('apikey')) {
        securityItems.push({ ApiKeyAuth: [] })
      }
      else if (name.toLowerCase().includes('basic')) {
        securityItems.push({ BasicAuth: [] })
      }
      else {
        securityItems.push({ [name]: [] })
      }
    }
  }

  return securityItems
}
