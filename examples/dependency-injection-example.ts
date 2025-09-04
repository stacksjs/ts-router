/**
 * Comprehensive Dependency Injection Example
 *
 * Demonstrates all DI features including IoC Container, Service Providers,
 * Decorators, Contextual Binding, and real-world usage patterns
 */

// Modern decorators - no reflect-metadata needed
import {
  Container,
  createContainer
} from '../packages/bun-router/src/container/container.js'
import { ContextualContainer } from '../packages/bun-router/src/container/contextual-binding.js'
import {
  BaseServiceProvider,
  DefaultServiceProviderManager
} from '../packages/bun-router/src/container/service-provider.js'

import {
  Injectable,
  Inject,
  Optional,
  Controller,
  Get,
  Post,
  Param,
  Body,
  InjectParam,
  DecoratorContainer
} from '../packages/bun-router/src/container/decorators.js'

import {
  EnvironmentPresets,
  BindingConditions
} from '../packages/bun-router/src/container/contextual-binding.js'

console.log('🚀 Dependency Injection System Example\n')

// =============================================================================
// 1. Basic IoC Container Usage
// =============================================================================

console.log('1. Basic IoC Container Usage')
console.log('=' .repeat(50))

class DatabaseConnection {
  private connected = false

  async connect(): Promise<void> {
    this.connected = true
    console.log('✅ Database connected')
  }

  isConnected(): boolean {
    return this.connected
  }

  async query(sql: string): Promise<any[]> {
    console.log(`🔍 Executing query: ${sql}`)
    return [{ id: 1, name: 'Sample Data' }]
  }
}

class Logger {
  log(message: string): void {
    console.log(`[LOG] ${message}`)
  }
}

// Basic container usage
const basicContainer = createContainer()
basicContainer.singleton('database', DatabaseConnection)
basicContainer.transient('logger', Logger)
basicContainer.value('config', { apiKey: 'secret123' })

const db = basicContainer.resolve<DatabaseConnection>('database')
const logger = basicContainer.resolve<Logger>('logger')
const config = basicContainer.resolve<any>('config')

console.log('Database instance:', db.constructor.name)
console.log('Config:', config)

await db.connect()
await db.query('SELECT * FROM users')

console.log('\n')

// =============================================================================
// 2. Injectable Services with Decorators
// =============================================================================

console.log('2. Injectable Services with Decorators')
console.log('=' .repeat(50))

@Injectable({ scope: 'singleton' })
class ConfigService {
  private config = {
    database: { host: 'localhost', port: 5432 },
    cache: { ttl: 3600 }
  }

  get<T>(key: string, defaultValue?: T): T {
    const keys = key.split('.')
    let value: any = this.config
    for (const k of keys) {
      value = value?.[k]
      if (value === undefined) break
    }
    return value !== undefined ? value : defaultValue
  }
}

@Injectable()
class UserService {
  constructor(
    @Inject('database') private db: DatabaseConnection,
    @Inject(ConfigService) private config: ConfigService
  ) {
    console.log('👤 UserService initialized')
  }

  async getUser(id: string): Promise<{ id: string; name: string }> {
    await this.db.query(`SELECT * FROM users WHERE id = '${id}'`)
    return { id, name: `User ${id}` }
  }

  async createUser(userData: { name: string }): Promise<{ id: string; name: string }> {
    const id = Math.random().toString(36).substr(2, 9)
    await this.db.query(`INSERT INTO users (id, name) VALUES ('${id}', '${userData.name}')`)
    return { id, ...userData }
  }
}

@Injectable()
class EmailService {
  constructor(
    @Inject(ConfigService) private config: ConfigService,
    @Optional() @Inject('smtpService') private smtp?: any
  ) {
    console.log('📧 EmailService initialized')
  }

  async sendEmail(to: string, subject: string): Promise<void> {
    console.log(`📮 Sending email to ${to}: ${subject}`)
  }
}

// Create decorator container and resolve services
const decoratorContainer = new DecoratorContainer()
decoratorContainer.singleton('database', DatabaseConnection)

const userService = decoratorContainer.resolve<UserService>(UserService)
const emailService = decoratorContainer.resolve<EmailService>(EmailService)

