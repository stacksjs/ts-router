import type { EnhancedRequest, MiddlewareHandler, NextFunction } from '../types'
import { config } from '../config'
import ContentSecurityPolicy from './content_security_policy'
import DDoSProtection from './ddos_protection'
import Helmet from './helmet'
import InputValidation from './input_validation'
import Security from './security'

export interface SecuritySuiteOptions {
  helmet?: boolean | object
  security?: boolean | object
  ddosProtection?: boolean | object
  inputValidation?: boolean | object
  contentSecurityPolicy?: boolean | object
  order?: string[]
}

/**
 * Comprehensive security middleware suite that combines multiple security layers
 */
export default class SecuritySuite {
  private middlewares: MiddlewareHandler[] = []

  constructor(options: SecuritySuiteOptions = {}) {
    const securityConfig = (config.server?.security || {}) as any

    // Default order of security middleware execution
    const defaultOrder = [
      'ddosProtection',
      'security',
      'helmet',
      'contentSecurityPolicy',
      'inputValidation',
    ]

    const order = options.order || defaultOrder

    // Initialize middleware based on configuration and order
    for (const middlewareName of order) {
      switch (middlewareName) {
        case 'ddosProtection':
          if (options.ddosProtection !== false && securityConfig.ddos?.enabled !== false) {
            const ddosOptions = typeof options.ddosProtection === 'object'
              ? options.ddosProtection
              : {}
            const ddosInstance = new DDoSProtection(ddosOptions)
            this.middlewares.push((req: EnhancedRequest, next: NextFunction) =>
              ddosInstance.handle(req, next),
            )
          }
          break

        case 'security':
          if (options.security !== false) {
            const securityOptions = typeof options.security === 'object'
              ? options.security
              : {}
            const securityInstance = new Security(securityOptions)
            this.middlewares.push((req: EnhancedRequest, next: NextFunction) =>
              securityInstance.handle(req, next),
            )
          }
          break

        case 'helmet':
          if (options.helmet !== false && securityConfig.helmet?.enabled !== false) {
            const helmetOptions = typeof options.helmet === 'object'
              ? options.helmet
              : {}
            const helmetInstance = new Helmet(helmetOptions)
            this.middlewares.push((req: EnhancedRequest, next: NextFunction) =>
              helmetInstance.handle(req, next),
            )
          }
          break

        case 'contentSecurityPolicy':
          if (options.contentSecurityPolicy !== false
            && securityConfig.helmet?.contentSecurityPolicy !== false) {
            const cspOptions = typeof options.contentSecurityPolicy === 'object'
              ? options.contentSecurityPolicy
              : {}
            const cspInstance = new ContentSecurityPolicy(cspOptions)
            this.middlewares.push((req: EnhancedRequest, next: NextFunction) =>
              cspInstance.handle(req, next),
            )
          }
          break

        case 'inputValidation':
          if (options.inputValidation !== false
            && securityConfig.inputValidation?.enabled !== false) {
            const validationOptions = typeof options.inputValidation === 'object'
              ? options.inputValidation
              : {}
            const validationInstance = new InputValidation(validationOptions)
            this.middlewares.push((req: EnhancedRequest, next: NextFunction) =>
              validationInstance.handle(req, next),
            )
          }
          break
      }
    }
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response | null> {
    // Execute all security middleware in sequence
    let currentIndex = 0

    const executeNext = async (): Promise<Response | null> => {
      if (currentIndex >= this.middlewares.length) {
        return await next()
      }

      const middleware = this.middlewares[currentIndex++]
      return await middleware(req, executeNext)
    }

    return await executeNext()
  }
}

/**
 * Factory function to create a security suite middleware
 */
export function securitySuite(options: SecuritySuiteOptions = {}): MiddlewareHandler {
  const instance = new SecuritySuite(options)
  return async (req: EnhancedRequest, next: NextFunction) => instance.handle(req, next)
}

/**
 * Preset configurations for different security levels
 */
export const securityPresets = {
  /**
   * Basic security - minimal performance impact
   */
  basic: (): MiddlewareHandler => securitySuite({
    helmet: true,
    security: {
      attackPrevention: { enabled: true },
      requestFiltering: { enabled: true },
      responseSecurity: { enabled: true },
    },
    ddosProtection: false,
    inputValidation: false,
    contentSecurityPolicy: false,
  }),

  /**
   * Standard security - balanced security and performance
   */
  standard: (): MiddlewareHandler => securitySuite({
    helmet: true,
    security: true,
    ddosProtection: {
      enabled: true,
      maxRequestsPerMinute: 200,
      burstLimit: 50,
    },
    inputValidation: {
      enabled: true,
      sanitizeByDefault: true,
    },
    contentSecurityPolicy: false,
  }),

  /**
   * High security - maximum protection
   */
  high: (): MiddlewareHandler => securitySuite({
    helmet: true,
    security: true,
    ddosProtection: {
      enabled: true,
      maxRequestsPerMinute: 100,
      burstLimit: 20,
      blockDuration: 600000, // 10 minutes
    },
    inputValidation: {
      enabled: true,
      sanitizeByDefault: true,
      strictMode: true,
    },
    contentSecurityPolicy: {
      directives: {
        'default-src': ['\'self\''],
        'script-src': ['\'self\''],
        'style-src': ['\'self\''],
        'img-src': ['\'self\'', 'data:'],
        'font-src': ['\'self\''],
        'connect-src': ['\'self\''],
        'media-src': ['\'self\''],
        'object-src': ['\'none\''],
        'child-src': ['\'none\''],
        'worker-src': ['\'self\''],
        'frame-ancestors': ['\'none\''],
        'form-action': ['\'self\''],
        'base-uri': ['\'self\''],
        'manifest-src': ['\'self\''],
      },
    },
  }),

  /**
   * API security - optimized for API endpoints
   */
  api: (): MiddlewareHandler => securitySuite({
    helmet: {
      contentSecurityPolicy: false, // Not needed for APIs
      frameguard: false,
    },
    security: {
      attackPrevention: { enabled: true },
      requestFiltering: {
        enabled: true,
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      responseSecurity: { enabled: true },
    },
    ddosProtection: {
      enabled: true,
      maxRequestsPerMinute: 500,
      burstLimit: 100,
    },
    inputValidation: {
      enabled: true,
      sanitizeByDefault: true,
    },
    contentSecurityPolicy: false,
  }),

  /**
   * Development security - minimal restrictions for development
   */
  development: (): MiddlewareHandler => securitySuite({
    helmet: {
      contentSecurityPolicy: false,
      hsts: false,
    },
    security: {
      attackPrevention: { enabled: true },
      requestFiltering: {
        enabled: false,
        blockSuspiciousPatterns: false,
      },
      responseSecurity: { enabled: false },
    },
    ddosProtection: false,
    inputValidation: {
      enabled: true,
      sanitizeByDefault: false,
      strictMode: false,
    },
    contentSecurityPolicy: false,
  }),
}
