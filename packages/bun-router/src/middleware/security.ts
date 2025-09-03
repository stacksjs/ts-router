import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export interface SecurityOptions {
  // Input validation and sanitization
  inputValidation?: {
    enabled?: boolean
    maxBodySize?: number
    maxUrlLength?: number
    maxHeaderSize?: number
    allowedContentTypes?: string[]
    sanitizeInput?: boolean
    validateEncoding?: boolean
  }

  // Request filtering
  requestFiltering?: {
    enabled?: boolean
    blockSuspiciousPatterns?: boolean
    maxRequestsPerMinute?: number
    blockUserAgents?: string[]
    allowedMethods?: string[]
    requireUserAgent?: boolean
  }

  // IP filtering and geoblocking
  ipFiltering?: {
    enabled?: boolean
    whitelist?: string[]
    blacklist?: string[]
    blockPrivateIPs?: boolean
    blockCloudProviders?: boolean
    geoBlocking?: {
      enabled?: boolean
      allowedCountries?: string[]
      blockedCountries?: string[]
    }
  }

  // Attack prevention
  attackPrevention?: {
    enabled?: boolean
    sqlInjection?: boolean
    xss?: boolean
    pathTraversal?: boolean
    commandInjection?: boolean
    ldapInjection?: boolean
    xxe?: boolean
    customPatterns?: Array<{
      name: string
      pattern: RegExp
      action: 'block' | 'log' | 'sanitize'
    }>
  }

  // Response security
  responseSecurity?: {
    enabled?: boolean
    removeServerHeaders?: boolean
    addSecurityHeaders?: boolean
    sanitizeErrors?: boolean
    preventInfoDisclosure?: boolean
  }
}

export default class Security {
  private options: SecurityOptions
  private suspiciousPatterns: RegExp[] = []
  private sqlInjectionPatterns: RegExp[] = []
  private xssPatterns: RegExp[] = []
  private pathTraversalPatterns: RegExp[] = []
  private commandInjectionPatterns: RegExp[] = []

  constructor(options: SecurityOptions = {}) {
    const _securityConfig = config.server?.security || {}

    this.options = {
      inputValidation: {
        enabled: true,
        maxBodySize: 10 * 1024 * 1024, // 10MB
        maxUrlLength: 2048,
        maxHeaderSize: 8192,
        allowedContentTypes: [
          'application/json',
          'application/x-www-form-urlencoded',
          'multipart/form-data',
          'text/plain',
          'text/html',
          'application/xml',
          'text/xml',
        ],
        sanitizeInput: true,
        validateEncoding: true,
        ...options.inputValidation,
      },
      requestFiltering: {
        enabled: true,
        blockSuspiciousPatterns: true,
        maxRequestsPerMinute: 1000,
        blockUserAgents: [
          'sqlmap',
          'nikto',
          'nessus',
          'openvas',
          'nmap',
          'masscan',
          'zap',
          'w3af',
        ],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        requireUserAgent: false,
        ...options.requestFiltering,
      },
      ipFiltering: {
        enabled: false,
        whitelist: [],
        blacklist: [],
        blockPrivateIPs: false,
        blockCloudProviders: false,
        geoBlocking: {
          enabled: false,
          allowedCountries: [],
          blockedCountries: [],
        },
        ...options.ipFiltering,
      },
      attackPrevention: {
        enabled: true,
        sqlInjection: true,
        xss: true,
        pathTraversal: true,
        commandInjection: true,
        ldapInjection: true,
        xxe: true,
        customPatterns: [],
        ...options.attackPrevention,
      },
      responseSecurity: {
        enabled: true,
        removeServerHeaders: true,
        addSecurityHeaders: true,
        sanitizeErrors: true,
        preventInfoDisclosure: true,
        ...options.responseSecurity,
      },
    }

    this.initializePatterns()
  }

