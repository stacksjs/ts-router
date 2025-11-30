import type { EnhancedRequest } from '../src/types'
import { beforeEach, describe, expect, it } from 'bun:test'
import { Router } from '../src/router/index'

describe('CLI Commands', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  describe('Health Check Command', () => {
    it('should analyze router health correctly', async () => {
      // Test health metrics calculation
      expect(router.routes).toBeDefined()
      expect(router.globalMiddleware).toBeDefined()
      expect(router.namedRoutes).toBeDefined()

      // Verify empty router state
      expect(router.routes.length).toBe(0)
      expect(router.globalMiddleware.length).toBe(0)
      expect(router.namedRoutes.size).toBe(0)
    })

    it('should handle routes with different characteristics', async () => {
      // Add some test routes
      await router.get('/test', () => new Response('test'))
      await router.post('/users', () => new Response('create user'))
      await router.get('/admin/dashboard', () => new Response('admin'), 'web', 'admin.dashboard')
      await router.get('/users/{id}', (req: EnhancedRequest) => new Response(`User ${req.params.id}`)) // Dynamic route

      // Verify routes were added
      expect(router.routes.length).toBe(4)
      expect(router.namedRoutes.size).toBe(1)

      // Test route analysis
      const routes = router.routes
      const staticRoutes = routes.filter(r => !r.path.includes('{') && !r.path.includes('*'))
      const dynamicRoutes = routes.filter(r => r.path.includes('{') || r.path.includes('*'))

      expect(staticRoutes.length).toBe(3)
      expect(dynamicRoutes.length).toBe(1)
    })

    it('should detect duplicate routes', async () => {
      // Add duplicate routes manually to test detection
      const duplicateRoute = {
        method: 'GET',
        path: '/duplicate',
        handler: () => new Response('test'),
        middleware: [],
        params: {},
      }

      router.routes.push(duplicateRoute)
      router.routes.push({ ...duplicateRoute }) // Same route twice

      // Create a map to detect duplicates
      const routeMap = new Map<string, number>()
      for (const route of router.routes) {
        const key = `${route.method}:${route.path}`
        routeMap.set(key, (routeMap.get(key) || 0) + 1)
      }

      const duplicates = Array.from(routeMap.entries()).filter(([_, count]) => count > 1)
      expect(duplicates.length).toBe(1)
      expect(duplicates[0][0]).toBe('GET:/duplicate')
    })
  })

  describe('Route Validation Logic', () => {
    it('should validate clean routes successfully', async () => {
      await router.get('/users', () => new Response('users'))
      await router.post('/users', () => new Response('create user'))

      // Test validation logic directly
      const routes = router.routes
      const issues = []

      for (const route of routes) {
        if (!route.method) {
          issues.push(`Route missing method: ${route.path}`)
        }
        if (!route.path) {
          issues.push(`Route missing path: ${route.method || 'UNKNOWN'}`)
        }
        if (!route.handler) {
          issues.push(`Route missing handler: ${route.method} ${route.path}`)
        }
        if (route.path && !route.path.startsWith('/')) {
          issues.push(`Route path should start with '/': ${route.method} ${route.path}`)
        }
      }

      expect(issues.length).toBe(0)
    })

    it('should detect validation issues', async () => {
      // Add routes with issues
      const routeWithBadPath = {
        method: 'GET',
        path: 'no-leading-slash', // Missing leading slash
        handler: () => new Response('test'),
        middleware: [],
        params: {},
      }

      const routeWithBadParam = {
        method: 'GET',
        path: '/users/{123invalid}', // Invalid parameter name
        handler: () => new Response('test'),
        middleware: [],
        params: {},
      }

      router.routes.push(routeWithBadPath)
      router.routes.push(routeWithBadParam)

      // Test validation logic
      const routes = router.routes
      const issues = []

      for (const route of routes) {
        if (route.path && !route.path.startsWith('/')) {
          issues.push(`Route path should start with '/': ${route.method} ${route.path}`)
        }

        if (route.path && route.path.includes('{')) {
          const params = route.path.match(/\{[^}]+\}/g) || []
          for (const param of params) {
            if (!param.match(/^\{[a-z_]\w*(\?|:[^}]+)?\}$/i)) {
              issues.push(`Invalid parameter syntax in ${route.method} ${route.path}: ${param}`)
            }
          }
        }
      }

      expect(issues.length).toBeGreaterThan(0)
      expect(issues.some(issue => issue.includes('should start with \'/\''))).toBe(true)
      expect(issues.some(issue => issue.includes('Invalid parameter syntax'))).toBe(true)
    })

    it('should detect admin routes without middleware in strict mode', async () => {
      await router.get('/admin/users', () => new Response('admin users')) // Admin route without middleware

      const routes = router.routes
      const warnings = []

      for (const route of routes) {
        if (route.path.includes('/admin') && (!route.middleware || route.middleware.length === 0)) {
          warnings.push(`Admin route missing middleware: ${route.method} ${route.path}`)
        }
      }

      expect(warnings.length).toBe(1)
      expect(warnings[0]).toContain('Admin route missing middleware')
    })
  })

  describe('Route Debugging Logic', () => {
    it('should match routes successfully', async () => {
      await router.get('/users/{id}', (req: EnhancedRequest) => new Response(`User ${req.params.id}`), 'web', 'users.show')

      // Test route matching functionality
      expect(router.matchRoute).toBeDefined()

      const match = router.matchRoute('/users/123', 'GET')
      expect(match).toBeDefined()
      expect(match?.route.path).toBe('/users/{id}')
      expect(match?.route.method).toBe('GET')
      expect(match?.route.name).toBe('users.show')
      expect(match?.params.id).toBe('123')
    })

    it('should handle non-matching routes', async () => {
      await router.get('/users', () => new Response('users'))
      await router.post('/users', () => new Response('create'))

      const match = router.matchRoute('/nonexistent', 'GET')
      expect(match).toBeUndefined()

      // Test filtering routes by method
      const routes = router.routes
      const getRoutes = routes.filter(r => r.method === 'GET')
      const postRoutes = routes.filter(r => r.method === 'POST')

      expect(getRoutes.length).toBe(1)
      expect(postRoutes.length).toBe(1)
    })

    it('should handle routes with optional parameters', async () => {
      await router.get('/products/{category}/{id?}', (req: EnhancedRequest) => {
        if (req.params.id) {
          return new Response(`Product ${req.params.id} in ${req.params.category}`)
        }
        return new Response(`Category ${req.params.category}`)
      })

      // Test route matching with optional parameters
      const matchWithId = router.matchRoute('/products/electronics/123', 'GET')
      expect(matchWithId).toBeDefined()
      expect(matchWithId?.params.category).toBe('electronics')
      expect(matchWithId?.params.id).toBe('123')

      const matchWithoutId = router.matchRoute('/products/electronics', 'GET')
      expect(matchWithoutId).toBeDefined()
      expect(matchWithoutId?.params.category).toBe('electronics')
      expect(matchWithoutId?.params.id).toBeUndefined()
    })
  })

  describe('Cache Management Logic', () => {
    it('should have cache management capabilities', async () => {
      // Test cache data structures exist
      expect(router.routeCache).toBeDefined()
      expect(router.templateCache).toBeDefined()

      // Test cache methods exist
      expect(router.clearRouteCache).toBeDefined()

      // Add some cache data
      router.routeCache.set('test-key', { route: {} as any, params: {} })
      router.templateCache.set('template-key', '<html>test</html>')

      expect(router.routeCache.size).toBe(1)
      expect(router.templateCache.size).toBe(1)

      // Test clearing individual caches
      router.routeCache.clear()
      router.templateCache.clear()

      expect(router.routeCache.size).toBe(0)
      expect(router.templateCache.size).toBe(0)
    })

    it('should provide cache statistics when available', async () => {
      // Test if cache stats method exists
      if (router.getCacheStats) {
        const stats = router.getCacheStats()
        expect(stats).toBeDefined()
      }

      if (router.getRouteStats) {
        const routeStats = router.getRouteStats()
        expect(routeStats).toBeDefined()
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle missing routes gracefully', async () => {
      // Test with empty router
      expect(router.routes.length).toBe(0)

      const match = router.matchRoute('/nonexistent', 'GET')
      expect(match).toBeUndefined()
    })

    it('should handle route matcher edge cases', async () => {
      // Test router with minimal configuration
      const emptyRouter = new Router()
      expect(emptyRouter.routes).toBeDefined()
      expect(emptyRouter.globalMiddleware).toBeDefined()
      expect(emptyRouter.namedRoutes).toBeDefined()

      const match = emptyRouter.matchRoute('/test', 'GET')
      expect(match).toBeUndefined()
    })
  })

  describe('CLI Integration', () => {
    it('should create CLI instance', async () => {
      const { createCLI } = await import('../src/cli/index')

      const cli = createCLI()
      expect(cli).toBeDefined()

      // Test that CLI has the expected commands
      const commands = (cli as any).commands
      expect(commands).toBeDefined()
      expect(Array.isArray(commands)).toBe(true)

      const commandNames = commands.map((cmd: any) => cmd.name)

      expect(commandNames).toContain('route:list')
      expect(commandNames).toContain('route:types')
      expect(commandNames).toContain('middleware:types')
      expect(commandNames).toContain('middleware:map')
      expect(commandNames).toContain('router:types')
      expect(commandNames).toContain('openapi')
      expect(commandNames).toContain('health')
      expect(commandNames).toContain('test:routes')
      expect(commandNames).toContain('debug:route')
      expect(commandNames).toContain('cache:clear')
      expect(commandNames).toContain('validate')
    })

    it('should have version information', async () => {
      const { createCLI } = await import('../src/cli/index')

      const cli = createCLI()
      expect(cli).toBeDefined()
      expect((cli as any).version).toBeDefined()
    })
  })

  describe('Utility Functions', () => {
    it('should format method colors correctly', async () => {
      const { getMethodColor } = await import('../src/cli/utils')

      expect(getMethodColor('GET')).toBeDefined()
      expect(getMethodColor('POST')).toBeDefined()
      expect(getMethodColor('PUT')).toBeDefined()
      expect(getMethodColor('DELETE')).toBeDefined()
      expect(getMethodColor('PATCH')).toBeDefined()
      expect(getMethodColor('OPTIONS')).toBeDefined()
      expect(getMethodColor('UNKNOWN')).toBeDefined()
    })

    it('should pad strings correctly', async () => {
      const { padString } = await import('../src/cli/utils')

      expect(padString('test', 10)).toBe('test      ')
      expect(padString('longer text', 5)).toBe('longe')
      expect(padString('exact', 5)).toBe('exact')
    })

    it('should format logger messages', async () => {
      const { format } = await import('../src/cli/utils')

      expect(format.success('test')).toContain('✨')
      expect(format.error('test')).toBeDefined()
      expect(format.warning('test')).toBeDefined()
      expect(format.info('test')).toBeDefined()
      expect(format.dim('test')).toBeDefined()
      expect(format.bold('test')).toBeDefined()
    })

    it('should provide logger interface', async () => {
      const { logger } = await import('../src/cli/utils')

      // Test logger methods exist and don't throw
      expect(typeof logger.success).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warning).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.debug).toBe('function')
    })
  })
})
