import type {
  EnhancedRequest,
  ExtractRouteParams,
  SSEConfig,
  SSEEvent,
  SSERouteHandler,
} from '../types'

/**
 * Server-Sent Events handler
 */
export class SSEHandler {
  private config: Required<SSEConfig>
  private controller?: ReadableStreamDefaultController<Uint8Array>
  private encoder = new TextEncoder()
  private isConnected = false
  private heartbeatInterval?: Timer

  constructor(config: SSEConfig = {}) {
    this.config = {
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      enableHeartbeat: config.enableHeartbeat ?? true,
      maxConnections: config.maxConnections ?? 1000,
      connectionTimeout: config.connectionTimeout ?? 300000,
      retryDelay: config.retryDelay ?? 3000,
      headers: config.headers ?? {},
    }
  }

  /**
   * Create SSE response stream
   */
  createStream(): Response {
    const stream = new ReadableStream({
      start: (controller) => {
        this.controller = controller
        this.isConnected = true
        this.setupHeartbeat()
        this.sendRetryDelay()
      },
      cancel: () => {
        this.disconnect()
      },
    })

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      ...this.config.headers,
    })

    return new Response(stream, {
      status: 200,
      headers,
    })
  }

  /**
   * Send an SSE event
   */
  send(event: SSEEvent): boolean {
    if (!this.isConnected || !this.controller) {
      return false
    }

    try {
      const eventData = this.formatEvent(event)
      this.controller.enqueue(this.encoder.encode(eventData))
      return true
    }
    catch (error) {
      console.error('Failed to send SSE event:', error)
      this.disconnect()
      return false
    }
  }

  /**
   * Send multiple events
   */
  sendBatch(events: SSEEvent[]): number {
    let sentCount = 0
    for (const event of events) {
      if (this.send(event)) {
        sentCount++
      }
      else {
        break
      }
    }
    return sentCount
  }

  /**
   * Send a simple message
   */
  message(data: any, id?: string): boolean {
    return this.send({
      data,
      id,
    })
  }

  /**
   * Send an event with type
   */
  event(type: string, data: any, id?: string): boolean {
    return this.send({
      event: type,
      data,
      id,
    })
  }

  /**
   * Send a comment (for debugging)
   */
  comment(text: string): boolean {
    if (!this.isConnected || !this.controller) {
      return false
    }

    try {
      const commentData = `: ${text}\n\n`
      this.controller.enqueue(this.encoder.encode(commentData))
      return true
    }
    catch (error) {
      console.error('Failed to send SSE comment:', error)
      return false
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    this.disconnect()
    if (this.controller) {
      try {
        this.controller.close()
      }
      catch (error) {
        console.error('Error closing SSE connection:', error)
      }
    }
  }

  /**
   * Check if connection is active
   */
  get connected(): boolean {
    return this.isConnected
  }

  /**
   * Format SSE event according to specification
   */
  private formatEvent(event: SSEEvent): string {
    let formatted = ''

    if (event.id !== undefined) {
      formatted += `id: ${event.id}\n`
    }

    if (event.event) {
      formatted += `event: ${event.event}\n`
    }

    if (event.retry !== undefined) {
      formatted += `retry: ${event.retry}\n`
    }

    if (event.data !== undefined) {
      const dataStr = typeof event.data === 'string'
        ? event.data
        : JSON.stringify(event.data)

      // Handle multi-line data
      const lines = dataStr.split('\n')
      for (const line of lines) {
        formatted += `data: ${line}\n`
      }
    }

    formatted += '\n'
    return formatted
  }

  /**
   * Setup heartbeat to keep connection alive
   */
  private setupHeartbeat(): void {
    if (!this.config.enableHeartbeat)
      return

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.comment('heartbeat')
      }
      else {
        this.clearHeartbeat()
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * Clear heartbeat interval
   */
  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }
  }

  /**
   * Send retry delay instruction
   */
  private sendRetryDelay(): void {
    if (this.config.retryDelay > 0) {
      this.send({
        retry: this.config.retryDelay,
      })
    }
  }

  /**
   * Disconnect and cleanup
   */
  private disconnect(): void {
    this.isConnected = false
    this.clearHeartbeat()
  }
}

/**
 * SSE connection manager
 */
export class SSEConnectionManager {
  private connections = new Map<string, SSEHandler>()
  private connectionCounts = new Map<string, number>()

