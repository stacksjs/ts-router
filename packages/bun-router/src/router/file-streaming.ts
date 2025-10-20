import type {
  DirectStreamConfig,
  EnhancedRequest,
} from '../types'
import type { Router } from './router'
import { FileStreamHandler, StreamHandler, StreamUtils } from '../streaming/stream-handler'

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
        filePath: string,
        request: EnhancedRequest,
        options?: {
          contentType?: string
          enableRanges?: boolean
          chunkSize?: number
        },
      ): Promise<Response> {
        return FileStreamHandler.streamFile(filePath, request, options as any)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Stream a file with range support (for video/audio streaming)
     */
    streamFileWithRanges: {
      async value(filePath: string, req: EnhancedRequest): Promise<Response> {
        return FileStreamHandler.streamFile(filePath, req, { enableRanges: true })
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
     * Laravel-style response()->stream() method
     * Creates a streaming response using a generator function
     */
    stream: {
      value(
        callback: () => Generator<string | Uint8Array, void, unknown> | AsyncGenerator<string | Uint8Array, void, unknown>,
        status: number = 200,
        headers: Record<string, string> = {},
      ): Response {
        const responseHeaders = new Headers(headers)

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()

            try {
              for await (const chunk of callback()) {
                if (typeof chunk === 'string') {
                  controller.enqueue(encoder.encode(chunk))
                }
                else {
                  controller.enqueue(chunk)
                }
              }
              controller.close()
            }
            catch (error) {
              controller.error(error)
            }
          },
        })

        return new Response(stream, {
          status,
          headers: responseHeaders,
        })
      },
      writable: true,
      configurable: true,
    },

    /**
     * Laravel-style response()->streamJson() method
     * Stream JSON data progressively
     */
    streamJson: {
      value<T>(
        data: { [key: string]: Iterable<T> | AsyncIterable<T> },
        status: number = 200,
        headers: Record<string, string> = {},
      ): Response {
        const responseHeaders = new Headers({
          'Content-Type': 'application/json',
          ...headers,
        })

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()

            try {
              controller.enqueue(encoder.encode('{'))

              const keys = Object.keys(data)
              for (let i = 0; i < keys.length; i++) {
                const key = keys[i]
                const value = data[key]

                // Start the key
                controller.enqueue(encoder.encode(`"${key}":[`))

                let isFirst = true
                for await (const item of value) {
                  if (!isFirst) {
                    controller.enqueue(encoder.encode(','))
                  }
                  controller.enqueue(encoder.encode(JSON.stringify(item)))
                  isFirst = false
                }

                controller.enqueue(encoder.encode(']'))

                if (i < keys.length - 1) {
                  controller.enqueue(encoder.encode(','))
                }
              }

              controller.enqueue(encoder.encode('}'))
              controller.close()
            }
            catch (error) {
              controller.error(error)
            }
          },
        })

        return new Response(stream, {
          status,
          headers: responseHeaders,
        })
      },
      writable: true,
      configurable: true,
    },

    /**
     * Laravel-style response()->eventStream() method
     * Creates Server-Sent Events stream
     */
    eventStream: {
      value(
        callback: () => Generator<{ data: any, event?: string, id?: string, retry?: number }, void, unknown> | AsyncGenerator<{ data: any, event?: string, id?: string, retry?: number }, void, unknown>,
        headers: Record<string, string> = {},
      ): Response {
        const responseHeaders = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
          ...headers,
        })

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()

            try {
              for await (const event of callback()) {
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

                controller.enqueue(encoder.encode(sseData))
              }

              controller.close()
            }
            catch (error) {
              controller.error(error)
            }
          },
        })

        return new Response(stream, {
          status: 200,
          headers: responseHeaders,
        })
      },
      writable: true,
      configurable: true,
    },

    /**
     * Laravel-style response()->streamDownload() method
     * Stream a download without writing to disk
     */
    streamDownload: {
      value(
        callback: () => Generator<string | Uint8Array, void, unknown> | AsyncGenerator<string | Uint8Array, void, unknown>,
        filename: string,
        headers: Record<string, string> = {},
      ): Response {
        const responseHeaders = new Headers({
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
          ...headers,
        })

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()

            try {
              for await (const chunk of callback()) {
                if (typeof chunk === 'string') {
                  controller.enqueue(encoder.encode(chunk))
                }
                else {
                  controller.enqueue(chunk)
                }
              }
              controller.close()
            }
            catch (error) {
              controller.error(error)
            }
          },
        })

        return new Response(stream, {
          status: 200,
          headers: responseHeaders,
        })
      },
      writable: true,
      configurable: true,
    },

    /**
     * Stream async iterator utility
     */
    streamAsyncIterator: {
      value<T>(
        iterator: AsyncIterable<T>,
        options: DirectStreamConfig = {},
      ): Response {
        const streamResponse = StreamHandler.direct(iterator, options)
        return streamResponse.toResponse()
      },
      writable: true,
      configurable: true,
    },
  })
}
