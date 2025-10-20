/**
 * Advanced Error Handling Example
 * 
 * Demonstrates comprehensive error handling with all features:
 * - Exception hierarchy
 * - Error reporting
 * - Circuit breakers
 * - Graceful degradation
 */

import { Router } from '../packages/bun-router/src'
import {
  createAdvancedErrorHandler,
  ErrorHandlerPresets,
  ErrorFactory,
  CircuitBreakerHttpClient,
  createCircuitBreaker,
  CircuitBreakerPresets,
  withCircuitBreaker,
  globalCircuitBreakerRegistry
} from '../packages/bun-router/src/errors'

// Initialize router
const router = new Router()

// Configure advanced error handling
const errorHandler = createAdvancedErrorHandler(
  ErrorHandlerPresets.resilient({
    sentryDsn: process.env.SENTRY_DSN,
    services: ['database', 'payment-api', 'user-service']
  })
)

// Add error handler middleware
router.use(errorHandler)

// Create circuit breaker protected HTTP client
const httpClient = new CircuitBreakerHttpClient()

// Register circuit breakers
const paymentBreaker = createCircuitBreaker(
  CircuitBreakerPresets.externalApi('payment-service')
)

const dbBreaker = createCircuitBreaker(
  CircuitBreakerPresets.database('postgres')
)

// Simulated database
const users = new Map([
  ['1', { id: '1', name: 'John Doe', email: 'john@example.com' }],
  ['2', { id: '2', name: 'Jane Smith', email: 'jane@example.com' }]
])

// Routes with comprehensive error handling

// User routes with validation
router.get('/users/:id', async (req) => {
  const { id } = req.params
  
  // Validate input
  if (!id || !/^\d+$/.test(id)) {
    throw ErrorFactory.validation('Invalid user ID', {
      id: ['Must be a positive integer']
    })
  }
  
  // Database operation with circuit breaker
  const user = await withCircuitBreaker('postgres', {
    execute: async () => {
      // Simulate database query
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const user = users.get(id)
      if (!user) {
        throw ErrorFactory.notFound('User', id)
      }
      
      return user
    },
    fallback: async () => {
      // Return cached or simplified user data
      return {
        id,
        name: 'User (cached)',
        email: 'cached@example.com',
        cached: true
      }
    },
    context: {
      requestId: req.requestId,
      operation: 'getUserById',
      userId: id
    }
  })
  
  return Response.json(user)
})

// Payment processing with external service
router.post('/payments', async (req) => {
  const body = await req.json()
  
  // Validate payment data
  if (!body.amount || body.amount <= 0) {
    throw ErrorFactory.validation('Invalid payment amount', {
      amount: ['Must be greater than 0']
    })
  }
  
  if (!body.userId) {
    throw ErrorFactory.validation('User ID required', {
      userId: ['Required field']
    })
  }
  
  // Check if user exists
  const user = users.get(body.userId)
  if (!user) {
    throw ErrorFactory.notFound('User', body.userId)
  }
  
  // Process payment with circuit breaker protection
  try {
    const paymentResult = await httpClient.fetch('https://payment-api.example.com/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: body.amount,
        userId: body.userId,
        currency: body.currency || 'USD'
      }),
      circuitBreaker: 'payment-service',
      fallback: async () => {
        // Queue payment for later processing
        return new Response(JSON.stringify({
          id: `queued-${Date.now()}`,
          status: 'queued',
          message: 'Payment queued for processing',
          amount: body.amount,
          userId: body.userId
        }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        })
      },
      context: {
        requestId: req.requestId,
        userId: body.userId,
        amount: body.amount
      }
    })
    
    return paymentResult
  } catch (error) {
    if (error.code === 'CIRCUIT_BREAKER_OPEN') {
      throw ErrorFactory.serviceUnavailable(
        'Payment service temporarily unavailable',
        60 // retry after 60 seconds
      )
    }
    throw error
  }
})

// Business logic example
router.post('/users/:id/upgrade', async (req) => {
  const { id } = req.params
  const body = await req.json()
  
  const user = users.get(id)
  if (!user) {
    throw ErrorFactory.notFound('User', id)
  }
  
  // Business logic validation
  if (body.plan === 'premium' && !body.paymentMethod) {
    throw ErrorFactory.businessLogic(
      'Payment method required for premium plan',
      'premium_requires_payment'
    )
  }
  
  // Simulate upgrade process
  const upgraded = { ...user, plan: body.plan }
  users.set(id, upgraded)
  
  return Response.json(upgraded)
})

