/**
 * Request/Response Enhancements - Main Exports
 *
 * Comprehensive request validation, response macros, and router enhancements
 */

// Request macro exports
export {
  BuiltInRequestMacros,
  EnhancedRequestWithMacros,
  registerBuiltInRequestMacros,
  RequestHelpers,
  RequestMacroFactory,
  requestMacroRegistry,
} from '../request/macros'

export type {
  RequestMacro,
} from '../request/macros'

// Response macro exports
export {
  BuiltInResponseMacros,
  EnhancedResponse,
  registerBuiltInResponseMacros,
  ResponseHelpers,
  ResponseMacroFactory,
  responseMacroRegistry,
} from '../response/macros'

export type {
  ApiResponse,
  PaginatedResponse,
  ResponseMacro,
} from '../response/macros'

// Re-export commonly used types
export type { EnhancedRequest, MiddlewareHandler, RouteHandler } from '../types'

// Validation exports
export {
  BuiltInRules,
  createValidationMiddleware,
  DatabaseRules,
  globalValidator,
  rule,
  ValidationHelpers,
  ValidationRuleBuilder,
  Validator,
} from '../validation/validator'

export type {
  ValidationErrors,
  ValidationRule,
  ValidationRules,
  ValidatorConfig,
} from '../validation/validator'

// Router integration exports
export {
  createEnhancedRouter,
  createEnhancementMiddleware,
  EnhancedRouteBuilder,
  EnhancedRouter,
  EnhancementPresets,
  MiddlewareHelpers,
  RouteHelpers,
  validate,
  ValidationMiddlewareBuilder,
} from './router-integration'
