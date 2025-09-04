/**
 * Observability & Monitoring - Complete Example
 * 
 * Demonstrates all observability features in a real-world API scenario
 */

import { 
  setupProductionObservability,
  initializeObservability,
  getMetricsRegistry,
  getHealthManager,
  CorrelationHelpers,
  TraceHelpers,
  DependencyChecks,
  ObservabilityPresets
} from '../packages/bun-router/src/observability'
import type { EnhancedRequest } from '../packages/bun-router/src/types'

/**
 * Example 1: Quick Setup with Presets
 */
function quickSetupExample() {
  console.log('=== Quick Setup Example ===')
  
  // Development setup - full logging and tracing
  const devObservability = setupProductionObservability()
  
  // Get the middleware and endpoints
  const middleware = devObservability.createMiddleware()
  const endpoints = devObservability.createRouteHandlers()
  
  console.log('Available endpoints:', Object.keys(endpoints))
  // Output: ['/metrics', '/health', '/health/ready', '/health/live', '/health/startup', '/trace', '/correlation/stats']
}

/**
 * Example 2: Custom Configuration
 */
function customConfigurationExample() {
  console.log('=== Custom Configuration Example ===')
  
  const observability = initializeObservability({
    enableTracing: true,
    enableMetrics: true,
    enableHealthChecks: true,
    enableCorrelation: true,
    
    tracing: {
      serviceName: 'ecommerce-api',
      environment: 'production',
      enableConsoleExporter: false,
      enableOTLPExporter: true,
      otlpEndpoint: 'http://jaeger:4317',
      sampleRate: 0.2, // 20% sampling
      attributes: {
        'service.team': 'platform',
        'service.version': '2.1.0'
      }
    },
    
    metrics: {
      prefix: 'ecommerce',
      enableDefaultMetrics: true,
      collectInterval: 15000,
      labels: {
        environment: 'production',
        datacenter: 'us-east-1'
      }
    },
    
    healthChecks: {
      timeout: 10000,
      gracePeriod: 30000,
      dependencies: [
        DependencyChecks.database('postgres', {
          critical: true,
          timeout: 5000
        }),
        DependencyChecks.redis('cache', {
          critical: false,
          timeout: 2000
        }),
        DependencyChecks.httpService('payment-gateway', 'https://api.stripe.com/v1/charges', {
          critical: true,
          timeout: 8000
        }),
        DependencyChecks.fileSystem('uploads', '/app/uploads', {
          critical: false
        })
      ],
      customChecks: [
        {
          name: 'queue-health',
          critical: false,
          timeout: 3000,
          check: async () => {
            // Simulate queue health check
            const queueSize = Math.floor(Math.random() * 100)
            
            if (queueSize > 80) {
              return {
                status: 'degraded',
                message: `Queue size is high: ${queueSize}`,
                timestamp: Date.now(),
                metadata: { queueSize, threshold: 80 }
              }
            }
            
            return {
              status: 'healthy',
              message: `Queue size normal: ${queueSize}`,
              timestamp: Date.now(),
              metadata: { queueSize }
            }
          }
        }
      ]
    },
    
    correlation: {
      headerName: 'x-correlation-id',
      propagateHeaders: [
        'x-correlation-id',
        'x-request-id',
        'x-user-id',
        'x-session-id',
        'x-tenant-id'
      ],
      enableLogging: false // Disabled in production
    },
    
    endpoints: {
      metrics: '/observability/metrics',
      health: '/observability/health',
      ready: '/observability/ready',
      live: '/observability/live',
      trace: '/observability/trace'
    }
  })
  
  console.log('Observability initialized with custom config')
  console.log('Status:', observability.getStatus())
}

/**
 * Example 3: E-commerce API with Full Observability
 */
class EcommerceAPI {
  private observability: any
  private metrics: any
  
  constructor() {
    // Initialize observability
    this.observability = initializeObservability(ObservabilityPresets.microservices())
    
    // Get metrics registry for custom metrics
    this.metrics = getMetricsRegistry()
    
    // Setup custom business metrics
    this.setupCustomMetrics()
    
    // Setup custom health checks
    this.setupCustomHealthChecks()
  }
  
