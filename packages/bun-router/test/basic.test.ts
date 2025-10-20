import { beforeEach, describe, expect, it } from 'bun:test'
import { Router } from '../src/router'

describe('Bun Router - Basic Tests', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  it('should register and handle routes', async () => {
    // Register a simple GET route
    await router.get('/test', () => new Response('Hello World'))

    // Make a request to the registered route
    const response = await router.handleRequest(new Request('http://localhost/test'))

    // Verify the response
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Hello World')
  })

  it('should handle path parameters', async () => {
    // Register a route with path parameters
    await router.get('/users/{id}', (req) => {
      return new Response(`User ID: ${req.params.id}`)
    })

    // Make a request with a parameter
    const response = await router.handleRequest(new Request('http://localhost/users/123'))

    // Verify the response has the parameter value
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('User ID: 123')
  })

  it('should return 404 for unmatched routes', async () => {
    // Make a request to a non-existent route
    const response = await router.handleRequest(new Request('http://localhost/not-found'))

    // Verify we get a 404 response
    expect(response.status).toBe(404)
  })

  it('should support different HTTP methods', async () => {
    // Register routes with different HTTP methods
    await router.get('/api', () => new Response('GET'))
    await router.post('/api', () => new Response('POST'))

    // Test GET request
    const getResponse = await router.handleRequest(new Request('http://localhost/api'))
    expect(getResponse.status).toBe(200)
    expect(await getResponse.text()).toBe('GET')

    // Test POST request
    const postResponse = await router.handleRequest(new Request('http://localhost/api', { method: 'POST' }))
    expect(postResponse.status).toBe(200)
    expect(await postResponse.text()).toBe('POST')
  })

  it('should redirect correctly', async () => {
    // Register a redirect route
    await router.redirectRoute('/old', '/new')

    // Make a request to the redirect route
    const response = await router.handleRequest(new Request('http://localhost/old'))

    // Verify the redirect
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/new')
  })
})
