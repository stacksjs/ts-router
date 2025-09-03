import type { EnhancedRequest, NextFunction } from '../types'
import { createHash, randomBytes } from 'node:crypto'
import { config } from '../config'

export default class Csrf {
  private static tokens = new Map<string, string>()

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const csrfConfig = config.server?.security?.csrf || {} as any

    // Skip CSRF protection for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }

    // Skip for methods that don't modify state
    const method = req.method.toUpperCase()
    const ignoredMethods = ['GET', 'HEAD', 'OPTIONS', ...(csrfConfig?.ignoreMethods || [])]

    if (ignoredMethods.includes(method)) {
      // For safe methods, generate a new token for the response
      const token = this.generateToken(csrfConfig?.secret || 'csrf-secret')

      // Continue to next middleware
      const response = await next()
      if (!response) {
        return new Response('Not Found', { status: 404 })
      }

      // Add CSRF token cookie to response
      const cookieName = csrfConfig?.cookie?.name || 'csrf-token'
      const cookieOptions = []

      cookieOptions.push(`${cookieName}=${token}`)
      cookieOptions.push('Path=/')

      if (csrfConfig?.cookie?.options?.httpOnly) {
        cookieOptions.push('HttpOnly')
      }

      if (csrfConfig?.cookie?.options?.secure) {
        cookieOptions.push('Secure')
      }

      if (csrfConfig?.cookie?.options?.sameSite) {
        cookieOptions.push(`SameSite=${csrfConfig.cookie.options.sameSite}`)
      }

      const newHeaders = new Headers(response.headers)
      newHeaders.append('Set-Cookie', cookieOptions.join('; '))

      // Store token for verification
      Csrf.tokens.set(token, token)

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    }

    // For unsafe methods, verify the CSRF token
    // Check for token in headers or in the request body
    const token = req.headers.get('X-CSRF-TOKEN')
      || req.jsonBody?.csrf_token
      || req.jsonBody?._token
      || null

    // Get token from cookies for comparison
    const cookies = this.parseCookies(req)
    const cookieToken = cookies[csrfConfig?.cookie?.name || 'csrf-token']

    // Verify the token
    if (!token || !cookieToken || token !== cookieToken || !Csrf.tokens.has(token)) {
      return new Response(
        JSON.stringify({ error: 'CSRF token validation failed' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Continue to next middleware if token is valid
    const response = await next()
    return response || new Response('Not Found', { status: 404 })
  }

  private generateToken(secret: string): string {
    const randomString = randomBytes(16).toString('hex')
    return createHash('sha256')
      .update(`${randomString}${secret}`)
      .digest('hex')
  }

  private parseCookies(req: Request): Record<string, string> {
    const cookieHeader = req.headers.get('cookie')
    if (!cookieHeader)
      return {}

    return cookieHeader.split(';').reduce((cookies, cookie) => {
      const [name, value] = cookie.trim().split('=')
      cookies[name] = value
      return cookies
    }, {} as Record<string, string>)
  }
}