  private setupCustomMetrics() {
    // Business metrics
    this.metrics.createCounter('orders_total', 'Total orders processed', { service: 'ecommerce' })
    this.metrics.createCounter('orders_failed_total', 'Total failed orders', { service: 'ecommerce' })
    this.metrics.createGauge('inventory_items', 'Current inventory count', { service: 'ecommerce' })
    this.metrics.createHistogram(
      'order_value_dollars', 
      'Order value distribution',
      [10, 50, 100, 250, 500, 1000, 2500],
      { service: 'ecommerce' }
    )
    this.metrics.createSummary(
      'payment_processing_seconds',
      'Payment processing time',
      [0.5, 0.9, 0.95, 0.99],
      300000, // 5 minute window
      { service: 'ecommerce' }
    )
  }
  
  private setupCustomHealthChecks() {
    const healthManager = getHealthManager()
    
    if (healthManager) {
      // Add inventory service check
      healthManager.addDependency({
        name: 'inventory-service',
        type: 'custom',
        critical: true,
        timeout: 5000,
        check: async () => {
          try {
            const response = await fetch('http://inventory-service/health')
            
            if (response.ok) {
              const data = await response.json()
              return {
                status: 'healthy',
                message: 'Inventory service is healthy',
                timestamp: Date.now(),
                metadata: data
              }
            } else {
              return {
                status: 'unhealthy',
                message: `Inventory service returned ${response.status}`,
                timestamp: Date.now()
              }
            }
          } catch (error) {
            return {
              status: 'unhealthy',
              message: 'Cannot reach inventory service',
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            }
          }
        }
      })
      
      // Add payment processor check
      healthManager.addCustomCheck({
        name: 'payment-processor',
        critical: true,
        timeout: 8000,
        check: async () => {
          // Simulate payment processor health check
          const isHealthy = Math.random() > 0.1 // 90% healthy
          
          return {
            status: isHealthy ? 'healthy' : 'degraded',
            message: isHealthy ? 'Payment processor operational' : 'Payment processor experiencing issues',
            timestamp: Date.now(),
            metadata: {
              processor: 'stripe',
              region: 'us-east-1'
            }
          }
        }
      })
    }
  }
  
