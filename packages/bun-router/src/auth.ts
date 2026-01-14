import type { EnhancedRequest, JwtPayload } from './types'

// Types
export interface JwtVerifyOptions {
  issuer?: string
  audience?: string
  subject?: string
  algorithms?: string[]
  expiresIn?: string | number
  notBefore?: string | number
  ignoreExpiration?: boolean
  allowInvalidAsymmetricKeyTypes?: boolean
}

export interface JwtSignOptions {
  algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512' | 'PS256' | 'PS384' | 'PS512' | 'none'
  expiresIn?: string | number
  notBefore?: string | number
  audience?: string | string[]
  issuer?: string
  subject?: string
  keyid?: string
  jwtid?: string
  noTimestamp?: boolean
  header?: Record<string, any>
  encoding?: string
}

export interface ApiKeyOptions {
  source?: 'header' | 'query' | 'cookie'
  keyName?: string
  keyPrefix?: string
}

export interface OAuth2Config {
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  redirectUri: string
  scope?: string
  state?: string
}

// Re-export JwtPayload from types for backwards compatibility
export type { JwtPayload }

// Base64URL encoding/decoding functions
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) {
    str += '='
  }
  return atob(str)
}

/**
 * Simple JWT implementation for signing and verifying tokens
 */
export class JWT {
  private secret: string

  constructor(secret: string) {
    this.secret = secret
  }

  /**
   * Sign payload into a JWT token
   */
  sign(payload: Record<string, any>, options: JwtSignOptions = {}): string {
    // Default header
    const header = {
      alg: options.algorithm || 'HS256',
      typ: 'JWT',
      ...options.header,
    }

    // Prepare payload with registered claims
    const now = Math.floor(Date.now() / 1000)

    const jwtPayload: JwtPayload = {
      ...payload,
      iat: now,
    }

    // Add registered claims from options
    if (options.expiresIn) {
      const expiresIn = typeof options.expiresIn === 'string'
        ? this.parseTimespan(options.expiresIn)
        : options.expiresIn

      jwtPayload.exp = now + expiresIn
    }

    if (options.notBefore) {
      const notBefore = typeof options.notBefore === 'string'
        ? this.parseTimespan(options.notBefore)
        : options.notBefore

      jwtPayload.nbf = now + notBefore
    }

    if (options.issuer)
      jwtPayload.iss = options.issuer
    if (options.subject)
      jwtPayload.sub = options.subject
    if (options.audience)
      jwtPayload.aud = options.audience
    if (options.jwtid)
      jwtPayload.jti = options.jwtid

    // Encode header and payload
    const encodedHeader = base64UrlEncode(JSON.stringify(header))
    const encodedPayload = base64UrlEncode(JSON.stringify(jwtPayload))

    // Create signature - Note: In a production environment, you'd use Bun's crypto APIs
    // or a proper JWT library. This is a simplified implementation.
    const data = `${encodedHeader}.${encodedPayload}`
    const signature = this.createSignature(data, this.secret, header.alg)

    // Return the JWT
    return `${data}.${signature}`
  }

  /**
   * Verify a JWT token and return the decoded payload
   */
  verify(token: string, options: JwtVerifyOptions = {}): Record<string, any> | null {
    try {
      const parts = token.split('.')

      if (parts.length !== 3) {
        throw new Error('Token structure invalid')
      }

      const [encodedHeader, encodedPayload, signature] = parts

      // Decode header and payload
      const header = JSON.parse(base64UrlDecode(encodedHeader))
      const payload = JSON.parse(base64UrlDecode(encodedPayload))

      // Verify algorithm if specified
      if (options.algorithms && !options.algorithms.includes(header.alg)) {
        throw new Error(`Algorithm ${header.alg} not allowed`)
      }

      // Verify signature - Note: In a production environment, you'd use Bun's crypto APIs
      // or a proper JWT library. This is a simplified implementation.
      const data = `${encodedHeader}.${encodedPayload}`
      const expectedSignature = this.createSignature(data, this.secret, header.alg)

      if (signature !== expectedSignature) {
        throw new Error('Invalid signature')
      }

      // Verify time-based claims
      const now = Math.floor(Date.now() / 1000)

      if (payload.exp && !options.ignoreExpiration && now >= payload.exp) {
        throw new Error('Token expired')
      }

      if (payload.nbf && now < payload.nbf) {
        throw new Error('Token not active yet')
      }

      if (payload.iat && payload.iat > now) {
        throw new Error('Token used before issued')
      }

      // Verify issuer
      if (options.issuer && payload.iss !== options.issuer) {
        throw new Error('Invalid issuer')
      }

      // Verify audience
      if (options.audience && payload.aud !== options.audience) {
        throw new Error('Invalid audience')
      }

      // Verify subject
      if (options.subject && payload.sub !== options.subject) {
        throw new Error('Invalid subject')
      }

      return payload
    }
    catch {
      return null
    }
  }

