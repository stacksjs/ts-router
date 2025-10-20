/* eslint-disable ts/no-unsafe-function-type */
/**
 * Service Providers for Bootstrapping
 *
 * Service provider system for registering services, managing lifecycle,
 * and bootstrapping application components with dependency injection
 */

import type { Container, ResolutionContext } from './container'

// Service provider interfaces
export interface ServiceProvider {
  /**
   * Register services in the container
   */
  register: (container: Container) => void | Promise<void>

  /**
   * Boot services after all providers are registered
   */
  boot?: (container: Container) => void | Promise<void>

  /**
   * Shutdown services gracefully
   */
  shutdown?: (container: Container) => void | Promise<void>

  /**
   * Provider metadata
   */
  readonly name: string
  readonly version?: string
  readonly dependencies?: string[]
  readonly environment?: string[]
  readonly priority?: number
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export interface DeferredServiceProvider extends ServiceProvider {
  /**
   * Services that should trigger loading of this provider
   */
  provides: () => (string | symbol | Function)[]

  /**
   * Check if provider should be loaded
   */
  isDeferred: () => boolean
}

export interface ConditionalServiceProvider extends ServiceProvider {
  /**
   * Check if provider should be loaded based on environment
   */
  shouldLoad: (container: Container) => boolean | Promise<boolean>
}

// Service provider manager
export interface ServiceProviderManager {
  register: (provider: ServiceProvider) => this
  boot: () => Promise<void>
  shutdown: () => Promise<void>
  getProvider: (name: string) => ServiceProvider | undefined
  getProviders: () => ServiceProvider[]
}

/**
 * Base service provider implementation
 */
export abstract class BaseServiceProvider implements ServiceProvider {
  abstract readonly name: string
  readonly version?: string
  readonly dependencies?: string[]
  readonly environment?: string[]
  readonly priority: number = 0

  abstract register(container: Container): void | Promise<void>

  boot?(_container: Container): void | Promise<void> {
    // Default implementation - override if needed
  }

  shutdown?(_container: Container): void | Promise<void> {
    // Default implementation - override if needed
  }

  /**
   * Helper method to bind singleton
   */
  protected singleton<T>(
    container: Container,
    token: string | symbol | Function,
    implementation: new (...args: any[]) => T,
  ): void {
    container.singleton(token, implementation)
  }

  /**
   * Helper method to bind transient
   */
  protected transient<T>(
    container: Container,
    token: string | symbol | Function,
    implementation: new (...args: any[]) => T,
  ): void {
    container.transient(token, implementation)
  }

  /**
   * Helper method to bind value
   */
  protected value<T>(
    container: Container,
    token: string | symbol | Function,
    value: T,
  ): void {
    container.value(token, value)
  }

  /**
   * Helper method to bind factory
   */
  protected factory<T>(
    container: Container,
    token: string | symbol | Function,
    factory: (...args: any[]) => T,
  ): void {
    container.factory(token, factory)
  }

  /**
   * Helper method for conditional binding
   */
  protected when(
    container: Container,
    condition: (context: ResolutionContext) => boolean,
  ) {
    return {
      bind: <T>(token: string | symbol | Function) => {
        return container.bind<T>(token).when(condition)
      },
    }
  }

  /**
   * Helper method for environment-specific binding
   */
  protected forEnvironment(container: Container, ...environments: string[]) {
    return this.when(container, context =>
      environments.includes(context.environment || 'development'))
  }
}

/**
 * Deferred service provider base class
 */
// eslint-disable-next-line ts/no-unsafe-declaration-merging
export abstract class DeferredServiceProvider extends BaseServiceProvider implements DeferredServiceProvider {
  abstract provides(): (string | symbol | Function)[]

  isDeferred(): boolean {
    return true
  }
}

/**
 * Service provider manager implementation
 */
export class DefaultServiceProviderManager implements ServiceProviderManager {
  private providers = new Map<string, ServiceProvider>()
  private deferredProviders = new Map<string, DeferredServiceProvider>()
  private loadedProviders = new Set<string>()
  private bootedProviders = new Set<string>()
  private container: Container

  constructor(container: Container) {
    this.container = container
  }

  /**
   * Register a service provider
   */
  register(provider: ServiceProvider): this {
    // Check if provider should be loaded
    if (this.isConditionalProvider(provider)) {
      const shouldLoad = provider.shouldLoad(this.container)
      if (shouldLoad instanceof Promise) {
        shouldLoad.then((load) => {
          if (load) {
            this.doRegister(provider)
          }
        })
      }
      else if (!shouldLoad) {
        return this
      }
    }

    this.doRegister(provider)
    return this
  }

