/**
 * Request/Response Enhancements - Main Exports
 *
 * @deprecated This folder has been refactored into the main router logic.
 * Import from '../request/macros', '../response/macros', '../router/validation-integration', or '../validation/validator' instead.
 *
 * This file re-exports for backward compatibility.
 */

// Request macro exports
export {
  BuiltInRequestMacros,
  registerBuiltInRequestMacros,
  RequestHelpers,
  RequestMacroFactory,
  requestMacroRegistry,
  RequestWithMacros,
} from '../request/macros'

export type {
  RequestMacro,
} from '../request/macros'

// Response macro exports
export {
  BuiltInResponseMacros,
  registerBuiltInResponseMacros,
  ResponseHelpers,
  ResponseMacroFactory,
  responseMacroRegistry,
  ResponseWithMacros,
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

// Router integration exports (now in ../router/validation-integration.ts)
export {
  createEnhancementMiddleware,
  createFluentRouter,
  EnhancementPresets,
  FluentRouter,
  MiddlewareHelpers,
  RouteBuilder,
  RouteHelpers,
  validate,
  ValidationMiddlewareBuilder,
} from '../router/validation-integration'
