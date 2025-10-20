import type { WebSocketConfig } from '../types'
import type { Router } from './router'

/**
 * WebSocket extension for Router class
 */
export function registerWebSocketHandling(RouterClass: typeof Router): void {
  Object.defineProperties(RouterClass.prototype, {
    /**
     * Configure WebSocket handling
     */
    websocket: {
      value(config: WebSocketConfig): Router {
        this.wsConfig = config
        return this
      },
      writable: true,
      configurable: true,
    },

    /**
     * Publish a message to a WebSocket topic
     */
    publish: {
      value(topic: string, data: string | ArrayBuffer | Uint8Array, compress = false): number {
        if (!this.serverInstance) {
          throw new Error('Server not started, cannot publish to WebSocket topics')
        }

        return this.serverInstance.publish(topic, data, compress)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get the number of subscribers for a WebSocket topic
     */
    subscriberCount: {
      value(topic: string): number {
        if (!this.serverInstance) {
          throw new Error('Server not started, cannot get subscriber count')
        }

        return this.serverInstance.subscriberCount(topic)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Upgrade an HTTP request to a WebSocket connection
     */
    upgrade: {
      value(request: Request, options?: { headers?: Record<string, string>, data?: any }): boolean {
        if (!this.serverInstance) {
          throw new Error('Server not started, cannot upgrade to WebSocket')
        }

        if (!this.wsConfig) {
          throw new Error('WebSocket configuration not set, use router.websocket() to configure')
        }

        return this.serverInstance.upgrade(request, options)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Set a timeout for a request
     */
    timeout: {
      value(request: Request, seconds: number): void {
        if (!this.serverInstance) {
          throw new Error('Server not started, cannot set timeout')
        }

        this.serverInstance.timeout(request, seconds)
      },
      writable: true,
      configurable: true,
    },

    /**
     * Get the IP address of a request
     */
    requestIP: {
      value(request: Request): { address: string, port: number } | null {
        if (!this.serverInstance) {
          throw new Error('Server not started, cannot get request IP')
        }

        return this.serverInstance.requestIP(request)
      },
      writable: true,
      configurable: true,
    },
  })
}
