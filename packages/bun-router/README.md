# @bun-router

A Laravel-inspired router for Bun applications.

## Features

- Laravel-style routing API
- Support for route parameters
- Route grouping
- Action class support
- Middleware support (global and route-specific)
- Built on top of Bun's native HTTP server

## Installation

```bash
bun add @bun-router
```

## Basic Usage

```typescript
import { route } from '@bun-router'

// Basic route with inline handler
route.get('/', () => new Response('Hello World!'))

// Route with parameters
route.get('/users/{id}', (req) => {
  const { id } = req.params
  return Response.json({ userId: id })
})

// Route with action class
route.post('/subscribe', 'Actions/SubscribeAction')

// Route grouping
route.group({ prefix: '/api' }, () => {
  route.get('/users', 'Actions/User/IndexAction')
  route.post('/users', 'Actions/User/StoreAction')
})

// Health check route
route.health()

// Start the server
route.serve({
  port: 3000,
})
```

## Action Classes

Action classes provide a clean way to organize your route handlers. Create a class that implements a `handle` method:

```typescript
// actions/subscribe_action.ts
import type { EnhancedRequest } from '@bun-router'

export default class SubscribeAction {
  async handle(request: EnhancedRequest): Promise<Response> {
    const data = await request.json()

    // Handle subscription logic

    return Response.json({
      success: true,
      message: 'Subscribed successfully'
    })
  }
}
```

## Middleware

Middleware allows you to run code before your route handlers. You can use middleware globally or for specific routes/groups.

### Creating Middleware

Create a middleware class that implements the `handle` method:

```typescript
// middleware/auth.ts
import type { EnhancedRequest, Middleware, NextFunction } from '@bun-router'

export default class AuthMiddleware implements Middleware {
  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 })
    }

    // If auth passes, continue to next middleware or route handler
    return next()
  }
}
```

### Using Middleware

You can use middleware in several ways:

1. Global Middleware (applies to all routes):

```typescript
route.use('Middleware/Auth')
route.use('Middleware/Logger')

// Or with inline middleware
route.use(async (req, next) => {
  console.log(`${req.method} ${req.url}`)
  return next()
})
```

2. Group Middleware (applies to all routes in a group):

```typescript
route.group({
  prefix: '/api',
  middleware: ['Middleware/Auth']
}, () => {
  route.get('/users', 'Actions/User/IndexAction')
  route.post('/users', 'Actions/User/StoreAction')
})
```

3. Inline Middleware:

```typescript
route.group({
  middleware: [
    async (req, next) => {
      console.log('Processing request...')
      const response = await next()
      console.log('Request complete')
      return response
    }
  ]
}, () => {
  route.get('/users', 'Actions/User/IndexAction')
})
```

## Route Groups

Group related routes with a common prefix and middleware:

```typescript
route.group({
  prefix: '/api/v1',
  middleware: ['Middleware/Auth', 'Middleware/RateLimit']
}, () => {
  // All routes here will be prefixed with /api/v1
  route.get('/users', 'Actions/User/IndexAction')
  route.post('/users', 'Actions/User/StoreAction')

  // Nested groups
  route.group({
    prefix: '/admin',
    middleware: ['Middleware/AdminAuth']
  }, () => {
    route.get('/stats', 'Actions/Admin/StatsAction')
  })
})
```

## Route Parameters

Access route parameters through the `params` object:

```typescript
route.get('/users/{id}/posts/{postId}', (req) => {
  const { id, postId } = req.params
  return Response.json({ userId: id, postId })
})
```

## TypeScript Support

The router is written in TypeScript and provides full type definitions:

```typescript
import type { ActionHandler, EnhancedRequest, Middleware, NextFunction } from '@bun-router'

// Type-safe request handling
const handler: ActionHandler = (req: EnhancedRequest) => {
  const { id } = req.params
  return Response.json({ id })
}

// Type-safe middleware
const loggerMiddleware: Middleware = {
  handle: async (req: EnhancedRequest, next: NextFunction) => {
    console.log(`${req.method} ${req.url}`)
    return next()
  }
}

route.use(loggerMiddleware.handle)
route.get('/users/{id}', handler)
```

## Streaming Support

The router provides comprehensive streaming capabilities for modern web applications:

### File Streaming

Stream files with automatic content-type detection:

