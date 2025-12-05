/**
 * IoC Container for Dependency Resolution
 *
 * Comprehensive dependency injection container with automatic resolution,
 * lifecycle management, and contextual binding support
 */

import { CircularDependencyException } from '../errors/router-errors'

// Extend Reflect with metadata methods
declare global {
  // eslint-disable-next-line ts/no-namespace
  namespace Reflect {
    function getMetadata(metadataKey: any, target: any, propertyKey?: string | symbol): any
    function defineMetadata(metadataKey: any, metadataValue: any, target: any, propertyKey?: string | symbol): void
  }
}

// Container binding types
export type BindingScope = 'singleton' | 'transient' | 'scoped' | 'request'

// Token can be a string, symbol, function, constructor, or generic Function
// eslint-disable-next-line ts/no-unsafe-function-type
export type Token = string | symbol | ((...args: any[]) => any) | (new (...args: any[]) => any) | Function

export interface BindingMetadata {
  scope: BindingScope
  tags?: string[]
  when?: (context: ResolutionContext) => boolean
  factory?: (...args: any[]) => any
  dependencies?: Token[]
  lazy?: boolean
  decorators?: ((...args: any[]) => any)[]
}

export interface Binding<T = any> {
  token: Token
  implementation?: new (...args: any[]) => T
  instance?: T
  factory?: (...args: any[]) => T
  value?: T
  metadata: BindingMetadata
}

export interface ResolutionContext {
  container: Container
  token: Token
  parent?: ResolutionContext
  environment?: string
  requestId?: string
  depth: number
  resolving: Set<Token>
}

export interface ContainerOptions {
  autoRegister?: boolean
  strictMode?: boolean
  maxDepth?: number
  enableDecorators?: boolean
  enableInterception?: boolean
  defaultScope?: BindingScope
}

// Dependency injection decorators
export const INJECTABLE_METADATA_KEY: unique symbol = Symbol('injectable')
export const INJECT_METADATA_KEY: unique symbol = Symbol('inject')
export const OPTIONAL_METADATA_KEY: unique symbol = Symbol('optional')
export const TAGGED_METADATA_KEY: unique symbol = Symbol('tagged')

// Decorator metadata
export interface InjectableMetadata {
  token?: string | symbol
  scope?: BindingScope
  tags?: string[]
}

export interface InjectMetadata {
  token: Token
  optional?: boolean
  tags?: string[]
  when?: (context: ResolutionContext) => boolean
}

/**
 * Main IoC Container implementation
 */
export class Container {
  private bindings = new Map<Token, Binding>()
  private instances = new Map<Token, any>()
  private scopedInstances = new Map<string, Map<Token, any>>()
  private interceptors = new Map<Token, ((...args: any[]) => any)[]>()
  private parent?: Container
  private children = new Set<Container>()
  private options: Required<ContainerOptions>

  constructor(options: ContainerOptions = {}) {
    this.options = {
      autoRegister: options.autoRegister ?? true,
      strictMode: options.strictMode ?? false,
      maxDepth: options.maxDepth ?? 50,
      enableDecorators: options.enableDecorators ?? true,
      enableInterception: options.enableInterception ?? false,
      defaultScope: options.defaultScope ?? 'transient',
    }
  }

  /**
   * Bind a token to an implementation
   */
  bind<T>(token: Token): BindingBuilder<T> {
    return new BindingBuilder<T>(this, token)
  }

  /**
   * Register a binding
   */
  register<T>(binding: Binding<T>): this {
    this.bindings.set(binding.token, binding)
    return this
  }

  /**
   * Bind a singleton
   */
  singleton<T>(
    token: Token,
    implementation: new (...args: any[]) => T,
  ): Container {
    return this.bind<T>(token).to(implementation).inSingletonScope().build()
  }

  /**
   * Bind a transient
   */
  transient<T>(
    token: Token,
    implementation: new (...args: any[]) => T,
  ): Container {
    return this.bind<T>(token).to(implementation).inTransientScope().build()
  }

  /**
   * Bind a value
   */
  value<T>(token: Token, value: T): Container {
    return this.bind<T>(token).toValue(value).build()
  }

  /**
   * Bind a factory
   */
  factory<T>(
    token: Token,
    factory: (...args: any[]) => T,
  ): Container {
    return this.bind<T>(token).toFactory(factory).build()
  }

  /**
   * Resolve a dependency
   */
  resolve<T>(token: Token, context?: Partial<ResolutionContext>): T {
    const resolutionContext: ResolutionContext = {
      container: this,
      token,
      environment: context?.environment || 'development',
      requestId: context?.requestId || this.generateRequestId(),
      depth: context?.depth || 0,
      resolving: context?.resolving || new Set(),
      parent: context?.parent,
    }

    return this.resolveInternal<T>(token, resolutionContext)
  }

