import type { EnhancedRequest, RouterConfig } from '../packages/bun-router/src/types'
import { describe, expect, test } from 'bun:test'
import { resolveHandler, wrapResponse } from '../packages/bun-router/src/router/handler-resolver'

describe('Handler Resolver', () => {
  const mockConfig: RouterConfig = {
    verbose: false,
    actionsPath: 'actions',
    controllersPath: 'controllers',
  }

  const createMockRequest = (url = 'http://localhost/test'): EnhancedRequest => {
    return new Request(url) as EnhancedRequest
  }

  describe('wrapResponse', () => {
    test('should return Response as-is', () => {
      const response = new Response('hello')
      const wrapped = wrapResponse(response)
      expect(wrapped).toBe(response)
    })

    test('should wrap string in Response with text/plain', async () => {
      const wrapped = wrapResponse('hello world')
      expect(wrapped).toBeInstanceOf(Response)
      expect(wrapped.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
      expect(await wrapped.text()).toBe('hello world')
    })

    test('should wrap number in Response', async () => {
      const wrapped = wrapResponse(42)
      expect(await wrapped.text()).toBe('42')
    })

    test('should wrap boolean in Response', async () => {
      const wrapped = wrapResponse(true)
      expect(await wrapped.text()).toBe('true')
    })

    test('should wrap null/undefined as 204 No Content', () => {
      const wrappedNull = wrapResponse(null)
      expect(wrappedNull.status).toBe(204)

      const wrappedUndefined = wrapResponse(undefined)
      expect(wrappedUndefined.status).toBe(204)
    })

    test('should wrap object as JSON', async () => {
      const obj = { name: 'John', age: 30 }
      const wrapped = wrapResponse(obj)
      expect(wrapped.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
      expect(await wrapped.json()).toEqual(obj)
    })

    test('should wrap array as JSON', async () => {
      const arr = [1, 2, 3]
      const wrapped = wrapResponse(arr)
      expect(wrapped.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
      expect(await wrapped.json()).toEqual(arr)
    })
  })

  describe('resolveHandler', () => {
    test('should resolve function handler returning Response', async () => {
      const handler = () => new Response('hello')
      const req = createMockRequest()

      const response = await resolveHandler(handler, req, mockConfig)
      expect(response).toBeInstanceOf(Response)
      expect(await response.text()).toBe('hello')
    })

    test('should resolve function handler returning string (auto-wrap)', async () => {
      const handler = () => 'hello world'
      const req = createMockRequest()

      const response = await resolveHandler(handler, req, mockConfig)
      expect(response).toBeInstanceOf(Response)
      expect(await response.text()).toBe('hello world')
    })

    test('should resolve function handler returning object (auto-wrap to JSON)', async () => {
      const handler = () => ({ message: 'hello', status: 'ok' })
      const req = createMockRequest()

      const response = await resolveHandler(handler, req, mockConfig)
      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
      expect(await response.json()).toEqual({ message: 'hello', status: 'ok' })
    })

    test('should resolve async function handler', async () => {
      const handler = async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'async result'
      }
      const req = createMockRequest()

      const response = await resolveHandler(handler, req, mockConfig)
      expect(await response.text()).toBe('async result')
    })

    test('should resolve class with handle method', async () => {
      class TestAction {
        handle(_req: EnhancedRequest) {
          return 'class handler result'
        }
      }

      const req = createMockRequest()
      const response = await resolveHandler(TestAction, req, mockConfig)
      expect(await response.text()).toBe('class handler result')
    })

    test('should resolve instance with handle method', async () => {
      const handler = {
        handle: (_req: EnhancedRequest) => ({ result: 'instance handler' }),
      }

      const req = createMockRequest()
      const response = await resolveHandler(handler, req, mockConfig)
      expect(await response.json()).toEqual({ result: 'instance handler' })
    })

    test('should pass request to handler', async () => {
      const handler = (req: EnhancedRequest) => {
        const url = new URL(req.url)
        return { path: url.pathname }
      }

      const req = createMockRequest('http://localhost/api/users')
      const response = await resolveHandler(handler, req, mockConfig)
      expect(await response.json()).toEqual({ path: '/api/users' })
    })

    test('should throw on invalid handler', async () => {
      const req = createMockRequest()

      await expect(resolveHandler(123, req, mockConfig)).rejects.toThrow('Invalid handler type')
    })
  })

  describe('Handler return types', () => {
    test('should handle handler returning null', async () => {
      const handler = () => null
      const req = createMockRequest()

      const response = await resolveHandler(handler, req, mockConfig)
      expect(response.status).toBe(204)
    })

    test('should handle handler returning undefined', async () => {
      const handler = () => undefined
      const req = createMockRequest()

      const response = await resolveHandler(handler, req, mockConfig)
      expect(response.status).toBe(204)
    })

    test('should handle handler returning array', async () => {
      const handler = () => [1, 2, 3, 4, 5]
      const req = createMockRequest()

      const response = await resolveHandler(handler, req, mockConfig)
      expect(await response.json()).toEqual([1, 2, 3, 4, 5])
    })

    test('should handle handler returning nested object', async () => {
      const handler = () => ({
        user: { name: 'John', email: 'john@example.com' },
        posts: [{ id: 1, title: 'Hello' }],
      })
      const req = createMockRequest()

      const response = await resolveHandler(handler, req, mockConfig)
      const json = await response.json() as { user: { name: string }, posts: { id: number, title: string }[] }
      expect(json.user.name).toBe('John')
      expect(json.posts).toHaveLength(1)
    })
  })
})
