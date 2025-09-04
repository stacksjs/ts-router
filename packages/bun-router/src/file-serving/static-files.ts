/**
 * Static File Serving
 *
 * Efficient file serving using Bun.file() with advanced caching and optimization
 */

import { Buffer } from 'node:buffer'

export interface StaticFileConfig {
  root: string
  maxAge?: number
  immutable?: boolean
  etag?: boolean
  lastModified?: boolean
  index?: string[]
  extensions?: string[]
  fallthrough?: boolean
  setHeaders?: (res: Response, path: string, stat: any) => void
  compression?: boolean
  compressionThreshold?: number
  cacheControl?: string
  dotfiles?: 'allow' | 'deny' | 'ignore'
}

export interface FileCache {
  content: ArrayBuffer
  etag: string
  lastModified: string
  mimeType: string
  size: number
  compressed?: ArrayBuffer
  compressedEtag?: string
}

export interface FileStats {
  hits: number
  misses: number
  bytesServed: number
  compressionRatio: number
  averageResponseTime: number
  lastAccessed: number
}

/**
 * High-performance static file server using Bun.file()
 */
export class StaticFileServer {
  private config: Required<StaticFileConfig>
  private cache = new Map<string, FileCache>()
  private stats = new Map<string, FileStats>()
  private compressionCache = new Map<string, ArrayBuffer>()

  constructor(config: StaticFileConfig) {
    this.config = {
      root: config.root,
      maxAge: config.maxAge ?? 86400, // 1 day
      immutable: config.immutable ?? false,
      etag: config.etag ?? true,
      lastModified: config.lastModified ?? true,
      index: config.index ?? ['index.html', 'index.htm'],
      extensions: config.extensions ?? [],
      fallthrough: config.fallthrough ?? true,
      setHeaders: config.setHeaders ?? (() => {}),
      compression: config.compression ?? true,
      compressionThreshold: config.compressionThreshold ?? 1024,
      cacheControl: config.cacheControl ?? '',
      dotfiles: config.dotfiles ?? 'ignore',
      ...config,
    }
  }

  /**
   * Serve static file
   */
  async serve(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    let pathname = decodeURIComponent(url.pathname)

    // Security: prevent directory traversal
    if (pathname.includes('..') || pathname.includes('\0')) {
      return new Response('Forbidden', { status: 403 })
    }

    // Handle dotfiles
    if (this.config.dotfiles !== 'allow' && pathname.includes('/.')) {
      if (this.config.dotfiles === 'deny') {
        return new Response('Forbidden', { status: 403 })
      }
      if (this.config.fallthrough) {
        return null
      }
    }

    // Try to serve file
    const filePath = await this.resolveFile(pathname)
    if (!filePath) {
      return this.config.fallthrough ? null : new Response('Not Found', { status: 404 })
    }

    return await this.serveFile(request, filePath, pathname)
  }

