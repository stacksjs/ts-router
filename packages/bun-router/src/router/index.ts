import { Router } from './core'
import { registerFileStreaming } from './file-streaming'
import { registerGroupOrganization } from './group-organization'
import { registerHttpMethods, registerRedirectMethods } from './http-methods'
import { registerMiddlewareHandling } from './middleware'
import { registerModelBinding } from './model-binding'
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
registerMiddlewareHandling(Router)
registerViewRendering(Router)
registerWebSocketHandling(Router)
registerFileStreaming(Router)
registerGroupOrganization(Router)
registerServerHandling(Router)
registerRouteBuilding(Router)
registerModelBinding(Router)

// Export the enhanced Router class
export { Router }
