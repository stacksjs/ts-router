import type { GenerateMiddlewareTypesOptions, MapMiddlewareOptions } from './middleware'
import type { OpenAPIOptions } from './openapi'
import type { GenerateRouterTypesOptions } from './router'
import type { GenerateRouteTypesOptions, RouteListOptions } from './routes'
import process from 'node:process'
import { CAC } from 'cac'
import { version } from '../../package.json'
import { generateMiddlewareMap, generateMiddlewareTypes, watchDirectoryForMiddleware, watchMiddlewareDirectory } from './middleware'
import { generateOpenAPISpec } from './openapi'
import { generateRouterTypes, watchRouterFiles } from './router'
import { displayRoutes, generateRouteTypes, watchRoutesDirectory } from './routes'
import { checkRouterHealth, clearCaches, debugRoute, testRoutes, validateRoutes } from './utils'

/**
 * Create and configure the CLI
 */
export function createCLI(): CAC {
  const cli = new CAC('router')

  // Set version info
  cli.version(version)

  // Register commands
  registerRouteCommands(cli)
  registerMiddlewareCommands(cli)
  registerRouterCommands(cli)
  registerOpenAPICommands(cli)
  registerUtilityCommands(cli)

  // Add help command
  cli.help()

  return cli
}

/**
 * Register route-related commands
 */
function registerRouteCommands(cli: CAC): void {
  cli
    .command('route:list', 'List all registered routes')
    .option('-v, --verbose', 'Show detailed information including middleware')
    .option('-vv, --extra-verbose', 'Show very detailed information')
    .option('--path <path>', 'Filter routes by path prefix')
    .option('--except-vendor', 'Exclude vendor routes')
    .option('--only-vendor', 'Show only vendor routes')
    .example('router route:list')
    .example('router route:list -v')
    .example('router route:list --path=/api')
    .action(async (options: RouteListOptions) => {
      try {
        await displayRoutes(options)
      }
      catch (error: any) {
        console.error(`Failed to list routes: ${error.message}`)
        process.exit(1)
      }
    })

  cli
    .command('route:types', 'Generate TypeScript types for route names')
    .option('--output <file>', 'Output file path', { default: 'route-types.ts' })
    .option('--watch', 'Watch for changes in routes directory')
    .example('router route:types')
    .example('router route:types --output src/types/routes.ts')
    .example('router route:types --watch')
    .action(async (options: GenerateRouteTypesOptions) => {
      try {
        const outputPath = options.output || 'route-types.ts'
        if (options.watch) {
          await watchRoutesDirectory(outputPath)
        }
        else {
          await generateRouteTypes(outputPath)
        }
      }
      catch (error: any) {
        console.error(`Failed to generate route types: ${error.message}`)
        process.exit(1)
      }
    })
}

/**
 * Register middleware-related commands
 */
function registerMiddlewareCommands(cli: CAC): void {
  cli
    .command('middleware:types', 'Generate TypeScript types for middleware configurations')
    .option('--output <file>', 'Output file path', { default: 'middleware-types.ts' })
    .option('--watch', 'Watch for changes in middleware directory')
    .example('router middleware:types')
    .example('router middleware:types --output src/types/middleware.ts')
    .example('router middleware:types --watch')
    .action(async (options: GenerateMiddlewareTypesOptions) => {
      try {
        const outputPath = options.output || 'middleware-types.ts'
        if (options.watch) {
          await watchMiddlewareDirectory(outputPath)
        }
        else {
          await generateMiddlewareTypes(outputPath)
        }
      }
      catch (error: any) {
        console.error(`Failed to generate middleware types: ${error.message}`)
        process.exit(1)
      }
    })

  cli
    .command('middleware:map', 'Generate TypeScript types for all middleware in the project')
    .option('--dir <directory>', 'Directory to scan for middleware classes', { default: 'src' })
    .option('--output <file>', 'Output file path', { default: 'middleware-map.ts' })
    .option('--watch', 'Watch for changes in the specified directory')
    .example('router middleware:map')
    .example('router middleware:map --dir app')
    .example('router middleware:map --output src/types/project-middleware.ts')
    .example('router middleware:map --watch')
    .action(async (options: MapMiddlewareOptions) => {
      try {
        const outputPath = options.output || 'middleware-map.ts'
        const directoryPath = options.dir || 'src'

        if (options.watch) {
          await watchDirectoryForMiddleware(directoryPath, outputPath)
        }
        else {
          await generateMiddlewareMap(directoryPath, outputPath)
        }
      }
      catch (error: any) {
        console.error(`Failed to generate middleware map: ${error.message}`)
        process.exit(1)
      }
    })
}

/**
 * Register router extension-related commands
 */