  /**
   * Boot all registered providers
   */
  async boot(): Promise<void> {
    // Sort providers by priority (higher priority first)
    const providers = Array.from(this.providers.values())
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))

    // Check dependencies
    this.validateDependencies(providers)

    // Register all providers first
    for (const provider of providers) {
      if (!this.loadedProviders.has(provider.name)) {
        await this.loadProvider(provider)
      }
    }

    // Boot all providers
    for (const provider of providers) {
      if (!this.bootedProviders.has(provider.name)) {
        await this.bootProvider(provider)
      }
    }
  }

  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    const providers = Array.from(this.providers.values())
      .reverse() // Shutdown in reverse order

    for (const provider of providers) {
      if (provider.shutdown) {
        try {
          await provider.shutdown(this.container)
        }
        catch (error) {
          console.error(`Error shutting down provider ${provider.name}:`, error)
        }
      }
    }

    this.providers.clear()
    this.deferredProviders.clear()
    this.loadedProviders.clear()
    this.bootedProviders.clear()
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): ServiceProvider | undefined {
    return this.providers.get(name)
  }

  /**
   * Get all providers
   */
  getProviders(): ServiceProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Load deferred provider when needed
   */
  async loadDeferredProvider(token: string | symbol | Function): Promise<void> {
    for (const [name, provider] of this.deferredProviders) {
      if (provider.provides().includes(token) && !this.loadedProviders.has(name)) {
        await this.loadProvider(provider)
        await this.bootProvider(provider)
        this.deferredProviders.delete(name)
      }
    }
  }

  /**
   * Internal registration logic
   */
  private doRegister(provider: ServiceProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Provider ${provider.name} is already registered`)
    }

    this.providers.set(provider.name, provider)

    // Handle deferred providers
    if (this.isDeferredProvider(provider)) {
      this.deferredProviders.set(provider.name, provider)
    }
  }

  /**
   * Load a provider
   */
  private async loadProvider(provider: ServiceProvider): Promise<void> {
    try {
      await provider.register(this.container)
      this.loadedProviders.add(provider.name)
    }
    catch (error) {
      throw new Error(`Failed to load provider ${provider.name}: ${error}`)
    }
  }

  /**
   * Boot a provider
   */
  private async bootProvider(provider: ServiceProvider): Promise<void> {
    if (provider.boot) {
      try {
        await provider.boot(this.container)
        this.bootedProviders.add(provider.name)
      }
      catch (error) {
        throw new Error(`Failed to boot provider ${provider.name}: ${error}`)
      }
    }
    else {
      this.bootedProviders.add(provider.name)
    }
  }

  /**
   * Validate provider dependencies
   */
  private validateDependencies(providers: ServiceProvider[]): void {
    const providerNames = new Set(providers.map(p => p.name))

    for (const provider of providers) {
      if (provider.dependencies) {
        for (const dependency of provider.dependencies) {
          if (!providerNames.has(dependency)) {
            throw new Error(
              `Provider ${provider.name} depends on ${dependency}, but it's not registered`,
            )
          }
        }
      }
    }
  }

  /**
   * Check if provider is deferred
   */
  private isDeferredProvider(provider: ServiceProvider): provider is DeferredServiceProvider {
    return 'provides' in provider && 'isDeferred' in provider
  }

  /**
   * Check if provider is conditional
   */
  private isConditionalProvider(provider: ServiceProvider): provider is ConditionalServiceProvider {
    return 'shouldLoad' in provider
  }
}

/**
 * Common service providers
 */

/**
 * Configuration service provider
 */
export class ConfigServiceProvider extends BaseServiceProvider {
  readonly name = 'config'
  readonly priority = 100

  register(container: Container): void {
    // Register configuration service
    container.singleton('config', ConfigService)

    // Register environment-specific configs
    this.forEnvironment(container, 'development').bind('config.debug').toValue(true)
    this.forEnvironment(container, 'production').bind('config.debug').toValue(false)
    this.forEnvironment(container, 'test').bind('config.debug').toValue(false)
  }
}

/**
 * Logging service provider
 */
export class LoggingServiceProvider extends BaseServiceProvider {
  readonly name = 'logging'
  readonly priority = 90

