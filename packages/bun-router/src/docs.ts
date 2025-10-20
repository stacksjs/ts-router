import { join } from 'node:path'
import process from 'node:process'

interface DocsOptions {
  verbose?: boolean
  output?: string
  groupBy?: 'path' | 'method' | 'tag'
  includeExamples?: boolean
}

interface RouteDoc {
  path: string
  method: string
  description?: string
  params?: { [key: string]: string }
  query?: { [key: string]: string }
  body?: { [key: string]: string }
  responses?: { [key: string]: string }
  middleware?: string[]
  tags?: string[]
  examples?: {
    request?: string
    response?: string
  }[]
  deprecated?: boolean
  security?: string[]
}

/**
 * Extracts route parameters from a path
 * @example "/users/{id}" -> { id: "string" }
 */
function extractRouteParams(path: string): { [key: string]: string } {
  const params: { [key: string]: string } = {}
  const matches = path.match(/\{([^}]+)\}/g)

  if (matches) {
    matches.forEach((match) => {
      const param = match.slice(1, -1)
      // Check for type annotations in the parameter name
      const [name, type] = param.split(':')
      params[name] = type || 'string'
    })
  }

  return params
}

/**
 * Attempts to load JSDoc comments from an action handler file
 */
async function loadActionDocs(handlerPath: string): Promise<Partial<RouteDoc>> {
  try {
    const fullPath = join(process.cwd(), 'src/actions', `${handlerPath.replace(/\//g, '_').toLowerCase()}.ts`)
    const source = await Bun.file(fullPath).text()

    // Basic JSDoc parser
    const docComment = source.match(/\/\*\*([\s\S]*?)\*\//)
    if (!docComment)
      return {}

    const doc = docComment[1]

    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const description = doc.match(/@description\s+(.+?)(?=@|\n\s*\*\/|$)/s)?.[1].trim() || ''
    const params: { [key: string]: string } = {}
    const query: { [key: string]: string } = {}
    const body: { [key: string]: string } = {}
    const responses: { [key: string]: string } = {}
    const examples: { request?: string, response?: string }[] = []
    const tags: string[] = []
    const security: string[] = []

    // Parse @tags
    const tagMatches = doc.match(/@tags?\s+(.+)/g)
    if (tagMatches) {
      tagMatches.forEach((match) => {
        const tag = match.replace(/@tags?\s+/, '').trim()
        tags.push(...tag.split(/\s*,\s*/))
      })
    }

    // Parse @security
    const securityMatches = doc.match(/@security\s+(.+)/g)
    if (securityMatches) {
      securityMatches.forEach((match) => {
        const scheme = match.replace(/@security\s+/, '').trim()
        security.push(scheme)
      })
    }

    // Parse @param with enhanced type support
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const paramMatches = doc.matchAll(/@param\s+\{([^}]+)\}\s+(\w+(?:\.\w+)?)\s+(.+?)(?=@|\n\s*\*\/|$)/gs)
    for (const match of paramMatches) {
      const [, type, name, desc] = match
      const cleanDesc = desc.trim()
      if (name.startsWith('query.')) {
        query[name.slice(6)] = `${type} - ${cleanDesc}`
      }
      else if (name.startsWith('body.')) {
        body[name.slice(5)] = `${type} - ${cleanDesc}`
      }
      else {
        params[name] = `${type} - ${cleanDesc}`
      }
    }

    // Parse @response with enhanced status code descriptions
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const responseMatches = doc.matchAll(/@response\s+\{(\d+)\}\s+(.+?)(?=@|\n\s*\*\/|$)/gs)
    for (const match of responseMatches) {
      const [, code, desc] = match
      responses[code] = desc.trim()
    }

    // Parse @example blocks
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const exampleMatches = doc.matchAll(/@example\s+(request|response)[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```/g)
    let currentExample: { request?: string, response?: string } = {}

    for (const match of exampleMatches) {
      const [, type, content] = match
      if (type === 'request') {
        currentExample = { request: content.trim() }
      }
      else if (type === 'response') {
        currentExample.response = content.trim()
        examples.push(currentExample)
        currentExample = {}
      }
    }

    // Check for @deprecated tag
    const deprecated = doc.includes('@deprecated')

    return {
      description,
      params,
      query,
      body,
      responses,
      examples: examples.length > 0 ? examples : undefined,
      tags: tags.length > 0 ? tags : undefined,
      security: security.length > 0 ? security : undefined,
      deprecated,
    }
  }
  catch (error) {
    if (error instanceof Error) {
      console.warn(`Failed to load docs for ${handlerPath}:`, error.message)
    }
    return {}
  }
}

/**
 * Generates markdown documentation for routes
 */
function generateMarkdown(routes: RouteDoc[], options: DocsOptions): string {
  let markdown = '# API Reference\n\n'

  // Add table of contents
  markdown += '## Table of Contents\n\n'

  // Group routes based on option
  const groupedRoutes = routes.reduce((groups: { [key: string]: RouteDoc[] }, route) => {
    let key: string
    switch (options.groupBy) {
      case 'method':
        key = route.method
        break
      case 'tag':
        if (route.tags?.length) {
          route.tags.forEach((tag) => {
            if (!groups[tag])
              groups[tag] = []
            groups[tag].push(route)
          })
          return groups
        }
        key = 'untagged'
        break
      default: // 'path'
        key = route.path.split('/')[1] || 'root'
    }
    if (!groups[key])
      groups[key] = []
    groups[key].push(route)
    return groups
  }, {})

  // Add ToC entries
  for (const group of Object.keys(groupedRoutes).sort()) {
    markdown += `- [${group.charAt(0).toUpperCase() + group.slice(1)}](#${group.toLowerCase()})\n`
  }
  markdown += '\n'

  // Generate markdown for each group
  for (const [group, routes] of Object.entries(groupedRoutes).sort()) {
    markdown += `## ${group.charAt(0).toUpperCase() + group.slice(1)}\n\n`

    for (const route of routes) {
      const methodBadge = `![${route.method}](https://img.shields.io/badge/-${route.method}-${getMethodColor(route.method)})`
      markdown += `### ${methodBadge} ${route.path}\n\n`

      if (route.deprecated) {
        markdown += '> ⚠️ **Deprecated**\n\n'
      }

      if (route.description) {
        markdown += `${route.description}\n\n`
      }

      if (route.security?.length) {
        markdown += '**Security:**\n\n'
        for (const scheme of route.security) {
          markdown += `- ${scheme}\n`
        }
        markdown += '\n'
      }

      if (route.middleware?.length) {
        markdown += '**Middleware:**\n\n'
        for (const mw of route.middleware) {
          markdown += `- ${mw}\n`
        }
        markdown += '\n'
      }

      if (Object.keys(route.params || {}).length) {
        markdown += '**URL Parameters:**\n\n'
        markdown += '| Parameter | Description |\n'
        markdown += '|-----------|-------------|\n'
        for (const [name, desc] of Object.entries(route.params!)) {
          markdown += `| ${name} | ${desc} |\n`
        }
        markdown += '\n'
      }

      if (Object.keys(route.query || {}).length) {
        markdown += '**Query Parameters:**\n\n'
        markdown += '| Parameter | Description |\n'
        markdown += '|-----------|-------------|\n'
        for (const [name, desc] of Object.entries(route.query!)) {
          markdown += `| ${name} | ${desc} |\n`
        }
        markdown += '\n'
      }

      if (Object.keys(route.body || {}).length) {
        markdown += '**Request Body:**\n\n'
        markdown += '| Field | Description |\n'
        markdown += '|-------|-------------|\n'
        for (const [name, desc] of Object.entries(route.body!)) {
          markdown += `| ${name} | ${desc} |\n`
        }
        markdown += '\n'
      }

      if (Object.keys(route.responses || {}).length) {
        markdown += '**Responses:**\n\n'
        markdown += '| Status | Description |\n'
        markdown += '|--------|-------------|\n'
        for (const [code, desc] of Object.entries(route.responses!)) {
          markdown += `| ${code} | ${desc} |\n`
        }
        markdown += '\n'
      }

      if (options.includeExamples && route.examples?.length) {
        markdown += '**Examples:**\n\n'
        route.examples.forEach((example, index) => {
          if (index > 0)
            markdown += '\n'
          if (example.request) {
            markdown += `\`\`\`json\n# Request\n${example.request}\n\`\`\`\n\n`
          }
          if (example.response) {
            markdown += `\`\`\`json\n# Response\n${example.response}\n\`\`\`\n\n`
          }
        })
      }

      markdown += '---\n\n'
    }
  }

  return markdown
}

/**
 * Get badge color for HTTP method
 */
function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: '32CD32', // green
    POST: '4169E1', // blue
    PUT: 'FF8C00', // orange
    PATCH: 'BA55D3', // purple
    DELETE: 'DC143C', // red
    OPTIONS: '808080', // gray
    HEAD: '808080', // gray
  }
  return colors[method] || '808080'
}

/**
 * Generates API documentation from route definitions
 */
export async function generateApiDocs(options: DocsOptions = {}): Promise<void> {
  const {
    output = 'api-reference.md',
    verbose = false,
    groupBy = 'path',
    includeExamples = true,
  } = options

  try {
    // Load API routes
    const apiPath = join(process.cwd(), 'routes/api.ts')
    const webPath = join(process.cwd(), 'routes/web.ts')

    const routes: RouteDoc[] = []

    // Process API routes
    try {
      const apiRoutes = await import(apiPath)
      if (apiRoutes.default) {
        const routeDefs = Array.isArray(apiRoutes.default) ? apiRoutes.default : [apiRoutes.default]
        for (const route of routeDefs) {
          const routeDoc: RouteDoc = {
            path: route.path,
            method: route.method,
            middleware: Array.isArray(route.middleware)
              ? route.middleware.map((m: string | ((request: Request) => Promise<Request | Response>)) =>
                  typeof m === 'string' ? m : 'function',
                )
              : undefined,
            params: extractRouteParams(route.path),
          }

          if (typeof route.handler === 'string') {
            const actionDocs = await loadActionDocs(route.handler)
            Object.assign(routeDoc, actionDocs)
          }

          routes.push(routeDoc)
        }
      }
    }
    catch {
      if (verbose) {
        console.warn('No API routes found')
      }
    }

    // Process web routes
    try {
      const webRoutes = await import(webPath)
      if (webRoutes.default) {
        const routeDefs = Array.isArray(webRoutes.default) ? webRoutes.default : [webRoutes.default]
        for (const route of routeDefs) {
          const routeDoc: RouteDoc = {
            path: route.path,
            method: route.method,
            middleware: Array.isArray(route.middleware)
              ? route.middleware.map((m: string | ((request: Request) => Promise<Request | Response>)) =>
                  typeof m === 'string' ? m : 'function',
                )
              : undefined,
            params: extractRouteParams(route.path),
          }

          if (typeof route.handler === 'string') {
            const actionDocs = await loadActionDocs(route.handler)
            Object.assign(routeDoc, actionDocs)
          }

          routes.push(routeDoc)
        }
      }
    }
    catch {
      if (verbose) {
        console.warn('No web routes found')
      }
    }

    // Generate and write markdown
    const markdown = generateMarkdown(routes, { groupBy, includeExamples })
    await Bun.write(output, markdown)
  }
  catch (error) {
    throw new Error(`Failed to generate API documentation: ${error instanceof Error ? error.message : String(error)}`)
  }
}
