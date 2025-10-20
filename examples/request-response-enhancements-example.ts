/**
 * Request/Response Enhancements Example
 *
 * Comprehensive example demonstrating validation, macros, and enhanced functionality
 */

import {
  RouteBuilder,
  BuiltInResponseMacros,
  ResponseWithMacros,
  rule,
  validate,
  createValidationMiddleware,
  EnhancementPresets,
  createFluentRouter
} from '../packages/bun-router/src/enhancements'
import type { EnhancedRequest } from '../packages/bun-router/src/enhancements'

// Mock database functions
const mockDatabase = {
  users: [
    { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'user' }
  ],

  async findUserByEmail(email: string) {
    return this.users.find(user => user.email === email)
  },

  async createUser(userData: any) {
    const newUser = {
      id: this.users.length + 1,
      ...userData,
      created_at: new Date().toISOString()
    }
    this.users.push(newUser)
    return newUser
  },

  async updateUser(id: number, userData: any) {
    const userIndex = this.users.findIndex(user => user.id === id)
    if (userIndex === -1) return null

    this.users[userIndex] = { ...this.users[userIndex], ...userData }
    return this.users[userIndex]
  },

  async deleteUser(id: number) {
    const userIndex = this.users.findIndex(user => user.id === id)
    if (userIndex === -1) return false

    this.users.splice(userIndex, 1)
    return true
  },

  async getUsersPaginated(page: number, limit: number, search?: string) {
    let filteredUsers = this.users

    if (search) {
      filteredUsers = this.users.filter(user =>
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase())
      )
    }

    const total = filteredUsers.length
    const offset = (page - 1) * limit
    const data = filteredUsers.slice(offset, offset + limit)

    return { data, total }
  }
}

// Register custom response macros
ResponseWithMacros.macro('apiSuccess', (data: any, message = 'Success') => {
  return new Response(JSON.stringify({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    version: '1.0'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Version': '1.0'
    }
  })
})

