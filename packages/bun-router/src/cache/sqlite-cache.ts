/**
 * SQLite Embedded Caching
 *
 * High-performance embedded caching using Bun's SQLite integration
 */

import { Database } from 'bun:sqlite'

export interface SQLiteCacheConfig {
  filename?: string
  memory?: boolean
  wal?: boolean
  synchronous?: 'OFF' | 'NORMAL' | 'FULL'
  journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF'
  cacheSize?: number
  pageSize?: number
  maxSize?: number
  defaultTTL?: number
  cleanupInterval?: number
  compression?: boolean
}

export interface CacheEntry {
  key: string
  value: string
  expires: number
  created: number
  accessed: number
  hits: number
  size: number
  compressed: boolean
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  hitRate: number
  missRate: number
  evictions: number
  compressionRatio: number
  averageAccessTime: number
}

/**
 * High-performance SQLite-based cache
 */
export class SQLiteCache {
  private db!: Database
  private config: Required<SQLiteCacheConfig>
  private stats: CacheStats
  private cleanupTimer?: Timer
  private preparedStatements!: {
    get: any
    set: any
    delete: any
    exists: any
    clear: any
    cleanup: any
    stats: any
    touch: any
  }

  constructor(config: SQLiteCacheConfig = {}) {
    this.config = {
      filename: config.filename || ':memory:',
      memory: config.memory ?? true,
      wal: config.wal ?? true,
      synchronous: config.synchronous || 'NORMAL',
      journalMode: config.journalMode || 'WAL',
      cacheSize: config.cacheSize || 10000,
      pageSize: config.pageSize || 4096,
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB
      defaultTTL: config.defaultTTL || 3600, // 1 hour
      cleanupInterval: config.cleanupInterval || 300, // 5 minutes
      compression: config.compression ?? true,
      ...config,
    }

    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      missRate: 0,
      evictions: 0,
      compressionRatio: 0,
      averageAccessTime: 0,
    }

