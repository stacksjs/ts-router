import { Router } from '../packages/bun-router/src'
import { responseCache, memoryCache, fileCache, hybridCache } from '../packages/bun-router/src/middleware/response_cache'

// Example 1: Basic Memory Caching
const basicRouter = new Router()

await basicRouter.use(memoryCache({
  ttl: { default: 300000 }, // 5 minutes
  storage: { maxEntries: 1000 }
}))

basicRouter.get('/api/users', async () => {
  // Simulate expensive database query
  await new Promise(resolve => setTimeout(resolve, 100))
  return Response.json([
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
  ])
})

// Example 2: File-based Caching for Static Content
const staticRouter = new Router()

await staticRouter.use(fileCache('.cache/static', {
  ttl: {
    default: 86400000, // 24 hours
    routes: {
      '.*\\.(css|js|png|jpg|gif|svg)$': 604800000, // 7 days for assets
      '.*\\.json$': 3600000, // 1 hour for JSON files
    }
  },
  shouldCache: (req, res) => {
    return res.status === 200 && req.url.includes('/static/')
  }
}))

staticRouter.get('/static/:file', async (req) => {
  const file = req.params.file
  const content = await Bun.file(`./public/${file}`).text()
  const contentType = file.endsWith('.json') ? 'application/json' : 'text/plain'
  
  return new Response(content, {
    headers: { 'Content-Type': contentType }
  })
})

// Example 3: Hybrid Caching for API with Advanced Features
const apiRouter = new Router()

await apiRouter.use(hybridCache({
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
    },
    methods: {
      GET: 600000,    // 10 minutes for GET
      HEAD: 600000,   // 10 minutes for HEAD
      OPTIONS: 60000, // 1 minute for OPTIONS
    }
  },
  varyHeaders: ['Accept', 'Accept-Language', 'Authorization'],
  etag: { enabled: true, weak: false },
  staleWhileRevalidate: {
    enabled: true,
    maxAge: 120000 // 2 minutes
  },
  invalidation: {
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    patterns: ['/api/users/.*', '/api/posts/.*']
  }
}))

// Config endpoint (cached for 1 hour)
apiRouter.get('/api/config', () => {
  return Response.json({
    version: '1.0.0',
    features: ['caching', 'compression', 'rate-limiting'],
    maintenance: false
  })
})

// User profile endpoint (cached for 10 minutes, varies by auth)
apiRouter.get('/api/users/:id', async (req) => {
  const userId = req.params.id
  const authUser = req.headers.get('Authorization')
  
  // Simulate database query
  await new Promise(resolve => setTimeout(resolve, 50))
  
  return Response.json({
    id: parseInt(userId),
    name: `User ${userId}`,
    email: `user${userId}@example.com`,
    isOwner: authUser === `Bearer user-${userId}-token`
  })
})

// Search endpoint (cached for 1 minute, varies by query)
apiRouter.get('/api/search', async (req) => {
  const url = new URL(req.url)
  const query = url.searchParams.get('q') || ''
  
  // Simulate search operation
  await new Promise(resolve => setTimeout(resolve, 200))
  
  return Response.json({
    query,
    results: [
      { id: 1, title: `Result for "${query}" #1` },
      { id: 2, title: `Result for "${query}" #2` }
    ],
    total: 2
  })
})

// Posts endpoint that invalidates cache on mutations
apiRouter.get('/api/posts', async () => {
  await new Promise(resolve => setTimeout(resolve, 100))
  return Response.json([
    { id: 1, title: 'First Post', content: 'Hello World' },
    { id: 2, title: 'Second Post', content: 'Cached Content' }
  ])
})

apiRouter.post('/api/posts', async (req) => {
  const body = await req.json()
  // This POST will invalidate /api/posts/.* cache entries
  return Response.json({ id: 3, ...body }, { status: 201 })
})

// Example 4: Custom Cache Configuration
const customRouter = new Router()

