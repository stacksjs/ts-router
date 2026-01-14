import type { EnhancedRequest, Middleware, NextFunction } from '../types'

export interface AuthOptions {
  /**
   * Authentication type to use
   */
  type: 'basic' | 'bearer' | 'api-key' | 'oauth2' | 'jwt' | 'custom'

  /**
   * Function to validate credentials
   */
  validator: (credentials: any, req: EnhancedRequest) => Promise<boolean> | boolean

  /**
   * Extract user information after successful authentication
   */
  userExtractor?: (credentials: any, req: EnhancedRequest) => Promise<any> | any

  /**
   * Where to look for auth information
   */
  source?: 'header' | 'query' | 'cookie'

  /**
   * Key name for the source (header name, query param, cookie name)
   */
  key?: string

  /**
   * Realm for Basic authentication
   */
  realm?: string

  /**
   * Custom credentials extractor
   */
  credentialsExtractor?: (req: EnhancedRequest) => Promise<any> | any

  /**
   * Whether to attach user info to request
   */
  attachUser?: boolean
}

/**
 * Extracts and decodes Basic Auth credentials from Authorization header
 */
export function extractBasicAuth(authHeader: string): { username: string, password: string } | null {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null
  }

  try {
    const base64Credentials = authHeader.split(' ')[1]
    const credentials = atob(base64Credentials)
    const [username, password] = credentials.split(':')

    return { username, password }
  }
  catch (error) {
    console.error(error)
    return null
  }
}

/**
 * Extracts Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  return authHeader.split(' ')[1]
}

/**
 * Extracts API key from various sources
 */
export function extractApiKey(req: EnhancedRequest, source: 'header' | 'query' | 'cookie' = 'header', key: string = 'X-API-Key'): string | null {
  switch (source) {
    case 'header':
      return req.headers.get(key) || null
    case 'query':
      return new URL(req.url).searchParams.get(key)
    case 'cookie':
      // Handle both Map-like cookies (with .get()) and plain object cookies
      if (req.cookies) {
        if (typeof req.cookies.get === 'function') {
          return req.cookies.get(key) || null
        }
        return (req.cookies as unknown as Record<string, string>)[key] || null
      }
      return null
    default:
      return null
  }
}

export default class AuthMiddleware implements Middleware {
  private options: AuthOptions

  constructor(options: AuthOptions) {
    this.options = {
      source: 'header',
      key: 'Authorization',
      attachUser: true,
      ...options,
    }
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    let credentials: any = null

    // Extract credentials based on auth type
    if (this.options.credentialsExtractor) {
      credentials = await this.options.credentialsExtractor(req)
    }
    else {
      switch (this.options.type) {
        case 'basic': {
          const authHeader = req.headers.get(this.options.key || 'Authorization')
          credentials = extractBasicAuth(authHeader || '')
          break
        }
        case 'bearer':
        case 'jwt': {
          const authHeader = req.headers.get(this.options.key || 'Authorization')
          credentials = extractBearerToken(authHeader || '')
          break
        }
        case 'api-key': {
          credentials = extractApiKey(req, this.options.source, this.options.key)
          break
        }
        case 'oauth2': {
          // OAuth tokens are typically sent as Bearer tokens
          const authHeader = req.headers.get(this.options.key || 'Authorization')
          credentials = extractBearerToken(authHeader || '')
          break
        }
      }
    }

    // If no credentials were found, return 401
    if (!credentials) {
      const headers: Record<string, string> = {}

      // For Basic auth, include WWW-Authenticate header
      if (this.options.type === 'basic') {
        const realm = this.options.realm || 'Secure Area'
        headers['WWW-Authenticate'] = `Basic realm="${realm}"`
      }

      return new Response('Unauthorized', {
        status: 401,
        headers,
      })
    }

    // Validate credentials
    const isValid = await this.options.validator(credentials, req)

    if (!isValid) {
      return new Response('Unauthorized', { status: 401 })
    }

    // If user extractor provided and attachUser is true, attach user to request
    if (this.options.userExtractor && this.options.attachUser) {
      const user = await this.options.userExtractor(credentials, req)
      ;(req as any).user = user
    }

    // Authentication successful, continue to next middleware or route handler
    const response = await next()
    return response || new Response('Not Found', { status: 404 })
  }
}

// Convenience factory functions for common auth types
export function basicAuth(validator: (credentials: { username: string, password: string }, req: EnhancedRequest) => Promise<boolean> | boolean, options: Partial<AuthOptions> = {}): AuthMiddleware {
  return new AuthMiddleware({
    type: 'basic',
    validator,
    ...options,
  })
}

export function bearerAuth(validator: (token: string, req: EnhancedRequest) => Promise<boolean> | boolean, options: Partial<AuthOptions> = {}): AuthMiddleware {
  return new AuthMiddleware({
    type: 'bearer',
    validator,
    ...options,
  })
}

export function jwtAuth(validator: (token: string, req: EnhancedRequest) => Promise<boolean> | boolean, options: Partial<AuthOptions> = {}): AuthMiddleware {
  return new AuthMiddleware({
    type: 'jwt',
    validator,
    ...options,
  })
}

export function apiKeyAuth(validator: (apiKey: string, req: EnhancedRequest) => Promise<boolean> | boolean, options: Partial<AuthOptions> = {}): AuthMiddleware {
  return new AuthMiddleware({
    type: 'api-key',
    validator,
    ...options,
  })
}

export function oauth2Auth(validator: (token: string, req: EnhancedRequest) => Promise<boolean> | boolean, options: Partial<AuthOptions> = {}): AuthMiddleware {
  return new AuthMiddleware({
    type: 'oauth2',
    validator,
    ...options,
  })
}