    this.initializeDatabase()
    this.prepareStatements()
    this.startCleanupTimer()
  }

  /**
   * Get value from cache
   */
  get<T = any>(key: string): T | null {
    const startTime = performance.now()

    try {
      const result = this.preparedStatements.get.get(key, Date.now()) as CacheEntry | null

      if (!result) {
        this.updateStats('miss', performance.now() - startTime)
        return null
      }

      // Update access statistics
      this.preparedStatements.touch.run(key, Date.now())

      let value = result.value
      if (result.compressed && this.config.compression) {
        value = this.decompress(value)
      }

      this.updateStats('hit', performance.now() - startTime)
      return JSON.parse(value)
    }
    catch (error) {
      console.error('Cache get error:', error)
      this.updateStats('miss', performance.now() - startTime)
      return null
    }
  }

  /**
   * Set value in cache
   */
  set<T = any>(key: string, value: T, ttl?: number): boolean {
    const startTime = performance.now()

    try {
      const serialized = JSON.stringify(value)
      const expires = Date.now() + ((ttl || this.config.defaultTTL) * 1000)
      const created = Date.now()

      let finalValue = serialized
      let compressed = false
      let size = serialized.length

      // Compress if enabled and value is large enough
      if (this.config.compression && serialized.length > 1024) {
        const compressedValue = this.compress(serialized)
        if (compressedValue && compressedValue.length < serialized.length) {
          finalValue = compressedValue
          compressed = true
          size = compressedValue.length
        }
      }

      // Check if we need to evict entries
      this.evictIfNeeded(size)

      this.preparedStatements.set.run(
        key,
        finalValue,
        expires,
        created,
        created, // accessed
        0, // hits
        size,
        compressed ? 1 : 0,
      )

      this.updateCacheStats()
      this.updateStats('set', performance.now() - startTime)
      return true
    }
    catch (error) {
      console.error('Cache set error:', error)
      return false
    }
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    try {
      const result = this.preparedStatements.delete.run(key)
      this.updateCacheStats()
      return result.changes > 0
    }
    catch (error) {
      console.error('Cache delete error:', error)
      return false
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    try {
      const result = this.preparedStatements.exists.get(key, Date.now())
      return result !== null
    }
    catch (error) {
      console.error('Cache exists error:', error)
      return false
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): boolean {
    try {
      this.preparedStatements.clear.run()
      this.updateCacheStats()
      return true
    }
    catch (error) {
      console.error('Cache clear error:', error)
      return false
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.updateCacheStats()
    return { ...this.stats }
  }

  /**
   * Get all keys matching pattern
   */
  keys(pattern?: string): string[] {
    try {
      const query = pattern
        ? this.db.query('SELECT key FROM cache WHERE key LIKE ? AND expires > ?')
        : this.db.query('SELECT key FROM cache WHERE expires > ?')

      const params = pattern ? [pattern, Date.now()] : [Date.now()]
      const results = query.all(...params) as Array<{ key: string }>

      return results.map(row => row.key)
    }
    catch (error) {
      console.error('Cache keys error:', error)
      return []
    }
  }

  /**
   * Get multiple values at once
   */
  mget<T = any>(keys: string[]): Record<string, T | null> {
    const result: Record<string, T | null> = {}

    for (const key of keys) {
      result[key] = this.get<T>(key)
    }

    return result
  }

  /**
   * Set multiple values at once
   */
  mset<T = any>(entries: Record<string, T>, ttl?: number): boolean {
    const transaction = this.db.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        this.set(key, value, ttl)
      }
    })

    try {
      transaction()
      return true
    }
    catch (error) {
      console.error('Cache mset error:', error)
      return false
    }
  }

  /**
   * Increment numeric value
   */
  increment(key: string, delta: number = 1, ttl?: number): number | null {
    const current = this.get<number>(key)
    const newValue = (current || 0) + delta

    if (this.set(key, newValue, ttl)) {
      return newValue
    }

    return null
  }

  /**
   * Decrement numeric value
   */
  decrement(key: string, delta: number = 1, ttl?: number): number | null {
    return this.increment(key, -delta, ttl)
  }

  /**
   * Set value only if key doesn't exist
   */
  setnx<T = any>(key: string, value: T, ttl?: number): boolean {
    if (this.has(key)) {
      return false
    }
    return this.set(key, value, ttl)
  }

  /**
   * Get and delete value atomically
   */
  getdel<T = any>(key: string): T | null {
    const value = this.get<T>(key)
    if (value !== null) {
      this.delete(key)
    }
    return value
  }

  /**
   * Update TTL for existing key
   */
  expire(key: string, ttl: number): boolean {
    try {
      const expires = Date.now() + (ttl * 1000)
      const result = this.db.query('UPDATE cache SET expires = ? WHERE key = ? AND expires > ?')
        .run(expires, key, Date.now())

      return result.changes > 0
    }
    catch (error) {
      console.error('Cache expire error:', error)
      return false
    }
  }

  /**
   * Get TTL for key
   */
  ttl(key: string): number {
    try {
      const result = this.db.query('SELECT expires FROM cache WHERE key = ? AND expires > ?')
        .get(key, Date.now()) as { expires: number } | null

      if (!result)
        return -1

      return Math.floor((result.expires - Date.now()) / 1000)
    }
    catch (error) {
      console.error('Cache TTL error:', error)
      return -1
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    try {
      const result = this.preparedStatements.cleanup.run(Date.now())
      this.updateCacheStats()
      return result.changes
    }
    catch (error) {
      console.error('Cache cleanup error:', error)
      return 0
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    this.db.close()
  }

  /**
   * Initialize SQLite database
   */
  private initializeDatabase(): void {
    this.db = new Database(this.config.filename)

    // Configure database
    this.db.exec(`PRAGMA synchronous = ${this.config.synchronous}`)
    this.db.exec(`PRAGMA journal_mode = ${this.config.journalMode}`)
    this.db.exec(`PRAGMA cache_size = ${this.config.cacheSize}`)
    this.db.exec(`PRAGMA page_size = ${this.config.pageSize}`)
    this.db.exec('PRAGMA temp_store = MEMORY')
    this.db.exec('PRAGMA mmap_size = 268435456') // 256MB

    // Create cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires INTEGER NOT NULL,
        created INTEGER NOT NULL,
        accessed INTEGER NOT NULL,
        hits INTEGER DEFAULT 0,
        size INTEGER NOT NULL,
        compressed INTEGER DEFAULT 0
      )
    `)

    // Create indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_expires ON cache(expires)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_accessed ON cache(accessed)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_size ON cache(size)')
  }

  /**
   * Prepare SQL statements
   */
  private prepareStatements(): void {
    this.preparedStatements = {
      get: this.db.query(`
        SELECT key, value, expires, created, accessed, hits, size, compressed
        FROM cache
        WHERE key = ? AND expires > ?
      `),

      set: this.db.query(`
        INSERT OR REPLACE INTO cache
        (key, value, expires, created, accessed, hits, size, compressed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),

      delete: this.db.query('DELETE FROM cache WHERE key = ?'),

      exists: this.db.query('SELECT 1 FROM cache WHERE key = ? AND expires > ?'),

      clear: this.db.query('DELETE FROM cache'),

      cleanup: this.db.query('DELETE FROM cache WHERE expires <= ?'),

      stats: this.db.query(`
        SELECT
          COUNT(*) as total_entries,
          SUM(size) as total_size,
          AVG(hits) as avg_hits,
          SUM(CASE WHEN compressed = 1 THEN size ELSE 0 END) as compressed_size
        FROM cache
        WHERE expires > ?
      `),

      touch: this.db.query(`
        UPDATE cache
        SET accessed = ?, hits = hits + 1
        WHERE key = ?
      `),
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanup()
      if (cleaned > 0) {
        console.warn(`SQLite cache cleanup: removed ${cleaned} expired entries`)
      }
    }, this.config.cleanupInterval * 1000)
  }

  /**
   * Evict entries if cache is too large
   */
  private evictIfNeeded(newEntrySize: number): void {
    const currentStats = this.preparedStatements.stats.get(Date.now()) as {
      total_entries: number
      total_size: number
    } | null

    if (!currentStats)
      return

    const projectedSize = currentStats.total_size + newEntrySize

    if (projectedSize > this.config.maxSize) {
      // Evict least recently accessed entries
      const toEvict = Math.ceil(currentStats.total_entries * 0.1) // Evict 10%

      const evictQuery = this.db.query(`
        DELETE FROM cache
        WHERE key IN (
          SELECT key FROM cache
          WHERE expires > ?
          ORDER BY accessed ASC
          LIMIT ?
        )
      `)

      const result = evictQuery.run(Date.now(), toEvict)
      this.stats.evictions += result.changes
    }
  }

  /**
   * Update cache statistics
   */
  private updateCacheStats(): void {
    try {
      const result = this.preparedStatements.stats.get(Date.now()) as {
        total_entries: number
        total_size: number
        avg_hits: number
        compressed_size: number
      } | null

      if (result) {
        this.stats.totalEntries = result.total_entries || 0
        this.stats.totalSize = result.total_size || 0
        this.stats.compressionRatio = result.total_size > 0
          ? (result.compressed_size / result.total_size) * 100
          : 0
      }
    }
    catch (error) {
      console.error('Error updating cache stats:', error)
    }
  }

  /**
   * Update operation statistics
   */
  private updateStats(operation: 'hit' | 'miss' | 'set', responseTime: number): void {
    if (operation === 'hit') {
      this.stats.hitRate = (this.stats.hitRate + 1) / 2
    }
    else if (operation === 'miss') {
      this.stats.missRate = (this.stats.missRate + 1) / 2
    }

    this.stats.averageAccessTime = (this.stats.averageAccessTime + responseTime) / 2
  }

  /**
   * Compress string value
   */
  private compress(value: string): string | null {
    try {
      const compressed = Bun.gzipSync(value)
      return Buffer.from(compressed).toString('base64')
    }
    catch (error) {
      console.error('Compression error:', error)
      return null
    }
  }

  /**
   * Decompress string value
   */
  private decompress(value: string): string {
    try {
      const buffer = Buffer.from(value, 'base64')
      const decompressed = Bun.gunzipSync(buffer)
      return new TextDecoder().decode(decompressed)
    }
    catch (error) {
      console.error('Decompression error:', error)
      return value
    }
  }
}

