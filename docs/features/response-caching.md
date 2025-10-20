# Response Caching

The Response Caching middleware provides high-performance HTTP response caching with multiple storage backends, intelligent cache invalidation, and advanced features like ETags, conditional requests, and stale-while-revalidate.

## Features

- **Multiple Storage Backends**: Memory, file-based, and hybrid caching
- **Bun-Optimized File I/O**: Uses `Bun.file()` and `Bun.write()` for maximum performance
- **Smart Cache Keys**: Automatic generation with support for Vary headers
- **TTL Management**: Configurable time-to-live with route and method-specific rules
- **ETags & Conditional Requests**: Automatic ETag generation and 304 Not Modified responses
- **Cache Invalidation**: Pattern-based and method-triggered invalidation
- **Stale-While-Revalidate**: Serve stale content while updating in background
- **Memory Management**: LRU eviction and configurable limits
- **Statistics & Monitoring**: Built-in cache hit/miss tracking

## Basic Usage

```typescript
import { Router } from 'bun-router'
import { responseCache } from 'bun-router/middleware'

const router = new Router()

// Basic response caching
await router.use(responseCache({
  storage: { type: 'memory' },
  ttl: { default: 300000 } // 5 minutes
}))

router.get('/api/data', async () => {
  const data = await fetchExpensiveData()
  return Response.json(data)
})
```

## Storage Types

### Memory Cache

Fast in-memory caching with LRU eviction:

```typescript
import { memoryCache } from 'bun-router/middleware'

await router.use(memoryCache({
  storage: { maxEntries: 1000 },
  ttl: { default: 600000 } // 10 minutes
}))
```

### File Cache

Persistent file-based caching using Bun's optimized file APIs:

```typescript
import { fileCache } from 'bun-router/middleware'

await router.use(fileCache('.cache/responses', {
  storage: { maxSize: 100 * 1024 * 1024 }, // 100MB
  ttl: { default: 3600000 } // 1 hour
}))
```

### Hybrid Cache

Combines memory and file caching for optimal performance:

```typescript
import { hybridCache } from 'bun-router/middleware'

await router.use(hybridCache({
  storage: {
    directory: '.cache/responses',
    maxEntries: 1000, // Memory limit
    maxSize: 500 * 1024 * 1024 // File cache limit (500MB)
  }
}))
```

## Configuration Options

### TTL Configuration

```typescript
await router.use(responseCache({
  ttl: {
    default: 300000, // 5 minutes default
    routes: {
      '/api/static/.*': 86400000, // 24 hours for static content
      '/api/dynamic/.*': 60000,   // 1 minute for dynamic content
    },
    methods: {
      GET: 600000,    // 10 minutes for GET
      HEAD: 600000,   // 10 minutes for HEAD
      OPTIONS: 60000, // 1 minute for OPTIONS
    }
  }
}))
```

### Vary Headers

Cache different responses based on request headers:

```typescript
await router.use(responseCache({
  varyHeaders: ['Accept', 'Accept-Language', 'Authorization'],
  keyGenerator: (req) => {
    // Custom cache key generation
    const url = new URL(req.url)
    const lang = req.headers.get('Accept-Language') || 'en'
    return `${req.method}:${url.pathname}:${lang}`
  }
}))
```

### Cache Invalidation

```typescript
await router.use(responseCache({
  invalidation: {
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'], // Invalidate on mutations
    patterns: ['/api/users/.*', '/api/posts/.*'], // Pattern-based invalidation
    headers: ['Cache-Control'] // Header-based invalidation
  }
}))
```

### ETags and Conditional Requests

```typescript
await router.use(responseCache({
  etag: {
    enabled: true,
    weak: false // Use strong ETags
  }
}))

// Client can send If-None-Match header for 304 responses
```

### Stale-While-Revalidate

```typescript
await router.use(responseCache({
  staleWhileRevalidate: {
    enabled: true,
    maxAge: 60000 // Serve stale content for 1 minute while revalidating
  }
}))
```

## Custom Cache Logic

### Custom Should Cache Function

```typescript
await router.use(responseCache({
  shouldCache: (req, res) => {
    // Don't cache authenticated requests
    if (req.headers.get('Authorization')) return false
    
    // Don't cache large responses
    if (res.headers.get('Content-Length') > '1048576') return false
    
    // Only cache successful responses
    return res.status >= 200 && res.status < 300
  }
}))
```

### Custom Key Generator

```typescript
await router.use(responseCache({
  keyGenerator: (req) => {
    const url = new URL(req.url)
    const userId = req.headers.get('X-User-ID')
    const version = req.headers.get('API-Version') || 'v1'
    
    return `${req.method}:${url.pathname}:${userId}:${version}`
  }
}))
```

## Cache Management

### Manual Cache Control

