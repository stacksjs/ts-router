import type {
  BufferedStreamConfig,
  ContentType,
  DirectStreamConfig,
  EnhancedRequest,
  ResponseStatus,
  StreamingCompression,
  StreamingFormat,
} from '../types'

/**
 * Base streaming configuration
 */
export interface BaseStreamConfig {
  contentType?: ContentType
  headers?: Record<string, string>
  status?: ResponseStatus
  bufferSize?: number
  enableCompression?: boolean
  compressionType?: StreamingCompression
}

/**
 * Stream response wrapper
 */
export class StreamResponse {
  private stream: ReadableStream
  private headers: Headers
  private status: ResponseStatus

  constructor(
    stream: ReadableStream,
    options: {
      headers?: Headers | Record<string, string>
      status?: ResponseStatus
      contentType?: ContentType
    } = {},
  ) {
    this.stream = stream
    this.status = options.status || 200
    this.headers = new Headers(options.headers)

    if (options.contentType) {
      this.headers.set('Content-Type', options.contentType)
    }
  }

  toResponse(): Response {
    return new Response(this.stream, {
      status: this.status,
      headers: this.headers,
    })
  }

  addHeader(name: string, value: string): this {
    this.headers.set(name, value)
    return this
  }

  setContentType(contentType: ContentType): this {
    this.headers.set('Content-Type', contentType)
    return this
  }

  setStatus(status: ResponseStatus): this {
    this.status = status
    return this
  }
}

/**
 * Generic streaming handler
 */
