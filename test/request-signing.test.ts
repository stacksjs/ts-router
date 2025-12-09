import type { EnhancedRequest, NextFunction } from '../packages/bun-router/src/types'
import { beforeEach, describe, expect, test } from 'bun:test'
import RequestSigning, {
  InMemoryNonceStore,
  requestSigning,
  SignatureError,
  signRequest,
  verifySignature,
} from '../packages/bun-router/src/middleware/request_signing'

describe('Request Signing Middleware', () => {
  const SECRET = 'test-secret-key-12345'

  const createMockRequest = (
    url = 'http://localhost/api/test',
    options: RequestInit = {},
  ): EnhancedRequest => {
    return new Request(url, options) as EnhancedRequest
  }

  const createNext = (): NextFunction => {
    return () => Promise.resolve(new Response('OK'))
  }

  describe('SignatureError', () => {
    test('should create error with correct properties', () => {
      const error = new SignatureError('MISSING_SIGNATURE', 'Signature is missing')
      expect(error.code).toBe('MISSING_SIGNATURE')
      expect(error.message).toBe('Signature is missing')
      expect(error.statusCode).toBe(401)
      expect(error.name).toBe('SignatureError')
    })
  })

  describe('InMemoryNonceStore', () => {
    let store: InMemoryNonceStore

    beforeEach(() => {
      store = new InMemoryNonceStore(60000)
    })

    test('should store and check nonce', () => {
      const nonce = 'test-nonce-123'

      expect(store.has(nonce)).toBe(false)
      store.set(nonce, 300)
      expect(store.has(nonce)).toBe(true)
    })

    test('should expire nonces', async () => {
      const nonce = 'expiring-nonce'

      store.set(nonce, 0) // 0 seconds = immediate expiry
      // Small delay to ensure expiry
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(store.has(nonce)).toBe(false)
    })

    test('should cleanup on destroy', () => {
      store.set('nonce1', 300)
      store.set('nonce2', 300)
      store.destroy()
      // After destroy, store is cleared
      expect(store.has('nonce1')).toBe(false)
    })
  })

  describe('signRequest', () => {
    test('should add signature headers to request', async () => {
      const req = new Request('http://localhost/api/users', {
        method: 'GET',
      })

      const signedReq = await signRequest(req, SECRET)

      expect(signedReq.headers.get('X-Signature')).toBeTruthy()
      expect(signedReq.headers.get('X-Timestamp')).toBeTruthy()
      expect(signedReq.headers.get('X-Nonce')).toBeTruthy()
    })

    test('should add key ID header when provided', async () => {
      const req = new Request('http://localhost/api/users', {
        method: 'GET',
      })

      const signedReq = await signRequest(req, SECRET, { keyId: 'api-key-1' })

      expect(signedReq.headers.get('X-Key-Id')).toBe('api-key-1')
    })

    test('should use custom header names', async () => {
      const req = new Request('http://localhost/api/users', {
        method: 'GET',
      })

      const signedReq = await signRequest(req, SECRET, {
        signatureHeader: 'Authorization',
        timestampHeader: 'X-Request-Time',
      })

      expect(signedReq.headers.get('Authorization')).toBeTruthy()
      expect(signedReq.headers.get('X-Request-Time')).toBeTruthy()
    })

    test('should support base64 encoding', async () => {
      const req = new Request('http://localhost/api/users', {
        method: 'GET',
      })

      const signedReq = await signRequest(req, SECRET, { encoding: 'base64' })
      const signature = signedReq.headers.get('X-Signature')

      // Base64 signatures contain letters, numbers, +, /, =
      expect(signature).toMatch(/^[\w+/=]+$/)
    })

    test('should include request body in signature', async () => {
      const body = JSON.stringify({ name: 'John', email: 'john@example.com' })
      const req = new Request('http://localhost/api/users', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      })

      const signedReq = await signRequest(req, SECRET, {
        signedParts: ['method', 'path', 'timestamp', 'body'],
      })

      expect(signedReq.headers.get('X-Signature')).toBeTruthy()
    })
  })

  describe('verifySignature', () => {
    test('should verify valid signature', async () => {
      const stringToSign = 'GET\n/api/users\n1234567890'
      const encoder = new TextEncoder()
      const keyData = encoder.encode(SECRET)
      const messageData = encoder.encode(stringToSign)

      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
      const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData)
      const signature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const isValid = await verifySignature(stringToSign, signature, SECRET)
      expect(isValid).toBe(true)
    })

    test('should reject invalid signature', async () => {
      const isValid = await verifySignature(
        'GET\n/api/users\n1234567890',
        'invalid-signature-here',
        SECRET,
      )
      expect(isValid).toBe(false)
    })

    test('should support different algorithms', async () => {
      const stringToSign = 'test-data'
      const encoder = new TextEncoder()
      const keyData = encoder.encode(SECRET)
      const messageData = encoder.encode(stringToSign)

      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign'],
      )
      const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData)
      const signature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const isValid = await verifySignature(stringToSign, signature, SECRET, 'sha512')
      expect(isValid).toBe(true)
    })
  })

  describe('RequestSigning middleware', () => {
    test('should reject request without signature', async () => {
      const middleware = new RequestSigning({ secret: SECRET })
      const req = createMockRequest()
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(401)
      const body = await response?.json() as { error: { code: string } }
      expect(body.error.code).toBe('MISSING_SIGNATURE')
    })

    test('should reject request without timestamp when required', async () => {
      const middleware = new RequestSigning({
        secret: SECRET,
        requireTimestamp: true,
      })

      const req = createMockRequest('http://localhost/api/test', {
        headers: {
          'X-Signature': 'some-signature',
        },
      })
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(401)
      const body = await response?.json() as { error: { code: string } }
      expect(body.error.code).toBe('MISSING_TIMESTAMP')
    })

    test('should reject expired timestamp', async () => {
      const middleware = new RequestSigning({
        secret: SECRET,
        maxAge: 60, // 1 minute
      })

      const oldTimestamp = Math.floor(Date.now() / 1000) - 120 // 2 minutes ago

      const req = createMockRequest('http://localhost/api/test', {
        headers: {
          'X-Signature': 'some-signature',
          'X-Timestamp': oldTimestamp.toString(),
        },
      })
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(401)
      const body = await response?.json() as { error: { code: string } }
      expect(body.error.code).toBe('EXPIRED_TIMESTAMP')
    })

    test('should accept valid signed request', async () => {
      const middleware = new RequestSigning({
        secret: SECRET,
        requireTimestamp: true,
        requireNonce: false,
      })

      // First sign the request
      const originalReq = new Request('http://localhost/api/test', {
        method: 'GET',
      })
      const signedReq = await signRequest(originalReq, SECRET)

      const next = createNext()
      const response = await middleware.handle(signedReq as EnhancedRequest, next)

      expect(response?.status).toBe(200)
    })

    test('should skip excluded paths', async () => {
      const middleware = new RequestSigning({
        secret: SECRET,
        exclude: ['/health', '/public'],
      })

      const req = createMockRequest('http://localhost/health')
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(200)
    })

    test('should skip with exclude function', async () => {
      const middleware = new RequestSigning({
        secret: SECRET,
        exclude: (req: EnhancedRequest) => new URL(req.url).pathname.startsWith('/public'),
      })

      const req = createMockRequest('http://localhost/public/asset.js')
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(200)
    })

    test('should use custom error handler', async () => {
      const middleware = new RequestSigning({
        secret: SECRET,
        onError: error => new Response(
          JSON.stringify({ custom: true, code: error.code }),
          { status: 403 },
        ),
      })

      const req = createMockRequest()
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(403)
      const body = await response?.json() as { custom: boolean, code: string }
      expect(body.custom).toBe(true)
    })

    test('should require nonce when configured', async () => {
      const nonceStore = new InMemoryNonceStore()
      const middleware = new RequestSigning({
        secret: SECRET,
        requireNonce: true,
        nonceStore,
      })

      const req = createMockRequest('http://localhost/api/test', {
        headers: {
          'X-Signature': 'some-signature',
          'X-Timestamp': Math.floor(Date.now() / 1000).toString(),
        },
      })
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(401)
      const body = await response?.json() as { error: { code: string } }
      expect(body.error.code).toBe('MISSING_NONCE')

      nonceStore.destroy()
    })

    test('should reject reused nonce', async () => {
      const nonceStore = new InMemoryNonceStore()
      const middleware = new RequestSigning({
        secret: SECRET,
        requireNonce: true,
        nonceStore,
      })

      // Pre-store a nonce
      const usedNonce = 'already-used-nonce'
      nonceStore.set(usedNonce, 300)

      const timestamp = Math.floor(Date.now() / 1000).toString()
      const req = createMockRequest('http://localhost/api/test', {
        headers: {
          'X-Signature': 'some-signature',
          'X-Timestamp': timestamp,
          'X-Nonce': usedNonce,
        },
      })
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(401)
      const body = await response?.json() as { error: { code: string } }
      expect(body.error.code).toBe('NONCE_REUSED')

      nonceStore.destroy()
    })

    test('should support multi-key setup with key lookup function', async () => {
      const keys: Record<string, string> = {
        'key-1': 'secret-for-key-1',
        'key-2': 'secret-for-key-2',
      }

      const middleware = new RequestSigning({
        secret: keyId => keys[keyId] || null,
        requireTimestamp: true,
      })

      // Sign with key-1
      const originalReq = new Request('http://localhost/api/test', {
        method: 'GET',
      })
      const signedReq = await signRequest(originalReq, keys['key-1'], { keyId: 'key-1' })

      const next = createNext()
      const response = await middleware.handle(signedReq as EnhancedRequest, next)

      expect(response?.status).toBe(200)
    })

    test('should reject invalid key ID', async () => {
      const middleware = new RequestSigning({
        secret: () => null, // Always return null (invalid key)
        requireTimestamp: true,
      })

      const timestamp = Math.floor(Date.now() / 1000).toString()
      const req = createMockRequest('http://localhost/api/test', {
        headers: {
          'X-Signature': 'some-signature',
          'X-Timestamp': timestamp,
          'X-Key-Id': 'invalid-key',
        },
      })
      const next = createNext()

      const response = await middleware.handle(req, next)

      expect(response?.status).toBe(401)
      const body = await response?.json() as { error: { code: string } }
      expect(body.error.code).toBe('INVALID_KEY')
    })
  })

  describe('requestSigning factory', () => {
    test('should create RequestSigning instance', () => {
      const middleware = requestSigning({ secret: SECRET })
      expect(middleware).toBeInstanceOf(RequestSigning)
    })
  })
})
