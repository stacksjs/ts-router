import type { ActionHandler, EnhancedRequest } from '../types'
import type { Router } from './router'
import { join, relative, resolve, basename, dirname } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'

/**
 * File-based routing configuration
 */
export interface FileBasedRoutingConfig {
  /**
   * Whether automatic file-based routing is enabled
   * Default: true (auto-enabled when views directory is detected)
   */
  enabled?: boolean

  /**
   * Directory containing view files for automatic routing
   * Default: auto-detected from 'src/views', 'views', 'resources/views'
   */
  viewsPath?: string

  /**
   * File extensions to treat as routable pages
   * Default: ['.stx', '.html']
   */
  extensions?: string[]

  /**
   * Files/directories to exclude from routing
   * Default: ['_', 'components', 'layouts', 'partials', 'scripts', 'styles']
   */
  exclude?: string[]

  /**
   * Custom render function for view files
   * If not provided, attempts to use STX renderer or serves raw content
   */
  render?: (filePath: string, data: Record<string, unknown>, request: EnhancedRequest) => Promise<Response>
}

interface DiscoveredRoute {
  filePath: string
  routePath: string
  params: string[]
  isIndex: boolean
  isDynamic: boolean
}

/**
 * Default directories to scan for views (in order of priority)
 */
const DEFAULT_VIEW_DIRECTORIES = [
  'src/views',
  'views',
  'resources/views',
  'app/views',
]

/**
 * Default exclusion patterns for non-routable files/directories
 */
const DEFAULT_EXCLUDES = [
  '_',           // Underscore-prefixed files are private
  'components',  // Component partials
  'layouts',     // Layout templates
  'partials',    // Partial templates
  'scripts',     // Script files
  'styles',      // Style files
]

/**
 * Default routable file extensions
 */
const DEFAULT_EXTENSIONS = ['.stx', '.html']

/**
 * Auto-detect the views directory from common conventions
 */
function detectViewsDirectory(cwd: string = process.cwd()): string | null {
  for (const dir of DEFAULT_VIEW_DIRECTORIES) {
    const fullPath = resolve(cwd, dir)
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      return fullPath
    }
  }
  return null
}

/**
 * Check if a directory contains any routable files
 */
function hasRoutableFiles(dir: string, extensions: string[], exclude: string[]): boolean {
  if (!existsSync(dir)) return false

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (exclude.some(pattern => entry.name.startsWith(pattern) || entry.name === pattern)) {
        continue
      }

      if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        return true
      }

      if (entry.isDirectory()) {
        const subDir = join(dir, entry.name)
        if (hasRoutableFiles(subDir, extensions, exclude)) {
          return true
        }
      }
    }
  } catch {
    // Directory not readable
  }

  return false
}

/**
 * Converts a file path to a route path
 * Examples:
 *   views/index.stx -> /
 *   views/about.stx -> /about
 *   views/dashboard/index.stx -> /dashboard
 *   views/dashboard/errors.stx -> /dashboard/errors
 *   views/users/[id].stx -> /users/{id}
 *   views/posts/[...slug].stx -> /posts/{slug}*
 */
function filePathToRoutePath(filePath: string, viewsDir: string, extensions: string[]): { routePath: string; params: string[] } {
  // Get relative path from views directory
  let routePath = relative(viewsDir, filePath)

  // Remove file extension
  for (const ext of extensions) {
    if (routePath.endsWith(ext)) {
      routePath = routePath.slice(0, -ext.length)
      break
    }
  }

  // Convert directory separators to forward slashes
  routePath = routePath.replace(/\\/g, '/')

  // Handle index files
  if (routePath === 'index' || routePath.endsWith('/index')) {
    routePath = routePath.replace(/\/?index$/, '')
  }

  // Extract dynamic parameters
  const params: string[] = []

  // Convert [...param] to {param}* (catch-all) syntax
  routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, (_match, param) => {
    params.push(param)
    return `{${param}}*`
  })

  // Convert [param] to {param} syntax
  routePath = routePath.replace(/\[([^\]]+)\]/g, (_match, param) => {
    params.push(param)
    return `{${param}}`
  })

  // Ensure leading slash
  if (!routePath.startsWith('/')) {
    routePath = '/' + routePath
  }

  // Handle root path
  if (routePath === '/') {
    return { routePath: '/', params }
  }

  return { routePath, params }
}