  /**
   * Create or get SSE connection
   */
  createConnection(
    connectionId: string,
    config: SSEConfig = {},
  ): SSEHandler {
    // Check max connections per ID
    const currentCount = this.connectionCounts.get(connectionId) || 0
    if (config.maxConnections && currentCount >= config.maxConnections) {
      throw new Error(`Maximum connections exceeded for ${connectionId}`)
    }

    const handler = new SSEHandler(config)
    this.connections.set(connectionId, handler)
    this.connectionCounts.set(connectionId, currentCount + 1)

    return handler
  }

  /**
   * Get existing connection
   */
  getConnection(connectionId: string): SSEHandler | undefined {
    return this.connections.get(connectionId)
  }

  /**
   * Close connection
   */
  closeConnection(connectionId: string): boolean {
    const handler = this.connections.get(connectionId)
    if (handler) {
      handler.close()
      this.connections.delete(connectionId)

      const currentCount = this.connectionCounts.get(connectionId) || 0
      if (currentCount <= 1) {
        this.connectionCounts.delete(connectionId)
      }
      else {
        this.connectionCounts.set(connectionId, currentCount - 1)
      }

      return true
    }
    return false
  }

  /**
   * Broadcast to all connections
   */
  broadcast(event: SSEEvent): number {
    let sentCount = 0
    for (const handler of this.connections.values()) {
      if (handler.send(event)) {
        sentCount++
      }
    }
    return sentCount
  }

  /**
   * Broadcast to specific connections
   */
  broadcastToConnections(connectionIds: string[], event: SSEEvent): number {
    let sentCount = 0
    for (const id of connectionIds) {
      const handler = this.connections.get(id)
      if (handler && handler.send(event)) {
        sentCount++
      }
    }
    return sentCount
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      connectionsByUser: Object.fromEntries(this.connectionCounts),
      activeConnections: Array.from(this.connections.keys()),
    }
  }

  /**
   * Cleanup dead connections
   */
  cleanup(): void {
    for (const [id, handler] of this.connections.entries()) {
      if (!handler.connected) {
        this.closeConnection(id)
      }
    }
  }
}

/**
 * Global SSE connection manager instance
 */
export const sseManager = new SSEConnectionManager()

/**
 * SSE middleware for route handlers
 */
export function createSSEMiddleware(config: SSEConfig = {}) {
  return async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
    // Check if client accepts SSE
    const accept = req.headers.get('accept')
    if (!accept?.includes('text/event-stream')) {
      return new Response('SSE not supported', { status: 406 })
    }

    // Add SSE helper to request
    req.sse = new SSEHandler(config)

    return next()
  }
}

/**
 * SSE utility functions
 */
export const SSEUtils = {
  /**
   * Create a simple SSE route handler
   */
  createHandler<TPath extends string>(
    handler: SSERouteHandler<TPath>,
  ): (req: EnhancedRequest & { params: ExtractRouteParams<TPath> }) => Promise<Response> {
    return async (req) => {
      const sse = new SSEHandler()
      const response = sse.createStream()

      // Call the handler in the background
      handler(req, sse).catch((error) => {
        console.error('SSE handler error:', error)
        sse.close()
      })

      return response
    }
  },

  /**
   * Create SSE event from object
   */
  createEvent(data: any, options: Partial<SSEEvent> = {}): SSEEvent {
    return {
      data,
      ...options,
    }
  },

  /**
   * Validate SSE event
   */
  validateEvent(event: SSEEvent): boolean {
    return event.data !== undefined || event.event !== undefined
  },

  /**
   * Create periodic SSE sender
   */
  createPeriodicSender(
    sse: SSEHandler,
    dataFn: () => any | Promise<any>,
    intervalMs: number,
  ): () => void {
    const interval = setInterval(async () => {
      try {
        const data = await dataFn()
        if (!sse.send({ data })) {
          clearInterval(interval)
        }
      }
      catch (error) {
        console.error('Periodic SSE sender error:', error)
        sse.close()
        clearInterval(interval)
      }
    }, intervalMs)

    return () => clearInterval(interval)
  },

  /**
   * Create SSE from async iterable
   */
  async fromAsyncIterable<T>(
    sse: SSEHandler,
    iterable: AsyncIterable<T>,
    transform?: (item: T) => SSEEvent,
  ): Promise<void> {
    try {
      for await (const item of iterable) {
        const event = transform ? transform(item) : { data: item }
        if (!sse.send(event)) {
          break
        }
      }
    }
    catch (error) {
      console.error('SSE from async iterable error:', error)
    }
    finally {
      sse.close()
    }
  },
}
