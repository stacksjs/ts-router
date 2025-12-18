import type { CookieAccessor, CookieOptions, EnhancedRequest } from '../types'
import type { JWTTestOptions, SessionTestOptions, TestUser } from './types'
import { mock } from 'bun:test'
import { createMockRequest } from './test-request'

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
 * Authentication testing utilities
 */
export class AuthTester {
  private request: EnhancedRequest

  constructor(request?: EnhancedRequest) {
    this.request = request || createMockRequest()
  }

  /**
   * Set authenticated user
   */
  as(user: TestUser): AuthTester {
    this.request.user = user
    return this
  }

  /**
   * Set JWT token
   */
  withJWT(token: string, type: 'Bearer' | 'Basic' = 'Bearer'): AuthTester {
    const headers = new Headers(this.request.headers)
    headers.set('Authorization', `${type} ${token}`)
    // Create a new request object with updated headers
    this.request = {
      ...this.request,
      headers,
    }
    return this
  }

  /**
   * Set session data
   */
  withSession(sessionData: any): AuthTester {
    this.request.session = sessionData
    return this
  }

  /**
   * Set API key
   */
  withApiKey(apiKey: string, headerName: string = 'X-API-Key'): AuthTester {
    this.request.headers = this.request.headers || new Headers()
    this.request.headers.set(headerName, apiKey)
    return this
  }

  /**
   * Set basic auth credentials
   */
  withBasicAuth(username: string, password: string): AuthTester {
    const credentials = btoa(`${username}:${password}`)
    this.request.headers = this.request.headers || new Headers()
    this.request.headers.set('Authorization', `Basic ${credentials}`)
    return this
  }

  /**
   * Set cookies for authentication
   */
  withAuthCookies(cookies: Record<string, string>): AuthTester {
    const existingCookies = this.request.cookies?.getAll() || {}
    this.request.cookies = createCookieAccessor({ ...existingCookies, ...cookies })
    return this
  }

  /**
   * Remove authentication
   */
  unauthenticated(): AuthTester {
    this.request.user = undefined
    this.request.session = undefined
    if (this.request.headers) {
      this.request.headers.delete('Authorization')
    }
    return this
  }

  /**
   * Get the configured request
   */
  getRequest(): EnhancedRequest {
    return this.request
  }
}

/**
 * JWT testing utilities
 */
export class JWTTester {
  private options: JWTTestOptions

  constructor(options: JWTTestOptions = {}) {
    this.options = {
      secret: 'test-secret',
      expiresIn: '1h',
      algorithm: 'HS256',
      ...options,
    }
  }

  /**
   * Generate a test JWT token
   */
  generateToken(payload: Record<string, any> = {}): string {
    const header = {
      alg: this.options.algorithm,
      typ: 'JWT',
      ...this.options.headers,
    }

    const now = Math.floor(Date.now() / 1000)
    const exp = now + this.parseExpiresIn(this.options.expiresIn || '1h')

    const jwtPayload = {
      iat: now,
      exp,
      ...this.options.payload,
      ...payload,
    }

    // Simple JWT generation for testing (not cryptographically secure)
    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '')
    const encodedPayload = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '')
    const signature = btoa(`${encodedHeader}.${encodedPayload}.${this.options.secret}`).replace(/=/g, '')

    return `${encodedHeader}.${encodedPayload}.${signature}`
  }

  /**
   * Generate an expired token
   */
  generateExpiredToken(payload: Record<string, any> = {}): string {
    const header = {
      alg: this.options.algorithm,
      typ: 'JWT',
    }

    const now = Math.floor(Date.now() / 1000)
    const jwtPayload = {
      iat: now - 7200, // 2 hours ago
      exp: now - 3600, // 1 hour ago (expired)
      ...payload,
    }

    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '')
    const encodedPayload = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '')
    const signature = btoa(`${encodedHeader}.${encodedPayload}.${this.options.secret}`).replace(/=/g, '')

    return `${encodedHeader}.${encodedPayload}.${signature}`
  }

  /**
   * Generate an invalid token
   */
  generateInvalidToken(): string {
    return 'invalid.jwt.token'
  }

  /**
   * Decode a JWT token (for testing purposes)
   */
  decodeToken(token: string): { header: any, payload: any, signature: string } {
    const [header, payload, signature] = token.split('.')

    return {
      header: JSON.parse(atob(header)),
      payload: JSON.parse(atob(payload)),
      signature,
    }
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/)
    if (!match)
      return 3600 // Default 1 hour

    const value = Number.parseInt(match[1])
    const unit = match[2]

    switch (unit) {
      case 's': return value
      case 'm': return value * 60
      case 'h': return value * 3600
      case 'd': return value * 86400
      default: return 3600
    }
  }
}

/**
 * Session testing utilities
 */
export class SessionTester {
  private options: SessionTestOptions

  constructor(options: SessionTestOptions = {}) {
    this.options = {
      sessionId: `test-session-${Date.now()}`,
      maxAge: 3600000, // 1 hour
      secure: false,
      httpOnly: true,
      ...options,
    }
  }

