# Testing Utilities

Comprehensive testing utilities for bun-router applications, built with Bun's native testing framework.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Test Client](#test-client)
- [Request Testing](#request-testing)
- [Response Testing](#response-testing)
- [Middleware Testing](#middleware-testing)
- [Authentication Testing](#authentication-testing)
- [Model Binding Testing](#model-binding-testing)
- [File Upload Testing](#file-upload-testing)
- [WebSocket Testing](#websocket-testing)
- [Performance Testing](#performance-testing)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

The bun-router testing utilities provide a comprehensive suite of tools for testing your router applications:

- **Test Client**: HTTP client for making requests to your router
- **Request/Response Mocking**: Create mock requests and responses
- **Middleware Testing**: Test middleware in isolation
- **Authentication Testing**: JWT, session, and auth middleware testing
- **Model Binding Testing**: Test route model binding
- **File Upload Testing**: Test file upload functionality
- **WebSocket Testing**: Test WebSocket connections and messages
- **Performance Testing**: Load testing and benchmarking

All utilities use Bun's native `mock()` and `spyOn()` functions for optimal performance.

## Installation

The testing utilities are included with bun-router:

```typescript
import { 
  createTestClient,
  testRequest,
  testMiddleware,
  createAuthTester,
  createFileUploadTester,
  createWebSocketTester,
  createPerformanceTester
} from 'bun-router/testing'
```

## Quick Start

```typescript
import { test, expect } from 'bun:test'
import { Router } from 'bun-router'
import { createTestClient } from 'bun-router/testing'

// Create a router
const router = new Router()
router.get('/users/:id', async (req) => {
  return new Response(JSON.stringify({ id: req.params.id }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

// Create test client
const client = createTestClient(router)

test('GET /users/:id returns user data', async () => {
  const response = await client.get('/users/123')
  
  response
    .expectStatus(200)
    .expectJson({ id: '123' })
    .expectHeader('content-type', 'application/json')
})
```

## Test Client

The test client provides a fluent API for making HTTP requests to your router.

### Basic Usage

```typescript
import { createTestClient } from 'bun-router/testing'

const client = createTestClient(router)

// HTTP methods
await client.get('/api/users')
await client.post('/api/users', { body: { name: 'John' } })
await client.put('/api/users/1', { body: { name: 'Jane' } })
await client.patch('/api/users/1', { body: { status: 'active' } })
await client.delete('/api/users/1')
await client.options('/api/users')
await client.head('/api/users')
```

### Request Configuration

```typescript
// With headers
const response = await client.get('/api/users', {
  headers: { 'Authorization': 'Bearer token123' }
})

// With query parameters
const response = await client.get('/api/users', {
  query: { page: '1', limit: '10' }
})

// With JSON body
const response = await client.post('/api/users', {
  body: { name: 'John', email: 'john@example.com' }
})

// With form data
const response = await client.post('/api/users', {
  body: { name: 'John' },
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
})
```

### Client Configuration

```typescript
// Default headers
const client = createTestClient(router)
  .setDefaultHeaders({ 'User-Agent': 'Test Client' })
  .auth('bearer-token')

// With configuration
const client = createTestClient(router, {
  baseUrl: 'https://api.example.com',
  timeout: 10000,
  followRedirects: false
})
```

## Request Testing

Create mock requests for testing handlers and middleware.

```typescript
import { testRequest, createMockRequest } from 'bun-router/testing'

// Using builder pattern
const request = testRequest
  .get('/api/users/123')
  .headers({ 'Authorization': 'Bearer token' })
  .user({ id: 1, name: 'John' })
  .session({ authenticated: true })
  .build()

// Direct creation
const request = createMockRequest('POST', '/api/users', {
  body: { name: 'John' },
  headers: { 'Content-Type': 'application/json' }
})

// With files
const request = testRequest
  .post('/api/upload')
  .files([{
    fieldName: 'avatar',
    filename: 'profile.jpg',
    content: new ArrayBuffer(1024),
    mimetype: 'image/jpeg'
  }])
  .build()
```

## Response Testing

Test and assert response properties with a fluent API.

```typescript
const response = await client.get('/api/users/123')

response
  .expectStatus(200)
  .expectSuccess()
  .expectHeader('content-type', 'application/json')
  .expectJson({ id: '123', name: 'John' })
  .expectJsonContains({ id: '123' })
  .expectBodyContains('John')
  .expectCookie('session', 'abc123')

// Validation errors
response
  .expectStatus(422)
  .expectValidationError('email', 'Email is required')

// Redirects
response
  .expectStatus(302)
  .expectRedirect('/login')
```

## Middleware Testing

Test middleware in isolation with comprehensive mocking.

```typescript
import { testMiddleware, mockMiddleware } from 'bun-router/testing'

// Test custom middleware
const authMiddleware = async (req, next) => {
  if (!req.headers.get('authorization')) {
    return new Response('Unauthorized', { status: 401 })
  }
  return await next()
}

test('auth middleware blocks unauthorized requests', async () => {
  const tester = testMiddleware(authMiddleware)
    .withRequest(testRequest.get('/protected').build())

  const response = await tester.execute()
  
  expect(response?.status).toBe(401)
  tester.expectNextNotCalled()
})

test('auth middleware allows authorized requests', async () => {
  const tester = testMiddleware(authMiddleware)
    .withRequest(testRequest.get('/protected')
      .headers({ 'Authorization': 'Bearer token' })
      .build())

  await tester.execute()
  tester.expectNextCalled()
})

// Mock middleware
const mockAuth = mockMiddleware.auth({ id: 1, name: 'John' })
const mockRateLimit = mockMiddleware.rateLimit(false)
const mockCors = mockMiddleware.cors('https://example.com')
```

### Middleware Chain Testing

```typescript
import { testMiddlewareChain } from 'bun-router/testing'

const middlewares = [corsMiddleware, authMiddleware, rateLimitMiddleware]

test('middleware chain execution order', async () => {
  const chain = testMiddlewareChain(middlewares)
    .withRequest(testRequest.get('/api/data').build())
    .withFinalHandler(async () => new Response('Success'))

  const response = await chain.execute()
  expect(response?.status).toBe(200)
})
```

## Authentication Testing

Comprehensive authentication testing utilities.

### JWT Testing

```typescript
import { createJWTTester, createAuthTester } from 'bun-router/testing'

// JWT token generation
const jwtTester = createJWTTester({
  secret: 'test-secret',
  expiresIn: '1h'
})

const token = jwtTester.generateToken({ userId: 123, role: 'admin' })
const expiredToken = jwtTester.generateExpiredToken()
const invalidToken = jwtTester.generateInvalidToken()

// Test with JWT
const request = createAuthTester()
  .withJWT(token)
  .as({ id: 123, role: 'admin' })
  .getRequest()
```

### Session Testing

```typescript
import { createSessionTester } from 'bun-router/testing'

const sessionTester = createSessionTester({
  sessionId: 'test-session-123',
  maxAge: 3600000
})

const session = sessionTester.createSession({
  userId: 123,
  authenticated: true
})

const request = createAuthTester()
  .withSession(session.data)
  .withAuthCookies({ session: session.sessionId })
  .getRequest()
```

### Auth Mocks

```typescript
import { authMocks } from 'bun-router/testing'

// Mock users
const user = authMocks.user({ id: 1, email: 'test@example.com' })
const admin = authMocks.adminUser({ id: 2, name: 'Admin' })

// Mock middleware
const authMiddleware = authMocks.authMiddleware(user)
const roleMiddleware = authMocks.roleMiddleware(['admin'])
const permissionMiddleware = authMocks.permissionMiddleware(['read', 'write'])
```

## Model Binding Testing

Test route model binding with mock models and constraints.

```typescript
import { 
  createModelBindingTester, 
  modelMocks, 
  constraintHelpers 
} from 'bun-router/testing'

// Mock models
const User = modelMocks.User
const Post = modelMocks.Post

// Test model resolution
test('user model binding resolves correctly', async () => {
  const tester = createModelBindingTester()
    .withModel(User)
    .withParams({ userId: '123' })

  const user = await tester.testResolution('123')
  expect(user.id).toBe(123)
})

// Test constraints
const belongsToUser = constraintHelpers.belongsToUser()
const published = constraintHelpers.published()

test('post belongs to user constraint', async () => {
  const post = new Post({ id: 1, userId: 123 })
  const user = { id: 123 }
  const request = createAuthTester().as(user).getRequest()
  
  const result = await belongsToUser(post, request)
  expect(result).toBe(true)
})
```

## File Upload Testing

Test file upload functionality with various scenarios.

```typescript
import { 
  createFileUploadTester, 
  fileUploadMocks,
  fileUploadScenarios,
  testFiles
} from 'bun-router/testing'

// Single file upload
test('single image upload', async () => {
  const tester = createFileUploadTester()
    .addImage('avatar', 'profile.jpg')
    .withFormData({ description: 'Profile picture' })

  const request = tester.getRequest()
  expect(request.files).toHaveLength(1)
  expect(request.files![0].mimetype).toBe('image/jpeg')
})

// Multiple files
test('multiple file upload', async () => {
  const tester = fileUploadScenarios.multipleFileUpload()
  const request = tester.getRequest()
  
  expect(request.files).toHaveLength(3)
})

// File validation
test('file size validation', async () => {
  const validationMiddleware = fileUploadMocks.validationMiddleware({
    maxSize: 1024 * 1024, // 1MB
    allowedTypes: ['image/jpeg', 'image/png']
  })

  const request = createFileUploadTester()
    .addLargeFile('file', 10) // 10MB file
    .getRequest()

  const response = await validationMiddleware(request, async () => new Response('OK'))
  expect(response.status).toBe(400)
})
```

## WebSocket Testing

Test WebSocket connections and message handling.

```typescript
import { 
  createWebSocketTester, 
  wsHandlerMocks,
  wsTestScenarios 
} from 'bun-router/testing'

test('WebSocket connection and messaging', async () => {
  const tester = createWebSocketTester()
    .connect()
    .send('Hello WebSocket')
    .receive('Hello Client')

  const messages = tester.getSentMessages()
  expect(messages).toHaveLength(1)
  expect(messages[0].data).toBe('Hello WebSocket')
})

// Test handlers
test('echo WebSocket handler', async () => {
  const echoHandler = wsHandlerMocks.echo()
  const mockWS = createMockServerWebSocket()
  
  await echoHandler(mockWS, 'test message')
  
  const messages = mockWS.getTester().getSentMessages()
  expect(messages[0].data).toBe('test message')
})

// Broadcasting
test('message broadcasting', async () => {
  const clients = wsTestScenarios.messageBroadcast(3)
  
  expect(clients).toHaveLength(3)
  clients.forEach(client => {
    expect(client.getState().isConnected).toBe(true)
  })
})
```

## Performance Testing

Load testing and performance benchmarking utilities.

```typescript
import { 
  createPerformanceTester,
  createLoadTester,
  benchmarkTests,
  performanceAssertions
} from 'bun-router/testing'

// Route handler benchmarking
test('route handler performance', async () => {
  const handler = async (req) => new Response('OK')
  
  const results = await benchmarkTests.routeHandler(handler, 1000)
  
  performanceAssertions.responseTimeWithin(results.averageTime, 10) // 10ms max
  performanceAssertions.throughputAtLeast(results.throughput, 1000) // 1000 RPS min
})

// Load testing
test('API load test', async () => {
  const client = createTestClient(router)
  const loadTester = createLoadTester(client, {
    duration: 30000, // 30 seconds
    concurrency: 50,
    requestsPerSecond: 100
  })

  const results = await loadTester.run('/api/users')
  
  performanceAssertions.errorRateBelow(
    results.failedRequests / results.totalRequests,
    0.01 // 1% max error rate
  )
})

// Memory leak testing
test('no memory leaks in handler', async () => {
  const handler = async (req) => new Response(JSON.stringify({ data: 'test' }))
  
  const results = await memoryTests.testRouteHandlerMemoryLeaks(handler, 1000)
  
  performanceAssertions.noMemoryLeaks(results.memoryGrowth)
})
```

## Best Practices

### 1. Test Organization

```typescript
// Group related tests
describe('User API', () => {
  let client: TestClient
  
  beforeEach(() => {
    client = createTestClient(router)
  })
  
  describe('GET /users', () => {
    test('returns user list', async () => {
      // Test implementation
    })
  })
})
```

### 2. Mock Data Management

```typescript
// Create reusable test data
const testUsers = {
  john: authMocks.user({ id: 1, name: 'John', email: 'john@example.com' }),
  admin: authMocks.adminUser({ id: 2, name: 'Admin' })
}

// Use factories for consistent data
const createTestPost = (overrides = {}) => ({
  id: 1,
  title: 'Test Post',
  content: 'Test content',
  userId: 1,
  ...overrides
})
```

### 3. Async Test Handling

```typescript
// Always await async operations
test('async route handler', async () => {
  const response = await client.get('/api/async-data')
  response.expectStatus(200)
})

// Handle promise rejections
test('error handling', async () => {
  expect(async () => {
    await client.get('/api/error')
  }).toThrow()
})
```

### 4. Performance Testing Guidelines

```typescript
// Set realistic performance expectations
performanceAssertions.responseTimeWithin(averageTime, 100) // 100ms
performanceAssertions.throughputAtLeast(throughput, 500) // 500 RPS
performanceAssertions.errorRateBelow(errorRate, 0.005) // 0.5%
```

## Examples

### Complete API Test Suite

```typescript
import { test, describe, beforeEach, expect } from 'bun:test'
import { Router } from 'bun-router'
import { createTestClient, authMocks } from 'bun-router/testing'

describe('Blog API', () => {
  let router: Router
  let client: TestClient
  let user: any
  let admin: any

  beforeEach(() => {
    router = new Router()
    client = createTestClient(router)
    user = authMocks.user({ id: 1, name: 'John' })
    admin = authMocks.adminUser({ id: 2, name: 'Admin' })
    
    // Setup routes
    router.get('/posts', async (req) => {
      return new Response(JSON.stringify([
        { id: 1, title: 'Post 1', userId: 1 },
        { id: 2, title: 'Post 2', userId: 2 }
      ]))
    })
    
    router.post('/posts', async (req) => {
      const body = await req.json()
      return new Response(JSON.stringify({
        id: 3,
        ...body,
        userId: req.user?.id
      }), { status: 201 })
    })
  })

  test('GET /posts returns all posts', async () => {
    const response = await client.get('/posts')
    
    response
      .expectStatus(200)
      .expectJsonStructure([
        { id: expect.any(Number), title: expect.any(String) }
      ])
  })

  test('POST /posts creates new post', async () => {
    const response = await client
      .withHeaders({ 'Authorization': 'Bearer token' })
      .post('/posts', {
        body: { title: 'New Post', content: 'Content' },
        user: user
      })
    
    response
      .expectStatus(201)
      .expectJsonContains({ title: 'New Post', userId: 1 })
  })
})
```

### Middleware Integration Test

```typescript
import { testMiddlewareChain, mockMiddleware } from 'bun-router/testing'

test('complete middleware chain', async () => {
  const middlewares = [
    mockMiddleware.cors(),
    mockMiddleware.auth(user),
    mockMiddleware.rateLimit(false)
  ]
  
  const chain = testMiddlewareChain(middlewares)
    .withRequest(testRequest.get('/api/protected').build())
    .withFinalHandler(async () => new Response('Protected data'))
  
  const response = await chain.execute()
  
  expect(response?.status).toBe(200)
  expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('*')
})
```

This comprehensive testing framework provides everything you need to thoroughly test your bun-router applications with confidence and ease.
