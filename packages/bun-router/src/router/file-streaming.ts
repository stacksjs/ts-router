import type { Router } from './core'
import { stat } from 'node:fs/promises'

/**
 * File streaming extension for Router class
 */
export function registerFileStreaming(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Stream a file as a response
     */
    streamFile: {
      value(
        path: string,
        options?: { headers?: Record<string, string>, status?: number },
      ): Response {
        const file = Bun.file(path)
        const headers = new Headers()

        // Set content type based on file extension
        headers.set('Content-Type', file.type)

        // Add custom headers if provided
        if (options?.headers) {
          for (const [key, value] of Object.entries(options.headers)) {
            headers.set(key, value)
          }
        }

        return new Response(file, {
          status: options?.status || 200,
          headers,
        })
      },
      writable: true,
      configurable: true,
    },

    /**
     * Stream a file with range support (for video/audio streaming)
     */
    streamFileWithRanges: {
      async value(path: string, req: Request): Promise<Response> {
        const fileInfo = await stat(path)
        const fileSize = fileInfo.size

        const range = req.headers.get('range')
        if (!range) {
          // No range requested, serve the entire file
          return this.streamFile(path)
        }

        // Parse the range header
        const rangeMatch = range.match(/bytes=(\d+)-(\d*)/)
        if (!rangeMatch) {
          // Invalid range header
          return new Response('Invalid range header', { status: 416 })
        }

        const start = Number.parseInt(rangeMatch[1], 10)
        const end = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : fileSize - 1

        // Validate range
        if (start >= fileSize || end >= fileSize || start > end) {
          // Range not satisfiable
          return new Response('Range not satisfiable', { status: 416 })
        }

        // Create file stream with the specified range
        const file = Bun.file(path)
        const arrayBuffer = await file.arrayBuffer()
        const rangeData = arrayBuffer.slice(start, end + 1)

        const headers = new Headers()
        headers.set('Content-Type', file.type || 'application/octet-stream')
        headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        headers.set('Accept-Ranges', 'bytes')
        headers.set('Content-Length', String(end - start + 1))

        return new Response(rangeData, {
          status: 206, // Partial Content
          headers,
        })
      },
      writable: true,
      configurable: true,
    },

    /**
     * Register a health check route
     */
    health: {
      async value(): Promise<Router> {
        const path = '/health'
        const fullPath = this.config.apiPrefix ? `${this.config.apiPrefix}${path}` : path

        await this.get(fullPath, () => {
          return new Response('OK', {
            headers: {
              'Content-Type': 'text/plain',
            },
          })
        })

        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Create a streaming response using Bun's optimized async generator support
     */
    streamResponse: {
      value(
        generator: () => AsyncGenerator<string | Uint8Array, void, unknown>,
        options?: { headers?: Record<string, string>, status?: number },
      ): Response {
        const headers = new Headers()

        // Add custom headers if provided
        if (options?.headers) {
          for (const [key, value] of Object.entries(options.headers)) {
            headers.set(key, value)
          }
        }

        // Use Bun's native async generator support for Response
        return new Response(generator(), {
          status: options?.status || 200,
          headers,
        })
      },
      writable: true,
      configurable: true,
    },

    /**
     * Transform an incoming stream using Bun's TransformStream
     */
    transformStream: {
      value(
        transformer: (chunk: string | Uint8Array) => string | Uint8Array | Promise<string | Uint8Array>,
        options?: { headers?: Record<string, string>, status?: number },
      ): (req: Request) => Response {
        return (req: Request) => {
          if (!req.body) {
            throw new Error('Request body is required for stream transformation')
          }

          const transformedStream = new TransformStream({
            async transform(chunk, controller) {
              try {
                const result = await transformer(chunk)
                if (typeof result === 'string') {
                  controller.enqueue(new TextEncoder().encode(result))
                }
                else {
                  controller.enqueue(result)
                }
              }
              catch (error) {
                controller.error(error)
              }
            },
          })

          const headers = new Headers()

          // Add custom headers if provided
          if (options?.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
              headers.set(key, value)
            }
          }

          return new Response(
            req.body.pipeThrough(transformedStream),
            {
              status: options?.status || 200,
              headers,
            },
          )
        }
      },
      writable: true,
      configurable: true,
    },

    /**
     * Register a streaming route (default to async generator streaming)
     */
    stream: {
      async value(
        path: string,
        generator: () => AsyncGenerator<string | Uint8Array, void, unknown>,
        options?: { headers?: Record<string, string>, status?: number },
      ): Promise<Router> {
        await this.get(path, () => {
          const headers = new Headers()

          // Add custom headers if provided
          if (options?.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
              headers.set(key, value)
            }
          }

          // Use Bun's native async generator support for Response
          return new Response(generator(), {
            status: options?.status || 200,
            headers,
          })
        })

        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Register a JSON streaming route (NDJSON)
     */
    streamJSONRoute: {
      async value(
        path: string,
        generator: () => AsyncGenerator<any, void, unknown>,
        options?: { headers?: Record<string, string>, status?: number },
      ): Promise<Router> {
        await this.get(path, () => {
          const jsonGenerator = async function* () {
            for await (const item of generator()) {
              yield `${JSON.stringify(item)}\n`
            }
          }

          const headers = new Headers()
          headers.set('Content-Type', 'application/x-ndjson')

          // Add custom headers if provided
          if (options?.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
              headers.set(key, value)
            }
          }

          return new Response(jsonGenerator(), {
            status: options?.status || 200,
            headers,
          })
        })

        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Alias for streamJSONRoute for cleaner API
     */
    streamJSON: {
      async value(
        path: string,
        generator: () => AsyncGenerator<any, void, unknown>,
        options?: { headers?: Record<string, string>, status?: number },
      ): Promise<Router> {
        return this.streamJSONRoute(path, generator, options)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Register a Server-Sent Events (SSE) streaming route
     */
    streamSSE: {
      async value(
        path: string,
        generator: () => AsyncGenerator<{ data: any, event?: string, id?: string, retry?: number }, void, unknown>,
        options?: { headers?: Record<string, string> },
      ): Promise<Router> {
        await this.get(path, () => {
          const sseGenerator = async function* () {
            for await (const event of generator()) {
              let sseData = ''

              if (event.id) {
                sseData += `id: ${event.id}\n`
              }

              if (event.event) {
                sseData += `event: ${event.event}\n`
              }

              if (event.retry) {
                sseData += `retry: ${event.retry}\n`
              }

              const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
              sseData += `data: ${data}\n\n`

              yield sseData
            }
          }

          const headers = new Headers()
          headers.set('Content-Type', 'text/event-stream')
          headers.set('Cache-Control', 'no-cache')
          headers.set('Connection', 'keep-alive')
          headers.set('Access-Control-Allow-Origin', '*')
          headers.set('Access-Control-Allow-Headers', 'Cache-Control')

          // Add custom headers if provided
          if (options?.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
              headers.set(key, value)
            }
          }

          return new Response(sseGenerator(), {
            status: 200,
            headers,
          })
        })

        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Register a direct streaming route for high-performance scenarios
     */
    streamDirect: {
      async value(
        path: string,
        writer: (controller: { write: (chunk: string | Uint8Array) => void, close: () => void }) => Promise<void> | void,
        options?: { headers?: Record<string, string>, status?: number },
      ): Promise<Router> {
        await this.get(path, () => {
          const stream = new ReadableStream({
            type: 'direct',
            async pull(controller) {
              await writer({
                write: (chunk: string | Uint8Array) => {
                  if (typeof chunk === 'string') {
                    controller.write(new TextEncoder().encode(chunk))
                  }
                  else {
                    controller.write(chunk)
                  }
                },
                close: () => controller.close(),
              })
            },
          })

          const headers = new Headers()

          // Add custom headers if provided
          if (options?.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
              headers.set(key, value)
            }
          }

          return new Response(stream, {
            status: options?.status || 200,
            headers,
          })
        })

        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Register a buffered streaming route using Bun.ArrayBufferSink
     */
    streamBuffered: {
      async value(
        path: string,
        writer: (sink: { write: (chunk: string | Uint8Array | ArrayBuffer) => void, flush: () => void, end: () => void }) => Promise<void> | void,
        options?: { headers?: Record<string, string>, status?: number, highWaterMark?: number, asUint8Array?: boolean },
      ): Promise<Router> {
        await this.get(path, () => {
          const stream = new ReadableStream({
            type: 'direct',
            async pull(controller) {
              const sink = new Bun.ArrayBufferSink()
              sink.start({
                stream: true,
                highWaterMark: options?.highWaterMark || 64 * 1024, // 64KB default
                asUint8Array: options?.asUint8Array || false,
              })

              await writer({
                write: (chunk: string | Uint8Array | ArrayBuffer) => {
                  sink.write(chunk)
                },
                flush: () => {
                  const data = sink.flush()
                  if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                    controller.write(data)
                  }
                },
                end: () => {
                  const final = sink.end()
                  if (final instanceof ArrayBuffer || final instanceof Uint8Array) {
                    controller.write(final)
                  }
                  controller.close()
                },
              })
            },
          })

          const headers = new Headers()

          // Add custom headers if provided
          if (options?.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
              headers.set(key, value)
            }
          }

          return new Response(stream, {
            status: options?.status || 200,
            headers,
          })
        })

        return this
      },
      writable: true,
      configurable: true,
    },
  })
}
