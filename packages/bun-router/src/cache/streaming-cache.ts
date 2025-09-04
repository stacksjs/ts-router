import type { LRUCacheOptions } from './lru-cache'
import { LRUCache } from './lru-cache'

/**
 * Response streaming cache for large responses
 * Optimized for handling large payloads with memory-efficient streaming
 */

export interface StreamingCacheOptions extends Omit<LRUCacheOptions, 'maxSize'> {
  maxSize: number // Maximum number of cached responses
  maxResponseSize: number // Maximum size of individual response in bytes
  chunkSize: number // Size of chunks for streaming
  compressionEnabled: boolean // Enable gzip compression
  compressionThreshold: number // Minimum size to trigger compression
}

export interface CachedResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: Uint8Array | null
  compressed: boolean
  originalSize: number
  timestamp: number
  etag?: string
}

export interface StreamingCacheStats {
  totalResponses: number
  totalSize: number
  compressionRatio: number
  averageResponseSize: number
  largestResponse: number
  streamingHits: number
  streamingMisses: number
}

/**
 * High-performance streaming cache for large HTTP responses
 */
export class StreamingCache {
  private cache: LRUCache<CachedResponse>
  private stats: StreamingCacheStats = {
    totalResponses: 0,
    totalSize: 0,
    compressionRatio: 0,
    averageResponseSize: 0,
    largestResponse: 0,
    streamingHits: 0,
    streamingMisses: 0,
  }

  constructor(private options: StreamingCacheOptions) {
    this.cache = new LRUCache<CachedResponse>({
      maxSize: options.maxSize,
      ttl: options.ttl,
      onEvict: (key, cachedResponse) => {
        this.updateStatsOnEviction(cachedResponse)
      },
      updateAgeOnGet: options.updateAgeOnGet,
    })
  }

