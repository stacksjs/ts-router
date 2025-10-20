# Security Middleware

The bun-router package includes a comprehensive security middleware suite designed to protect your applications from common web vulnerabilities and attacks. The security system is fully configurable and provides multiple layers of protection.

## Overview

The security middleware suite includes:

- **Helmet** - Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Security** - Input validation, attack prevention, request filtering
- **DDoS Protection** - Rate limiting and request throttling
- **Input Validation** - Schema-based request validation and sanitization
- **Content Security Policy** - Advanced CSP with nonce support

## Quick Start

### Using Security Presets

The easiest way to get started is using one of the predefined security presets:

```typescript
import { Router } from 'bun-router'
import { securityPresets } from 'bun-router/middleware'

const router = new Router()

// Basic security (minimal performance impact)
router.use(securityPresets.basic())

// Standard security (balanced)
router.use(securityPresets.standard())

// High security (maximum protection)
router.use(securityPresets.high())

// API-optimized security
router.use(securityPresets.api())

// Development security (relaxed for development)
router.use(securityPresets.development())
```

### Custom Security Suite

For fine-grained control, create a custom security suite:

```typescript
import { securitySuite } from 'bun-router/middleware'

router.use(securitySuite({
  helmet: true,
  security: {
    attackPrevention: { enabled: true },
    requestFiltering: { enabled: true },
  },
  ddosProtection: {
    maxRequestsPerMinute: 100,
    burstLimit: 20,
  },
  inputValidation: {
    enabled: true,
    sanitizeByDefault: true,
  },
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
    },
  },
}))
```

## Individual Middleware

### Helmet

Adds essential security headers to responses:

```typescript
import { Helmet } from 'bun-router/middleware'

router.use(new Helmet({
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  noSniff: true,
  xssFilter: true,
}))
```

### Security (Attack Prevention)

Protects against common attacks:

```typescript
import { Security } from 'bun-router/middleware'

router.use(new Security({
  attackPrevention: {
    enabled: true,
    sqlInjection: true,
    xss: true,
    pathTraversal: true,
    commandInjection: true,
    customPatterns: [
      {
        name: 'Custom Attack Pattern',
        pattern: /malicious-pattern/gi,
        action: 'block',
      },
    ],
  },
  requestFiltering: {
    enabled: true,
    blockSuspiciousPatterns: true,
    blockUserAgents: ['sqlmap', 'nikto', 'nessus'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    maxBodySize: 10485760, // 10MB
    maxUrlLength: 2048,
  },
  ipFiltering: {
    enabled: true,
    whitelist: ['127.0.0.1'],
    blacklist: ['192.168.1.100'],
    blockPrivateIPs: false,
  },
}))
```

### DDoS Protection

Rate limiting and request throttling:

```typescript
import { DDoSProtection } from 'bun-router/middleware'

router.use(new DDoSProtection({
  enabled: true,
  maxRequestsPerSecond: 10,
  maxRequestsPerMinute: 100,
  maxRequestsPerHour: 1000,
  burstLimit: 20,
  windowSize: 60000, // 1 minute
  blockDuration: 300000, // 5 minutes
  whitelistedIPs: ['127.0.0.1'],
  blacklistedIPs: ['192.168.1.100'],
  trustProxy: true,
  store: 'memory', // or 'redis'
}))
```

### Input Validation

Schema-based request validation:

```typescript
import { InputValidation } from 'bun-router/middleware'

router.use(new InputValidation({
  enabled: true,
  sanitizeByDefault: true,
  strictMode: false,
  schemas: {
    query: {
      page: { type: 'number', min: 1 },
      limit: { type: 'number', min: 1, max: 100 },
      search: { type: 'string', max: 255 },
    },
    body: {
      email: { type: 'email', required: true },
      password: { type: 'string', min: 8, required: true },
      age: { type: 'number', min: 18, max: 120 },
    },
    headers: {
      'content-type': { 
        type: 'string', 
        enum: ['application/json', 'application/x-www-form-urlencoded'] 
      },
    },
  },
}))
```

### Content Security Policy

Advanced CSP with nonce support:

