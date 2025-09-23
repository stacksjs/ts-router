import process from 'node:process'
import chalk from 'chalk'

/**
 * Formats console output with consistent styling
 */
export const format = {
  success: (message: string): string => chalk.green(`✨ ${message}`),
  info: (message: string): string => chalk.blue(message),
  warning: (message: string): string => chalk.yellow(message),
  error: (message: string): string => chalk.red(message),
  dim: (message: string): string => chalk.dim(message),
  bold: (message: string): string => chalk.bold(message),
}

/**
 * Logger for CLI commands with consistent styling
 */
export const logger = {
  success: (message: string): void => console.log(format.success(message)),
  info: (message: string): void => console.log(format.info(message)),
  warning: (message: string): void => console.log(format.warning(message)),
  error: (message: string): void => console.error(format.error(message)),
  debug: (message: string): void => console.debug(format.dim(message)),
}

/**
 * Load router instance from the application
 */
export async function loadRouter(): Promise<any> {
  try {
    const routesFile = `${process.cwd()}/routes/index.ts`
    const { router } = await import(routesFile)

    if (!router) {
      logger.error(`Could not find router instance in ${routesFile}.`)
      process.exit(1)
    }

    return router
  }
  catch (error: any) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      logger.error(`Routes file not found at ${process.cwd()}/routes/index.ts`)
      logger.warning('Make sure your routes are defined and exported as "router" in routes/index.ts')
    }
    else {
      logger.error(`Error loading router: ${error.message}`)
    }
    throw error
  }
}

/**
 * Setup a debounced file watcher
 */
export function setupDebouncedWatcher(
  callback: () => Promise<void>,
  _debounceTime = 500,
): { timeoutId: NodeJS.Timeout | null } {
  const state = { timeoutId: null as NodeJS.Timeout | null }

  return state
}

/**
 * Utility to get method color for console output
 */
export function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return chalk.cyan.toString()
    case 'POST':
      return chalk.green.toString()
    case 'PUT':
      return chalk.yellow.toString()
    case 'PATCH':
      return chalk.yellow.toString()
    case 'DELETE':
      return chalk.red.toString()
    case 'OPTIONS':
      return chalk.gray.toString()
    default:
      return chalk.white.toString()
  }
}

/**
 * Pad a string to a specified length
 */
export function padString(str: string, length: number): string {
  return (str + ' '.repeat(length)).substring(0, length)
}

/**
 * Check router health and configuration
 */
export async function checkRouterHealth(options: { verbose?: boolean }): Promise<void> {
  logger.info('🔍 Checking router health...')

  try {
    const router = await loadRouter()
    const routes = router.routes || []
    const globalMiddleware = router.globalMiddleware || []
    const namedRoutes = router.namedRoutes || new Map()

    // Basic health metrics
    const health = {
      totalRoutes: routes.length,
      namedRoutes: namedRoutes.size,
      globalMiddleware: globalMiddleware.length,
      routesByMethod: {} as Record<string, number>,
      duplicateRoutes: [] as Array<{ path: string, method: string }>,
      routesWithMiddleware: 0,
      staticRoutes: 0,
      dynamicRoutes: 0,
    }

    // Analyze routes
    const routeMap = new Map<string, string[]>()
    for (const route of routes) {
      const key = `${route.method}:${route.path}`

      // Count by method
      health.routesByMethod[route.method] = (health.routesByMethod[route.method] || 0) + 1

      // Check for duplicates
      if (!routeMap.has(key)) {
        routeMap.set(key, [])
      }
      routeMap.get(key)!.push(route.path)

      if (routeMap.get(key)!.length > 1) {
        health.duplicateRoutes.push({ path: route.path, method: route.method })
      }

      // Count middleware usage
      if (route.middleware && route.middleware.length > 0) {
        health.routesWithMiddleware++
      }

      // Count static vs dynamic routes
      if (route.path.includes('{') || route.path.includes('*')) {
        health.dynamicRoutes++
      } else {
        health.staticRoutes++
      }
    }

    // Display results
    logger.success(`Router health check completed`)
    console.log(`📊 Routes: ${health.totalRoutes} total (${health.staticRoutes} static, ${health.dynamicRoutes} dynamic)`)
    console.log(`📛 Named routes: ${health.namedRoutes}`)
    console.log(`🛡️  Global middleware: ${health.globalMiddleware}`)
    console.log(`🔧 Routes with middleware: ${health.routesWithMiddleware}`)

    if (options.verbose) {
      console.log('\n📈 Routes by method:')
      for (const [method, count] of Object.entries(health.routesByMethod)) {
        const color = getMethodColor(method)
        console.log(`  ${chalk.hex(color)(method.padEnd(8))}: ${count}`)
      }

      if (health.duplicateRoutes.length > 0) {
        logger.warning(`\n⚠️  Found ${health.duplicateRoutes.length} duplicate route(s):`)
        for (const duplicate of health.duplicateRoutes) {
          console.log(`  ${duplicate.method} ${duplicate.path}`)
        }
      }

      // Check for potential issues
      const issues = []
      if (health.totalRoutes === 0) {
        issues.push('No routes defined')
      }
      if (health.duplicateRoutes.length > 0) {
        issues.push(`${health.duplicateRoutes.length} duplicate routes`)
      }
      if (health.routesWithMiddleware === 0 && health.globalMiddleware === 0) {
        issues.push('No middleware configured')
      }

      if (issues.length > 0) {
        logger.warning('\n⚠️  Potential issues:')
        for (const issue of issues) {
          console.log(`  • ${issue}`)
        }
      } else {
        logger.success('\n✅ No issues detected')
      }
    }
  }
  catch (error: any) {
    logger.error(`Health check failed: ${error.message}`)
    throw error
  }
}