ResponseWithMacros.macro('apiError', (message: string, errors?: any, status = 400) => {
  return new Response(JSON.stringify({
    success: false,
    message,
    errors,
    timestamp: new Date().toISOString()
  }), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
})

// Create enhanced router
const router = createFluentRouter()

// Example 1: User Registration with Comprehensive Validation
const registerRoute = new RouteBuilder('POST', '/api/register', async (req: EnhancedRequest) => {
  try {
    // Validated data is automatically available in req.validated
    const userData = req.validated

    // Check if user already exists
    const existingUser = await mockDatabase.findUserByEmail(userData.email)
    if (existingUser) {
      return BuiltInResponseMacros.validationError({
        email: ['Email address is already registered']
      })
    }

    // Create new user
    const user = await mockDatabase.createUser({
      name: userData.name,
      email: userData.email,
      password: `hashed_${userData.password}`, // In real app, hash the password
      role: 'user'
    })

    // Remove password from response
    const { password, ...userResponse } = user

    return ResponseWithMacros.callMacro('apiSuccess', userResponse, 'Registration successful')

  } catch (error) {
    console.error('Registration error:', error)
    return BuiltInResponseMacros.serverError('Registration failed')
  }
})
.validate({
  name: rule().required().string().min(2).max(50).build(),
  email: rule().required().email().build(),
  password: rule().required().string().min(8).confirmed().build(),
  age: rule().required().integer().min(18).build(),
  terms: rule().required().boolean().build()
}, {
  customMessages: {
    'name.required': 'Please provide your full name',
    'name.min': 'Name must be at least 2 characters long',
    'email.required': 'Email address is required',
    'email.email': 'Please provide a valid email address',
    'password.required': 'Password is required',
    'password.min': 'Password must be at least 8 characters long',
    'password.confirmed': 'Password confirmation does not match',
    'age.required': 'Age is required',
    'age.min': 'You must be at least 18 years old',
    'terms.required': 'You must accept the terms and conditions'
  },
  customAttributes: {
    name: 'full name',
    email: 'email address',
    password: 'password',
    age: 'age',
    terms: 'terms and conditions'
  }
})

router.register(registerRoute)

// Example 2: User Login with Request Macros
const loginRoute = new RouteBuilder('POST', '/api/login', async (req: EnhancedRequest) => {
  // Use request macros for enhanced functionality
  const clientIp = req.ip()
  const userAgent = req.userAgent()
  const isMobile = req.isMobile()

  console.log(`Login attempt from ${clientIp} (${isMobile ? 'Mobile' : 'Desktop'})`)

  const { email, password } = req.validated

  // Find user
  const user = await mockDatabase.findUserByEmail(email)
  if (!user || `hashed_${password}` !== user.password) {
    return BuiltInResponseMacros.unauthorized('Invalid credentials')
  }

  // Generate mock JWT token
  const token = `jwt_token_for_${user.id}_${Date.now()}`

  return ResponseWithMacros.callMacro('apiSuccess', {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    token,
    device_info: {
      ip: clientIp,
      user_agent: userAgent,
      is_mobile: isMobile
    }
  }, 'Login successful')
})
.validate({
  email: 'required|email',
  password: 'required|string'
})

router.register(loginRoute)

// Example 3: User List with Pagination and Search
const usersListRoute = new RouteBuilder('GET', '/api/users', async (req: EnhancedRequest) => {
  // Use request macros for input handling
  const page = parseInt(req.query('page', '1'))
  const limit = parseInt(req.query('limit', '10'))
  const search = req.query('search')

  // Validate pagination parameters
  if (page < 1 || limit < 1 || limit > 100) {
    return ResponseWithMacros.callMacro('apiError', 'Invalid pagination parameters')
  }

  // Get paginated users
  const result = await mockDatabase.getUsersPaginated(page, limit, search)

  return BuiltInResponseMacros.paginated(result.data, {
    current_page: page,
    per_page: limit,
    total: result.total,
    path: req.path()
  })
})

router.register(usersListRoute)

// Example 4: User Profile Update with Partial Validation
const updateProfileRoute = new RouteBuilder('PUT', '/api/users/{id}', async (req: EnhancedRequest) => {
  const userId = parseInt(req.param('id'))

  // Check if user exists
  const existingUser = mockDatabase.users.find(u => u.id === userId)
  if (!existingUser) {
    return BuiltInResponseMacros.notFound('User not found')
  }

  // Get only the fields that were provided
  const updateData = req.only(['name', 'email'])

  // Check for email uniqueness if email is being updated
  if (updateData.email && updateData.email !== existingUser.email) {
    const emailExists = await mockDatabase.findUserByEmail(updateData.email)
    if (emailExists) {
      return BuiltInResponseMacros.validationError({
        email: ['Email address is already taken']
      })
    }
  }

  // Update user
  const updatedUser = await mockDatabase.updateUser(userId, updateData)

  return BuiltInResponseMacros.updated(updatedUser, 'Profile updated successfully')
})
.validate({
  name: 'string|min:2|max:50',
  email: 'email'
})

router.register(updateProfileRoute)

// Example 5: File Upload with Validation
const uploadRoute = new RouteBuilder('POST', '/api/upload', async (req: EnhancedRequest) => {
  // Check if file was uploaded
  if (!req.hasFile('document')) {
    return BuiltInResponseMacros.error('No file uploaded')
  }

  const file = req.file('document')
  const metadata = req.validated

  // Mock file processing
  const savedFile = {
    id: Date.now(),
    name: file.name || 'uploaded_file',
    size: file.size || 0,
    type: metadata.type,
    description: metadata.description,
    url: `/uploads/${Date.now()}_${file.name}`,
    uploaded_at: new Date().toISOString()
  }

  return BuiltInResponseMacros.created(savedFile, 'File uploaded successfully')
})
.validate({
  type: 'required|in:document,image,video',
  description: 'string|max:500'
})

router.register(uploadRoute)

// Example 6: Admin Route with Role-based Access
const adminUsersRoute = new RouteBuilder('GET', '/api/admin/users', async (req: EnhancedRequest) => {
  // Mock authentication check
  const token = req.bearerToken()
  if (!token) {
    return BuiltInResponseMacros.unauthorized('Authentication required')
  }

  // Mock role check (in real app, decode JWT and check role)
  const isAdmin = token.includes('admin') // Simplified check
  if (!isAdmin) {
    return BuiltInResponseMacros.forbidden('Admin access required')
  }

  // Return all users with sensitive information for admin
  const users = mockDatabase.users.map(user => ({
    ...user,
    last_login: new Date().toISOString(),
    ip_address: req.ip()
  }))

  return ResponseWithMacros.callMacro('apiSuccess', users, 'Admin user list retrieved')
})

router.register(adminUsersRoute)

// Example 7: Health Check Endpoint
const healthRoute = new RouteBuilder('GET', '/health', async (req: EnhancedRequest) => {
  const checks = {
    database: 'healthy',
    memory: process.memoryUsage ? 'healthy' : 'unknown',
    uptime: process.uptime ? `${Math.floor(process.uptime())}s` : 'unknown'
  }

  return BuiltInResponseMacros.health('healthy', checks)
})

router.register(healthRoute)

// Example 8: Complex Validation with Custom Rules
const complexValidationRoute = new RouteBuilder('POST', '/api/complex', async (req: EnhancedRequest) => {
  const data = req.validated

  return ResponseWithMacros.callMacro('apiSuccess', {
    message: 'Complex validation passed',
    validated_data: data
  })
})
.validate({
  // Basic fields
  username: rule().required().string().min(3).max(20).alphaDash().build(),
  email: rule().required().email().build(),

  // Nested validation
  'profile.first_name': 'required|string|min:2|max:30',
  'profile.last_name': 'required|string|min:2|max:30',
  'profile.bio': 'string|max:500',

  // Array validation
  tags: 'required|array',
  'tags.*': 'string|max:20',

  // Conditional validation
  phone: 'required_if:contact_method,phone|regex:^\\+?[1-9]\\d{1,14}$',

  // Date validation
  birth_date: 'required|date|before:today',

  // File validation (if file upload)
  avatar: 'image|max:2048', // 2MB max

  // Custom business rules
  referral_code: 'string|min:6|max:10|alpha_num'
})

router.register(complexValidationRoute)

// Example 9: API Versioning with Response Macros
ResponseWithMacros.macro('v2ApiSuccess', (data: any, message = 'Success') => {
  return new Response(JSON.stringify({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    version: '2.0',
    meta: {
      api_version: '2.0',
      response_time: Date.now(),
      server: 'bun-router'
    }
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Version': '2.0'
    }
  })
})

const v2UsersRoute = new RouteBuilder('GET', '/api/v2/users', async (req: EnhancedRequest) => {
  const users = mockDatabase.users
  return ResponseWithMacros.callMacro('v2ApiSuccess', users, 'Users retrieved')
})

router.register(v2UsersRoute)

// Example 10: Middleware Composition
const apiValidationMiddleware = validate()
  .field('api_key', 'required|string|min:32')
  .messages({
    'api_key.required': 'API key is required',
    'api_key.min': 'Invalid API key format'
  })
  .build()

const protectedRoute = new RouteBuilder('GET', '/api/protected', async (req: EnhancedRequest) => {
  return ResponseWithMacros.callMacro('apiSuccess', {
    message: 'Access granted to protected resource',
    user_id: 'extracted_from_api_key'
  })
})

// Apply additional middleware (in real router implementation)
// router.use('/api/protected', apiValidationMiddleware)
router.register(protectedRoute)

// Example server setup (pseudo-code)
console.log('Request/Response Enhancements Example')
console.log('=====================================')
console.log('')
console.log('Available routes:')
router.getRoutes().forEach(route => {
  console.log(`${route.method.padEnd(6)} ${route.path}`)
})

console.log('')
console.log('Example requests:')
console.log('')
console.log('1. User Registration:')
console.log('POST /api/register')
console.log(JSON.stringify({
  name: 'John Doe',
  email: 'john@example.com',
  password: 'secretpassword',
  password_confirmation: 'secretpassword',
  age: 25,
  terms: true
}, null, 2))

console.log('')
console.log('2. User Login:')
console.log('POST /api/login')
console.log(JSON.stringify({
  email: 'john@example.com',
  password: 'secretpassword'
}, null, 2))

console.log('')
console.log('3. Get Users (with pagination):')
console.log('GET /api/users?page=1&limit=10&search=john')

console.log('')
console.log('4. Update Profile:')
console.log('PUT /api/users/1')
console.log(JSON.stringify({
  name: 'John Updated',
  email: 'john.updated@example.com'
}, null, 2))

console.log('')
console.log('5. Complex Validation:')
console.log('POST /api/complex')
console.log(JSON.stringify({
  username: 'johndoe123',
  email: 'john@example.com',
  profile: {
    first_name: 'John',
    last_name: 'Doe',
    bio: 'Software developer'
  },
  tags: ['developer', 'javascript', 'typescript'],
  phone: '+1234567890',
  birth_date: '1990-01-01',
  referral_code: 'ABC123'
}, null, 2))

// Export for use in actual server
export { router, mockDatabase }