  /**
   * Resolve all instances of a token (useful for arrays of services)
   */
  resolveAll<T>(token: Token): T[] {
    const bindings = Array.from(this.bindings.values()).filter(
      binding => binding.token === token || this.hasTag(binding, token as string),
    )

    return bindings.map(binding => this.resolve<T>(binding.token))
  }

  /**
   * Resolve with tags
   */
  resolveTagged<T>(tag: string): T[] {
    const bindings = Array.from(this.bindings.values()).filter(
      binding => this.hasTag(binding, tag),
    )

    return bindings.map(binding => this.resolve<T>(binding.token))
  }

  /**
   * Get all bindings with a specific tag
   */
  getTaggedBindings<T>(tag: string): Binding<T>[] {
    return Array.from(this.bindings.values()).filter(
      (binding): binding is Binding<T> => binding.metadata?.tags?.includes(tag) ?? false,
    )
  }

  /**
   * Add interceptor for a service
   */
  addInterceptor<T>(token: Token, interceptor: (service: T) => T): void {
    const key = this.tokenToString(token)
    if (!this.interceptors.has(key)) {
      this.interceptors.set(key, [])
    }
    this.interceptors.get(key)!.push(interceptor as (service: any) => any)
  }

  /**
   * Register controller (basic implementation for compatibility)
   */
  registerController(controller: new (...args: any[]) => any): void {
    // Basic implementation - just register as singleton
    this.singleton(controller, controller)
  }

  /**
   * Get controller instance
   */
  getController<T>(controller: new (...args: any[]) => T): T {
    return this.resolve<T>(controller)
  }

  /**
   * Check if a token is bound
   */
  isBound(token: Token): boolean {
    return this.bindings.has(token) || (this.parent?.isBound(token) ?? false)
  }

  /**
   * Unbind a token
   */
  unbind(token: Token): this {
    this.bindings.delete(token)
    this.instances.delete(token)
    return this
  }

  /**
   * Create a child container
   */
  createChild(options?: ContainerOptions): Container {
    const child = new Container({ ...this.options, ...options })
    child.parent = this
    this.children.add(child)
    return child
  }

  /**
   * Create a scoped container
   */
  createScope(scopeId: string): Container {
    const scope = this.createChild()
    scope.scopedInstances.set(scopeId, new Map())
    return scope
  }

  /**
   * Get all bindings
   */
  getBindings(): Map<Token, Binding> {
    return new Map(this.bindings)
  }

  /**
   * Clear all bindings and instances
   */
  clear(): this {
    this.bindings.clear()
    this.instances.clear()
    this.scopedInstances.clear()
    return this
  }

  /**
   * Add interceptor
   */
  intercept<T>(
    token: string | symbol | ((...args: any[]) => any),
    interceptor: (instance: T, context: ResolutionContext) => T,
  ): this {
    if (!this.interceptors.has(token)) {
      this.interceptors.set(token, [])
    }
    this.interceptors.get(token)!.push(interceptor)
    return this
  }

  /**
   * Internal resolution logic
   */
  private resolveInternal<T>(token: Token, context: ResolutionContext): T {
    // Check for circular dependencies
    if (context.resolving.has(token)) {
      // Build the dependency chain for better error message
      const chain = Array.from(context.resolving).map(t => this.tokenToString(t))
      chain.push(this.tokenToString(token))
      throw new CircularDependencyException(chain)
    }

    // Check depth limit
    if (context.depth > this.options.maxDepth) {
      const chain = Array.from(context.resolving).map(t => this.tokenToString(t))
      throw new Error(
        `Maximum resolution depth exceeded (${this.options.maxDepth}).\n`
        + `This usually indicates a circular or very deep dependency chain.\n`
        + `Current resolution chain:\n${chain.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`,
      )
    }

    context.resolving.add(token)
    context.depth++

    try {
      // Try to resolve from current container
      const binding = this.bindings.get(token)

      if (binding) {
        // Check contextual conditions
        if (binding.metadata.when && !binding.metadata.when(context)) {
          throw new Error(`Contextual binding condition not met for: ${this.tokenToString(token)}`)
        }

        return this.createInstance<T>(binding, context)
      }

      // Try parent container
      if (this.parent) {
        // Create a fresh context for parent resolution to avoid false circular dependency detection
        const parentContext: ResolutionContext = {
          resolving: new Set(),
          depth: 0,
          container: this.parent,
          token,
        }
        return this.parent.resolveInternal<T>(token, parentContext)
      }

      // Auto-registration attempt
      if (this.options.autoRegister && typeof token === 'function') {
        return this.autoRegisterAndResolve<T>(token as new (...args: any[]) => T, context)
      }

      // Strict mode check
      if (this.options.strictMode) {
        throw new Error(`No binding found for: ${this.tokenToString(token)}`)
      }

      // Try to create instance directly
      if (typeof token === 'function') {
        return this.createInstanceFromConstructor<T>(token as new (...args: any[]) => T, context)
      }

      throw new Error(`Cannot resolve: ${this.tokenToString(token)}`)
    }
    finally {
      context.resolving.delete(token)
      context.depth--
    }
  }