function registerRouterCommands(cli: CAC): void {
  cli
    .command('router:types', 'Generate TypeScript types for router extensions')
    .option('--output <file>', 'Output file path', { default: 'router-types.ts' })
    .option('--watch', 'Watch for changes in router files')
    .example('router router:types')
    .example('router router:types --output src/types/router.ts')
    .example('router router:types --watch')
    .action(async (options: GenerateRouterTypesOptions) => {
      try {
        const outputPath = options.output || 'router-types.ts'
        if (options.watch) {
          await watchRouterFiles(outputPath)
        }
        else {
          await generateRouterTypes(outputPath)
        }
      }
      catch (error: any) {
        console.error(`Failed to generate router types: ${error.message}`)
        process.exit(1)
      }
    })
}

/**
 * Register OpenAPI-related commands
 */
function registerOpenAPICommands(cli: CAC): void {
  cli
    .command('openapi', 'Generate OpenAPI specification for API routes')
    .option('--output <file>', 'Output file path', { default: 'openapi.json' })
    .option('--title <title>', 'API title', { default: 'API Documentation' })
    .option('--version <version>', 'API version', { default: '1.0.0' })
    .option('--description <description>', 'API description')
    .option('--base-path <path>', 'Base API path', { default: '/' })
    .option('--servers <urls>', 'Comma-separated list of server URLs')
    .option('--tags', 'Group endpoints by tags', { default: true })
    .option('--security', 'Include security schemes if available', { default: true })
    .example('router openapi')
    .example('router openapi --output api-spec.json')
    .example('router openapi --title "My API" --version 2.0')
    .example('router openapi --servers http://localhost:3000,https://api.example.com')
    .action(async (options: OpenAPIOptions) => {
      try {
        await generateOpenAPISpec(options)
      }
      catch (error: any) {
        console.error(`Failed to generate OpenAPI specification: ${error.message}`)
        process.exit(1)
      }
    })
}

/**
 * Register utility commands for debugging and development
 */
function registerUtilityCommands(cli: CAC): void {
  cli
    .command('health', 'Check router health and configuration')
    .option('--verbose', 'Show detailed health information')
    .example('router health')
    .example('router health --verbose')
    .action(async (options: { verbose?: boolean }) => {
      try {
        await checkRouterHealth(options)
      }
      catch (error: any) {
        console.error(`Health check failed: ${error.message}`)
        process.exit(1)
      }
    })

  cli
    .command('test:routes', 'Test routes by making HTTP requests')
    .option('--base-url <url>', 'Base URL for testing', { default: 'http://localhost:3000' })
    .option('--filter <pattern>', 'Filter routes by path pattern')
    .option('--method <methods>', 'Test only specific HTTP methods (comma-separated)')
    .option('--timeout <ms>', 'Request timeout in milliseconds', { default: 5000 })
    .example('router test:routes')
    .example('router test:routes --base-url http://localhost:8080')
    .example('router test:routes --filter "/api/*"')
    .example('router test:routes --method GET,POST')
    .action(async (options: { baseUrl?: string, filter?: string, method?: string, timeout?: number }) => {
      try {
        await testRoutes(options)
      }
      catch (error: any) {
        console.error(`Route testing failed: ${error.message}`)
        process.exit(1)
      }
    })

  cli
    .command('debug:route <path>', 'Debug route matching for a specific path')
    .option('--method <method>', 'HTTP method to test', { default: 'GET' })
    .option('--verbose', 'Show detailed matching information')
    .example('router debug:route /api/users/123')
    .example('router debug:route /api/users/123 --method POST --verbose')
    .action(async (path: string, options: { method?: string, verbose?: boolean }) => {
      try {
        await debugRoute(path, options)
      }
      catch (error: any) {
        console.error(`Route debugging failed: ${error.message}`)
        process.exit(1)
      }
    })

  cli
    .command('cache:clear', 'Clear route caches')
    .option('--stats', 'Show cache statistics before clearing')
    .example('router cache:clear')
    .example('router cache:clear --stats')
    .action(async (options: { stats?: boolean }) => {
      try {
        await clearCaches(options)
      }
      catch (error: any) {
        console.error(`Cache clearing failed: ${error.message}`)
        process.exit(1)
      }
    })

  cli
    .command('validate', 'Validate route definitions and configuration')
    .option('--strict', 'Use strict validation rules')
    .option('--fix', 'Automatically fix simple issues')
    .example('router validate')
    .example('router validate --strict --fix')
    .action(async (options: { strict?: boolean, fix?: boolean }) => {
      try {
        await validateRoutes(options)
      }
      catch (error: any) {
        console.error(`Route validation failed: ${error.message}`)
        process.exit(1)
      }
    })
}

export * from './middleware'
export * from './openapi'
export * from './router'
export * from './routes'
export * from './utils'
