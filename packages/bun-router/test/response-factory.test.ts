/**
 * Response Factory Tests
 *
 * Tests for Laravel-style response helpers
 */

import { describe, expect, it } from 'bun:test'
import { response, responseBuilder } from '../src/response/response-factory'

describe('Response Factory', () => {
  describe('json()', () => {
    it('should create a JSON response', async () => {
      const res = response.json({ message: 'Hello' })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('application/json')

      const body = await res.json()
      expect(body).toEqual({ message: 'Hello' })
    })

    it('should create JSON response with custom status', async () => {
      const res = response.json({ error: 'Not found' }, { status: 404 })

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body).toEqual({ error: 'Not found' })
    })

    it('should create JSON response with custom headers', async () => {
      const res = response.json({ data: 'test' }, {
        headers: { 'X-Custom': 'value' },
      })

      expect(res.headers.get('X-Custom')).toBe('value')
    })

    it('should create pretty-printed JSON', async () => {
      const res = response.json({ a: 1 }, { pretty: true })

      const text = await res.text()
      expect(text).toContain('\n')
    })
  })

  describe('noContent()', () => {
    it('should create a 204 No Content response', async () => {
      const res = response.noContent()

      expect(res.status).toBe(204)
      const text = await res.text()
      expect(text).toBe('')
    })
  })

  describe('created()', () => {
    it('should create a 201 Created response', async () => {
      const res = response.created({ id: 1, name: 'New Item' })

      expect(res.status).toBe(201)
      const body = await res.json() as { data: unknown, success: boolean }
      expect(body.data).toEqual({ id: 1, name: 'New Item' })
      expect(body.success).toBe(true)
    })

    it('should create 201 response with location header', async () => {
      const res = response.created({ id: 1 }, '/api/items/1')

      expect(res.status).toBe(201)
      expect(res.headers.get('Location')).toBe('/api/items/1')
    })
  })

  describe('accepted()', () => {
    it('should create a 202 Accepted response', async () => {
      const res = response.accepted({ status: 'processing' })

      expect(res.status).toBe(202)
      const body = await res.json() as { data: unknown, success: boolean }
      expect(body.data).toEqual({ status: 'processing' })
      expect(body.success).toBe(true)
    })
  })

  describe('redirect()', () => {
    it('should create a redirect response', () => {
      const res = response.redirect('/new-location')

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('/new-location')
    })

    it('should create redirect with custom status', () => {
      const res = response.redirect('/permanent', 301)

      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/permanent')
    })
  })

  describe('redirectPermanent()', () => {
    it('should create a 301 permanent redirect', () => {
      const res = response.redirectPermanent('/new-url')

      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/new-url')
    })
  })

  describe('redirectTemporary()', () => {
    it('should create a 302 temporary redirect', () => {
      const res = response.redirectTemporary('/temp-url')

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('/temp-url')
    })
  })

  describe('back()', () => {
    it('should redirect to referer', () => {
      const request = new Request('http://localhost/test', {
        headers: { Referer: 'http://example.com/previous' },
      })
      const res = response.back(request, '/fallback')

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('http://example.com/previous')
    })

    it('should use fallback when no referer', () => {
      const request = new Request('http://localhost/test')
      const res = response.back(request, '/fallback')

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('/fallback')
    })
  })

  describe('error()', () => {
    it('should create error response', async () => {
      const res = response.error('Something went wrong', 500)

      expect(res.status).toBe(500)
      const body = await res.json() as { message: string, success: boolean }
      expect(body.message).toBe('Something went wrong')
      expect(body.success).toBe(false)
    })

    it('should create 400 error by default', async () => {
      const res = response.error('Bad request')

      expect(res.status).toBe(400)
    })
  })

  describe('notFound()', () => {
    it('should create 404 response', async () => {
      const res = response.notFound('Resource not found')

      expect(res.status).toBe(404)
      const body = await res.json() as { message: string }
      expect(body.message).toBe('Resource not found')
    })

    it('should use default message', async () => {
      const res = response.notFound()

      expect(res.status).toBe(404)
      const body = await res.json() as { message: string }
      expect(body.message).toBe('Resource not found')
    })
  })

  describe('unauthorized()', () => {
    it('should create 401 response', async () => {
      const res = response.unauthorized('Invalid credentials')

      expect(res.status).toBe(401)
      const body = await res.json() as { message: string }
      expect(body.message).toBe('Invalid credentials')
    })
  })

  describe('forbidden()', () => {
    it('should create 403 response', async () => {
      const res = response.forbidden('Access denied')

      expect(res.status).toBe(403)
      const body = await res.json() as { message: string }
      expect(body.message).toBe('Access denied')
    })
  })

  describe('validationError()', () => {
    it('should create 422 validation error response', async () => {
      const errors = {
        email: ['Email is required', 'Email must be valid'],
        password: ['Password is too short'],
      }
      const res = response.validationError(errors)

      expect(res.status).toBe(422)
      const body = await res.json() as { message: string, errors: Record<string, string[]> }
      expect(body.message).toBe('Validation failed')
      expect(body.errors).toEqual(errors)
    })

    it('should use custom message', async () => {
      const res = response.validationError({ name: ['Required'] }, 'Invalid input')

      const body = await res.json() as { message: string }
      expect(body.message).toBe('Invalid input')
    })
  })

  describe('view()', () => {
    it('should create HTML response', async () => {
      const res = response.view('<h1>Hello</h1>')

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')

      const text = await res.text()
      expect(text).toBe('<h1>Hello</h1>')
    })

    it('should create HTML with custom status', async () => {
      const res = response.view('<h1>Error</h1>', 500)

      expect(res.status).toBe(500)
    })
  })

  describe('text()', () => {
    it('should create plain text response', async () => {
      const res = response.text('Hello, World!')

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')

      const text = await res.text()
      expect(text).toBe('Hello, World!')
    })
  })

  describe('xml()', () => {
    it('should create XML response', async () => {
      const res = response.xml('<root><item>test</item></root>')

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')

      const text = await res.text()
      expect(text).toBe('<root><item>test</item></root>')
    })
  })

  describe('success()', () => {
    it('should create success response', async () => {
      const res = response.success({ id: 1 }, 'Created successfully')

      expect(res.status).toBe(200)
      const body = await res.json() as { success: boolean, data: unknown, message: string }
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ id: 1 })
      expect(body.message).toBe('Created successfully')
    })
  })

  describe('serverError()', () => {
    it('should create 500 response', async () => {
      const res = response.serverError('Database error')

      expect(res.status).toBe(500)
      const body = await res.json() as { message: string }
      expect(body.message).toBe('Database error')
    })
  })

  describe('tooManyRequests()', () => {
    it('should create 429 response', async () => {
      const res = response.tooManyRequests('Rate limit exceeded', 60)

      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('60')
      const body = await res.json() as { message: string }
      expect(body.message).toBe('Rate limit exceeded')
    })
  })

  describe('paginate()', () => {
    it('should create paginated response', async () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
      const res = response.paginate(items, {
        page: 1,
        perPage: 10,
        total: 100,
        path: '/api/items',
      })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: unknown, meta: { current_page: number, per_page: number, total: number, last_page: number } }
      expect(body.data).toEqual(items)
      expect(body.meta.current_page).toBe(1)
      expect(body.meta.per_page).toBe(10)
      expect(body.meta.total).toBe(100)
      expect(body.meta.last_page).toBe(10)
    })
  })

  describe('streamDownload()', () => {
    it('should create streaming download response', async () => {
      async function* generator() {
        yield 'chunk1'
        yield 'chunk2'
      }

      const res = response.streamDownload(generator, 'test.txt')

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Disposition')).toContain('test.txt')
      expect(res.headers.get('Transfer-Encoding')).toBe('chunked')
    })
  })
})

