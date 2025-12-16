import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export default class Cors {
  private getCorsHeaders(): Record<string, string> {
    const corsConfig = config.server?.cors || {}
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': typeof corsConfig.origin === 'string'
        ? corsConfig.origin
        : '*',
      'Access-Control-Allow-Methods': Array.isArray(corsConfig.methods)
        ? corsConfig.methods.join(', ')
        : 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': corsConfig.allowedHeaders?.length
        ? corsConfig.allowedHeaders.join(', ')
        : 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': (corsConfig.maxAge || 86400).toString(),
    }

    if (corsConfig.credentials) {
      headers['Access-Control-Allow-Credentials'] = 'true'
    }

    if (corsConfig.exposedHeaders && corsConfig.exposedHeaders.length > 0) {
      headers['Access-Control-Expose-Headers'] = corsConfig.exposedHeaders.join(', ')
    }

    return headers
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const corsConfig = config.server?.cors || {}
    const corsHeaders = this.getCorsHeaders()

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // If CORS is disabled, continue to next middleware
    if (!corsConfig.enabled) {
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }

    try {
      // For non-OPTIONS requests, add CORS headers to the response
      const response = await next()
      if (!response) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Read body as text to avoid stream consumption issues
      const body = await response.text()
      const newHeaders = new Headers(response.headers)

      // Set CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value)
      })

      // Return new response with CORS headers
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    }
    catch (error) {
      // Error occurred - return error response WITH CORS headers
      console.error('[CORS] Error in middleware chain:', error)
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }
}