/**
 * Recursively discovers all routable files in a directory
 */
function discoverRoutes(
  dir: string,
  viewsDir: string,
  extensions: string[],
  exclude: string[],
): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = []

  if (!existsSync(dir)) {
    return routes
  }

  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    // Skip excluded files/directories
    if (exclude.some(pattern => entry.name.startsWith(pattern) || entry.name === pattern)) {
      continue
    }

    if (entry.isDirectory()) {
      // Recursively discover routes in subdirectories
      routes.push(...discoverRoutes(fullPath, viewsDir, extensions, exclude))
    } else if (entry.isFile()) {
      // Check if file has a routable extension
      const hasRoutableExtension = extensions.some(ext => entry.name.endsWith(ext))

      if (hasRoutableExtension) {
        const { routePath, params } = filePathToRoutePath(fullPath, viewsDir, extensions)

        routes.push({
          filePath: fullPath,
          routePath,
          params,
          isIndex: entry.name.startsWith('index.'),
          isDynamic: params.length > 0,
        })
      }
    }
  }

  // Sort routes: static routes before dynamic, more specific before less specific
  routes.sort((a, b) => {
    // Static routes come first
    if (a.isDynamic !== b.isDynamic) {
      return a.isDynamic ? 1 : -1
    }

    // More segments = more specific
    const aSegments = a.routePath.split('/').length
    const bSegments = b.routePath.split('/').length
    if (aSegments !== bSegments) {
      return bSegments - aSegments
    }

    // Alphabetical for consistency
    return a.routePath.localeCompare(b.routePath)
  })

  // Check for duplicate routes and warn
  const seen = new Map<string, DiscoveredRoute>()
  for (const route of routes) {
    const existing = seen.get(route.routePath)
    if (existing) {
      console.warn(
        `[bun-router] Warning: Duplicate route "${route.routePath}" found:\n` +
        `  - ${existing.filePath}\n` +
        `  - ${route.filePath}\n` +
        `  Using: ${existing.filePath}`
      )
    } else {
      seen.set(route.routePath, route)
    }
  }

  return Array.from(seen.values())
}

/**
 * Check for pre-built HTML version of a view file
 * Looks in dist/views/ for production builds
 */
function findPrebuiltView(stxFilePath: string, viewsDir: string): string | null {
  // Get relative path from views directory
  const relativePath = relative(viewsDir, stxFilePath)

  // Check common pre-built locations
  const prebuiltLocations = [
    resolve(process.cwd(), 'dist/views', relativePath.replace(/\.stx$/, '.html')),
    resolve(process.cwd(), 'views', relativePath.replace(/\.stx$/, '.html')),
    resolve('/var/task/views', relativePath.replace(/\.stx$/, '.html')), // Lambda
  ]

  for (const location of prebuiltLocations) {
    if (existsSync(location)) {
      return location
    }
  }

  return null
}

/**
 * Render an STX file using the @stacksjs/stx library
 */