```typescript
import { ContentSecurityPolicy } from 'bun-router/middleware'

router.use(new ContentSecurityPolicy({
  directives: {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'child-src': ["'none'"],
    'worker-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
  },
  reportOnly: false,
  reportUri: '/csp-report',
  useNonces: true,
  upgradeInsecureRequests: true,
}))
```

## Configuration

### Global Configuration

Configure security settings in your router config:

```typescript
// router.config.ts
export default {
  server: {
    security: {
      helmet: {
        enabled: true,
        contentSecurityPolicy: {
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
        },
      },
      ddos: {
        enabled: true,
        maxRequestsPerMinute: 100,
        burstLimit: 20,
      },
      attackPrevention: {
        enabled: true,
        sqlInjection: true,
        xss: true,
        pathTraversal: true,
      },
      requestFiltering: {
        enabled: true,
        blockSuspiciousPatterns: true,
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      },
      inputValidation: {
        enabled: true,
        sanitizeByDefault: true,
      },
    },
  },
}
```

### Environment-Specific Configuration

```typescript
// Development
router.use(securityPresets.development())

// Production
if (process.env.NODE_ENV === 'production') {
  router.use(securityPresets.high())
} else {
  router.use(securityPresets.development())
}
```

## Security Features

### Attack Prevention

The security middleware protects against:

- **SQL Injection** - Detects and blocks SQL injection patterns
- **XSS (Cross-Site Scripting)** - Prevents script injection attacks
- **Path Traversal** - Blocks directory traversal attempts
- **Command Injection** - Detects command execution attempts
- **LDAP Injection** - Prevents LDAP injection attacks
- **XXE (XML External Entity)** - Blocks XXE attacks

### Request Filtering

- **User Agent Filtering** - Block known malicious user agents
- **Method Validation** - Allow only specified HTTP methods
- **Content Type Validation** - Validate request content types
- **Size Limits** - Enforce maximum body, URL, and header sizes
- **Suspicious Pattern Detection** - Block requests with suspicious patterns

### Rate Limiting & DDoS Protection

- **Multiple Time Windows** - Per-second, per-minute, per-hour limits
- **Burst Protection** - Handle traffic spikes gracefully
- **IP Whitelisting/Blacklisting** - Allow/block specific IPs
- **Proxy Support** - Trust proxy headers for real IP detection
- **Configurable Storage** - Memory or Redis-based storage

### Input Validation & Sanitization

- **Schema Validation** - Validate query, body, headers, and params
- **Type Checking** - Ensure correct data types
- **Range Validation** - Min/max values for numbers and strings
- **Format Validation** - Email, URL, UUID, date formats
- **Custom Validation** - Define custom validation rules
- **Automatic Sanitization** - Clean potentially dangerous input

### Security Headers

- **Content Security Policy (CSP)** - Prevent XSS and injection attacks
- **HTTP Strict Transport Security (HSTS)** - Enforce HTTPS
- **X-Frame-Options** - Prevent clickjacking
- **X-Content-Type-Options** - Prevent MIME sniffing
- **Referrer Policy** - Control referrer information
- **Cross-Origin Policies** - COEP, COOP, CORP headers

## Examples

### API Security Setup

```typescript
import { Router } from 'bun-router'
import { securitySuite } from 'bun-router/middleware'

const apiRouter = new Router()

apiRouter.use(securitySuite({
  helmet: {
    contentSecurityPolicy: false, // Not needed for APIs
    frameguard: false,
  },
  security: {
    attackPrevention: { enabled: true },
    requestFiltering: {
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      maxBodySize: 1048576, // 1MB for API
    },
  },
  ddosProtection: {
    maxRequestsPerMinute: 1000,
    burstLimit: 100,
  },
  inputValidation: {
    enabled: true,
    strictMode: true,
  },
}))

// API routes
apiRouter.get('/api/users', (req) => {
  // Your API logic
})
```

### Web Application Security