  /**
   * Create order endpoint with full observability
   */
  async createOrder(req: EnhancedRequest): Promise<Response> {
    const correlationId = CorrelationHelpers.getId(req)
    const httpClient = CorrelationHelpers.getHttpClient(req)
    
    // Add correlation metadata
    CorrelationHelpers.addMetadata(req, {
      operation: 'create-order',
      endpoint: '/api/orders'
    })
    
    // Start custom span for order processing
    const orderSpan = TraceHelpers.startSpan(req, 'process-order')
    
    try {
      const orderData = await req.json()
      
      // Add tracing tags
      TraceHelpers.addTags(req, {
        'order.id': orderData.id,
        'order.items': orderData.items?.length || 0,
        'order.value': orderData.total,
        'customer.id': orderData.customerId
      })
      
      // Validate inventory (with tracing)
      const inventorySpan = TraceHelpers.startSpan(req, 'validate-inventory')
      let inventoryValid = false
      
      try {
        const inventoryResponse = await httpClient.post('http://inventory-service/validate', {
          body: JSON.stringify({ items: orderData.items })
        })
        
        inventoryValid = inventoryResponse.ok
        
        TraceHelpers.addTags(req, {
          'inventory.valid': inventoryValid,
          'inventory.response_time': Date.now() - (inventorySpan?.startTime || 0)
        })
      } finally {
        if (inventorySpan) TraceHelpers.finishSpan(req, inventorySpan)
      }
      
      if (!inventoryValid) {
        // Record failed order metric
        this.metrics.get('orders_failed_total')?.inc(1, {
          reason: 'insufficient_inventory',
          customer_id: orderData.customerId
        })
        
        TraceHelpers.log(req, {
          level: 'warn',
          message: 'Order failed due to insufficient inventory',
          orderId: orderData.id
        })
        
        return new Response(JSON.stringify({
          error: 'Insufficient inventory'
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // Process payment (with tracing)
      const paymentSpan = TraceHelpers.startSpan(req, 'process-payment')
      let paymentResult: any
      
      try {
        const paymentStart = Date.now()
        
        const paymentResponse = await httpClient.post('http://payment-service/charge', {
          body: JSON.stringify({
            amount: orderData.total,
            currency: 'USD',
            source: orderData.paymentToken
          })
        })
        
        const paymentDuration = (Date.now() - paymentStart) / 1000
        
        // Record payment processing time
        this.metrics.get('payment_processing_seconds')?.observe(paymentDuration)
        
        paymentResult = await paymentResponse.json()
        
        TraceHelpers.addTags(req, {
          'payment.success': paymentResponse.ok,
          'payment.processor': 'stripe',
          'payment.duration': paymentDuration
        })
        
        if (!paymentResponse.ok) {
          throw new Error(`Payment failed: ${paymentResult.error}`)
        }
      } finally {
        if (paymentSpan) TraceHelpers.finishSpan(req, paymentSpan)
      }
      
      // Create order record
      const order = {
        id: orderData.id,
        customerId: orderData.customerId,
        items: orderData.items,
        total: orderData.total,
        paymentId: paymentResult.id,
        status: 'confirmed',
        createdAt: new Date().toISOString()
      }
      
      // Update metrics
      this.metrics.get('orders_total')?.inc(1, {
        customer_type: orderData.customerType || 'regular'
      })
      
      this.metrics.get('order_value_dollars')?.observe(orderData.total, {
        customer_type: orderData.customerType || 'regular'
      })
      
      // Update inventory count (simulate)
      const currentInventory = this.metrics.get('inventory_items')?.getValue() || 1000
      this.metrics.get('inventory_items')?.set(currentInventory - orderData.items.length)
      
      // Log successful order
      TraceHelpers.log(req, {
        level: 'info',
        message: 'Order created successfully',
        orderId: order.id,
        customerId: order.customerId,
        total: order.total
      })
      
      return new Response(JSON.stringify(order), {
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          'X-Order-ID': order.id
        }
      })
      
    } catch (error) {
      // Record failed order metric
      this.metrics.get('orders_failed_total')?.inc(1, {
        reason: 'processing_error'
      })
      
      // Log error with tracing
      TraceHelpers.log(req, {
        level: 'error',
        message: 'Order processing failed',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      
      return new Response(JSON.stringify({
        error: 'Order processing failed',
        correlationId
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
      
    } finally {
      if (orderSpan) TraceHelpers.finishSpan(req, orderSpan)
    }
  }
  
  /**
   * Get order status with correlation tracking
   */
  async getOrderStatus(req: EnhancedRequest): Promise<Response> {
    const orderId = req.params?.id
    
    // Add correlation metadata
    CorrelationHelpers.addMetadata(req, {
      operation: 'get-order-status',
      orderId
    })
    
    // Start span for database query
    const dbSpan = TraceHelpers.startSpan(req, 'database-query')
    
    try {
      TraceHelpers.addTags(req, {
        'db.operation': 'select',
        'db.table': 'orders',
        'order.id': orderId
      })
      
      // Simulate database query
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const order = {
        id: orderId,
        status: 'confirmed',
        total: 99.99,
        createdAt: '2024-01-01T00:00:00Z'
      }
      
      TraceHelpers.log(req, {
        message: 'Order retrieved successfully',
        orderId
      })
      
      return new Response(JSON.stringify(order), {
        headers: { 'Content-Type': 'application/json' }
      })
      
    } catch (error) {
      TraceHelpers.log(req, {
        level: 'error',
        message: 'Failed to retrieve order',
        orderId,
        error: error instanceof Error ? error.message : String(error)
      })
      
      return new Response(JSON.stringify({
        error: 'Order not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
      
    } finally {
      if (dbSpan) TraceHelpers.finishSpan(req, dbSpan)
    }
  }
  
  /**
   * Get middleware for the API
   */
  getMiddleware() {
    return this.observability.createMiddleware()
  }
  
  /**
   * Get observability endpoints
   */
  getObservabilityEndpoints() {
    return this.observability.createRouteHandlers()
  }
}

/**
 * Example 4: Microservices Communication
 */
async function microservicesExample() {
  console.log('=== Microservices Communication Example ===')
  
  // Service A calls Service B with correlation
  const serviceA = async (req: EnhancedRequest) => {
    const httpClient = CorrelationHelpers.getHttpClient(req)
    
    // Create child context for service call
    const childContext = CorrelationHelpers.createChild(req, 'service-b')
    
    if (childContext) {
      console.log('Created child context:', childContext.correlationId)
      console.log('Parent context:', childContext.parentId)
    }
    
    // Call downstream service - correlation automatically propagated
    const response = await httpClient.post('http://service-b/process', {
      body: JSON.stringify({ data: 'from-service-a' })
    })
    
    return response
  }
  
  // Service B processes request with inherited correlation
  const serviceB = async (req: EnhancedRequest) => {
    const correlationId = CorrelationHelpers.getId(req)
    const context = CorrelationHelpers.getContext(req)
    
    console.log('Service B received correlation:', correlationId)
    console.log('Parent service:', context?.metadata.parentService)
    
    // Add service-specific metadata
    CorrelationHelpers.addMetadata(req, {
      serviceName: 'service-b',
      operation: 'process-data'
    })
    
    return new Response(JSON.stringify({ 
      processed: true,
      correlationId 
    }))
  }
  
  console.log('Microservices communication setup complete')
}

/**
 * Example 5: Performance Monitoring
 */
function performanceMonitoringExample() {
  console.log('=== Performance Monitoring Example ===')
  
  const registry = getMetricsRegistry()
  
  if (registry) {
    // Create performance metrics
    const responseTimeHistogram = registry.createHistogram(
      'api_response_time_seconds',
      'API response time distribution',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
    )
    
    const throughputCounter = registry.createCounter(
      'api_requests_per_second',
      'API requests per second'
    )
    
    const errorRateCounter = registry.createCounter(
      'api_errors_total',
      'Total API errors'
    )
    
    const activeConnectionsGauge = registry.createGauge(
      'api_active_connections',
      'Active API connections'
    )
    
    // Simulate some metrics
    for (let i = 0; i < 100; i++) {
      responseTimeHistogram.observe(Math.random() * 2)
      throughputCounter.inc()
      
      if (Math.random() < 0.05) { // 5% error rate
        errorRateCounter.inc(1, { error_type: 'timeout' })
      }
    }
    
    activeConnectionsGauge.set(42)
    
    console.log('Performance metrics recorded')
    console.log('Prometheus format available at /metrics')
  }
}

/**
 * Example 6: Health Check Scenarios
 */
async function healthCheckScenariosExample() {
  console.log('=== Health Check Scenarios Example ===')
  
  const healthManager = getHealthManager()
  
  if (healthManager) {
    // Add various dependency types
    healthManager.addDependency(
      DependencyChecks.httpService('api-gateway', 'http://api-gateway/health')
    )
    
    healthManager.addDependency(
      DependencyChecks.database('primary-db', { critical: true })
    )
    
    healthManager.addDependency(
      DependencyChecks.redis('session-store', { critical: false })
    )
    
    // Add custom business logic check
    healthManager.addCustomCheck({
      name: 'business-rules',
      critical: false,
      check: async () => {
        // Simulate business rule validation
        const rulesValid = Math.random() > 0.2 // 80% success rate
        
        return {
          status: rulesValid ? 'healthy' : 'degraded',
          message: rulesValid ? 'Business rules validated' : 'Some business rules failing',
          timestamp: Date.now(),
          metadata: {
            rulesChecked: 15,
            rulesPassed: rulesValid ? 15 : 12
          }
        }
      }
    })
    
    // Perform health check
    const health = await healthManager.checkHealth()
    
    console.log('Health check result:')
    console.log('Overall status:', health.status)
    console.log('Dependencies:', Object.keys(health.dependencies))
    console.log('Custom checks:', Object.keys(health.checks))
    console.log('Summary:', health.summary)
  }
}

/**
 * Main example runner
 */
async function runExamples() {
  console.log('🔍 Observability & Monitoring Examples\n')
  
  try {
    // Run all examples
    quickSetupExample()
    console.log()
    
    customConfigurationExample()
    console.log()
    
    // Create E-commerce API instance
    const api = new EcommerceAPI()
    console.log('E-commerce API with observability initialized')
    console.log()
    
    await microservicesExample()
    console.log()
    
    performanceMonitoringExample()
    console.log()
    
    await healthCheckScenariosExample()
    console.log()
    
    console.log('✅ All observability examples completed successfully!')
    
    // Show available endpoints
    const endpoints = api.getObservabilityEndpoints()
    console.log('\n📊 Available Observability Endpoints:')
    Object.keys(endpoints).forEach(endpoint => {
      console.log(`  ${endpoint}`)
    })
    
  } catch (error) {
    console.error('❌ Example failed:', error)
  }
}

// Export for use in other files
export {
  EcommerceAPI,
  runExamples,
  quickSetupExample,
  customConfigurationExample,
  microservicesExample,
  performanceMonitoringExample,
  healthCheckScenariosExample
}

// Run examples if this file is executed directly
if (import.meta.main) {
  runExamples()
}