async function renderStxFile(
  filePath: string,
  viewsDir: string,
  data: Record<string, unknown>
): Promise<string> {
  // Dynamic import to avoid build-time resolution
  const stxModule = '@stacksjs/stx'
  const stx = await import(/* @vite-ignore */ stxModule)

  if (!stx.processDirectives || !stx.extractVariables) {
    throw new Error('STX library not properly loaded. Install with: bun add @stacksjs/stx')
  }

  const content = await Bun.file(filePath).text()

  // Extract script content and template
  const scriptMatch = content.match(/<script\s+server\s*>([\s\S]*?)<\/script>/i)
  const scriptContent = scriptMatch ? scriptMatch[1] : ''
  let templateContent = scriptMatch
    ? content.replace(/<script\s+server\s*>[\s\S]*?<\/script>/i, '')
    : content

  // Replace <script client> with regular <script>
  templateContent = templateContent.replace(/<script\s+client\s*>/gi, '<script>')

  // Build context with data
  const context: Record<string, unknown> = {
    __filename: filePath,
    __dirname: dirname(filePath),
    props: data,
    ...data,
  }

  // Extract variables from server script
  if (scriptContent) {
    await stx.extractVariables(scriptContent, context, filePath)
  }

  // Configure STX with proper paths relative to views root
  const config = {
    ...stx.defaultConfig,
    componentsDir: join(viewsDir, 'components'),
    layoutsDir: join(viewsDir, 'layouts'),
    partialsDir: join(viewsDir, 'partials'),
  }

  return stx.processDirectives(templateContent, context, filePath, config, new Set())
}

/**
 * Creates a handler for rendering a view file
 */
