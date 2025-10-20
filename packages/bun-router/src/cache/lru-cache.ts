/**
 * High-performance LRU (Least Recently Used) cache implementation
 * Optimized for Bun runtime with configurable size limits and TTL support
 */

export interface LRUCacheOptions {
  maxSize: number
  ttl?: number // Time to live in milliseconds
  onEvict?: (key: string, value: any) => void
  allowStale?: boolean // Allow returning stale items
  updateAgeOnGet?: boolean // Update age when item is accessed
}

export interface CacheEntry<T = any> {
  value: T
  timestamp: number
  accessCount: number
  lastAccessed: number
  ttl?: number
}

export interface CacheStats {
  size: number
  maxSize: number
  hits: number
  misses: number
  evictions: number
  hitRate: number
  memoryUsage: number
}

/**
 * Node in the doubly linked list for LRU tracking
 */
class LRUNode<T = any> {
  constructor(
    public key: string,
    public entry: CacheEntry<T>,
    public prev: LRUNode<T> | null = null,
    public next: LRUNode<T> | null = null,
  ) {}
}

/**
 * High-performance LRU cache with TTL support and detailed statistics
 */
export class LRUCache<T = any> {
  private cache = new Map<string, LRUNode<T>>()
  private head: LRUNode<T> | null = null
  private tail: LRUNode<T> | null = null
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  }

  constructor(private options: LRUCacheOptions) {
    if (options.maxSize <= 0) {
      throw new Error('maxSize must be greater than 0')
    }
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const node = this.cache.get(key)

    if (!node) {
      this.stats.misses++
      return undefined
    }

    const now = Date.now()
    const entry = node.entry

    // Check TTL expiration
    if (this.isExpired(entry, now)) {
      if (!this.options.allowStale) {
        this.delete(key)
        this.stats.misses++
        return undefined
      }
    }

    // Update access statistics
    entry.lastAccessed = now
    entry.accessCount++
    this.stats.hits++

    // Move to front (most recently used) if updateAgeOnGet is enabled
    if (this.options.updateAgeOnGet !== false) {
      this.moveToFront(node)
    }

    return entry.value
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now()
    const existingNode = this.cache.get(key)

    if (existingNode) {
      // Update existing entry
      existingNode.entry.value = value
      existingNode.entry.timestamp = now
      existingNode.entry.lastAccessed = now
      existingNode.entry.ttl = ttl ?? this.options.ttl
      this.moveToFront(existingNode)
      return
    }

    // Create new entry
    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      ttl: ttl ?? this.options.ttl,
    }

    const newNode = new LRUNode(key, entry)

    // Add to cache
    this.cache.set(key, newNode)
    this.addToFront(newNode)

    // Check size limit and evict if necessary
    if (this.cache.size > this.options.maxSize) {
      this.evictLRU()
    }
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const node = this.cache.get(key)
    if (!node)
      return false

    this.cache.delete(key)
    this.removeNode(node)

    if (this.options.onEvict) {
      this.options.onEvict(key, node.entry.value)
    }

    return true
  }

  /**
   * Check if key exists in cache (without updating access time)
   */
  has(key: string): boolean {
    const node = this.cache.get(key)
    if (!node)
      return false

    const now = Date.now()
    if (this.isExpired(node.entry, now)) {
      if (!this.options.allowStale) {
        this.delete(key)
        return false
      }
    }

    return true
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    if (this.options.onEvict) {
      for (const [key, node] of this.cache) {
        this.options.onEvict(key, node.entry.value)
      }
    }

    this.cache.clear()
    this.head = null
    this.tail = null
    this.stats.evictions += this.cache.size
  }

  /**
   * Get all keys in cache (ordered by recency)
   */
  keys(): string[] {
    const keys: string[] = []
    let current = this.head

    while (current) {
      keys.push(current.key)
      current = current.next
    }

    return keys
  }

  /**
   * Get all values in cache (ordered by recency)
   */
  values(): T[] {
    const values: T[] = []
    let current = this.head

    while (current) {
      values.push(current.entry.value)
      current = current.next
    }

    return values
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const memoryUsage = this.estimateMemoryUsage()
    const totalRequests = this.stats.hits + this.stats.misses

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      memoryUsage,
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    }
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, node] of this.cache) {
      if (this.isExpired(node.entry, now)) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.delete(key)
    }

    return keysToDelete.length
  }

  /**
   * Get entries sorted by access frequency
   */
  getFrequentlyUsed(limit: number = 10): Array<{ key: string, value: T, accessCount: number }> {
    const entries: Array<{ key: string, value: T, accessCount: number }> = []

    for (const [key, node] of this.cache) {
      entries.push({
        key,
        value: node.entry.value,
        accessCount: node.entry.accessCount,
      })
    }

    return entries
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit)
  }

  /**
   * Resize cache (may trigger evictions)
   */
  resize(newMaxSize: number): void {
    if (newMaxSize <= 0) {
      throw new Error('maxSize must be greater than 0')
    }

    this.options.maxSize = newMaxSize

    // Evict excess entries if new size is smaller
    while (this.cache.size > newMaxSize) {
      this.evictLRU()
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<T>, now: number): boolean {
    if (!entry.ttl)
      return false
    return now - entry.timestamp > entry.ttl
  }

  /**
   * Move node to front of list (most recently used)
   */
  private moveToFront(node: LRUNode<T>): void {
    if (node === this.head)
      return

    this.removeNode(node)
    this.addToFront(node)
  }

  /**
   * Add node to front of list
   */
  private addToFront(node: LRUNode<T>): void {
    node.prev = null
    node.next = this.head

    if (this.head) {
      this.head.prev = node
    }

    this.head = node

    if (!this.tail) {
      this.tail = node
    }
  }

  /**
   * Remove node from list
   */
  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next
    }
    else {
      this.head = node.next
    }

    if (node.next) {
      node.next.prev = node.prev
    }
    else {
      this.tail = node.prev
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (!this.tail)
      return

    const key = this.tail.key
    const value = this.tail.entry.value

    this.cache.delete(key)
    this.removeNode(this.tail)
    this.stats.evictions++

    if (this.options.onEvict) {
      this.options.onEvict(key, value)
    }
  }

  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0

    for (const [key, node] of this.cache) {
      // Estimate key size (2 bytes per character for UTF-16)
      totalSize += key.length * 2

      // Estimate value size (rough approximation)
      totalSize += this.estimateValueSize(node.entry.value)

      // Add overhead for entry metadata
      totalSize += 64 // timestamp, accessCount, lastAccessed, ttl
    }

    // Add overhead for Map and linked list structure
    totalSize += this.cache.size * 48 // rough estimate for Map entry + node overhead

    return totalSize
  }

  /**
   * Estimate size of a value in bytes
   */
  private estimateValueSize(value: any): number {
    if (value === null || value === undefined)
      return 0
    if (typeof value === 'string')
      return value.length * 2
    if (typeof value === 'number')
      return 8
    if (typeof value === 'boolean')
      return 1
    if (value instanceof ArrayBuffer)
      return value.byteLength
    if (value instanceof Uint8Array)
      return value.length

    // For objects, rough JSON size estimation
    try {
      return JSON.stringify(value).length * 2
    }
    catch {
      return 100 // fallback estimate
    }
  }
}

/**
 * Factory function to create LRU cache with common configurations
 */
export const createLRUCache = {
  /**
   * Create a small cache for frequently accessed items
   */
  small: <T = any>(ttl?: number): LRUCache<T> =>
    new LRUCache<T>({ maxSize: 100, ttl, updateAgeOnGet: true }),

  /**
   * Create a medium cache for general purpose use
   */
  medium: <T = any>(ttl?: number): LRUCache<T> =>
    new LRUCache<T>({ maxSize: 1000, ttl, updateAgeOnGet: true }),

  /**
   * Create a large cache for heavy caching scenarios
   */
  large: <T = any>(ttl?: number): LRUCache<T> =>
    new LRUCache<T>({ maxSize: 10000, ttl, updateAgeOnGet: true }),

  /**
   * Create a custom configured cache
   */
  custom: <T = any>(options: LRUCacheOptions): LRUCache<T> =>
    new LRUCache<T>(options),
}