  /**
   * Serve specific file
   */
  async serveFile(request: Request, filePath: string, requestPath: string): Promise<Response> {
    const startTime = performance.now()

    try {
      // Check cache first
      const cached = this.cache.get(filePath)
      const file = Bun.file(filePath)

      // Check if file exists and get stats
      const exists = await file.exists()
      if (!exists) {
        return new Response('Not Found', { status: 404 })
      }

      const lastModified = new Date(file.lastModified).toUTCString()
      const size = file.size

      // Check if cached version is still valid
      if (cached && cached.lastModified === lastModified) {
        return this.serveCachedFile(request, cached, requestPath, startTime)
      }

      // Read and cache file
      const content = await file.arrayBuffer()
      const mimeType = file.type || this.getMimeType(filePath)
      const etag = this.generateEtag(content, lastModified)

      const fileCache: FileCache = {
        content,
        etag,
        lastModified,
        mimeType,
        size,
      }

      // Compress if enabled and file is large enough
      if (this.config.compression && size >= this.config.compressionThreshold) {
        const compressed = await this.compressContent(content)
        if (compressed && compressed.byteLength < content.byteLength) {
          fileCache.compressed = compressed
          fileCache.compressedEtag = this.generateEtag(compressed, lastModified)
        }
      }

      this.cache.set(filePath, fileCache)
      return this.serveCachedFile(request, fileCache, requestPath, startTime)
    }
    catch (error) {
      console.error('Error serving file:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  /**
   * Serve cached file with proper headers
   */
  private serveCachedFile(
    request: Request,
    cached: FileCache,
    requestPath: string,
    startTime: number,
  ): Response {
    const headers = new Headers()

    // Check if client supports compression
    const acceptEncoding = request.headers.get('accept-encoding') || ''
    const supportsGzip = acceptEncoding.includes('gzip')
    const useCompressed = supportsGzip && cached.compressed

    // Set content type
    headers.set('Content-Type', cached.mimeType)

    // Set ETag
    if (this.config.etag) {
      const etag = useCompressed ? cached.compressedEtag! : cached.etag
      headers.set('ETag', etag)

      // Check if client has cached version
      const ifNoneMatch = request.headers.get('if-none-match')
      if (ifNoneMatch === etag) {
        this.updateStats(requestPath, 0, startTime, true)
        return new Response(null, { status: 304, headers })
      }
    }

    // Set Last-Modified
    if (this.config.lastModified) {
      headers.set('Last-Modified', cached.lastModified)

      // Check if client has cached version
      const ifModifiedSince = request.headers.get('if-modified-since')
      if (ifModifiedSince === cached.lastModified) {
        this.updateStats(requestPath, 0, startTime, true)
        return new Response(null, { status: 304, headers })
      }
    }

    // Set cache control
    if (this.config.cacheControl) {
      headers.set('Cache-Control', this.config.cacheControl)
    }
    else {
      const cacheControl = this.config.immutable
        ? `public, max-age=${this.config.maxAge}, immutable`
        : `public, max-age=${this.config.maxAge}`
      headers.set('Cache-Control', cacheControl)
    }

    // Set compression headers
    const content = useCompressed ? cached.compressed! : cached.content
    if (useCompressed) {
      headers.set('Content-Encoding', 'gzip')
      headers.set('Vary', 'Accept-Encoding')
    }

    headers.set('Content-Length', content.byteLength.toString())

    // Custom headers
    this.config.setHeaders(new Response(), requestPath, { size: cached.size })

    // Update stats
    this.updateStats(requestPath, content.byteLength, startTime, false)

    return new Response(content, { headers })
  }

  /**
   * Resolve file path, handling index files and extensions
   */
  private async resolveFile(pathname: string): Promise<string | null> {
    const fullPath = this.joinPath(this.config.root, pathname)

    // Try exact path first
    const file = Bun.file(fullPath)
    if (await file.exists()) {
      const stat = await file.stat()
      if (stat.isFile()) {
        return fullPath
      }

      // If directory, try index files
      if (stat.isDirectory()) {
        for (const index of this.config.index) {
          const indexPath = this.joinPath(fullPath, index)
          const indexFile = Bun.file(indexPath)
          if (await indexFile.exists()) {
            return indexPath
          }
        }
      }
    }

    // Try with extensions
    for (const ext of this.config.extensions) {
      const extPath = fullPath + ext
      const extFile = Bun.file(extPath)
      if (await extFile.exists()) {
        return extPath
      }
    }

    return null
  }

  /**
   * Join paths safely
   */
  private joinPath(...parts: string[]): string {
    return parts
      .map(part => part.replace(/^\/+|\/+$/g, ''))
      .filter(part => part.length > 0)
      .join('/')
      .replace(/^(?!\/)/, '/')
  }

  /**
   * Generate ETag for content
   */
  private generateEtag(content: ArrayBuffer, lastModified: string): string {
    const hash = Bun.hash(new Uint8Array(content))
    return `"${hash.toString(16)}-${Date.parse(lastModified).toString(16)}"`
  }

  /**
   * Compress content using gzip
   */
  private async compressContent(content: ArrayBuffer): Promise<ArrayBuffer | null> {
    try {
      const compressed = Bun.gzipSync(new Uint8Array(content))
      return compressed.buffer
    }
    catch (error) {
      console.error('Compression failed:', error)
      return null
    }
  }

  /**
   * Get MIME type for file
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()

    const mimeTypes: Record<string, string> = {
      html: 'text/html',
      htm: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      mjs: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
      eot: 'application/vnd.ms-fontobject',
      pdf: 'application/pdf',
      txt: 'text/plain',
      xml: 'application/xml',
      zip: 'application/zip',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
    }

    return mimeTypes[ext || ''] || 'application/octet-stream'
  }

  /**
   * Update file serving statistics
   */
  private updateStats(path: string, bytes: number, startTime: number, cached: boolean): void {
    const responseTime = performance.now() - startTime

    let stats = this.stats.get(path)
    if (!stats) {
      stats = {
        hits: 0,
        misses: 0,
        bytesServed: 0,
        compressionRatio: 0,
        averageResponseTime: 0,
        lastAccessed: 0,
      }
      this.stats.set(path, stats)
    }

    if (cached) {
      stats.hits++
    }
    else {
      stats.misses++
    }

    stats.bytesServed += bytes
    stats.averageResponseTime = (stats.averageResponseTime * (stats.hits + stats.misses - 1) + responseTime) / (stats.hits + stats.misses)
    stats.lastAccessed = Date.now()
  }

  /**
   * Get serving statistics
   */
  getStats(): Record<string, FileStats> {
    return Object.fromEntries(this.stats.entries())
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
    this.compressionCache.clear()
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    let size = 0
    for (const cached of this.cache.values()) {
      size += cached.content.byteLength
      if (cached.compressed) {
        size += cached.compressed.byteLength
      }
    }
    return size
  }

  /**
   * Preload files into cache
   */
  async preloadFiles(paths: string[]): Promise<void> {
    const promises = paths.map(async (path) => {
      const filePath = await this.resolveFile(path)
      if (filePath) {
        const mockRequest = new Request(`http://localhost${path}`)
        await this.serveFile(mockRequest, filePath, path)
      }
    })

    await Promise.all(promises)
  }
}

/**
 * Static file middleware factory
 */
export function createStaticFileMiddleware(config: StaticFileConfig) {
  const server = new StaticFileServer(config)

  return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
    // Only handle GET and HEAD requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return await next()
    }

    const response = await server.serve(request)

    if (response) {
      // Handle HEAD requests
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: response.status,
          headers: response.headers,
        })
      }
      return response
    }

    return await next()
  }
}

