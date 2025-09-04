# Request/Response Enhancements

Comprehensive Laravel-style request validation, response macros, and enhanced functionality for bun-router.

## Table of Contents

- [Overview](#overview)
- [Request Validation](#request-validation)
- [Response Macros](#response-macros)
- [Request Macros](#request-macros)
- [Router Integration](#router-integration)
- [Examples](#examples)
- [API Reference](#api-reference)

## Overview

The Request/Response Enhancements provide:

- **Laravel-style validation** with 25+ built-in rules
- **Response macros** for common API patterns
- **Request macros** for enhanced request functionality
- **Fluent API** for building validation rules
- **Router integration** with automatic validation middleware

## Request Validation

### Basic Usage

```typescript
import { createValidationMiddleware, rule } from 'bun-router'

// String-based validation rules
const middleware = createValidationMiddleware({
  name: 'required|string|min:2|max:50',
  email: 'required|email|unique:users',
  age: 'required|integer|min:18'
})

// Fluent rule builder
const rules = {
  username: rule().required().string().min(3).alphaDash().build(),
  password: rule().required().string().min(8).confirmed().build()
}
```

### Built-in Validation Rules

#### Basic Rules

- `required` - Field must be present and not empty
- `string` - Field must be a string
- `number` - Field must be a number
- `integer` - Field must be an integer
- `boolean` - Field must be boolean
- `array` - Field must be an array
- `object` - Field must be an object

#### String Rules

- `min:value` - Minimum length/value
- `max:value` - Maximum length/value
- `between:min,max` - Between min and max
- `alpha` - Only letters
- `alpha_num` - Letters and numbers
- `alpha_dash` - Letters, numbers, dashes, underscores

#### Format Rules

- `email` - Valid email address
- `url` - Valid URL
- `uuid` - Valid UUID
- `json` - Valid JSON string
- `regex:pattern` - Matches regex pattern

#### Comparison Rules

- `confirmed` - Must match `field_confirmation`
- `same:field` - Must match another field
- `different:field` - Must be different from another field
- `in:value1,value2` - Must be one of specified values
- `not_in:value1,value2` - Must not be one of specified values

#### Date Rules

- `date` - Valid date
- `after:date` - Date after specified date
- `before:date` - Date before specified date

#### Database Rules

- `unique:table,column` - Unique in database table
- `exists:table,column` - Exists in database table

### Custom Validation Rules

```typescript
import { Validator } from 'bun-router'

const validator = new Validator()

// Register custom rule
validator.registerRule({
  name: 'phone',
  validate: (value) => /^\+?[\d\s-()]+$/.test(value),
  message: 'The :field must be a valid phone number.'
})

// Use custom rule
const errors = await validator.validate(
  { phone: '+1-555-0123' },
  { phone: 'required|phone' }
)
```

### Validation Configuration

```typescript
const validator = new Validator({
  stopOnFirstFailure: true,
  customMessages: {
    'email.required': 'Please provide your email address',
    'password.min': 'Password must be at least 8 characters'
  },
  customAttributes: {
    email: 'email address',
    phone_number: 'phone number'
  }
})
```

## Response Macros

### Built-in Response Macros

```typescript
import { BuiltInResponseMacros } from 'bun-router'

// Success responses
BuiltInResponseMacros.success(data, 'Operation successful')
BuiltInResponseMacros.created(data, 'Resource created')
BuiltInResponseMacros.updated(data, 'Resource updated')
BuiltInResponseMacros.deleted('Resource deleted')

// Error responses
BuiltInResponseMacros.error('Something went wrong', errors, 400)
BuiltInResponseMacros.validationError(validationErrors)
BuiltInResponseMacros.notFound('Resource not found')
BuiltInResponseMacros.unauthorized('Access denied')
BuiltInResponseMacros.forbidden('Insufficient permissions')

// Special responses
BuiltInResponseMacros.noContent()
BuiltInResponseMacros.redirect('/dashboard')
BuiltInResponseMacros.download(fileData, 'report.pdf')
```

### Paginated Responses

```typescript
const users = await getUsersPaginated(page, limit)

const response = BuiltInResponseMacros.paginated(users.data, {
  current_page: page,
  per_page: limit,
  total: users.total,
  path: '/api/users'
})

// Response structure:
{
  "success": true,
  "data": [...],
  "meta": {
    "current_page": 1,
    "per_page": 10,
    "total": 100,
    "last_page": 10,
    "from": 1,
    "to": 10,
    "path": "/api/users",
    "first_page_url": "/api/users?page=1",
    "last_page_url": "/api/users?page=10",
    "next_page_url": "/api/users?page=2",
    "prev_page_url": null
  }
}
```

### Custom Response Macros

```typescript
import { EnhancedResponse } from 'bun-router'

// Register custom macro
EnhancedResponse.macro('apiSuccess', (data, message = 'Success') => {
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

// Use custom macro
const response = EnhancedResponse.callMacro('apiSuccess', userData, 'User retrieved')
```

## Request Macros

### Content Type Detection

```typescript
// In route handler
router.get('/api/data', async (req) => {
  if (req.wantsJson()) {
    return Response.json(data)
  }

  if (req.wantsHtml()) {
    return new Response(renderHtml(data), {
      headers: { 'Content-Type': 'text/html' }
    })
  }
})
```

### Request Information

```typescript
router.post('/api/users', async (req) => {
  // Client information
  const ip = req.ip()
  const userAgent = req.userAgent()
  const isMobile = req.isMobile()
  const isBot = req.isBot()

  // Authentication
  const token = req.bearerToken()
  const basicAuth = req.basicAuth()

  // Input handling
  const name = req.input('name', 'Anonymous')
  const allData = req.all()
  const onlyNameEmail = req.only(['name', 'email'])
  const exceptPassword = req.except(['password'])

  // Validation checks
  if (req.missing('email')) {
    return BuiltInResponseMacros.error('Email is required')
  }

  if (!req.filled('name')) {
    return BuiltInResponseMacros.error('Name cannot be empty')
  }
})
```

### Path and URL Utilities

```typescript
router.get('/admin/*', async (req) => {
  const path = req.path() // '/admin/users'
  const fullUrl = req.fullUrl() // 'https://example.com/admin/users?page=1'
  const root = req.root() // 'https://example.com'

  // Pattern matching
  if (req.is('/admin/users*')) {
    // Handle user admin routes
  }

  // Route information
  const routeName = req.route()
  const fingerprint = req.fingerprint()
})
```

### Cookie and Header Handling

```typescript
router.get('/dashboard', async (req) => {
  // Cookies
  const sessionId = req.cookie('session_id')
  const theme = req.cookie('theme', 'light')
  const allCookies = req.cookies()

  // Headers
  const customHeader = req.header('X-Custom-Header')
  const hasAuth = req.hasHeader('Authorization')
  const allHeaders = req.allHeaders()

  // Referrer
  const referer = req.referer()
})
```

## Router Integration

### Enhanced Route Builder

```typescript
import { EnhancedRouteBuilder } from 'bun-router'

// Route with validation
const route = new EnhancedRouteBuilder('POST', '/users', async (req) => {
  const userData = req.validated // Validated data available
  const user = await createUser(userData)
  return BuiltInResponseMacros.created(user)
})
.validate({
  name: 'required|string|min:2|max:50',
  email: 'required|email|unique:users',
  password: 'required|string|min:8|confirmed'
})
.build()
```

### Validation Middleware Builder

```typescript
import { validate } from 'bun-router'

const validationMiddleware = validate()
  .field('name', 'required|string|min:2')
  .field('email', 'required|email')
  .field('age', 'required|integer|min:18')
  .stopOnFirstFailure()
  .messages({
    'name.required': 'Please provide your name',
    'email.email': 'Please provide a valid email'
  })
  .build()

router.use('/api/users', validationMiddleware)
```

### Enhancement Presets

```typescript
import { EnhancementPresets } from 'bun-router'

// API preset with JSON validation and response macros
router.use('/api/*', ...EnhancementPresets.api())

// Web preset with request enhancements
router.use('/web/*', ...EnhancementPresets.web())

// Validation preset
router.use('/admin/*', ...EnhancementPresets.validation({
  api_key: 'required|string|min:32'
}))
```

## Examples

### Complete User Registration

```typescript
import {
  EnhancedRouteBuilder,
  BuiltInResponseMacros,
  rule
} from 'bun-router'

const registerRoute = new EnhancedRouteBuilder('POST', '/register', async (req) => {
  try {
    // Validated data is available in req.validated
    const userData = req.validated

    // Create user
    const user = await User.create({
      name: userData.name,
      email: userData.email,
      password: await hashPassword(userData.password)
    })

    // Generate token
    const token = generateJWT(user)

    return BuiltInResponseMacros.created({
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token
    }, 'Registration successful')

  } catch (error) {
    if (error.code === 'DUPLICATE_EMAIL') {
      return BuiltInResponseMacros.validationError({
        email: ['Email address is already registered']
      })
    }

    return BuiltInResponseMacros.serverError('Registration failed')
  }
})
.validate({
  name: rule().required().string().min(2).max(50).build(),
  email: rule().required().email().unique('users', 'email').build(),
  password: rule().required().string().min(8).confirmed().build(),
  terms: rule().required().boolean().build()
}, {
  customMessages: {
    'name.required': 'Please provide your full name',
    'email.unique': 'This email address is already registered',
    'password.confirmed': 'Password confirmation does not match',
    'terms.required': 'You must accept the terms and conditions'
  }
})

router.register(registerRoute)
```

### API Resource with Pagination

```typescript
router.get('/api/users', async (req) => {
  const page = parseInt(req.query('page', '1'))
  const limit = parseInt(req.query('limit', '10'))
  const search = req.query('search')

  // Validate pagination parameters
  if (page < 1 || limit < 1 || limit > 100) {
    return BuiltInResponseMacros.error('Invalid pagination parameters')
  }

  const users = await User.paginate({
    page,
    limit,
    search,
    select: ['id', 'name', 'email', 'created_at']
  })

  return BuiltInResponseMacros.paginated(users.data, {
    current_page: page,
    per_page: limit,
    total: users.total,
    path: req.path()
  })
})
```

### File Upload with Validation

```typescript
const uploadRoute = new EnhancedRouteBuilder('POST', '/upload', async (req) => {
  const file = req.file('document')

  if (!file) {
    return BuiltInResponseMacros.error('No file uploaded')
  }

  // Process file upload
  const savedFile = await saveFile(file)

  return BuiltInResponseMacros.created({
    file: {
      id: savedFile.id,
      name: savedFile.name,
      size: savedFile.size,
      url: savedFile.url
    }
  }, 'File uploaded successfully')
})
.validate({
  title: 'required|string|max:100',
  description: 'string|max:500',
  category: 'required|in:document,image,video'
})
```

## API Reference

### Validation Classes

#### `Validator`

- `validate(data, rules)` - Validate data against rules
- `validateOrFail(data, rules)` - Validate and throw on failure
- `registerRule(rule)` - Register custom validation rule

#### `ValidationRuleBuilder`

- Fluent API for building validation rules
- All built-in rules available as methods
- `build()` - Returns rule string

### Response Classes

#### `EnhancedResponse`

- `macro(name, handler)` - Register response macro
- `callMacro(name, ...args)` - Call registered macro
- `hasMacro(name)` - Check if macro exists

### Request Enhancement

#### Request Macros

- Content type detection: `wantsJson()`, `wantsHtml()`, `expectsJson()`
- Device detection: `isMobile()`, `isBot()`
- Security: `isSecure()`, `bearerToken()`, `basicAuth()`
- Input handling: `input()`, `all()`, `only()`, `except()`
- Validation: `has()`, `filled()`, `missing()`

### Router Integration

#### `EnhancedRouteBuilder`

- `validate(rules, config)` - Add validation to route
- `build()` - Build route with middleware

#### Middleware Builders

- `validate()` - Fluent validation middleware builder
- `createValidationMiddleware(rules, config)` - Create validation middleware

### Presets

#### `EnhancementPresets`

- `api()` - API-focused middleware stack
- `web()` - Web application middleware stack
- `validation(rules)` - Validation-focused middleware stack

## Best Practices

1. **Use fluent rule builder** for complex validation
2. **Register custom macros** for common response patterns
3. **Leverage request macros** for cleaner route handlers
4. **Use validation presets** for consistent validation across routes
5. **Handle validation errors gracefully** with appropriate HTTP status codes
6. **Cache validation rules** for better performance
7. **Use custom messages** for better user experience