export class StreamHandler {
  /**
   * Create a direct stream response
   */
  static direct<T>(
    data: T[] | AsyncIterable<T>,
    config: DirectStreamConfig = {},
  ): StreamResponse {
    const {
      format = 'json',
      delimiter = '\n',
      contentType,
      headers = {},
      status = 200,
      enableCompression = false,
    } = config

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder()
          let isFirst = true

          for await (const item of Array.isArray(data) ? data : data) {
            if (!isFirst && delimiter) {
              controller.enqueue(encoder.encode(delimiter))
            }

            const formatted = StreamHandler.formatData(item, format)
            controller.enqueue(encoder.encode(formatted))
            isFirst = false
          }

          controller.close()
        }
        catch (error) {
          controller.error(error)
        }
      },
    })

    const responseHeaders = new Headers(headers)
    if (contentType) {
      responseHeaders.set('Content-Type', contentType)
    }
    else {
      responseHeaders.set('Content-Type', StreamHandler.getContentTypeForFormat(format))
    }

    return new StreamResponse(stream, {
      headers: responseHeaders,
      status,
    })
  }

  /**
   * Create a buffered stream response
   */
  static buffered<T>(
    data: T[] | AsyncIterable<T>,
    config: BufferedStreamConfig = {},
  ): StreamResponse {
    const {
      format = 'json',
      bufferSize = 1024,
      flushInterval = 100,
      contentType,
      headers = {},
      status = 200,
    } = config

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder()
          let buffer: string[] = []
          let bufferLength = 0

          const flush = () => {
            if (buffer.length > 0) {
              const chunk = buffer.join('')
              controller.enqueue(encoder.encode(chunk))
              buffer = []
              bufferLength = 0
            }
          }

          // Set up flush interval
          const flushTimer = setInterval(flush, flushInterval)

          try {
            for await (const item of Array.isArray(data) ? data : data) {
              const formatted = StreamHandler.formatData(item, format)
              buffer.push(formatted)
              bufferLength += formatted.length

              if (bufferLength >= bufferSize) {
                flush()
              }
            }

            // Final flush
            flush()
          }
          finally {
            clearInterval(flushTimer)
          }

          controller.close()
        }
        catch (error) {
          controller.error(error)
        }
      },
    })

    const responseHeaders = new Headers(headers)
    if (contentType) {
      responseHeaders.set('Content-Type', contentType)
    }
    else {
      responseHeaders.set('Content-Type', StreamHandler.getContentTypeForFormat(format))
    }

    return new StreamResponse(stream, {
      headers: responseHeaders,
      status,
    })
  }

  /**
   * Create a JSON stream response
   */
  static json<T>(
    data: T[] | AsyncIterable<T>,
    config: BaseStreamConfig = {},
  ): StreamResponse {
    return StreamHandler.direct(data, {
      ...config,
      format: 'json',
      contentType: config.contentType || 'application/json',
    })
  }

  /**
   * Create a text stream response
   */
  static text(
    data: string[] | AsyncIterable<string>,
    config: BaseStreamConfig = {},
  ): StreamResponse {
    return StreamHandler.direct(data, {
      ...config,
      format: 'text',
      contentType: config.contentType || 'text/plain',
    })
  }

  /**
   * Create a CSV stream response
   */
  static csv<T extends Record<string, any>>(
    data: T[] | AsyncIterable<T>,
    config: BaseStreamConfig & { headers?: string[] } = {},
  ): StreamResponse {
    const { headers: csvHeaders, ...streamConfig } = config

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder()
          const isFirst = true

          // Write CSV headers if provided
          if (csvHeaders && csvHeaders.length > 0) {
            controller.enqueue(encoder.encode(`${csvHeaders.join(',')}\n`))
          }

          for await (const item of Array.isArray(data) ? data : data) {
            const csvRow = StreamHandler.objectToCsvRow(item, csvHeaders)
            controller.enqueue(encoder.encode(`${csvRow}\n`))
          }

          controller.close()
        }
        catch (error) {
          controller.error(error)
        }
      },
    })

    return new StreamResponse(stream, {
      headers: streamConfig.headers,
      status: streamConfig.status,
      contentType: streamConfig.contentType || 'text/csv',
    })
  }

  /**
   * Format data according to the specified format
   */
  private static formatData<T>(data: T, format: StreamingFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(data)
      case 'text':
        return String(data)
      case 'csv':
        return typeof data === 'object' ? StreamHandler.objectToCsvRow(data as Record<string, any>) : String(data)
      case 'ndjson':
        return JSON.stringify(data)
      default:
        return JSON.stringify(data)
    }
  }

  /**
   * Convert object to CSV row
   */
  private static objectToCsvRow(obj: Record<string, any>, headers?: string[]): string {
    const keys = headers || Object.keys(obj)
    return keys.map((key) => {
      const value = obj[key]
      const stringValue = value === null || value === undefined ? '' : String(value)
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    }).join(',')
  }

  /**
   * Get appropriate content type for format
   */
  private static getContentTypeForFormat(format: StreamingFormat): ContentType {
    switch (format) {
      case 'json':
      case 'ndjson':
        return 'application/json'
      case 'text':
        return 'text/plain'
      case 'csv':
        return 'text/csv'
      default:
        return 'application/json'
    }
  }
}

/**
 * Stream utilities
 */
export const StreamUtils = {
  /**
   * Create a transform stream
   */
  transform<T, U>(
    transformFn: (chunk: T) => U | Promise<U>,
  ): TransformStream<T, U> {
    return new TransformStream({
      async transform(chunk, controller) {
        try {
          const transformed = await transformFn(chunk)
          controller.enqueue(transformed)
        }
        catch (error) {
          controller.error(error)
        }
      },
    })
  },

  /**
   * Create a filter stream
   */
  filter<T>(
    filterFn: (chunk: T) => boolean | Promise<boolean>,
  ): TransformStream<T, T> {
    return new TransformStream({
      async transform(chunk, controller) {
        try {
          const shouldInclude = await filterFn(chunk)
          if (shouldInclude) {
            controller.enqueue(chunk)
          }
        }
        catch (error) {
          controller.error(error)
        }
      },
    })
  },

  /**
   * Create a batch stream
   */
  batch<T>(batchSize: number): TransformStream<T, T[]> {
    let batch: T[] = []

    return new TransformStream({
      transform(chunk, controller) {
        batch.push(chunk)
        if (batch.length >= batchSize) {
          controller.enqueue([...batch])
          batch = []
        }
      },
      flush(controller) {
        if (batch.length > 0) {
          controller.enqueue(batch)
        }
      },
    })
  },

  /**
   * Create a delay stream
   */
  delay<T>(ms: number): TransformStream<T, T> {
    return new TransformStream({
      async transform(chunk, controller) {
        await new Promise(resolve => setTimeout(resolve, ms))
        controller.enqueue(chunk)
      },
    })
  },

  /**
   * Create a rate limit stream
   */
  rateLimit<T>(itemsPerSecond: number): TransformStream<T, T> {
    const interval = 1000 / itemsPerSecond
    let lastEmit = 0

    return new TransformStream({
      async transform(chunk, controller) {
        const now = Date.now()
        const timeSinceLastEmit = now - lastEmit

        if (timeSinceLastEmit < interval) {
          await new Promise(resolve => setTimeout(resolve, interval - timeSinceLastEmit))
        }

        lastEmit = Date.now()
        controller.enqueue(chunk)
      },
    })
  },
}

