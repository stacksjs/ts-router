# Advanced Routing Features

This document covers the advanced Laravel-like routing features available in bun-router, including route model binding with custom keys, route caching with tags, route throttling, and subdomain routing.

## Table of Contents

1. [Route Model Binding with Custom Keys](#route-model-binding-with-custom-keys)
2. [Route Caching with Tags](#route-caching-with-tags)
3. [Route Throttling](#route-throttling)
4. [Subdomain Routing](#subdomain-routing)
5. [Advanced Router Usage](#advanced-router-usage)
6. [Examples](#examples)

## Route Model Binding with Custom Keys

Route model binding allows you to automatically resolve model instances from route parameters. You can specify custom keys for model resolution.

### Basic Usage

```typescript
import { createAdvancedRouter } from './src/routing/advanced-router'
import { createModelWrapper } from './src/model-binding'

const router = createAdvancedRouter()

// Create model wrapper for User model
const userModel = createModelWrapper(UserDefinition, queryBuilder)

// Route with custom key binding
router.register(
  router.get('/users/{user:slug}', async (req) => {
    const user = (req as any).models?.user
    return new Response(JSON.stringify(user))
  }).model('user', userModel)
)
```

### Custom Key Patterns

```typescript
// Bind by slug
router.get('/posts/{post:slug}', handler)

// Bind by UUID
router.get('/users/{user:uuid}', handler)

// Bind by custom field
router.get('/categories/{category:name}', handler)
```

### Model Wrapper Configuration

```typescript
const userModel = new BunQueryBuilderModel(userDefinition, queryBuilder)

// Custom route key resolution
userModel.resolveRouteBinding = async (value: string, field?: string) => {
  if (field === 'slug') {
    return await userModel.where('slug', value)
  }
  return await userModel.find(value)
}
```

## Route Caching with Tags

Route caching allows you to cache HTTP responses with tag-based invalidation for efficient cache management.

### Basic Caching

```typescript
// Cache with tags
router.cached(['users', 'posts']).get('/api/users', async () => {
  const users = await getUsers()
  return new Response(JSON.stringify(users))
})

// Custom cache configuration
router.register(
  router.get('/api/data', handler)
    .cached(['data'], {
      ttl: 30 * 60 * 1000, // 30 minutes
      varyBy: ['Authorization'],
      excludeQuery: ['_t', 'timestamp']
    })
)
```

### Cache Invalidation

```typescript
import { CacheInvalidation } from './src/routing/route-caching'

// Invalidate by tags
CacheInvalidation.byTags(['users'])

// Invalidate for specific user
CacheInvalidation.forUser('user123')

// Invalidate model-related cache
CacheInvalidation.forModel('User', '123')

// Clear all cache
CacheInvalidation.all()
```

### Cache Factory Functions

```typescript
import { RouteCacheFactory } from './src/routing/route-caching'

// Short-term cache (5 minutes)
router.register(
  router.get('/api/quick', handler)
    .cached(['quick'], RouteCacheFactory.short(['quick']))
)

// API cache with common settings
router.register(
  router.get('/api/data', handler)
    .cached(['api'], RouteCacheFactory.api(['api']))
)

// User-specific cache
router.register(
  router.get('/api/profile', handler)
    .cached(['profile'], RouteCacheFactory.user(['profile']))
)
```

### ETag Support

The caching system automatically generates ETags and supports conditional requests:

```typescript
// Client sends: If-None-Match: "abc123"
// Server responds: 304 Not Modified (if content unchanged)
```

## Route Throttling

Route throttling implements rate limiting per user, IP, or custom criteria.

### Basic Throttling

```typescript
// Laravel-style throttle string: "maxAttempts,windowMinutes"
router.throttle('60,1').get('/api/limited', handler) // 60 requests per minute

// Custom configuration
router.register(
  router.get('/api/custom', handler)
    .throttle({
      maxAttempts: 100,
      windowMs: 60000, // 1 minute
      keyGenerator: (req) => `user:${req.user?.id}`,
    })
)
```

### Throttle Factory Functions

```typescript
import { ThrottleFactory } from './src/routing/route-throttling'

// API rate limiting
router.register(
  router.get('/api/data', handler)
    .throttle(ThrottleFactory.api(60, 1)) // 60 requests per minute
)

// Authentication rate limiting
router.register(
  router.post('/auth/login', handler)
    .throttle(ThrottleFactory.auth()) // 5 attempts per 15 minutes
)

// Per-user throttling
router.register(
  router.get('/api/user-data', handler)
    .throttle(ThrottleFactory.perUser(100, 60)) // 100 requests per hour per user
)

// Upload throttling
router.register(
  router.post('/api/upload', handler)
    .throttle(ThrottleFactory.upload()) // 10 uploads per hour
)
```

### Conditional Throttling

```typescript
router.register(
  router.get('/api/premium', handler)
    .throttle({
      maxAttempts: 10,
      windowMs: 60000,
      skipIf: (req) => req.user?.plan === 'premium' // Skip for premium users
    })
)
```

### Custom Key Generation

```typescript
router.register(
  router.post('/api/contact', handler)
    .throttle({
      maxAttempts: 3,
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
      keyGenerator: (req) => {
        const ip = req.headers.get('x-forwarded-for') || 'unknown'
        const email = req.body?.email || 'anonymous'
        return `contact:${ip}:${email}`
      }
    })
)
```

## Subdomain Routing

Subdomain routing allows you to organize routes by domain patterns and extract subdomain parameters.

### Basic Subdomain Routing

```typescript
// Single subdomain pattern
router.domain('{account}.app.com').routes((builder) => {
  builder.get('/', async (req) => {
    const account = req.params?.account
    return new Response(`Welcome to ${account}`)
  })
  
  builder.get('/dashboard', async (req) => {
    return new Response(`Dashboard for ${req.params?.account}`)
  })
})
```

### Multi-level Subdomains

```typescript
// Multi-level pattern
router.domain('{service}.{env}.app.com').routes((builder) => {
  builder.get('/status', async (req) => {
    const { service, env } = req.params || {}
    return new Response(`${service} status in ${env}`)
  })
})
```

### Domain Group Configuration

```typescript
// With middleware and prefix
router.domain('{tenant}.api.com')
  .middleware([authMiddleware, tenantMiddleware])
  .prefix('/v1')
  .name('tenant.api')
  .routes((builder) => {
    builder.get('/users', handler) // /v1/users on {tenant}.api.com
    builder.post('/users', handler)
  })
```

### Subdomain Patterns

```typescript
import { SubdomainPatterns } from './src/routing/subdomain-routing'

// Wildcard subdomain
const pattern1 = SubdomainPatterns.wildcard('example.com') // {subdomain}.example.com

// API versioning
const pattern2 = SubdomainPatterns.apiVersion('example.com') // {version}.api.example.com

// Tenant pattern
const pattern3 = SubdomainPatterns.tenant('example.com') // {tenant}.app.example.com

// Environment pattern
const pattern4 = SubdomainPatterns.environment('example.com') // {env}.example.com
```

### Subdomain Utilities

```typescript
import { SubdomainUtils } from './src/routing/subdomain-routing'

// Extract subdomain from request
const subdomain = SubdomainUtils.getSubdomain(req) // 'api' from 'api.example.com'

// Get domain parameters
const params = SubdomainUtils.getDomainParams(req) // { account: 'tenant1' }

// Check domain pattern match
const matches = SubdomainUtils.matchesDomain(req, '{account}.app.com')

// Get full subdomain info
const info = SubdomainUtils.getSubdomainInfo(req)
```

## Advanced Router Usage

The `AdvancedRouter` provides a fluent API for combining multiple features.

### Creating an Advanced Router

```typescript
import { createAdvancedRouter } from './src/routing/advanced-router'

const router = createAdvancedRouter()

// Add global middleware
router.use(corsMiddleware)
router.use(authMiddleware)
```

### Combining Features

```typescript
// Route with model binding, caching, and throttling
router.register(
  router.get('/users/{user:slug}', handler)
    .model('user', userModel)
    .cached(['users'])
    .throttle('100,60')
    .name('user.show')
)
```

### Route Groups

```typescript
// API v1 group
router.group({
  prefix: '/api/v1',
  middleware: [apiAuthMiddleware],
  name: 'api.v1'
}, (group) => {
  group.get('/users', usersHandler)
  group.post('/users', createUserHandler)
  group.get('/posts', postsHandler)
})
```

### Utility Functions

```typescript
import { AdvancedRoutingUtils } from './src/routing/advanced-router'

// API route with common settings
const apiRoute = AdvancedRoutingUtils.apiRoute('GET', '/api/data', handler, ['api'])

// Authenticated route
const authRoute = AdvancedRoutingUtils.authRoute('GET', '/protected', handler, authMiddleware)

// Admin route with higher limits
const adminRoute = AdvancedRoutingUtils.adminRoute('GET', '/admin/users', handler, adminAuthMiddleware)
```

## Examples

### Complete E-commerce API

```typescript
import { createAdvancedRouter } from './src/routing/advanced-router'
import { ThrottleFactory, RouteCacheFactory } from './src/routing/route-caching'

const router = createAdvancedRouter()

// Product routes with caching
router.cached(['products']).get('/api/products', async () => {
  const products = await getProducts()
  return new Response(JSON.stringify(products))
})

// Product detail with model binding
router.register(
  router.get('/api/products/{product:slug}', async (req) => {
    const product = (req as any).models?.product
    return new Response(JSON.stringify(product))
  })
  .model('product', productModel)
  .cached(['products'], RouteCacheFactory.medium(['products']))
)

// User-specific cart with authentication and throttling
router.register(
  router.get('/api/cart', async (req) => {
    const cart = await getCart(req.user?.id)
    return new Response(JSON.stringify(cart))
  })
  .addMiddleware(authMiddleware)
  .throttle(ThrottleFactory.perUser(200, 60))
  .cached(['cart'], RouteCacheFactory.user(['cart']))
)

// Admin routes with subdomain
router.domain('admin.{shop}.mystore.com')
  .middleware([adminAuthMiddleware])
  .routes((builder) => {
    builder.get('/dashboard', adminDashboardHandler)
    builder.get('/orders', adminOrdersHandler)
    builder.get('/products', adminProductsHandler)
  })
```

### Multi-tenant SaaS Application

```typescript
// Tenant-specific API
router.domain('{tenant}.api.myapp.com')
  .middleware([tenantMiddleware, apiAuthMiddleware])
  .prefix('/v1')
  .routes((builder) => {
    // Tenant users with model binding and caching
    builder.get('/users/{user:uuid}', async (req) => {
      const user = (req as any).models?.user
      return new Response(JSON.stringify(user))
    })
    
    // Tenant-specific data with caching by tenant
    builder.get('/data', async (req) => {
      const tenant = req.params?.tenant
      const data = await getTenantData(tenant)
      return new Response(JSON.stringify(data))
    })
  })

// Configure model binding for tenant-scoped users
const tenantUserModel = createModelWrapper(UserDefinition, queryBuilder)
tenantUserModel.resolveRouteBinding = async (value, field, context) => {
  const tenant = context.tenant
  return await queryBuilder
    .selectFrom('users')
    .where('tenant_id', '=', tenant.id)
    .where(field || 'id', '=', value)
    .first()
}

router.register(
  router.get('/tenants/{tenant}/users/{user:uuid}', handler)
    .model('tenant', tenantModel)
    .model('user', tenantUserModel)
)
```

### API with Rate Limiting and Caching

```typescript
// Public API with generous limits
router.group({
  prefix: '/api/public',
  name: 'public.api'
}, (group) => {
  group.get('/status', statusHandler)
    .throttle('1000,60') // 1000 requests per minute
    .cached(['status'], RouteCacheFactory.short(['status']))
})

// Authenticated API with user-specific limits
router.group({
  prefix: '/api/v1',
  middleware: [authMiddleware],
  name: 'api.v1'
}, (group) => {
  group.get('/profile', profileHandler)
    .throttle(ThrottleFactory.perUser(100, 60))
    .cached(['profile'], RouteCacheFactory.user(['profile']))
    
  group.post('/upload', uploadHandler)
    .throttle(ThrottleFactory.upload())
    
  group.get('/analytics', analyticsHandler)
    .throttle(ThrottleFactory.perUser(50, 60))
    .cached(['analytics'], {
      ttl: 5 * 60 * 1000, // 5 minutes
      varyBy: ['Authorization'],
      tags: ['analytics']
    })
})

// Premium API with higher limits
router.group({
  prefix: '/api/premium',
  middleware: [authMiddleware, premiumMiddleware],
  name: 'premium.api'
}, (group) => {
  group.get('/data', premiumDataHandler)
    .throttle(ThrottleFactory.perUser(1000, 60)) // Higher limits for premium
    .cached(['premium'], RouteCacheFactory.short(['premium']))
})
```

## Performance Considerations

1. **Caching**: Use appropriate TTL values and cache tags for efficient invalidation
2. **Throttling**: Set reasonable limits based on your application's capacity
3. **Model Binding**: Optimize database queries and consider caching resolved models
4. **Subdomain Routing**: Use efficient domain pattern matching and avoid complex regex

## Best Practices

1. **Cache Tags**: Use hierarchical tags (e.g., `['users', 'user:123']`) for granular invalidation
2. **Rate Limiting**: Implement different limits for different user tiers
3. **Model Binding**: Use custom keys for better URLs (slugs, UUIDs)
4. **Subdomain Routing**: Plan your domain structure for scalability
5. **Error Handling**: Implement proper error responses for rate limits and cache misses

## Integration with Existing Router

These advanced features can be integrated with your existing bun-router setup:

```typescript
import { Router } from 'bun-router'
import { createAdvancedRouter } from './src/routing/advanced-router'

// Use advanced router for new features
const advancedRouter = createAdvancedRouter()

// Configure advanced routes
advancedRouter.cached(['api']).get('/api/advanced', handler)

// Get all routes for integration
const routes = advancedRouter.getAllRoutes()

// Add to existing router or use directly
for (const route of routes) {
  // Integrate with your existing router setup
}
```
