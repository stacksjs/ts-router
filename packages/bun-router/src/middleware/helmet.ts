import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export interface HelmetOptions {
  contentSecurityPolicy?: boolean | {
    directives?: Record<string, string[]>
    reportOnly?: boolean
    reportUri?: string
    upgradeInsecureRequests?: boolean
    blockAllMixedContent?: boolean
  }
  crossOriginEmbedderPolicy?: boolean | {
    policy?: 'require-corp' | 'credentialless'
  }
  crossOriginOpenerPolicy?: boolean | {
    policy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none'
  }
  crossOriginResourcePolicy?: boolean | {
    policy?: 'same-site' | 'same-origin' | 'cross-origin'
  }
  dnsPrefetchControl?: boolean | {
    allow?: boolean
  }
  expectCt?: boolean | {
    enforce?: boolean
    maxAge?: number
    reportUri?: string
  }
  frameguard?: boolean | {
    action?: 'deny' | 'sameorigin'
    domain?: string
  }
  hidePoweredBy?: boolean
  hsts?: boolean | {
    maxAge?: number
    includeSubDomains?: boolean
    preload?: boolean
  }
  ieNoOpen?: boolean
  noSniff?: boolean
  originAgentCluster?: boolean
  permittedCrossDomainPolicies?: boolean | {
    permittedPolicies?: 'none' | 'master-only' | 'by-content-type' | 'all'
  }
  referrerPolicy?: boolean | {
    policy?: string | string[]
  }
  xssFilter?: boolean | {
    setOnOldIE?: boolean
  }
}

export default class Helmet {
  private options: HelmetOptions