// Authentication example
router.get('/profile', async (req) => {
  const authHeader = req.headers.get('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ErrorFactory.authentication('Bearer token required')
  }
  
  const token = authHeader.slice(7)
  
  // Simulate token validation
  if (token !== 'valid-token') {
    throw ErrorFactory.authentication('Invalid or expired token')
  }
  
  // Simulate getting user from token
  const user = users.get('1')
  return Response.json(user)
})

// Rate limiting example
router.get('/limited', async (req) => {
  // Simulate rate limit check
  const clientId = req.ip || 'unknown'
  const now = Date.now()
  
  // Simple in-memory rate limiting (use Redis in production)
  const rateLimitKey = `rate_limit:${clientId}`
  const requests = (global as any)[rateLimitKey] || []
  
  // Clean old requests (last minute)
  const recentRequests = requests.filter((time: number) => now - time < 60000)
  
  if (recentRequests.length >= 10) {
    throw ErrorFactory.rateLimit(60, 10, 10 - recentRequests.length)
  }
  
  // Add current request
  recentRequests.push(now)
  ;(global as any)[rateLimitKey] = recentRequests
  
  return Response.json({ message: 'Success', remaining: 10 - recentRequests.length })
})

// Health check endpoint
router.get('/health', async (req) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: globalCircuitBreakerRegistry.getAllMetrics(),
    uptime: process.uptime()
  }
  
  // Check if any critical services are down
  const criticalServices = ['postgres', 'payment-service']
  const unhealthyServices = criticalServices.filter(service => {
    const metrics = globalCircuitBreakerRegistry.get(service)?.getMetrics()
    return metrics?.state === 'OPEN'
  })
  
  if (unhealthyServices.length > 0) {
    health.status = 'degraded'
    return Response.json(health, { status: 503 })
  }
  
  return Response.json(health)
})

// Error simulation endpoints for testing
router.get('/simulate/validation-error', async () => {
  throw ErrorFactory.validation('Simulated validation error', {
    field1: ['Error message 1'],
    field2: ['Error message 2']
  })
})

router.get('/simulate/timeout', async () => {
  throw ErrorFactory.timeout(5000, 'Simulated timeout error')
})

router.get('/simulate/database-error', async () => {
  throw ErrorFactory.database(
    'Connection timeout',
    'SELECT',
    'SELECT * FROM users WHERE id = ?',
    new Error('Connection refused')
  )
})

router.get('/simulate/external-service-error', async () => {
  throw ErrorFactory.externalService(
    'Payment gateway unavailable',
    'payment-gateway',
    'https://payment.api.com/charge',
    502
  )
})

// Start server
const server = Bun.serve({
  port: 3000,
  fetch: router.fetch.bind(router)
})

console.log(`🚀 Server running on http://localhost:${server.port}`)

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...')
  
  // Close error reporting
  const stats = errorHandler.getStats()
  if (stats.errorReporting) {
    await errorHandler.cleanup()
  }
  
  server.stop()
  process.exit(0)
})

// Example usage and testing
async function runExamples() {
  console.log('\n🧪 Running error handling examples...\n')
  
  const baseUrl = 'http://localhost:3000'
  
  try {
    // Test successful request
    console.log('✅ Testing successful request...')
    const response1 = await fetch(`${baseUrl}/users/1`)
    console.log('Response:', await response1.json())
    
    // Test validation error
    console.log('\n❌ Testing validation error...')
    const response2 = await fetch(`${baseUrl}/users/invalid`)
    console.log('Status:', response2.status)
    console.log('Error:', await response2.json())
    
    // Test not found error
    console.log('\n❌ Testing not found error...')
    const response3 = await fetch(`${baseUrl}/users/999`)
    console.log('Status:', response3.status)
    console.log('Error:', await response3.json())
    
    // Test authentication error
    console.log('\n❌ Testing authentication error...')
    const response4 = await fetch(`${baseUrl}/profile`)
    console.log('Status:', response4.status)
    console.log('Error:', await response4.json())
    
    // Test rate limiting
    console.log('\n⚡ Testing rate limiting...')
    for (let i = 0; i < 12; i++) {
      const response = await fetch(`${baseUrl}/limited`)
      if (response.status === 429) {
        console.log('Rate limited after', i + 1, 'requests')
        console.log('Error:', await response.json())
        break
      }
    }
    
    // Test health check
    console.log('\n💚 Testing health check...')
    const healthResponse = await fetch(`${baseUrl}/health`)
    console.log('Health:', await healthResponse.json())
    
  } catch (error) {
    console.error('Example error:', error)
  }
}

// Run examples after a short delay to let server start
setTimeout(runExamples, 1000)
