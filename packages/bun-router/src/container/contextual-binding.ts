/**
 * Contextual Binding for Different Environments
 *
 * Advanced contextual binding system supporting environment-specific configurations,
 * conditional service resolution, and dynamic binding based on runtime context
 */

import type { Binding, ResolutionContext, BindingMetadata } from './container'
import { Container } from './container'

// Contextual binding interfaces
export interface ContextualBinding<T = any> extends Binding<T> {
  conditions: BindingCondition[]
  priority: number
  fallback?: Binding<T>
}

export interface BindingCondition {
  type: 'environment' | 'custom' | 'tag' | 'parent' | 'request'
  predicate: (context: ResolutionContext) => boolean
  description?: string
}

export interface EnvironmentConfig {
  name: string
  variables: Record<string, any>
  services: Record<string, any>
  features: string[]
}

export interface ContextualBindingBuilder<T> {
  when(condition: BindingCondition): ContextualBindingBuilder<T>
  whenEnvironment(...environments: string[]): ContextualBindingBuilder<T>
  whenTag(tag: string): ContextualBindingBuilder<T>
  whenParent(parentToken: string | symbol | Function): ContextualBindingBuilder<T>
  whenRequest(predicate: (context: ResolutionContext) => boolean): ContextualBindingBuilder<T>
  withPriority(priority: number): ContextualBindingBuilder<T>
  withFallback(fallback: Binding<T>): ContextualBindingBuilder<T>
  build(): Container
}

/**
 * Environment manager for handling different deployment contexts
 */
export class EnvironmentManager {
  private environments = new Map<string, EnvironmentConfig>()
  private currentEnvironment: string
  private variables = new Map<string, any>()

  constructor(defaultEnvironment: string = 'development') {
    this.currentEnvironment = process.env.NODE_ENV || defaultEnvironment
    this.loadEnvironmentVariables()
  }

  /**
   * Register an environment configuration
   */
  register(config: EnvironmentConfig): this {
    this.environments.set(config.name, config)
    return this
  }

  /**
   * Set current environment
   */
  setEnvironment(name: string): this {
    if (!this.environments.has(name)) {
      throw new Error(`Environment ${name} is not registered`)
    }
    this.currentEnvironment = name
    this.loadEnvironmentVariables()
    return this
  }

  /**
   * Get current environment
   */
  getCurrentEnvironment(): string {
    return this.currentEnvironment
  }

  /**
   * Get environment configuration
   */
  getEnvironment(name?: string): EnvironmentConfig | undefined {
    return this.environments.get(name || this.currentEnvironment)
  }

  /**
   * Check if environment is active
   */
  is(...environments: string[]): boolean {
    return environments.includes(this.currentEnvironment)
  }

  /**
   * Get environment variable
   */
  get(key: string, defaultValue?: any): any {
    return this.variables.get(key) ?? defaultValue
  }

  /**
   * Set environment variable
   */
  set(key: string, value: any): this {
    this.variables.set(key, value)
    return this
  }

  /**
   * Check if feature is enabled
   */
  hasFeature(feature: string): boolean {
    const env = this.getEnvironment()
    return env?.features.includes(feature) ?? false
  }

  /**
   * Load environment variables
   */
  private loadEnvironmentVariables(): void {
    const env = this.getEnvironment()
    if (env) {
      for (const [key, value] of Object.entries(env.variables)) {
        this.variables.set(key, value)
      }
    }

    // Load from process.env
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        this.variables.set(key, value)
      }
    }
  }
}

/**
 * Contextual binding builder implementation
 */
export class DefaultContextualBindingBuilder<T> implements ContextualBindingBuilder<T> {
  private binding: Partial<ContextualBinding<T>>

  constructor(
    private container: ContextualContainer,
    token: string | symbol | Function
  ) {
    this.binding = {
      token,
      conditions: [],
      priority: 0,
      metadata: {
        scope: 'transient'
      }
    }
  }

  /**
   * Add custom condition
   */
  when(condition: BindingCondition): ContextualBindingBuilder<T> {
    this.binding.conditions!.push(condition)
    return this
  }

  /**
   * Add environment condition
   */
  whenEnvironment(...environments: string[]): ContextualBindingBuilder<T> {
    const condition: BindingCondition = {
      type: 'environment',
      predicate: (context) => environments.includes(context.environment || 'development'),
      description: `Environment is one of: ${environments.join(', ')}`
    }
    return this.when(condition)
  }

  /**
   * Add tag condition
   */
  whenTag(tag: string): ContextualBindingBuilder<T> {
    const condition: BindingCondition = {
      type: 'tag',
      predicate: (context) => {
        // Check if the requesting context has the specified tag
        return context.parent?.token?.toString().includes(tag) ?? false
      },
      description: `Parent has tag: ${tag}`
    }
    return this.when(condition)
  }

