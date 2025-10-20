import type { EnhancedRequest, Middleware, NextFunction } from '../types'
import crypto from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface CacheEntry {
  key: string
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    body: number[] // Store as number array for JSON serialization
    contentType: string
  }
  createdAt: number
  expiresAt: number
  etag?: string
  lastModified?: string
  size: number
}

export interface ResponseCacheOptions {
  enabled?: boolean
  storage?: {
    type: 'memory' | 'file' | 'hybrid'
    directory?: string
    maxSize?: number
    maxEntries?: number
  }
  ttl?: {
    default: number
    routes?: Record<string, number>
    methods?: Record<string, number>
  }
  keyGenerator?: (req: EnhancedRequest) => string
  shouldCache?: (req: EnhancedRequest, res: Response) => boolean
  varyHeaders?: string[]
  compression?: {
    enabled: boolean
    threshold: number
    algorithms: ('gzip' | 'deflate' | 'br')[]
  }
  invalidation?: {
    patterns?: string[]
    methods?: string[]
    headers?: string[]
  }
  etag?: {
    enabled: boolean
    weak: boolean
  }
  staleWhileRevalidate?: {
    enabled: boolean
    maxAge: number
  }
}

interface MemoryCacheEntry extends CacheEntry {
  accessCount: number
  lastAccessed: number
}

