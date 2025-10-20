import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export default class Cors {
  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const corsConfig = config.server?.cors || {}

    // If CORS is disabled, continue to next middleware
    if (!corsConfig.enabled) {
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': typeof corsConfig.origin === 'string'
          ? corsConfig.origin
          : '*',
        'Access-Control-Allow-Methods': Array.isArray(corsConfig.methods)
          ? corsConfig.methods.join(', ')
          : 'GET, POST, PUT, DELETE, PATCH',
        'Access-Control-Max-Age': (corsConfig.maxAge || 86400).toString(),
      }

      // Add allowed headers
      if (corsConfig.allowedHeaders && corsConfig.allowedHeaders.length > 0) {
        headers['Access-Control-Allow-Headers'] = corsConfig.allowedHeaders.join(', ')
      }

      // Add exposed headers
      if (corsConfig.exposedHeaders && corsConfig.exposedHeaders.length > 0) {
        headers['Access-Control-Expose-Headers'] = corsConfig.exposedHeaders.join(', ')
      }

      // Add credentials if enabled
      if (corsConfig.credentials) {
        headers['Access-Control-Allow-Credentials'] = 'true'
      }

      return new Response(null, { status: 204, headers })
    }

    // For non-OPTIONS requests, create a new response after handling the request
    const response = await next()
    if (!response) {
      return new Response('Not Found', { status: 404 })
    }
    const newHeaders = new Headers(response.headers)

    // Set CORS headers
    newHeaders.set('Access-Control-Allow-Origin', typeof corsConfig.origin === 'string'
      ? corsConfig.origin
      : '*')

    if (corsConfig.credentials) {
      newHeaders.set('Access-Control-Allow-Credentials', 'true')
    }

    if (corsConfig.exposedHeaders && corsConfig.exposedHeaders.length > 0) {
      newHeaders.set('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '))
    }

    // Return new response with CORS headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }
}
