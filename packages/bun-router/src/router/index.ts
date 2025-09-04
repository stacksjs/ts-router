import { Dependencies, globalMiddlewarePipeline, MiddlewareFactory, MiddlewarePipeline, SkipConditions } from '../middleware/pipeline'
import { Router } from './unified-router'
import { registerFileStreaming } from './file-streaming'
import { FluentRouteBuilder, FluentRouter, RouteFactory, router, RouterUtils } from './fluent-routing'
import { registerGroupOrganization } from './group-organization'
import { registerHttpMethods, registerRedirectMethods } from './http-methods'
import { registerMiddlewareHandling } from './middleware'
import { registerModelBinding } from './model-binding'
import { registerOptimizedRouteMatching } from './optimized-route-matching'
import { registerRouteBuilding } from './route-building'
import { registerRouteMatching } from './route-matching'
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
export { Dependencies, FluentRouteBuilder, FluentRouter, globalMiddlewarePipeline, MiddlewareFactory, MiddlewarePipeline, RouteFactory, router, RouterUtils, SkipConditions }

// Export routing features
export * from '../routing/route-caching'
export * from '../routing/route-throttling'
export * from '../routing/subdomain-routing'
