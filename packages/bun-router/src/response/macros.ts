/**
 * Request/Response Enhancements - Response Macros
 *
 * Laravel-style response macros for common response patterns
 */

export interface ResponseMacro {
  name: string
  handler: (...args: any[]) => Response
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  errors?: Record<string, string[]>
  meta?: Record<string, any>
  links?: Record<string, string>
  timestamp?: string
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  meta: {
    current_page: number
    per_page: number
    total: number
    last_page: number
    from: number
    to: number
    path: string
    first_page_url: string
    last_page_url: string
    next_page_url?: string
    prev_page_url?: string
  }
}

/**
 * Response macro registry
 */
class ResponseMacroRegistry {
  private macros: Map<string, ResponseMacro> = new Map()

  /**
   * Register a response macro
   */
  register(name: string, handler: (...args: any[]) => Response): void {
    this.macros.set(name, { name, handler })
  }

  /**
   * Get a registered macro
   */
  get(name: string): ResponseMacro | undefined {
    return this.macros.get(name)
  }

  /**
   * Check if macro exists
   */
  has(name: string): boolean {
    return this.macros.has(name)
  }

  /**
   * Get all registered macros
   */
  all(): ResponseMacro[] {
    return Array.from(this.macros.values())
  }

  /**
   * Remove a macro
   */
  remove(name: string): boolean {
    return this.macros.delete(name)
  }

  /**
   * Clear all macros
   */
  clear(): void {
    this.macros.clear()
  }
}

/**
 * Global response macro registry
 */
export const responseMacroRegistry = new ResponseMacroRegistry()

/**
 * Enhanced Response class with macro support
 */
export class EnhancedResponse extends Response {
  /**
   * Register a response macro
   */
  static macro(name: string, handler: (...args: any[]) => Response): void {
    responseMacroRegistry.register(name, handler)

    // Add method to Response prototype
    ;(Response as any)[name] = handler
  }

  /**
   * Call a registered macro
   */
  static callMacro(name: string, ...args: any[]): Response {
    const macro = responseMacroRegistry.get(name)
    if (!macro) {
      throw new Error(`Response macro "${name}" not found`)
    }
    return macro.handler(...args)
  }

  /**
   * Check if macro exists
   */
  static hasMacro(name: string): boolean {
    return responseMacroRegistry.has(name)
  }
}

/**
 * Built-in response macros
 */
