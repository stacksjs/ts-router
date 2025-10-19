/**
 * Request/Response Enhancements - Validation System
 *
 * Laravel-style validation with custom rules and error handling
 */

import type { EnhancedRequest } from '../types'
import { ValidationException } from '../errors/exceptions'

export interface ValidationRule {
  name: string
  validate: (value: any, parameters: string[], field: string, data: Record<string, any>) => Promise<boolean> | boolean
  message: string | ((field: string, parameters: string[]) => string)
}

export interface ValidationRules {
  [field: string]: string | ValidationRule[]
}

export interface ValidationErrors {
  [field: string]: string[]
}

export interface ValidatorConfig {
  stopOnFirstFailure?: boolean
  customMessages?: Record<string, string>
  customAttributes?: Record<string, string>
  bail?: boolean
}

/**
 * Built-in validation rules
 */
export const BuiltInRules: Record<string, ValidationRule> = {
  required: {
    name: 'required',
    validate: (value) => {
      if (value === null || value === undefined)
        return false
      if (typeof value === 'string')
        return value.trim().length > 0
      if (Array.isArray(value))
        return value.length > 0
      if (typeof value === 'object')
        return Object.keys(value).length > 0
      return true
    },
    message: 'The :field field is required.',
  },

  string: {
    name: 'string',
    validate: value => typeof value === 'string',
    message: 'The :field field must be a string.',
  },

  number: {
    name: 'number',
    validate: value => typeof value === 'number' && !Number.isNaN(value),
    message: 'The :field field must be a number.',
  },

  integer: {
    name: 'integer',
    validate: value => Number.isInteger(Number(value)),
    message: 'The :field field must be an integer.',
  },

  boolean: {
    name: 'boolean',
    validate: value => typeof value === 'boolean' || value === 'true' || value === 'false' || value === '1' || value === '0',
    message: 'The :field field must be true or false.',
  },

  email: {
    name: 'email',
    validate: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
      return typeof value === 'string' && emailRegex.test(value)
    },
    message: 'The :field field must be a valid email address.',
  },

  url: {
    name: 'url',
    validate: (value) => {
      try {
        new URL(value)
        return true
      }
      catch {
        return false
      }
    },
    message: 'The :field field must be a valid URL.',
  },

  min: {
    name: 'min',
    validate: (value, parameters) => {
      const min = Number(parameters[0])
      if (typeof value === 'string')
        return value.length >= min
      if (typeof value === 'number')
        return value >= min
      if (Array.isArray(value))
        return value.length >= min
      return false
    },
    message: (field, parameters) => `The ${field} field must be at least ${parameters[0]} characters.`,
  },

  max: {
    name: 'max',
    validate: (value, parameters) => {
      const max = Number(parameters[0])
      if (typeof value === 'string')
        return value.length <= max
      if (typeof value === 'number')
        return value <= max
      if (Array.isArray(value))
        return value.length <= max
      return false
    },
    message: (field, parameters) => `The ${field} field must not exceed ${parameters[0]} characters.`,
  },

  between: {
    name: 'between',
    validate: (value, parameters) => {
      const min = Number(parameters[0])
      const max = Number(parameters[1])
      if (typeof value === 'string')
        return value.length >= min && value.length <= max
      if (typeof value === 'number')
        return value >= min && value <= max
      if (Array.isArray(value))
        return value.length >= min && value.length <= max
      return false
    },
    message: (field, parameters) => `The ${field} field must be between ${parameters[0]} and ${parameters[1]}.`,
  },

  in: {
    name: 'in',
    validate: (value, parameters) => parameters.includes(String(value)),
    message: (field, parameters) => `The ${field} field must be one of: ${parameters.join(', ')}.`,
  },

  notIn: {
    name: 'not_in',
    validate: (value, parameters) => !parameters.includes(String(value)),
    message: (field, parameters) => `The ${field} field must not be one of: ${parameters.join(', ')}.`,
  },

  regex: {
    name: 'regex',
    validate: (value, parameters) => {
      const pattern = new RegExp(parameters[0])
      return typeof value === 'string' && pattern.test(value)
    },
    message: 'The :field field format is invalid.',
  },

  alpha: {
    name: 'alpha',
    validate: value => typeof value === 'string' && /^[a-z]+$/i.test(value),
    message: 'The :field field must contain only letters.',
  },

  alphaNum: {
    name: 'alpha_num',
    validate: value => typeof value === 'string' && /^[a-z0-9]+$/i.test(value),
    message: 'The :field field must contain only letters and numbers.',
  },

  alphaDash: {
    name: 'alpha_dash',
    validate: value => typeof value === 'string' && /^[\w-]+$/.test(value),
    message: 'The :field field must contain only letters, numbers, dashes, and underscores.',
  },

  date: {
    name: 'date',
    validate: (value) => {
      const date = new Date(value)
      return !isNaN(date.getTime())
    },
    message: 'The :field field must be a valid date.',
  },

  dateAfter: {
    name: 'after',
    validate: (value, parameters) => {
      const date = new Date(value)
      const afterDate = new Date(parameters[0])
      return !isNaN(date.getTime()) && !isNaN(afterDate.getTime()) && date > afterDate
    },
    message: (field, parameters) => `The ${field} field must be after ${parameters[0]}.`,
  },

  dateBefore: {
    name: 'before',
    validate: (value, parameters) => {
      const date = new Date(value)
      const beforeDate = new Date(parameters[0])
      return !isNaN(date.getTime()) && !isNaN(beforeDate.getTime()) && date < beforeDate
    },
    message: (field, parameters) => `The ${field} field must be before ${parameters[0]}.`,
  },

  confirmed: {
    name: 'confirmed',
    validate: (value, parameters, field, data) => {
      const confirmationField = parameters[0] || `${field}_confirmation`
      return value === data[confirmationField]
    },
    message: 'The :field confirmation does not match.',
  },

  same: {
    name: 'same',
    validate: (value, parameters, field, data) => {
      return value === data[parameters[0]]
    },
    message: (field, parameters) => `The ${field} field must match ${parameters[0]}.`,
  },

  different: {
    name: 'different',
    validate: (value, parameters, field, data) => {
      return value !== data[parameters[0]]
    },
    message: (field, parameters) => `The ${field} field must be different from ${parameters[0]}.`,
  },

  json: {
    name: 'json',
    validate: (value) => {
      try {
        JSON.parse(value)
        return true
      }
      catch {
        return false
      }
    },
    message: 'The :field field must be valid JSON.',
  },

  uuid: {
    name: 'uuid',
    validate: (value) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      return typeof value === 'string' && uuidRegex.test(value)
    },
    message: 'The :field field must be a valid UUID.',
  },

  array: {
    name: 'array',
    validate: value => Array.isArray(value),
    message: 'The :field field must be an array.',
  },

  object: {
    name: 'object',
    validate: value => typeof value === 'object' && value !== null && !Array.isArray(value),
    message: 'The :field field must be an object.',
  },
}

