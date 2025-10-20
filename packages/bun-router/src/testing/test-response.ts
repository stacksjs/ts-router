import type { TestResponse } from './types'

/**
 * Test response wrapper with assertion helpers
 */
export class TestResponseWrapper implements TestResponse {
  public status: number
  public statusText: string
  public headers: Record<string, string>
  public body: any
  public text: string
  public json: any
  public cookies: Record<string, string>
  public redirected: boolean
  public url: string
  public ok: boolean
  public type: string

  private originalResponse: Response

  constructor(response: Response, body?: any) {
    this.originalResponse = response
    this.status = response.status
    this.statusText = response.statusText
    this.headers = this.parseHeaders(response.headers)
    this.cookies = this.parseCookies(response.headers.get('set-cookie'))
    this.redirected = response.redirected
    this.url = response.url
    this.ok = response.ok
    this.type = response.type
    this.body = body
    this.text = typeof body === 'string' ? body : JSON.stringify(body)

    try {
      this.json = typeof body === 'string' ? JSON.parse(body) : body
    }
    catch {
      this.json = null
    }
  }

  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value
    })
    return result
  }

  private parseCookies(cookieHeader: string | null): Record<string, string> {
    if (!cookieHeader)
      return {}

    const cookies: Record<string, string> = {}
    cookieHeader.split(',').forEach((cookie) => {
      const [nameValue] = cookie.trim().split(';')
      const [name, value] = nameValue.split('=')
      if (name && value) {
        cookies[name.trim()] = value.trim()
      }
    })
    return cookies
  }

  /**
   * Assert response status
   */
  expectStatus(status: number): TestResponseWrapper {
    if (this.status !== status) {
      throw new Error(`Expected status ${status}, got ${this.status}`)
    }
    return this
  }

  /**
   * Assert response is successful (2xx)
   */
  expectSuccess(): TestResponseWrapper {
    if (!this.ok) {
      throw new Error(`Expected successful response, got ${this.status}`)
    }
    return this
  }

  /**
   * Assert response has specific header
   */
  expectHeader(name: string, value?: string): TestResponseWrapper {
    const headerValue = this.headers[name.toLowerCase()]
    if (headerValue === undefined) {
      throw new Error(`Expected header '${name}' to be present`)
    }
    if (value !== undefined && headerValue !== value) {
      throw new Error(`Expected header '${name}' to be '${value}', got '${headerValue}'`)
    }
    return this
  }

  /**
   * Assert response body matches
   */
  expectBody(expectedBody: any): TestResponseWrapper {
    if (typeof expectedBody === 'string') {
      if (this.text !== expectedBody) {
        throw new Error(`Expected body '${expectedBody}', got '${this.text}'`)
      }
    }
    else {
      if (JSON.stringify(this.json) !== JSON.stringify(expectedBody)) {
        throw new Error(`Expected body ${JSON.stringify(expectedBody)}, got ${JSON.stringify(this.json)}`)
      }
    }
    return this
  }

  /**
   * Assert response JSON matches
   */
  expectJson(expectedJson: any): TestResponseWrapper {
    if (JSON.stringify(this.json) !== JSON.stringify(expectedJson)) {
      throw new Error(`Expected JSON ${JSON.stringify(expectedJson)}, got ${JSON.stringify(this.json)}`)
    }
    return this
  }

  /**
   * Assert response JSON contains specific properties
   */
  expectJsonContains(properties: Record<string, any>): TestResponseWrapper {
    if (typeof this.json !== 'object' || this.json === null) {
      throw new Error('Response is not a JSON object')
    }

    Object.entries(properties).forEach(([key, expectedValue]) => {
      const actualValue = this.json[key]

      // Deep comparison for objects
      if (typeof expectedValue === 'object' && expectedValue !== null
        && typeof actualValue === 'object' && actualValue !== null) {
        const expectedStr = JSON.stringify(expectedValue)
        const actualStr = JSON.stringify(actualValue)
        if (expectedStr !== actualStr) {
          throw new Error(`Expected JSON property '${key}' to be ${expectedStr}, got ${actualStr}`)
        }
      }
      else if (actualValue !== expectedValue) {
        throw new Error(`Expected JSON property '${key}' to be '${expectedValue}', got '${actualValue}'`)
      }
    })

    return this
  }

  /**
   * Assert response has specific cookie
   */
  expectCookie(name: string, value?: string): TestResponseWrapper {
    const cookieValue = this.cookies[name]
    if (cookieValue === undefined) {
      throw new Error(`Expected cookie '${name}' to be present`)
    }
    if (value !== undefined && cookieValue !== value) {
      throw new Error(`Expected cookie '${name}' to be '${value}', got '${cookieValue}'`)
    }
    return this
  }

  /**
   * Assert response is a redirect
   */
  expectRedirect(url?: string): TestResponseWrapper {
    if (this.status < 300 || this.status >= 400) {
      throw new Error(`Expected redirect status (3xx), got ${this.status}`)
    }
    if (url) {
      const location = this.headers.location
      if (location !== url) {
        throw new Error(`Expected redirect to '${url}', got '${location}'`)
      }
    }
    return this
  }

  /**
   * Assert response contains validation errors
   */
  expectValidationError(field?: string, message?: string): TestResponseWrapper {
    if (this.status !== 422) {
      throw new Error(`Expected validation error status (422), got ${this.status}`)
    }

    if (field) {
      const errors = this.json?.errors || this.json?.message
      if (!errors || !errors[field]) {
        throw new Error(`Expected validation error for field '${field}'`)
      }

      if (message) {
        const fieldErrors = Array.isArray(errors[field]) ? errors[field] : [errors[field]]
        if (!fieldErrors.includes(message)) {
          throw new Error(`Expected validation error message '${message}' for field '${field}'`)
        }
      }
    }
    return this
  }

  /**
   * Assert response content type
   */
  expectContentType(contentType: string): TestResponseWrapper {
    const actualContentType = this.headers['content-type']
    if (!actualContentType || !actualContentType.includes(contentType)) {
      throw new Error(`Expected content type '${contentType}', got '${actualContentType}'`)
    }
    return this
  }

  /**
   * Assert response body contains text
   */
  expectBodyContains(text: string): TestResponseWrapper {
    if (!this.text.includes(text)) {
      throw new Error(`Expected body to contain '${text}'`)
    }
    return this
  }

  /**
   * Assert response body matches regex
   */
  expectBodyMatches(pattern: RegExp): TestResponseWrapper {
    if (!pattern.test(this.text)) {
      throw new Error(`Expected body to match pattern ${pattern}`)
    }
    return this
  }

  /**
   * Assert response JSON has specific structure
   */
  expectJsonStructure(structure: any): TestResponseWrapper {
    this.validateStructure(this.json, structure, 'root')
    return this
  }

  private validateStructure(data: any, structure: any, path: string): void {
    // Handle expect.any() matchers - they have a $$typeof property
    if (structure && typeof structure === 'object' && structure.$$typeof) {
      // This is an expect.any() matcher, skip validation
      return
    }

    if (Array.isArray(structure)) {
      if (!Array.isArray(data)) {
        throw new TypeError(`Expected ${path} to be an array`)
      }
      if (structure.length > 0 && data.length > 0) {
        this.validateStructure(data[0], structure[0], `${path}[0]`)
      }
    }
    else if (typeof structure === 'object' && structure !== null) {
      if (typeof data !== 'object' || data === null) {
        throw new Error(`Expected ${path} to be an object`)
      }
      Object.keys(structure).forEach((key) => {
        if (!(key in data)) {
          throw new Error(`Expected ${path} to have property '${key}'`)
        }
        this.validateStructure(data[key], structure[key], `${path}.${key}`)
      })
    }
  }

  /**
   * Get the original Response object
   */
  getOriginalResponse(): Response {
    return this.originalResponse
  }

  /**
   * Convert to JSON for easy inspection
   */
  toJSON(): any {
    return {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
      body: this.body,
      json: this.json,
      cookies: this.cookies,
      redirected: this.redirected,
      url: this.url,
      ok: this.ok,
      type: this.type,
    }
  }
}

/**
 * Create a test response from a Response object
 */
export async function createTestResponse(response: Response): Promise<TestResponseWrapper> {
  const body = await response.text()
  return new TestResponseWrapper(response, body)
}

/**
 * Create a mock response for testing
 */
export function createMockResponse(
  status: number = 200,
  body?: any,
  headers?: Record<string, string>,
): TestResponseWrapper {
  const responseHeaders = new Headers(headers)

  if (body && typeof body === 'object' && !responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/json')
  }

  const response = new Response(
    body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
    {
      status,
      headers: responseHeaders,
    },
  )

  return new TestResponseWrapper(response, body)
}
