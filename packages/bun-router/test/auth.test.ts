// @ts-nocheck
import { beforeEach, describe, expect, test } from 'bun:test'
import { ApiKeyManager, JWT, OAuth2Helper } from '../src/auth'
import { apiKeyAuth, basicAuth, bearerAuth, extractApiKey, extractBasicAuth, extractBearerToken } from '../src/middleware'

// Mock Request for testing
function createMockRequest(options: {
  url?: string
  method?: string
  headers?: Record<string, string>
  cookies?: Record<string, string>
} = {}): any {
  const url = options.url || 'http://localhost:3000'
  const headers = new Headers()

  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      headers.append(key, value)
    })
  }

  return {
    url,
    method: options.method || 'GET',
    headers,
    cookies: options.cookies || {},
    cookie: (name: string) => options.cookies?.[name] || null,
  }
}

describe('Authentication Middleware', () => {
  describe('Basic Auth Middleware', () => {
    test('should extract basic auth credentials', () => {
      const authHeader = `Basic ${btoa('user:password')}`
      const credentials = extractBasicAuth(authHeader)

      expect(credentials).toEqual({
        username: 'user',
        password: 'password',
      })
    })

    test('should return null on invalid basic auth header', () => {
      expect(extractBasicAuth('InvalidHeader')).toBeNull()
      expect(extractBasicAuth('Basic InvalidBase64')).toBeNull()
    })

    test('should authenticate with valid credentials', async () => {
      const middleware = basicAuth((credentials) => {
        return credentials.username === 'user' && credentials.password === 'password'
      })

      const req = createMockRequest({
        headers: {
          Authorization: `Basic ${btoa('user:password')}`,
        },
      })

      let nextCalled = false
      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      await middleware.handle(req, next)
      expect(nextCalled).toBe(true)
    })

    test('should reject with invalid credentials', async () => {
      const middleware = basicAuth((credentials) => {
        return credentials.username === 'user' && credentials.password === 'password'
      })

      const req = createMockRequest({
        headers: {
          Authorization: `Basic ${btoa('user:wrongpassword')}`,
        },
      })

      let nextCalled = false
      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      const response = await middleware.handle(req, next)
      expect(nextCalled).toBe(false)
      expect(response.status).toBe(401)
    })

    test('should reject with missing auth header', async () => {
      const middleware = basicAuth(() => true)
      const req = createMockRequest()

      let nextCalled = false
      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      const response = await middleware.handle(req, next)
      expect(nextCalled).toBe(false)
      expect(response.status).toBe(401)
      expect(response.headers.get('WWW-Authenticate')).toContain('Basic')
    })
  })

  describe('Bearer Auth Middleware', () => {
    test('should extract bearer token', () => {
      const token = extractBearerToken('Bearer mytoken123')
      expect(token).toBe('mytoken123')
    })

    test('should return null on invalid bearer header', () => {
      expect(extractBearerToken('InvalidHeader')).toBeNull()
    })

    test('should authenticate with valid token', async () => {
      const middleware = bearerAuth(token => token === 'valid-token')

      const req = createMockRequest({
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })

      let nextCalled = false
      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      await middleware.handle(req, next)
      expect(nextCalled).toBe(true)
    })

    test('should reject with invalid token', async () => {
      const middleware = bearerAuth(token => token === 'valid-token')

      const req = createMockRequest({
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      })

      let nextCalled = false
      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      const response = await middleware.handle(req, next)
      expect(nextCalled).toBe(false)
      expect(response.status).toBe(401)
    })
  })

  describe('API Key Auth Middleware', () => {
    test('should extract API key from header', () => {
      const req = createMockRequest({
        headers: {
          'X-API-Key': 'api-key-123',
        },
      })

      const apiKey = extractApiKey(req)
      expect(apiKey).toBe('api-key-123')
    })

    test('should extract API key from query parameter', () => {
      const req = createMockRequest({
        url: 'http://localhost:3000?api_key=api-key-123',
      })

      const apiKey = extractApiKey(req, 'query', 'api_key')
      expect(apiKey).toBe('api-key-123')
    })

    test('should extract API key from cookie', () => {
      const req = createMockRequest({
        cookies: {
          api_key: 'api-key-123',
        },
      })

      const apiKey = extractApiKey(req, 'cookie', 'api_key')
      expect(apiKey).toBe('api-key-123')
    })

    test('should authenticate with valid API key', async () => {
      const middleware = apiKeyAuth(
        key => key === 'valid-api-key',
        { source: 'header', key: 'X-API-Key' },
      )

      const req = createMockRequest({
        headers: {
          'X-API-Key': 'valid-api-key',
        },
      })

      let nextCalled = false
      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      await middleware.handle(req, next)
      expect(nextCalled).toBe(true)
    })

    test('should reject with invalid API key', async () => {
      const middleware = apiKeyAuth(key => key === 'valid-api-key', { source: 'header', key: 'X-API-Key' })

      const req = createMockRequest({
        headers: {
          'X-API-Key': 'invalid-api-key',
        },
      })

      let nextCalled = false
      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      const response = await middleware.handle(req, next)
      expect(nextCalled).toBe(false)
      expect(response.status).toBe(401)
    })
  })

  describe('JWT Class', () => {
    let jwt: JWT

    beforeEach(() => {
      jwt = new JWT('secret-key')
    })

    test('should sign and verify a token', () => {
      const payload = { user: 'john', id: 123 }
      const token = jwt.sign(payload)

      expect(token).toBeString()
      expect(token.split('.')).toHaveLength(3)

      const verified = jwt.verify(token)
      expect(verified).toHaveProperty('user', 'john')
      expect(verified).toHaveProperty('id', 123)
      expect(verified).toHaveProperty('iat')
    })

    test('should handle expiration', () => {
      // Create token that expires in 1 second
      const token = jwt.sign({ user: 'john' }, { expiresIn: 1 })

      // Token should be valid immediately
      expect(jwt.verify(token)).not.toBeNull()

      // Wait for token to expire
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      return wait(1100).then(() => {
        // Token should now be expired
        expect(jwt.verify(token)).toBeNull()

        // But we can still decode it
        const decoded = jwt.decode(token)
        expect(decoded).not.toBeNull()
        expect(decoded?.payload).toHaveProperty('user', 'john')
      })
    })

    test('should verify audience claim', () => {
      const token = jwt.sign({ user: 'john' }, { audience: 'app1' })

      // Valid when audience matches
      expect(jwt.verify(token, { audience: 'app1' })).not.toBeNull()

      // Invalid when audience doesn't match
      expect(jwt.verify(token, { audience: 'app2' })).toBeNull()
    })
  })

  describe('ApiKeyManager', () => {
    let manager: ApiKeyManager

    beforeEach(() => {
      manager = new ApiKeyManager()
    })

    test('should generate and validate API keys', () => {
      const key = manager.generateKey('user1', ['read', 'write'])

      expect(key).toBeString()
      expect(key.startsWith('bun_')).toBe(true)

      // Valid with no scopes required
      expect(manager.validateKey(key)).toBe(true)

      // Valid with matching scopes
      expect(manager.validateKey(key, ['read'])).toBe(true)
      expect(manager.validateKey(key, ['write'])).toBe(true)
      expect(manager.validateKey(key, ['read', 'write'])).toBe(true)

      // Invalid with non-matching scopes
      expect(manager.validateKey(key, ['admin'])).toBe(false)
    })

    test('should respect expiration', () => {
      const key = manager.generateKey('user1', ['read'], 1) // Expires in 1 second

      // Valid immediately
      expect(manager.validateKey(key)).toBe(true)

      // Wait for expiration
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      return wait(1100).then(() => {
        // Should be invalid after expiration
        expect(manager.validateKey(key)).toBe(false)
      })
    })

    test('should revoke keys', () => {
      const key = manager.generateKey('user1')

      // Valid before revocation
      expect(manager.validateKey(key)).toBe(true)

      // Revoke key
      manager.revokeKey(key)

      // Invalid after revocation
      expect(manager.validateKey(key)).toBe(false)
    })

    test('should extract keys from requests', () => {
      // From header
      const req1 = createMockRequest({
        headers: {
          'X-API-Key': 'my-api-key',
        },
      })
      expect(manager.extractFromRequest(req1)).toBe('my-api-key')

      // From query
      const req2 = createMockRequest({
        url: 'http://localhost:3000?api_key=my-api-key',
      })
      manager = new ApiKeyManager({ source: 'query', keyName: 'api_key' })
      expect(manager.extractFromRequest(req2)).toBe('my-api-key')

      // From cookie
      const req3 = createMockRequest({
        cookies: {
          api_key: 'my-api-key',
        },
      })
      manager = new ApiKeyManager({ source: 'cookie', keyName: 'api_key' })
      expect(manager.extractFromRequest(req3)).toBe('my-api-key')
    })
  })

  describe('OAuth2Helper', () => {
    let oauth: OAuth2Helper

    beforeEach(() => {
      oauth = new OAuth2Helper({
        clientId: 'client123',
        clientSecret: 'secret456',
        authorizeUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        redirectUri: 'http://myapp.com/callback',
        scope: 'read write',
      })
    })

    test('should generate authorization URL', () => {
      const url = oauth.getAuthorizationUrl()

      expect(url).toStartWith('https://auth.example.com/authorize?')
      expect(url).toContain('client_id=client123')
      expect(url).toContain('redirect_uri=http%3A%2F%2Fmyapp.com%2Fcallback')
      expect(url).toContain('response_type=code')
      expect(url).toContain('scope=read+write')
    })

    test('should support additional parameters', () => {
      const url = oauth.getAuthorizationUrl({ prompt: 'login', display: 'popup' })

      expect(url).toContain('prompt=login')
      expect(url).toContain('display=popup')
    })

    // Note: We can't easily test token exchange without mocking fetch
  })
})