const customCache = responseCache({
  storage: { type: 'memory', maxEntries: 500 },
  keyGenerator: (req) => {
    const url = new URL(req.url)
    const userId = req.headers.get('X-User-ID') || 'anonymous'
    const version = req.headers.get('API-Version') || 'v1'
    
    return `${req.method}:${url.pathname}:${userId}:${version}`
  },
  shouldCache: (req, res) => {
    // Don't cache authenticated requests with sensitive data
    if (req.headers.get('Authorization') && req.url.includes('/private/')) {
      return false
    }
    
    // Don't cache large responses
    const contentLength = res.headers.get('Content-Length')
    if (contentLength && parseInt(contentLength) > 1048576) { // 1MB
      return false
    }
    
    // Only cache successful responses
    return res.status >= 200 && res.status < 300
  },
  varyHeaders: ['X-User-ID', 'API-Version', 'Accept-Language']
})

await customRouter.use(async (req, next) => customCache.handle(req, next))

customRouter.get('/api/data', async (req) => {
  const userId = req.headers.get('X-User-ID')
  const version = req.headers.get('API-Version') || 'v1'
  
  return Response.json({
    data: `Custom data for user ${userId} (API ${version})`,
    timestamp: new Date().toISOString()
  })
})

// Example 5: Cache Management and Monitoring
const monitoredRouter = new Router()
const cache = hybridCache({
  storage: { directory: '.cache/monitored' }
})

await monitoredRouter.use(async (req, next) => cache.handle(req, next))

monitoredRouter.get('/api/stats', () => {
  const stats = cache.getStats()
  return Response.json({
    cache: {
      hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
      hits: stats.hits,
      misses: stats.misses,
      size: stats.size,
      memoryUsage: `${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`
    }
  })
})

monitoredRouter.post('/api/cache/clear', async () => {
  await cache.clearCache()
  return Response.json({ message: 'Cache cleared successfully' })
})

monitoredRouter.get('/api/data/:id', async (req) => {
  const id = req.params.id
  await new Promise(resolve => setTimeout(resolve, 100))
  
  return Response.json({
    id: parseInt(id),
    data: `Monitored data ${id}`,
    cached: true
  })
})

// Example 6: Conditional Requests with ETags
const etagRouter = new Router()

await etagRouter.use(responseCache({
  storage: { type: 'memory' },
  etag: { enabled: true, weak: false }
}))

etagRouter.get('/api/resource/:id', async (req) => {
  const id = req.params.id
  
  // Simulate resource fetch
  const resource = {
    id: parseInt(id),
    name: `Resource ${id}`,
    lastModified: new Date('2024-01-01').toISOString()
  }
  
  return Response.json(resource)
})

// Start servers for demonstration
if (import.meta.main) {
  console.log('Starting Response Cache Examples...')
  
  // Basic memory cache example
  Bun.serve({
    port: 3001,
    fetch: basicRouter.handleRequest.bind(basicRouter),
  })
  console.log('Basic cache server running on http://localhost:3001')
  
  // API with hybrid cache
  Bun.serve({
    port: 3002,
    fetch: apiRouter.handleRequest.bind(apiRouter),
  })
  console.log('API cache server running on http://localhost:3002')
  
  // Monitored cache example
  Bun.serve({
    port: 3003,
    fetch: monitoredRouter.handleRequest.bind(monitoredRouter),
  })
  console.log('Monitored cache server running on http://localhost:3003')
  
  console.log('\nTry these endpoints:')
  console.log('- GET http://localhost:3001/api/users (basic memory cache)')
  console.log('- GET http://localhost:3002/api/config (hybrid cache, 1h TTL)')
  console.log('- GET http://localhost:3002/api/users/123 (user profile cache)')
  console.log('- GET http://localhost:3002/api/search?q=test (search cache)')
  console.log('- GET http://localhost:3003/api/stats (cache statistics)')
  console.log('- POST http://localhost:3003/api/cache/clear (clear cache)')
}
