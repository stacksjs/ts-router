import type { EnhancedRequest, NextFunction } from '../src/types'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Router } from '../src/router/index'

describe('Router', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  describe('Route Registration', () => {
    it('should register a GET route', async () => {
      await router.get('/test', () => new Response('Test GET'))
      const response = await router.handleRequest(new Request('http://localhost/test'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test GET')
    })

    it('should register a POST route', async () => {
      await router.post('/test', () => new Response('Test POST'))
      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'POST' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test POST')
    })

    it('should register a PUT route', async () => {
      await router.put('/test', () => new Response('Test PUT'))
      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'PUT' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test PUT')
    })

    it('should register a PATCH route', async () => {
      await router.patch('/test', () => new Response('Test PATCH'))
      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'PATCH' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test PATCH')
    })

    it('should register a DELETE route', async () => {
      await router.delete('/test', () => new Response('Test DELETE'))
      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'DELETE' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test DELETE')
    })

    it('should register an OPTIONS route', async () => {
      await router.options('/test', () => new Response('Test OPTIONS'))
      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'OPTIONS' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test OPTIONS')
    })

    it('should match multiple HTTP methods', async () => {
      await router.match(['GET', 'POST'], '/multi', () => new Response('Multi'))

      const getResponse = await router.handleRequest(new Request('http://localhost/multi'))
      expect(getResponse.status).toBe(200)
      expect(await getResponse.text()).toBe('Multi')

      const postResponse = await router.handleRequest(new Request('http://localhost/multi', { method: 'POST' }))
      expect(postResponse.status).toBe(200)
      expect(await postResponse.text()).toBe('Multi')

      const putResponse = await router.handleRequest(new Request('http://localhost/multi', { method: 'PUT' }))
      expect(putResponse.status).toBe(404)
    })

    it('should register a route for any HTTP method', async () => {
      await router.any('/any', () => new Response('Any'))

      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

      for (const method of methods) {
        const response = await router.handleRequest(new Request('http://localhost/any', { method }))
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('Any')
      }
    })
  })

  describe('Route Parameters', () => {
    it('should handle route parameters', async () => {
      await router.get('/users/{id}', (req: EnhancedRequest) => {
        return new Response(`User ID: ${req.params.id}`)
      })

      const response = await router.handleRequest(new Request('http://localhost/users/123'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('User ID: 123')
    })

    it('should handle multiple route parameters', async () => {
      await router.get('/users/{userId}/posts/{postId}', (req: EnhancedRequest) => {
        return new Response(`User: ${req.params.userId}, Post: ${req.params.postId}`)
      })

      const response = await router.handleRequest(new Request('http://localhost/users/123/posts/456'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('User: 123, Post: 456')
    })

    it('should handle optional route parameters with constraints', async () => {
      await router.get('/products/{category}/{id?}', (req: EnhancedRequest) => {
        if (req.params.id) {
          return new Response(`Category: ${req.params.category}, Product: ${req.params.id}`)
        }
        return new Response(`Category: ${req.params.category}`)
      })

      const response1 = await router.handleRequest(new Request('http://localhost/products/electronics/123'))
      expect(response1.status).toBe(200)
      expect(await response1.text()).toBe('Category: electronics, Product: 123')

      const response2 = await router.handleRequest(new Request('http://localhost/products/electronics'))
      expect(response2.status).toBe(200)
      expect(await response2.text()).toBe('Category: electronics')
    })
  })

  describe('Route Groups', () => {
    it('should group routes with shared prefix', async () => {
      await router.group({ prefix: '/api' }, () => {
        router.get('/users', () => new Response('API Users'))
        router.get('/posts', () => new Response('API Posts'))
      })

      const usersResponse = await router.handleRequest(new Request('http://localhost/api/users'))
      expect(usersResponse.status).toBe(200)
      expect(await usersResponse.text()).toBe('API Users')

      const postsResponse = await router.handleRequest(new Request('http://localhost/api/posts'))
      expect(postsResponse.status).toBe(200)
      expect(await postsResponse.text()).toBe('API Posts')
    })

    it('should support nested groups', async () => {
      await router.group({ prefix: '/api' }, () => {
        router.get('', () => new Response('API Root'))

        router.group({ prefix: '/v1' }, () => {
          router.get('/users', () => new Response('API v1 Users'))
        })

        router.group({ prefix: '/v2' }, () => {
          router.get('/users', () => new Response('API v2 Users'))
        })
      })

      const rootResponse = await router.handleRequest(new Request('http://localhost/api'))
      expect(rootResponse.status).toBe(200)
      expect(await rootResponse.text()).toBe('API Root')

      const v1Response = await router.handleRequest(new Request('http://localhost/api/v1/users'))
      expect(v1Response.status).toBe(200)
      expect(await v1Response.text()).toBe('API v1 Users')

      const v2Response = await router.handleRequest(new Request('http://localhost/api/v2/users'))
      expect(v2Response.status).toBe(200)
      expect(await v2Response.text()).toBe('API v2 Users')
    })
  })

  describe('Middleware', () => {
    it('should apply global middleware', async () => {
      // Create a middleware that modifies the response
      const middleware = async (req: EnhancedRequest, next: NextFunction) => {
        // Call next to get the original response
        const response = await next()
        // Get the original text
        if (!response)
          return new Response('Not Found', { status: 404 })
        const originalText = await response.clone().text()
        const modifiedText = `Modified: ${originalText}`
        return new Response(modifiedText, {
          status: response.status,
          headers: response.headers,
        })
      }

      // Register the middleware and route
      await router.use(middleware)
      await router.get('/middleware-test', () => new Response('Test'))

      // Make the request
      const response = await router.handleRequest(new Request('http://localhost/middleware-test'))

      // Assert
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Modified: Test')
    })

    it('should apply group-specific middleware', async () => {
      const middleware = async (req: EnhancedRequest, next: NextFunction) => {
        // Get the original response
        const response = await next()
        // Get the original text
        if (!response)
          return new Response('Not Found', { status: 404 })
        const text = await response.clone().text()
        const modifiedText = `Global: ${text}`
        return new Response(modifiedText, {
          status: response.status,
          headers: response.headers,
        })
      }

      // Register group with middleware
      await router.group({ prefix: '/api', middleware: [middleware] }, () => {
        router.get('/test', () => new Response('API Test'))
      })

      // Register a regular route outside the group
      await router.get('/test', () => new Response('Regular Test'))

      // Test API route (should be modified by middleware)
      const apiResponse = await router.handleRequest(new Request('http://localhost/api/test'))
      expect(apiResponse.status).toBe(200)
      expect(await apiResponse.text()).toBe('Global: API Test')

      // Test regular route (should not be modified)
      const regularResponse = await router.handleRequest(new Request('http://localhost/test'))
      expect(regularResponse.status).toBe(200)
      expect(await regularResponse.text()).toBe('Regular Test')
    })

    it('should halt middleware chain on early response', async () => {
      await router.use(async (req, next) => {
        if (req.url.includes('protected')) {
          return new Response('Unauthorized', { status: 401 })
        }
        return next()
      })

      await router.get('/protected', () => new Response('Protected Content'))
      await router.get('/public', () => new Response('Public Content'))

      const protectedResponse = await router.handleRequest(new Request('http://localhost/protected'))
      expect(protectedResponse.status).toBe(401)
      expect(await protectedResponse.text()).toBe('Unauthorized')

      const publicResponse = await router.handleRequest(new Request('http://localhost/public'))
      expect(publicResponse.status).toBe(200)
      expect(await publicResponse.text()).toBe('Public Content')
    })
  })

  describe('Route Constraints', () => {
    it('should apply number constraints', async () => {
      await router.get('/users/{id}', (req: EnhancedRequest) => new Response(`User: ${req.params.id}`))
      router.whereNumber('id')

      const validResponse = await router.handleRequest(new Request('http://localhost/users/123'))
      expect(validResponse.status).toBe(200)
      expect(await validResponse.text()).toBe('User: 123')

      const invalidResponse = await router.handleRequest(new Request('http://localhost/users/abc'))
      expect(invalidResponse.status).toBe(404)
    })

    it('should apply custom pattern constraints', async () => {
      await router.get('/posts/{slug}', (req: EnhancedRequest) => new Response(`Post: ${req.params.slug}`))
      router.where({ slug: '^[a-z0-9-]+$' })

      const validResponse = await router.handleRequest(new Request('http://localhost/posts/my-awesome-post-123'))
      expect(validResponse.status).toBe(200)
      expect(await validResponse.text()).toBe('Post: my-awesome-post-123')

      const invalidResponse = await router.handleRequest(new Request('http://localhost/posts/Invalid_Post!'))
      expect(invalidResponse.status).toBe(404)
    })
  })

  describe('Named Routes', () => {
    it('should register and resolve named routes', async () => {
      await router.get('/users/{id}', () => new Response('User'), undefined, 'users.show')

      const path = router.route('users.show', { id: '123' })
      expect(path).toBe('/users/123')
    })
  })

  describe('Fallback Handler', () => {
    it('should use fallback handler for unmatched routes', async () => {
      router.fallback(() => new Response('Not Found', { status: 404 }))

      const response = await router.handleRequest(new Request('http://localhost/nonexistent'))
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Not Found')
    })
  })

  describe('Redirects', () => {
    it('should generate redirect responses', () => {
      const response = router.redirect('/destination')
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/destination')
    })

    it('should support permanent redirects', () => {
      const response = router.permanentRedirect('/destination')
      expect(response.status).toBe(301)
      expect(response.headers.get('Location')).toBe('/destination')
    })

    it('should register redirect routes', async () => {
      await router.redirectRoute('/old-path', '/new-path')

      const response = await router.handleRequest(new Request('http://localhost/old-path'))
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/new-path')
    })
  })

  describe('Error Handling', () => {
    it('should handle errors in route handlers', async () => {
      // Register an error handler
      await router.onError((error) => {
        return new Response(`Error: ${error.message}`, { status: 500 })
      })

      await router.get('/error', () => {
        throw new Error('Test error')
      })

      const response = await router.handleRequest(new Request('http://localhost/error'))
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Error: Test error')
    })

    it('should handle async errors in route handlers', async () => {
      // Register an error handler
      await router.onError((error) => {
        return new Response(`Error: ${error.message}`, { status: 500 })
      })

      await router.get('/async-error', async () => {
        return Promise.reject(new Error('Async error'))
      })

      const response = await router.handleRequest(new Request('http://localhost/async-error'))
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Error: Async error')
    })
  })

  describe('Cookies', () => {
    it('should parse request cookies', async () => {
      await router.get('/cookies', (req: EnhancedRequest) => {
        const value = req.cookies?.get('test-cookie')
        return new Response(`Cookie: ${value}`)
      })

      const headers = new Headers()
      headers.append('Cookie', 'test-cookie=cookie-value')

      const response = await router.handleRequest(new Request('http://localhost/cookies', { headers }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Cookie: cookie-value')
    })

    it('should set response cookies', async () => {
      await router.get('/set-cookie', (req: EnhancedRequest) => {
        req.cookies?.set('new-cookie', 'new-value', {
          httpOnly: true,
          maxAge: 3600,
        })
        return new Response('Cookie set')
      })

      const response = await router.handleRequest(new Request('http://localhost/set-cookie'))
      expect(response.status).toBe(200)

      const setCookie = response.headers.get('Set-Cookie')
      expect(setCookie).toContain('new-cookie=new-value')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('Max-Age=3600')
    })

    it('should delete cookies', async () => {
      await router.get('/delete-cookie', (req: EnhancedRequest) => {
        req.cookies?.delete('to-delete')
        return new Response('Cookie deleted')
      })

      const headers = new Headers()
      headers.append('Cookie', 'to-delete=value-to-delete')

      const response = await router.handleRequest(new Request('http://localhost/delete-cookie', { headers }))
      expect(response.status).toBe(200)

      const setCookie = response.headers.get('Set-Cookie')
      expect(setCookie).toContain('to-delete=')
      expect(setCookie).toContain('Max-Age=0')
    })
  })

  describe('View Rendering', () => {
    const viewsDir = join(process.cwd(), 'test-views')
    const layoutPath = join(viewsDir, 'layouts', 'main.html')
    const viewPath = join(viewsDir, 'test.html')

    beforeAll(async () => {
      // Create test view directory and files
      await mkdir(join(viewsDir, 'layouts'), { recursive: true })

      // Create a layout file
      await writeFile(
        layoutPath,
        `<!DOCTYPE html>
        <html>
          <head>
            <title>{{title}}</title>
          </head>
          <body>
            <div id="content">{{content}}</div>
          </body>
        </html>`,
      )

      // Create a view file
      await writeFile(
        viewPath,
        `<h1>{{heading}}</h1>
        <p>{{message}}</p>`,
      )
    })

    afterAll(async () => {
      // Clean up test view directory
      await rm(viewsDir, { recursive: true, force: true })
    })

    it('should render views with data', async () => {
      // Configure router with views path
      router = new Router({
        views: {
          viewsPath: viewsDir,
          extensions: ['.html'],
          cache: false,
          engine: 'auto',
        },
      })

      // Test view rendering
      const html = await router.renderView('test', {
        heading: 'Test Heading',
        message: 'Hello from test',
      })

      expect(html).toContain('<h1>Test Heading</h1>')
      expect(html).toContain('<p>Hello from test</p>')
    })

    it('should render views with layouts', async () => {
      // Configure router with views path
      router = new Router({
        views: {
          viewsPath: viewsDir,
          extensions: ['.html'],
          defaultLayout: 'main',
          cache: false,
          engine: 'auto',
        },
      })

      // Test view rendering with layout
      const html = await router.renderView('test', {
        title: 'Test Page',
        heading: 'Test Heading',
        message: 'Hello from test',
      }, { layout: 'main' })

      expect(html).toContain('<title>Test Page</title>')
      expect(html).toContain('<div id="content">')
      expect(html).toContain('<h1>Test Heading</h1>')
      expect(html).toContain('<p>Hello from test</p>')
    })

    it('should register view routes', async () => {
      // Configure router with views path
      router = new Router({
        views: {
          viewsPath: viewsDir,
          extensions: ['.html'],
          defaultLayout: 'main',
          cache: false,
          engine: 'auto',
        },
      })

      // Register a view route
      await router.view('/test-page', 'test', {
        title: 'Test Page',
        heading: 'Test Heading',
        message: 'Hello from test',
      })

      // Send request to view route
      const response = await router.handleRequest(new Request('http://localhost/test-page'))
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/html')

      const html = await response.text()
      expect(html).toContain('<title>Test Page</title>')
      expect(html).toContain('<h1>Test Heading</h1>')
      expect(html).toContain('<p>Hello from test</p>')
    })
  })

  describe('Resource Routes', () => {
    it('should register resource routes', async () => {
      // Start with a clean router instance - explicitly set apiPrefix to empty
      router = new Router({
        apiPrefix: '',
      })

      // This registers standard RESTful routes: index, show, store, update, destroy
      await router.resource('users', {
        index: () => new Response('List of users'),
        show: (req: any) => new Response(`User ${req.params.id}`),
        store: () => new Response('User created', { status: 201 }),
        update: (req: any) => new Response(`User ${req.params.id} updated`),
        destroy: (req: any) => new Response(`User ${req.params.id} deleted`),
      })

      // Test index route (GET /users)
      const indexResponse = await router.handleRequest(new Request('http://localhost/users'))
      expect(indexResponse.status).toBe(200)
      expect(await indexResponse.text()).toBe('List of users')

      // Test show route (GET /users/{id})
      const showResponse = await router.handleRequest(new Request('http://localhost/users/123'))
      expect(showResponse.status).toBe(200)
      expect(await showResponse.text()).toBe('User 123')

      // Test store route (POST /users)
      const storeResponse = await router.handleRequest(new Request('http://localhost/users', {
        method: 'POST',
      }))
      expect(storeResponse.status).toBe(201)
      expect(await storeResponse.text()).toBe('User created')

      // Test update route (PUT /users/{id})
      const updateResponse = await router.handleRequest(new Request('http://localhost/users/123', {
        method: 'PUT',
      }))
      expect(updateResponse.status).toBe(200)
      expect(await updateResponse.text()).toBe('User 123 updated')

      // Test destroy route (DELETE /users/{id})
      const destroyResponse = await router.handleRequest(new Request('http://localhost/users/123', {
        method: 'DELETE',
      }))
      expect(destroyResponse.status).toBe(200)
      expect(await destroyResponse.text()).toBe('User 123 deleted')
    })
  })

  describe('API/Web Prefixes', () => {
    it('should apply API prefix to routes', async () => {
      router = new Router({
        apiPrefix: '/api',
      })

      await router.get('/users', () => new Response('Users API'), 'api')

      const response = await router.handleRequest(new Request('http://localhost/api/users'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Users API')
    })

    it('should apply web prefix to routes', async () => {
      router = new Router({
        webPrefix: '/app',
      })

      await router.get('/dashboard', () => new Response('Dashboard'), 'web')

      const response = await router.handleRequest(new Request('http://localhost/app/dashboard'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Dashboard')
    })
  })

  describe('Health Check', () => {
    it('should register a health check route', async () => {
      // Create a new router with default config
      router = new Router({
        apiPrefix: '/api',
      })

      // Register the health route
      await router.health()

      // Health check should be accessible at /api/health due to the API prefix
      const response = await router.handleRequest(new Request('http://localhost/api/health'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('OK')
    })
  })
})