const db2 = decoratorContainer.resolve<DatabaseConnection>('database')
await db2.connect()

const user = await userService.getUser('123')
console.log('Retrieved user:', user)

await emailService.sendEmail(user.name + '@example.com', 'Welcome!')

console.log('\n')

// =============================================================================
// 3. Controller with Dependency Injection
// =============================================================================

console.log('3. Controller with Dependency Injection')
console.log('=' .repeat(50))

@Controller('/api/users')
class UserController {
  constructor(
    @InjectParam(UserService) private userService: UserService,
    @InjectParam(EmailService) private emailService: EmailService
  ) {
    console.log('🎮 UserController initialized')
  }

  @Get('/')
  async getUsers(): Promise<Response> {
    console.log('📋 Getting users')
    const users = [
      { id: '1', name: 'John Doe' },
      { id: '2', name: 'Jane Smith' }
    ]
    return new Response(JSON.stringify(users))
  }

  @Get('/:id')
  async getUser(@Param('id') id: string): Promise<Response> {
    console.log(`👤 Getting user ${id}`)
    const user = await this.userService.getUser(id)
    return new Response(JSON.stringify(user))
  }

  @Post('/')
  async createUser(@Body() userData: { name: string }): Promise<Response> {
    console.log('➕ Creating user:', userData)
    const user = await this.userService.createUser(userData)
    await this.emailService.sendEmail(user.name + '@example.com', 'Welcome!')
    return new Response(JSON.stringify(user), { status: 201 })
  }
}

// Register and test controller
decoratorContainer.registerController(UserController)
const userController = decoratorContainer.getController<UserController>(UserController)
console.log('Controller created:', userController.constructor.name)

const getUsersResponse = await userController.getUsers()
console.log('Get users response status:', getUsersResponse.status)

const createUserResponse = await userController.createUser({ name: 'Alice Johnson' })
console.log('Create user response status:', createUserResponse.status)

console.log('\n')

// =============================================================================
// 4. Service Providers and Application Bootstrapping
// =============================================================================

console.log('4. Service Providers and Application Bootstrapping')
console.log('=' .repeat(50))

class NotificationServiceProvider extends BaseServiceProvider {
  readonly name = 'notification'
  readonly priority = 5

  register(container: Container): void {
    console.log('📋 Registering notification services...')
    this.singleton(container, EmailService, EmailService)
    this.singleton(container, 'notificationManager', NotificationManager)
  }

  async boot(container: Container): Promise<void> {
    console.log('🚀 Booting notification services...')
    const manager = container.resolve<NotificationManager>('notificationManager')
    await manager.initialize()
  }
}

class NotificationManager {
  constructor(@Inject(EmailService) private email: EmailService) {}

  async initialize(): Promise<void> {
    console.log('✅ Notification manager initialized')
  }

  async sendNotification(recipient: string, subject: string, body: string): Promise<void> {
    await this.email.sendEmail(recipient, subject)
    console.log(`📬 Notification sent to ${recipient}`)
  }
}

// Bootstrap application
const appContainer = new DecoratorContainer()
const providerManager = new DefaultServiceProviderManager(appContainer)

appContainer.singleton('database', DatabaseConnection)
appContainer.singleton(ConfigService, ConfigService)
appContainer.singleton(UserService, UserService)

providerManager.register(new NotificationServiceProvider())

console.log('🚀 Bootstrapping application...')
await providerManager.boot()

const notificationManager = appContainer.resolve<NotificationManager>('notificationManager')
await notificationManager.sendNotification('user@example.com', 'Welcome!', 'Welcome to our platform!')

console.log('\n')

// =============================================================================
// 5. Contextual Binding and Environment Configuration
// =============================================================================

console.log('5. Contextual Binding and Environment Configuration')
console.log('=' .repeat(50))

const contextualContainer = new ContextualContainer()
const envManager = contextualContainer.getEnvironmentManager()

// Register environments
envManager.register(EnvironmentPresets.development())
envManager.register(EnvironmentPresets.production())

// Environment-specific services
class ConsoleLogger extends Logger {
  log(message: string): void {
    console.log(`[CONSOLE] ${message}`)
  }
}

