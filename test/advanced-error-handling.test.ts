/**
 * Advanced Error Handling Test Suite
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  CircuitBreaker,
  CircuitBreakerOpenException,
  CircuitBreakerPresets,
  createAdvancedErrorHandler,
  DegradationStrategies,
  ErrorFactory,
  ErrorReportingManager,
  GracefulDegradationManager,
  RouterException,
  ValidationException,
} from '../packages/bun-router/src/errors'

describe('Advanced Error Handling', () => {
  describe('Exception Hierarchy', () => {
    test('should create RouterException with proper metadata', () => {
      const error = ErrorFactory.internalServer('Test error', undefined, {
        requestId: 'req-123',
        userId: 'user-456',
      })

      expect(error).toBeInstanceOf(RouterException)
      expect(error.code).toBe('INTERNAL_SERVER_ERROR')
      expect(error.statusCode).toBe(500)
      expect(error.context.requestId).toBe('req-123')
      expect(error.context.userId).toBe('user-456')
      expect(error.severity).toBe('high')
      expect(error.retryable).toBe(true)
    })

    test('should create ValidationException with field errors', () => {
      const fields = { email: ['Invalid email format'], age: ['Must be positive'] }
      const error = new ValidationException('Validation failed', fields)

      expect(error.statusCode).toBe(400)
      expect(error.fields).toEqual(fields)
      expect(error.retryable).toBe(false)
    })

    test('should convert error to JSON', () => {
      const error = ErrorFactory.authentication('Invalid token')
      const json = error.toJSON()

      expect(json.name).toBe('AuthenticationException')
      expect(json.code).toBe('AUTHENTICATION_ERROR')
      expect(json.statusCode).toBe(401)
      expect(json.timestamp).toBeDefined()
    })

    test('should create HTTP response', () => {
      const error = ErrorFactory.notFound('User', '123')
      const response = error.toResponse()

      expect(response.status).toBe(404)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(response.headers.get('X-Error-Code')).toBe('NOT_FOUND')
    })
  })

  describe('Circuit Breaker', () => {
    let circuitBreaker: CircuitBreaker

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-service',
        failureThreshold: 3,
        recoveryTimeout: 1000,
        timeout: 500,
        monitoringPeriod: 5000,
        minimumRequests: 2,
        errorThresholdPercentage: 50,
        halfOpenMaxCalls: 2,
        resetTimeout: 1000,
      })
    })

    test('should execute successful calls', async () => {
      const result = await circuitBreaker.execute({
        execute: async () => 'success',
      })

      expect(result).toBe('success')
      expect(circuitBreaker.getState()).toBe('CLOSED')
    })

    test('should open circuit after failure threshold', async () => {
      const failingCall = {
        execute: async () => {
          throw new Error('Service error')
        },
      }

      // Trigger failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingCall)
        }
        catch (error) {
          console.error(error)
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN')
    })

    test('should reject calls when circuit is open', async () => {
      // Force circuit open
      circuitBreaker.forceOpen()

      await expect(circuitBreaker.execute({
        execute: async () => 'success',
      })).rejects.toThrow(CircuitBreakerOpenException)
    })

    test('should use fallback when circuit is open', async () => {
      circuitBreaker.forceOpen()

      const result = await circuitBreaker.execute({
        execute: async () => 'primary',
        fallback: async () => 'fallback',
      })

      expect(result).toBe('fallback')
    })
  })

  describe('Error Reporting', () => {
    test('should create error reporting manager', () => {
      const manager = new ErrorReportingManager([{
        enabled: true,
        service: 'custom',
        environment: 'test',
      }])

      expect(manager).toBeDefined()
    })

    test('should add breadcrumbs', () => {
      const manager = new ErrorReportingManager([])

      manager.addBreadcrumb('Test breadcrumb', 'test')
      const breadcrumbs = manager.getBreadcrumbs()

      expect(breadcrumbs).toHaveLength(1)
      expect(breadcrumbs[0].message).toBe('Test breadcrumb')
    })
  })

  describe('Graceful Degradation', () => {
    test('should create degradation manager', () => {
      const manager = new GracefulDegradationManager({
        enabled: true,
        fallbackStrategies: {
          'test-service': DegradationStrategies.cacheFirst(3600),
        },
        healthChecks: {},
        monitoring: {
          enabled: false,
          alertThresholds: { errorRate: 10, responseTime: 5000, availability: 95 },
        },
      })

      expect(manager).toBeDefined()
    })
  })

  describe('Advanced Error Handler', () => {
    test('should create error handler middleware', () => {
      const handler = createAdvancedErrorHandler({
        development: true,
        logErrors: false,
      })

      expect(typeof handler.middleware).toBe('function')
      expect(typeof handler.getStats).toBe('function')
      expect(typeof handler.cleanup).toBe('function')
    })

    test('should handle RouterException', async () => {
      const handler = createAdvancedErrorHandler({
        development: true,
        logErrors: false,
      })

      const mockReq = {
        method: 'GET',
        url: 'http://test.com/api',
        requestId: 'req-123',
        context: {},
      } as any

      const mockNext = () => {
        throw ErrorFactory.validation('Invalid input')
      }

      const response = await handler.middleware(mockReq, mockNext)
      expect(response.status).toBe(400)
    })
  })

  describe('Circuit Breaker Presets', () => {
    test('should create critical preset', () => {
      const config = CircuitBreakerPresets.critical('critical-service')

      expect(config.name).toBe('critical-service')
      expect(config.failureThreshold).toBe(3)
      expect(config.timeout).toBe(5000)
    })

    test('should create database preset', () => {
      const config = CircuitBreakerPresets.database('db-service')

      expect(config.name).toBe('db-service')
      expect(config.timeout).toBe(10000)
      expect(config.shouldTripOnError).toBeDefined()
    })
  })
})
