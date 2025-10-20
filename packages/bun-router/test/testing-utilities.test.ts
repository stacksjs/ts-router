import { beforeEach, describe, expect, test } from 'bun:test'
import { Router } from '../src/router'
import {
  authMocks,
  benchmarkTests,
  createAuthTester,
  createFileUploadTester,
  createJWTTester,
  createMockRequest,
  createPerformanceTester,
  createTestClient,
  createWebSocketTester,
  fileUploadMocks,
  mockMiddleware,
  testFiles,
  testMiddleware,
  testRequest,
  wsHandlerMocks,
} from '../src/testing'

describe('Testing Utilities', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  describe('Test Client', () => {
    test('creates test client and makes GET request', async () => {
      router.get('/users/:id', async (req) => {
        return new Response(JSON.stringify({ id: req.params.id, name: 'John' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const client = createTestClient(router)
      const response = await client.get('/users/123')

      response
        .expectStatus(200)
        .expectHeader('content-type', 'application/json')
        .expectJsonContains({ id: '123', name: 'John' })
    })

    test('makes POST request with JSON body', async () => {
      router.post('/users', async (req) => {
        const body = req.jsonBody
        return new Response(JSON.stringify({ id: 1, ...body }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const client = createTestClient(router)
      const response = await client.post('/users', {
        body: { name: 'Jane', email: 'jane@example.com' },
      })

      response
        .expectStatus(201)
        .expectJsonContains({ name: 'Jane', email: 'jane@example.com' })
    })

    test('handles authentication headers', async () => {
      router.get('/protected', async (req) => {
        const auth = req.headers?.get('authorization')
        if (!auth) {
          return new Response('Unauthorized', { status: 401 })
        }
        return new Response('Protected data')
      })

      const client = createTestClient(router).auth('test-token')
      const response = await client.get('/protected')

      response.expectStatus(200)
    })
  })

  describe('Request Testing', () => {
    test('creates mock request with builder pattern', () => {
      const request = testRequest
        .get('/api/users/123')
        .headers({ Authorization: 'Bearer token' })
        .user({ id: 1, name: 'John' })
        .params({ id: '123' })
        .build()

      expect(request.method).toBe('GET')
      expect(request.params.id).toBe('123')
      expect(request.user.name).toBe('John')
      expect(request.headers?.get('Authorization')).toBe('Bearer token')
    })

    test('creates mock request with files', () => {
      const request = testRequest
        .post('/upload')
        .files([testFiles.image('avatar', 'profile.jpg')])
        .form({ description: 'Profile picture' })
        .build()

      expect(request.files).toHaveLength(1)
      expect(request.files![0].fieldName).toBe('avatar')
      expect(request.files![0].mimetype).toBe('image/jpeg')
    })
  })

  describe('Middleware Testing', () => {
    test('tests middleware that blocks unauthorized requests', async () => {
      const authMiddleware = async (req: any, next: any) => {
        if (!req.headers?.get('authorization')) {
          return new Response('Unauthorized', { status: 401 })
        }
        return await next()
      }

      const tester = testMiddleware(authMiddleware)
        .withRequest(createMockRequest('GET', '/protected'))

      const response = await tester.execute()

      expect(response?.status).toBe(401)
      tester.expectNextNotCalled()
    })

    test('tests middleware that allows authorized requests', async () => {
      const authMiddleware = async (req: any, next: any) => {
        if (!req.headers?.get('authorization')) {
          return new Response('Unauthorized', { status: 401 })
        }
        return await next()
      }

      const request = testRequest
        .get('/protected')
        .headers({ Authorization: 'Bearer token' })
        .build()

      const tester = testMiddleware(authMiddleware)
        .withRequest(request)

      await tester.execute()
      tester.expectNextCalled()
    })

    test('uses mock middleware', async () => {
      const mockAuth = mockMiddleware.auth({ id: 1, name: 'John' })
      const request = createMockRequest()

      const response = await mockAuth(request, async () => new Response('Success'))
      expect(response?.status).toBe(200)
    })
  })

  describe('Authentication Testing', () => {
    test('creates JWT tokens', () => {
      const jwtTester = createJWTTester({
        secret: 'test-secret',
        expiresIn: '1h',
      })

      const token = jwtTester.generateToken({ userId: 123, role: 'admin' })
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)

      const payload = jwtTester.decodeToken(token)
      expect(payload.payload.userId).toBe(123)
      expect(payload.payload.role).toBe('admin')
    })

    test('creates authenticated request', () => {
      const user = authMocks.user({ id: 1, name: 'John' })
      const request = createAuthTester()
        .as(user)
        .withJWT('test-token')
        .getRequest()

      expect(request.user).toEqual(user)
      expect(request.headers?.get('Authorization')).toBe('Bearer test-token')
    })

    test('creates admin user mock', () => {
      const admin = authMocks.adminUser({ name: 'Super Admin' })

      expect(admin.roles).toContain('admin')
      expect(admin.permissions).toContain('delete')
      expect(admin.name).toBe('Super Admin')
    })
  })

  describe('File Upload Testing', () => {
    test('creates file upload request', () => {
      const tester = createFileUploadTester()
        .addImage('avatar', 'profile.jpg')
        .addDocument('resume', 'resume.pdf', 'PDF content')
        .withFormData({ description: 'User files' })

      const request = tester.getRequest()

      expect(request.files).toHaveLength(2)
      expect(request.files![0].mimetype).toBe('image/jpeg')
      expect(request.files![1].mimetype).toBe('application/pdf')
      expect(request.formBody?.description).toBe('User files')
    })

    test('validates file uploads', async () => {
      const validationMiddleware = fileUploadMocks.validationMiddleware({
        maxSize: 1024, // 1KB
        allowedTypes: ['image/jpeg'],
      })

      const request = createFileUploadTester()
        .addLargeFile('file', 1) // 1MB file
        .getRequest()

      const response = await validationMiddleware(request, async () => new Response('OK'))
      expect(response.status).toBe(400)
    })

    test('creates test files', () => {
      const imageFile = testFiles.image('photo', 'vacation.jpg')
      const textFile = testFiles.text('document', 'notes.txt', 'My notes')

      expect(imageFile.mimetype).toBe('image/jpeg')
      expect(textFile.content).toBe('My notes')
    })
  })

  describe('WebSocket Testing', () => {
    test('simulates WebSocket connection and messaging', () => {
      const tester = createWebSocketTester()
        .connect()
        .send('Hello WebSocket')
        .receive('Hello Client')

      const state = tester.getState()
      expect(state.isConnected).toBe(true)
      expect(state.readyState).toBe(1) // OPEN

      const messages = tester.getSentMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].data).toBe('Hello WebSocket')
    })

    test('tests WebSocket handlers', async () => {
      const echoHandler = wsHandlerMocks.echo()
      const mockWS = {
        send: (message: any) => message,
        readyState: 1,
      }

      await echoHandler(mockWS as any, 'test message')
      expect(echoHandler).toHaveBeenCalledWith(mockWS, 'test message')
    })
  })

  describe('Performance Testing', () => {
    test('benchmarks route handler', async () => {
      const handler = async () => new Response('OK')

      const results = await benchmarkTests.routeHandler(handler, 100)

      expect(results.averageTime).toBeGreaterThan(0)
      expect(results.minTime).toBeGreaterThanOrEqual(0)
      expect(results.maxTime).toBeGreaterThanOrEqual(results.minTime)
      expect(results.throughput).toBeGreaterThan(0)
    })

    test('measures performance metrics', () => {
      const tester = createPerformanceTester()
        .start()
        .recordMetric({
          responseTime: 50,
          memoryUsage: {
            heapUsed: 1024 * 1024,
            heapTotal: 2048 * 1024,
            external: 512 * 1024,
            rss: 4096 * 1024,
          },
          cpuUsage: {
            user: 1000,
            system: 500,
          },
        })
        .end()

      const metrics = tester.getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].responseTime).toBe(50)

      const avgResponseTime = tester.getAverageResponseTime()
      expect(avgResponseTime).toBe(50)
    })
  })

  describe('Integration Tests', () => {
    test('complete API workflow', async () => {
      // Setup routes
      router.get('/api/users', async () => {
        return new Response(JSON.stringify([
          { id: 1, name: 'John', email: 'john@example.com' },
        ]), {
          headers: { 'Content-Type': 'application/json' },
        })
      })

      router.post('/api/users', async (req) => {
        const body = req.jsonBody
        return new Response(JSON.stringify({
          id: 2,
          ...body,
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const client = createTestClient(router)

      // Test GET
      const getResponse = await client.get('/api/users')
      getResponse
        .expectStatus(200)
        .expectHeader('Content-Type', 'application/json')

      const users = getResponse.json
      expect(Array.isArray(users)).toBe(true)
      expect(users.length).toBeGreaterThan(0)
      expect(users[0]).toHaveProperty('id')
      expect(users[0]).toHaveProperty('name')

      // Test POST
      const postResponse = await client.post('/api/users', {
        body: { name: 'Jane', email: 'jane@example.com' },
      })
      postResponse
        .expectStatus(201)
        .expectJsonContains({ name: 'Jane', email: 'jane@example.com' })
    })

    test('authenticated route with middleware', async () => {
      router.get('/api/profile', async (req) => {
        // Mock authenticated user for testing
        req.user = { id: 1, name: 'John' }
        return new Response(JSON.stringify({
          profile: req.user,
        }), {
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const client = createTestClient(router)
      const response = await client.get('/api/profile')

      response
        .expectStatus(200)
        .expectJsonContains({ profile: { id: 1, name: 'John' } })
    })
  })
})