/**
 * Database validation rules (require external implementation)
 */
export const DatabaseRules: Record<string, ValidationRule> = {
  unique: {
    name: 'unique',
    validate: async (value, parameters) => {
      // This would need to be implemented with actual database queries
      // For now, return true as a placeholder
      console.warn('Database validation rule "unique" requires external implementation')
      return true
    },
    message: 'The :field field must be unique.',
  },

  exists: {
    name: 'exists',
    validate: async (value, parameters) => {
      // This would need to be implemented with actual database queries
      // For now, return true as a placeholder
      console.warn('Database validation rule "exists" requires external implementation')
      return true
    },
    message: 'The selected :field is invalid.',
  },
}

/**
 * Main validator class
 */
export class Validator {
  private rules: Record<string, ValidationRule> = {}
  private config: ValidatorConfig

  constructor(config: ValidatorConfig = {}) {
    this.config = {
      stopOnFirstFailure: false,
      bail: false,
      ...config,
    }

    // Register built-in rules
    this.registerRules(BuiltInRules)
  }

  /**
   * Register validation rules
   */
  registerRule(rule: ValidationRule): void {
    this.rules[rule.name] = rule
  }

  /**
   * Register multiple validation rules
   */
  registerRules(rules: Record<string, ValidationRule>): void {
    Object.values(rules).forEach(rule => this.registerRule(rule))
  }

