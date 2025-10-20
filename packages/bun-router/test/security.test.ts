import type { EnhancedRequest } from '../src/types'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import ContentSecurityPolicy from '../src/middleware/content_security_policy'
import DDoSProtection from '../src/middleware/ddos_protection'
import Helmet from '../src/middleware/helmet'
import InputValidation from '../src/middleware/input_validation'
import Security from '../src/middleware/security'
import { securityPresets, securitySuite } from '../src/middleware/security_suite'

// Mock enhanced request
function createMockRequest(options: {
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: any
}): EnhancedRequest {
  const url = options.url || 'http://localhost:3000/test'
  const headers = new Headers(options.headers || {})

  return {
    url,
    method: options.method || 'GET',
    headers,
    params: {},
    json: async () => options.body || {},
    formData: async () => new FormData(),
    text: async () => JSON.stringify(options.body || {}),
    clone: () => createMockRequest(options),
  } as unknown as EnhancedRequest
}

// Mock next function
const mockNext = async () => new Response('OK', { status: 200 })

// Type for validation error responses
type ValidationErrorResponse = {
  errors: Array<{ field: string, message: string }>
}

describe('Helmet Middleware', () => {
  let helmet: Helmet

  beforeEach(() => {
    helmet = new Helmet()
  })

  it('should add security headers', async () => {
    const req = createMockRequest({})
    const response = await helmet.handle(req, mockNext)

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('should set CSP headers when enabled', async () => {
    const helmetWithCSP = new Helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ['\'self\''],
          'script-src': ['\'self\'', '\'unsafe-inline\''],
        },
      },
    })

    const req = createMockRequest({})
    const response = await helmetWithCSP.handle(req, mockNext)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toContain('default-src \'self\'')
    expect(csp).toContain('script-src \'self\' \'unsafe-inline\'')
  })

  it('should hide X-Powered-By header', async () => {
    const req = createMockRequest({})
    const mockNextWithPoweredBy = async () => {
      const response = new Response('OK', { status: 200 })
      response.headers.set('X-Powered-By', 'Express')
      return response
    }

    const response = await helmet.handle(req, mockNextWithPoweredBy)
    expect(response.headers.get('X-Powered-By')).toBeNull()
  })
})

describe('Security Middleware', () => {
  let security: Security

  beforeEach(() => {
    security = new Security()
  })

  it('should block SQL injection attempts', async () => {
    const req = createMockRequest({
      url: 'http://localhost:3000/test?id=1\' OR 1=1--',
    })

    const response = await security.handle(req, mockNext)
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Security threat detected')
  })

  it('should block XSS attempts', async () => {
    const req = createMockRequest({
      url: 'http://localhost:3000/test?content=<script>alert("xss")</script>',
    })

    const response = await security.handle(req, mockNext)
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Security threat detected')
  })

  it('should block path traversal attempts', async () => {
    const req = createMockRequest({
      url: 'http://localhost:3000/test?file=../../../etc/passwd',
    })

    const response = await security.handle(req, mockNext)
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Suspicious Request Blocked')
  })

  it('should block suspicious user agents', async () => {
    const req = createMockRequest({
      headers: {
        'User-Agent': 'sqlmap/1.0',
      },
    })

    const response = await security.handle(req, mockNext)
    expect(response.status).toBe(403)
  })

  it('should validate request methods', async () => {
    const req = createMockRequest({
      method: 'TRACE',
    })

    const response = await security.handle(req, mockNext)
    expect(response.status).toBe(405)
  })

  it('should allow safe requests', async () => {
    const req = createMockRequest({
      url: 'http://localhost:3000/api/users',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible browser)',
      },
    })

    const response = await security.handle(req, mockNext)
    expect(response.status).toBe(200)
  })
})

