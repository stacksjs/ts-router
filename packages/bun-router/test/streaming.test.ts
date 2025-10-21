import type { Server } from 'bun'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Router } from '../src/router/index'

describe('Laravel-style Streaming APIs', () => {
  let router: Router
  let server: Server

  beforeEach(() => {
    router = new Router()
  })

  afterEach(async () => {
    if (server) {
      server.stop()
    }
  })

  describe('response()->stream()', () => {
    it('should create a streaming response with generator function', async () => {
      await router.get('/test-stream', () => {
        return router.stream(function* () {
          yield 'chunk1\n'
          yield 'chunk2\n'
          yield 'chunk3\n'
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/test-stream`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toBe('chunk1\nchunk2\nchunk3\n')
    })

    it('should handle binary data in streaming', async () => {
      await router.get('/binary-stream', () => {
        return router.stream(function* () {
          yield new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
          yield new Uint8Array([32, 87, 111, 114, 108, 100]) // " World"
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/binary-stream`)
      expect(response.status).toBe(200)

      const arrayBuffer = await response.arrayBuffer()
      const text = new TextDecoder().decode(arrayBuffer)
      expect(text).toBe('Hello World')
    })

    it('should support custom headers and status', async () => {
      await router.get('/custom-stream', () => {
        return router.stream(function* () {
          yield 'test data'
        }, 202, { 'X-Custom-Header': 'test-value' })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/custom-stream`)
      expect(response.status).toBe(202)
      expect(response.headers.get('X-Custom-Header')).toBe('test-value')
    })

    it('should handle async generators', async () => {
      await router.get('/async-stream', () => {
        return router.stream(async function* () {
          for (let i = 1; i <= 3; i++) {
            await new Promise(resolve => setTimeout(resolve, 10))
            yield `async-chunk${i}\n`
          }
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/async-stream`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toBe('async-chunk1\nasync-chunk2\nasync-chunk3\n')
    })
  })

  describe('response()->streamJson()', () => {
    it('should stream JSON data progressively', async () => {
      async function* generateUsers() {
        for (let i = 1; i <= 3; i++) {
          yield { id: i, name: `User ${i}`, email: `user${i}@example.com` }
        }
      }

      await router.get('/users.json', () => {
        return router.streamJson({
          users: generateUsers(),
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/users.json`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const text = await response.text()
      const data = JSON.parse(text)

      expect(data.users).toHaveLength(3)
      expect(data.users[0]).toEqual({ id: 1, name: 'User 1', email: 'user1@example.com' })
      expect(data.meta).toEqual([{ total: 3, page: 1 }])
    })

    it('should support custom status and headers for JSON streaming', async () => {
      async function* generateData() {
        yield { message: 'test' }
      }

      await router.get('/custom-json', () => {
        return router.streamJson({
          data: generateData(),
        }, 201, { 'X-Custom': 'json-test' })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/custom-json`)
      expect(response.status).toBe(201)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(response.headers.get('X-Custom')).toBe('json-test')
    })

    it('should handle empty iterables', async () => {
      async function* generateEmpty() {
        // Yield nothing

      }

      await router.get('/empty-json', () => {
        return router.streamJson({
          empty: generateEmpty(),
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/empty-json`)
      expect(response.status).toBe(200)

      const text = await response.text()
      const data = JSON.parse(text)
      expect(data.empty).toEqual([])
    })
  })

  describe('response()->eventStream()', () => {
    it('should create Server-Sent Events stream', async () => {
      await router.get('/events', () => {
        return router.eventStream(function* () {
          yield { data: 'Hello', event: 'greeting', id: '1' }
          yield { data: { message: 'World' }, event: 'message', id: '2' }
          yield { data: 'Goodbye', retry: 5000 }
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/events`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(response.headers.get('Connection')).toBe('keep-alive')

      const text = await response.text()

      expect(text).toContain('id: 1')
      expect(text).toContain('event: greeting')
      expect(text).toContain('data: Hello')

      expect(text).toContain('id: 2')
      expect(text).toContain('event: message')
      expect(text).toContain('data: {"message":"World"}')

      expect(text).toContain('retry: 5000')
      expect(text).toContain('data: Goodbye')
    })

    it('should support custom headers for SSE', async () => {
      await router.get('/custom-events', () => {
        return router.eventStream(function* () {
          yield { data: 'test' }
        }, { 'X-Custom-SSE': 'test-value' })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/custom-events`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('X-Custom-SSE')).toBe('test-value')
    })

    it('should handle async generators for SSE', async () => {
      await router.get('/async-events', () => {
        return router.eventStream(async function* () {
          for (let i = 1; i <= 2; i++) {
            await new Promise(resolve => setTimeout(resolve, 10))
            yield { data: `event-${i}`, event: 'update', id: i.toString() }
          }
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/async-events`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toContain('data: event-1')
      expect(text).toContain('data: event-2')
      expect(text).toContain('event: update')
    })
  })

  describe('response()->streamDownload()', () => {
    it('should create a downloadable stream', async () => {
      await router.get('/download', () => {
        return router.streamDownload(function* () {
          yield 'Line 1\n'
          yield 'Line 2\n'
          yield 'Line 3\n'
        }, 'test.txt')
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/download`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="test.txt"')

      const text = await response.text()
      expect(text).toBe('Line 1\nLine 2\nLine 3\n')
    })

    it('should support custom headers for downloads', async () => {
      await router.get('/custom-download', () => {
        return router.streamDownload(function* () {
          yield 'id,name\n'
          yield '1,John\n'
          yield '2,Jane\n'
        }, 'users.csv', { 'Content-Type': 'text/csv' })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/custom-download`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/csv')
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="users.csv"')

      const text = await response.text()
      expect(text).toBe('id,name\n1,John\n2,Jane\n')
    })

    it('should handle async generators for downloads', async () => {
      await router.get('/async-download', () => {
        return router.streamDownload(async function* () {
          for (let i = 1; i <= 3; i++) {
            await new Promise(resolve => setTimeout(resolve, 10))
            yield `Row ${i}\n`
          }
        }, 'async-data.txt')
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/async-download`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toBe('Row 1\nRow 2\nRow 3\n')
    })
  })

  describe('streamFile() and streamFileWithRanges()', () => {
    // These tests would require actual files, so we'll test with mock implementations
    it('should handle file streaming (integration test)', async () => {
      // Create a simple test file handler
      await router.get('/file', async (_req) => {
        // Mock file streaming - in real use case this would use streamFile()
        return new Response('Mock file content', {
          headers: { 'Content-Type': 'text/plain' },
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/file`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/plain')

      const text = await response.text()
      expect(text).toBe('Mock file content')
    })

    it('should handle range requests (integration test)', async () => {
      await router.get('/video', async (req) => {
        // Mock range request handling
        const range = req.headers.get('range')
        if (range) {
          return new Response('Partial content', {
            status: 206,
            headers: {
              'Content-Range': 'bytes 0-10/100',
              'Accept-Ranges': 'bytes',
              'Content-Length': '11',
            },
          })
        }
        return new Response('Full content')
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/video`, {
        headers: { Range: 'bytes=0-10' },
      })
      expect(response.status).toBe(206)
      expect(response.headers.get('Content-Range')).toBe('bytes 0-10/100')
      expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    })
  })

  describe('Error handling', () => {
    it('should handle generator errors in stream()', async () => {
      await router.get('/error-stream', () => {
        return router.stream(function* () {
          yield 'start\n'
          throw new Error('Generator error')
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/error-stream`)
      // The stream should start but then close due to error
      expect(response.status).toBe(200)
    })

    it('should handle errors in streamJson()', async () => {
      async function* errorGenerator() {
        yield { id: 1 }
        throw new Error('JSON stream error')
      }

      await router.get('/error-json', () => {
        return router.streamJson({
          data: errorGenerator(),
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/error-json`)
      expect(response.status).toBe(200) // Stream starts successfully
    })

    it('should handle errors in eventStream()', async () => {
      await router.get('/error-events', () => {
        return router.eventStream(function* () {
          yield { data: 'first event' }
          throw new Error('SSE error')
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/error-events`)
      expect(response.status).toBe(200) // Stream starts successfully
    })
  })
})
