import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export default class Session {
  // Simple in-memory session store
  private static sessions: Map<string, any> = new Map()

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const sessionConfig = config.server?.security?.auth?.session

    // Initialize an empty session object
    req.session = {}

    // Get session ID from cookie if it exists
    let sessionId = req.cookies?.get?.(sessionConfig?.name || 'session')

    // If there's a session ID, retrieve the session data
    if (sessionId && Session.sessions.has(sessionId)) {
      req.session = Session.sessions.get(sessionId)
    }
    else {
      // Create a new session ID
      sessionId = this.generateSessionId()
    }

    // Continue to next middleware
    const response = await next()

    // Store session data
    Session.sessions.set(sessionId, req.session)

    // Set session cookie
    if (req.cookies && typeof req.cookies.set === 'function') {
      const cookieOptions: any = {
        maxAge: sessionConfig?.cookie?.maxAge || 86400000,
        path: sessionConfig?.cookie?.path || '/',
      }

      if (sessionConfig?.cookie?.httpOnly) {
        cookieOptions.httpOnly = true
      }

      if (sessionConfig?.cookie?.secure) {
        cookieOptions.secure = true
      }

      if (sessionConfig?.cookie?.sameSite) {
        cookieOptions.sameSite = sessionConfig.cookie.sameSite
      }

      req.cookies.set(sessionConfig?.name || 'session', sessionId, cookieOptions)
    }

    return response || new Response('Not Found', { status: 404 })
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

  private generateSessionId(): string {
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)).join('')
  }
}
