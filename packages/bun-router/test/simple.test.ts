import { describe, expect, it } from 'bun:test'
import { Router } from '../src/router'

describe('Bun Router', () => {
  it('creates a new router instance', () => {
    const router = new Router()
    expect(router).toBeDefined()
    expect(router instanceof Router).toBe(true)
  })

  it('registers and handles a basic route', async () => {
    const router = new Router()
    await router.get('/hello', () => new Response('Hello World'))

    const response = await router.handleRequest(new Request('http://localhost/hello'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Hello World')
  })
})
