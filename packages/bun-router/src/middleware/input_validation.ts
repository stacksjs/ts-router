import type { EnhancedRequest, NextFunction } from '../types'
import { config } from '../config'

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'uuid' | 'date' | 'regex' | 'custom'
  required?: boolean
  min?: number
  max?: number
  pattern?: RegExp
  enum?: any[]
  custom?: (value: any) => boolean | string
  sanitize?: boolean
  transform?: (value: any) => any
}

export interface ValidationSchema {
  [key: string]: ValidationRule | ValidationSchema
}

export interface InputValidationOptions {
  enabled?: boolean
  schemas?: {
    query?: ValidationSchema
    body?: ValidationSchema
    headers?: ValidationSchema
    params?: ValidationSchema
  }
  sanitizeByDefault?: boolean
  strictMode?: boolean
  allowUnknownFields?: boolean
  maxDepth?: number
  onValidationError?: (errors: ValidationError[]) => Response
}

export interface ValidationError {
  field: string
  message: string
  value: any
  rule: string
}

export default class InputValidation {
  private options: InputValidationOptions

  constructor(options: InputValidationOptions = {}) {
    const validationConfig = config.server?.security?.inputValidation || {}

    this.options = {
      enabled: options.enabled ?? validationConfig.enabled ?? true,
      schemas: options.schemas ?? validationConfig.schemas ?? {},
      sanitizeByDefault: options.sanitizeByDefault ?? validationConfig.sanitizeByDefault ?? true,
      strictMode: options.strictMode ?? validationConfig.strictMode ?? false,
      allowUnknownFields: options.allowUnknownFields ?? validationConfig.allowUnknownFields ?? true,
      maxDepth: options.maxDepth ?? validationConfig.maxDepth ?? 10,
      onValidationError: options.onValidationError,
    }
  }