  /**
   * Parse validation rule string
   */
  private parseRuleString(ruleString: string): Array<{ name: string, parameters: string[] }> {
    return ruleString.split('|').map((rule) => {
      const [name, ...paramParts] = rule.split(':')
      const parameters = paramParts.length > 0 ? paramParts.join(':').split(',') : []
      return { name: name.trim(), parameters }
    })
  }

  /**
   * Validate data against rules
   */
  async validate(data: Record<string, any>, rules: ValidationRules): Promise<ValidationErrors> {
    const errors: ValidationErrors = {}

    for (const [field, fieldRules] of Object.entries(rules)) {
      const fieldErrors: string[] = []
      const value = this.getNestedValue(data, field)

      // Parse rules if they're in string format
      const parsedRules = typeof fieldRules === 'string'
        ? this.parseRuleString(fieldRules)
        : fieldRules.map(rule => ({ name: rule.name, parameters: [] }))

      for (const { name, parameters } of parsedRules) {
        const rule = this.rules[name]
        if (!rule) {
          console.warn(`Validation rule "${name}" not found`)
          continue
        }

        try {
          const isValid = await rule.validate(value, parameters, field, data)

          if (!isValid) {
            const message = this.formatErrorMessage(rule, field, parameters)
            fieldErrors.push(message)

            if (this.config.stopOnFirstFailure || this.config.bail) {
              break
            }
          }
        }
        catch (error) {
          console.error(`Error validating rule "${name}" for field "${field}":`, error)
          fieldErrors.push(`Validation error for ${field}`)
        }
      }

      if (fieldErrors.length > 0) {
        errors[field] = fieldErrors
      }
    }

    return errors
  }

  /**
   * Validate and throw exception if validation fails
   */
  async validateOrFail(data: Record<string, any>, rules: ValidationRules): Promise<void> {
    const errors = await this.validate(data, rules)

    if (Object.keys(errors).length > 0) {
      throw new ValidationException('Validation failed', errors)
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, obj)
  }

  /**
   * Format error message
   */
  private formatErrorMessage(rule: ValidationRule, field: string, parameters: string[]): string {
    const customMessage = this.config.customMessages?.[`${field}.${rule.name}`]
      || this.config.customMessages?.[rule.name]

    if (customMessage) {
      return this.replacePlaceholders(customMessage, field, parameters)
    }

    const message = typeof rule.message === 'function'
      ? rule.message(field, parameters)
      : rule.message

    return this.replacePlaceholders(message, field, parameters)
  }

  /**
   * Replace placeholders in error messages
   */
  private replacePlaceholders(message: string, field: string, parameters: string[]): string {
    const fieldName = this.config.customAttributes?.[field] || field.replace(/_/g, ' ')

    return message
      .replace(/:field/g, fieldName)
      .replace(/:attribute/g, fieldName)
      .replace(/:value/g, parameters[0] || '')
      .replace(/:other/g, parameters[1] || '')
  }
}

/**
 * Global validator instance
 */
export const globalValidator = new Validator()

/**
 * Validation middleware factory
 */
export function createValidationMiddleware(rules: ValidationRules, config?: ValidatorConfig) {
  const validator = new Validator(config)

  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    try {
      // Get data from request body, query, and params
      const data = {
        ...req.query,
        ...req.params,
        ...(req.jsonBody || {}),
        ...(req.formBody || {}),
      }

      await validator.validateOrFail(data, rules)

      // Add validated data to request
      req.validated = data

      return await next()
    }
    catch (error) {
      if (error instanceof ValidationException) {
        throw error
      }
      throw new ValidationException('Validation error occurred')
    }
  }
}

