import type { CookieAccessor, CookieOptions, EnhancedRequest, UploadedFile } from '../types'
import type { TestFile, TestRequestOptions } from './types'

/**
 * Creates a CookieAccessor from a plain Record<string, string>
 */
function createCookieAccessor(cookies: Record<string, string>): CookieAccessor {
  const cookieStore = { ...cookies }
  return {
    get: (name: string) => cookieStore[name],
    set: (name: string, value: string, _options?: CookieOptions) => {
      cookieStore[name] = value
    },
    delete: (name: string, _options?: CookieOptions) => {
      delete cookieStore[name]
    },
    getAll: () => ({ ...cookieStore }),
  }
}

/**
 * Creates a mock EnhancedRequest for testing
 */
export class TestRequestBuilder {
  private request: Partial<EnhancedRequest>
  private url: URL

  constructor(method: string, path: string, options: TestRequestOptions = {}) {
    this.url = new URL(path, 'http://localhost:3000')

    // Apply query parameters
    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => this.url.searchParams.append(key, v))
        }
        else {
          this.url.searchParams.set(key, value)
        }
      })
    }

    this.request = {
      method,
      url: this.url.toString(),
      headers: new Headers(options.headers || {}),
      params: {},
      query: this.parseQuery(this.url.searchParams),
      jsonBody: undefined,
      formBody: options.body && typeof options.body === 'object' ? options.body : undefined,
      files: options.files ? this.convertTestFiles(options.files) : undefined,
      session: options.session,
      user: options.user,
      context: options.context || {},
      requestId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ip: '127.0.0.1',
      userAgent: () => 'BunRouter-TestClient/1.0',
      cookies: createCookieAccessor(options.cookies || {}),
      startTime: Date.now(),
      traceId: `trace-${Date.now()}`,
      spanId: `span-${Date.now()}`,
    }

    // Handle body based on content type
    this.handleBody(options.body)
  }

  private parseQuery(searchParams: URLSearchParams): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {}

    for (const [key, value] of searchParams.entries()) {
      if (query[key]) {
        if (Array.isArray(query[key])) {
          (query[key] as string[]).push(value)
        }
        else {
          query[key] = [query[key] as string, value]
        }
      }
      else {
        query[key] = value
      }
    }

    return query
  }

  private convertTestFiles(testFiles: TestFile[]): UploadedFile[] {
    return testFiles.map(file => ({
      fieldName: file.fieldName,
      originalName: file.filename,
      filename: `test-${Date.now()}-${file.filename}`,
      path: `/tmp/test-uploads/${file.filename}`,
      size: file.content instanceof ArrayBuffer
        ? file.content.byteLength
        : new TextEncoder().encode(file.content.toString()).length,
      mimetype: file.mimetype || 'application/octet-stream',
      buffer: file.content instanceof ArrayBuffer
        ? file.content
        : new TextEncoder().encode(file.content.toString()).buffer as ArrayBuffer,
    }))
  }

  private handleBody(body: any): void {
    if (!body)
      return

    const contentType = this.request.headers?.get('content-type') || ''

    if (contentType.includes('application/json') || typeof body === 'object') {
      this.request.jsonBody = body
      if (!this.request.headers?.has('content-type')) {
        this.request.headers?.set('content-type', 'application/json')
      }
    }
    else if (contentType.includes('application/x-www-form-urlencoded')) {
      this.request.formBody = body
    }
  }

  /**
   * Set route parameters
   */
  params(params: Record<string, string>): TestRequestBuilder {
    this.request.params = { ...this.request.params, ...params }
    return this
  }

  /**
   * Set request headers
   */
  headers(headers: Record<string, string>): TestRequestBuilder {
    Object.entries(headers).forEach(([key, value]) => {
      this.request.headers?.set(key, value)
    })
    return this
  }

  /**
   * Set authorization header
   */
  auth(token: string, type: 'Bearer' | 'Basic' = 'Bearer'): TestRequestBuilder {
    this.request.headers?.set('Authorization', `${type} ${token}`)
    return this
  }

  /**
   * Set user context
   */
  user(user: any): TestRequestBuilder {
    this.request.user = user
    return this
  }

  /**
   * Set session data
   */
  session(session: any): TestRequestBuilder {
    this.request.session = session
    return this
  }

  /**
   * Set cookies
   */
  cookies(cookies: Record<string, string>): TestRequestBuilder {
    const existingCookies = this.request.cookies?.getAll() || {}
    this.request.cookies = createCookieAccessor({ ...existingCookies, ...cookies })
    return this
  }

  /**
   * Set context data
   */
  context(context: Record<string, any>): TestRequestBuilder {
    this.request.context = { ...this.request.context, ...context }
    return this
  }

  /**
   * Set JSON body
   */
  json(data: any): TestRequestBuilder {
    this.request.jsonBody = data
    this.request.headers?.set('content-type', 'application/json')
    return this
  }

  /**
   * Set form body
   */
  form(data: Record<string, any>): TestRequestBuilder {
    this.request.formBody = data
    this.request.headers?.set('content-type', 'application/x-www-form-urlencoded')
    return this
  }

  /**
   * Add uploaded files
   */
  files(files: TestFile[]): TestRequestBuilder {
    this.request.files = this.convertTestFiles(files)
    this.request.headers?.set('content-type', 'multipart/form-data')
    return this
  }

  /**
   * Set IP address
   */
  ip(ip: string): TestRequestBuilder {
    this.request.ip = ip
    return this
  }

  /**
   * Set user agent
   */
  userAgent(userAgent: string): TestRequestBuilder {
    this.request.userAgent = () => userAgent
    this.request.headers?.set('User-Agent', userAgent)
    return this
  }

  /**
   * Set CSRF token
   */
  csrf(token: string): TestRequestBuilder {
    this.request.csrfToken = token
    this.request.headers?.set('X-CSRF-Token', token)
    return this
  }

  /**
   * Build the final request object
   */
  build(): EnhancedRequest {
    // Create a proper Request object
    const init: RequestInit = {
      method: this.request.method,
      headers: this.request.headers,
    }

    if (this.request.jsonBody) {
      init.body = JSON.stringify(this.request.jsonBody)
    }
    else if (this.request.formBody) {
      const formData = new FormData()
      Object.entries(this.request.formBody).forEach(([key, value]) => {
        formData.append(key, value as string)
      })
      init.body = formData
    }

    const baseRequest = new Request(this.url.toString(), init)

    // Create enhanced request by copying properties to a new object
    // We can't use Proxy due to Request immutability constraints in Bun
    const enhancedRequest = Object.assign(baseRequest, {
      params: this.request.params || {},
      query: this.request.query || {},
      jsonBody: this.request.jsonBody,
      formBody: this.request.formBody,
      files: this.request.files,
      session: this.request.session,
      user: this.request.user,
      context: this.request.context || {},
      requestId: this.request.requestId,
      ip: this.request.ip,
      userAgent: this.request.userAgent,
      cookies: this.request.cookies || {},
      startTime: this.request.startTime,
      traceId: this.request.traceId,
      spanId: this.request.spanId,
    })

    return enhancedRequest as EnhancedRequest
  }
}

/**
 * Helper functions for creating test requests
 */
export const testRequest = {
  get: (path: string, options?: TestRequestOptions): TestRequestBuilder =>
    new TestRequestBuilder('GET', path, options),

  post: (path: string, options?: TestRequestOptions): TestRequestBuilder =>
    new TestRequestBuilder('POST', path, options),

  put: (path: string, options?: TestRequestOptions): TestRequestBuilder =>
    new TestRequestBuilder('PUT', path, options),

  patch: (path: string, options?: TestRequestOptions): TestRequestBuilder =>
    new TestRequestBuilder('PATCH', path, options),

  delete: (path: string, options?: TestRequestOptions): TestRequestBuilder =>
    new TestRequestBuilder('DELETE', path, options),

  options: (path: string, options?: TestRequestOptions): TestRequestBuilder =>
    new TestRequestBuilder('OPTIONS', path, options),

  head: (path: string, options?: TestRequestOptions): TestRequestBuilder =>
    new TestRequestBuilder('HEAD', path, options),
}

/**
 * Create a mock request with minimal setup
 */
export function createMockRequest(
  method: string = 'GET',
  path: string = '/',
  options: TestRequestOptions = {},
): EnhancedRequest {
  return new TestRequestBuilder(method, path, options).build()
}
