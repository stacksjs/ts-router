import Auth, {
  apiKeyAuth,
  basicAuth,
  bearerAuth,
  extractApiKey,
  extractBasicAuth,
  extractBearerToken,
  jwtAuth,
  oauth2Auth,
} from './auth'
import Cors from './cors'
import Csrf from './csrf'
import JsonBody from './json_body'
import { rateLimit as createRateLimit } from './rate_limit'
import RequestId from './request_id'
import RequestSigning from './request_signing'
import Session from './session'

// Export middleware classes
export { default as Auth } from './auth'
export { default as ContentSecurityPolicy } from './content_security_policy'
export { contentSecurityPolicy } from './content_security_policy'
export { default as Cors } from './cors'
export { default as Csrf } from './csrf'
export { default as DDoSProtection } from './ddos_protection'
export { ddosProtection } from './ddos_protection'
export { default as FileSecurity } from './file_security'
export { default as FileUpload } from './file_upload'
export { documentUpload, fileUpload, imageUpload, multipleFileUpload, singleFileUpload } from './file_upload'
export { default as Helmet } from './helmet'
export { default as InputValidation } from './input_validation'
export { inputValidation } from './input_validation'
export { default as JsonBody } from './json_body'
export { default as PerformanceAlerting, performanceAlerting } from './performance_alerting'
export { default as PerformanceDashboard, performanceDashboard } from './performance_dashboard'
export { default as PerformanceMonitor, performanceMonitor } from './performance_monitor'
export { default as RateLimit } from './rate_limit'
// Export factory functions for easier usage
export { rateLimit } from './rate_limit'
export { default as RequestId } from './request_id'
export { InMemoryNonceStore, default as RequestSigning, requestSigning, signRequest, verifySignature } from './request_signing'
export type { NonceStore, RequestSigningOptions, SignatureAlgorithm, SignedPart } from './request_signing'
export { SignatureError } from './request_signing'
export { default as RequestTracer, requestTracer } from './request_tracer'
export { default as Security } from './security'
export { security } from './security'
export { default as SecuritySuite } from './security_suite'
export { securitySuite } from './security_suite'

export { default as Session } from './session'

// Authentication helper exports
export {
  apiKeyAuth,
  basicAuth,
  bearerAuth,
  extractApiKey,
  extractBasicAuth,
  extractBearerToken,
  jwtAuth,
  oauth2Auth,
}

// Factory functions for easier middleware creation
export const cors = (): Cors => new Cors()
export const jsonBody = (): JsonBody => new JsonBody()
export const requestId = (): RequestId => new RequestId()
export const session = (): Session => new Session()
export const csrf = (): Csrf => new Csrf()
export function auth(): Auth {
  return new Auth({
    type: 'bearer',
    validator: () => true, // Default just passes through - must be configured correctly
  })
}

// Named middleware mapping for string-based middleware references (lazy-loaded)
let _middleware: Record<string, any> | null = null

function getMiddleware(): Record<string, any> {
  if (!_middleware) {
    _middleware = {
      'Middleware/Cors': new Cors(),
      'Middleware/JsonBody': new JsonBody(),
      'Middleware/RequestId': new RequestId(),
      'Middleware/Session': new Session(),
      'Middleware/Csrf': new Csrf(),
      'Middleware/Auth': new Auth({
        type: 'bearer',
        validator: () => true,
      }),
      'Middleware/RateLimit': createRateLimit(),
      'Middleware/RequestSigning': new RequestSigning({
        secret: '',
      }),
    }
  }
  return _middleware
}

export const middleware: Record<string, any> = new Proxy({} as Record<string, any>, {
  get(_target, prop) {
    return getMiddleware()[prop as string]
  },
  ownKeys() {
    return Object.keys(getMiddleware())
  },
  getOwnPropertyDescriptor(_target, prop) {
    const value = getMiddleware()[prop as string]
    if (value !== undefined) {
      return { configurable: true, enumerable: true, value }
    }
    return undefined
  },
})

export default middleware