/**
 * Validation rule builder for fluent API
 */
export class ValidationRuleBuilder {
  private rules: string[] = []

  required(): this {
    this.rules.push('required')
    return this
  }

  string(): this {
    this.rules.push('string')
    return this
  }

  number(): this {
    this.rules.push('number')
    return this
  }

  integer(): this {
    this.rules.push('integer')
    return this
  }

  boolean(): this {
    this.rules.push('boolean')
    return this
  }

  email(): this {
    this.rules.push('email')
    return this
  }

  url(): this {
    this.rules.push('url')
    return this
  }

  min(value: number): this {
    this.rules.push(`min:${value}`)
    return this
  }

  max(value: number): this {
    this.rules.push(`max:${value}`)
    return this
  }

  between(min: number, max: number): this {
    this.rules.push(`between:${min},${max}`)
    return this
  }

  in(...values: string[]): this {
    this.rules.push(`in:${values.join(',')}`)
    return this
  }

  notIn(...values: string[]): this {
    this.rules.push(`not_in:${values.join(',')}`)
    return this
  }

  regex(pattern: string): this {
    this.rules.push(`regex:${pattern}`)
    return this
  }

  alpha(): this {
    this.rules.push('alpha')
    return this
  }

  alphaNum(): this {
    this.rules.push('alpha_num')
    return this
  }

  alphaDash(): this {
    this.rules.push('alpha_dash')
    return this
  }

  date(): this {
    this.rules.push('date')
    return this
  }

  after(date: string): this {
    this.rules.push(`after:${date}`)
    return this
  }

  before(date: string): this {
    this.rules.push(`before:${date}`)
    return this
  }

  confirmed(field?: string): this {
    this.rules.push(field ? `confirmed:${field}` : 'confirmed')
    return this
  }

  same(field: string): this {
    this.rules.push(`same:${field}`)
    return this
  }

  different(field: string): this {
    this.rules.push(`different:${field}`)
    return this
  }

  json(): this {
    this.rules.push('json')
    return this
  }

  uuid(): this {
    this.rules.push('uuid')
    return this
  }

  array(): this {
    this.rules.push('array')
    return this
  }

  object(): this {
    this.rules.push('object')
    return this
  }

  unique(table: string, column?: string): this {
    this.rules.push(column ? `unique:${table},${column}` : `unique:${table}`)
    return this
  }

  exists(table: string, column?: string): this {
    this.rules.push(column ? `exists:${table},${column}` : `exists:${table}`)
    return this
  }

  custom(ruleName: string, ...parameters: string[]): this {
    this.rules.push(parameters.length > 0 ? `${ruleName}:${parameters.join(',')}` : ruleName)
    return this
  }

  build(): string {
    return this.rules.join('|')
  }
}

/**
 * Factory function to create validation rule builder
 */
export function rule(): ValidationRuleBuilder {
  return new ValidationRuleBuilder()
}

/**
 * Validation helper functions
 */
export const ValidationHelpers = {
  /**
   * Create validation rules object
   */
  rules(rules: Record<string, string | ValidationRuleBuilder>): ValidationRules {
    const result: ValidationRules = {}

    for (const [field, fieldRules] of Object.entries(rules)) {
      result[field] = fieldRules instanceof ValidationRuleBuilder
        ? fieldRules.build()
        : fieldRules
    }

    return result
  },

  /**
   * Validate single value
   */
  async validateValue(value: any, rules: string, field = 'value'): Promise<string[]> {
    const validator = new Validator()
    const errors = await validator.validate({ [field]: value }, { [field]: rules })
    return errors[field] || []
  },

  /**
   * Check if value passes validation
   */
  async passes(value: any, rules: string): Promise<boolean> {
    const errors = await this.validateValue(value, rules)
    return errors.length === 0
  },

  /**
   * Check if value fails validation
   */
  async fails(value: any, rules: string): Promise<boolean> {
    return !(await this.passes(value, rules))
  },
}
