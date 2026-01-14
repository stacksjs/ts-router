/**
 * Response Factory
 *
 * Implements fluent response helpers with full TypeScript support
 */

import type { ContentType, ResponseStatus } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * JSON response options
 */
export interface JsonResponseOptions {
  status?: ResponseStatus
  headers?: Record<string, string>
  pretty?: boolean
}

/**
 * Download response options
 */
export interface DownloadOptions {
  filename?: string
  headers?: Record<string, string>
  disposition?: 'attachment' | 'inline'
}

/**
 * Stream download options
 */
export interface StreamDownloadOptions extends DownloadOptions {
  contentType?: ContentType
}

/**
 * Cookie options for response
 */
export interface ResponseCookieOptions {
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  path?: string
  domain?: string
  sameSite?: 'strict' | 'lax' | 'none'
}

// ============================================================================
// Response Factory Interface
// ============================================================================

export interface ResponseFactory {
  json: <T>(data: T, options?: JsonResponseOptions) => Response
  noContent: (headers?: Record<string, string>) => Response
  download: (filePath: string, filename?: string, headers?: Record<string, string>) => Promise<Response>
  file: (filePath: string, headers?: Record<string, string>) => Promise<Response>
  streamDownload: (generator: () => AsyncGenerator<string | Uint8Array, void, unknown>, filename: string, options?: StreamDownloadOptions) => Response
  redirect: (url: string, status?: 301 | 302 | 303 | 307 | 308) => Response
  redirectPermanent: (url: string) => Response
  redirectTemporary: (url: string) => Response
  back: (request: Request, fallback?: string) => Response
  view: (html: string, status?: ResponseStatus, headers?: Record<string, string>) => Response
  text: (text: string, status?: ResponseStatus, headers?: Record<string, string>) => Response
  xml: (xml: string, status?: ResponseStatus, headers?: Record<string, string>) => Response
  success: <T>(data?: T, message?: string, status?: ResponseStatus) => Response
  error: (message: string, status?: ResponseStatus, errors?: Record<string, string[]>) => Response
  paginate: <T>(data: T[], options: { page: number, perPage: number, total: number, path: string }) => Response
  created: <T>(data?: T, location?: string) => Response
  accepted: <T>(data?: T) => Response
  notFound: (message?: string) => Response
  unauthorized: (message?: string) => Response
  forbidden: (message?: string) => Response
  badRequest: (message?: string, errors?: Record<string, string[]>) => Response
  validationError: (errors: Record<string, string[]>, message?: string) => Response
  unprocessableEntity: (message?: string, errors?: Record<string, string[]>) => Response
  serverError: (message?: string) => Response
  tooManyRequests: (message?: string, retryAfter?: number) => Response
}

// ============================================================================
// Response Factory
// ============================================================================

/**
 * Response factory with common response helpers
 */