  /**
   * Create a test session
   */
  createSession(data: Record<string, any> = {}): {
    sessionId: string
    data: Record<string, any>
    cookie: string
  } {
    const sessionData = {
      ...this.options.data,
      ...data,
    }

    const cookie = this.generateSessionCookie()

    return {
      sessionId: this.options.sessionId!,
      data: sessionData,
      cookie,
    }
  }

  /**
   * Generate session cookie string
   */
  generateSessionCookie(name: string = 'session'): string {
    const options = []

    if (this.options.maxAge) {
      options.push(`Max-Age=${Math.floor(this.options.maxAge / 1000)}`)
    }

    if (this.options.secure) {
      options.push('Secure')
    }

    if (this.options.httpOnly) {
      options.push('HttpOnly')
    }

    const optionsStr = options.length > 0 ? `; ${options.join('; ')}` : ''
    return `${name}=${this.options.sessionId}${optionsStr}`
  }

  /**
   * Create an expired session
   */
  createExpiredSession(): {
    sessionId: string
    data: Record<string, any>
    cookie: string
  } {
    const expiredOptions = {
      ...this.options,
      maxAge: -1, // Expired
    }

    const tester = new SessionTester(expiredOptions)
    return tester.createSession()
  }
}

/**
 * Authentication mock factories
 */
export const authMocks = {
  /**
   * Create a mock user
   */
  user: (overrides: Partial<TestUser> = {}): TestUser => ({
    id: 1,
    email: 'test@example.com',
    username: 'testuser',
    roles: ['user'],
    permissions: ['read'],
    ...overrides,
  }),

  /**
   * Create an admin user
   */
  adminUser: (overrides: Partial<TestUser> = {}): TestUser => ({
    id: 1,
    email: 'admin@example.com',
    username: 'admin',
    roles: ['admin'],
    permissions: ['read', 'write', 'delete'],
    ...overrides,
  }),

  /**
   * Create a guest user
   */
  guestUser: (): TestUser => ({
    id: 0,
    email: 'guest@example.com',
    username: 'guest',
    roles: ['guest'],
    permissions: [],
  }),

  /**
   * Mock authentication middleware
   */
  authMiddleware: (user?: TestUser): any => mock(async (req: EnhancedRequest, next: any): Promise<Response> => {
    if (user) {
      req.user = user
      return await next()
    }
    return new Response('Unauthorized', { status: 401 })
  }),

  /**
   * Mock role-based middleware
   */
  roleMiddleware: (requiredRoles: string[]): any => mock(async (req: EnhancedRequest, next: any): Promise<Response> => {
    if (!req.user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const userRoles = req.user.roles || []
    const hasRole = requiredRoles.some(role => userRoles.includes(role))

    if (!hasRole) {
      return new Response('Forbidden', { status: 403 })
    }

    return await next()
  }),

  /**
   * Mock permission-based middleware
   */
  permissionMiddleware: (requiredPermissions: string[]): any => mock(async (req: EnhancedRequest, next: any): Promise<Response> => {
    if (!req.user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const userPermissions = req.user.permissions || []
    const hasPermission = requiredPermissions.every(permission =>
      userPermissions.includes(permission),
    )

    if (!hasPermission) {
      return new Response('Forbidden', { status: 403 })
    }

    return await next()
  }),
}

/**
 * Helper functions
 */
export const authHelpers = {
  /**
   * Create an authenticated request
   */
  authenticatedRequest: (user: TestUser, request?: EnhancedRequest): EnhancedRequest => {
    return new AuthTester(request).as(user).getRequest()
  },

  /**
   * Create a request with JWT
   */
  jwtRequest: (payload: Record<string, any> = {}, request?: EnhancedRequest): EnhancedRequest => {
    const jwt = new JWTTester()
    const token = jwt.generateToken(payload)
    return new AuthTester(request).withJWT(token).getRequest()
  },

  /**
   * Create a request with session
   */
  sessionRequest: (sessionData: Record<string, any> = {}, request?: EnhancedRequest): EnhancedRequest => {
    return new AuthTester(request).withSession(sessionData).getRequest()
  },

  /**
   * Verify JWT token structure
   */
  verifyJWTStructure: (token: string): boolean => {
    const parts = token.split('.')
    return parts.length === 3 && parts.every(part => part.length > 0)
  },

  /**
   * Extract payload from JWT (for testing)
   */
  extractJWTPayload: (token: string): any => {
    try {
      const [, payload] = token.split('.')
      return JSON.parse(atob(payload))
    }
    catch {
      return null
    }
  },
}

/**
 * Factory functions
 */
export function createAuthTester(request?: EnhancedRequest): AuthTester {
  return new AuthTester(request)
}

export function createJWTTester(options?: JWTTestOptions): JWTTester {
  return new JWTTester(options)
}

export function createSessionTester(options?: SessionTestOptions): SessionTester {
  return new SessionTester(options)
}
