/**
 * Laravel-style API examples for streaming and model binding
 * This demonstrates the authentic Laravel APIs we've implemented
 */

import { Router } from '../src/router'

const router = new Router()

// =============================================================================
// STREAMING RESPONSE EXAMPLES (Laravel's actual APIs)
// =============================================================================

/**
 * Laravel's response()->stream() - Streaming responses with generators
 */
router.get('/chat', () => {
  return router.stream(function* () {
    // Simulating AI chat responses
    yield 'Hello, '
    yield 'how can I '
    yield 'help you today?'
  })
})

/**
 * Laravel's response()->streamJson() - Stream large JSON datasets
 */
router.get('/users.json', () => {
  return router.streamJson({
    users: getUsersCursor(), // Large dataset iterator
    meta: getMetadata()
  })
})

async function* getUsersCursor() {
  // Simulate streaming users from database
  for (let i = 1; i <= 10000; i++) {
    yield { id: i, name: `User ${i}`, email: `user${i}@example.com` }
  }
}

async function* getMetadata() {
  yield { total: 10000, page: 1 }
}

/**
 * Laravel's response()->eventStream() - Server-Sent Events
 */
router.get('/events', () => {
  return router.eventStream(function* () {
    let counter = 0
    while (counter < 10) {
      yield {
        data: { message: `Event ${counter}`, timestamp: Date.now() },
        event: 'update',
        id: counter.toString(),
        retry: 3000
      }
      counter++
    }
  })
})

/**
 * Laravel's response()->streamDownload() - Stream downloads
 */
router.get('/export/users', () => {
  return router.streamDownload(function* () {
    yield 'id,name,email\n' // CSV header
    for (let i = 1; i <= 1000; i++) {
      yield `${i},User ${i},user${i}@example.com\n`
    }
  }, 'users.csv', {
    'Content-Type': 'text/csv'
  })
})

// =============================================================================
// MODEL BINDING EXAMPLES (Laravel's actual APIs)
// =============================================================================

// Example User model simulation
interface User {
  id: string
  name: string
  email: string
}

interface Post {
  id: string
  title: string
  userId: string
}

// Mock database
const users: User[] = [
  { id: '1', name: 'John Doe', email: 'john@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
]

const posts: Post[] = [
  { id: '1', title: 'First Post', userId: '1' },
  { id: '2', title: 'Second Post', userId: '1' },
  { id: '3', title: 'Third Post', userId: '2' }
]

/**
 * Laravel's Route::model() - Explicit binding
 */
router.model('user', async (id: string) => {
  return users.find(user => user.id === id) || null
})

router.model('post', async (id: string) => {
  return posts.find(post => post.id === id) || null
})

/**
 * Laravel's implicit binding - Routes with model parameters
 */

// Add implicit binding middleware globally
router.use(router.implicitBinding())

// Routes that automatically resolve models
router.get('/users/{user}', (req) => {
  // Laravel automatically injects the User model into req.user
  const user = (req as any).user as User
  return new Response(JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' }
  })
})

router.get('/users/{user}/posts/{post}', (req) => {
  // Both user and post models are automatically injected
  const user = (req as any).user as User
  const post = (req as any).post as Post

  return new Response(JSON.stringify({ user, post }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

/**
 * Laravel's missing() method - Custom 404 handling
 */
router.get('/users/{user}', (req) => {
  const user = (req as any).user as User
  return new Response(JSON.stringify(user))
}).missing((req) => {
  return new Response(JSON.stringify({
    error: 'User not found',
    message: 'The requested user does not exist'
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  })
})

/**
 * Laravel's scoped bindings - Child models scoped to parents
 */
router.use(router.scopedBindings({
  'post': 'user' // Posts must belong to the user
}))

router.get('/users/{user}/posts/{post}', (req) => {
  // Post is automatically scoped to the user
  const user = (req as any).user as User
  const post = (req as any).post as Post

  // Laravel ensures post.userId === user.id
  return new Response(JSON.stringify({ user, post }))
})

/**
 * Laravel's resource routes with automatic model binding
 */
router.resource('posts', 'PostController', {
  // Laravel automatically binds {post} parameter to Post model
})

// This creates routes like:
// GET /posts - PostController@index
// GET /posts/create - PostController@create
// POST /posts - PostController@store
// GET /posts/{post} - PostController@show (with model binding)
// GET /posts/{post}/edit - PostController@edit (with model binding)
// PUT/PATCH /posts/{post} - PostController@update (with model binding)
// DELETE /posts/{post} - PostController@destroy (with model binding)

/**
 * Custom route key names (Laravel's getRouteKeyName equivalent)
 */
router.model('user', async (slug: string) => {
  // Look up by slug instead of id
  return users.find(user => user.email === slug) || null
})

router.get('/users/{user:email}', (req) => {
  // Laravel resolves user by email instead of id
  const user = (req as any).user as User
  return new Response(JSON.stringify(user))
})

// =============================================================================
// COMBINING STREAMING AND MODEL BINDING
// =============================================================================

/**
 * Stream user posts with model binding
 */
router.get('/users/{user}/posts/stream', (req) => {
  const user = (req as any).user as User

  return router.streamJson({
    posts: getUserPosts(user.id)
  })
})

async function* getUserPosts(userId: string) {
  const userPosts = posts.filter(post => post.userId === userId)
  for (const post of userPosts) {
    yield post
  }
}

/**
 * Server-sent events for user notifications
 */
router.get('/users/{user}/notifications', (req) => {
  const user = (req as any).user as User

  return router.eventStream(function* () {
    // Simulate real-time notifications for this user
    let count = 0
    while (count < 5) {
      yield {
        data: {
          message: `Notification ${count + 1} for ${user.name}`,
          userId: user.id
        },
        event: 'notification',
        id: `${user.id}-${count}`
      }
      count++
    }
  })
})

console.log('Laravel-style router examples loaded!')
console.log('Streaming APIs: stream(), streamJson(), eventStream(), streamDownload()')
console.log('Model Binding APIs: model(), implicitBinding(), missing(), scopedBindings(), resource()')