  /**
   * Add parent condition
   */
  whenParent(parentToken: string | symbol | Function): ContextualBindingBuilder<T> {
    const condition: BindingCondition = {
      type: 'parent',
      predicate: (context) => context.parent?.token === parentToken,
      description: `Parent token is: ${parentToken.toString()}`
    }
    return this.when(condition)
  }

  /**
   * Add request condition
   */
  whenRequest(predicate: (context: ResolutionContext) => boolean): ContextualBindingBuilder<T> {
    const condition: BindingCondition = {
      type: 'request',
      predicate,
      description: 'Custom request condition'
    }
    return this.when(condition)
  }

  /**
   * Set priority
   */
  withPriority(priority: number): ContextualBindingBuilder<T> {
    this.binding.priority = priority
    return this
  }

  /**
   * Set fallback binding
   */
  withFallback(fallback: Binding<T>): ContextualBindingBuilder<T> {
    this.binding.fallback = fallback
    return this
  }

  /**
   * Set implementation
   */
  to(implementation: new (...args: any[]) => T): this {
    this.binding.implementation = implementation
    return this
  }

  /**
   * Set value
   */
  toValue(value: T): this {
    this.binding.value = value
    this.binding.metadata!.scope = 'singleton'
    return this
  }

  /**
   * Set factory
   */
  toFactory(factory: (...args: any[]) => T): this {
    this.binding.factory = factory
    return this
  }

  /**
   * Set singleton scope
   */
  inSingletonScope(): this {
    this.binding.metadata!.scope = 'singleton'
    return this
  }

  /**
   * Set transient scope
   */
  inTransientScope(): this {
    this.binding.metadata!.scope = 'transient'
    return this
  }

  /**
   * Build and register binding
   */
  build(): Container {
    this.container.registerContextualBinding(this.binding as ContextualBinding<T>)
    return this.container
  }
}

/**
 * Enhanced container with contextual binding support
 */
export class ContextualContainer extends Container {
  private contextualBindings = new Map<string | symbol | Function, ContextualBinding[]>()
  private environmentManager: EnvironmentManager

  constructor(options?: any) {
    super(options)
    this.environmentManager = new EnvironmentManager()
  }

  /**
   * Create contextual binding
   */
  bindContextual<T>(token: string | symbol | Function): ContextualBindingBuilder<T> {
    return new DefaultContextualBindingBuilder<T>(this, token)
  }

  /**
   * Register contextual binding
   */
  registerContextualBinding<T>(binding: ContextualBinding<T>): this {
    if (!this.contextualBindings.has(binding.token)) {
      this.contextualBindings.set(binding.token, [])
    }

    const bindings = this.contextualBindings.get(binding.token)!
    bindings.push(binding)

    // Sort by priority (higher first)
    bindings.sort((a, b) => b.priority - a.priority)

    return this
  }

  /**
   * Get environment manager
   */
  getEnvironmentManager(): EnvironmentManager {
    return this.environmentManager
  }

  /**
   * Environment-specific binding helpers
   */
  forDevelopment<T>(token: string | symbol | Function): ContextualBindingBuilder<T> {
    return this.bindContextual<T>(token).whenEnvironment('development')
  }

  forProduction<T>(token: string | symbol | Function): ContextualBindingBuilder<T> {
    return this.bindContextual<T>(token).whenEnvironment('production')
  }

  forTesting<T>(token: string | symbol | Function): ContextualBindingBuilder<T> {
    return this.bindContextual<T>(token).whenEnvironment('test', 'testing')
  }

  forStaging<T>(token: string | symbol | Function): ContextualBindingBuilder<T> {
    return this.bindContextual<T>(token).whenEnvironment('staging')
  }

  /**
   * Override resolve to handle contextual bindings
   */
  resolve<T>(token: string | symbol | Function, context?: Partial<ResolutionContext>): T {
    const resolutionContext: ResolutionContext = {
      container: this,
      token,
      environment: context?.environment || this.environmentManager.getCurrentEnvironment(),
      requestId: context?.requestId || this.generateRequestId(),
      depth: context?.depth || 0,
      resolving: context?.resolving || new Set(),
      parent: context?.parent
    }

    // Try contextual bindings first
    const contextualBinding = this.findContextualBinding(token, resolutionContext)
    if (contextualBinding) {
      return this.createInstanceFromContextualBinding<T>(contextualBinding, resolutionContext)
    }

    // Fall back to regular resolution
    return super.resolve<T>(token, resolutionContext)
  }

  /**
   * Find matching contextual binding
   */
  private findContextualBinding(
    token: string | symbol | Function,
    context: ResolutionContext
  ): ContextualBinding | undefined {
    const bindings = this.contextualBindings.get(token)
    if (!bindings) return undefined

    for (const binding of bindings) {
      if (this.evaluateConditions(binding.conditions, context)) {
        return binding
      }
    }

    return undefined
  }

