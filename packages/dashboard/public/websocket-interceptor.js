/**
 * WebSocket Interceptor
 *
 * This library allows you to intercept WebSocket traffic and forward it
 * to the HTTP Request Viewer & Analyzer application.
 *
 * Usage:
 *
 * import { WebSocketInterceptor } from '@websocket-analyzer/interceptor';
 *
 * const interceptor = new WebSocketInterceptor({
 *   dashboardUrl: 'http://localhost:5173',
 *   appName: 'My Application'
 * });
 *
 * interceptor.start();
 */

class WebSocketInterceptor {
  constructor(options = {}) {
    this.options = {
      dashboardUrl: 'http://localhost:5173',
      appName: 'My Application',
      ...options,
    }

    this.originalWebSocket = window.WebSocket
    this.isIntercepting = false
    this.connections = new Map()
    this.dashboard = null
  }

  /**
   * Start intercepting WebSocket traffic
   */
  start() {
    if (this.isIntercepting)
      return

    this.connectToDashboard()
    this.patchWebSocket()
    this.isIntercepting = true

    console.log(`[WebSocket Interceptor] Started monitoring WebSocket connections for ${this.options.appName}`)
  }

  /**
   * Stop intercepting WebSocket traffic
   */
  stop() {
    if (!this.isIntercepting)
      return

    window.WebSocket = this.originalWebSocket
    this.isIntercepting = false

    if (this.dashboard && this.dashboard.readyState === WebSocket.OPEN) {
      this.dashboard.close()
    }

    console.log('[WebSocket Interceptor] Stopped')
  }

  /**
   * Connect to the HTTP Request Viewer dashboard
   */
  connectToDashboard() {
    try {
      const url = `${this.options.dashboardUrl.replace(/^http/, 'ws')}/websocket`
      // eslint-disable-next-line new-cap
      this.dashboard = new this.originalWebSocket(url)

      this.dashboard.onopen = () => {
        console.log('[WebSocket Interceptor] Connected to dashboard')

        // Register the interceptor
        this.sendToDashboard({
          type: 'register',
          appName: this.options.appName,
        })
      }

      this.dashboard.onclose = () => {
        console.log('[WebSocket Interceptor] Disconnected from dashboard')
      }

      this.dashboard.onerror = (error) => {
        console.error('[WebSocket Interceptor] Dashboard connection error:', error)
      }
    }
    catch (error) {
      console.error('[WebSocket Interceptor] Failed to connect to dashboard:', error)
    }
  }

  /**
   * Patch the native WebSocket object to intercept all connections
   */
  patchWebSocket() {
    const self = this

    window.WebSocket = function WebSocket(url, protocols) {
      // Create the actual WebSocket
      // eslint-disable-next-line new-cap
      const ws = new self.originalWebSocket(url, protocols)
      const connectionId = self.generateId()

      // Store connection info
      self.connections.set(connectionId, {
        url,
        protocols,
        status: 'connecting',
        createdAt: new Date().toISOString(),
        id: connectionId,
      })

      // Notify dashboard about new connection
      self.sendToDashboard({
        type: 'connection',
        event: 'new',
        connection: self.connections.get(connectionId),
      })

      // Override onopen
      const originalOnOpen = ws.onopen
      ws.onopen = function (event) {
        const connection = self.connections.get(connectionId)
        if (connection) {
          connection.status = 'open'

          // Notify dashboard
          self.sendToDashboard({
            type: 'connection',
            event: 'open',
            connection,
          })
        }

        if (originalOnOpen) {
          originalOnOpen.call(this, event)
        }
      }

      // Override onclose
      const originalOnClose = ws.onclose
      ws.onclose = function (event) {
        const connection = self.connections.get(connectionId)
        if (connection) {
          connection.status = 'closed'
          connection.closedAt = new Date().toISOString()

          // Notify dashboard
          self.sendToDashboard({
            type: 'connection',
            event: 'close',
            connection,
          })
        }

        if (originalOnClose) {
          originalOnClose.call(this, event)
        }
      }

      // Override onerror
      const originalOnError = ws.onerror
      ws.onerror = function (event) {
        const connection = self.connections.get(connectionId)
        if (connection) {
          connection.status = 'error'

          // Notify dashboard
          self.sendToDashboard({
            type: 'connection',
            event: 'error',
            connection,
          })
        }

        if (originalOnError) {
          originalOnError.call(this, event)
        }
      }

      // Override onmessage
      const originalOnMessage = ws.onmessage
      ws.onmessage = function (event) {
        const message = {
          direction: 'in',
          type: typeof event.data === 'string' ? 'text' : 'binary',
          content: typeof event.data === 'string' ? event.data : '(binary data)',
          timestamp: new Date().toISOString(),
          size: event.data.length || 0,
          id: self.generateId(),
        }

        // Notify dashboard
        self.sendToDashboard({
          type: 'message',
          connectionId,
          message,
        })

        if (originalOnMessage) {
          originalOnMessage.call(this, event)
        }
      }

      // Override send method
      const originalSend = ws.send
      ws.send = function (data) {
        const message = {
          direction: 'out',
          type: typeof data === 'string' ? 'text' : 'binary',
          content: typeof data === 'string' ? data : '(binary data)',
          timestamp: new Date().toISOString(),
          size: data.length || 0,
          id: self.generateId(),
        }

        // Notify dashboard
        self.sendToDashboard({
          type: 'message',
          connectionId,
          message,
        })

        // Call original method
        return originalSend.call(this, data)
      }

      return ws
    }
  }

  /**
   * Send data to the dashboard
   */
  sendToDashboard(data) {
    if (this.dashboard && this.dashboard.readyState === WebSocket.OPEN) {
      this.dashboard.send(JSON.stringify(data))
    }
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
  }
}

// Export for CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebSocketInterceptor }
}

// Export for ES modules
if (typeof window !== 'undefined') {
  window.WebSocketInterceptor = WebSocketInterceptor
}