/**
 * File streaming utilities
 */
export class FileStreamHandler {
  /**
   * Stream a file with range support
   */
  static async streamFile(
    filePath: string,
    request: EnhancedRequest,
    options: {
      contentType?: ContentType
      enableRanges?: boolean
      chunkSize?: number
    } = {},
  ): Promise<Response> {
    const { contentType, enableRanges = true, chunkSize = 64 * 1024 } = options

    try {
      const file = Bun.file(filePath)
      const fileSize = file.size
      const range = enableRanges ? request.headers.get('range') : null

      if (range && enableRanges) {
        return FileStreamHandler.handleRangeRequest(file, range, contentType)
      }

      const headers = new Headers({
        'Content-Length': fileSize.toString(),
        'Accept-Ranges': enableRanges ? 'bytes' : 'none',
      })

      if (contentType) {
        headers.set('Content-Type', contentType)
      }

      return new Response(file.stream(), {
        status: 200,
        headers,
      })
    }
    catch (error) {
      return new Response('File not found', { status: 404 })
    }
  }

  /**
   * Handle range requests for file streaming
   */
  private static async handleRangeRequest(
    file: BunFile,
    rangeHeader: string,
    contentType?: ContentType,
  ): Promise<Response> {
    const ranges = FileStreamHandler.parseRangeHeader(rangeHeader, file.size)

    if (!ranges || ranges.length === 0) {
      return new Response('Invalid range', { status: 416 })
    }

    const [start, end] = ranges[0]
    const contentLength = end - start + 1

    const headers = new Headers({
      'Content-Range': `bytes ${start}-${end}/${file.size}`,
      'Content-Length': contentLength.toString(),
      'Accept-Ranges': 'bytes',
    })

    if (contentType) {
      headers.set('Content-Type', contentType)
    }

    const slice = file.slice(start, end + 1)

    return new Response(slice.stream(), {
      status: 206,
      headers,
    })
  }

  /**
   * Parse Range header
   */
  private static parseRangeHeader(rangeHeader: string, fileSize: number): [number, number][] | null {
    const matches = rangeHeader.match(/^bytes=(.+)$/)
    if (!matches)
      return null

    const ranges: [number, number][] = []
    const rangeSpecs = matches[1].split(',')

    for (const rangeSpec of rangeSpecs) {
      const [startStr, endStr] = rangeSpec.trim().split('-')

      let start: number
      let end: number

      if (startStr === '') {
        // Suffix range: -500 (last 500 bytes)
        start = Math.max(0, fileSize - Number.parseInt(endStr, 10))
        end = fileSize - 1
      }
      else if (endStr === '') {
        // Prefix range: 500- (from byte 500 to end)
        start = Number.parseInt(startStr, 10)
        end = fileSize - 1
      }
      else {
        // Full range: 500-1000
        start = Number.parseInt(startStr, 10)
        end = Number.parseInt(endStr, 10)
      }

      // Validate range
      if (start < 0 || end >= fileSize || start > end) {
        return null
      }

      ranges.push([start, end])
    }

    return ranges
  }
}
