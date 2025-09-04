/**
 * Request/Response Enhancements Test Suite
 */

import type { EnhancedRequest, ValidationRules } from '../packages/bun-router/src/enhancements'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  BuiltInRequestMacros,
  BuiltInResponseMacros,
  createValidationMiddleware,
  EnhancedRequestWithMacros,
  EnhancedResponse,
  EnhancedRouteBuilder,
  rule,
  validate,
  ValidationHelpers,
  ValidationRuleBuilder,
  Validator,
} from '../packages/bun-router/src/enhancements'

describe('Request/Response Enhancements', () => {
  describe('Validation System', () => {
    let validator: Validator

    beforeEach(() => {
      validator = new Validator()
    })

    test('should validate required fields', async () => {
      const data = { name: '', email: 'test@example.com' }
      const rules: ValidationRules = {
        name: 'required|string',
        email: 'required|email',
      }

      const errors = await validator.validate(data, rules)
      expect(errors.name).toBeDefined()
      expect(errors.name[0]).toContain('required')
      expect(errors.email).toBeUndefined()
    })

    test('should validate email format', async () => {
      const data = { email: 'invalid-email' }
      const rules: ValidationRules = { email: 'required|email' }

      const errors = await validator.validate(data, rules)
      expect(errors.email).toBeDefined()
      expect(errors.email[0]).toContain('valid email')
    })

    test('should validate string length', async () => {
      const data = { name: 'a' }
      const rules: ValidationRules = { name: 'required|string|min:2|max:50' }

      const errors = await validator.validate(data, rules)
      expect(errors.name).toBeDefined()
      expect(errors.name[0]).toContain('at least 2')
    })

    test('should validate numbers', async () => {
      const data = { age: 'not-a-number', score: 85 }
      const rules: ValidationRules = {
        age: 'required|number|min:18',
        score: 'required|number|between:0,100',
      }

      const errors = await validator.validate(data, rules)
      expect(errors.age).toBeDefined()
      expect(errors.score).toBeUndefined()
    })

    test('should validate with rule builder', async () => {
      const data = { username: 'user123', password: 'secret' }
      const rules: ValidationRules = {
        username: rule().required().string().min(3).alphaDash().build(),
        password: rule().required().string().min(6).build(),
      }

      const errors = await validator.validate(data, rules)
      expect(Object.keys(errors)).toHaveLength(0)
    })

    test('should validate arrays and objects', async () => {
      const data = {
        tags: ['tag1', 'tag2'],
        metadata: { key: 'value' },
        invalidArray: 'not-array',
      }
      const rules: ValidationRules = {
        tags: 'required|array',
        metadata: 'required|object',
        invalidArray: 'required|array',
      }

      const errors = await validator.validate(data, rules)
      expect(errors.tags).toBeUndefined()
      expect(errors.metadata).toBeUndefined()
      expect(errors.invalidArray).toBeDefined()
    })

    test('should validate confirmed fields', async () => {
      const data = {
        password: 'secret123',
        password_confirmation: 'secret123',
        email: 'test@example.com',
        email_confirmation: 'different@example.com',
      }
      const rules: ValidationRules = {
        password: 'required|confirmed',
        email: 'required|confirmed',
      }

      const errors = await validator.validate(data, rules)
      expect(errors.password).toBeUndefined()
      expect(errors.email).toBeDefined()
    })

    test('should validate with custom messages', async () => {
      const validator = new Validator({
        customMessages: {
          'name.required': 'Please provide your name',
          'email.email': 'Email format is invalid',
        },
      })

      const data = { name: '', email: 'invalid' }
      const rules: ValidationRules = {
        name: 'required',
        email: 'email',
      }

      const errors = await validator.validate(data, rules)
      expect(errors.name[0]).toBe('Please provide your name')
      expect(errors.email[0]).toBe('Email format is invalid')
    })
  })

  describe('Response Macros', () => {
    test('should create success response', () => {
      const response = BuiltInResponseMacros.success({ id: 1, name: 'Test' }, 'Success message')

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/json')
    })

    test('should create error response', () => {
      const response = BuiltInResponseMacros.error('Something went wrong', { field: ['Error message'] }, 400)

      expect(response.status).toBe(400)
      expect(response.headers.get('content-type')).toBe('application/json')
    })

    test('should create validation error response', () => {
      const errors = { name: ['Name is required'], email: ['Email is invalid'] }
      const response = BuiltInResponseMacros.validationError(errors)

      expect(response.status).toBe(422)
    })

    test('should create paginated response', () => {
      const data = [{ id: 1 }, { id: 2 }]
      const pagination = {
        current_page: 1,
        per_page: 10,
        total: 25,
        path: '/api/users',
      }

      const response = BuiltInResponseMacros.paginated(data, pagination)
      expect(response.status).toBe(200)
    })

    test('should create different HTTP status responses', () => {
      expect(BuiltInResponseMacros.created({ id: 1 }).status).toBe(201)
      expect(BuiltInResponseMacros.noContent().status).toBe(204)
      expect(BuiltInResponseMacros.notFound().status).toBe(404)
      expect(BuiltInResponseMacros.unauthorized().status).toBe(401)
      expect(BuiltInResponseMacros.forbidden().status).toBe(403)
      expect(BuiltInResponseMacros.serverError().status).toBe(500)
    })

    test('should create redirect responses', () => {
      const redirect = BuiltInResponseMacros.redirect('/dashboard')
      const permanentRedirect = BuiltInResponseMacros.permanentRedirect('/new-url')

      expect(redirect.status).toBe(302)
      expect(redirect.headers.get('location')).toBe('/dashboard')
      expect(permanentRedirect.status).toBe(301)
    })

    test('should register custom macro', () => {
      EnhancedResponse.macro('customSuccess', (data: any) => {
        return new Response(JSON.stringify({ custom: true, data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      expect(EnhancedResponse.hasMacro('customSuccess')).toBe(true)
      const response = EnhancedResponse.callMacro('customSuccess', { test: true })
      expect(response.status).toBe(200)
    })
  })

  describe('Request Macros', () => {
    let mockRequest: any

    beforeEach(() => {
      // Create a mock request object with the necessary properties
      mockRequest = {
        method: 'POST',
        url: 'https://example.com/api/users?page=1&limit=10',
        headers: new Headers({
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
          'authorization': 'Bearer token123',
          'cookie': 'session=abc123; theme=dark',
        }),
        query: { page: '1', limit: '10' },
        params: { id: '123' },
        jsonBody: { name: 'John', email: 'john@example.com' },
        formBody: {},
        files: {},
        validated: {},
      }

      // Apply macros to the mock request
      EnhancedRequestWithMacros.applyMacros(mockRequest as EnhancedRequest)
    })

    test('should detect content type preferences', () => {
      expect(mockRequest.wantsJson()).toBe(true)
      expect(mockRequest.expectsJson()).toBe(true)
    })

    test('should detect mobile devices', () => {
      expect(mockRequest.isMobile()).toBe(true)
    })

    test('should get client IP', () => {
      expect(mockRequest.ip()).toBe('192.168.1.1')
      expect(mockRequest.ips()).toEqual(['192.168.1.1', '10.0.0.1'])
    })

    test('should get bearer token', () => {
      expect(mockRequest.bearerToken()).toBe('token123')
    })

    test('should get input values', () => {
      expect(mockRequest.input('name')).toBe('John')
      expect(mockRequest.input('page')).toBe('1')
      expect(mockRequest.input('id')).toBe('123')
      expect(mockRequest.input('nonexistent', 'default')).toBe('default')
    })

    test('should get all input data', () => {
      const all = mockRequest.all()
      expect(all.name).toBe('John')
      expect(all.page).toBe('1')
      expect(all.id).toBe('123')
    })

    test('should filter input data', () => {
      const only = mockRequest.only(['name', 'email'])
      expect(only).toEqual({ name: 'John', email: 'john@example.com' })

      const except = mockRequest.except(['page', 'limit'])
      expect(except.page).toBeUndefined()
      expect(except.name).toBe('John')
    })

    test('should check input presence', () => {
      expect(mockRequest.has('name')).toBe(true)
      expect(mockRequest.has('nonexistent')).toBe(false)
      expect(mockRequest.filled('name')).toBe(true)
      expect(mockRequest.missing('nonexistent')).toBe(true)
    })

    test('should parse cookies', () => {
      expect(mockRequest.cookie('session')).toBe('abc123')
      expect(mockRequest.cookie('theme')).toBe('dark')
      expect(mockRequest.cookie('nonexistent')).toBeNull()

      const allCookies = mockRequest.cookies()
      expect(allCookies.session).toBe('abc123')
      expect(allCookies.theme).toBe('dark')
    })

    test('should get path and URL info', () => {
      expect(mockRequest.path()).toBe('/api/users')
      expect(mockRequest.fullUrl()).toBe('https://example.com/api/users?page=1&limit=10')
      expect(mockRequest.root()).toBe('https://example.com')
    })

    test('should match path patterns', () => {
      expect(mockRequest.is('/api/*')).toBe(true)
      expect(mockRequest.is('/api/users')).toBe(true)
      expect(mockRequest.is('/admin/*')).toBe(false)
    })

    test('should generate fingerprint', () => {
      const fingerprint = mockRequest.fingerprint()
      expect(typeof fingerprint).toBe('string')
      expect(fingerprint.length).toBeGreaterThan(0)
    })
  })

  describe('Validation Middleware', () => {
    test('should create validation middleware', async () => {
      const rules: ValidationRules = {
        name: 'required|string|min:2',
        email: 'required|email',
      }

      const middleware = createValidationMiddleware(rules)
      expect(typeof middleware).toBe('function')

      const mockRequest = {
        query: {},
        params: {},
        jsonBody: { name: 'John', email: 'john@example.com' },
        formBody: {},
        validated: {},
      } as EnhancedRequest

      let nextCalled = false
      const next = async () => {
        nextCalled = true
        return new Response('OK')
      }

      const response = await middleware(mockRequest, next)
      expect(nextCalled).toBe(true)
      expect(mockRequest.validated).toBeDefined()
    })

    test('should throw validation exception on invalid data', async () => {
      const rules: ValidationRules = {
        name: 'required|string|min:2',
        email: 'required|email',
      }

      const middleware = createValidationMiddleware(rules)
      const mockRequest = {
        query: {},
        params: {},
        jsonBody: { name: 'a', email: 'invalid-email' },
        formBody: {},
        validated: {},
      } as EnhancedRequest

      const next = async () => new Response('OK')

      await expect(middleware(mockRequest, next)).rejects.toThrow()
    })
  })

  describe('Enhanced Route Builder', () => {
    test('should create route with validation', () => {
      const handler = async (req: EnhancedRequest) => new Response('OK')
      const builder = new EnhancedRouteBuilder('POST', '/users', handler)

      const route = builder
        .validate({
          name: 'required|string',
          email: 'required|email',
        })
        .build()

      expect(route.method).toBe('POST')
      expect(route.path).toBe('/users')
      expect(route.middleware).toBeDefined()
      expect(route.middleware?.length).toBeGreaterThan(0)
    })

    test('should create route without validation', () => {
      const handler = async (req: EnhancedRequest) => new Response('OK')
      const builder = new EnhancedRouteBuilder('GET', '/users', handler)

      const route = builder.build()

      expect(route.method).toBe('GET')
      expect(route.path).toBe('/users')
      expect(route.middleware?.length).toBe(1) // Only request macro middleware
    })
  })

  describe('Validation Builder', () => {
    test('should build validation middleware with fluent API', () => {
      const middleware = validate()
        .field('name', 'required|string|min:2')
        .field('email', 'required|email')
        .stopOnFirstFailure()
        .messages({
          'name.required': 'Name is required',
          'email.email': 'Invalid email format',
        })
        .build()

      expect(typeof middleware).toBe('function')
    })

    test('should build validation with multiple fields', () => {
      const middleware = validate()
        .fields({
          name: 'required|string',
          email: 'required|email',
          age: 'required|number|min:18',
        })
        .build()

      expect(typeof middleware).toBe('function')
    })
  })

  describe('Validation Helpers', () => {
    test('should validate single value', async () => {
      const errors = await ValidationHelpers.validateValue('test@example.com', 'required|email')
      expect(errors).toHaveLength(0)

      const invalidErrors = await ValidationHelpers.validateValue('invalid', 'required|email')
      expect(invalidErrors.length).toBeGreaterThan(0)
    })

    test('should check if value passes validation', async () => {
      const passes = await ValidationHelpers.passes('test@example.com', 'required|email')
      expect(passes).toBe(true)

      const fails = await ValidationHelpers.fails('invalid', 'required|email')
      expect(fails).toBe(true)
    })

    test('should create rules object', () => {
      const rules = ValidationHelpers.rules({
        name: rule().required().string().min(2),
        email: 'required|email',
      })

      expect(rules.name).toContain('required')
      expect(rules.name).toContain('string')
      expect(rules.name).toContain('min:2')
      expect(rules.email).toBe('required|email')
    })
  })

  describe('Rule Builder', () => {
    test('should build complex validation rules', () => {
      const ruleString = rule()
        .required()
        .string()
        .min(3)
        .max(50)
        .alpha()
        .build()

      expect(ruleString).toBe('required|string|min:3|max:50|alpha')
    })

    test('should build database validation rules', () => {
      const ruleString = rule()
        .required()
        .email()
        .unique('users', 'email')
        .build()

      expect(ruleString).toBe('required|email|unique:users,email')
    })

    test('should build custom rules', () => {
      const ruleString = rule()
        .required()
        .custom('custom_rule', 'param1', 'param2')
        .build()

      expect(ruleString).toBe('required|custom_rule:param1,param2')
    })
  })
})
