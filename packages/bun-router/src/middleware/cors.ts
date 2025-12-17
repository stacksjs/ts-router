import type { EnhancedRequest, NextFunction } from '../types'

// Hardcoded CORS headers - no config dependency
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
}

export default class Cors {
  private getCorsHeaders(): Record<string, string> {
    return { ...CORS_HEADERS }
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const corsHeaders = this.getCorsHeaders()

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // Helper to add CORS headers to any response
    const addCorsHeaders = (response: Response): Response => {
      const newHeaders = new Headers(response.headers)
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value)
      })
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
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

      // Add CORS headers to the response
      return addCorsHeaders(response)
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