/**
 * SQLite cache factory
 */
export class SQLiteCacheFactory {
  /**
   * Create in-memory cache
   */
  static createMemoryCache(config?: Partial<SQLiteCacheConfig>): SQLiteCache {
    return new SQLiteCache({
      filename: ':memory:',
      memory: true,
      wal: false,
      synchronous: 'OFF',
      ...config,
    })
  }

  /**
   * Create persistent cache
   */
  static createPersistentCache(filename: string, config?: Partial<SQLiteCacheConfig>): SQLiteCache {
    return new SQLiteCache({
      filename,
      memory: false,
      wal: true,
      synchronous: 'NORMAL',
      ...config,
    })
  }

  /**
   * Create high-performance cache
   */
  static createHighPerformanceCache(config?: Partial<SQLiteCacheConfig>): SQLiteCache {
    return new SQLiteCache({
      filename: ':memory:',
      memory: true,
      wal: false,
      synchronous: 'OFF',
      cacheSize: 50000,
      pageSize: 8192,
      maxSize: 500 * 1024 * 1024, // 500MB
      compression: true,
      cleanupInterval: 60,
      ...config,
    })
  }

  /**
   * Create development cache with debugging
   */
  static createDevelopmentCache(config?: Partial<SQLiteCacheConfig>): SQLiteCache {
    return new SQLiteCache({
      filename: 'dev-cache.db',
      memory: false,
      wal: true,
      synchronous: 'FULL',
      maxSize: 50 * 1024 * 1024, // 50MB
      compression: false,
      cleanupInterval: 30,
      ...config,
    })
  }
}

