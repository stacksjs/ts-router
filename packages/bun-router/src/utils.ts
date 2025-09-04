import type { ActionHandler, ActionHandlerClass, RouteHandler } from './types'
import { join } from 'node:path'

/**
 * Normalizes a path by ensuring it starts with a forward slash and has no trailing slash
 * @param path The path to normalize
 */
export function normalizePath(path: string): string {
  // First replace double (or more) slashes with a single slash
  let normalizedPath = path.replace(/\/+/g, '/')

  // Then ensure there's a leading slash and no trailing slash (unless it's just /)
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = `/${normalizedPath}`
  }

  if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1)
  }

  return normalizedPath
}

/**
 * Converts a string path to an action path for dynamic imports
 * @param path The path to convert (e.g., 'Actions/Home/IndexAction')
 */
export function toActionPath(path: string): string {
  return path.replace(/\//g, '_').toLowerCase()
}

/**
 * Checks if a handler is a class constructor implementing ActionHandlerClass
 * @param handler The handler to check
 */
export function isActionClass(handler: ActionHandler): handler is new () => ActionHandlerClass {
  if (typeof handler !== 'function' && typeof handler !== 'object') {
    return false
  }

  // Check if it's a class constructor
  if (typeof handler === 'function' && handler.prototype) {
    const prototype = handler.prototype as unknown as { handle?: unknown }
    if (typeof prototype.handle === 'function') {
      return true
    }
  }

  // Check if it's an instance with a handle method
  if (typeof handler === 'object' && handler !== null && 'handle' in handler && typeof (handler as any).handle === 'function') {
    return true
  }

  return false
}

/**
 * Checks if a handler is a route handler function
 * @param handler The handler to check
 */
export function isRouteHandler(handler: ActionHandler): handler is RouteHandler {
  return typeof handler === 'function' && !isActionClass(handler)
}

/**
 * Extracts named parameters from a path pattern
 * @param pattern The path pattern (e.g., '/users/{id}/posts/{postId}')
 */
export function extractParamNames(pattern: string): string[] {
  const matches = pattern.match(/\{([^}]+)\}/g)
  return matches ? matches.map(m => m.slice(1, -1)) : []
}

/**
 * Creates a regex pattern from a path pattern
 * @param pattern The path pattern
 */
export function createPathRegex(pattern: string): RegExp {
  const regexPattern = pattern.replace(/\{([^}]+)\}/g, '([^/]+)')
  return new RegExp(`^${regexPattern}$`)
}

/**
 * Matches a path against a pattern and extracts parameters
 * @param pattern The path pattern (e.g., '/users/{id}')
 * @param path The actual path (e.g., '/users/123')
 * @param params Output parameter object that will contain extracted parameters
 * @param constraints Optional constraints for route parameters
 * @returns Boolean indicating whether the path matches the pattern
 */
export function matchPath(
  pattern: string, 
  path: string, 
  params: Record<string, string>,
  constraints?: Record<string, string>
): boolean {
  // Both paths should be normalized
  const normalizedPattern = normalizePath(pattern)
  const normalizedPath = normalizePath(path)

  // Special case for wildcard patterns
  if (pattern.endsWith('/*')) {
    const basePattern = pattern.slice(0, -2)
    if (path.startsWith(basePattern)) {
      return true
    }
  }

  // Handle patterns with parameters
  const patternSegments = normalizedPattern.split('/').filter(Boolean)
  const pathSegments = normalizedPath.split('/').filter(Boolean)

  // Quick check - if segments don't match (accounting for optional params) then no match
  // For mandatory parameters, the pattern and path must have same number of segments
  const optionalParamCount = (normalizedPattern.match(/\{[^}]+\?\}/g) || []).length

  if (pathSegments.length < patternSegments.length - optionalParamCount
    || pathSegments.length > patternSegments.length) {
    return false
  }

  // Match each segment
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i]
    const pathSegment = pathSegments[i]

    // If we've run out of path segments and this is not an optional parameter
    if (pathSegment === undefined) {
      if (patternSegment.match(/\{[^}]+\?\}/)) {
        // This is an optional parameter and we have no path segment for it
        continue
      }
      else {
        // Required parameter or static segment with no matching path segment
        return false
      }
    }

    // Check if this segment is a parameter
    const paramMatch = patternSegment.match(/\{([^}:]+)(?::[^}]+)?(\?)?\}/)
    if (paramMatch) {
      // This is a parameter segment, extract param name
      const paramName = paramMatch[1].replace('?', '')
      // Store the parameter value
      params[paramName] = pathSegment
      
      // Check constraints if they exist
      if (constraints && constraints[paramName]) {
        try {
          const regex = new RegExp(`^${constraints[paramName]}$`)
          if (!regex.test(pathSegment)) {
            return false
          }
        } catch (e) {
          // If regex is invalid, treat as no constraint
          console.warn(`Invalid constraint regex for parameter ${paramName}: ${constraints[paramName]}`)
        }
      }
    }
    else if (patternSegment !== pathSegment) {
      // Static segment doesn't match
      return false
    }
  }

  return true
}