  constructor(options: HelmetOptions = {}) {
    const helmetConfig = config.server?.security?.helmet || {}

    this.options = {
      contentSecurityPolicy: options.contentSecurityPolicy ?? helmetConfig.contentSecurityPolicy ?? {
        directives: {
          'default-src': ['\'self\''],
          'script-src': ['\'self\'', '\'unsafe-inline\''],
          'style-src': ['\'self\'', '\'unsafe-inline\''],
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
        },
      },
      crossOriginEmbedderPolicy: options.crossOriginEmbedderPolicy ?? true,
      crossOriginOpenerPolicy: options.crossOriginOpenerPolicy ?? true,
      crossOriginResourcePolicy: options.crossOriginResourcePolicy ?? true,
      dnsPrefetchControl: options.dnsPrefetchControl ?? true,
      expectCt: options.expectCt ?? helmetConfig.expectCt ?? false,
      frameguard: options.frameguard ?? {
        action: helmetConfig.frameOptions?.toLowerCase() as 'deny' | 'sameorigin' || 'deny',
      },
      hidePoweredBy: options.hidePoweredBy ?? helmetConfig.hidePoweredBy ?? true,
      hsts: options.hsts ?? helmetConfig.hsts ?? {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: options.ieNoOpen ?? true,
      noSniff: options.noSniff ?? helmetConfig.noSniff ?? true,
      originAgentCluster: options.originAgentCluster ?? true,
      permittedCrossDomainPolicies: options.permittedCrossDomainPolicies ?? {
        permittedPolicies: 'none',
      },
      referrerPolicy: options.referrerPolicy ?? helmetConfig.referrerPolicy ?? {
        policy: 'strict-origin-when-cross-origin',
      },
      xssFilter: options.xssFilter ?? helmetConfig.xssFilter ?? true,
    }
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const helmetConfig = config.server?.security?.helmet || {}

    // If helmet is disabled, continue to next middleware
    if (helmetConfig.enabled === false) {
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }

    const response = await next()
    if (!response) {
      return new Response('Not Found', { status: 404 })
    }

    const headers = new Headers(response.headers)

    // Content Security Policy
    if (this.options.contentSecurityPolicy) {
      const csp = this.options.contentSecurityPolicy
      if (typeof csp === 'object' && csp.directives) {
        const directives = Object.entries(csp.directives)
          .map(([key, values]) => `${key} ${values.join(' ')}`)
          .join('; ')

        const headerName = csp.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
        headers.set(headerName, directives)

        if (csp.reportUri) {
          headers.set('Report-To', JSON.stringify({
            group: 'csp-endpoint',
            max_age: 10886400,
            endpoints: [{ url: csp.reportUri }],
          }))
        }
      }
    }

    // Cross-Origin Embedder Policy
    if (this.options.crossOriginEmbedderPolicy) {
      const coep = this.options.crossOriginEmbedderPolicy
      const policy = typeof coep === 'object' ? coep.policy || 'require-corp' : 'require-corp'
      headers.set('Cross-Origin-Embedder-Policy', policy)
    }

    // Cross-Origin Opener Policy
    if (this.options.crossOriginOpenerPolicy) {
      const coop = this.options.crossOriginOpenerPolicy
      const policy = typeof coop === 'object' ? coop.policy || 'same-origin' : 'same-origin'
      headers.set('Cross-Origin-Opener-Policy', policy)
    }

    // Cross-Origin Resource Policy
    if (this.options.crossOriginResourcePolicy) {
      const corp = this.options.crossOriginResourcePolicy
      const policy = typeof corp === 'object' ? corp.policy || 'same-origin' : 'same-origin'
      headers.set('Cross-Origin-Resource-Policy', policy)
    }

    // DNS Prefetch Control
    if (this.options.dnsPrefetchControl) {
      const dnsPrefetch = this.options.dnsPrefetchControl
      const allow = typeof dnsPrefetch === 'object' ? dnsPrefetch.allow : false
      headers.set('X-DNS-Prefetch-Control', allow ? 'on' : 'off')
    }

    // Expect-CT
    if (this.options.expectCt) {
      const expectCt = this.options.expectCt
      if (typeof expectCt === 'object') {
        const parts = []
        if (expectCt.enforce)
          parts.push('enforce')
        if (expectCt.maxAge)
          parts.push(`max-age=${expectCt.maxAge}`)
        if (expectCt.reportUri)
          parts.push(`report-uri="${expectCt.reportUri}"`)
        headers.set('Expect-CT', parts.join(', '))
      }
    }

    // X-Frame-Options
    if (this.options.frameguard) {
      const frameguard = this.options.frameguard
      if (typeof frameguard === 'object') {
        const action = frameguard.action || 'deny'
        const value = action === 'sameorigin' && frameguard.domain
          ? `ALLOW-FROM ${frameguard.domain}`
          : action.toUpperCase()
        headers.set('X-Frame-Options', value)
      }
    }

    // Hide X-Powered-By
    if (this.options.hidePoweredBy) {
      headers.delete('X-Powered-By')
    }

    // HTTP Strict Transport Security
    if (this.options.hsts) {
      const hsts = this.options.hsts
      if (typeof hsts === 'object') {
        const parts = [`max-age=${hsts.maxAge || 31536000}`]
        if (hsts.includeSubDomains)
          parts.push('includeSubDomains')
        if (hsts.preload)
          parts.push('preload')
        headers.set('Strict-Transport-Security', parts.join('; '))
      }
    }

    // X-Download-Options
    if (this.options.ieNoOpen) {
      headers.set('X-Download-Options', 'noopen')
    }

    // X-Content-Type-Options
    if (this.options.noSniff) {
      headers.set('X-Content-Type-Options', 'nosniff')
    }

    // Origin-Agent-Cluster
    if (this.options.originAgentCluster) {
      headers.set('Origin-Agent-Cluster', '?1')
    }

    // X-Permitted-Cross-Domain-Policies
    if (this.options.permittedCrossDomainPolicies) {
      const crossDomain = this.options.permittedCrossDomainPolicies
      const policy = typeof crossDomain === 'object'
        ? crossDomain.permittedPolicies || 'none'
        : 'none'
      headers.set('X-Permitted-Cross-Domain-Policies', policy)
    }

    // Referrer-Policy
    if (this.options.referrerPolicy) {
      const referrer = this.options.referrerPolicy
      if (typeof referrer === 'object') {
        const policy = Array.isArray(referrer.policy)
          ? referrer.policy.join(', ')
          : referrer.policy || 'strict-origin-when-cross-origin'
        headers.set('Referrer-Policy', policy)
      }
    }

    // X-XSS-Protection
    if (this.options.xssFilter) {
      const xss = this.options.xssFilter
      const value = typeof xss === 'object' && xss.setOnOldIE
        ? '1; mode=block'
        : '0'
      headers.set('X-XSS-Protection', value)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}
