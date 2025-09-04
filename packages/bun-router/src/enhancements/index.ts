/**
 * Request/Response Enhancements - Main Exports
 * 
 * Comprehensive request validation, response macros, and router enhancements
 */

// Validation exports
export {
  Validator,
  ValidationRuleBuilder,
  globalValidator,
  createValidationMiddleware,
  rule,
  ValidationHelpers,
  BuiltInRules,
  DatabaseRules
} from '../validation/validator'

export type {
  ValidationRule,
  ValidationRules,
  ValidationErrors,
  ValidatorConfig
} from '../validation/validator'

// Response macro exports
export {
  EnhancedResponse,
  responseMacroRegistry,
  BuiltInResponseMacros,
  ResponseMacroFactory,
  ResponseHelpers,
  registerBuiltInResponseMacros
} from '../response/macros'

export type {
  ResponseMacro,
  ApiResponse,
  PaginatedResponse
} from '../response/macros'

// Request macro exports
export {
  EnhancedRequestWithMacros,
  requestMacroRegistry,
  BuiltInRequestMacros,
  RequestMacroFactory,
  RequestHelpers,
  registerBuiltInRequestMacros
} from '../request/macros'

export type {
  RequestMacro
} from '../request/macros'

// Router integration exports
export {
  EnhancedRouteBuilder,
  EnhancedRouter,
  ValidationMiddlewareBuilder,
  createEnhancementMiddleware,
  createEnhancedRouter,
  validate,
  RouteHelpers,
  MiddlewareHelpers,
  EnhancementPresets
} from './router-integration'

// Re-export commonly used types
export type { EnhancedRequest, MiddlewareHandler, RouteHandler } from '../types'