export const BuiltInResponseMacros = {
  /**
   * Success response with data
   */
  success: (data?: any, message?: string, status = 200): Response => {
    const response: ApiResponse = {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
    }

    return new Response(JSON.stringify(response), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Response-Time': new Date().toISOString(),
      },
    })
  },

  /**
   * Error response with message and errors
   */
  error: (message: string, errors?: Record<string, string[]>, status = 400): Response => {
    const response: ApiResponse = {
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString(),
    }

    return new Response(JSON.stringify(response), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Response-Time': new Date().toISOString(),
      },
    })
  },

  /**
   * Validation error response
   */
  validationError: (errors: Record<string, string[]>, message = 'Validation failed'): Response => {
    return BuiltInResponseMacros.error(message, errors, 422)
  },

  /**
   * Not found response
   */
  notFound: (message = 'Resource not found'): Response => {
    return BuiltInResponseMacros.error(message, undefined, 404)
  },

  /**
   * Unauthorized response
   */
  unauthorized: (message = 'Unauthorized'): Response => {
    return BuiltInResponseMacros.error(message, undefined, 401)
  },

  /**
   * Forbidden response
   */
  forbidden: (message = 'Forbidden'): Response => {
    return BuiltInResponseMacros.error(message, undefined, 403)
  },

  /**
   * Internal server error response
   */
  serverError: (message = 'Internal server error'): Response => {
    return BuiltInResponseMacros.error(message, undefined, 500)
  },

  /**
   * Created response
   */
  created: (data?: any, message = 'Resource created successfully'): Response => {
    return BuiltInResponseMacros.success(data, message, 201)
  },

  /**
   * Updated response
   */
  updated: (data?: any, message = 'Resource updated successfully'): Response => {
    return BuiltInResponseMacros.success(data, message, 200)
  },

  /**
   * Deleted response
   */
  deleted: (message = 'Resource deleted successfully'): Response => {
    return BuiltInResponseMacros.success(null, message, 200)
  },

  /**
   * No content response
   */
  noContent: (): Response => {
    return new Response(null, { status: 204 })
  },

  /**
   * Accepted response
   */
  accepted: (data?: any, message = 'Request accepted'): Response => {
    return BuiltInResponseMacros.success(data, message, 202)
  },

  /**
   * Paginated response
   */
  paginated: <T>(
    data: T[],
    pagination: {
      current_page: number
      per_page: number
      total: number
      path: string
    },
    message?: string,
  ): Response => {
    const lastPage = Math.ceil(pagination.total / pagination.per_page)
    const from = (pagination.current_page - 1) * pagination.per_page + 1
    const to = Math.min(from + pagination.per_page - 1, pagination.total)

    const response: PaginatedResponse<T> = {
      success: true,
      data,
      message,
      meta: {
        current_page: pagination.current_page,
        per_page: pagination.per_page,
        total: pagination.total,
        last_page: lastPage,
        from,
        to,
        path: pagination.path,
        first_page_url: `${pagination.path}?page=1`,
        last_page_url: `${pagination.path}?page=${lastPage}`,
        next_page_url: pagination.current_page < lastPage
          ? `${pagination.path}?page=${pagination.current_page + 1}`
          : undefined,
        prev_page_url: pagination.current_page > 1
          ? `${pagination.path}?page=${pagination.current_page - 1}`
          : undefined,
      },
      timestamp: new Date().toISOString(),
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Response-Time': new Date().toISOString(),
      },
    })
  },

  /**
   * JSON response with custom headers
   */
  json: (data: any, status = 200, headers: Record<string, string> = {}): Response => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })
  },

  /**
   * HTML response
   */
  html: (content: string, status = 200, headers: Record<string, string> = {}): Response => {
    return new Response(content, {
      status,
      headers: {
        'Content-Type': 'text/html',
        ...headers,
      },
    })
  },

  /**
   * Plain text response
   */
  text: (content: string, status = 200, headers: Record<string, string> = {}): Response => {
    return new Response(content, {
      status,
      headers: {
        'Content-Type': 'text/plain',
        ...headers,
      },
    })
  },

  /**
   * XML response
   */
  xml: (content: string, status = 200, headers: Record<string, string> = {}): Response => {
    return new Response(content, {
      status,
      headers: {
        'Content-Type': 'application/xml',
        ...headers,
      },
    })
  },

  /**
   * Redirect response
   */
  redirect: (url: string, status = 302): Response => {
    return new Response(null, {
      status,
      headers: {
        Location: url,
      },
    })
  },

  /**
   * Permanent redirect response
   */
  permanentRedirect: (url: string): Response => {
    return BuiltInResponseMacros.redirect(url, 301)
  },

  /**
   * Download response
   */
  download: (
    data: ArrayBuffer | Uint8Array | string,
    filename: string,
    contentType = 'application/octet-stream',
  ): Response => {
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  },

  /**
   * Stream response
   */
  stream: (
    stream: ReadableStream,
    contentType = 'application/octet-stream',
    headers: Record<string, string> = {},
  ): Response => {
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...headers,
      },
    })
  },

  /**
   * Cache response with headers
   */
  cache: (
    data: any,
    maxAge = 3600,
    isPublic = true,
    etag?: string,
  ): Response => {
    const cacheControl = isPublic ? `public, max-age=${maxAge}` : `private, max-age=${maxAge}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    }

    if (etag) {
      headers.ETag = etag
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers,
    })
  },

  /**
   * CORS response
   */
  cors: (
    data: any,
    origin = '*',
    methods = 'GET,POST,PUT,DELETE,OPTIONS',
    headers = 'Content-Type,Authorization',
  ): Response => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': headers,
      },
    })
  },

  /**
   * Server-Sent Events response
   */
  sse: (data: string, event?: string, id?: string): Response => {
    let sseData = ''

    if (id)
      sseData += `id: ${id}\n`
    if (event)
      sseData += `event: ${event}\n`
    sseData += `data: ${data}\n\n`

    return new Response(sseData, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  },

  /**
   * Health check response
   */
  health: (status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy', checks: Record<string, any> = {}): Response => {
    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503

    const response = {
      status,
      timestamp: new Date().toISOString(),
      checks,
      uptime: process.uptime?.() || 0,
    }

    return new Response(JSON.stringify(response), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  },
}

/**
 * Register all built-in macros
 */
export function registerBuiltInResponseMacros(): void {
  Object.entries(BuiltInResponseMacros).forEach(([name, handler]) => {
    EnhancedResponse.macro(name, handler)
  })
}

/**
 * Response macro factory functions
 */
export const ResponseMacroFactory = {
  /**
   * Create API response macro
   */
  api: (defaultMeta?: Record<string, any>) => {
    return (data?: any, message?: string, status = 200): Response => {
      const response: ApiResponse = {
        success: status >= 200 && status < 300,
        data,
        message,
        meta: defaultMeta,
        timestamp: new Date().toISOString(),
      }

      return new Response(JSON.stringify(response), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Response-Time': new Date().toISOString(),
        },
      })
    }
  },

  /**
   * Create versioned API response macro
   */
  versionedApi: (version: string) => {
    return (data?: any, message?: string, status = 200): Response => {
      const response: ApiResponse = {
        success: status >= 200 && status < 300,
        data,
        message,
        meta: { version },
        timestamp: new Date().toISOString(),
      }

      return new Response(JSON.stringify(response), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Version': version,
          'X-Response-Time': new Date().toISOString(),
        },
      })
    }
  },

  /**
   * Create custom error response macro
   */
  customError: (defaultStatus = 400, defaultMessage = 'An error occurred') => {
    return (message = defaultMessage, errors?: Record<string, string[]>, status = defaultStatus): Response => {
      const response: ApiResponse = {
        success: false,
        message,
        errors,
        timestamp: new Date().toISOString(),
      }

      return new Response(JSON.stringify(response), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Response-Time': new Date().toISOString(),
        },
      })
    }
  },
}

/**
 * Response helper utilities
 */
export const ResponseHelpers = {
  /**
   * Check if response is successful
   */
  isSuccess: (response: Response): boolean => {
    return response.status >= 200 && response.status < 300
  },

  /**
   * Check if response is error
   */
  isError: (response: Response): boolean => {
    return response.status >= 400
  },

  /**
   * Get response body as JSON
   */
  getJson: async (response: Response): Promise<any> => {
    try {
      return await response.json()
    }
    catch {
      return null
    }
  },

  /**
   * Get response body as text
   */
  getText: async (response: Response): Promise<string> => {
    try {
      return await response.text()
    }
    catch {
      return ''
    }
  },

  /**
   * Clone response with new headers
   */
  withHeaders: (response: Response, headers: Record<string, string>): Response => {
    const newHeaders = new Headers(response.headers)
    Object.entries(headers).forEach(([key, value]) => {
      newHeaders.set(key, value)
    })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  },

  /**
   * Clone response with new status
   */
  withStatus: (response: Response, status: number, statusText?: string): Response => {
    return new Response(response.body, {
      status,
      statusText: statusText || response.statusText,
      headers: response.headers,
    })
  },
}

// Auto-register built-in macros
registerBuiltInResponseMacros()