```typescript
const cache = responseCache({ storage: { type: 'memory' } })
await router.use(async (req, next) => cache.handle(req, next))

// Clear all cache
await cache.clearCache()

// Invalidate specific patterns
await cache.invalidateCache(req) // Based on request patterns

// Get cache statistics
const stats = cache.getStats()
console.log(`Hit rate: ${stats.hitRate * 100}%`)
console.log(`Cache size: ${stats.size} entries`)
```

### Cache Statistics

```typescript
const stats = cache.getStats()
// {
//   hits: 150,
//   misses: 50,
//   sets: 50,
//   deletes: 10,
//   size: 40,
//   memoryUsage: 1024000,
//   hitRate: 0.75
// }
```

## Advanced Examples

### API Response Caching

```typescript
import { Router } from 'bun-router'
import { hybridCache } from 'bun-router/middleware'

const router = new Router()

// Configure caching for API
await router.use(hybridCache({
  storage: {
    directory: '.cache/api',
    maxEntries: 5000,
    maxSize: 1024 * 1024 * 1024 // 1GB
  },
  ttl: {
    default: 300000, // 5 minutes
    routes: {
      '/api/config': 3600000,     // 1 hour for config
      '/api/users/\\d+': 600000,  // 10 minutes for user profiles
      '/api/search': 60000,       // 1 minute for search results
    }
  },
  varyHeaders: ['Accept', 'Authorization'],
  etag: { enabled: true },
  staleWhileRevalidate: {
    enabled: true,
    maxAge: 120000 // 2 minutes
  }
}))

router.get('/api/users/:id', async (req) => {
  const user = await db.users.findById(req.params.id)
  return Response.json(user)
})
```

### Static Asset Caching

```typescript
await router.use(fileCache('.cache/static', {
  ttl: {
    default: 86400000, // 24 hours
    routes: {
      '.*\\.(css|js|png|jpg|gif|svg)$': 604800000, // 7 days for assets
      '.*\\.html$': 3600000, // 1 hour for HTML
    }
  },
  shouldCache: (req, res) => {
    // Only cache successful responses for static files
    return res.status === 200 && req.url.includes('/static/')
  }
}))
```

### Conditional Caching

```typescript
await router.use(responseCache({
  shouldCache: (req, res) => {
    // Don't cache for authenticated users
    if (req.headers.get('Authorization')) return false
    
    // Don't cache POST/PUT/DELETE
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return false
    
    // Don't cache error responses
    if (res.status >= 400) return false
    
    // Don't cache responses with Set-Cookie
    if (res.headers.get('Set-Cookie')) return false
    
    // Check Cache-Control header
    const cacheControl = res.headers.get('Cache-Control')
    if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
      return false
    }
    
    return true
  }
}))
```

## Performance Considerations

### File Cache Performance

The file cache uses Bun's optimized `Bun.file()` and `Bun.write()` APIs for maximum performance:

- **Zero-copy operations** where possible
- **Lazy loading** with `BunFile` references
- **Efficient cleanup** with background file deletion
- **Atomic writes** to prevent corruption

### Memory Management

- **LRU eviction** prevents memory leaks
- **Configurable limits** for entries and total size
- **Automatic cleanup** of expired entries
- **Memory usage tracking** in statistics

### Hybrid Strategy

The hybrid cache provides the best of both worlds:

1. **Memory cache** for frequently accessed items (fastest)
2. **File cache** for persistence and larger capacity
3. **Automatic promotion** from file to memory cache
4. **Intelligent eviction** based on access patterns

## Best Practices

1. **Choose the right storage type**:
   - Memory: Fast, temporary caching
   - File: Persistent, larger capacity
   - Hybrid: Best performance with persistence

2. **Configure appropriate TTLs**:
   - Static content: Long TTL (hours/days)
   - Dynamic content: Short TTL (minutes)
   - User-specific content: Very short TTL or no cache

3. **Use Vary headers wisely**:
   - Include headers that affect response content
   - Avoid headers that change frequently

4. **Monitor cache performance**:
   - Track hit rates and adjust TTLs
   - Monitor memory usage and file sizes
   - Use cache statistics for optimization

5. **Handle cache invalidation**:
   - Invalidate on data mutations
   - Use pattern-based invalidation for related content
   - Consider stale-while-revalidate for better UX

## Integration with Other Middleware

Response caching works seamlessly with other middleware:

```typescript
import { Router } from 'bun-router'
import { responseCache, compression, rateLimit } from 'bun-router/middleware'

const router = new Router()

// Order matters: rate limiting before caching
await router.use(rateLimit({ windowMs: 60000, max: 100 }))
await router.use(responseCache({ storage: { type: 'hybrid' } }))
await router.use(compression()) // Compression after caching

router.get('/api/data', handler)
```

The response cache middleware provides enterprise-grade caching capabilities optimized for Bun's runtime, ensuring your applications can handle high traffic loads with minimal latency.