  register(container: Container): void {
    // Register logger factory
    container.factory('logger', (config: ConfigService) => {
      return new Logger(config.get('logging', {}))
    })

    // Register console logger for development
    this.forEnvironment(container, 'development')
      .bind('logger')
      .toFactory(() => new ConsoleLogger())

    // Register file logger for production
    this.forEnvironment(container, 'production')
      .bind('logger')
      .toFactory((config: ConfigService) =>
        new FileLogger(config.get('logging.file', './app.log')),
      )
  }
}

/**
 * Database service provider
 */
export class DatabaseServiceProvider extends BaseServiceProvider {
  readonly name = 'database'
  readonly dependencies = ['config', 'logging']

  register(container: Container): void {
    // Register database connection
    container.singleton('database', DatabaseConnection)

    // Register repositories
    container.transient('userRepository', UserRepository)
    container.transient('postRepository', PostRepository)
  }

  async boot(container: Container): Promise<void> {
    // Initialize database connection
    const db = container.resolve<DatabaseConnection>('database')
    await db.connect()
  }

  async shutdown(container: Container): Promise<void> {
    // Close database connection
    const db = container.resolve<DatabaseConnection>('database')
    await db.disconnect()
  }
}

/**
 * Cache service provider
 */
export class CacheServiceProvider extends BaseServiceProvider {
  readonly name = 'cache'
  readonly dependencies = ['config']

  register(container: Container): void {
    // Register cache manager
    container.singleton('cache', CacheManager)

    // Environment-specific cache implementations
    this.forEnvironment(container, 'development')
      .bind('cache.store')
      .toFactory(() => new MemoryCache())

    this.forEnvironment(container, 'production')
      .bind('cache.store')
      .toFactory((config: ConfigService) =>
        new RedisCache(config.get('cache.redis')),
      )
  }
}

/**
 * Authentication service provider
 */
export class AuthServiceProvider extends BaseServiceProvider {
  readonly name = 'auth'
  readonly dependencies = ['config', 'database']

  register(container: Container): void {
    // Register auth services
    container.singleton('authService', AuthService)
    container.singleton('jwtService', JwtService)
    container.transient('authGuard', AuthGuard)
  }
}

/**
 * Validation service provider
 */
export class ValidationServiceProvider extends BaseServiceProvider {
  readonly name = 'validation'

  register(container: Container): void {
    // Register validation services
    container.singleton('validator', Validator)
    container.factory('validationPipe', () => new ValidationPipe())
  }
}

/**
 * Event service provider (deferred)
 */
export class EventServiceProvider extends DeferredServiceProvider {
  readonly name = 'events'

  provides(): (string | symbol | Function)[] {
    return ['eventBus', 'eventDispatcher', EventBus, EventDispatcher]
  }

  register(container: Container): void {
    container.singleton('eventBus', EventBus)
    container.singleton('eventDispatcher', EventDispatcher)
  }
}

// Mock service classes for demonstration
class ConfigService {
  get(key: string, defaultValue?: any): any {
    return defaultValue
  }
}

class Logger {
  constructor(private config: any) {}
  log(message: string): void { console.log(message) }
}

class ConsoleLogger extends Logger {
  constructor() { super({}) }
}

class FileLogger extends Logger {
  constructor(private filePath: string) { super({}) }
}

class DatabaseConnection {
  async connect(): Promise<void> { /* implementation */ }
  async disconnect(): Promise<void> { /* implementation */ }
}

class UserRepository {
  constructor(private db: DatabaseConnection) {}
}

class PostRepository {
  constructor(private db: DatabaseConnection) {}
}

class CacheManager {
  constructor(private store: any) {}
}

class MemoryCache {
  private cache = new Map()
}

class RedisCache {
  constructor(private config: any) {}
}

class AuthService {
  constructor(private jwt: JwtService, private userRepo: UserRepository) {}
}

class JwtService {
  constructor(private config: ConfigService) {}
}

class AuthGuard {
  constructor(private auth: AuthService) {}
}

class Validator {
  validate(_data: any, _rules: any): boolean { return true }
}

class ValidationPipe {
  constructor(private validator: Validator) {}
}

class EventBus {
  emit(_event: string, _data: any): void {}
}

class EventDispatcher {
  constructor(private bus: EventBus) {}
}

export {
  AuthGuard,
  AuthService,
  CacheManager,
  ConfigService,
  ConsoleLogger,
  DatabaseConnection,
  EventBus,
  EventDispatcher,
  FileLogger,
  JwtService,
  Logger,
  MemoryCache,
  PostRepository,
  RedisCache,
  UserRepository,
  ValidationPipe,
  Validator,
}