  private initializePatterns(): void {
    // Suspicious request patterns
    this.suspiciousPatterns = [
      /\.\.\//g, // Path traversal
      /\.\.\\/g, // Windows path traversal
      /%2e%2e%2f/gi, // URL encoded path traversal
      /%2e%2e%5c/gi, // URL encoded Windows path traversal
      /\/etc\/passwd/gi,
      /\/proc\/self\/environ/gi,
      /cmd\.exe/gi,
      /powershell/gi,
      /<script/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload=/gi,
      /onerror=/gi,
    ]

    // SQL injection patterns
    this.sqlInjectionPatterns = [
      /(\bunion\b.+\bselect\b)|(\bselect\b.+\bunion\b)/gi,
      /\b(select|insert|update|delete|drop|create|alter|exec|execute)\b.+\b(from|into|set|where|table|database|schema)\b/gi,
      /(\bor\b|\band\b).+['"]\s*=\s*['"]|['"]\s*=\s*['"].+(\bor\b|\band\b)/gi,
      /\b(sleep|benchmark|waitfor)\s*\(/gi,
      /\b(information_schema|sys\.databases|sysobjects)\b/gi,
      /('|(\\'))+.+(or|and)\s+(?:\S.*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])[=><]/gi,
      /\b(concat|group_concat|load_file|into\s+outfile)\b/gi,
    ]

    // XSS patterns
    this.xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi,
      /<[^>]*\son\w+\s*=.*?>/gi,
      /expression\s*\(/gi,
      /url\s*\(\s*javascript:/gi,
    ]

    // Path traversal patterns
    this.pathTraversalPatterns = [
      /\.\.\//g,
      /\.\.\\/g,
      /%2e%2e%2f/gi,
      /%2e%2e%5c/gi,
      /\.\.%2f/gi,
      /\.\.%5c/gi,
      /%252e%252e%252f/gi,
      /\.\/%2e%2e%2f/gi,
    ]

    // Command injection patterns
    this.commandInjectionPatterns = [
      /[;&|`${}[\]]/g, // Removed parentheses to avoid false positives with user agents
      /\b(cat|ls|pwd|id|whoami|uname|ps|netstat|ifconfig|ping|nslookup|dig|curl|wget)\s/gi,
      /\b(cmd|powershell|bash|sh|zsh|fish)\s/gi,
      /\b(exec|system|shell_exec|passthru|eval)\s*\(/gi,
      /\$\{.*\}/g, // Template injection
      /#\{.*\}/g, // Ruby template injection
    ]
  }

  private getClientIP(req: EnhancedRequest): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-client-ip')
      || 'unknown'
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/,
    ]
    return privateRanges.some(range => range.test(ip))
  }

  private validateInput(input: string): { isValid: boolean, threats: string[] } {
    const threats: string[] = []

    if (!this.options.attackPrevention?.enabled) {
      return { isValid: true, threats }
    }

    // Check for SQL injection
    if (this.options.attackPrevention.sqlInjection) {
      for (const pattern of this.sqlInjectionPatterns) {
        if (pattern.test(input)) {
          threats.push('SQL Injection')
          break
        }
      }
    }

    // Check for XSS
    if (this.options.attackPrevention.xss) {
      for (const pattern of this.xssPatterns) {
        if (pattern.test(input)) {
          threats.push('XSS')
          break
        }
      }
    }

    // Check for path traversal
    if (this.options.attackPrevention.pathTraversal) {
      for (const pattern of this.pathTraversalPatterns) {
        if (pattern.test(input)) {
          threats.push('Path Traversal')
          break
        }
      }
    }

    // Check for command injection
    if (this.options.attackPrevention.commandInjection) {
      for (const pattern of this.commandInjectionPatterns) {
        if (pattern.test(input)) {
          threats.push('Command Injection')
          break
        }
      }
    }

    // Check custom patterns
    if (this.options.attackPrevention.customPatterns) {
      for (const customPattern of this.options.attackPrevention.customPatterns) {
        if (customPattern.pattern.test(input)) {
          threats.push(customPattern.name)
        }
      }
    }

    return { isValid: threats.length === 0, threats }
  }

  private sanitizeInput(input: string): string {
    if (!this.options.inputValidation?.sanitizeInput) {
      return input
    }

    return input
      .replace(/[<>'"&]/g, (match) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          '\'': '&#x27;',
          '&': '&amp;',
        }
        return entities[match] || match
      })
      .replace(/javascript:/gi, 'blocked:')
      .replace(/vbscript:/gi, 'blocked:')
      .replace(/on\w+=/gi, 'blocked=')
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const clientIP = this.getClientIP(req)
    const userAgent = req.headers.get('user-agent') || ''
    const url = new URL(req.url)

    // IP filtering
    if (this.options.ipFiltering?.enabled) {
      const ipConfig = this.options.ipFiltering

      // Check whitelist
      if (ipConfig.whitelist?.length && !ipConfig.whitelist.includes(clientIP)) {
        return new Response('Access Denied', { status: 403 })
      }

      // Check blacklist
      if (ipConfig.blacklist?.includes(clientIP)) {
        return new Response('Access Denied', { status: 403 })
      }

      // Block private IPs if configured
      if (ipConfig.blockPrivateIPs && this.isPrivateIP(clientIP)) {
        return new Response('Access Denied', { status: 403 })
      }
    }

    // Request filtering
    if (this.options.requestFiltering?.enabled) {
      const filterConfig = this.options.requestFiltering

      // Check allowed methods
      if (filterConfig.allowedMethods && !filterConfig.allowedMethods.includes(req.method)) {
        return new Response('Method Not Allowed', { status: 405 })
      }

      // Check user agent requirement
      if (filterConfig.requireUserAgent && !userAgent) {
        return new Response('Bad Request', { status: 400 })
      }

      // Check blocked user agents
      if (filterConfig.blockUserAgents) {
        const isBlocked = filterConfig.blockUserAgents.some(blocked =>
          userAgent.toLowerCase().includes(blocked.toLowerCase()),
        )
        if (isBlocked) {
          return new Response('Access Denied', { status: 403 })
        }
      }

      // Check suspicious patterns in URL
      if (filterConfig.blockSuspiciousPatterns) {
        const fullUrl = url.pathname + url.search
        for (const pattern of this.suspiciousPatterns) {
          if (pattern.test(fullUrl)) {
            return new Response('Suspicious Request Blocked', { status: 400 })
          }
        }
      }
    }

    // Input validation
    if (this.options.inputValidation?.enabled) {
      const inputConfig = this.options.inputValidation

      // Check URL length
      if (inputConfig.maxUrlLength && req.url.length > inputConfig.maxUrlLength) {
        return new Response('URL Too Long', { status: 414 })
      }

      // Check content type
      const contentType = req.headers.get('content-type')
      if (contentType && inputConfig.allowedContentTypes) {
        const isAllowed = inputConfig.allowedContentTypes.some(allowed =>
          contentType.toLowerCase().startsWith(allowed.toLowerCase()),
        )
        if (!isAllowed) {
          return new Response('Unsupported Media Type', { status: 415 })
        }
      }

      // Validate query parameters
      for (const [key, value] of url.searchParams.entries()) {
        const validation = this.validateInput(value)
        if (!validation.isValid) {
          console.warn(`Security threat detected in query param ${key}:`, validation.threats)
          return new Response(`Security threat detected: ${validation.threats.join(', ')}`, { status: 400 })
        }
      }

      // Validate headers
      for (const [key, value] of req.headers.entries()) {
        if (inputConfig.maxHeaderSize && value.length > inputConfig.maxHeaderSize) {
          return new Response('Header Too Large', { status: 431 })
        }

        const validation = this.validateInput(value)
        if (!validation.isValid) {
          console.warn(`Security threat detected in header ${key}:`, validation.threats)
          return new Response(`Security threat detected: ${validation.threats.join(', ')}`, { status: 400 })
        }
      }
    }

    // Process request body if present
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      try {
        const contentLength = req.headers.get('content-length')
        if (contentLength && this.options.inputValidation?.maxBodySize) {
          const size = Number.parseInt(contentLength, 10)
          if (size > this.options.inputValidation.maxBodySize) {
            return new Response('Payload Too Large', { status: 413 })
          }
        }
      }
      catch (error) {
        console.error('Error checking content length:', error)
      }
    }

    const response = await next()
    if (!response) {
      return new Response('Not Found', { status: 404 })
    }

    // Response security
    if (this.options.responseSecurity?.enabled) {
      const headers = new Headers(response.headers)
      const responseConfig = this.options.responseSecurity

      // Remove server headers
      if (responseConfig.removeServerHeaders) {
        headers.delete('Server')
        headers.delete('X-Powered-By')
        headers.delete('X-AspNet-Version')
        headers.delete('X-AspNetMvc-Version')
      }

      // Add security headers
      if (responseConfig.addSecurityHeaders) {
        headers.set('X-Content-Type-Options', 'nosniff')
        headers.set('X-Frame-Options', 'DENY')
        headers.set('X-XSS-Protection', '0')
        headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }

    return response
  }
}

// Factory function for easy use
export function security(options: SecurityOptions = {}): (req: EnhancedRequest, next: NextFunction) => Promise<Response> {
  const instance = new Security(options)
  return async (req: EnhancedRequest, next: NextFunction) => instance.handle(req, next)
}