  /**
   * Cache a response with streaming support
   */
  async cacheResponse(
    key: string,
    response: Response,
    options: {
      ttl?: number
      forceCache?: boolean
      generateETag?: boolean
    } = {},
  ): Promise<void> {
    // Check response size before caching
    const contentLength = response.headers.get('content-length')
    const responseSize = contentLength ? Number.parseInt(contentLength, 10) : 0

    if (!options.forceCache && responseSize > this.options.maxResponseSize) {
      return // Skip caching if response is too large
    }

    try {
      // Read response body
      const bodyBuffer = await response.arrayBuffer()
      const bodyArray = new Uint8Array(bodyBuffer)
      const originalSize = bodyArray.length

      // Apply compression if enabled and size threshold is met
      let finalBody = bodyArray
      let compressed = false

      if (
        this.options.compressionEnabled
        && originalSize >= this.options.compressionThreshold
      ) {
        finalBody = await this.compressData(bodyArray)
        compressed = true
      }

      // Generate ETag if requested
      let etag: string | undefined
      if (options.generateETag) {
        etag = await this.generateETag(bodyArray)
      }

      // Create cached response
      const cachedResponse: CachedResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: this.extractHeaders(response),
        body: finalBody,
        compressed,
        originalSize,
        timestamp: Date.now(),
        etag,
      }

      // Cache the response
      this.cache.set(key, cachedResponse, options.ttl)

      // Update statistics
      this.updateStatsOnCache(originalSize, compressed ? finalBody.length : originalSize)
    }
    catch (error) {
      console.warn('Failed to cache response:', error)
    }
  }

  /**
   * Get cached response as a streaming response
   */
  async getStreamingResponse(key: string): Promise<Response | null> {
    const cachedResponse = this.cache.get(key)

    if (!cachedResponse) {
      this.stats.streamingMisses++
      return null
    }

    this.stats.streamingHits++

    try {
      // Decompress if necessary
      let body = cachedResponse.body
      if (body && cachedResponse.compressed) {
        body = await this.decompressData(body)
      }

      // Create headers
      const headers = new Headers(cachedResponse.headers)

      // Add cache-related headers
      headers.set('X-Cache', 'HIT')
      headers.set('X-Cache-Timestamp', cachedResponse.timestamp.toString())

      if (cachedResponse.etag) {
        headers.set('ETag', cachedResponse.etag)
      }

      // Create streaming response
      if (body && body.length > this.options.chunkSize) {
        return this.createStreamingResponse(body, cachedResponse, headers)
      }
      else {
        // Small response, return directly
        return new Response(body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers,
        })
      }
    }
    catch (error) {
      console.warn('Failed to create streaming response:', error)
      return null
    }
  }

  /**
   * Check if response should be cached based on headers and size
   */
  shouldCache(response: Response): boolean {
    // Don't cache error responses
    if (response.status >= 400)
      return false

    // Don't cache if explicitly marked as no-cache
    const cacheControl = response.headers.get('cache-control')
    if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
      return false
    }

    // Check content type (only cache specific types)
    const contentType = response.headers.get('content-type')
    if (contentType) {
      const cachableTypes = [
        'application/json',
        'text/html',
        'text/plain',
        'text/css',
        'application/javascript',
        'image/',
        'video/',
        'audio/',
      ]

      if (!cachableTypes.some(type => contentType.includes(type))) {
        return false
      }
    }

    return true
  }

  /**
   * Warm cache with common routes
   */
  async warmCache(routes: Array<{
    key: string
    url: string
    method?: string
    headers?: Record<string, string>
  }>): Promise<number> {
    let warmedCount = 0

    for (const route of routes) {
      try {
        const response = await fetch(route.url, {
          method: route.method || 'GET',
          headers: route.headers,
        })

        if (this.shouldCache(response)) {
          await this.cacheResponse(route.key, response, {
            forceCache: true,
            generateETag: true,
          })
          warmedCount++
        }
      }
      catch (error) {
        console.warn(`Failed to warm cache for ${route.key}:`, error)
      }
    }

    return warmedCount
  }

  /**
   * Create conditional response based on ETag
   */
  createConditionalResponse(key: string, ifNoneMatch?: string): Response | null {
    const cachedResponse = this.cache.get(key)

    if (!cachedResponse || !cachedResponse.etag) {
      return null
    }

    if (ifNoneMatch === cachedResponse.etag) {
      return new Response(null, {
        status: 304,
        statusText: 'Not Modified',
        headers: {
          'ETag': cachedResponse.etag,
          'X-Cache': 'HIT-304',
        },
      })
    }

    return null
  }

  /**
   * Get cache statistics
   */
  getStats(): StreamingCacheStats & { lruStats: any } {
    return {
      ...this.stats,
      lruStats: this.cache.getStats(),
    }
  }

  /**
   * Clear cache and reset statistics
   */
  clear(): void {
    this.cache.clear()
    this.stats = {
      totalResponses: 0,
      totalSize: 0,
      compressionRatio: 0,
      averageResponseSize: 0,
      largestResponse: 0,
      streamingHits: 0,
      streamingMisses: 0,
    }
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    return this.cache.prune()
  }

  /**
   * Create streaming response for large payloads
   */
  private createStreamingResponse(
    body: Uint8Array,
    cachedResponse: CachedResponse,
    headers: Headers,
  ): Response {
    const chunkSize = this.options.chunkSize
    let offset = 0

    const stream = new ReadableStream({
      start(controller) {
        // Set content length
        headers.set('Content-Length', body.length.toString())
      },

      pull(controller) {
        if (offset >= body.length) {
          controller.close()
          return
        }

        const chunk = body.slice(offset, offset + chunkSize)
        controller.enqueue(chunk)
        offset += chunkSize
      },
    })

    return new Response(stream, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    })
  }

  /**
   * Extract headers from response (excluding hop-by-hop headers)
   */
  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {}
    const hopByHopHeaders = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
    ])

    for (const [key, value] of response.headers.entries()) {
      if (!hopByHopHeaders.has(key.toLowerCase())) {
        headers[key] = value
      }
    }

    return headers
  }

  /**
   * Compress data using gzip
   */
  private async compressData(data: Uint8Array): Promise<Uint8Array> {
    try {
      // Use Bun's built-in compression if available
      if (typeof Bun !== 'undefined' && Bun.gzipSync) {
        return new Uint8Array(Bun.gzipSync(data))
      }

      // Fallback to CompressionStream API
      const stream = new CompressionStream('gzip')
      const writer = stream.writable.getWriter()
      const reader = stream.readable.getReader()

      writer.write(data)
      writer.close()

      const chunks: Uint8Array[] = []
      let result = await reader.read()

      while (!result.done) {
        chunks.push(result.value)
        result = await reader.read()
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const compressed = new Uint8Array(totalLength)
      let offset = 0

      for (const chunk of chunks) {
        compressed.set(chunk, offset)
        offset += chunk.length
      }

      return compressed
    }
    catch (error) {
      console.warn('Compression failed, using original data:', error)
      return data
    }
  }

  /**
   * Decompress data using gzip
   */
  private async decompressData(data: Uint8Array): Promise<Uint8Array> {
    try {
      // Use Bun's built-in decompression if available
      if (typeof Bun !== 'undefined' && Bun.gunzipSync) {
        return new Uint8Array(Bun.gunzipSync(data))
      }

      // Fallback to DecompressionStream API
      const stream = new DecompressionStream('gzip')
      const writer = stream.writable.getWriter()
      const reader = stream.readable.getReader()

      writer.write(data)
      writer.close()

      const chunks: Uint8Array[] = []
      let result = await reader.read()

      while (!result.done) {
        chunks.push(result.value)
        result = await reader.read()
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const decompressed = new Uint8Array(totalLength)
      let offset = 0

      for (const chunk of chunks) {
        decompressed.set(chunk, offset)
        offset += chunk.length
      }

      return decompressed
    }
    catch (error) {
      console.warn('Decompression failed:', error)
      return data
    }
  }

  /**
   * Generate ETag for response body
   */
  private async generateETag(data: Uint8Array): Promise<string> {
    try {
      // Use Bun's built-in hashing if available
      if (typeof Bun !== 'undefined' && Bun.hash) {
        const hash = Bun.hash(data)
        return `"${hash.toString(16)}"`
      }

      // Fallback to Web Crypto API
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = new Uint8Array(hashBuffer)
      const hashHex = Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      return `"${hashHex.slice(0, 16)}"` // Use first 16 characters
    }
    catch (error) {
      // Simple fallback hash
      let hash = 0
      for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash + data[i]) & 0xFFFFFFFF
      }
      return `"${Math.abs(hash).toString(16)}"`
    }
  }

  /**
   * Update statistics when caching a response
   */
  private updateStatsOnCache(originalSize: number, compressedSize: number): void {
    this.stats.totalResponses++
    this.stats.totalSize += compressedSize
    this.stats.largestResponse = Math.max(this.stats.largestResponse, originalSize)
    this.stats.averageResponseSize = this.stats.totalSize / this.stats.totalResponses

    if (originalSize > 0) {
      const currentRatio = compressedSize / originalSize
      this.stats.compressionRatio
        = (this.stats.compressionRatio * (this.stats.totalResponses - 1) + currentRatio)
          / this.stats.totalResponses
    }
  }

  /**
   * Update statistics when evicting a response
   */
  private updateStatsOnEviction(cachedResponse: CachedResponse): void {
    if (cachedResponse.body) {
      this.stats.totalSize -= cachedResponse.body.length
      this.stats.totalResponses--

      if (this.stats.totalResponses > 0) {
        this.stats.averageResponseSize = this.stats.totalSize / this.stats.totalResponses
      }
      else {
        this.stats.averageResponseSize = 0
      }
    }
  }
}