/**
 * Cache middleware factory
 */
export function createSQLiteCacheMiddleware(cache: SQLiteCache, options: {
  keyGenerator?: (request: Request) => string
  ttl?: number
  skipMethods?: string[]
  skipPaths?: string[]
  skipHeaders?: string[]
} = {}) {
  const {
    keyGenerator = req => `${req.method}:${new URL(req.url).pathname}`,
    ttl = 300, // 5 minutes
    skipMethods = ['POST', 'PUT', 'PATCH', 'DELETE'],
    skipPaths = [],
    skipHeaders = ['authorization', 'cookie'],
  } = options

  return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
    // Skip caching for certain methods
    if (skipMethods.includes(request.method)) {
      return await next()
    }

    // Skip caching for certain paths
    const url = new URL(request.url)
    if (skipPaths.some(path => url.pathname.startsWith(path))) {
      return await next()
    }

    // Skip caching if certain headers are present
    if (skipHeaders.some(header => request.headers.has(header))) {
      return await next()
    }

    const cacheKey = keyGenerator(request)

    // Try to get from cache
    const cached = cache.get<{
      status: number
      headers: Record<string, string>
      body: string
    }>(cacheKey)

    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          ...cached.headers,
          'X-Cache': 'HIT',
        },
      })
    }

    // Get response and cache it
    const response = await next()

    // Only cache successful responses
    if (response.status >= 200 && response.status < 300) {
      const body = await response.text()
      const headers = Object.fromEntries(response.headers.entries())

      cache.set(cacheKey, {
        status: response.status,
        headers,
        body,
      }, ttl)

      return new Response(body, {
        status: response.status,
        headers: {
          ...response.headers,
          'X-Cache': 'MISS',
        },
      })
    }

    return response
  }
}

/**
 * SQLite cache helpers
 */
export const SQLiteCacheHelpers = {
  /**
   * Create session cache
   */
  createSessionCache: (cache: SQLiteCache) => ({
    get: (sessionId: string) => cache.get(`session:${sessionId}`),
    set: (sessionId: string, data: any, ttl = 3600) => cache.set(`session:${sessionId}`, data, ttl),
    delete: (sessionId: string) => cache.delete(`session:${sessionId}`),
    touch: (sessionId: string, ttl = 3600) => cache.expire(`session:${sessionId}`, ttl),
  }),

  /**
   * Create rate limiting cache
   */
  createRateLimitCache: (cache: SQLiteCache) => ({
    increment: (key: string, window = 60) => {
      const current = cache.get<number>(`rate:${key}`) || 0
      const newValue = current + 1
      cache.set(`rate:${key}`, newValue, window)
      return newValue
    },

    get: (key: string) => cache.get<number>(`rate:${key}`) || 0,

    reset: (key: string) => cache.delete(`rate:${key}`),
  }),

  /**
   * Create query result cache
   */
  createQueryCache: (cache: SQLiteCache) => ({
    get: (query: string, params: any[]) => {
      const key = `query:${Bun.hash(query + JSON.stringify(params))}`
      return cache.get(key)
    },

    set: (query: string, params: any[], result: any, ttl = 300) => {
      const key = `query:${Bun.hash(query + JSON.stringify(params))}`
      return cache.set(key, result, ttl)
    },

    invalidate: (pattern: string) => {
      const keys = cache.keys(`query:*${pattern}*`)
      keys.forEach(key => cache.delete(key))
    },
  }),
}