/**
 * Static file serving helpers
 */
export const StaticFileHelpers = {
  /**
   * Create development server with hot reload
   */
  createDevelopmentServer: (config: StaticFileConfig) => {
    return new StaticFileServer({
      ...config,
      maxAge: 0,
      etag: false,
      lastModified: true,
      compression: false,
    })
  },

  /**
   * Create production server with aggressive caching
   */
  createProductionServer: (config: StaticFileConfig) => {
    return new StaticFileServer({
      ...config,
      maxAge: 31536000, // 1 year
      immutable: true,
      etag: true,
      lastModified: true,
      compression: true,
      compressionThreshold: 512,
    })
  },

  /**
   * Create SPA server with fallback to index.html
   */
  createSPAServer: (config: StaticFileConfig) => {
    return new StaticFileServer({
      ...config,
      fallthrough: false,
      index: ['index.html'],
      setHeaders: (res, path) => {
        // Don't cache HTML files in SPA mode
        if (path.endsWith('.html')) {
          res.headers.set('Cache-Control', 'no-cache')
        }
      },
    })
  },

  /**
   * Create CDN-optimized server
   */
  createCDNServer: (config: StaticFileConfig) => {
    return new StaticFileServer({
      ...config,
      maxAge: 86400 * 30, // 30 days
      immutable: false,
      etag: true,
      lastModified: true,
      compression: true,
      compressionThreshold: 256,
      cacheControl: 'public, max-age=2592000, s-maxage=31536000',
    })
  },
}

/**
 * File serving utilities
 */
export const FileServingUtils = {
  /**
   * Calculate optimal cache settings based on file type
   */
  getOptimalCacheSettings: (filePath: string): Partial<StaticFileConfig> => {
    const ext = filePath.split('.').pop()?.toLowerCase()

    // Long-term cacheable assets
    if (['css', 'js', 'woff', 'woff2', 'ttf', 'eot'].includes(ext || '')) {
      return {
        maxAge: 31536000, // 1 year
        immutable: true,
        compression: true,
      }
    }

    // Images
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'].includes(ext || '')) {
      return {
        maxAge: 86400 * 7, // 1 week
        immutable: false,
        compression: ext === 'svg',
      }
    }

    // HTML files
    if (['html', 'htm'].includes(ext || '')) {
      return {
        maxAge: 3600, // 1 hour
        immutable: false,
        compression: true,
      }
    }

    // Default
    return {
      maxAge: 86400, // 1 day
      immutable: false,
      compression: true,
    }
  },

  /**
   * Generate security headers for static files
   */
  generateSecurityHeaders: (): Record<string, string> => {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    }
  },

  /**
   * Create file watcher for cache invalidation
   */
  createFileWatcher: (server: StaticFileServer, watchPath: string) => {
    const watcher = require('node:fs').watch(watchPath, { recursive: true }, (eventType: string, filename: string) => {
      if (eventType === 'change' || eventType === 'rename') {
        server.clearCache()
        console.warn(`File changed: ${filename}, cache cleared`)
      }
    })

    return {
      close: () => watcher.close(),
    }
  },
}
