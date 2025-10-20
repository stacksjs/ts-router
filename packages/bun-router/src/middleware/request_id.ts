import type { EnhancedRequest, NextFunction } from '../types'
import { randomUUID } from 'node:crypto'

export default class RequestId {
  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    // Check if there's already a request ID in the headers
    const requestId = req.headers.get('X-Request-ID') || randomUUID()

    // Store the request ID on the request object
    Object.defineProperty(req, 'requestId', {
      value: requestId,
      writable: false,
      enumerable: true,
      configurable: false,
    })

    // Continue to next middleware
    const response = await next()

    // Add request ID to response headers
    if (!response) {
      return new Response('Not Found', { status: 404 })
    }
    const newHeaders = new Headers(response.headers)
    if (!newHeaders.has('X-Request-ID')) {
      newHeaders.set('X-Request-ID', requestId)
    }

    // Return modified response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }
}