class FileLogger extends Logger {
  log(message: string): void {
    console.log(`[FILE] ${message}`)
  }
}

// Environment-based bindings
contextualContainer.forDevelopment('logger').to(ConsoleLogger).build()
contextualContainer.forProduction('logger').to(FileLogger).build()

// Feature flag bindings
class NewFeatureService {
  process(): string {
    return 'Using new feature implementation'
  }
}

class LegacyFeatureService {
  process(): string {
    return 'Using legacy implementation'
  }
}

envManager.register({
  name: 'staging',
  variables: {},
  services: {},
  features: ['beta-features']
})

contextualContainer.bindContextual('featureService')
  .to(NewFeatureService)
  .when(BindingConditions.feature('beta-features'))
  .build()

contextualContainer.bindContextual('featureService')
  .to(LegacyFeatureService)
  .when(BindingConditions.custom(() => true))
  .withPriority(-1)
  .build()

// Test different environments
const environments = ['development', 'production', 'staging']

for (const env of environments) {
  console.log(`\n--- Testing ${env.toUpperCase()} environment ---`)

  envManager.setEnvironment(env)
  console.log(`Current environment: ${envManager.getCurrentEnvironment()}`)
  console.log(`Has beta features: ${envManager.hasFeature('beta-features')}`)

  const logger = contextualContainer.resolve<Logger>('logger', { environment: env })
  const featureService = contextualContainer.resolve<any>('featureService', { environment: env })

  logger.log(`Logger resolved for ${env}`)
  console.log(`Feature service result: ${featureService.process()}`)
}

console.log('\n')

// =============================================================================
// 6. Advanced Patterns
// =============================================================================

console.log('6. Advanced Patterns')
console.log('=' .repeat(50))

@Injectable()
class EventBus {
  private listeners = new Map<string, Function[]>()

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(listener)
  }

  emit(event: string, data: any): void {
    const listeners = this.listeners.get(event) || []
    console.log(`📡 Emitting event: ${event} (${listeners.length} listeners)`)

    for (const listener of listeners) {
      try {
        listener(data)
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error)
      }
    }
  }
}

@Injectable()
class OrderService {
  constructor(
    @Inject(UserService) private userService: UserService,
    @Inject(EventBus) private eventBus: EventBus,
    @Inject(EmailService) private emailService: EmailService
  ) {
    this.eventBus.on('user.created', this.onUserCreated.bind(this))
  }

  async createOrder(userId: string, items: any[]): Promise<any> {
    console.log(`📦 Creating order for user ${userId}`)

    const user = await this.userService.getUser(userId)

    const order = {
      id: Math.random().toString(36).substr(2, 9),
      userId,
      items,
      total: items.reduce((sum, item) => sum + (item.price || 0), 0),
      createdAt: new Date().toISOString()
    }

    this.eventBus.emit('order.created', { order, user })

    await this.emailService.sendEmail(
      user.name + '@example.com',
      'Order Confirmation'
    )

    return order
  }

  private onUserCreated(data: { user: any }): void {
    console.log(`👋 Welcome email triggered for new user: ${data.user.name}`)
  }
}

// Register advanced services
const advancedContainer = new DecoratorContainer()
advancedContainer.singleton('database', DatabaseConnection)
advancedContainer.singleton(ConfigService, ConfigService)
advancedContainer.singleton(UserService, UserService)
advancedContainer.singleton(EmailService, EmailService)
advancedContainer.singleton(EventBus, EventBus)
advancedContainer.singleton(OrderService, OrderService)

// Initialize and test
const advancedDb = advancedContainer.resolve<DatabaseConnection>('database')
await advancedDb.connect()

const orderService = advancedContainer.resolve<OrderService>(OrderService)
const eventBus = advancedContainer.resolve<EventBus>(EventBus)

eventBus.on('order.created', (data) => {
  console.log(`📊 Analytics: Order created - Total: $${data.order.total}`)
})

const order = await orderService.createOrder('user123', [
  { name: 'Product A', price: 29.99 },
  { name: 'Product B', price: 19.99 }
])

console.log('Created order:', order)

console.log('\n✅ Dependency Injection Example Complete!')

// Cleanup
await providerManager.shutdown()