/**
 * Test routes by making HTTP requests
 */
export async function testRoutes(options: {
  baseUrl?: string
  filter?: string
  method?: string
  timeout?: number
}): Promise<void> {
  const baseUrl = options.baseUrl || 'http://localhost:3000'
  const timeout = options.timeout || 5000
  const allowedMethods = options.method ? options.method.split(',').map(m => m.trim().toUpperCase()) : null

  logger.info(`🧪 Testing routes at ${baseUrl}...`)

  try {
    const router = await loadRouter()
    const routes = router.routes || []

    let filteredRoutes = routes

    // Filter by path pattern
    if (options.filter) {
      const pattern = new RegExp(options.filter.replace(/\*/g, '.*'))
      filteredRoutes = routes.filter((route: any) => pattern.test(route.path))
    }

    // Filter by method
    if (allowedMethods) {
      filteredRoutes = filteredRoutes.filter((route: any) => allowedMethods.includes(route.method))
    }

    if (filteredRoutes.length === 0) {
      logger.warning('No routes match the specified filters')
      return
    }

    logger.info(`Testing ${filteredRoutes.length} routes...`)

    const results = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: [] as Array<{ route: string, error: string }>
    }

    for (const route of filteredRoutes) {
      results.total++

      // Skip routes with parameters for now (would need parameter generation)
      if (route.path.includes('{')) {
        logger.debug(`Skipping parameterized route: ${route.method} ${route.path}`)
        continue
      }

      try {
        const url = `${baseUrl}${route.path}`
        const response = await fetch(url, {
          method: route.method,
          signal: AbortSignal.timeout(timeout)
        })

        if (response.status < 500) {
          results.passed++
          logger.debug(`✅ ${route.method} ${route.path} → ${response.status}`)
        } else {
          results.failed++
          results.errors.push({
            route: `${route.method} ${route.path}`,
            error: `HTTP ${response.status}`
          })
        }
      }
      catch (error: any) {
        results.failed++
        results.errors.push({
          route: `${route.method} ${route.path}`,
          error: error.message
        })
      }
    }

    // Display results
    console.log(`\n📊 Test Results:`)
    console.log(`  Total: ${results.total}`)
    console.log(`  Passed: ${chalk.green(results.passed)}`)
    console.log(`  Failed: ${chalk.red(results.failed)}`)

    if (results.errors.length > 0) {
      console.log(`\n❌ Failures:`)
      for (const error of results.errors) {
        console.log(`  ${error.route}: ${error.error}`)
      }
    }

    if (results.failed > 0) {
      process.exit(1)
    } else {
      logger.success('All tests passed!')
    }
  }
  catch (error: any) {
    logger.error(`Route testing failed: ${error.message}`)
    throw error
  }
}

/**
 * Debug route matching for a specific path
 */
export async function debugRoute(path: string, options: {
  method?: string
  verbose?: boolean
}): Promise<void> {
  const method = options.method?.toUpperCase() || 'GET'

  logger.info(`🔍 Debugging route matching for: ${method} ${path}`)

  try {
    const router = await loadRouter()

    // Try to match the route
    const match = router.matchRoute ? router.matchRoute(path, method) : null

    if (match) {
      logger.success(`✅ Route matched!`)
      console.log(`  Route: ${match.route.method} ${match.route.path}`)
      console.log(`  Handler: ${typeof match.route.handler}`)

      if (Object.keys(match.params || {}).length > 0) {
        console.log(`  Parameters:`)
        for (const [key, value] of Object.entries(match.params)) {
          console.log(`    ${key}: ${value}`)
        }
      }

      if (match.route.middleware && match.route.middleware.length > 0) {
        console.log(`  Middleware: ${match.route.middleware.length} handler(s)`)
      }

      if (match.route.name) {
        console.log(`  Named route: ${match.route.name}`)
      }
    } else {
      logger.error(`❌ No route matched for ${method} ${path}`)

      if (options.verbose) {
        console.log('\n📋 Available routes:')
        const routes = router.routes || []
        const methodRoutes = routes.filter((r: any) => r.method === method)

        if (methodRoutes.length === 0) {
          console.log(`  No routes defined for ${method} method`)
        } else {
          for (const route of methodRoutes) {
            console.log(`  ${route.method} ${route.path}`)
          }
        }
      }
    }
  }
  catch (error: any) {
    logger.error(`Route debugging failed: ${error.message}`)
    throw error
  }
}