export class ResponseCache implements Middleware {
  private options: Required<ResponseCacheOptions>
  private memoryCache = new Map<string, MemoryCacheEntry>()
  private cacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    size: 0,
    memoryUsage: 0,
  }

  private cleanupInterval?: Timer

  constructor(options: ResponseCacheOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      storage: {
        type: options.storage?.type ?? 'hybrid',
        directory: options.storage?.directory ?? '.cache/responses',
        maxSize: options.storage?.maxSize ?? 100 * 1024 * 1024, // 100MB
        maxEntries: options.storage?.maxEntries ?? 10000,
        ...options.storage,
      },
      ttl: {
        default: options.ttl?.default ?? 300000, // 5 minutes
        routes: options.ttl?.routes ?? {},
        methods: options.ttl?.methods ?? {
          GET: 300000,
          HEAD: 300000,
          OPTIONS: 60000,
        },
        ...options.ttl,
      },
      keyGenerator: options.keyGenerator ?? this.defaultKeyGenerator.bind(this),
      shouldCache: options.shouldCache ?? this.defaultShouldCache.bind(this),
      varyHeaders: options.varyHeaders ?? ['Accept', 'Accept-Encoding', 'Authorization'],
      compression: {
        enabled: options.compression?.enabled ?? true,
        threshold: options.compression?.threshold ?? 1024,
        algorithms: options.compression?.algorithms ?? ['gzip', 'deflate'],
        ...options.compression,
      },
      invalidation: {
        patterns: options.invalidation?.patterns ?? [],
        methods: options.invalidation?.methods ?? ['POST', 'PUT', 'PATCH', 'DELETE'],
        headers: options.invalidation?.headers ?? ['Cache-Control'],
        ...options.invalidation,
      },
      etag: {
        enabled: options.etag?.enabled ?? true,
        weak: options.etag?.weak ?? true,
        ...options.etag,
      },
      staleWhileRevalidate: {
        enabled: options.staleWhileRevalidate?.enabled ?? false,
        maxAge: options.staleWhileRevalidate?.maxAge ?? 60000,
        ...options.staleWhileRevalidate,
      },
    } as Required<ResponseCacheOptions>

    this.initializeStorage()
    this.startCleanupInterval()
  }

  private async initializeStorage(): Promise<void> {
    if (this.options.storage.type === 'file' || this.options.storage.type === 'hybrid') {
      try {
        if (this.options.storage?.directory) {
          await mkdir(this.options.storage.directory, { recursive: true })
        }
      }
      catch (error) {
        console.warn(`[ResponseCache] Failed to create cache directory: ${error}`)
      }
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000) // Cleanup every minute
  }

  public cleanup(): void {
    const now = Date.now()
    let deletedCount = 0

    // Clean memory cache - check expiration properly
    const keysToDelete: string[] = []
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt <= now) {
        keysToDelete.push(key)
      }
    }

    // Delete expired keys
    for (const key of keysToDelete) {
      this.memoryCache.delete(key)
      this.cacheStats.deletes++
      deletedCount++
    }

    // Clean file cache if using file storage
    if (this.options.storage.type === 'file' || this.options.storage.type === 'hybrid') {
      this.cleanupFileCache()
    }

    // Update cache stats after cleanup
    this.updateCacheStats()

    if (deletedCount > 0) {
      console.warn(`[ResponseCache] Cleaned up ${deletedCount} expired entries`)
    }
  }

  private async cleanupFileCache(): Promise<void> {
    if (!this.options.storage.directory)
      return

    try {
      const { readdir } = await import('node:fs/promises')
      const files = await readdir(this.options.storage.directory)

      for (const file of files) {
        if (file.endsWith('.cache')) {
          const filePath = join(this.options.storage.directory, file)
          const bunFile = Bun.file(filePath)

          if (await bunFile.exists()) {
            try {
              const content = await bunFile.text()
              const entry: CacheEntry = JSON.parse(content)

              if (entry.expiresAt < Date.now()) {
                await bunFile.delete()
                this.cacheStats.deletes++
              }
            }
            catch {
              // Invalid cache file, delete it
              await bunFile.delete()
            }
          }
        }
      }
    }
    catch (error) {
      console.warn(`[ResponseCache] File cache cleanup failed: ${error}`)
    }
  }

  private defaultKeyGenerator(req: EnhancedRequest): string {
    const url = new URL(req.url)
    const varyParts: string[] = []

    // Include vary headers in key
    for (const header of this.options.varyHeaders) {
      const value = req.headers.get(header)
      if (value) {
        varyParts.push(`${header}:${value}`)
      }
    }

    const keyData = [
      req.method,
      url.pathname,
      url.search,
      ...varyParts,
    ].join('|')

    return crypto.createHash('sha256').update(keyData).digest('hex')
  }

  private defaultShouldCache(req: EnhancedRequest, res: Response): boolean {
    // Don't cache if disabled
    if (!this.options.enabled)
      return false

    // Don't cache non-GET/HEAD requests by default
    if (!['GET', 'HEAD'].includes(req.method))
      return false

    // Don't cache responses with Cache-Control: no-cache or no-store
    const cacheControl = res.headers.get('Cache-Control')
    if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
      return false
    }

    // Don't cache error responses (4xx, 5xx)
    if (res.status >= 400)
      return false

    // Don't cache responses with Set-Cookie header
    if (res.headers.get('Set-Cookie'))
      return false

    return true
  }

  private getTTL(req: EnhancedRequest): number {
    const method = req.method.toLowerCase()
    const url = new URL(req.url)
    const pathname = url.pathname

    // Check for route-specific TTL
    if (this.options.ttl?.routes) {
      for (const [pattern, ttl] of Object.entries(this.options.ttl.routes)) {
        if (pathname.includes(pattern)) {
          return ttl
        }
      }
    }

    // Check for method-specific TTL
    if (this.options.ttl?.methods?.[method]) {
      return this.options.ttl.methods[method]
    }

    // Return default TTL
    return this.options.ttl?.default || 300000 // 5 minutes default
  }

  private generateETag(content: string | Uint8Array): string {
    const hash = crypto.createHash('sha1')
    hash.update(content)
    const etag = hash.digest('hex').substring(0, 16)
    return this.options.etag.weak ? `W/"${etag}"` : `"${etag}"`
  }

  private async getFromMemoryCache(key: string): Promise<CacheEntry | null> {
    const entry = this.memoryCache.get(key)
    if (!entry)
      return null

    // Check if entry is expired
    const now = Date.now()
    if (entry.expiresAt <= now) {
      this.memoryCache.delete(key)
      this.cacheStats.deletes++
      return null
    }

    // Update access time for LRU
    entry.lastAccessed = Date.now()
    entry.accessCount++

    // Re-insert to update the entry in the map
    this.memoryCache.set(key, entry)
    return entry
  }

  private async getFromFileCache(key: string): Promise<CacheEntry | null> {
    if (!this.options.storage.directory)
      return null

    try {
      const filePath = join(this.options.storage.directory, `${key}.cache`)
      const file = Bun.file(filePath)

      if (!(await file.exists())) {
        return null
      }

      const data = await file.json() as CacheEntry

      // Check if entry is expired
      const now = Date.now()
      if (data.expiresAt <= now) {
        // Delete expired file
        try {
          const { unlink } = await import('node:fs/promises')
          await unlink(filePath)
        }
        catch (deleteError) {
          console.warn(`[ResponseCache] Error deleting expired file cache:`, deleteError)
        }
        return null
      }

      return data
    }
    catch (error) {
      console.warn(`[ResponseCache] Error reading file cache for key ${key}:`, error)
      return null
    }
  }

  private async setMemoryCache(key: string, entry: CacheEntry): Promise<void> {
    // If key already exists, don't add as new entry
    if (this.memoryCache.has(key)) {
      return
    }

    // Check memory limits and evict if necessary before adding new entry
    while (this.memoryCache.size >= (this.options.storage.maxEntries || 100)) {
      this.evictLRU()
    }

    const now = Date.now()
    const memoryEntry: MemoryCacheEntry = {
      ...entry,
      accessCount: 1,
      lastAccessed: now,
    }

    this.memoryCache.set(key, memoryEntry)
    this.updateCacheStats()
  }

  private async setFileCache(key: string, entry: CacheEntry): Promise<void> {
    if (!this.options.storage.directory)
      return

    try {
      const filePath = join(this.options.storage.directory, `${key}.cache`)
      const content = JSON.stringify(entry)
      await Bun.write(filePath, content)
    }
    catch (error) {
      console.warn(`[ResponseCache] Failed to write file cache: ${error}`)
    }
  }

  private evictLRU(): void {
    if (this.memoryCache.size === 0)
      return

    // Find the entry with the oldest lastAccessed time
    let oldestKey: string | null = null
    let oldestTime = Number.MAX_SAFE_INTEGER

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey)
      this.cacheStats.deletes++
    }
  }

  private updateCacheStats(): void {
    this.cacheStats.size = this.memoryCache.size
    this.cacheStats.memoryUsage = Array.from(this.memoryCache.values())
      .reduce((total, entry) => total + entry.size, 0)
  }

  private generateCacheKey(req: EnhancedRequest): string {
    return this.options.keyGenerator(req)
  }

  private async getCachedResponse(key: string): Promise<CacheEntry | null> {
    // Try memory cache first
    if (this.options.storage.type === 'memory' || this.options.storage.type === 'hybrid') {
      const memoryEntry = await this.getFromMemoryCache(key)
      if (memoryEntry) {
        return memoryEntry
      }
    }

    // Try file cache
    if (this.options.storage.type === 'file' || this.options.storage.type === 'hybrid') {
      const fileEntry = await this.getFromFileCache(key)
      if (fileEntry) {
        // Store in memory cache for faster access
        if (this.options.storage.type === 'hybrid') {
          await this.setMemoryCache(key, fileEntry)
        }
        return fileEntry
      }
    }

    return null
  }

  private async setCachedResponse(key: string, entry: CacheEntry): Promise<void> {
    // Only increment sets if this is a new entry
    const isNewEntry = !this.memoryCache.has(key)

    // Store in memory cache
    if (this.options.storage.type === 'memory' || this.options.storage.type === 'hybrid') {
      await this.setMemoryCache(key, entry)
    }

    // Store in file cache
    if (this.options.storage.type === 'file' || this.options.storage.type === 'hybrid') {
      await this.setFileCache(key, entry)
    }

    if (isNewEntry) {
      this.cacheStats.sets++
    }
    this.updateCacheStats()
  }

  private handleConditionalRequest(req: EnhancedRequest, entry: CacheEntry): Response | null {
    const ifNoneMatch = req.headers.get('If-None-Match')
    const ifModifiedSince = req.headers.get('If-Modified-Since')

    // Check ETag
    if (ifNoneMatch && entry.etag) {
      if (ifNoneMatch === entry.etag || ifNoneMatch === '*') {
        return new Response(null, { status: 304 })
      }
    }

    // Check Last-Modified
    if (ifModifiedSince && entry.lastModified) {
      const modifiedSince = new Date(ifModifiedSince)
      const lastModified = new Date(entry.lastModified)

      if (lastModified <= modifiedSince) {
        return new Response(null, { status: 304 })
      }
    }

    return null
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const cacheKey = this.generateCacheKey(req)

    // Check if this is an invalidating request
    if (this.options.invalidation.methods?.includes(req.method)) {
      const response = await next()
      if (response) {
        await this.invalidateCache(req)
        response.headers.set('X-Cache', 'MISS')
        return response
      }
      return new Response('Internal Server Error', { status: 500 })
    }

    // Try to get cached response
    let cachedEntry = await this.getCachedResponse(cacheKey)

    // Check if cached entry is expired
    if (cachedEntry && cachedEntry.expiresAt <= Date.now()) {
      // Remove expired entry
      await this.deleteCachedResponse(cacheKey)
      cachedEntry = null
    }

    if (cachedEntry) {
      // Track cache hit
      this.cacheStats.hits++

      // Handle conditional requests
      const conditionalResponse = this.handleConditionalRequest(req, cachedEntry)
      if (conditionalResponse) {
        conditionalResponse.headers.set('X-Cache', 'HIT')
        return conditionalResponse
      }

      // Return cached response
      const response = this.createResponseFromEntry(cachedEntry)
      if (response) {
        response.headers.set('X-Cache', 'HIT')
        return response
      }
    }

    // Track cache miss
    this.cacheStats.misses++

    // Cache miss - get response from next middleware
    const response = await next()

    if (!response) {
      return new Response('Internal Server Error', { status: 500 })
    }

    // Set X-Cache header for miss
    response.headers.set('X-Cache', 'MISS')

    // Check if response should be cached
    if (this.options.shouldCache(req, response)) {
      try {
        const { entry, response: updatedResponse } = await this.createCacheEntry(req, response)
        await this.setCachedResponse(cacheKey, entry)
        return updatedResponse
      }
      catch (error) {
        console.warn(`[ResponseCache] Failed to cache response: ${error}`)
      }
    }

    return response
  }

  private async deleteCachedResponse(key: string): Promise<void> {
    // Remove from memory cache
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key)
      this.cacheStats.deletes++
    }

    // Remove from file cache
    if (this.options.storage.type === 'file' || this.options.storage.type === 'hybrid') {
      try {
        const filePath = join(this.options.storage.directory || '.cache/responses', `${key}.cache`)
        const bunFile = Bun.file(filePath)
        if (await bunFile.exists()) {
          await bunFile.delete()
          this.cacheStats.deletes++
        }
      }
      catch (error) {
        console.warn(`[ResponseCache] Failed to delete file cache: ${error}`)
      }
    }

    this.updateCacheStats()
  }

  private async createCacheEntry(req: EnhancedRequest, res: Response): Promise<{ entry: CacheEntry, response: Response }> {
    // Clone the response to avoid consuming the original stream
    const clonedRes = res.clone()
    const body = await clonedRes.arrayBuffer()
    const bodyBytes = new Uint8Array(body)
    const ttl = this.getTTL(req)
    const now = Date.now()

    const entry: CacheEntry = {
      key: this.generateCacheKey(req),
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        body: Array.from(bodyBytes), // Convert to regular array for JSON serialization
        contentType: res.headers.get('Content-Type') || 'text/plain',
      },
      createdAt: now,
      expiresAt: now + ttl,
      size: bodyBytes.length,
    }

    // Generate ETag if enabled
    if (this.options.etag && this.options.etag.enabled) {
      entry.etag = this.generateETag(bodyBytes)
      if (entry.etag) {
        entry.response.headers.ETag = entry.etag
        res.headers.set('ETag', entry.etag)
      }
    }

    // Set Last-Modified
    entry.lastModified = new Date(now).toUTCString()
    entry.response.headers['Last-Modified'] = entry.lastModified
    res.headers.set('Last-Modified', entry.lastModified)

    return { entry, response: res }
  }

  private createResponseFromEntry(entry: CacheEntry): Response {
    const headers = new Headers(entry.response.headers)

    // Add cache headers
    headers.set('Age', Math.floor((Date.now() - entry.createdAt) / 1000).toString())

    // Convert body back to Uint8Array if it's an array
    const body = Array.isArray(entry.response.body)
      ? new Uint8Array(entry.response.body)
      : entry.response.body

    return new Response(body, {
      status: entry.response.status,
      statusText: entry.response.statusText,
      headers,
    })
  }

  private async backgroundRevalidate(cacheKey: string, req: EnhancedRequest, next: NextFunction): Promise<void> {
    try {
      const response = await next()
      if (response && this.options.shouldCache(req, response)) {
        const { entry } = await this.createCacheEntry(req, response)
        await this.setCachedResponse(cacheKey, entry)
      }
    }
    catch (error) {
      console.warn(`[ResponseCache] Background revalidation failed: ${error}`)
    }
  }

  async invalidateCache(req?: EnhancedRequest): Promise<void> {
    if (req) {
      const patterns = this.options.invalidation.patterns
      if (patterns && patterns.length > 0) {
        // Invalidate specific patterns
        const url = new URL(req.url)

        for (const pattern of patterns) {
          if (url.pathname.match(new RegExp(pattern))) {
            await this.clearCache()
            return
          }
        }
      }
      else {
        // No specific patterns, clear all cache for invalidating methods
        await this.clearCache()
      }
    }
    else {
      // Clear all cache
      await this.clearCache()
    }
  }

  async clearCache(): Promise<void> {
    // Get current cache size before clearing
    const currentSize = this.memoryCache.size

    // Clear memory cache
    this.memoryCache.clear()
    this.cacheStats.deletes += currentSize

    // Clear file cache if using file storage
    if (this.options.storage.type === 'file' || this.options.storage.type === 'hybrid') {
      try {
        const { readdir, unlink } = await import('node:fs/promises')
        const files = await readdir(this.options.storage.directory || '.cache/responses')

        for (const file of files) {
          if (file.endsWith('.cache')) {
            const filePath = `${this.options.storage.directory || '.cache/responses'}/${file}`
            await unlink(filePath)
          }
        }
      }
      catch (error) {
        console.warn(`[ResponseCache] Failed to clear file cache: ${error}`)
      }
    }
    this.updateCacheStats()
  }

  getStats(): { hits: number, misses: number, sets: number, deletes: number, size: number, memoryUsage: number, hitRate: number } {
    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      sets: this.cacheStats.sets,
      deletes: this.cacheStats.deletes,
      size: this.cacheStats.size,
      memoryUsage: this.cacheStats.memoryUsage,
      hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0,
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.memoryCache.clear()
  }
}

// Factory functions
export function responseCache(options?: ResponseCacheOptions): ResponseCache {
  return new ResponseCache(options)
}

export function memoryCache(options?: Omit<ResponseCacheOptions, 'storage'>): ResponseCache {
  return new ResponseCache({
    ...options,
    storage: { type: 'memory' },
  })
}

export function fileCache(directory?: string, options?: Omit<ResponseCacheOptions, 'storage'>): ResponseCache {
  return new ResponseCache({
    ...options,
    storage: { type: 'file', directory },
  })
}

export function hybridCache(options?: ResponseCacheOptions): ResponseCache {
  return new ResponseCache({
    ...options,
    storage: { type: 'hybrid' },
  })
}