  private validateValue(value: any, rule: ValidationRule, fieldPath: string): ValidationError[] {
    const errors: ValidationError[] = []

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: fieldPath,
        message: 'Field is required',
        value,
        rule: 'required',
      })
      return errors
    }

    // Skip validation if value is undefined/null and not required
    if (value === undefined || value === null) {
      return errors
    }

    // Type validation
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({
            field: fieldPath,
            message: 'Must be a string',
            value,
            rule: 'type',
          })
        }
        else {
          if (rule.min !== undefined && value.length < rule.min) {
            errors.push({
              field: fieldPath,
              message: `Must be at least ${rule.min} characters`,
              value,
              rule: 'min',
            })
          }
          if (rule.max !== undefined && value.length > rule.max) {
            errors.push({
              field: fieldPath,
              message: `Must be at most ${rule.max} characters`,
              value,
              rule: 'max',
            })
          }
        }
        break

      case 'number': {
        const num = Number(value)
        if (Number.isNaN(num)) {
          errors.push({
            field: fieldPath,
            message: 'Must be a number',
            value,
            rule: 'type',
          })
        }
        else {
          if (rule.min !== undefined && num < rule.min) {
            errors.push({
              field: fieldPath,
              message: `Must be at least ${rule.min}`,
              value,
              rule: 'min',
            })
          }
          if (rule.max !== undefined && num > rule.max) {
            errors.push({
              field: fieldPath,
              message: `Must be at most ${rule.max}`,
              value,
              rule: 'max',
            })
          }
        }
        break
      }
      case 'boolean':
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          errors.push({
            field: fieldPath,
            message: 'Must be a boolean',
            value,
            rule: 'type',
          })
        }
        break

      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
        if (typeof value === 'string' && !emailRegex.test(value)) {
          errors.push({
            field: fieldPath,
            message: 'Must be a valid email address',
            value,
            rule: 'format',
          })
        }
        break
      }
      case 'url':
        try {
          void new URL(value)
        }
        catch {
          errors.push({
            field: fieldPath,
            message: 'Must be a valid URL',
            value,
            rule: 'format',
          })
        }
        break

      case 'uuid': {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        if (typeof value === 'string' && !uuidRegex.test(value)) {
          errors.push({
            field: fieldPath,
            message: 'Must be a valid UUID',
            value,
            rule: 'format',
          })
        }
        break
      }
      case 'date': {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) {
          errors.push({
            field: fieldPath,
            message: 'Must be a valid date',
            value,
            rule: 'format',
          })
        }
        break
      }
      case 'regex':
        if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
          errors.push({
            field: fieldPath,
            message: 'Does not match required pattern',
            value,
            rule: 'pattern',
          })
        }
        break

      case 'custom':
        if (rule.custom) {
          const result = rule.custom(value)
          if (result !== true) {
            errors.push({
              field: fieldPath,
              message: typeof result === 'string' ? result : 'Custom validation failed',
              value,
              rule: 'custom',
            })
          }
        }
        break
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push({
        field: fieldPath,
        message: `Must be one of: ${rule.enum.join(', ')}`,
        value,
        rule: 'enum',
      })
    }

    // Pattern validation
    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
      errors.push({
        field: fieldPath,
        message: 'Does not match required pattern',
        value,
        rule: 'pattern',
      })
    }

    return errors
  }

  private sanitizeValue(value: any, rule: ValidationRule): any {
    if (!rule.sanitize && !this.options.sanitizeByDefault) {
      return value
    }

    if (typeof value === 'string') {
      // Basic HTML sanitization
      value = value
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
        .trim()
    }

    // Apply transformation if provided
    if (rule.transform) {
      value = rule.transform(value)
    }

    return value
  }

  private validateObject(obj: any, schema: ValidationSchema, basePath = '', depth = 0): ValidationError[] {
    const errors: ValidationError[] = []

    if (depth > this.options.maxDepth!) {
      errors.push({
        field: basePath,
        message: 'Maximum nesting depth exceeded',
        value: obj,
        rule: 'depth',
      })
      return errors
    }

    // Check for unknown fields in strict mode
    if (this.options.strictMode && !this.options.allowUnknownFields) {
      for (const key in obj) {
        if (!(key in schema)) {
          errors.push({
            field: basePath ? `${basePath}.${key}` : key,
            message: 'Unknown field',
            value: obj[key],
            rule: 'unknown',
          })
        }
      }
    }

    // Validate known fields
    for (const [key, rule] of Object.entries(schema)) {
      const fieldPath = basePath ? `${basePath}.${key}` : key
      const value = obj?.[key]

      if (typeof rule === 'object' && !('type' in rule)) {
        // Nested schema
        if (value && typeof value === 'object') {
          errors.push(...this.validateObject(value, rule as ValidationSchema, fieldPath, depth + 1))
        }
      }
      else {
        // Validation rule
        const validationRule = rule as ValidationRule
        errors.push(...this.validateValue(value, validationRule, fieldPath))

        // Sanitize if needed
        if (obj && (validationRule.sanitize || this.options.sanitizeByDefault)) {
          obj[key] = this.sanitizeValue(value, validationRule)
        }
      }
    }

    return errors
  }

  private async parseRequestBody(req: EnhancedRequest): Promise<any> {
    const contentType = req.headers.get('content-type') || ''

    try {
      if (contentType.includes('application/json')) {
        return await req.json()
      }
      else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData()
        const result: Record<string, any> = {}
        for (const [key, value] of formData.entries()) {
          result[key] = value
        }
        return result
      }
      else if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData()
        const result: Record<string, any> = {}
        for (const [key, value] of formData.entries()) {
          result[key] = value
        }
        return result
      }
    }
    catch (error) {
      console.error(error)
      throw new Error('Invalid request body format')
    }

    return {}
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    if (!this.options.enabled) {
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }

    const allErrors: ValidationError[] = []
    const url = new URL(req.url)

    try {
      // Validate query parameters
      if (this.options.schemas?.query) {
        const queryParams: Record<string, any> = {}
        for (const [key, value] of url.searchParams.entries()) {
          queryParams[key] = value
        }
        const queryErrors = this.validateObject(queryParams, this.options.schemas.query)
        allErrors.push(...queryErrors)
      }

      // Validate request body
      if (this.options.schemas?.body && req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          const body = await this.parseRequestBody(req)
          const bodyErrors = this.validateObject(body, this.options.schemas.body)
          allErrors.push(...bodyErrors)

          // Attach validated body to request
          req.validatedBody = body
        }
        catch (error) {
          allErrors.push({
            field: 'body',
            message: error instanceof Error ? error.message : 'Invalid request body',
            value: null,
            rule: 'parse',
          })
        }
      }

      // Validate headers
      if (this.options.schemas?.headers) {
        const headers: Record<string, any> = {}
        for (const [key, value] of req.headers.entries()) {
          headers[key] = value
        }
        const headerErrors = this.validateObject(headers, this.options.schemas.headers)
        allErrors.push(...headerErrors)
      }

      // Validate route parameters
      if (this.options.schemas?.params && req.params) {
        const paramErrors = this.validateObject(req.params, this.options.schemas.params)
        allErrors.push(...paramErrors)
      }

      // Return validation errors if any
      if (allErrors.length > 0) {
        if (this.options.onValidationError) {
          return this.options.onValidationError(allErrors)
        }

        return new Response(JSON.stringify({
          error: 'Validation Error',
          message: 'Request validation failed',
          errors: allErrors,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }
    catch (error) {
      console.error('Input validation error:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}

// Factory function for easy use
export function inputValidation(options: InputValidationOptions = {}): (req: EnhancedRequest, next: NextFunction) => Promise<Response> {
  const instance = new InputValidation(options)
  return async (req: EnhancedRequest, next: NextFunction) => instance.handle(req, next)
}