export const response: ResponseFactory = {
  /**
   * Create a JSON response with proper typing
   */
  json: <T>(data: T, options: JsonResponseOptions = {}): Response => {
    const { status = 200, headers = {}, pretty = false } = options
    const body = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)

    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })
  },

  /**
   * Create a 204 No Content response
   */
  noContent: (headers: Record<string, string> = {}): Response => {
    return new Response(null, {
      status: 204,
      headers,
    })
  },

  /**
   * Create a file download response
   */
  download: async (
    filePath: string,
    filename?: string,
    headers: Record<string, string> = {},
  ): Promise<Response> => {
    const file = Bun.file(filePath)
    const exists = await file.exists()

    if (!exists) {
      return new Response('File not found', { status: 404 })
    }

    const downloadFilename = filename || filePath.split('/').pop() || 'download'
    const contentType = file.type || 'application/octet-stream'

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Content-Length': String(file.size),
        ...headers,
      },
    })
  },

  /**
   * Create a file inline response (display in browser)
   */
  file: async (
    filePath: string,
    headers: Record<string, string> = {},
  ): Promise<Response> => {
    const file = Bun.file(filePath)
    const exists = await file.exists()

    if (!exists) {
      return new Response('File not found', { status: 404 })
    }

    const contentType = file.type || 'application/octet-stream'

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(file.size),
        ...headers,
      },
    })
  },

  /**
   * Create a stream download response
   */
  streamDownload: (
    generator: () => AsyncGenerator<string | Uint8Array, void, unknown>,
    filename: string,
    options: StreamDownloadOptions = {},
  ): Response => {
    const { contentType = 'application/octet-stream', headers = {} } = options

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator()) {
            if (typeof chunk === 'string') {
              controller.enqueue(new TextEncoder().encode(chunk))
            }
            else {
              controller.enqueue(chunk)
            }
          }
          controller.close()
        }
        catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Transfer-Encoding': 'chunked',
        ...headers,
      },
    })
  },

  /**
   * Create a redirect response
   */
  redirect: (url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response => {
    return new Response(null, {
      status,
      headers: {
        Location: url,
      },
    })
  },

  /**
   * Create a permanent redirect (301)
   */
  redirectPermanent: (url: string): Response => {
    return response.redirect(url, 301)
  },

  /**
   * Create a temporary redirect (302)
   */
  redirectTemporary: (url: string): Response => {
    return response.redirect(url, 302)
  },

  /**
   * Redirect back (requires Referer header)
   */
  back: (request: Request, fallback: string = '/'): Response => {
    const referer = request.headers.get('referer') || fallback
    return response.redirect(referer)
  },

  /**
   * Create a view response (HTML)
   */
  view: (html: string, status: ResponseStatus = 200, headers: Record<string, string> = {}): Response => {
    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...headers,
      },
    })
  },

  /**
   * Create a text response
   */
  text: (text: string, status: ResponseStatus = 200, headers: Record<string, string> = {}): Response => {
    return new Response(text, {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...headers,
      },
    })
  },

  /**
   * Create an XML response
   */
  xml: (xml: string, status: ResponseStatus = 200, headers: Record<string, string> = {}): Response => {
    return new Response(xml, {
      status,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        ...headers,
      },
    })
  },

  /**
   * Create a success response (API)
   */
  success: <T>(data?: T, message?: string, status: ResponseStatus = 200): Response => {
    const body: Record<string, unknown> = {}
    if (data !== undefined)
      body.data = data
    if (message !== undefined)
      body.message = message
    return response.json(body, { status })
  },

  /**
   * Create an error response (API)
   */
  error: (message: string, status: ResponseStatus = 400, errors?: Record<string, string[]>): Response => {
    const body: Record<string, unknown> = { error: message }
    if (errors !== undefined)
      body.errors = errors
    return response.json(body, { status })
  },

  /**
   * Create a paginated response
   */
  paginate: <T>(
    data: T[],
    options: {
      page: number
      perPage: number
      total: number
      path: string
    },
  ): Response => {
    const { page, perPage, total, path } = options
    const lastPage = Math.ceil(total / perPage)
    const from = (page - 1) * perPage + 1
    const to = Math.min(page * perPage, total)

    return response.json({
      data,
      meta: {
        current_page: page,
        per_page: perPage,
        total,
        last_page: lastPage,
        from,
        to,
        path,
        first_page_url: `${path}?page=1`,
        last_page_url: `${path}?page=${lastPage}`,
        next_page_url: page < lastPage ? `${path}?page=${page + 1}` : null,
        prev_page_url: page > 1 ? `${path}?page=${page - 1}` : null,
      },
    })
  },

  /**
   * Create a created response (201)
   */
  created: <T>(data?: T, location?: string): Response => {
    const headers: Record<string, string> = {}
    if (location) {
      headers.Location = location
    }
    const body: Record<string, unknown> = {}
    if (data !== undefined)
      body.data = data
    return response.json(body, { status: 201, headers })
  },

  /**
   * Create an accepted response (202)
   */
  accepted: <T>(data?: T): Response => {
    const body: Record<string, unknown> = {}
    if (data !== undefined)
      body.data = data
    return response.json(body, { status: 202 })
  },

  /**
   * Create a not found response (404)
   */
  notFound: (message: string = 'Resource not found'): Response => {
    return response.error(message, 404)
  },

  /**
   * Create an unauthorized response (401)
   */
  unauthorized: (message: string = 'Unauthorized'): Response => {
    return response.error(message, 401)
  },

  /**
   * Create a forbidden response (403)
   */
  forbidden: (message: string = 'Forbidden'): Response => {
    return response.error(message, 403)
  },

  /**
   * Create a bad request response (400)
   */
  badRequest: (message: string = 'Bad request', errors?: Record<string, string[]>): Response => {
    return response.error(message, 400, errors)
  },

  /**
   * Create a validation error response (422)
   */
  validationError: (errors: Record<string, string[]>, message: string = 'Validation failed'): Response => {
    return response.error(message, 422, errors)
  },

  /**
   * Create an unprocessable entity response (422) - alias for validationError
   */
  unprocessableEntity: (message: string = 'Unprocessable entity', errors?: Record<string, string[]>): Response => {
    return response.error(message, 422, errors)
  },

  /**
   * Create a server error response (500)
   */
  serverError: (message: string = 'Internal server error'): Response => {
    return response.error(message, 500)
  },

  /**
   * Create a too many requests response (429)
   */
  tooManyRequests: (message: string = 'Too many requests', retryAfter?: number): Response => {
    const headers: Record<string, string> = {}
    if (retryAfter) {
      headers['Retry-After'] = String(retryAfter)
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })
  },
}

