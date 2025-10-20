import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export interface CSPDirectives {
  'default-src'?: string[]
  'script-src'?: string[]
  'script-src-elem'?: string[]
  'script-src-attr'?: string[]
  'style-src'?: string[]
  'style-src-elem'?: string[]
  'style-src-attr'?: string[]
  'img-src'?: string[]
  'font-src'?: string[]
  'connect-src'?: string[]
  'media-src'?: string[]
  'object-src'?: string[]
  'child-src'?: string[]
  'frame-src'?: string[]
  'worker-src'?: string[]
  'frame-ancestors'?: string[]
  'form-action'?: string[]
  'base-uri'?: string[]
  'manifest-src'?: string[]
  'prefetch-src'?: string[]
  'navigate-to'?: string[]
  'report-uri'?: string[]
  'report-to'?: string[]
  'require-trusted-types-for'?: string[]
  'trusted-types'?: string[]
  'upgrade-insecure-requests'?: boolean
  'block-all-mixed-content'?: boolean
  'plugin-types'?: string[]
  'sandbox'?: string[]
  'disown-opener'?: boolean
}

export interface CSPOptions {
  directives?: CSPDirectives
  reportOnly?: boolean
  reportUri?: string
  reportTo?: string
  useNonces?: boolean
  nonceLength?: number
  upgradeInsecureRequests?: boolean
  blockAllMixedContent?: boolean
}

export default class ContentSecurityPolicy {
  private options: CSPOptions
  private nonces: Map<string, string> = new Map()

  constructor(options: CSPOptions = {}) {
    const cspConfig = config.server?.security?.helmet?.contentSecurityPolicy
    const defaultDirectives: CSPDirectives = {
      'default-src': ['\'self\''],
      'script-src': ['\'self\''],
      'style-src': ['\'self\''],
      'img-src': ['\'self\'', 'data:', 'https:'],
      'font-src': ['\'self\''],
      'connect-src': ['\'self\''],
      'media-src': ['\'self\''],
      'object-src': ['\'none\''],
      'child-src': ['\'self\''],
      'worker-src': ['\'self\''],
      'frame-ancestors': ['\'none\''],
      'form-action': ['\'self\''],
      'base-uri': ['\'self\''],
      'manifest-src': ['\'self\''],
    }

    this.options = {
      directives: options.directives || (typeof cspConfig === 'object' && cspConfig.directives) || defaultDirectives,
      reportOnly: options.reportOnly ?? (typeof cspConfig === 'object' && cspConfig.reportOnly) ?? false,
      reportUri: options.reportUri,
      reportTo: options.reportTo,
      useNonces: options.useNonces ?? false,
      nonceLength: options.nonceLength ?? 16,
      upgradeInsecureRequests: options.upgradeInsecureRequests ?? true,
      blockAllMixedContent: options.blockAllMixedContent ?? false,
    }
  }

  private generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''
    for (let i = 0; i < (this.options.nonceLength || 16); i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  private buildCSPHeader(): string {
    const directives: string[] = []
    const dirs = this.options.directives || {}

    // Handle regular directives
    for (const [directive, values] of Object.entries(dirs)) {
      if (directive === 'upgrade-insecure-requests' || directive === 'block-all-mixed-content' || directive === 'disown-opener') {
        if (values === true) {
          directives.push(directive.replace(/([A-Z])/g, '-$1').toLowerCase())
        }
        continue
      }

      if (Array.isArray(values) && values.length > 0) {
        const directiveName = directive.replace(/([A-Z])/g, '-$1').toLowerCase()
        directives.push(`${directiveName} ${values.join(' ')}`)
      }
    }

    // Add upgrade-insecure-requests if enabled
    if (this.options.upgradeInsecureRequests) {
      directives.push('upgrade-insecure-requests')
    }

    // Add block-all-mixed-content if enabled
    if (this.options.blockAllMixedContent) {
      directives.push('block-all-mixed-content')
    }

    // Add report-uri if specified
    if (this.options.reportUri) {
      directives.push(`report-uri ${this.options.reportUri}`)
    }

    // Add report-to if specified
    if (this.options.reportTo) {
      directives.push(`report-to ${this.options.reportTo}`)
    }

    return directives.join('; ')
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const helmetConfig = (config.server?.security?.helmet || {}) as any

    // If CSP is disabled, continue to next middleware
    if (helmetConfig.contentSecurityPolicy === false) {
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }

    // Generate nonce if needed
    let nonce: string | undefined
    if (this.options.useNonces) {
      nonce = this.generateNonce()
      this.nonces.set(req.url, nonce)

      // Add nonce to script-src and style-src if they exist
      if (this.options.directives?.['script-src']) {
        this.options.directives['script-src'] = [
          ...this.options.directives['script-src'],
          `'nonce-${nonce}'`,
        ]
      }
      if (this.options.directives?.['style-src']) {
        this.options.directives['style-src'] = [
          ...this.options.directives['style-src'],
          `'nonce-${nonce}'`,
        ]
      }
    }

    // Add nonce to request context for use in templates
    if (nonce) {
      req.nonce = nonce
    }

    const response = await next()
    if (!response) {
      return new Response('Not Found', { status: 404 })
    }

    const headers = new Headers(response.headers)
    const cspHeader = this.buildCSPHeader()

    if (cspHeader) {
      const headerName = this.options.reportOnly
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy'
      headers.set(headerName, cspHeader)
    }

    // Set up reporting endpoint if specified
    if (this.options.reportTo) {
      headers.set('Report-To', JSON.stringify({
        group: this.options.reportTo,
        max_age: 10886400,
        endpoints: [{ url: this.options.reportUri || '/csp-report' }],
      }))
    }

    // Clean up nonce after use
    if (nonce) {
      this.nonces.delete(req.url)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  // Helper method to get nonce for templates
  getNonce(url: string): string | undefined {
    return this.nonces.get(url)
  }
}

// Factory function for easy use
export function contentSecurityPolicy(options: CSPOptions = {}) {
  const instance = new ContentSecurityPolicy(options)
  return async (req: EnhancedRequest, next: NextFunction) => instance.handle(req, next)
}
