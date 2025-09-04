/**
 * Observability & Monitoring - Main Exports
 *
 * Enterprise-grade observability features for distributed systems
 */

// Request Correlation
export {
  type CorrelationConfig,
  type CorrelationContext,
  CorrelationEndpoints,
  CorrelationHelpers,
  CorrelationManager,
  createCorrelationMiddleware,
  getCorrelationManager,
  initializeCorrelation,
  type ServiceCall,
} from './correlation'

// Health Checks
export {
  type CustomHealthCheck,
  DependencyChecks,
  type DependencyConfig,
  getHealthManager,
  type HealthCheckConfig,
  HealthCheckManager,
  type HealthCheckResult,
  HealthEndpoints,
  type HealthStatus,
  initializeHealthChecks,
} from './health-checks'

// Integration Layer
export {
  getObservabilityManager,
  initializeObservability,
  type ObservabilityConfig,
  ObservabilityIntegration,
  ObservabilityManager,
  ObservabilityPresets,
  ObservabilityUtils,
} from './integration'

// Metrics Collection
export {
  Counter,
  createMetricsHandler,
  createMetricsMiddleware,
  Gauge,
  getMetricsRegistry,
  Histogram,
  type HistogramBucket,
  initializeMetrics,
  type MetricConfig,
  type MetricLabels,
  MetricsRegistry,
  Summary,
  type SummaryQuantile,
} from './metrics'

// Distributed Tracing
export {
  createTracingMiddleware,
  DistributedTracer,
  getTracer,
  initializeTracer,
  type Span,
  type SpanContext,
  type TraceConfig,
  type TraceData,
  TraceHelpers,
} from './tracing'

/**
 * Quick setup functions for common use cases
 */

/**
 * Initialize observability with development preset
 */
export function setupDevelopmentObservability(): import('./integration').ObservabilityManager {
  const { initializeObservability: init, ObservabilityPresets } = require('./integration')
  return init(ObservabilityPresets.development())
}

/**
 * Initialize observability with production preset
 */
export function setupProductionObservability(): import('./integration').ObservabilityManager {
  const { initializeObservability: init, ObservabilityPresets } = require('./integration')
  return init(ObservabilityPresets.production())
}

/**
 * Initialize observability with Kubernetes preset
 */
export function setupKubernetesObservability(): import('./integration').ObservabilityManager {
  const { initializeObservability: init, ObservabilityPresets } = require('./integration')
  return init(ObservabilityPresets.kubernetes())
}

/**
 * Initialize observability with microservices preset
 */
export function setupMicroservicesObservability(): import('./integration').ObservabilityManager {
  const { initializeObservability: init, ObservabilityPresets } = require('./integration')
  return init(ObservabilityPresets.microservices())
}

/**
 * Initialize observability from environment variables
 */
export function setupObservabilityFromEnv(): import('./integration').ObservabilityManager {
  const { initializeObservability: init, ObservabilityUtils } = require('./integration')
  return init(ObservabilityUtils.fromEnvironment())
}

/**
 * Create a complete observability middleware stack
 */
export function createObservabilityStack(config?: import('./integration').ObservabilityConfig): {
  middleware: (req: import('../types').EnhancedRequest, next: () => Promise<Response>) => Promise<Response>
  endpoints: Record<string, (req: import('../types').EnhancedRequest) => Promise<Response>>
  manager: import('./integration').ObservabilityManager
} {
  const { initializeObservability: init } = require('./integration')
  const manager = init(config)
  return {
    middleware: manager.createMiddleware(),
    endpoints: manager.createRouteHandlers(),
    manager,
  }
}

/**
 * Default export for convenience
 */
const observabilityDefault = {
  // Setup functions
  setupDevelopmentObservability,
  setupProductionObservability,
  setupKubernetesObservability,
  setupMicroservicesObservability,
  setupObservabilityFromEnv,
  createObservabilityStack,

  // Core managers - use dynamic imports to avoid circular dependencies
  get initializeObservability() {
    return require('./integration').initializeObservability
  },
  get getObservabilityManager() {
    return require('./integration').getObservabilityManager
  },

  // Presets and utilities
  get ObservabilityPresets() {
    return require('./integration').ObservabilityPresets
  },
  get ObservabilityIntegration() {
    return require('./integration').ObservabilityIntegration
  },
  get ObservabilityUtils() {
    return require('./integration').ObservabilityUtils
  },
}

export default observabilityDefault