/**
 * Clear route caches
 */
export async function clearCaches(options: { stats?: boolean }): Promise<void> {
  logger.info('🗑️  Clearing route caches...')

  try {
    const router = await loadRouter()

    if (options.stats) {
      // Show cache statistics before clearing
      if (router.getCacheStats) {
        const stats = router.getCacheStats()
        console.log('📊 Cache statistics before clearing:')
        console.log(`  Hit rate: ${stats.hitRate}%`)
        console.log(`  Total hits: ${stats.hits}`)
        console.log(`  Total misses: ${stats.misses}`)
        console.log(`  Cache size: ${stats.size}`)
      }

      if (router.routeCache) {
        console.log(`  Route cache entries: ${router.routeCache.size}`)
      }

      if (router.templateCache) {
        console.log(`  Template cache entries: ${router.templateCache.size}`)
      }
    }

    // Clear various caches
    if (router.clearRouteCache) {
      router.clearRouteCache()
    }

    if (router.routeCache && router.routeCache.clear) {
      router.routeCache.clear()
    }

    if (router.templateCache && router.templateCache.clear) {
      router.templateCache.clear()
    }

    if (router.clearModelCache) {
      router.clearModelCache()
    }

    logger.success('✅ Caches cleared successfully')
  }
  catch (error: any) {
    logger.error(`Cache clearing failed: ${error.message}`)
    throw error
  }
}

/**
 * Validate route definitions and configuration
 */
export async function validateRoutes(options: {
  strict?: boolean
  fix?: boolean
}): Promise<void> {
  logger.info('🔍 Validating route definitions...')

  try {
    const router = await loadRouter()
    const routes = router.routes || []

    const issues = []
    const warnings = []

    // Check each route
    for (const route of routes) {
      // Check for required properties
      if (!route.method) {
        issues.push(`Route missing method: ${route.path}`)
      }

      if (!route.path) {
        issues.push(`Route missing path: ${route.method || 'UNKNOWN'}`)
      }

      if (!route.handler) {
        issues.push(`Route missing handler: ${route.method} ${route.path}`)
      }

      // Validate path format
      if (route.path && !route.path.startsWith('/')) {
        issues.push(`Route path should start with '/': ${route.method} ${route.path}`)
      }

      // Check for parameter syntax issues
      if (route.path && route.path.includes('{')) {
        const params = route.path.match(/\{[^}]+\}/g) || []
        for (const param of params) {
          if (!param.match(/^\{[a-zA-Z_][a-zA-Z0-9_]*(\?|:[^}]+)?\}$/)) {
            issues.push(`Invalid parameter syntax in ${route.method} ${route.path}: ${param}`)
          }
        }
      }

      // Strict mode validations
      if (options.strict) {
        // Check for missing route names on important routes
        if (!route.name && !route.path.includes('{') && route.path !== '/') {
          warnings.push(`Consider adding a name to route: ${route.method} ${route.path}`)
        }

        // Check for missing middleware on sensitive routes
        if (route.path.includes('/admin') && (!route.middleware || route.middleware.length === 0)) {
          warnings.push(`Admin route missing middleware: ${route.method} ${route.path}`)
        }
      }
    }

    // Check for duplicate routes
    const routeMap = new Map<string, number>()
    for (const route of routes) {
      const key = `${route.method}:${route.path}`
      routeMap.set(key, (routeMap.get(key) || 0) + 1)
    }

    for (const [key, count] of routeMap.entries()) {
      if (count > 1) {
        issues.push(`Duplicate route detected: ${key} (${count} times)`)
      }
    }

    // Display results
    if (issues.length === 0 && warnings.length === 0) {
      logger.success('✅ All route definitions are valid')
      return
    }

    if (issues.length > 0) {
      logger.error(`❌ Found ${issues.length} validation error(s):`)
      for (const issue of issues) {
        console.log(`  • ${issue}`)
      }
    }

    if (warnings.length > 0) {
      logger.warning(`⚠️  Found ${warnings.length} warning(s):`)
      for (const warning of warnings) {
        console.log(`  • ${warning}`)
      }
    }

    if (options.fix) {
      logger.info('🔧 Auto-fixing is not yet implemented')
    }

    if (issues.length > 0) {
      process.exit(1)
    }
  }
  catch (error: any) {
    logger.error(`Route validation failed: ${error.message}`)
    throw error
  }
}
