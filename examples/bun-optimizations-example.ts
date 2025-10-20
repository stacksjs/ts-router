/**
 * Bun Optimizations Example
 *
 * Comprehensive example demonstrating all Bun-specific optimizations
 */

import { Router } from '../packages/bun-router/src'
import { WebSocketClusterManager } from '../packages/bun-router/src/websocket/clustering'
import { StaticFileServer, createStaticFileMiddleware } from '../packages/bun-router/src/file-serving/static-files'
import { SQLiteCache, createSQLiteCacheMiddleware } from '../packages/bun-router/src/caching/sqlite-cache'
import { HotReloadManager, HotReloadHelpers, createHotReloadMiddleware } from '../packages/bun-router/src/development/hot-reload'
import { BunOptimizer, BunOptimizationFactory } from '../packages/bun-router/src/optimization/bun-utilities'

// Initialize router
const router = new Router()

// 1. WebSocket Clustering Setup
const wsCluster = new WebSocketClusterManager({
  workerCount: navigator.hardwareConcurrency || 4,
  maxConnectionsPerWorker: 2000,
  enableCompression: true,
  heartbeatInterval: 30000,
  idleTimeout: 300000
})

// Start WebSocket cluster
await wsCluster.start()

// Handle WebSocket connections
wsCluster.onConnection((ws, workerId) => {
  console.log(`🔌 New WebSocket connection on worker ${workerId}`)

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString())

    switch (message.type) {
      case 'join_room':
        wsCluster.joinRoom(ws.id, message.room)
        wsCluster.sendToRoom(message.room, 'user_joined', {
          userId: ws.id,
          timestamp: Date.now()
        })
        break

      case 'chat_message':
        wsCluster.sendToRoom(message.room, 'chat_message', {
          userId: ws.id,
          message: message.text,
          timestamp: Date.now()
        })
        break

      case 'broadcast':
        wsCluster.broadcast('global_message', {
          message: message.text,
          from: ws.id,
          timestamp: Date.now()
        })
        break
    }
  })

  ws.on('close', () => {
    console.log(`🔌 WebSocket connection closed: ${ws.id}`)
  })
})

// Monitor WebSocket performance
setInterval(() => {
  const stats = wsCluster.getStats()
  console.log(`📊 WebSocket Stats:`)
  console.log(`  - Total connections: ${stats.totalConnections}`)
  console.log(`  - Messages/sec: ${stats.messagesPerSecond}`)
  console.log(`  - Active rooms: ${stats.activeRooms}`)
  console.log(`  - Memory per connection: ${stats.memoryPerConnection}KB`)
}, 30000)

// 2. Static File Serving Setup
const fileServer = new StaticFileServer({
  root: './public',
  enableCaching: true,
  enableCompression: true,
  compressionLevel: 6,
  maxAge: 86400, // 1 day
  etag: true,
  lastModified: true,
  index: ['index.html'],
  extensions: ['.html'],
  setHeaders: (res, path, stat) => {
    // Security headers
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('X-Frame-Options', 'SAMEORIGIN')

    // Cache control based on file type
    if (path.endsWith('.js') || path.endsWith('.css')) {
      res.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    } else if (path.endsWith('.html')) {
      res.headers.set('Cache-Control', 'public, max-age=3600')
    }
  }
})

// Static file middleware
const staticMiddleware = createStaticFileMiddleware({
  root: './public',
  prefix: '/static',
  enableCaching: true,
  enableCompression: true
})

// 3. SQLite Caching Setup
const cache = new SQLiteCache({
  database: './cache.db',
  enableCompression: true,
  compressionLevel: 6,
  defaultTTL: 3600, // 1 hour
  maxSize: 1000000, // 1M entries
  evictionPolicy: 'lru',
  cleanupInterval: 300000, // 5 minutes
  enableStatistics: true
})

// HTTP response caching middleware
const cacheMiddleware = createSQLiteCacheMiddleware({
  cache,
  defaultTTL: 300, // 5 minutes
  keyGenerator: (req) => `${req.method}:${req.url}:${req.headers.get('accept')}`,
  shouldCache: (req, res) => {
    return req.method === 'GET' &&
           res.status === 200 &&
           !req.url.includes('/api/realtime')
  },
  varyHeaders: ['Accept', 'Accept-Encoding']
})

// 4. Hot Reload Setup (Development only)
const isDevelopment = process.env.NODE_ENV === 'development'
let hotReload: HotReloadManager | null = null

if (isDevelopment) {
  hotReload = new HotReloadManager({
    enabled: true,
    watchPaths: ['./src', './routes', './public'],
    extensions: ['.ts', '.js', '.json', '.html', '.css'],
    debounceMs: 100,
    preserveState: true,
    verbose: true,
    onReload: (changedFiles) => {
      console.log(`🔥 Hot reload: ${changedFiles.length} files changed`)

      // Invalidate cache for changed files
      changedFiles.forEach(async (file) => {
        if (file.includes('/api/')) {
          await cache.deletePattern(`GET:*${file}*`)
        }
      })
    }
  })

  // Preserve important state across reloads
  hotReload.preserveState('wsCluster', wsCluster)
  hotReload.preserveState('cache', cache)
  hotReload.preserveState('fileServer', fileServer)
}