```typescript
// Basic file streaming
route.get('/download/{filename}', (req) => {
  const { filename } = req.params
  return route.streamFile(`./uploads/${filename}`)
})

// File streaming with range support (for video/audio)
route.get('/video/{id}', async (req) => {
  const { id } = req.params
  const videoPath = `./videos/${id}.mp4`
  return await route.streamFileWithRanges(videoPath, req)
})
```

### Response Streaming

Create streaming routes with clean, top-level API methods:

```typescript
// Default streaming (uses Bun's async generator optimization)
route.stream('/stream-data', async function* () {
  for (let i = 0; i < 100; i++) {
    yield `Chunk ${i}\n`
    await new Promise(resolve => setTimeout(resolve, 100))
  }
})

// Direct streaming for high-performance scenarios
route.streamDirect('/stream-direct', async ({ write, close }) => {
  for (let i = 0; i < 1000; i++) {
    write(`Data chunk ${i}\n`)
    if (i % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  close()
})

// Buffered streaming using Bun.ArrayBufferSink
route.streamBuffered('/stream-buffered', async ({ write, flush, end }) => {
  for (let i = 0; i < 1000; i++) {
    write(`Item ${i}\n`)
    if (i % 50 === 0) {
      flush() // Flush buffer every 50 items
    }
  }
  end()
}, { highWaterMark: 1024 * 1024 }) // 1MB buffer
```

### Server-Sent Events (SSE)

Real-time data streaming to web clients:

```typescript
// Basic SSE endpoint
route.streamSSE('/events', async function* () {
  let counter = 0
  while (true) {
    yield {
      data: { timestamp: Date.now(), counter: counter++ },
      event: 'update',
      id: `msg-${counter}`
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
})

// SSE with custom retry interval
route.streamSSE('/notifications', async function* () {
  yield {
    data: 'Connection established',
    event: 'connected',
    retry: 5000 // Retry after 5 seconds if connection drops
  }
  
  // Stream notifications...
})
```

### JSON Streaming (NDJSON)

Stream JSON objects line by line:

```typescript
// Stream database results
route.streamJSON('/users/stream', async function* () {
  const users = await getUsersFromDatabase()
  for (const user of users) {
    yield { id: user.id, name: user.name, email: user.email }
  }
})

// Stream large datasets efficiently
route.streamJSON('/analytics/data', async function* () {
  for (let page = 1; page <= 100; page++) {
    const data = await fetchAnalyticsPage(page)
    for (const record of data) {
      yield record
    }
  }
})
```

### Transform Streams

Process incoming request streams using Bun's TransformStream:

```typescript
// Transform uploaded data
route.post('/process-upload', route.transformStream(
  (chunk) => {
    // Process each chunk (e.g., uppercase text)
    const text = new TextDecoder().decode(chunk)
    return text.toUpperCase()
  },
  { headers: { 'Content-Type': 'text/plain' } }
))
```

### Advanced Streaming Features

Leverage Bun's performance optimizations:

```typescript
// Use direct ReadableStream for maximum performance
route.streamDirect('/high-performance-stream', async ({ write, close }) => {
  // No queueing - data is written directly to the stream
  for (let i = 0; i < 10000; i++) {
    write(new Uint8Array([65 + (i % 26)])) // A-Z pattern
  }
  close()
})

// Buffered streaming with Bun.ArrayBufferSink
route.streamBuffered('/buffered-data', async ({ write, flush, end }) => {
  // Efficient incremental buffer building
  for (let batch = 0; batch < 10; batch++) {
    for (let i = 0; i < 100; i++) {
      write(`Batch ${batch}, Item ${i}\n`)
    }
    flush() // Periodically flush the buffer
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  end()
}, { 
  highWaterMark: 512 * 1024, // 512KB buffer
  asUint8Array: true 
})

// Mix streaming with middleware and route groups
route.group({ prefix: '/api/v1', middleware: ['Auth'] }, () => {
  route.streamJSON('/live-metrics', async function* () {
    while (true) {
      yield await getSystemMetrics()
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  })
  
  route.streamSSE('/notifications', async function* () {
    // Stream user-specific notifications
    const userId = getCurrentUserId()
    for await (const notification of watchNotifications(userId)) {
      yield { data: notification, event: 'notification' }
    }
  })
})
```

## Server Configuration

The `serve` method accepts all Bun server options:

```typescript
route.serve({
  port: 3000,
  hostname: 'localhost',
  development: true,
})
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