```typescript
import { Router } from 'bun-router'
import { securityPresets } from 'bun-router/middleware'

const webRouter = new Router()

webRouter.use(securityPresets.high())

// Web routes
webRouter.get('/', (req) => {
  // Use nonce in templates if CSP nonces are enabled
  const nonce = req.nonce
  return new Response(`
    <html>
      <head>
        <script nonce="${nonce}">
          // Your inline script
        </script>
      </head>
      <body>
        <h1>Secure Web App</h1>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  })
})
```

### Custom Validation Schema

```typescript
import { inputValidation } from 'bun-router/middleware'

router.use(inputValidation({
  schemas: {
    query: {
      page: { 
        type: 'number', 
        min: 1, 
        transform: (val) => parseInt(val, 10) 
      },
      sort: { 
        type: 'string', 
        enum: ['name', 'date', 'popularity'] 
      },
    },
    body: {
      user: {
        email: { type: 'email', required: true },
        password: { 
          type: 'string', 
          min: 8, 
          pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 
          required: true 
        },
        profile: {
          name: { type: 'string', min: 2, max: 50 },
          age: { type: 'number', min: 13, max: 120 },
          bio: { type: 'string', max: 500, sanitize: true },
        },
      },
    },
  },
}))
```

## Best Practices

### 1. Layer Security Measures

Use multiple security layers for defense in depth:

```typescript
router.use(securitySuite({
  // All layers enabled for maximum protection
  helmet: true,
  security: true,
  ddosProtection: true,
  inputValidation: true,
  contentSecurityPolicy: true,
}))
```

### 2. Configure for Your Environment

```typescript
const securityLevel = process.env.NODE_ENV === 'production' ? 'high' : 'development'
router.use(securityPresets[securityLevel]())
```

### 3. Monitor and Log Security Events

```typescript
router.use(new Security({
  onSecurityEvent: (event) => {
    console.log('Security event:', event)
    // Send to monitoring service
  },
}))
```

### 4. Regular Updates

Keep security configurations updated and review them regularly:

```typescript
// Review and update security patterns
const customPatterns = [
  {
    name: 'New Attack Pattern',
    pattern: /new-malicious-pattern/gi,
    action: 'block',
  },
]
```

### 5. Test Security Measures

Always test your security configuration:

```bash
bun test security.test.ts
```

## Performance Considerations

- **Memory Usage**: DDoS protection stores request counts in memory
- **CPU Impact**: Pattern matching for attack detection
- **Network Overhead**: Additional headers increase response size
- **Caching**: Use Redis for distributed rate limiting

### Optimization Tips

1. **Disable Unused Features**: Only enable security features you need
2. **Tune Rate Limits**: Set appropriate limits for your use case
3. **Use Efficient Patterns**: Optimize regex patterns for performance
4. **Monitor Performance**: Track response times with security enabled

## Troubleshooting

### Common Issues

1. **False Positives**: Legitimate requests blocked by security rules
2. **Performance Impact**: Security checks slowing down requests
3. **Configuration Conflicts**: Multiple middleware interfering

### Debug Mode

Enable debug logging to troubleshoot issues:

```typescript
router.use(new Security({
  debug: true,
  onSecurityEvent: (event) => {
    console.log('Security Debug:', event)
  },
}))
```

## Security Checklist

- [ ] Enable appropriate security preset for your environment
- [ ] Configure CSP directives for your application
- [ ] Set up rate limiting based on your traffic patterns
- [ ] Define input validation schemas for all endpoints
- [ ] Configure IP whitelisting/blacklisting if needed
- [ ] Set up security monitoring and alerting
- [ ] Test security configuration thoroughly
- [ ] Review and update security settings regularly
- [ ] Monitor for false positives and adjust rules
- [ ] Keep security middleware updated

## Migration Guide

### From Basic Security

If you're currently using basic security headers:

```typescript
// Before
router.use((req, next) => {
  const response = await next()
  response.headers.set('X-Frame-Options', 'DENY')
  return response
})

// After
router.use(securityPresets.basic())
```

### From Custom Rate Limiting

```typescript
// Before
const rateLimiter = new Map()
router.use((req, next) => {
  // Custom rate limiting logic
})

// After
router.use(new DDoSProtection({
  maxRequestsPerMinute: 100,
}))
```

This comprehensive security middleware suite provides enterprise-grade protection while maintaining flexibility and performance. Choose the appropriate security level for your application and customize as needed.