// 5. Runtime Optimization Setup
const optimizer = isDevelopment
  ? BunOptimizationFactory.createDevelopment()
  : BunOptimizationFactory.createProduction()

// Create optimized utilities
const bufferOptimizer = optimizer.createBufferOptimizer()
const jsonOptimizer = optimizer.createJSONOptimizer()

// Optimize frequently used functions
const processUserData = optimizer.optimizeFunction((userData: any) => {
  return {
    id: userData.id,
    name: userData.name?.trim(),
    email: userData.email?.toLowerCase(),
    createdAt: new Date(userData.createdAt),
    preferences: userData.preferences || {}
  }
}, {
  memoize: true,
  profile: isDevelopment
})

const validateRequest = optimizer.optimizeFunction((req: Request) => {
  const contentType = req.headers.get('content-type')
  const userAgent = req.headers.get('user-agent')

  return {
    isJson: contentType?.includes('application/json'),
    isBrowser: userAgent?.includes('Mozilla'),
    hasAuth: req.headers.has('authorization')
  }
}, {
  memoize: true,
  warmup: true
})

// 6. Route Definitions

// Health check endpoint
router.get('/health', async (req) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      webSocket: wsCluster.isHealthy(),
      cache: await cache.ping(),
      fileServer: fileServer.isHealthy(),
      optimizer: optimizer.getMetrics().eventLoop.delay < 100
    }
  }

  const allHealthy = Object.values(health.services).every(Boolean)
  const status = allHealthy ? 200 : 503

  return Response.json(health, { status })
})

// Metrics endpoint for monitoring
router.get('/metrics', async (req) => {
  const metrics = {
    webSocket: wsCluster.getStats(),
    cache: await cache.getStats(),
    optimizer: optimizer.getMetrics(),
    fileServer: fileServer.getStats()
  }

  // Convert to Prometheus format
  const prometheusMetrics = [
    `# HELP websocket_connections Total WebSocket connections`,
    `# TYPE websocket_connections gauge`,
    `websocket_connections ${metrics.webSocket.totalConnections}`,
    ``,
    `# HELP cache_hit_rate Cache hit rate percentage`,
    `# TYPE cache_hit_rate gauge`,
    `cache_hit_rate ${metrics.cache.hitRate}`,
    ``,
    `# HELP memory_usage_bytes Memory usage in bytes`,
    `# TYPE memory_usage_bytes gauge`,
    `memory_usage_bytes ${metrics.optimizer.memoryUsage.heapUsed}`,
    ``
  ].join('\n')

  return new Response(prometheusMetrics, {
    headers: { 'Content-Type': 'text/plain' }
  })
})

// Static file routes
router.use('/static/*', staticMiddleware)
router.get('/favicon.ico', staticMiddleware)
router.get('/robots.txt', staticMiddleware)

// API routes with caching
router.get('/api/users', cacheMiddleware, async (req) => {
  // Simulate database query
  const users = await new Promise(resolve => {
    setTimeout(() => {
      resolve([
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
      ])
    }, 100)
  })

  return Response.json(users)
})

router.get('/api/users/:id', cacheMiddleware, async (req) => {
  const userId = parseInt(req.params.id)

  // Use optimized cache operations
  const cacheKey = `user:${userId}`
  let user = await cache.get(cacheKey)

  if (!user) {
    // Simulate database query
    user = await new Promise(resolve => {
      setTimeout(() => {
        resolve({
          id: userId,
          name: `User ${userId}`,
          email: `user${userId}@example.com`,
          createdAt: new Date().toISOString()
        })
      }, 50)
    })

    // Cache for 1 hour
    await cache.set(cacheKey, user, 3600)
  }

  // Process with optimized function
  const processedUser = processUserData(user)

  return Response.json(processedUser)
})

// Real-time API (not cached)
router.get('/api/realtime/stats', async (req) => {
  const stats = {
    timestamp: Date.now(),
    connections: wsCluster.getStats().totalConnections,
    cacheHitRate: (await cache.getStats()).hitRate,
    memoryUsage: optimizer.getMetrics().memoryUsage.heapUsed,
    eventLoopDelay: optimizer.getMetrics().eventLoop.delay
  }

  return Response.json(stats)
})

// File upload with optimized buffer handling
router.post('/api/upload', async (req) => {
  const formData = await req.formData()
  const file = formData.get('file') as File

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }

  // Use optimized buffer operations
  const buffer = bufferOptimizer.getBuffer(file.size)
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)

  // Copy data to optimized buffer
  buffer.set(uint8Array)

  // Process file (simulate)
  const processedData = {
    filename: file.name,
    size: file.size,
    type: file.type,
    hash: Bun.hash(buffer).toString(16)
  }

  // Return buffer to pool
  bufferOptimizer.returnBuffer(buffer)

  return Response.json(processedData)
})

