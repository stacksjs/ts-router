import type { ActionHandler, EnhancedRequest, RouterConfig } from '../types'
import type { Router } from './router'
import { join } from 'node:path'
import { processHtmlTemplate, resolveViewPath } from '../utils'

/**
 * View rendering extension for Router class
 */
export function registerViewRendering(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Render a view with data
     */
    renderView: {
      async value(
        view: string,
        data: Record<string, any> = {},
        options: { layout?: string } = {},
      ): Promise<string> {
        const viewsConfig = this.config.views || {
          viewsPath: 'resources/views',
          extensions: ['.html', '.stx'],
          cache: Bun.env.NODE_ENV === 'production',
          engine: 'auto',
        }

        // Check cache first if enabled
        const cacheKey = `${view}:${options.layout || ''}`
        if (viewsConfig.cache && this.templateCache.has(cacheKey)) {
          return this.processTemplate(this.templateCache.get(cacheKey)!, data, viewsConfig)
        }

        // Resolve the view path
        const viewPath = await resolveViewPath(view, viewsConfig.viewsPath, viewsConfig.extensions)
        if (!viewPath) {
          throw new Error(`View '${view}' not found`)
        }

        // Read the view file
        let viewContent = await Bun.file(viewPath).text()

        // Apply layout if specified or if a default layout is configured
        const layoutName = options.layout || viewsConfig.defaultLayout
        if (layoutName) {
          const layoutPath = await resolveViewPath(
            join('layouts', layoutName),
            viewsConfig.viewsPath,
            viewsConfig.extensions,
          )

          if (!layoutPath) {
            throw new Error(`Layout '${layoutName}' not found`)
          }

          const layoutContent = await Bun.file(layoutPath).text()
          // Replace {{content}} placeholder with the view content
          viewContent = layoutContent.replace(/\{\{\s*content\s*\}\}/g, viewContent)
        }

        // Cache the template if caching is enabled
        if (viewsConfig.cache) {
          this.templateCache.set(cacheKey, viewContent)
        }

        // Process the template with data
        return this.processTemplate(viewContent, data, viewsConfig)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Process a template with data
     */
    processTemplate: {
      async value(
        template: string,
        data: Record<string, any>,
        viewConfig: RouterConfig['views'],
      ): Promise<string> {
        // Choose template engine based on configuration
        const engine = viewConfig?.engine || 'auto'

        if (engine === 'custom' && viewConfig?.customRenderer) {
          return viewConfig.customRenderer(template, data, {})
        }

        // Default to simple template processing
        let processedTemplate = processHtmlTemplate(template, data)

        // Apply minification if configured
        if (viewConfig?.minify?.enabled) {
          try {
            const _minifyOptions = viewConfig.minify.options || {
              removeComments: true,
              collapseWhitespace: true,
              minifyJS: true,
              minifyCSS: true,
            }

            // In a real implementation, you would use a library like html-minifier
            // This is just a placeholder
            processedTemplate = processedTemplate
              .replace(/\s+/g, ' ')
              .replace(/<!--[\s\S]*?-->/g, '')
          }
          catch (err) {
            console.error('Error minifying HTML:', err)
          }
        }

        return processedTemplate
      },
      writable: true,
      configurable: true,
    },

    /**
     * Register a view route
     */
    view: {
      async value(
        path: string,
        viewOrData: string | Record<string, any>,
        dataOrOptions: Record<string, any> | { layout?: string, status?: number, headers?: Record<string, string> } = {},
        optionsOrType: { layout?: string, status?: number, headers?: Record<string, string> } | 'web' | 'api' = {},
        typeOrName: 'web' | 'api' | string = 'web',
        name?: string,
      ): Promise<Router> {
        let view: string
        let data: Record<string, any> = {}
        let options: { layout?: string, status?: number, headers?: Record<string, string> } = {}
        let type: 'web' | 'api' = 'web'
        let routeName: string | undefined

        // Parse the flexible parameters
        if (typeof viewOrData === 'string') {
          view = viewOrData

          if (typeof dataOrOptions === 'object' && !Array.isArray(dataOrOptions)) {
            // If dataOrOptions has layout, status, or headers, it's options
            if ('layout' in dataOrOptions || 'status' in dataOrOptions || 'headers' in dataOrOptions) {
              options = dataOrOptions as { layout?: string, status?: number, headers?: Record<string, string> }
            }
            else {
              // Otherwise it's data
              data = dataOrOptions
            }
          }

          if (typeof optionsOrType === 'object') {
            options = { ...options, ...optionsOrType }
          }
          else if (typeof optionsOrType === 'string') {
            type = optionsOrType as 'web' | 'api'
          }

          if (typeof typeOrName === 'string') {
            if (typeOrName === 'web' || typeOrName === 'api') {
              type = typeOrName
            }
            else {
              routeName = typeOrName
            }
          }

          if (name) {
            routeName = name
          }
        }
        else {
          // viewOrData is actually data
          data = viewOrData

          if (typeof dataOrOptions === 'string') {
            view = dataOrOptions
          }
          else {
            throw new TypeError('View name must be a string')
          }

          if (typeof optionsOrType === 'object') {
            options = optionsOrType
          }
          else if (typeof optionsOrType === 'string') {
            if (optionsOrType === 'web' || optionsOrType === 'api') {
              type = optionsOrType
            }
            else {
              view = optionsOrType
              type = 'web'
            }
          }
        }

        // Create the route handler
        const handler: ActionHandler = async (_req: EnhancedRequest) => {
          const renderedView = await this.renderView(view, data, {
            layout: options.layout,
          })

          const headers = new Headers()
          headers.set('Content-Type', 'text/html; charset=utf-8')

          // Add custom headers if provided
          if (options.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
              headers.set(key, value)
            }
          }

          return new Response(renderedView, {
            status: options.status || 200,
            headers,
          })
        }

        // Register the route
        await this.get(path, handler, type, routeName)

        return this
      },
      writable: true,
      configurable: true,
    },
  })
}
