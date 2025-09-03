# Route Model Binding

Route Model Binding provides automatic model resolution from route parameters, integrating seamlessly with bun-query-builder for type-safe database operations.

## Overview

Model binding automatically resolves models from route parameters, eliminating the need to manually fetch models in your route handlers. This feature is inspired by Laravel's route model binding and provides excellent developer experience with full TypeScript support.

## Basic Usage

### 1. Define Your Models

```typescript
import type { Model } from 'bun-router'

interface User extends Model {
  id: number
  name: string
  email: string
  created_at: string
}

interface Post extends Model {
  id: number
  title: string
  content: string
  user_id: number
  created_at: string
}
```

### 2. Create Model Resolvers

```typescript
import { createBasicResolver, createQueryBuilderIntegration } from 'bun-router'
import { createQueryBuilder } from 'bun-query-builder'

// Initialize query builder
const qb = createQueryBuilder(/* your database config */)
const qbIntegration = createQueryBuilderIntegration(qb)

// Create resolvers
const userResolver = createBasicResolver<User>('users')
const postResolver = createBasicResolver<Post>('posts')

// Register resolvers
qbIntegration.registerResolver('user', userResolver)
qbIntegration.registerResolver('post', postResolver)
```

### 3. Use Model Binding in Routes

```typescript
import { Router } from 'bun-router'
import type { EnhancedRequest } from 'bun-router'

const router = new Router()

// Bind models to the router
router.bindModel('user', userResolver)
router.bindModel('post', postResolver)

// Use model binding in routes
router.getWithBinding('/users/{user}', (req: EnhancedRequest) => {
  const user = req.models.user as User
  return Response.json({
    message: `Hello ${user.name}!`,
    user
  })
})

router.getWithBinding('/users/{user}/posts/{post}', (req: EnhancedRequest) => {
  const user = req.models.user as User
  const post = req.models.post as Post
  
  return Response.json({
    message: `Post "${post.title}" by ${user.name}`,
    user,
    post
  })
})
```

## Advanced Features

### Scoped Model Binding

Scoped binding ensures that child models belong to their parent models:

```typescript
import { createModelResolver, constraints } from 'bun-router'

// Posts must belong to the specified user
const postResolver = createModelResolver<Post>('posts', {
  applyConstraints: constraints.belongsTo('user', 'user_id')
})

// Comments must belong to both the post and user
const commentResolver = createModelResolver<Comment>('comments', {
  applyConstraints: constraints.combine(
    constraints.belongsTo('post', 'post_id'),
    constraints.belongsTo('user', 'user_id')
  )
})
```

### Custom Route Keys

By default, models are resolved using the `id` field. You can customize this:

```typescript
const userResolver = createBasicResolver<User>('users', {
  keyName: 'slug' // Use slug instead of id
})

// Route: /users/{user:slug}
router.getWithBinding('/users/{user}', (req) => {
  // User resolved by slug field
  const user = req.models.user as User
  return Response.json({ user })
})
```

### Custom Model Transformations

Transform database rows into your model format:

```typescript
const userResolver = createBasicResolver<User>('users', {
  transform: (row) => ({
    ...row,
    full_name: `${row.first_name} ${row.last_name}`,
    created_at: new Date(row.created_at).toISOString()
  })
})
```

## Error Handling

### Model Not Found

When a model is not found, a 404 response is automatically returned:

```typescript
// GET /users/999 -> 404 "user not found"
router.getWithBinding('/users/{user}', (req) => {
  // This handler only runs if user exists
  const user = req.models.user as User
  return Response.json({ user })
})
```

### Custom Error Handling

```typescript
router.onModelNotFound((modelName, id, keyName) => {
  return Response.json({
    error: `${modelName} with ${keyName} ${id} not found`,
    code: 'MODEL_NOT_FOUND'
  }, { status: 404 })
})
```

## Integration with bun-query-builder

The model binding system is designed to work seamlessly with bun-query-builder:

```typescript
import { createQueryBuilder, defineModel } from 'bun-query-builder'

// Define your schema
const User = defineModel('users', {
  id: { type: 'integer', primaryKey: true },
  name: { type: 'string', required: true },
  email: { type: 'string', required: true, unique: true },
  created_at: { type: 'timestamp', default: 'now' }
})

// Create query builder with your schema
const qb = createQueryBuilder({
  dialect: 'sqlite',
  connection: { filename: 'database.db' },
  schema: { users: User }
})

// Create integration
const qbIntegration = createQueryBuilderIntegration(qb)

// Create type-safe resolver
const userResolver = createBasicResolver<typeof User.type>('users')
qbIntegration.registerResolver('user', userResolver)
```

## Resource Routes

Create RESTful resource routes with automatic model binding:

```typescript
router.resource('users', {
  show: (req) => {
    const user = req.models.user as User
    return Response.json({ user })
  },
  
  update: async (req) => {
    const user = req.models.user as User
    const data = await req.json()
    
    // Update using query builder
    const updatedUser = await qb
      .update('users')
      .set(data)
      .where('id', '=', user.id)
      .returning('*')
      .first()
    
    return Response.json({ user: updatedUser })
  },
  
  destroy: async (req) => {
    const user = req.models.user as User
    
    await qb
      .delete()
      .from('users')
      .where('id', '=', user.id)
    
    return new Response(null, { status: 204 })
  }
})
```

## Performance Considerations

### Caching

Enable model caching for better performance:

```typescript
const userResolver = createModelResolver<User>('users', {
  cache: {
    ttl: 300, // 5 minutes
    key: (id, keyName) => `user:${keyName}:${id}`
  }
})
```

### Eager Loading

Load related models efficiently:

```typescript
const postResolver = createModelResolver<Post>('posts', {
  with: ['user', 'comments'], // Eager load relationships
  applyConstraints: constraints.belongsTo('user', 'user_id')
})
```

## Testing

Test your model binding with the provided test utilities:

```typescript
import { describe, it, expect } from 'bun:test'
import { createQueryBuilderIntegration, createBasicResolver } from 'bun-router'

describe('User Model Binding', () => {
  it('should resolve user by id', async () => {
    const mockQB = createMockQueryBuilder()
    const integration = createQueryBuilderIntegration(mockQB)
    const resolver = createBasicResolver<User>('users')
    
    integration.registerResolver('user', resolver)
    
    const user = await integration.resolveModel<User>('user', 1)
    expect(user).toEqual({
      id: 1,
      name: 'John Doe',
      email: 'john@example.com'
    })
  })
})
```

## API Reference

### Core Functions

- `createQueryBuilderIntegration(queryBuilder)` - Create integration with bun-query-builder
- `createBasicResolver<T>(tableName, options?)` - Create a basic model resolver
- `createModelResolver<T>(tableName, options?)` - Create an advanced model resolver with constraints

### Constraint Functions

- `constraints.belongsTo(parentKey, foreignKey)` - Ensure model belongs to parent
- `constraints.belongsToUser(userKey?, foreignKey?)` - Ensure model belongs to authenticated user
- `constraints.combine(...constraints)` - Combine multiple constraints

### Router Methods

- `router.bindModel(name, resolver)` - Register a model resolver
- `router.getWithBinding(path, handler)` - Create GET route with model binding
- `router.postWithBinding(path, handler)` - Create POST route with model binding
- `router.resource(name, handlers)` - Create RESTful resource routes

## Examples

See the `/examples` directory for complete working examples:

- `model-binding-example.ts` - Basic model binding setup
- `complete-model-binding.ts` - Advanced features and scoped binding
- `test/model-binding.test.ts` - Comprehensive test suite

## Migration from Manual Model Loading

### Before (Manual)

```typescript
router.get('/users/{id}/posts/{postId}', async (req) => {
  const userId = req.params.id
  const postId = req.params.postId
  
  const user = await db.select().from('users').where('id', userId).first()
  if (!user) {
    return new Response('User not found', { status: 404 })
  }
  
  const post = await db.select().from('posts')
    .where('id', postId)
    .where('user_id', userId)
    .first()
  if (!post) {
    return new Response('Post not found', { status: 404 })
  }
  
  return Response.json({ user, post })
})
```

### After (Model Binding)

```typescript
router.getWithBinding('/users/{user}/posts/{post}', (req) => {
  const user = req.models.user as User
  const post = req.models.post as Post
  
  return Response.json({ user, post })
})
```

The model binding system handles all the database queries, error handling, and scoped constraints automatically!