function createViewHandler(
  filePath: string,
  viewsDir: string,
  _config: FileBasedRoutingConfig,
): ActionHandler {
  return async (req: EnhancedRequest): Promise<Response> => {
    const url = new URL(req.url)

    // Build request data for template context
    const data = {
      params: req.params || {},
      query: Object.fromEntries(url.searchParams),
      url: req.url,
      path: url.pathname,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
    }

    try {
      // 1. Check for pre-built HTML (production optimization)
      const prebuiltPath = findPrebuiltView(filePath, viewsDir)
      if (prebuiltPath) {
        const html = await Bun.file(prebuiltPath).text()
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      // 2. Render STX file
      if (filePath.endsWith('.stx')) {
        const html = await renderStxFile(filePath, viewsDir, data)
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      // 3. Serve raw HTML
      const content = await Bun.file(filePath).text()
      return new Response(content, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    } catch (error) {
      console.error(`[bun-router] Error rendering ${filePath}:`, error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}

/**
 * Registers file-based routing extension on the Router class
 */
export function registerFileBasedRouting(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Internal: detected views directory
     */
    _viewsDir: {
      value: null as string | null,
      writable: true,
      configurable: true,
    },

    /**
     * Internal: file-based routing config
     */
    _fileRoutingConfig: {
      value: null as FileBasedRoutingConfig | null,
      writable: true,
      configurable: true,
    },

    /**
     * Internal: discovered file-based routes
     */
    _fileBasedRoutes: {
      value: [] as DiscoveredRoute[],
      writable: true,
      configurable: true,
    },

    /**
     * Internal: whether file routes have been initialized
     */
    _fileRoutesInitialized: {
      value: false,
      writable: true,
      configurable: true,
    },

    /**
     * Initialize automatic file-based routing
     * Called automatically when serve() is invoked
     */
    _initFileRoutes: {
      async value(): Promise<void> {
        if (this._fileRoutesInitialized) return

        // Auto-detect views directory if not configured
        const viewsDir = this._viewsDir || detectViewsDirectory()
        if (!viewsDir) {
          this._fileRoutesInitialized = true
          return
        }

        const config = this._fileRoutingConfig || {}
        const extensions = config.extensions || DEFAULT_EXTENSIONS
        const exclude = config.exclude || DEFAULT_EXCLUDES

        // Check if there are any routable files
        if (!hasRoutableFiles(viewsDir, extensions, exclude)) {
          this._fileRoutesInitialized = true
          return
        }

        // Discover and register routes
        const routes = discoverRoutes(viewsDir, viewsDir, extensions, exclude)

        if (this.config.verbose) {
          console.log(`[bun-router] Auto-discovered ${routes.length} file-based routes from ${viewsDir}:`)
          for (const route of routes) {
            console.log(`  ${route.routePath} -> ${relative(viewsDir, route.filePath)}`)
          }
        }

        // Store viewsDir for use in handlers
        this._viewsDir = viewsDir

        // Register each discovered route
        for (const route of routes) {
          const handler = createViewHandler(route.filePath, viewsDir, config)

          // Only register if no explicit route exists for this path
          const existingRoute = this.routes.find(
            (r: { path: string; method: string }) => r.path === route.routePath && r.method === 'GET'
          )

          if (!existingRoute) {
            await this.get(route.routePath, handler, 'web')
            this._fileBasedRoutes.push(route)
          }
        }

        this._fileRoutesInitialized = true
      },
      writable: true,
      configurable: true,
    },

    /**
     * Configure file-based routing
     * Call this before serve() to customize behavior
     */
    views: {
      value(config: FileBasedRoutingConfig | string): Router {
        if (typeof config === 'string') {
          // Just a path
          this._viewsDir = resolve(config)
          this._fileRoutingConfig = {}
        } else {
          // Full config
          if (config.viewsPath) {
            this._viewsDir = resolve(config.viewsPath)
          }
          this._fileRoutingConfig = config
        }
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Explicitly disable file-based routing
     */
    disableFileRouting: {
      value(): Router {
        this._fileRoutingConfig = { enabled: false }
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get list of discovered file-based routes
     */
    getFileRoutes: {
      value(): DiscoveredRoute[] {
        return this._fileBasedRoutes || []
      },
      writable: true,
      configurable: true,
    },

    /**
     * Legacy method for manual file routes loading
     * Kept for backwards compatibility
     */
    fileRoutes: {
      async value(viewsPath?: string, options?: Omit<FileBasedRoutingConfig, 'viewsPath'>): Promise<Router> {
        if (viewsPath) {
          this._viewsDir = resolve(viewsPath)
        }
        if (options) {
          this._fileRoutingConfig = { ...this._fileRoutingConfig, ...options }
        }
        // Force re-initialization
        this._fileRoutesInitialized = false
        await this._initFileRoutes()
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Legacy method alias
     */
    loadFileRoutes: {
      async value(config: FileBasedRoutingConfig = {}): Promise<Router> {
        return this.fileRoutes(config.viewsPath, config)
      },
      writable: true,
      configurable: true,
    },
  })
}

// Type augmentation for Router
declare module './router' {
  interface Router {
    _viewsDir?: string | null
    _fileRoutingConfig?: FileBasedRoutingConfig | null
    _fileBasedRoutes?: DiscoveredRoute[]
    _fileRoutesInitialized?: boolean

    /**
     * Internal: Initialize file-based routing (called by serve())
     */
    _initFileRoutes(): Promise<void>

    /**
     * Configure file-based routing
     * @param config - Path to views directory or full configuration object
     * @example
     * router.views('src/views')
     * router.views({ viewsPath: 'src/views', extensions: ['.stx'] })
     */
    views(config: FileBasedRoutingConfig | string): Router

    /**
     * Disable automatic file-based routing
     */
    disableFileRouting(): Router

    /**
     * Get the list of discovered file-based routes
     */
    getFileRoutes(): DiscoveredRoute[]

    /**
     * Manually trigger file-based route discovery
     * @param viewsPath - Optional path to views directory
     * @param options - Additional configuration options
     */
    fileRoutes(viewsPath?: string, options?: Omit<FileBasedRoutingConfig, 'viewsPath'>): Promise<Router>

    /**
     * Legacy: Load file-based routes with configuration
     */
    loadFileRoutes(config?: FileBasedRoutingConfig): Promise<Router>
  }
}

export type { DiscoveredRoute }
export { detectViewsDirectory, discoverRoutes, DEFAULT_VIEW_DIRECTORIES, DEFAULT_EXCLUDES, DEFAULT_EXTENSIONS }
