# Dependency Injection System

The bun-router framework includes a comprehensive Dependency Injection (DI) system with IoC Container, Service Providers, automatic constructor injection, and contextual binding for different environments.

## Table of Contents

- [Overview](#overview)
- [IoC Container](#ioc-container)
- [Service Providers](#service-providers)
- [Decorators & Automatic Injection](#decorators--automatic-injection)
- [Contextual Binding](#contextual-binding)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

The DI system provides:

- **IoC Container**: Dependency resolution with lifecycle management
- **Service Providers**: Bootstrapping and service registration
- **Automatic Constructor Injection**: Decorator-based dependency injection
- **Contextual Binding**: Environment-specific service resolution
- **Type Safety**: Full TypeScript support with compile-time validation

## IoC Container

### Basic Usage

```typescript
import { createContainer, Container } from 'bun-router/container'

// Create container
const container = createContainer()

// Bind services
container.singleton('database', DatabaseService)
container.transient('logger', LoggerService)
container.value('config', { apiKey: 'secret' })
container.factory('timestamp', () => Date.now())

// Resolve services
const db = container.resolve<DatabaseService>('database')
const logger = container.resolve<LoggerService>('logger')
```

### Binding Scopes

```typescript
// Singleton - same instance every time
container.singleton('database', DatabaseService)

// Transient - new instance every time
container.transient('logger', LoggerService)

// Scoped - same instance within a scope
container.bind('cache').to(CacheService).inScopedScope().build()

// Request - same instance within a request
container.bind('session').to(SessionService).inRequestScope().build()
```

### Fluent Binding API

```typescript
container
  .bind<UserService>('userService')
  .to(UserService)
  .inSingletonScope()
  .withTags('service', 'user')
  .when((context) => context.environment === 'production')
  .build()
```

### Container Hierarchy

```typescript
// Parent container
const parent = createContainer()
parent.singleton('config', ConfigService)

// Child container inherits parent bindings
const child = parent.createChild()
child.singleton('logger', LoggerService)

// Child can resolve parent services
const config = child.resolve<ConfigService>('config') // ✅ Works
const logger = parent.resolve<LoggerService>('logger') // ❌ Throws error
```

### Scoped Containers

```typescript
// Create scoped container for request isolation
const requestScope = container.createScope('request-123')

// Services bound with 'scoped' lifetime will be shared within this scope
const service1 = requestScope.resolve<ScopedService>('scopedService')
const service2 = requestScope.resolve<ScopedService>('scopedService')
// service1 === service2 (same instance within scope)
```

## Service Providers

Service providers manage service registration and bootstrapping.

### Creating Service Providers

```typescript
import { BaseServiceProvider, Container } from 'bun-router/container'

class DatabaseServiceProvider extends BaseServiceProvider {
  readonly name = 'database'
  readonly dependencies = ['config', 'logging']
  readonly priority = 10

  register(container: Container): void {
    // Register services
    this.singleton(container, 'database', DatabaseConnection)
    this.transient(container, 'userRepository', UserRepository)
    this.transient(container, 'postRepository', PostRepository)
  }

  async boot(container: Container): Promise<void> {
    // Initialize services after all providers are registered
    const db = container.resolve<DatabaseConnection>('database')
    await db.connect()
  }

  async shutdown(container: Container): Promise<void> {
    // Cleanup on application shutdown
    const db = container.resolve<DatabaseConnection>('database')
    await db.disconnect()
  }
}
```

### Environment-Specific Providers

```typescript
class CacheServiceProvider extends BaseServiceProvider {
  readonly name = 'cache'

  register(container: Container): void {
    // Development - use memory cache
    this.forEnvironment(container, 'development')
      .bind('cache').toFactory(() => new MemoryCache())

    // Production - use Redis cache
    this.forEnvironment(container, 'production')
      .bind('cache').toFactory((config: ConfigService) => 
        new RedisCache(config.get('cache.redis'))
      )
  }
}
```

### Provider Manager

```typescript
import { DefaultServiceProviderManager } from 'bun-router/container'

const container = createContainer()
const providerManager = new DefaultServiceProviderManager(container)

// Register providers
providerManager
  .register(new ConfigServiceProvider())
  .register(new LoggingServiceProvider())
  .register(new DatabaseServiceProvider())
  .register(new CacheServiceProvider())

// Boot all providers
await providerManager.boot()

// Shutdown gracefully
process.on('SIGTERM', async () => {
  await providerManager.shutdown()
})
```

### Deferred Providers

```typescript
class EventServiceProvider extends DeferredServiceProvider {
  readonly name = 'events'

  provides(): (string | symbol | Function)[] {
    return ['eventBus', 'eventDispatcher']
  }

  register(container: Container): void {
    container.singleton('eventBus', EventBus)
    container.singleton('eventDispatcher', EventDispatcher)
  }
}

// Provider will only be loaded when eventBus or eventDispatcher is requested
```

## Decorators & Automatic Injection

### Injectable Services

```typescript
import { Injectable, Inject } from 'bun-router/container'

@Injectable({ scope: 'singleton' })
class DatabaseService {
  async connect(): Promise<void> {
    // Connection logic
  }
}

@Injectable()
class UserService {
  constructor(
    @Inject('database') private db: DatabaseService,
    @Inject('logger') private logger: LoggerService,
    @Inject('config') private config: ConfigService
  ) {}

  async getUser(id: string): Promise<User> {
    this.logger.log(`Getting user ${id}`)
    // Implementation
  }
}
```

### Optional Dependencies

```typescript
@Injectable()
class EmailService {
  constructor(
    @Inject('config') private config: ConfigService,
    @Optional() @Inject('smtp') private smtp?: SmtpService
  ) {}

  async sendEmail(to: string, subject: string): Promise<void> {
    if (this.smtp) {
      // Use SMTP service
    } else {
      // Fallback to console logging
      console.log(`Email to ${to}: ${subject}`)
    }
  }
}
```

### Tagged Injection

```typescript
@Injectable()
class NotificationService {
  constructor(
    @Tagged('notification') private handlers: NotificationHandler[]
  ) {}

  async notify(message: string): Promise<void> {
    for (const handler of this.handlers) {
      await handler.handle(message)
    }
  }
}

// Register tagged services
container.bind('emailHandler').to(EmailHandler).withTags('notification').build()
container.bind('smsHandler').to(SmsHandler).withTags('notification').build()
```

### Controller Injection

```typescript
import { Controller, Get, Post, Param, Body, InjectParam } from 'bun-router/container'

@Controller('/api/users')
class UserController {
  constructor(
    @InjectParam(UserService) private userService: UserService,
    @InjectParam('logger') private logger: LoggerService
  ) {}

  @Get('/')
  async getUsers(): Promise<Response> {
    const users = await this.userService.getAllUsers()
    return Response.json(users)
  }

  @Get('/:id')
  async getUser(@Param('id') id: string): Promise<Response> {
    const user = await this.userService.getUser(id)
    return Response.json(user)
  }

  @Post('/')
  async createUser(@Body() userData: CreateUserDto): Promise<Response> {
    const user = await this.userService.createUser(userData)
    return Response.json(user, { status: 201 })
  }
}
```

### Middleware Injection

```typescript
@Injectable()
class AuthMiddleware {
  constructor(
    @Inject('authService') private authService: AuthService,
    @Inject('logger') private logger: LoggerService
  ) {}

  async handle(request: Request, next: Function): Promise<Response> {
    const token = request.headers.get('Authorization')
    
    if (!token) {
      return new Response('Unauthorized', { status: 401 })
    }

    const user = await this.authService.validateToken(token)
    if (!user) {
      return new Response('Invalid token', { status: 401 })
    }

    // Add user to request context
    (request as any).user = user
    return next()
  }
}

// Use with controller
@Controller('/api/protected')
@UseMiddleware(AuthMiddleware)
class ProtectedController {
  // All routes will use AuthMiddleware
}
```

## Contextual Binding

### Environment-Based Binding

```typescript
import { ContextualContainer } from 'bun-router/container'

const container = new ContextualContainer()

// Development environment
container.forDevelopment('logger')
  .to(ConsoleLogger)
  .build()

// Production environment
container.forProduction('logger')
  .to(FileLogger)
  .build()

// The correct logger will be resolved based on NODE_ENV
const logger = container.resolve<Logger>('logger')
```

### Custom Conditions

```typescript
import { BindingConditions } from 'bun-router/container'

// Feature flag binding
container.bindContextual('paymentProcessor')
  .to(NewPaymentProcessor)
  .when(BindingConditions.feature('new-payment-system'))
  .build()

container.bindContextual('paymentProcessor')
  .to(LegacyPaymentProcessor)
  .when(BindingConditions.custom(() => true))
  .withPriority(-1) // Lower priority fallback
  .build()

// Time-based binding
container.bindContextual('cache')
  .to(FastCache)
  .when(BindingConditions.timeRange(9, 17)) // Business hours
  .build()

container.bindContextual('cache')
  .to(SlowCache)
  .when(BindingConditions.custom(() => true))
  .withPriority(-1)
  .build()
```

### Environment Configuration

```typescript
import { EnvironmentPresets } from 'bun-router/container'

const container = new ContextualContainer()
const envManager = container.getEnvironmentManager()

// Register environment presets
envManager.register(EnvironmentPresets.development())
envManager.register(EnvironmentPresets.production())
envManager.register(EnvironmentPresets.testing())

// Or create custom environment
envManager.register({
  name: 'staging',
  variables: {
    DEBUG: true,
    LOG_LEVEL: 'info',
    CACHE_TTL: 1800
  },
  services: {
    logger: 'FileLogger',
    cache: 'RedisCache'
  },
  features: ['performance-monitoring', 'debug-toolbar']
})

// Set current environment
envManager.setEnvironment('staging')

// Check environment
if (envManager.is('development', 'staging')) {
  // Development or staging specific code
}

// Check features
if (envManager.hasFeature('debug-toolbar')) {
  // Enable debug toolbar
}
```

### Parent-Based Binding

```typescript
// Different database implementations based on the requesting service
container.bindContextual('database')
  .to(ReadOnlyDatabase)
  .whenParent(ReportService)
  .build()

container.bindContextual('database')
  .to(ReadWriteDatabase)
  .whenParent(UserService)
  .build()
```

## Best Practices

### 1. Service Organization

```typescript
// Group related services in providers
class UserServiceProvider extends BaseServiceProvider {
  readonly name = 'user'

  register(container: Container): void {
    this.singleton(container, 'userService', UserService)
    this.singleton(container, 'userRepository', UserRepository)
    this.transient(container, 'userValidator', UserValidator)
  }
}
```

### 2. Interface-Based Design

```typescript
interface IUserRepository {
  findById(id: string): Promise<User | null>
  save(user: User): Promise<void>
}

@Injectable()
class DatabaseUserRepository implements IUserRepository {
  // Implementation
}

@Injectable()
class InMemoryUserRepository implements IUserRepository {
  // Implementation
}

// Bind interface to implementation
container.bind<IUserRepository>('userRepository')
  .to(DatabaseUserRepository)
  .build()
```

### 3. Configuration Management

```typescript
@Injectable({ scope: 'singleton' })
class ConfigService {
  private config: Record<string, any>

  constructor() {
    this.config = {
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        name: process.env.DB_NAME || 'app'
      },
      cache: {
        ttl: parseInt(process.env.CACHE_TTL || '3600'),
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      }
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    const keys = key.split('.')
    let value = this.config

    for (const k of keys) {
      value = value?.[k]
      if (value === undefined) break
    }

    return value !== undefined ? value : defaultValue
  }
}
```

### 4. Error Handling

```typescript
@Injectable()
class ResilientService {
  constructor(
    @Inject('primaryService') private primary: PrimaryService,
    @Optional() @Inject('fallbackService') private fallback?: FallbackService,
    @Inject('logger') private logger: LoggerService
  ) {}

  async process(data: any): Promise<any> {
    try {
      return await this.primary.process(data)
    } catch (error) {
      this.logger.error('Primary service failed', error)
      
      if (this.fallback) {
        this.logger.info('Using fallback service')
        return await this.fallback.process(data)
      }
      
      throw error
    }
  }
}
```

### 5. Testing with DI

```typescript
// Test setup
describe('UserService', () => {
  let container: Container
  let userService: UserService

  beforeEach(() => {
    container = createContainer()
    
    // Mock dependencies
    const mockRepository = {
      findById: jest.fn(),
      save: jest.fn()
    }
    
    const mockLogger = {
      log: jest.fn(),
      error: jest.fn()
    }

    container.value('userRepository', mockRepository)
    container.value('logger', mockLogger)
    container.transient(UserService, UserService)

    userService = container.resolve<UserService>(UserService)
  })

  it('should get user by id', async () => {
    const mockUser = { id: '1', name: 'John' }
    const mockRepository = container.resolve('userRepository')
    mockRepository.findById.mockResolvedValue(mockUser)

    const result = await userService.getUser('1')
    
    expect(result).toBe(mockUser)
    expect(mockRepository.findById).toHaveBeenCalledWith('1')
  })
})
```

## Examples

### Complete Application Setup

```typescript
import { 
  ContextualContainer, 
  DefaultServiceProviderManager,
  EnvironmentPresets 
} from 'bun-router/container'

// Create container and setup environment
const container = new ContextualContainer()
const envManager = container.getEnvironmentManager()
const providerManager = new DefaultServiceProviderManager(container)

// Register environments
envManager.register(EnvironmentPresets.development())
envManager.register(EnvironmentPresets.production())
envManager.setEnvironment(process.env.NODE_ENV || 'development')

// Register service providers
providerManager
  .register(new ConfigServiceProvider())
  .register(new LoggingServiceProvider())
  .register(new DatabaseServiceProvider())
  .register(new CacheServiceProvider())
  .register(new AuthServiceProvider())

// Boot application
async function bootstrap() {
  await providerManager.boot()
  
  // Register controllers
  container.registerController(UserController)
  container.registerController(PostController)
  
  console.log('Application bootstrapped successfully')
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...')
  await providerManager.shutdown()
  process.exit(0)
})

bootstrap().catch(console.error)
```

### Advanced Contextual Binding

```typescript
// Multi-tenant application with tenant-specific services
container.bindContextual('database')
  .to(TenantADatabase)
  .when(BindingConditions.custom(
    (context) => context.requestId?.includes('tenant-a') ?? false
  ))
  .build()

container.bindContextual('database')
  .to(TenantBDatabase)
  .when(BindingConditions.custom(
    (context) => context.requestId?.includes('tenant-b') ?? false
  ))
  .build()

// A/B testing with feature flags
container.bindContextual('recommendationEngine')
  .to(MLRecommendationEngine)
  .when(BindingConditions.feature('ml-recommendations'))
  .withPriority(10)
  .build()

container.bindContextual('recommendationEngine')
  .to(RuleBasedRecommendationEngine)
  .when(BindingConditions.custom(() => true))
  .withPriority(1)
  .build()
```

### Microservice Integration

```typescript
@Injectable()
class ApiGatewayService {
  constructor(
    @Tagged('microservice') private services: MicroserviceClient[],
    @Inject('loadBalancer') private loadBalancer: LoadBalancer,
    @Inject('circuitBreaker') private circuitBreaker: CircuitBreaker
  ) {}

  async callService(serviceName: string, endpoint: string, data: any): Promise<any> {
    const service = this.services.find(s => s.name === serviceName)
    if (!service) {
      throw new Error(`Service ${serviceName} not found`)
    }

    const instance = await this.loadBalancer.selectInstance(serviceName)
    
    return this.circuitBreaker.execute(async () => {
      return service.call(instance, endpoint, data)
    })
  }
}

// Register microservice clients
container.bind('userServiceClient')
  .to(UserServiceClient)
  .withTags('microservice')
  .build()

container.bind('orderServiceClient')
  .to(OrderServiceClient)
  .withTags('microservice')
  .build()
```

The Dependency Injection system provides a robust foundation for building scalable, testable, and maintainable applications with bun-router. It supports complex scenarios while maintaining simplicity for basic use cases.