/**
 * Joins path segments ensuring proper formatting
 * @param segments Path segments to join
 */
export function joinPaths(...segments: string[]): string {
  return normalizePath(segments.join('/'))
}

/**
 * Validates a route path format
 * @param path The path to validate
 */
export function validatePath(path: string): boolean {
  // Path must start with a slash
  if (!path.startsWith('/')) {
    return false
  }

  // Check for balanced curly braces
  const stack: string[] = []
  for (const char of path) {
    if (char === '{') {
      stack.push(char)
    }
    else if (char === '}') {
      if (stack.length === 0 || stack.pop() !== '{') {
        return false
      }
    }
  }

  return stack.length === 0
}

/**
 * Check if a file exists at the given path
 * @param path The file path to check
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    const file = Bun.file(path)
    return await file.exists()
  }
  catch {
    return false
  }
}

/**
 * Resolve a view name to an actual file path
 * @param viewName The view name (without extension)
 * @param viewsPath The base path for views
 * @param extensions File extensions to try
 */
export async function resolveViewPath(
  viewName: string,
  viewsPath: string,
  extensions: string[],
): Promise<string | null> {
  // If viewName already contains an extension, try it directly
  if (extensions.some(ext => viewName.endsWith(ext))) {
    const fullPath = normalizePath(join(viewsPath, viewName))
    if (await fileExists(fullPath)) {
      return fullPath
    }
    return null
  }

  // Try each extension
  for (const ext of extensions) {
    const fullPath = normalizePath(join(viewsPath, `${viewName}${ext}`))
    if (await fileExists(fullPath)) {
      return fullPath
    }
  }

  return null
}

/**
 * Basic HTML template processing - replaces {{ varName }} with the corresponding value
 * @param template The HTML template string
 * @param data The data to inject into the template
 */
export function processHtmlTemplate(template: string, data: Record<string, any>): string {
  // Process general variables {{ varName }}
  let result = template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim()
    const value = getNestedValue(data, trimmedKey)
    return value !== undefined ? String(value) : match
  })

  // Process conditionals {{#if condition}} content {{/if}}
  result = processConditionals(result, data)

  // Process loops {{#each items}} content {{/each}}
  result = processLoops(result, data)

  return result
}

/**
 * Process conditional statements in templates
 */
function processConditionals(template: string, data: Record<string, any>): string {
  // Match {{#if condition}} content {{/if}} or {{#if condition}} content {{else}} alternative {{/if}}
  return template.replace(
    /\{\{#if ([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (match, condition, content, alternative = '') => {
      const conditionTrimmed = condition.trim()
      const value = getNestedValue(data, conditionTrimmed)
      // Explicitly check for falsy values (false, undefined, null, 0, "")
      return value ? content : alternative
    },
  )
}

/**
 * Process loop statements in templates
 */
function processLoops(template: string, data: Record<string, any>): string {
  // Match {{#each items}} content {{/each}}
  return template.replace(
    /\{\{#each ([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (match, arrayKey, content) => {
      const array = getNestedValue(data, arrayKey.trim())
      if (!Array.isArray(array))
        return ''

      return array.map((item) => {
        // Replace {{@index}} with the current index
        // Replace {{this}} with the current item
        // Replace {{this.property}} with the current item's property
        return content
          .replace(/\{\{@index\}\}/g, String(array.indexOf(item)))
          .replace(/\{\{this\}\}/g, String(item))
          .replace(/\{\{this\.([^}]+)\}\}/g, (matchStr: string, prop: string) => {
            const value = item[prop.trim()]
            return value !== undefined ? String(value) : ''
          })
      }).join('')
    },
  )
}

/**
 * Get a nested value from an object using dot notation
 * @param obj The object to extract value from
 * @param path The path to the value (e.g., 'user.profile.name')
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined
  }, obj)
}
