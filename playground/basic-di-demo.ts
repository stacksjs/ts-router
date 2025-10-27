/**
 * Basic Router Usage Demo
 *
 * Simple examples of using the bun-router
 */

import { Router } from '../packages/bun-router/src/router'

console.log('🚀 Basic Router Usage Demo\n')

// Create a router
const router = new Router()

// Basic route handlers
const homeHandler = () => new Response('Hello, World!')

async function createUserHandler(req: Request) {
  const data = await req.json()
  return Response.json({ message: 'User created', data })
}

function getUserHandler(req: Request) {
  const { id } = req.params
  return Response.json({ id, name: `User ${id}` })
}

// Define routes
router.get('/', homeHandler)
router.post('/users', createUserHandler)
router.get('/users/{id}', getUserHandler)

// Named routes
router.get('/users/{id}', getUserHandler, 'api', 'users.show')
router.get('/users', () => Response.json({ users: [] }), 'api', 'users.index')

// Generate URL for named route
const url = router.route('users.show', { id: '123' })
console.log('Generated URL:', url)

// Start the server (commented out for demo)
console.log('Router configured with routes:')
console.log('  GET  /')
console.log('  POST /users')
console.log('  GET  /users/{id}')
console.log('  Named routes: users.show, users.index')

// Uncomment to start the server:
// router.serve({
//   port: 3000,
// })

console.log('\n✅ Router demo completed!')
