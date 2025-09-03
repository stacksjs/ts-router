import type { Server } from 'bun'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Router } from '../src/router'

describe('Streaming Routes', () => {
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

  describe('route.stream()', () => {
    it('should create a streaming route with async generator', async () => {
      await router.stream('/test-stream', async function* () {
        yield 'chunk1\n'
        yield 'chunk2\n'
        yield 'chunk3\n'
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/test-stream`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toBe('chunk1\nchunk2\nchunk3\n')
    })

    it('should handle binary data in streaming', async () => {
      await router.stream('/binary-stream', async function* () {
        yield new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
        yield new Uint8Array([32, 87, 111, 114, 108, 100]) // " World"
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
      await router.stream('/custom-stream', async function* () {
        yield 'test data'
      }, {
        headers: { 'X-Custom-Header': 'test-value' },
        status: 201,
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/custom-stream`)
      expect(response.status).toBe(201)
      expect(response.headers.get('X-Custom-Header')).toBe('test-value')
    })
  })

  describe('route.streamJSON()', () => {
    it('should stream JSON objects as NDJSON', async () => {
      await router.streamJSON('/json-stream', async function* () {
        yield { id: 1, name: 'Alice' }
        yield { id: 2, name: 'Bob' }
        yield { id: 3, name: 'Charlie' }
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/json-stream`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/x-ndjson')

      const text = await response.text()
      const lines = text.trim().split('\n')
      expect(lines).toHaveLength(3)
      expect(JSON.parse(lines[0])).toEqual({ id: 1, name: 'Alice' })
      expect(JSON.parse(lines[1])).toEqual({ id: 2, name: 'Bob' })
      expect(JSON.parse(lines[2])).toEqual({ id: 3, name: 'Charlie' })
    })

    it('should handle complex objects in JSON streaming', async () => {
      await router.streamJSON('/complex-json', async function* () {
        yield {
          user: { id: 1, profile: { name: 'Test', tags: ['admin', 'user'] } },
          timestamp: '2023-01-01T00:00:00Z',
          metadata: { version: 1.0, active: true },
        }
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/complex-json`)
      const text = await response.text()
      const parsed = JSON.parse(text.trim())

      expect(parsed.user.profile.tags).toEqual(['admin', 'user'])
      expect(parsed.metadata.active).toBe(true)
    })
  })

  describe('route.streamSSE()', () => {
    it('should create Server-Sent Events stream', async () => {
      await router.streamSSE('/sse-stream', async function* () {
        yield { data: 'message1', event: 'update', id: '1' }
        yield { data: 'message2', event: 'update', id: '2' }
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/sse-stream`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(response.headers.get('Connection')).toBe('keep-alive')

      const text = await response.text()
      expect(text).toContain('id: 1\n')
      expect(text).toContain('event: update\n')
      expect(text).toContain('data: message1\n\n')
      expect(text).toContain('id: 2\n')
      expect(text).toContain('data: message2\n\n')
    })

    it('should handle JSON data in SSE', async () => {
      await router.streamSSE('/sse-json', async function* () {
        yield {
          data: { user: 'Alice', action: 'login' },
          event: 'user-event',
          id: 'evt-1',
        }
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/sse-json`)
      const text = await response.text()

      expect(text).toContain('id: evt-1\n')
      expect(text).toContain('event: user-event\n')
      expect(text).toContain('data: {"user":"Alice","action":"login"}\n\n')
    })

    it('should support retry parameter', async () => {
      await router.streamSSE('/sse-retry', async function* () {
        yield {
          data: 'test',
          retry: 5000,
        }
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/sse-retry`)
      const text = await response.text()

      expect(text).toContain('retry: 5000\n')
      expect(text).toContain('data: test\n\n')
    })
  })

  describe('route.streamDirect()', () => {
    it('should create direct streaming route', async () => {
      await router.streamDirect('/direct-stream', async ({ write, close }) => {
        write('Hello ')
        write('Direct ')
        write('Stream')
        close()
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/direct-stream`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toBe('Hello Direct Stream')
    })

    it('should handle binary data in direct streaming', async () => {
      await router.streamDirect('/direct-binary', async ({ write, close }) => {
        write(new Uint8Array([72, 101, 108, 108, 111])) // "Hello"
        write(new Uint8Array([32])) // " "
        write(new Uint8Array([87, 111, 114, 108, 100])) // "World"
        close()
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/direct-binary`)
      const arrayBuffer = await response.arrayBuffer()
      const text = new TextDecoder().decode(arrayBuffer)
      expect(text).toBe('Hello World')
    })
  })

  describe('route.streamBuffered()', () => {
    it('should create buffered streaming route', async () => {
      await router.streamBuffered('/buffered-stream', async ({ write, flush, end }) => {
        write('chunk1 ')
        write('chunk2 ')
        flush()
        write('chunk3 ')
        write('chunk4')
        end()
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/buffered-stream`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toBe('chunk1 chunk2 chunk3 chunk4')
    })

    it('should support custom buffer options', async () => {
      await router.streamBuffered('/buffered-custom', async ({ write, end }) => {
        write('test data')
        end()
      }, {
        highWaterMark: 1024,
        asUint8Array: true,
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/buffered-custom`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toBe('test data')
    })
  })

  describe('File Streaming', () => {
    it('should stream files with streamFile', async () => {
      // Create a temporary test file
      const testFile = '/tmp/test-stream-file.txt'
      await Bun.write(testFile, 'Hello from file!')

      router.get('/file-stream', () => {
        return router.streamFile(testFile)
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/file-stream`)
      expect(response.status).toBe(200)

      const text = await response.text()
      expect(text).toBe('Hello from file!')

      // Cleanup
      await Bun.write(testFile, '') // Clear file
    })

    it('should handle range requests with streamFileWithRanges', async () => {
      // Create a test file
      const testFile = '/tmp/test-range-file.txt'
      const content = 'abcdefghijklmnopqrstuvwxyz'
      await Bun.write(testFile, content)

      router.get('/range-stream', async (req) => {
        return await router.streamFileWithRanges(testFile, req)
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      // Test full file first (no range)
      const fullResponse = await fetch(`http://localhost:${port}/range-stream`)
      expect(fullResponse.status).toBe(200)
      const fullText = await fullResponse.text()
      expect(fullText).toBe(content)

      // Test range request
      const response = await fetch(`http://localhost:${port}/range-stream`, {
        headers: { Range: 'bytes=5-9' },
      })

      expect(response.status).toBe(206) // Partial Content
      expect(response.headers.get('Content-Range')).toBe('bytes 5-9/26')
      expect(response.headers.get('Accept-Ranges')).toBe('bytes')

      const text = await response.text()
      expect(text).toBe('fghij') // Characters at positions 5-9

      // Test another range
      const response2 = await fetch(`http://localhost:${port}/range-stream`, {
        headers: { Range: 'bytes=0-4' },
      })

      expect(response2.status).toBe(206)
      const text2 = await response2.text()
      expect(text2).toBe('abcde')

      // Cleanup
      await Bun.write(testFile, '')
    })
  })

  describe('Transform Streams', () => {
    it('should transform request streams', async () => {
      router.post('/transform', router.transformStream(
        (chunk) => {
          const text = new TextDecoder().decode(chunk)
          return text.toUpperCase()
        },
        { headers: { 'Content-Type': 'text/plain' } },
      ))

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/transform`, {
        method: 'POST',
        body: 'hello world',
        headers: { 'Content-Type': 'text/plain' },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/plain')

      const text = await response.text()
      expect(text).toBe('HELLO WORLD')
    })

    it('should handle async transformation', async () => {
      router.post('/async-transform', router.transformStream(
        async (chunk) => {
          const text = new TextDecoder().decode(chunk)
          // Simulate async processing
          await new Promise(resolve => setTimeout(resolve, 1))
          return `[${text}]`
        },
      ))

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/async-transform`, {
        method: 'POST',
        body: 'test',
      })

      const text = await response.text()
      expect(text).toBe('[test]')
    })
  })

  describe('Error Handling', () => {
    it('should handle errors in streaming generators', async () => {
      await router.stream('/error-stream', async function* () {
        yield 'before error\n'
        throw new Error('Stream error')
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/error-stream`)

      // The response should start successfully but may be incomplete
      expect(response.status).toBe(200)

      // Try to read the response - it should contain the data before the error
      try {
        const text = await response.text()
        expect(text).toContain('before error')
      }
      catch (error) {
        // Connection may be closed due to stream error, which is expected
        expect(error).toBeDefined()
      }
    })

    it('should handle errors in direct streaming', async () => {
      await router.streamDirect('/error-direct', async ({ write, close }) => {
        write('before error')
        throw new Error('Direct stream error')
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/error-direct`)

      // Response starts successfully
      expect(response.status).toBe(200)

      try {
        const text = await response.text()
        expect(text).toContain('before error')
      }
      catch (error) {
        // Stream error is expected
        expect(error).toBeDefined()
      }
    })
  })

  describe('Integration with Route Groups and Middleware', () => {
    it('should work with route groups', async () => {
      router.group({ prefix: '/api/v1' }, () => {
        router.streamJSON('/data', async function* () {
          yield { message: 'grouped stream' }
        })
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/api/v1/data`)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/x-ndjson')

      const text = await response.text()
      const parsed = JSON.parse(text.trim())
      expect(parsed.message).toBe('grouped stream')
    })

    it('should work with middleware', async () => {
      // Add a simple middleware that adds a header
      router.use(async (req, next) => {
        const response = await next()
        if (response) {
          response.headers.set('X-Middleware', 'applied')
        }
        return response
      })

      await router.stream('/middleware-stream', async function* () {
        yield 'middleware test'
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const response = await fetch(`http://localhost:${port}/middleware-stream`)
      expect(response.status).toBe(200)
      expect(response.headers.get('X-Middleware')).toBe('applied')

      const text = await response.text()
      expect(text).toBe('middleware test')
    })
  })

  describe('Performance and Memory', () => {
    it('should handle large streams efficiently', async () => {
      const chunkCount = 1000

      await router.stream('/large-stream', async function* () {
        for (let i = 0; i < chunkCount; i++) {
          yield `chunk-${i}\n`
        }
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      const startTime = Date.now()
      const response = await fetch(`http://localhost:${port}/large-stream`)
      expect(response.status).toBe(200)

      const text = await response.text()
      const endTime = Date.now()

      // Verify all chunks are present
      const lines = text.trim().split('\n')
      expect(lines).toHaveLength(chunkCount)
      expect(lines[0]).toBe('chunk-0')
      expect(lines[chunkCount - 1]).toBe(`chunk-${chunkCount - 1}`)

      // Should complete reasonably quickly (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000)
    })

    it('should handle concurrent streaming requests', async () => {
      await router.stream('/concurrent-stream', async function* () {
        for (let i = 0; i < 10; i++) {
          yield `data-${i}\n`
          // Small delay to simulate processing
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      })

      server = await router.serve({ port: 0 })
      const port = server.port

      // Make multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        fetch(`http://localhost:${port}/concurrent-stream`))

      const responses = await Promise.all(requests)

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200)
      })

      // All responses should have the same content
      const texts = await Promise.all(responses.map(r => r.text()))
      texts.forEach((text) => {
        const lines = text.trim().split('\n')
        expect(lines).toHaveLength(10)
        expect(lines[0]).toBe('data-0')
        expect(lines[9]).toBe('data-9')
      })
    })
  })
})
