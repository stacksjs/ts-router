import { Dependencies, globalMiddlewarePipeline, MiddlewareFactory, MiddlewarePipeline, SkipConditions } from '../middleware/pipeline'
import { registerFileStreaming } from './file-streaming'
import { FluentRouteBuilder, FluentRouter, RouteFactory, router, RouterUtils } from './fluent-routing'
import { registerGroupOrganization } from './group-organization'
import { registerHttpMethods, registerRedirectMethods } from './http-methods'
import { registerMiddlewareHandling } from './middleware'
import { registerModelBinding } from './model-binding'
import { registerOptimizedRouteMatching } from './optimized-route-matching'
import { registerRouteBuilding } from './route-building'
import { registerRouteMatching } from './route-matching'
import { Router } from './router'
import { registerServerHandling } from './server'
import { registerViewRendering } from './view-rendering'
import { registerWebSocketHandling } from './websocket'
import '../types' // Import types for type augmentation

// Register all the extensions to the Router class
registerHttpMethods(Router)
registerRedirectMethods(Router)
registerRouteMatching(Router)
registerOptimizedRouteMatching(Router) // Override with optimized version
registerMiddlewareHandling(Router)
registerViewRendering(Router)
registerWebSocketHandling(Router)
registerFileStreaming(Router)
registerGroupOrganization(Router)
registerServerHandling(Router)
registerRouteBuilding(Router)
registerModelBinding(Router)

// Export the Router class and fluent routing features
export { Router }

// Type augmentation for Laravel-style methods
declare module './router' {
  interface Router {
    // Laravel-style streaming methods
    stream(
      callback: () => Generator<string | Uint8Array, void, unknown> | AsyncGenerator<string | Uint8Array, void, unknown>,
      status?: number,
      headers?: Record<string, string>
    ): Response

    streamJson<T>(
      data: Record<string, Iterable<T> | AsyncIterable<T>>,
      status?: number,
      headers?: Record<string, string>
    ): Response

    eventStream<T = any>(
      callback: () => Generator<{ data: any, event?: string, id?: string, retry?: number }, void, unknown> | AsyncGenerator<{ data: any, event?: string, id?: string, retry?: number }, void, unknown>,
      headers?: Record<string, string>
    ): Response

    streamDownload(
      callback: () => Generator<string | Uint8Array, void, unknown> | AsyncGenerator<string | Uint8Array, void, unknown>,
      filename: string,
      headers?: Record<string, string>
    ): Response

    streamFile(
      filePath: string,
      request: any,
      options?: {
        contentType?: string
        enableRanges?: boolean
        chunkSize?: number
      }
    ): Promise<Response>

    streamFileWithRanges(filePath: string, req: any): Promise<Response>

    streamResponse(
      generator: () => AsyncGenerator<string | Uint8Array, void, unknown>,
      options?: { headers?: Record<string, string>, status?: number }
    ): Response

    transformStream(
      transformer: (chunk: string | Uint8Array) => string | Uint8Array | Promise<string | Uint8Array>,
      options?: { headers?: Record<string, string>, status?: number }
    ): (req: Request) => Response

    // Laravel-style model binding methods
    model<T>(
      key: string,
      modelClass: string | ((value: string) => Promise<T | null>),
      callback?: (model: T | null) => Response | null
    ): Router

    implicitBinding(): any

    missing(callback: (req: any) => Response): any

    scopedBindings(bindings: Record<string, string>): any

    clearModelCache(modelName?: string): Router

    getModelStats(): {
      totalEntries: number
      validEntries: number
      expiredEntries: number
      models: number
    }

    readonly modelRegistry: {
      has(name: string): boolean
      register<T>(name: string, config: any): void
      resolve<T>(modelName: string, params: Record<string, string>, req?: any): Promise<any>
      createErrorResponse(modelName: string, result: any, params: Record<string, string>): Response
      clearCache(modelName: string, params?: Record<string, string>): void
      clearAllCache(): void
      getCacheStats(): any
    }

    // Health check method
    health(): Promise<Router>
  }
}
export { Dependencies, FluentRouteBuilder, FluentRouter, globalMiddlewarePipeline, MiddlewareFactory, MiddlewarePipeline, RouteFactory, router, RouterUtils, SkipConditions }

// Export routing features
export * from '../routing/route-caching'
export * from '../routing/route-throttling'
export * from '../routing/subdomain-routing'