  /**
   * Create instance from binding
   */
  protected createInstance<T>(binding: Binding<T>, context: ResolutionContext): T {
    let instance: T

    // Check for existing singleton
    if (binding.metadata.scope === 'singleton' && this.instances.has(binding.token)) {
      instance = this.instances.get(binding.token)
    }
    // Check for scoped instance
    else if (binding.metadata.scope === 'scoped' && context.requestId) {
      const scopedMap = this.scopedInstances.get(context.requestId)
      if (scopedMap?.has(binding.token)) {
        instance = scopedMap.get(binding.token)
      }
      else {
        instance = this.createNewInstance<T>(binding, context)
        if (!scopedMap) {
          this.scopedInstances.set(context.requestId, new Map())
        }
        this.scopedInstances.get(context.requestId)!.set(binding.token, instance)
      }
    }
    // Create new instance
    else {
      instance = this.createNewInstance<T>(binding, context)

      // Store singleton
      if (binding.metadata.scope === 'singleton') {
        this.instances.set(binding.token, instance)
      }
    }

    // Apply interceptors
    const tokenKey = this.tokenToString(binding.token)
    if (this.interceptors.has(tokenKey)) {
      const interceptors = this.interceptors.get(tokenKey)!
      for (const interceptor of interceptors) {
        instance = interceptor(instance)
      }
    }

    return instance
  }

  /**
   * Create new instance from binding
   */
  private createNewInstance<T>(binding: Binding<T>, context: ResolutionContext): T {
    if (binding.value !== undefined) {
      return binding.value
    }

    if (binding.factory) {
      const dependencies = this.resolveDependencies(binding.metadata.dependencies || [], context)
      return binding.factory(...dependencies)
    }

    if (binding.instance) {
      return binding.instance
    }

    if (binding.implementation) {
      return this.createInstanceFromConstructor<T>(binding.implementation, context)
    }

    throw new Error(`Invalid binding configuration for: ${this.tokenToString(binding.token)}`)
  }

  /**
   * Create instance from constructor
   */
  private createInstanceFromConstructor<T>(
    constructor: new (...args: any[]) => T,
    context: ResolutionContext,
  ): T {
    const dependencies = this.getConstructorDependencies(constructor)
    const resolvedDependencies = this.resolveDependencies(dependencies, context)

    const instance = new constructor(...resolvedDependencies)

    // Apply decorators if enabled
    if (this.options.enableDecorators) {
      this.applyDecorators(instance, constructor)
    }

    return instance
  }

  /**
   * Get constructor dependencies using reflection
   */
  private getConstructorDependencies(constructor: ((...args: any[]) => any) | (new (...args: any[]) => any)): Token[] {
    // Check for explicit metadata
    let injectMetadata = Reflect.getMetadata?.(INJECT_METADATA_KEY, constructor) as InjectMetadata[]
      || (constructor as any)[INJECT_METADATA_KEY] as InjectMetadata[]

    // If not found on the constructor itself, check the constructor property
    // For classes, the metadata might be stored on the constructor property
    if (!injectMetadata && (constructor as any).constructor) {
      injectMetadata = (constructor as any).constructor[INJECT_METADATA_KEY] as InjectMetadata[]
    }

    // Also check if this is a class and the metadata is on the class itself
    if (!injectMetadata && typeof constructor === 'function' && constructor.prototype) {
      // This is a class constructor, check if metadata is stored on the class
      const classMetadata = (constructor as any)[INJECT_METADATA_KEY] as InjectMetadata[]
      if (classMetadata) {
        injectMetadata = classMetadata
      }
    }

    // Final check: if this is a class, look for metadata on the class itself
    if (!injectMetadata && typeof constructor === 'function') {
      const directMetadata = (constructor as any)[INJECT_METADATA_KEY] as InjectMetadata[]
      if (directMetadata) {
        injectMetadata = directMetadata
      }
    }

    if (injectMetadata) {
      return injectMetadata.map(meta => meta.token)
    }

    // Try to get parameter types from TypeScript metadata
    const paramTypes = Reflect.getMetadata?.('design:paramtypes', constructor) as Token[]
    if (paramTypes) {
      return paramTypes
    }

    // Fallback to parsing constructor string (less reliable)
    return this.parseConstructorDependencies(constructor)
  }