/**
 * Factory functions for creating streaming caches with common configurations
 */
export const createStreamingCache = {
  /**
   * Create cache optimized for API responses
   */
  api: (maxSize: number = 1000): StreamingCache =>
    new StreamingCache({
      maxSize,
      maxResponseSize: 10 * 1024 * 1024, // 10MB
      chunkSize: 64 * 1024, // 64KB chunks
      compressionEnabled: true,
      compressionThreshold: 1024, // 1KB
      ttl: 5 * 60 * 1000, // 5 minutes
    }),

  /**
   * Create cache optimized for static assets
   */
  assets: (maxSize: number = 500): StreamingCache =>
    new StreamingCache({
      maxSize,
      maxResponseSize: 50 * 1024 * 1024, // 50MB
      chunkSize: 256 * 1024, // 256KB chunks
      compressionEnabled: true,
      compressionThreshold: 10 * 1024, // 10KB
      ttl: 60 * 60 * 1000, // 1 hour
    }),

  /**
   * Create cache optimized for HTML pages
   */
  pages: (maxSize: number = 2000): StreamingCache =>
    new StreamingCache({
      maxSize,
      maxResponseSize: 5 * 1024 * 1024, // 5MB
      chunkSize: 32 * 1024, // 32KB chunks
      compressionEnabled: true,
      compressionThreshold: 512, // 512 bytes
      ttl: 10 * 60 * 1000, // 10 minutes
    }),

  /**
   * Create custom configured streaming cache
   */
  custom: (options: StreamingCacheOptions): StreamingCache =>
    new StreamingCache(options),
}
