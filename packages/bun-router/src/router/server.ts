import type { Server } from 'bun'
import type { EnhancedRequest, HTTPMethod, ServerOptions } from '../types'
import type { Router } from './router'

/**
 * Server handling extension for Router class
 */
export function registerServerHandling(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Start the HTTP server
     */
    serve: {
      async value(options: ServerOptions = {}): Promise<Server<any>> {
        // Initialize automatic file-based routing (discovers views from src/views, views, etc.)
        if (this._initFileRoutes) {
          await this._initFileRoutes()
        }

        // Invalidate route cache before starting server
        this.invalidateCache()

        // Create server options
        const serverOptions: any = {
          idleTimeout: 255, // Max allowed timeout (255 seconds)
          ...options,
          fetch: this.handleRequest.bind(this),
        }

        // Apply WebSocket configuration if provided
        if (this.wsConfig) {
          serverOptions.websocket = this.wsConfig
        }

        // Start the server
        this.serverInstance = Bun.serve(serverOptions)

        if (this.config.verbose) {
          const port = this.serverInstance.port
          const hostname = this.serverInstance.hostname
          console.log(`\n🚀 Server running at http://${hostname}:${port}\n`)
        }

        return this.serverInstance
      },
      writable: true,
      configurable: true,
    },

    /**
     * Reload the HTTP server
     */
    reload: {
      async value(): Promise<void> {
        if (!this.serverInstance) {
          throw new Error('Server not started, cannot reload')
        }

        // Invalidate route cache before reloading
        this.invalidateCache()

        // Save the current server port and hostname
        const port = this.serverInstance.port
        const hostname = this.serverInstance.hostname

        // Close the current server
        this.serverInstance.stop()

        // Start a new server with the same configuration
        this.serverInstance = Bun.serve({
          port,
          hostname,
          fetch: this.handleRequest.bind(this),
          websocket: this.wsConfig || undefined,
        })

        if (this.config.verbose) {
          console.log(`🔄 Server reloaded at http://${hostname}:${port}`)
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Handle HTTP requests
     */
    handleRequest: {
      async value(req: Request): Promise<Response> {
        try {
          // Create URL for route matching
          const url = new URL(req.url)

          // Handle CORS preflight OPTIONS requests - but check for registered OPTIONS routes first
          // This ensures explicitly registered OPTIONS routes work while still providing CORS support
          if (req.method === 'OPTIONS') {
            const hostname = url.hostname || req.headers.get('host')?.split(':')[0] || 'localhost'
            const optionsMatch = this.matchRoute(url.pathname, 'OPTIONS', hostname)
            if (!optionsMatch) {
              // No explicit OPTIONS route - return generic CORS preflight response
              return new Response(null, {
                status: 204,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
                  'Access-Control-Max-Age': '86400',
                  'Access-Control-Allow-Credentials': 'true',
                },
              })
            }
            // Let the registered OPTIONS route handle it (fall through to normal route matching)
          }

          // Get domain from the host header
          const hostname = url.hostname || req.headers.get('host')?.split(':')[0] || 'localhost'

          // Find a matching route
          const match = this.matchRoute(url.pathname, req.method as HTTPMethod, hostname)

          // Enhance the request with params and other utilities
          const enhancedReq = this.enhanceRequest(req, match?.params || {})

          if (match) {
            // Add the matched route to the request
            enhancedReq.route = match.route

            // Collect all middleware to run
            const middlewareStack = [...this.globalMiddleware]

            // Add route-specific middleware
            if (match.route.middleware && match.route.middleware.length > 0) {
              middlewareStack.push(...match.route.middleware)
            }

            // Create a final middleware that executes the route handler
            const routeHandlerMiddleware = async (req: EnhancedRequest, _next: any) => {
              return await this.resolveHandler(match.route.handler, req)
            }

            // Add the route handler as the final middleware
            middlewareStack.push(routeHandlerMiddleware)

            // Run middleware stack with the route handler at the end
            const response = await this.runMiddleware(enhancedReq, middlewareStack)

            // Apply modified cookies to the response
            if (response) {
              return this.applyModifiedCookies(response, enhancedReq)
            }

            // This should not happen since we're always returning a response now
            return new Response('No response from middleware chain', { status: 500 })
          }

          // No route found - check if the path exists with a different method (405 vs 404)
          const allowedMethods = this.getAllowedMethods(url.pathname, hostname)

          // If there are allowed methods, return 405 Method Not Allowed
          if (allowedMethods.length > 0) {
            return new Response(JSON.stringify({ success: false, message: 'Method Not Allowed' }), {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                'Allow': allowedMethods.join(', '),
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
              },
            })
          }

          // No route found, try the fallback handler
          if (this.fallbackHandler) {
            const response = await this.resolveHandler(this.fallbackHandler, enhancedReq)
            return this.applyModifiedCookies(response, enhancedReq)
          }

          // No fallback handler, return a 404 with CORS headers
          return new Response(JSON.stringify({ success: false, message: 'Not Found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
            },
          })
        }
        catch (error) {
          console.error('Error handling request:', error)

          // Use custom error handler if available
          if (this.errorHandler) {
            return this.errorHandler(error as Error)
          }

          // Default error response with CORS headers
          return new Response(JSON.stringify({
            success: false,
            message: 'Internal Server Error',
            error: error instanceof Error ? error.message : String(error),
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
            },
          })
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Enhance a request with params and other utilities
     */
    enhanceRequest: {
      value(req: Request, params: Record<string, string> = {}): EnhancedRequest {
        // Lazy cookie parsing
        let parsedCookies: Record<string, string> | null = null

        const getCookies = () => {
          if (parsedCookies === null) {
            parsedCookies = {}
            const cookieHeader = req.headers.get('cookie') || ''

            cookieHeader.split(';').forEach((cookie) => {
              const parts = cookie.trim().split('=')
              if (parts.length >= 2) {
                const name = parts[0].trim()
                const value = parts.slice(1).join('=').trim()
                parsedCookies![name] = decodeURIComponent(value)
              }
            })
          }
          return parsedCookies
        }

        // Create cookie utilities with lazy parsing
        const cookies = {
          get: (name: string) => getCookies()[name],
          set: (name: string, value: string, options: any = {}) => {
            const enhancedRequest = req as EnhancedRequest
            if (!enhancedRequest._cookiesToSet) {
              enhancedRequest._cookiesToSet = []
            }
            enhancedRequest._cookiesToSet.push({ name, value, options })
          },
          delete: (name: string, options: any = {}) => {
            const enhancedRequest = req as EnhancedRequest
            if (!enhancedRequest._cookiesToDelete) {
              enhancedRequest._cookiesToDelete = []
            }
            enhancedRequest._cookiesToDelete.push({ name, options })
          },
          getAll: () => ({ ...getCookies() }),
        }

        // Create enhanced request
        const enhancedReq = Object.assign(req, {
          params,
          cookies: getCookies(), // Set cookies as plain object for direct access
          _cookiesToSet: [],
          _cookiesToDelete: [],
        }) as unknown as EnhancedRequest

        // Add cookie methods to the request
        Object.assign(enhancedReq, { cookies: { ...getCookies(), ...cookies } })

        return enhancedReq
      },
      writable: true,
      configurable: true,
    },

    /**
     * Apply modified cookies to a response
     */
    applyModifiedCookies: {
      value(response: Response, req: EnhancedRequest): Response {
        // Clone the response to modify headers
        const newResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })

        // Apply cookies to set
        if (req._cookiesToSet && req._cookiesToSet.length > 0) {
          for (const { name, value, options } of req._cookiesToSet) {
            const cookieString = this.serializeCookie(name, value, options)
            newResponse.headers.append('Set-Cookie', cookieString)
          }
        }

        // Apply cookies to delete
        if (req._cookiesToDelete && req._cookiesToDelete.length > 0) {
          for (const { name, options } of req._cookiesToDelete) {
            const deletionOptions = {
              ...options,
              expires: new Date(0), // Set expiration to past date
              maxAge: 0,
            }
            const cookieString = this.serializeCookie(name, '', deletionOptions)
            newResponse.headers.append('Set-Cookie', cookieString)
          }
        }

        return newResponse
      },
      writable: true,
      configurable: true,
    },

    /**
     * Serialize a cookie for the Set-Cookie header
     */
    serializeCookie: {
      value(name: string, value: string, options: any = {}): string {
        let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

        if (options.maxAge !== undefined) {
          cookie += `; Max-Age=${options.maxAge}`
        }

        if (options.expires && options.expires instanceof Date) {
          cookie += `; Expires=${options.expires.toUTCString()}`
        }

        if (options.path) {
          cookie += `; Path=${options.path}`
        }
        else {
          cookie += '; Path=/'
        }

        if (options.domain) {
          cookie += `; Domain=${options.domain}`
        }

        if (options.secure) {
          cookie += '; Secure'
        }

        if (options.httpOnly) {
          cookie += '; HttpOnly'
        }

        if (options.sameSite) {
          const sameSite = options.sameSite.toLowerCase()
          cookie += `; SameSite=${sameSite.charAt(0).toUpperCase() + sameSite.slice(1)}`
        }

        return cookie
      },
      writable: true,
      configurable: true,
    },
  })
}