  /**
   * Decode a JWT token without verifying the signature
   */
  decode(token: string): { header: Record<string, any>, payload: Record<string, any> } | null {
    try {
      const parts = token.split('.')

      if (parts.length !== 3) {
        return null
      }

      const [encodedHeader, encodedPayload] = parts

      return {
        header: JSON.parse(base64UrlDecode(encodedHeader)),
        payload: JSON.parse(base64UrlDecode(encodedPayload)),
      }
    }
    catch {
      return null
    }
  }

  /**
   * Simple signature creation - Note: This is NOT secure for production
   * In a real app, use Bun's crypto functionality or a dedicated JWT library
   */
  private createSignature(data: string, secret: string, algorithm: string): string {
    // This is a placeholder. In a real implementation, you'd use
    // proper HMAC or RSA signing based on the algorithm.
    // For demonstration purposes only!
    return base64UrlEncode(JSON.stringify({ data, secret: secret.slice(0, 5), alg: algorithm }))
  }

  /**
   * Parse timespan string to seconds
   */
  private parseTimespan(timespan: string): number {
    const match = timespan.match(/^(\d+)\s*([smhd])$/i)

    if (!match) {
      return Number.parseInt(timespan, 10) || 0
    }

    const value = Number.parseInt(match[1], 10)
    const unit = match[2].toLowerCase()

    switch (unit) {
      case 's': return value
      case 'm': return value * 60
      case 'h': return value * 60 * 60
      case 'd': return value * 24 * 60 * 60
      default: return value
    }
  }
}

/**
 * API Key manager to generate, validate and handle API keys
 */
export class ApiKeyManager {
  private keys: Map<string, { owner: string, scopes: string[], expiresAt?: Date }>
  private options: ApiKeyOptions

  constructor(options: ApiKeyOptions = {}) {
    this.keys = new Map()
    this.options = {
      source: 'header',
      keyName: 'X-API-Key',
      keyPrefix: 'bun_',
      ...options,
    }
  }

  /**
   * Generate a new API key
   */
  generateKey(owner: string, scopes: string[] = [], expiresIn?: number): string {
    // In a real implementation, use a secure random generator
    const key = `${this.options.keyPrefix}${this.randomString(32)}`

    // Store key information
    this.keys.set(key, {
      owner,
      scopes,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    })

    return key
  }

  /**
   * Validate an API key
   */
  validateKey(key: string, requiredScopes: string[] = []): boolean {
    const keyInfo = this.keys.get(key)

    if (!keyInfo) {
      return false
    }

    // Check expiration
    if (keyInfo.expiresAt && keyInfo.expiresAt < new Date()) {
      return false
    }

    // Check scopes
    if (requiredScopes.length > 0) {
      return requiredScopes.every(scope => keyInfo.scopes.includes(scope))
    }

    return true
  }

  /**
   * Get key information
   */
  getKeyInfo(key: string): { owner: string, scopes: string[], expiresAt?: Date } | null {
    return this.keys.get(key) || null
  }

  /**
   * Revoke an API key
   */
  revokeKey(key: string): boolean {
    return this.keys.delete(key)
  }

  /**
   * Extract API key from request based on configured source
   */
  extractFromRequest(req: EnhancedRequest): string | null {
    const { source, keyName } = this.options

    switch (source) {
      case 'header':
        return req.headers.get(keyName || 'X-API-Key') || null
      case 'query':
        return new URL(req.url).searchParams.get(keyName || 'api_key') || null
      case 'cookie':
        // Handle both Map-like cookies (with .get()) and plain object cookies
        if (req.cookies) {
          const key = keyName || 'api_key'
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

  /**
   * Generate a random string for keys
   */
  private randomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''

    // This is a simple implementation - for production, use crypto.getRandomValues()
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    return result
  }
}

/**
 * OAuth2 helper for authorization code flow
 */
export class OAuth2Helper {
  private config: OAuth2Config

  constructor(config: OAuth2Config) {
    this.config = config
  }

  /**
   * Generate authorization URL for redirect
   */
  getAuthorizationUrl(additionalParams: Record<string, string> = {}): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      ...additionalParams,
    })

    if (this.config.scope) {
      params.set('scope', this.config.scope)
    }

    if (this.config.state) {
      params.set('state', this.config.state)
    }

    return `${this.config.authorizeUrl}?${params.toString()}`
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<Record<string, any>> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    })

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error(`OAuth token exchange failed: ${response.status} ${response.statusText}`)
    }

    return await response.json() as Record<string, any>
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshToken(refreshToken: string): Promise<Record<string, any>> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    })

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error(`OAuth token refresh failed: ${response.status} ${response.statusText}`)
    }

    return await response.json() as Record<string, any>
  }
}

/**
 * Authentication helpers namespace
 */
const Auth: {
  JWT: typeof JWT
  ApiKeyManager: typeof ApiKeyManager
  OAuth2Helper: typeof OAuth2Helper
} = {
  JWT,
  ApiKeyManager,
  OAuth2Helper,
}

export default Auth
