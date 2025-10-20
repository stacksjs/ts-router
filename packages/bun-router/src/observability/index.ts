/**
 * Observability & Monitoring - Main Exports
 *
 * Enterprise-grade observability features for distributed systems
 */

import type { EnhancedRequest } from '../types'
import type { ObservabilityConfig, ObservabilityManager } from './integration'

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
export async function setupDevelopmentObservability(): Promise<ObservabilityManager> {
  const { initializeObservability: init, ObservabilityPresets } = await import('./integration')
  return init(ObservabilityPresets.development())
}

/**
 * Initialize observability with production preset
 */
export async function setupProductionObservability(): Promise<ObservabilityManager> {
  const { initializeObservability: init, ObservabilityPresets } = await import('./integration')
  return init(ObservabilityPresets.production())
}

/**
 * Initialize observability with Kubernetes preset
 */
export async function setupKubernetesObservability(): Promise<ObservabilityManager> {
  const { initializeObservability: init, ObservabilityPresets } = await import('./integration')
  return init(ObservabilityPresets.kubernetes())
}

/**
 * Initialize observability with microservices preset
 */
export async function setupMicroservicesObservability(): Promise<ObservabilityManager> {
  const { initializeObservability: init, ObservabilityPresets } = await import('./integration')
  return init(ObservabilityPresets.microservices())
}

/**
 * Initialize observability from environment variables
 */
export async function setupObservabilityFromEnv(): Promise<ObservabilityManager> {
  const { initializeObservability: init, ObservabilityUtils } = await import('./integration')
  return init(ObservabilityUtils.fromEnvironment())
}

/**
 * Create a complete observability middleware stack
 */
export async function createObservabilityStack(config?: ObservabilityConfig): Promise<{
  middleware: (req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>
  endpoints: Record<string, (req: EnhancedRequest) => Promise<Response>>
  manager: ObservabilityManager
}> {
  const { initializeObservability: init } = await import('./integration')
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
const observabilityDefault: {
  setupDevelopmentObservability: typeof setupDevelopmentObservability
  setupProductionObservability: typeof setupProductionObservability
  setupKubernetesObservability: typeof setupKubernetesObservability
  setupMicroservicesObservability: typeof setupMicroservicesObservability
  setupObservabilityFromEnv: typeof setupObservabilityFromEnv
  createObservabilityStack: typeof createObservabilityStack
  initializeObservability: Promise<any>
  getObservabilityManager: Promise<any>
  ObservabilityPresets: Promise<any>
  ObservabilityIntegration: Promise<any>
  ObservabilityUtils: Promise<any>
} = {
  // Setup functions
  setupDevelopmentObservability,
  setupProductionObservability,
  setupKubernetesObservability,
  setupMicroservicesObservability,
  setupObservabilityFromEnv,
  createObservabilityStack,

  // Core managers - use dynamic imports to avoid circular dependencies
  get initializeObservability(): Promise<any> {
    return import('./integration').then(m => m.initializeObservability)
  },
  get getObservabilityManager(): Promise<any> {
    return import('./integration').then(m => m.getObservabilityManager)
  },

  // Presets and utilities
  get ObservabilityPresets(): Promise<any> {
    return import('./integration').then(m => m.ObservabilityPresets)
  },
  get ObservabilityIntegration(): Promise<any> {
    return import('./integration').then(m => m.ObservabilityIntegration)
  },
  get ObservabilityUtils(): Promise<any> {
    return import('./integration').then(m => m.ObservabilityUtils)
  },
}

export default observabilityDefault