describe('DDoS Protection Middleware', () => {
  let ddosProtection: DDoSProtection

  beforeEach(() => {
    ddosProtection = new DDoSProtection({
      maxRequestsPerMinute: 5,
      burstLimit: 3,
      windowSize: 60000,
    })
  })

  afterEach(() => {
    ddosProtection.destroy()
  })

  it('should allow requests under the limit', async () => {
    const req = createMockRequest({})

    for (let i = 0; i < 3; i++) {
      const response = await ddosProtection.handle(req, mockNext)
      expect(response.status).toBe(200)
    }
  })

  it('should block requests over the limit', async () => {
    const req = createMockRequest({})

    // Make requests up to the limit
    for (let i = 0; i < 5; i++) {
      await ddosProtection.handle(req, mockNext)
    }

    // This request should be blocked
    const response = await ddosProtection.handle(req, mockNext)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeDefined()
  })

  it('should whitelist IPs', async () => {
    const ddosWithWhitelist = new DDoSProtection({
      maxRequestsPerMinute: 1,
      whitelistedIPs: ['127.0.0.1'],
    })

    const req = createMockRequest({
      headers: {
        'x-forwarded-for': '127.0.0.1',
      },
    })

    // Should allow unlimited requests for whitelisted IP
    for (let i = 0; i < 10; i++) {
      const response = await ddosWithWhitelist.handle(req, mockNext)
      expect(response.status).toBe(200)
    }

    ddosWithWhitelist.destroy()
  })

  it('should blacklist IPs', async () => {
    const ddosWithBlacklist = new DDoSProtection({
      blacklistedIPs: ['192.168.1.100'],
    })

    const req = createMockRequest({
      headers: {
        'x-forwarded-for': '192.168.1.100',
      },
    })

    const response = await ddosWithBlacklist.handle(req, mockNext)
    expect(response.status).toBe(403)

    ddosWithBlacklist.destroy()
  })
})

describe('Input Validation Middleware', () => {
  let inputValidation: InputValidation

  beforeEach(() => {
    inputValidation = new InputValidation({
      schemas: {
        query: {
          id: { type: 'number', required: true },
          name: { type: 'string', min: 2, max: 50 },
        },
        body: {
          email: { type: 'email', required: true },
          age: { type: 'number', min: 18, max: 120 },
        },
      },
    })
  })

  it('should validate query parameters', async () => {
    const req = createMockRequest({
      url: 'http://localhost:3000/test?id=abc&name=x',
    })

    const response = await inputValidation.handle(req, mockNext)
    expect(response.status).toBe(400)

    const body = await response.json() as ValidationErrorResponse
    expect(body.errors).toHaveLength(2)
    expect(body.errors[0].field).toBe('id')
    expect(body.errors[1].field).toBe('name')
  })

  it('should validate request body', async () => {
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        email: 'invalid-email',
        age: 15,
      },
    })

    const response = await inputValidation.handle(req, mockNext)
    expect(response.status).toBe(400)

    const body = await response.json() as ValidationErrorResponse
    expect(body.errors).toHaveLength(3)
  })

  it('should allow valid data', async () => {
    const req = createMockRequest({
      url: 'http://localhost:3000/test?id=123&name=John',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        email: 'john@example.com',
        age: 25,
      },
    })

    const response = await inputValidation.handle(req, mockNext)
    expect(response.status).toBe(200)
  })

  it('should sanitize input when enabled', async () => {
    const sanitizingValidation = new InputValidation({
      sanitizeByDefault: true,
      schemas: {
        query: {
          content: { type: 'string' },
        },
      },
    })

    const req = createMockRequest({
      url: 'http://localhost:3000/test?content=<script>alert("xss")</script>',
    })

    const response = await sanitizingValidation.handle(req, mockNext)
    expect(response.status).toBe(200)
  })
})

