import type { EnhancedRequest, NextFunction } from '../types'

export default class JsonBody {
  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    // Only process requests with application/json content type
    const contentType = req.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      try {
        // Clone the request since it can only be used once
        const clonedReq = req.clone()
        const body = await clonedReq.json()

        // Attach the parsed body to the request object
        Object.defineProperty(req, 'jsonBody', {
          value: body,
          writable: true,
          enumerable: true,
          configurable: true,
        })
      }
      catch {
        // If JSON parsing fails, return a 400 Bad Request
        return new Response(
          JSON.stringify({ error: 'Invalid JSON payload' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    }

    // Continue to next middleware
    const response = await next()
    return response || new Response('Not Found', { status: 404 })
  }
}
