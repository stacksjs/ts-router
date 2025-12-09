import { describe, expect, test } from 'bun:test'
import {
  CircularDependencyException,
  detectRouteConflicts,
  findSimilarRoutes,
  HandlerResolutionException,
  MiddlewareConfigurationException,
  ModelBindingException,
  RouteConflictException,
  RouteNotFoundException,
  RouterErrorFactory,
} from '../packages/bun-router/src/errors/router-errors'

describe('Router Errors', () => {
  describe('RouteConflictException', () => {
    test('should create error with conflicting routes info', () => {
      const routes = [
        { method: 'GET', path: '/users/{id}', name: 'users.show' },
        { method: 'GET', path: '/users/{userId}', name: 'users.get' },
      ]

      const error = new RouteConflictException(routes)

      expect(error.code).toBe('ROUTE_CONFLICT')
      expect(error.statusCode).toBe(500)
      expect(error.conflictingRoutes).toHaveLength(2)
      expect(error.message).toContain('Route conflict detected')
      expect(error.message).toContain('/users/{id}')
      expect(error.message).toContain('/users/{userId}')
    })

    test('should provide suggestions for static vs dynamic conflict', () => {
      const routes = [
        { method: 'GET', path: '/users/profile' },
        { method: 'GET', path: '/users/{id}' },
      ]

      const error = new RouteConflictException(routes)

      expect(error.suggestion).toContain('Static routes should be defined before dynamic routes')
    })

    test('should provide suggestions for wildcard conflict', () => {
      const routes = [
        { method: 'GET', path: '/files/*' },
        { method: 'GET', path: '/files/{name}' },
      ]

      const error = new RouteConflictException(routes)

      expect(error.suggestion).toContain('Wildcard routes should be defined last')
    })

    test('should serialize to JSON', () => {
      const routes = [
        { method: 'GET', path: '/test', name: 'test.route' },
      ]

      const error = new RouteConflictException(routes)
      const json = error.toJSON()

      expect(json.code).toBe('ROUTE_CONFLICT')
      expect(json.conflictingRoutes).toBeDefined()
      expect(json.suggestion).toBeDefined()
    })
  })

  describe('CircularDependencyException', () => {
    test('should create error with dependency chain', () => {
      const chain = ['ServiceA', 'ServiceB', 'ServiceC', 'ServiceA']

      const error = new CircularDependencyException(chain)

      expect(error.code).toBe('CIRCULAR_DEPENDENCY')
      expect(error.statusCode).toBe(500)
      expect(error.dependencyChain).toEqual(chain)
      expect(error.message).toContain('Circular dependency detected')
      expect(error.message).toContain('ServiceA')
      expect(error.message).toContain('ServiceB')
      expect(error.message).toContain('ServiceC')
    })

    test('should show visual dependency chain', () => {
      const chain = ['A', 'B', 'C']

      const error = new CircularDependencyException(chain)

      // Check for visual elements in message
      expect(error.message).toContain('┌─►')
      expect(error.message).toContain('├─►')
      expect(error.message).toContain('└─►')
      expect(error.message).toContain('cycles back to')
    })

    test('should provide helpful suggestions', () => {
      const chain = ['UserService', 'AuthService']

      const error = new CircularDependencyException(chain)

      expect(error.suggestion).toContain('Break the cycle')
      expect(error.suggestion).toContain('lazy injection')
      expect(error.suggestion).toContain('Restructure your dependencies')
      expect(error.suggestion).toContain('setter injection')
    })

    test('should serialize to JSON', () => {
      const chain = ['A', 'B']
      const error = new CircularDependencyException(chain)
      const json = error.toJSON()

      expect(json.dependencyChain).toEqual(chain)
      expect(json.suggestion).toBeDefined()
    })
  })

  describe('MiddlewareConfigurationException', () => {
    test('should create error with config errors', () => {
      const configErrors = [
        'Missing required option: secret',
        'Invalid algorithm: md5',
      ]

      const error = new MiddlewareConfigurationException('AuthMiddleware', configErrors)

      expect(error.code).toBe('MIDDLEWARE_CONFIGURATION_ERROR')
      expect(error.middlewareName).toBe('AuthMiddleware')
      expect(error.configErrors).toEqual(configErrors)
      expect(error.message).toContain('AuthMiddleware')
      expect(error.message).toContain('Missing required option')
    })

    test('should provide configuration example in suggestion', () => {
      const error = new MiddlewareConfigurationException('CorsMiddleware', ['Invalid origin'])

      expect(error.suggestion).toContain('router.use(new CorsMiddleware')
      expect(error.suggestion).toContain('Check the middleware documentation')
    })
  })

  describe('RouteNotFoundException', () => {
    test('should create error with route info', () => {
      const error = new RouteNotFoundException('POST', '/api/users/create')

      expect(error.code).toBe('ROUTE_NOT_FOUND')
      expect(error.statusCode).toBe(404)
      expect(error.requestedMethod).toBe('POST')
      expect(error.requestedPath).toBe('/api/users/create')
      expect(error.message).toContain('Route not found: POST /api/users/create')
    })

    test('should include similar routes when provided', () => {
      const similarRoutes = [
        { method: 'POST', path: '/api/users', similarity: 0.9 },
        { method: 'GET', path: '/api/users/create', similarity: 0.8 },
      ]

      const error = new RouteNotFoundException('POST', '/api/user/create', similarRoutes)

      expect(error.message).toContain('Did you mean one of these routes?')
      expect(error.message).toContain('/api/users')
      expect(error.message).toContain('90% match')
    })

    test('should detect double slashes in path', () => {
      const error = new RouteNotFoundException('GET', '/api//users')

      expect(error.suggestion).toContain('Remove duplicate slashes')
    })

    test('should detect missing leading slash', () => {
      const error = new RouteNotFoundException('GET', 'api/users')

      expect(error.suggestion).toContain('starts with a forward slash')
    })

    test('should provide method verification hint', () => {
      const error = new RouteNotFoundException('DELETE', '/api/users')

      expect(error.suggestion).toContain('Verify the HTTP method is correct')
      expect(error.suggestion).toContain('DELETE')
    })
  })

  describe('HandlerResolutionException', () => {
    test('should create error for controller method', () => {
      const error = new HandlerResolutionException(
        'UserController@show',
        'Controller not found in container',
      )

      expect(error.code).toBe('HANDLER_RESOLUTION_ERROR')
      expect(error.handlerRef).toBe('UserController@show')
      expect(error.suggestion).toContain('UserController')
      expect(error.suggestion).toContain('show')
      expect(error.suggestion).toContain('Register the controller')
    })

    test('should create error for action path', () => {
      const error = new HandlerResolutionException(
        'actions/CreateUser',
        'File not found',
      )

      expect(error.suggestion).toContain('action class exists')
      expect(error.suggestion).toContain('handle')
    })

    test('should create error for generic handler', () => {
      const error = new HandlerResolutionException(
        'myHandler',
        'Invalid export',
      )

      expect(error.suggestion).toContain('Verify the handler reference')
      expect(error.suggestion).toContain('circular dependencies')
    })
  })

  describe('ModelBindingException', () => {
    test('should create error with model info', () => {
      const error = new ModelBindingException(
        'User',
        'id',
        '999',
        'User not found',
      )

      expect(error.code).toBe('MODEL_BINDING_ERROR')
      expect(error.statusCode).toBe(404)
      expect(error.modelName).toBe('User')
      expect(error.paramName).toBe('id')
      expect(error.paramValue).toBe('999')
      expect(error.message).toContain('Failed to bind model "User"')
    })

    test('should provide model binding example', () => {
      const error = new ModelBindingException('Post', 'slug', 'hello-world', 'Not found')

      expect(error.suggestion).toContain('router.model')
      expect(error.suggestion).toContain('slug')
      expect(error.suggestion).toContain('findUnique')
    })
  })

  describe('findSimilarRoutes', () => {
    const routes = [
      { method: 'GET', path: '/api/users' },
      { method: 'POST', path: '/api/users' },
      { method: 'GET', path: '/api/users/{id}' },
      { method: 'GET', path: '/api/posts' },
      { method: 'GET', path: '/api/comments' },
      { method: 'GET', path: '/health' },
    ]

    test('should find similar routes', () => {
      const similar = findSimilarRoutes('/api/user', routes)

      expect(similar.length).toBeGreaterThan(0)
      expect(similar[0].path).toBe('/api/users')
    })

    test('should sort by similarity', () => {
      const similar = findSimilarRoutes('/api/users', routes)

      // First result should be exact match or closest
      expect(similar[0].similarity).toBeGreaterThanOrEqual(similar[similar.length - 1].similarity || 0)
    })

    test('should limit results', () => {
      const similar = findSimilarRoutes('/api', routes, 2)

      expect(similar.length).toBeLessThanOrEqual(2)
    })

    test('should exclude very dissimilar routes', () => {
      const similar = findSimilarRoutes('/completely/different/path', routes)

      // All results should have >30% similarity
      for (const route of similar) {
        expect(route.similarity).toBeGreaterThan(0.3)
      }
    })
  })

  describe('detectRouteConflicts', () => {
    test('should detect exact duplicates', () => {
      const routes = [
        { method: 'GET', path: '/users' },
        { method: 'GET', path: '/users' },
      ]

      const conflicts = detectRouteConflicts(routes)

      expect(conflicts.length).toBe(1)
      expect(conflicts[0]).toHaveLength(2)
    })

    test('should detect parameter conflicts', () => {
      const routes = [
        { method: 'GET', path: '/users/{id}' },
        { method: 'GET', path: '/users/{userId}' },
      ]

      const conflicts = detectRouteConflicts(routes)

      expect(conflicts.length).toBe(1)
    })

    test('should detect static vs dynamic conflicts', () => {
      const routes = [
        { method: 'GET', path: '/users/profile' },
        { method: 'GET', path: '/users/{id}' },
      ]

      const conflicts = detectRouteConflicts(routes)

      expect(conflicts.length).toBe(1)
    })

    test('should detect wildcard conflicts', () => {
      const routes = [
        { method: 'GET', path: '/files/*' },
        { method: 'GET', path: '/files/upload' },
      ]

      const conflicts = detectRouteConflicts(routes)

      expect(conflicts.length).toBe(1)
    })

    test('should not flag different methods as conflicts', () => {
      const routes = [
        { method: 'GET', path: '/users' },
        { method: 'POST', path: '/users' },
      ]

      const conflicts = detectRouteConflicts(routes)

      expect(conflicts.length).toBe(0)
    })

    test('should not flag different paths as conflicts', () => {
      const routes = [
        { method: 'GET', path: '/users' },
        { method: 'GET', path: '/posts' },
      ]

      const conflicts = detectRouteConflicts(routes)

      expect(conflicts.length).toBe(0)
    })
  })

  describe('RouterErrorFactory', () => {
    test('should create RouteConflictException', () => {
      const error = RouterErrorFactory.routeConflict([
        { method: 'GET', path: '/test' },
      ])

      expect(error).toBeInstanceOf(RouteConflictException)
    })

    test('should create CircularDependencyException', () => {
      const error = RouterErrorFactory.circularDependency(['A', 'B'])

      expect(error).toBeInstanceOf(CircularDependencyException)
    })

    test('should create MiddlewareConfigurationException', () => {
      const error = RouterErrorFactory.middlewareConfig('Test', ['error'])

      expect(error).toBeInstanceOf(MiddlewareConfigurationException)
    })

    test('should create RouteNotFoundException', () => {
      const error = RouterErrorFactory.routeNotFound('GET', '/test')

      expect(error).toBeInstanceOf(RouteNotFoundException)
    })

    test('should create HandlerResolutionException', () => {
      const error = RouterErrorFactory.handlerResolution('Handler', 'reason')

      expect(error).toBeInstanceOf(HandlerResolutionException)
    })

    test('should create ModelBindingException', () => {
      const error = RouterErrorFactory.modelBinding('User', 'id', '1', 'not found')

      expect(error).toBeInstanceOf(ModelBindingException)
    })
  })
})