// Bulk data processing with worker pool
router.post('/api/process-bulk', async (req) => {
  const data = await req.json()

  if (!Array.isArray(data) || data.length === 0) {
    return Response.json({ error: 'Invalid data' }, { status: 400 })
  }

  // Create worker pool for CPU-intensive processing
  const workerPool = optimizer.createWorkerPool('./worker.js', 4)

  try {
    // Process data in parallel
    const results = await Promise.all(
      data.map(item => workerPool.execute({ operation: 'process', data: item }))
    )

    return Response.json({ results, processed: results.length })
  } finally {
    workerPool.terminate()
  }
})

// Cache management endpoints
router.post('/api/cache/invalidate', async (req) => {
  const { pattern } = await req.json()

  if (!pattern) {
    return Response.json({ error: 'Pattern required' }, { status: 400 })
  }

  const deleted = await cache.deletePattern(pattern)

  return Response.json({ deleted, pattern })
})

router.get('/api/cache/stats', async (req) => {
  const stats = await cache.getStats()
  return Response.json(stats)
})

// WebSocket upgrade endpoint
router.get('/ws', async (req) => {
  const upgrade = req.headers.get('upgrade')

  if (upgrade !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 400 })
  }

  // Let the cluster manager handle the upgrade
  return wsCluster.handleUpgrade(req)
})

// 7. Middleware Setup

// Hot reload middleware (development only)
if (hotReload) {
  router.use(createHotReloadMiddleware(hotReload))
}

// Request validation middleware
router.use(async (req, next) => {
  const validation = validateRequest(req)

  // Add validation info to request
  ;(req as any).validation = validation

  return await next()
})

// Performance monitoring middleware
router.use(async (req, next) => {
  const start = performance.now()

  const response = await next()

  const duration = performance.now() - start

  // Log slow requests
  if (duration > 1000) {
    console.warn(`🐌 Slow request: ${req.method} ${req.url} took ${duration.toFixed(2)}ms`)
  }

  // Add performance headers
  response.headers.set('X-Response-Time', `${duration.toFixed(2)}ms`)

  return response
})

// Error handling middleware
router.use(async (req, next) => {
  try {
    return await next()
  } catch (error) {
    console.error('Request error:', error)

    // Log error with context
    const errorContext = {
      method: req.method,
      url: req.url,
      userAgent: req.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    }

    // In production, you might want to send this to a monitoring service
    if (!isDevelopment) {
      // monitoring.logError(errorContext)
    }

    return Response.json(
      { error: 'Internal server error', id: Date.now().toString() },
      { status: 500 }
    )
  }
})

// 8. Server Setup

const server = Bun.serve({
  port: process.env.PORT || 3000,
  hostname: process.env.HOST || 'localhost',

  fetch: router.fetch.bind(router),

  websocket: {
    message: (ws, message) => {
      // Forward to cluster manager
      wsCluster.handleMessage(ws, message)
    },

    open: (ws) => {
      wsCluster.handleConnection(ws)
    },

    close: (ws) => {
      wsCluster.handleDisconnection(ws)
    }
  }
})

console.log(`🚀 Server running on http://${server.hostname}:${server.port}`)

// 9. Performance Monitoring

// Log performance metrics every 30 seconds
setInterval(() => {
  const metrics = optimizer.getMetrics()

  console.log(`📊 Performance Metrics:`)
  console.log(`  - Memory: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`)
  console.log(`  - Event Loop Delay: ${metrics.eventLoop.delay.toFixed(2)}ms`)
  console.log(`  - GC Collections: ${metrics.gc.collections}`)
  console.log(`  - JIT Compilations: ${metrics.bunSpecific.jitCompilations}`)
}, 30000)

// Log cache statistics every minute
setInterval(async () => {
  const stats = await cache.getStats()

  console.log(`💾 Cache Statistics:`)
  console.log(`  - Hit Rate: ${stats.hitRate.toFixed(1)}%`)
  console.log(`  - Total Entries: ${stats.totalEntries}`)
  console.log(`  - Memory Usage: ${Math.round(stats.memoryUsage / 1024 / 1024)}MB`)
  console.log(`  - Operations/sec: ${stats.operationsPerSecond}`)
}, 60000)

// 10. Graceful Shutdown

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`)

  // Stop accepting new connections
  server.stop()

  // Stop WebSocket cluster
  await wsCluster.stop()

  // Close cache
  await cache.close()

  // Stop hot reload
  if (hotReload) {
    hotReload.stop()
  }

  // Cleanup optimizer
  optimizer.cleanup()

  console.log('✅ Graceful shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
  gracefulShutdown('unhandledRejection')
})

export { server, router, wsCluster, cache, fileServer, hotReload, optimizer }
