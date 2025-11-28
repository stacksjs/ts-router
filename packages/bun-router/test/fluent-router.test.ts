/**
 * Fluent Router Tests
 *
 * Tests for Laravel-style fluent routing API
 */

import type { ControllerClass } from '../src/router/fluent-router'
import type { EnhancedRequest, MiddlewareHandler } from '../src/types'
import { beforeEach, describe, expect, it } from 'bun:test'
import { FluentRouter } from '../src/router/fluent-router'
import { Router } from '../src/router/index'

// Helper to cast controllers to ControllerClass
const asController = <T>(c: new () => T): ControllerClass => c as unknown as ControllerClass

describe('FluentRouter', () => {
  let router: Router
  let fluent: FluentRouter

  beforeEach(() => {
    router = new Router()
    fluent = new FluentRouter(router)
  })

  describe('Basic Route Registration', () => {
    it('should register a GET route with fluent API', async () => {
      fluent.get('/test', () => new Response('Test GET'))

      const response = await router.handleRequest(new Request('http://localhost/test'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test GET')
    })

    it('should register a POST route with fluent API', async () => {
      fluent.post('/test', () => new Response('Test POST'))

      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'POST' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test POST')
    })

    it('should register a PUT route with fluent API', async () => {
      fluent.put('/test', () => new Response('Test PUT'))

      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'PUT' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test PUT')
    })

    it('should register a PATCH route with fluent API', async () => {
      fluent.patch('/test', () => new Response('Test PATCH'))

      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'PATCH' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test PATCH')
    })

    it('should register a DELETE route with fluent API', async () => {
      fluent.delete('/test', () => new Response('Test DELETE'))

      const response = await router.handleRequest(new Request('http://localhost/test', { method: 'DELETE' }))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('Test DELETE')
    })
  })

  describe('Route Naming', () => {
    it('should name a route', () => {
      const route = fluent.get('/users', () => new Response('Users'))
      route.name('users.index')

      // The route should be registered with the name
      expect(route).toBeDefined()
    })
  })

  describe('Route Groups', () => {
    it('should create a route group with prefix', async () => {
      fluent.prefix('/api').routes((r) => {
        r.get('/users', () => new Response('API Users'))
        r.get('/posts', () => new Response('API Posts'))
      })

      const usersResponse = await router.handleRequest(new Request('http://localhost/api/users'))
      expect(usersResponse.status).toBe(200)
      expect(await usersResponse.text()).toBe('API Users')

      const postsResponse = await router.handleRequest(new Request('http://localhost/api/posts'))
      expect(postsResponse.status).toBe(200)
      expect(await postsResponse.text()).toBe('API Posts')
    })

    it('should create nested route groups', async () => {
      fluent.prefix('/api').routes((api) => {
        api.prefix('/v1').routes((v1) => {
          v1.get('/users', () => new Response('V1 Users'))
        })
      })

      const response = await router.handleRequest(new Request('http://localhost/api/v1/users'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('V1 Users')
    })
  })

  describe('Resource Routes', () => {
    it('should register resource routes', async () => {
      class UserController {
        index() {
          return new Response('User Index')
        }

        show() {
          return new Response('User Show')
        }

        store() {
          return new Response('User Store')
        }

        update() {
          return new Response('User Update')
        }

        destroy() {
          return new Response('User Destroy')
        }
      }

      fluent.resource('users', asController(UserController))

      // Test index route
      const indexResponse = await router.handleRequest(new Request('http://localhost/users'))
      expect(indexResponse.status).toBe(200)
      expect(await indexResponse.text()).toBe('User Index')

      // Test show route
      const showResponse = await router.handleRequest(new Request('http://localhost/users/1'))
      expect(showResponse.status).toBe(200)
      expect(await showResponse.text()).toBe('User Show')

      // Test store route
      const storeResponse = await router.handleRequest(new Request('http://localhost/users', { method: 'POST' }))
      expect(storeResponse.status).toBe(200)
      expect(await storeResponse.text()).toBe('User Store')

      // Test update route
      const updateResponse = await router.handleRequest(new Request('http://localhost/users/1', { method: 'PUT' }))
      expect(updateResponse.status).toBe(200)
      expect(await updateResponse.text()).toBe('User Update')

      // Test destroy route
      const destroyResponse = await router.handleRequest(new Request('http://localhost/users/1', { method: 'DELETE' }))
      expect(destroyResponse.status).toBe(200)
      expect(await destroyResponse.text()).toBe('User Destroy')
    })

    it('should register API resource routes (no create/edit)', async () => {
      class PostController {
        index() {
          return new Response('Post Index')
        }

        show() {
          return new Response('Post Show')
        }

        store() {
          return new Response('Post Store')
        }

        update() {
          return new Response('Post Update')
        }

        destroy() {
          return new Response('Post Destroy')
        }
      }

      fluent.apiResource('posts', asController(PostController))

      // Test index route
      const indexResponse = await router.handleRequest(new Request('http://localhost/posts'))
      expect(indexResponse.status).toBe(200)
      expect(await indexResponse.text()).toBe('Post Index')

      // Test show route
      const showResponse = await router.handleRequest(new Request('http://localhost/posts/1'))
      expect(showResponse.status).toBe(200)
      expect(await showResponse.text()).toBe('Post Show')
    })

    it('should register singleton resource routes', async () => {
      class ProfileController {
        show() {
          return new Response('Profile Show')
        }

        update() {
          return new Response('Profile Update')
        }
      }

      fluent.singleton('profile', asController(ProfileController))

      // Test show route
      const showResponse = await router.handleRequest(new Request('http://localhost/profile'))
      expect(showResponse.status).toBe(200)
      expect(await showResponse.text()).toBe('Profile Show')

      // Test update route
      const updateResponse = await router.handleRequest(new Request('http://localhost/profile', { method: 'PUT' }))
      expect(updateResponse.status).toBe(200)
      expect(await updateResponse.text()).toBe('Profile Update')
    })

    it('should support resource options with only', async () => {
      class ItemController {
        index() {
          return new Response('Item Index')
        }

        show() {
          return new Response('Item Show')
        }

        store() {
          return new Response('Item Store')
        }
      }

      fluent.resource('items', asController(ItemController), { only: ['index', 'show'] })

      // Index should work
      const indexResponse = await router.handleRequest(new Request('http://localhost/items'))
      expect(indexResponse.status).toBe(200)

      // Show should work
      const showResponse = await router.handleRequest(new Request('http://localhost/items/1'))
      expect(showResponse.status).toBe(200)

      // Store should NOT work (not in only)
      const storeResponse = await router.handleRequest(new Request('http://localhost/items', { method: 'POST' }))
      expect(storeResponse.status).toBe(404)
    })

    it('should support resource options with except', async () => {
      class ProductController {
        index() {
          return new Response('Product Index')
        }

        show() {
          return new Response('Product Show')
        }

        destroy() {
          return new Response('Product Destroy')
        }
      }

      fluent.resource('products', asController(ProductController), { except: ['destroy'] })

      // Index should work
      const indexResponse = await router.handleRequest(new Request('http://localhost/products'))
      expect(indexResponse.status).toBe(200)

      // Destroy should NOT work (in except)
      const destroyResponse = await router.handleRequest(new Request('http://localhost/products/1', { method: 'DELETE' }))
      expect(destroyResponse.status).toBe(404)
    })
  })

  describe('Controller-based Routing', () => {
    it('should register routes with controller method references', async () => {
      class AuthController {
        login() {
          return new Response('Login')
        }

        logout() {
          return new Response('Logout')
        }

        register() {
          return new Response('Register')
        }
      }

      fluent.controller(asController(AuthController)).routes((r) => {
        r.get('/login', 'login')
        r.post('/login', 'login')
        r.post('/logout', 'logout')
        r.post('/register', 'register')
      })

      const loginGetResponse = await router.handleRequest(new Request('http://localhost/login'))
      expect(loginGetResponse.status).toBe(200)
      expect(await loginGetResponse.text()).toBe('Login')

      const logoutResponse = await router.handleRequest(new Request('http://localhost/logout', { method: 'POST' }))
      expect(logoutResponse.status).toBe(200)
      expect(await logoutResponse.text()).toBe('Logout')
    })
  })

  describe('Route Parameters', () => {
    it('should handle route parameters', async () => {
      fluent.get('/users/{id}', (req: EnhancedRequest) => {
        return new Response(`User ID: ${req.params.id}`)
      })

      const response = await router.handleRequest(new Request('http://localhost/users/123'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('User ID: 123')
    })

    it('should handle optional route parameters', async () => {
      fluent.get('/posts/{id?}', (req: EnhancedRequest) => {
        const id = req.params.id || 'all'
        return new Response(`Posts: ${id}`)
      })

      const withIdResponse = await router.handleRequest(new Request('http://localhost/posts/42'))
      expect(withIdResponse.status).toBe(200)
      expect(await withIdResponse.text()).toBe('Posts: 42')

      const withoutIdResponse = await router.handleRequest(new Request('http://localhost/posts'))
      expect(withoutIdResponse.status).toBe(200)
      expect(await withoutIdResponse.text()).toBe('Posts: all')
    })

    it('should handle multiple route parameters', async () => {
      fluent.get('/users/{userId}/posts/{postId}', (req: EnhancedRequest) => {
        return new Response(`User: ${req.params.userId}, Post: ${req.params.postId}`)
      })

      const response = await router.handleRequest(new Request('http://localhost/users/1/posts/5'))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('User: 1, Post: 5')
    })
  })

  describe('Middleware', () => {
    it('should apply middleware to routes', async () => {
      const logs: string[] = []

      const logMiddleware: MiddlewareHandler = async (_req, next) => {
        logs.push('before')
        const response = await next()
        logs.push('after')
        return response
      }

      fluent.middleware(logMiddleware).routes((r) => {
        r.get('/test', () => new Response('Test'))
      })

      const response = await router.handleRequest(new Request('http://localhost/test'))
      expect(response.status).toBe(200)
      expect(logs).toEqual(['before', 'after'])
    })

    it('should apply multiple middleware in order', async () => {
      const order: string[] = []

      const first: MiddlewareHandler = async (_req, next) => {
        order.push('first-before')
        const response = await next()
        order.push('first-after')
        return response
      }

      const second: MiddlewareHandler = async (_req, next) => {
        order.push('second-before')
        const response = await next()
        order.push('second-after')
        return response
      }

      fluent.middleware(first, second).routes((r) => {
        r.get('/test', () => {
          order.push('handler')
          return new Response('Test')
        })
      })

      await router.handleRequest(new Request('http://localhost/test'))
      expect(order).toEqual(['first-before', 'second-before', 'handler', 'second-after', 'first-after'])
    })
  })

  describe('Route Matching', () => {
    it('should match routes with correct method', async () => {
      fluent.get('/test', () => new Response('GET'))
      fluent.post('/test', () => new Response('POST'))

      const getResponse = await router.handleRequest(new Request('http://localhost/test'))
      expect(await getResponse.text()).toBe('GET')

      const postResponse = await router.handleRequest(new Request('http://localhost/test', { method: 'POST' }))
      expect(await postResponse.text()).toBe('POST')
    })

    it('should return 404 for unmatched routes', async () => {
      fluent.get('/exists', () => new Response('Exists'))

      const response = await router.handleRequest(new Request('http://localhost/not-exists'))
      expect(response.status).toBe(404)
    })
  })
})