  /**
   * Evaluate binding conditions
   */
  private evaluateConditions(conditions: BindingCondition[], context: ResolutionContext): boolean {
    return conditions.every(condition => {
      try {
        return condition.predicate(context)
      } catch (error) {
        console.warn(`Error evaluating binding condition: ${condition.description}`, error)
        return false
      }
    })
  }

  /**
   * Create instance from contextual binding
   */
  private createInstanceFromContextualBinding<T>(
    binding: ContextualBinding<T>,
    context: ResolutionContext
  ): T {
    try {
      return this.createInstance<T>(binding, context)
    } catch (error) {
      if (binding.fallback) {
        console.warn(`Contextual binding failed, using fallback for ${binding.token.toString()}`)
        return this.createInstance<T>(binding.fallback, context)
      }
      throw error
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * Pre-configured environment setups
 */
export class EnvironmentPresets {
  /**
   * Development environment
   */
  static development(): EnvironmentConfig {
    return {
      name: 'development',
      variables: {
        DEBUG: true,
        LOG_LEVEL: 'debug',
        CACHE_TTL: 60,
        DB_POOL_SIZE: 5
      },
      services: {
        logger: 'ConsoleLogger',
        cache: 'MemoryCache',
        database: 'SQLiteDatabase'
      },
      features: ['hot-reload', 'debug-toolbar', 'detailed-errors']
    }
  }

  /**
   * Production environment
   */
  static production(): EnvironmentConfig {
    return {
      name: 'production',
      variables: {
        DEBUG: false,
        LOG_LEVEL: 'error',
        CACHE_TTL: 3600,
        DB_POOL_SIZE: 20
      },
      services: {
        logger: 'FileLogger',
        cache: 'RedisCache',
        database: 'PostgreSQLDatabase'
      },
      features: ['performance-monitoring', 'error-tracking']
    }
  }

  /**
   * Testing environment
   */
  static testing(): EnvironmentConfig {
    return {
      name: 'test',
      variables: {
        DEBUG: false,
        LOG_LEVEL: 'warn',
        CACHE_TTL: 1,
        DB_POOL_SIZE: 1
      },
      services: {
        logger: 'NullLogger',
        cache: 'MemoryCache',
        database: 'InMemoryDatabase'
      },
      features: ['test-doubles', 'fast-teardown']
    }
  }

  /**
   * Staging environment
   */
  static staging(): EnvironmentConfig {
    return {
      name: 'staging',
      variables: {
        DEBUG: true,
        LOG_LEVEL: 'info',
        CACHE_TTL: 1800,
        DB_POOL_SIZE: 10
      },
      services: {
        logger: 'FileLogger',
        cache: 'RedisCache',
        database: 'PostgreSQLDatabase'
      },
      features: ['performance-monitoring', 'debug-toolbar']
    }
  }
}

/**
 * Contextual binding conditions factory
 */
export class BindingConditions {
  /**
   * Environment condition
   */
  static environment(...environments: string[]): BindingCondition {
    return {
      type: 'environment',
      predicate: (context) => environments.includes(context.environment || 'development'),
      description: `Environment is one of: ${environments.join(', ')}`
    }
  }

  /**
   * Feature flag condition
   */
  static feature(featureName: string): BindingCondition {
    return {
      type: 'custom',
      predicate: (context) => {
        const container = context.container as ContextualContainer
        return container.getEnvironmentManager().hasFeature(featureName)
      },
      description: `Feature ${featureName} is enabled`
    }
  }

  /**
   * Environment variable condition
   */
  static envVar(key: string, value: any): BindingCondition {
    return {
      type: 'custom',
      predicate: (context) => {
        const container = context.container as ContextualContainer
        return container.getEnvironmentManager().get(key) === value
      },
      description: `Environment variable ${key} equals ${value}`
    }
  }

  /**
   * Request ID pattern condition
   */
  static requestPattern(pattern: RegExp): BindingCondition {
    return {
      type: 'request',
      predicate: (context) => pattern.test(context.requestId || ''),
      description: `Request ID matches pattern: ${pattern.toString()}`
    }
  }

  /**
   * Time-based condition
   */
  static timeRange(startHour: number, endHour: number): BindingCondition {
    return {
      type: 'custom',
      predicate: () => {
        const hour = new Date().getHours()
        return hour >= startHour && hour <= endHour
      },
      description: `Time is between ${startHour}:00 and ${endHour}:00`
    }
  }

  /**
   * Custom predicate condition
   */
  static custom(
    predicate: (context: ResolutionContext) => boolean,
    description?: string
  ): BindingCondition {
    return {
      type: 'custom',
      predicate,
      description: description || 'Custom condition'
    }
  }
}

export { ContextualContainer as DIContainer }