  /**
   * Parse constructor dependencies from function string
   */
  private parseConstructorDependencies(constructor: ((...args: any[]) => any) | (new (...args: any[]) => any)): string[] {
    const constructorString = constructor.toString()
    const match = constructorString.match(/constructor\s*\(([^)]*)\)/)

    if (!match || !match[1]) {
      return []
    }

    return match[1]
      .split(',')
      .map(param => param.trim().split(':')[0].trim())
      .filter(param => param.length > 0)
  }

  /**
   * Resolve array of dependencies
   */
  private resolveDependencies(
    dependencies: Token[],
    context: ResolutionContext,
  ): any[] {
    return dependencies.map(dep => this.resolveInternal(dep, context))
  }

  /**
   * Auto-register and resolve
   */
  private autoRegisterAndResolve<T>(
    constructor: new (...args: any[]) => T,
    context: ResolutionContext,
  ): T {
    // Check for injectable metadata
    const metadata = Reflect.getMetadata?.(INJECTABLE_METADATA_KEY, constructor) as InjectableMetadata

    const binding: Binding<T> = {
      token: constructor,
      implementation: constructor,
      metadata: {
        scope: metadata?.scope || this.options.defaultScope,
        tags: metadata?.tags,
      },
    }

    this.register(binding)
    return this.resolveInternal<T>(constructor, context)
  }

  /**
   * Apply decorators to instance
   */
  private applyDecorators(instance: any, constructor: ((...args: any[]) => any) | (new (...args: any[]) => any)): void {
    const decorators = Reflect.getMetadata?.('decorators', constructor) as ((...args: any[]) => any)[]
    if (decorators) {
      for (const decorator of decorators) {
        decorator(instance)
      }
    }
  }

  /**
   * Check if binding has tag
   */
  private hasTag(binding: Binding, tag: string): boolean {
    return binding.metadata.tags?.includes(tag) ?? false
  }

  /**
   * Convert token to string for error messages
   */
  private tokenToString(token: Token): string {
    if (typeof token === 'string')
      return token
    if (typeof token === 'symbol')
      return token.toString()
    if (typeof token === 'function')
      return token.name || 'anonymous'
    return 'unknown'
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * Fluent binding builder
 */
export class BindingBuilder<T> {
  private binding: Partial<Binding<T>>

  constructor(private container: Container, token: Token) {
    this.binding = {
      token,
      metadata: {
        scope: 'transient',
      },
    }
  }

  /**
   * Bind to implementation
   */
  to(implementation: new (...args: any[]) => T): this {
    this.binding.implementation = implementation
    return this
  }

  /**
   * Bind to value
   */
  toValue(value: T): this {
    this.binding.value = value
    this.binding.metadata!.scope = 'singleton'
    return this
  }

  /**
   * Bind to factory
   */
  toFactory(factory: (...args: any[]) => T): this {
    this.binding.factory = factory
    return this
  }

  /**
   * Bind to existing instance
   */
  toInstance(instance: T): this {
    this.binding.instance = instance
    this.binding.metadata!.scope = 'singleton'
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
   * Set scoped scope
   */
  inScopedScope(): this {
    this.binding.metadata!.scope = 'scoped'
    return this
  }

  /**
   * Set request scope
   */
  inRequestScope(): this {
    this.binding.metadata!.scope = 'request'
    return this
  }

  /**
   * Add tags
   */
  withTags(...tags: string[]): this {
    this.binding.metadata!.tags = [...(this.binding.metadata!.tags || []), ...tags]
    return this
  }

  /**
   * Add contextual condition
   */
  when(condition: (context: ResolutionContext) => boolean): this {
    this.binding.metadata!.when = condition
    return this
  }

  /**
   * Set as lazy
   */
  lazy(): this {
    this.binding.metadata!.lazy = true
    return this
  }

  /**
   * Build and register binding
   */
  build(): Container {
    this.container.register(this.binding as Binding<T>)
    return this.container
  }
}

/**
 * Global container instance
 */
let globalContainer: Container | null = null

/**
 * Get or create global container
 */
export function getContainer(): Container {
  if (!globalContainer) {
    globalContainer = new Container()
  }
  return globalContainer
}

/**
 * Set global container
 */
export function setContainer(container: Container): void {
  globalContainer = container
}

/**
 * Create new container
 */
export function createContainer(options?: ContainerOptions): Container {
  return new Container(options)
}

export { Container as DIContainer }