describe('ResponseBuilder', () => {
  it('should build response with status', async () => {
    const res = responseBuilder()
      .status(201)
      .json({ created: true })

    expect(res.status).toBe(201)
  })

  it('should build response with headers', async () => {
    const res = responseBuilder()
      .header('X-Custom', 'value')
      .withHeaders({ 'X-Another': 'header' })
      .json({ data: 'test' })

    expect(res.headers.get('X-Custom')).toBe('value')
    expect(res.headers.get('X-Another')).toBe('header')
  })

  it('should build response with cookies', async () => {
    const res = responseBuilder()
      .cookie('session', 'abc123', { httpOnly: true })
      .json({ logged: true })

    const cookie = res.headers.get('Set-Cookie')
    expect(cookie).toContain('session=abc123')
    expect(cookie).toContain('HttpOnly')
  })

  it('should build response with deleted cookies', async () => {
    const res = responseBuilder()
      .withoutCookie('session')
      .json({ logged: false })

    const cookie = res.headers.get('Set-Cookie')
    expect(cookie).toContain('session=')
    expect(cookie).toContain('Max-Age=0')
  })

  it('should build text response', async () => {
    const res = responseBuilder()
      .status(200)
      .text('Hello')

    const text = await res.text()
    expect(text).toBe('Hello')
  })

  it('should build HTML response', async () => {
    const res = responseBuilder()
      .html('<h1>Hello</h1>')

    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
  })

  it('should build no content response', async () => {
    const res = responseBuilder()
      .noContent()

    expect(res.status).toBe(204)
  })

  it('should chain multiple cookie operations', async () => {
    const res = responseBuilder()
      .cookie('token', 'xyz', { secure: true, sameSite: 'strict' })
      .cookie('user', 'john')
      .json({ success: true })

    const cookies = res.headers.getSetCookie()
    expect(cookies.length).toBe(2)
  })
})

describe('Response Factory - Edge Cases', () => {
  it('should handle empty JSON object', async () => {
    const res = response.json({})

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({})
  })

  it('should handle JSON array', async () => {
    const res = response.json([1, 2, 3])

    const body = await res.json()
    expect(body).toEqual([1, 2, 3])
  })

  it('should handle nested JSON', async () => {
    const data = {
      user: {
        name: 'John',
        address: {
          city: 'NYC',
          zip: '10001',
        },
      },
      tags: ['a', 'b', 'c'],
    }
    const res = response.json(data)

    const body = await res.json()
    expect(body).toEqual(data)
  })

  it('should handle null values in JSON', async () => {
    const res = response.json({ value: null })

    const body = await res.json()
    expect(body).toEqual({ value: null })
  })

  it('should handle special characters in text', async () => {
    const res = response.text('Hello <script>alert("xss")</script>')

    const text = await res.text()
    expect(text).toBe('Hello <script>alert("xss")</script>')
  })

  it('should handle unicode in responses', async () => {
    const res = response.json({ message: '你好世界 🌍' })

    const body = await res.json() as { message: string }
    expect(body.message).toBe('你好世界 🌍')
  })

  it('should handle empty string in text response', async () => {
    const res = response.text('')

    const text = await res.text()
    expect(text).toBe('')
  })

  it('should handle large JSON payload', async () => {
    const largeArray = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      data: 'x'.repeat(100),
    }))
    const res = response.json(largeArray)

    const body = await res.json() as Array<{ id: number, name: string, data: string }>
    expect(body.length).toBe(1000)
    expect(body[500].id).toBe(500)
  })
})
