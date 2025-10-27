/**
 * Advanced Router Usage Demo
 *
 * More complex examples with available router features
 */

import { Router } from '../../../../packages/bun-router/src/router'

console.log('🔧 Advanced Router Usage Demo\n')

// Create a router
const router = new Router()

// Example 1: Multiple HTTP Methods
console.log('1. Multiple HTTP Methods:')

// GET route
router.get('/users', () => {
  return Response.json({ users: [] })
})

// POST route
router.post('/users', async (req) => {
  const data = await req.json()
  return Response.json({ message: 'User created', data })
})

// PUT route
router.put('/users/{id}', async (req) => {
  const { id } = req.params
  const data = await req.json()
  return Response.json({ message: `User ${id} updated`, data })
})

// DELETE route
router.delete('/users/{id}', (req) => {
  const { id } = req.params
  return Response.json({ message: `User ${id} deleted` })
})

// Example 2: Advanced Route Parameters
console.log('\n2. Advanced Route Parameters:')

// Route with multiple parameters
router.get('/posts/{category}/{slug}', (req) => {
  const { category, slug } = req.params
  return Response.json({ category, slug, title: `${category} - ${slug}` })
})

// Route with query parameters
router.get('/search', (req) => {
  const url = new URL(req.url)
  const query = url.searchParams.get('q')
  const page = url.searchParams.get('page') || '1'
  return Response.json({ query, page, results: [] })
})

// Example 3: Named Routes
console.log('\n3. Named Routes:')

// Named routes with parameters
router.get('/posts/{id}', (req) => {
  const { id } = req.params
  return Response.json({ id, title: `Post ${id}` })
}, 'blog', 'posts.show')

router.get('/posts', () => {
  return Response.json({ posts: [] })
}, 'blog', 'posts.index')

// Generate URLs for named routes
const postUrl = router.route('posts.show', { id: '123' })
const postsIndexUrl = router.route('posts.index')
console.log('  Generated post URL:', postUrl)
console.log('  Generated posts index URL:', postsIndexUrl)

// Example 4: Complex Route Patterns
console.log('\n4. Complex Route Patterns:')

// Nested resource routes
router.get('/api/v1/users/{id}/posts', (req) => {
  const { id } = req.params
  return Response.json({ userId: id, posts: [] })
})

router.get('/api/v1/users/{userId}/posts/{postId}', (req) => {
  const { userId, postId } = req.params
  return Response.json({ userId, postId, title: `Post ${postId} by user ${userId}` })
})

// Example 5: Route with Different Response Types
console.log('\n5. Different Response Types:')

// JSON response
router.get('/api/data', () => {
  return Response.json({ data: 'JSON response' })
})

// Text response
router.get('/api/text', () => {
  return new Response('Plain text response')
})

// HTML response
router.get('/api/html', () => {
  return new Response('<h1>HTML Response</h1>', {
    headers: { 'Content-Type': 'text/html' },
  })
})

// Redirect response
router.get('/api/redirect', () => {
  return Response.redirect('/api/data', 302)
})

console.log('Router configured with advanced features:')
console.log('  - Multiple HTTP methods (GET, POST, PUT, DELETE)')
console.log('  - Advanced route parameters')
console.log('  - Named routes with URL generation')
console.log('  - Complex nested routes')
console.log('  - Different response types')

// Uncomment to start the server:
// router.serve({
//   port: 3000,
// })

console.log('\n✅ Advanced router demo completed!')