// ============================================================================
// Response Builder
// ============================================================================

/**
 * Fluent response builder
 */
export class ResponseBuilder {
  private _status: ResponseStatus = 200
  private _headers: Record<string, string> = {}
  private _cookies: Array<{ name: string, value: string, options: ResponseCookieOptions }> = []
  private _deleteCookies: Array<{ name: string, options: Pick<ResponseCookieOptions, 'path' | 'domain'> }> = []

  /**
   * Set response status
   */
  status(code: ResponseStatus): this {
    this._status = code
    return this
  }

  /**
   * Add a header
   */
  header(name: string, value: string): this {
    this._headers[name] = value
    return this
  }

  /**
   * Add multiple headers
   */
  withHeaders(headers: Record<string, string>): this {
    this._headers = { ...this._headers, ...headers }
    return this
  }

  /**
   * Add a cookie
   */
  cookie(name: string, value: string, options: ResponseCookieOptions = {}): this {
    this._cookies.push({ name, value, options })
    return this
  }

  /**
   * Remove a cookie
   */
  withoutCookie(name: string, options: Pick<ResponseCookieOptions, 'path' | 'domain'> = {}): this {
    this._deleteCookies.push({ name, options })
    return this
  }

  /**
   * Build JSON response
   */
  json<T>(data: T): Response {
    const res = response.json(data, {
      status: this._status,
      headers: this._headers,
    })
    return this.applyCookies(res)
  }

  /**
   * Build text response
   */
  text(content: string): Response {
    const res = response.text(content, this._status, this._headers)
    return this.applyCookies(res)
  }

  /**
   * Build HTML response
   */
  html(content: string): Response {
    const res = response.view(content, this._status, this._headers)
    return this.applyCookies(res)
  }

  /**
   * Build no content response
   */
  noContent(): Response {
    const res = response.noContent(this._headers)
    return this.applyCookies(res)
  }

  /**
   * Apply cookies to response
   */
  private applyCookies(res: Response): Response {
    const newHeaders = new Headers(res.headers)

    // Add cookies
    for (const { name, value, options } of this._cookies) {
      const cookie = this.serializeCookie(name, value, options)
      newHeaders.append('Set-Cookie', cookie)
    }

    // Delete cookies
    for (const { name, options } of this._deleteCookies) {
      const cookie = this.serializeCookie(name, '', {
        ...options,
        maxAge: 0,
        expires: new Date(0),
      })
      newHeaders.append('Set-Cookie', cookie)
    }

    return new Response(res.body, {
      status: res.status,
      headers: newHeaders,
    })
  }

  /**
   * Serialize cookie to string
   */
  private serializeCookie(name: string, value: string, options: ResponseCookieOptions): string {
    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

    if (options.maxAge !== undefined) {
      cookie += `; Max-Age=${options.maxAge}`
    }
    if (options.expires) {
      cookie += `; Expires=${options.expires.toUTCString()}`
    }
    if (options.httpOnly) {
      cookie += '; HttpOnly'
    }
    if (options.secure) {
      cookie += '; Secure'
    }
    if (options.path) {
      cookie += `; Path=${options.path}`
    }
    if (options.domain) {
      cookie += `; Domain=${options.domain}`
    }
    if (options.sameSite) {
      cookie += `; SameSite=${options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1)}`
    }

    return cookie
  }
}

/**
 * Create a new response builder
 */
export function responseBuilder(): ResponseBuilder {
  return new ResponseBuilder()
}

// Already exported above via const and class declarations