describe('Content Security Policy Middleware', () => {
  let csp: ContentSecurityPolicy

  beforeEach(() => {
    csp = new ContentSecurityPolicy({
      directives: {
        'default-src': ['\'self\''],
        'script-src': ['\'self\'', '\'unsafe-inline\''],
        'style-src': ['\'self\'', '\'unsafe-inline\''],
      },
    })
  })

  it('should set CSP header', async () => {
    const req = createMockRequest({})
    const response = await csp.handle(req, mockNext)

    const cspHeader = response.headers.get('Content-Security-Policy')
    expect(cspHeader).toContain('default-src \'self\'')
    expect(cspHeader).toContain('script-src \'self\' \'unsafe-inline\'')
    expect(cspHeader).toContain('style-src \'self\' \'unsafe-inline\'')
  })

  it('should set report-only header when configured', async () => {
    const reportOnlyCSP = new ContentSecurityPolicy({
      reportOnly: true,
      directives: {
        'default-src': ['\'self\''],
      },
    })

    const req = createMockRequest({})
    const response = await reportOnlyCSP.handle(req, mockNext)

    expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeDefined()
    expect(response.headers.get('Content-Security-Policy')).toBeNull()
  })

  it('should generate nonces when enabled', async () => {
    const nonceCSP = new ContentSecurityPolicy({
      useNonces: true,
      directives: {
        'script-src': ['\'self\''],
      },
    })

    const req = createMockRequest({})
    const response = await nonceCSP.handle(req, mockNext)

    expect(req.nonce).toBeDefined()
    expect(req.nonce).toHaveLength(16)

    const cspHeader = response.headers.get('Content-Security-Policy')
    expect(cspHeader).toContain(`'nonce-${req.nonce}'`)
  })
})

describe('Security Suite', () => {
  it('should create basic security preset', async () => {
    const middleware = securityPresets.basic()
    const req = createMockRequest({})
    const response = await middleware(req, mockNext)

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    expect(response!.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('should create standard security preset', async () => {
    const middleware = securityPresets.standard()
    const req = createMockRequest({})
    const response = await middleware(req, mockNext)

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
  })

  it('should create high security preset', async () => {
    const middleware = securityPresets.high()
    const req = createMockRequest({})
    const response = await middleware(req, mockNext)

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    expect(response!.headers.get('Content-Security-Policy')).toBeDefined()
  })

  it('should create API security preset', async () => {
    const middleware = securityPresets.api()
    const req = createMockRequest({})
    const response = await middleware(req, mockNext)

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
  })

  it('should create development security preset', async () => {
    const middleware = securityPresets.development()
    const req = createMockRequest({})
    const response = await middleware(req, mockNext)

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
  })

  it('should allow custom security suite configuration', async () => {
    const middleware = securitySuite({
      helmet: true,
      security: false,
      ddosProtection: false,
      inputValidation: false,
      contentSecurityPolicy: false,
    })

    const req = createMockRequest({})
    const response = await middleware(req, mockNext)

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    expect(response!.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('should respect middleware order', async () => {
    const middleware = securitySuite({
      order: ['helmet', 'security'],
      helmet: true,
      security: true,
    })

    const req = createMockRequest({})
    const response = await middleware(req, mockNext)

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
  })
})

describe('Security Integration', () => {
  it('should handle multiple security threats', async () => {
    const middleware = securityPresets.high()

    // SQL injection attempt
    const sqlReq = createMockRequest({
      url: 'http://localhost:3000/test?id=1\' OR 1=1--',
    })

    const sqlResponse = await middleware(sqlReq, mockNext)
    expect(sqlResponse).not.toBeNull()
    expect(sqlResponse!.status).toBe(400)

    // XSS attempt
    const xssReq = createMockRequest({
      url: 'http://localhost:3000/test?content=<script>alert("xss")</script>',
    })

    const xssResponse = await middleware(xssReq, mockNext)
    expect(xssResponse).not.toBeNull()
    expect(xssResponse!.status).toBe(400)

    // Path traversal attempt
    const pathReq = createMockRequest({
      url: 'http://localhost:3000/test?file=../../../etc/passwd',
    })

    const pathResponse = await middleware(pathReq, mockNext)
    expect(pathResponse).not.toBeNull()
    expect(pathResponse!.status).toBe(400)
  })

  it('should allow legitimate requests through all security layers', async () => {
    const middleware = securityPresets.standard()

    const req = createMockRequest({
      url: 'http://localhost:3000/api/users?page=1&limit=10',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible browser)',
        'Accept': 'application/json',
      },
    })

    const response = await middleware(req, mockNext)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)

    // Check that security headers are present
    expect(response!.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response!.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response!.headers.get('Strict-Transport-Security')).toBeDefined()
  })
})
