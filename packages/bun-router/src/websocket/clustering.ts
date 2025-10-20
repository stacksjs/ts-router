/**
 * WebSocket Clustering
 *
 * Native WebSocket clustering across workers with high-performance optimizations
 */

import type { ServerWebSocket } from 'bun'
import type { Buffer } from 'node:buffer'
import process from 'node:process'

export interface WebSocketClusterConfig {
  workers?: number
  maxConnections?: number
  heartbeatInterval?: number
  compression?: boolean
  backpressureLimit?: number
  closeOnBackpressureLimit?: boolean
  idleTimeout?: number
  maxPayloadLength?: number
}

export interface ClusterMessage {
  type: 'broadcast' | 'direct' | 'join' | 'leave' | 'heartbeat' | 'stats'
  workerId?: string
  targetId?: string
  roomId?: string
  data?: any
  timestamp: number
}

export interface WebSocketConnection {
  id: string
  workerId: string
  socket: ServerWebSocket<any>
  rooms: Set<string>
  metadata: Record<string, any>
  lastHeartbeat: number
  connected: boolean
}

export interface WebSocketRoom {
  id: string
  connections: Set<string>
  metadata: Record<string, any>
  created: number
}

export interface ClusterStats {
  totalConnections: number
  totalRooms: number
  workerStats: Record<string, {
    connections: number
    rooms: number
    memoryUsage: number
    uptime: number
  }>
  messagesSent: number
  messagesReceived: number
  bytesTransferred: number
}

/**
 * WebSocket cluster manager for distributing connections across workers
 */
export class WebSocketCluster {
  private config: Required<WebSocketClusterConfig>
  private workers = new Map<string, Worker>()
  private connections = new Map<string, WebSocketConnection>()
  private rooms = new Map<string, WebSocketRoom>()
  private messageHandlers = new Map<string, (...args: any[]) => any>()
  private stats: ClusterStats
  private heartbeatTimer?: Timer
  private isMainWorker: boolean
  private workerId: string

  constructor(config: WebSocketClusterConfig = {}) {
    this.config = {
      workers: config.workers || Math.max(1, Math.floor(navigator.hardwareConcurrency / 2)),
      maxConnections: config.maxConnections || 10000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      compression: config.compression ?? true,
      backpressureLimit: config.backpressureLimit || 64 * 1024,
      closeOnBackpressureLimit: config.closeOnBackpressureLimit ?? false,
      idleTimeout: config.idleTimeout || 120000,
      maxPayloadLength: config.maxPayloadLength || 16 * 1024 * 1024,
      ...config,
    }

    this.workerId = this.generateWorkerId()
    this.isMainWorker = !process.env.BUN_WORKER_ID
    this.stats = this.initializeStats()

    this.setupWorkerCommunication()
    this.startHeartbeat()
  }

  /**
   * Create WebSocket server with clustering support
   */
  createServer(options: {
    port?: number
    hostname?: string
    onConnection?: (ws: ServerWebSocket<any>, request: Request) => void
    onMessage?: (ws: ServerWebSocket<any>, message: string | Buffer) => void
    onClose?: (ws: ServerWebSocket<any>, code?: number, reason?: string) => void
    onError?: (ws: ServerWebSocket<any>, error: Error) => void
  } = {}): any {
    const server = Bun.serve({
      port: options.port || 3000,
      hostname: options.hostname || 'localhost',

      fetch: (req, server) => {
        const url = new URL(req.url)

        if (url.pathname === '/ws') {
          const success = server.upgrade(req, {
            data: {
              connectionId: this.generateConnectionId(),
              workerId: this.workerId,
              connectedAt: Date.now(),
              rooms: new Set<string>(),
              metadata: {},
            } as any,
          })

          if (!success) {
            return new Response('WebSocket upgrade failed', { status: 400 })
          }

          return undefined
        }

        if (url.pathname === '/ws/stats') {
          return Response.json(this.getStats())
        }

        return new Response('Not Found', { status: 404 })
      },

      websocket: {

        open: (ws) => {
          const connectionId = (ws.data as any).connectionId
          const connection: WebSocketConnection = {
            id: connectionId,
            workerId: this.workerId,
            socket: ws,
            rooms: new Set(),
            metadata: (ws.data as any).metadata || {},
            lastHeartbeat: Date.now(),
            connected: true,
          }

          this.connections.set(connectionId, connection)
          this.stats.totalConnections++
          this.updateWorkerStats()

          // Notify other workers about new connection
          this.broadcastToWorkers({
            type: 'join',
            workerId: this.workerId,
            data: { connectionId, metadata: connection.metadata },
            timestamp: Date.now(),
          })

          options.onConnection?.(ws, (ws.data as any).request)
        },

        message: (ws, message) => {
          const connectionId = (ws.data as any).connectionId
          const connection = this.connections.get(connectionId)

          if (!connection)
            return

          connection.lastHeartbeat = Date.now()
          this.stats.messagesReceived++
          this.stats.bytesTransferred += typeof message === 'string' ? message.length : message.byteLength

          // Handle internal cluster messages
          if (typeof message === 'string' && message.startsWith('__cluster__')) {
            this.handleClusterMessage(connection, JSON.parse(message.slice(11)))
            return
          }

          options.onMessage?.(ws, message)
        },

        close: (ws, code, reason) => {
          const connectionId = (ws.data as any).connectionId
          const connection = this.connections.get(connectionId)

          if (connection) {
            connection.connected = false

            // Remove from all rooms
            connection.rooms.forEach((roomId) => {
              this.leaveRoom(connectionId, roomId)
            })

            this.connections.delete(connectionId)
            this.stats.totalConnections--
            this.updateWorkerStats()

            // Notify other workers about disconnection
            this.broadcastToWorkers({
              type: 'leave',
              workerId: this.workerId,
              data: { connectionId },
              timestamp: Date.now(),
            })
          }

          options.onClose?.(ws, code, reason)
        },

      },
    })

    console.log(`WebSocket cluster worker ${this.workerId} listening on ${options.hostname || 'localhost'}:${options.port || 3000}`)
    return server
  }

  /**
   * Join a connection to a room
   */
  joinRoom(connectionId: string, roomId: string, metadata: Record<string, any> = {}): boolean {
    const connection = this.connections.get(connectionId)
    if (!connection || !connection.connected)
      return false

    connection.rooms.add(roomId)

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        connections: new Set(),
        metadata,
        created: Date.now(),
      })
      this.stats.totalRooms++
    }

    const room = this.rooms.get(roomId)!
    room.connections.add(connectionId)

    // Notify other workers
    this.broadcastToWorkers({
      type: 'join',
      workerId: this.workerId,
      roomId,
      data: { connectionId, metadata },
      timestamp: Date.now(),
    })

    return true
  }

  /**
   * Remove a connection from a room
   */
  leaveRoom(connectionId: string, roomId: string): boolean {
    const connection = this.connections.get(connectionId)
    if (!connection)
      return false

    connection.rooms.delete(roomId)

    const room = this.rooms.get(roomId)
    if (room) {
      room.connections.delete(connectionId)

      if (room.connections.size === 0) {
        this.rooms.delete(roomId)
        this.stats.totalRooms--
      }
    }

    // Notify other workers
    this.broadcastToWorkers({
      type: 'leave',
      workerId: this.workerId,
      roomId,
      data: { connectionId },
      timestamp: Date.now(),
    })

    return true
  }

  /**
   * Broadcast message to all connections in a room
   */
  broadcastToRoom(roomId: string, message: string | Buffer, excludeConnectionId?: string): number {
    const room = this.rooms.get(roomId)
    if (!room)
      return 0

    let sentCount = 0

    // Send to local connections
    room.connections.forEach((connectionId) => {
      if (connectionId === excludeConnectionId)
        return

      const connection = this.connections.get(connectionId)
      if (connection && connection.connected) {
        try {
          connection.socket.send(message)
          sentCount++
          this.stats.messagesSent++
          this.stats.bytesTransferred += typeof message === 'string' ? message.length : message.byteLength
        }
        catch (error) {
          console.error('Failed to send message to connection:', error)
        }
      }
    })

    // Broadcast to other workers
    this.broadcastToWorkers({
      type: 'broadcast',
      workerId: this.workerId,
      roomId,
      data: { message: message.toString(), excludeConnectionId },
      timestamp: Date.now(),
    })

    return sentCount
  }

  /**
   * Send message to specific connection
   */
  sendToConnection(connectionId: string, message: string | Buffer): boolean {
    const connection = this.connections.get(connectionId)

    if (connection && connection.connected) {
      try {
        connection.socket.send(message)
        this.stats.messagesSent++
        this.stats.bytesTransferred += typeof message === 'string' ? message.length : message.byteLength
        return true
      }
      catch (error) {
        console.error('Failed to send message to connection:', error)
        return false
      }
    }

    // Try to send via other workers
    this.broadcastToWorkers({
      type: 'direct',
      workerId: this.workerId,
      targetId: connectionId,
      data: { message: message.toString() },
      timestamp: Date.now(),
    })

    return false
  }

  /**
   * Get cluster statistics
   */
  getStats(): ClusterStats {
    this.updateWorkerStats()
    return { ...this.stats }
  }

  /**
   * Get connections in a room
   */
  getRoomConnections(roomId: string): string[] {
    const room = this.rooms.get(roomId)
    return room ? Array.from(room.connections) : []
  }

  /**
   * Get rooms for a connection
   */
  getConnectionRooms(connectionId: string): string[] {
    const connection = this.connections.get(connectionId)
    return connection ? Array.from(connection.rooms) : []
  }

  /**
   * Close connection
   */
  closeConnection(connectionId: string, code?: number, reason?: string): boolean {
    const connection = this.connections.get(connectionId)
    if (!connection || !connection.connected)
      return false

    try {
      connection.socket.close(code, reason)
      return true
    }
    catch (error) {
      console.error('Failed to close connection:', error)
      return false
    }
  }

  /**
   * Shutdown cluster
   */
  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    // Close all connections
    this.connections.forEach((connection) => {
      if (connection.connected) {
        connection.socket.close(1001, 'Server shutdown')
      }
    })

    // Terminate workers
    this.workers.forEach((worker) => {
      worker.terminate()
    })

    this.connections.clear()
    this.rooms.clear()
    this.workers.clear()
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${this.workerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate unique worker ID
   */
  private generateWorkerId(): string {
    return process.env.BUN_WORKER_ID || `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): ClusterStats {
    return {
      totalConnections: 0,
      totalRooms: 0,
      workerStats: {},
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
    }
  }

  /**
   * Setup worker communication
   */
  private setupWorkerCommunication(): void {
    if (this.isMainWorker) {
      // Main worker spawns additional workers
      for (let i = 1; i < this.config.workers; i++) {
        const worker = new Worker(new URL(import.meta.url), {
          env: { ...process.env, BUN_WORKER_ID: `worker_${i}` },
        })

        worker.onmessage = (event) => {
          this.handleWorkerMessage(event.data)
        }

        this.workers.set(`worker_${i}`, worker)
      }
    }
    else {
      // Worker listens for messages from main worker
      process.on('message', (message) => {
        this.handleWorkerMessage(message as ClusterMessage)
      })
    }
  }

  /**
   * Handle messages from other workers
   */
  private handleWorkerMessage(message: ClusterMessage): void {
    switch (message.type) {
      case 'broadcast':
        if (message.roomId && message.data?.message) {
          const room = this.rooms.get(message.roomId)
          if (room) {
            room.connections.forEach((connectionId) => {
              if (connectionId === message.data.excludeConnectionId)
                return

              const connection = this.connections.get(connectionId)
              if (connection && connection.connected) {
                connection.socket.send(message.data.message)
              }
            })
          }
        }
        break

      case 'direct':
        if (message.targetId && message.data?.message) {
          const connection = this.connections.get(message.targetId)
          if (connection && connection.connected) {
            connection.socket.send(message.data.message)
          }
        }
        break

      case 'join':
        if (message.roomId && message.data?.connectionId) {
          // Update room information from other workers
          if (!this.rooms.has(message.roomId)) {
            this.rooms.set(message.roomId, {
              id: message.roomId,
              connections: new Set(),
              metadata: message.data.metadata || {},
              created: Date.now(),
            })
          }
        }
        break

      case 'leave':
        if (message.roomId && message.data?.connectionId) {
          const room = this.rooms.get(message.roomId)
          if (room) {
            room.connections.delete(message.data.connectionId)
            if (room.connections.size === 0) {
              this.rooms.delete(message.roomId)
            }
          }
        }
        break

      case 'stats':
        // Handle stats updates from other workers
        if (message.data && message.workerId) {
          this.stats.workerStats[message.workerId] = message.data
        }
        break
    }
  }

  /**
   * Handle cluster messages from connections
   */
  private handleClusterMessage(connection: WebSocketConnection, message: ClusterMessage): void {
    switch (message.type) {
      case 'join':
        if (message.roomId) {
          this.joinRoom(connection.id, message.roomId, message.data || {})
        }
        break

      case 'leave':
        if (message.roomId) {
          this.leaveRoom(connection.id, message.roomId)
        }
        break

      case 'broadcast':
        if (message.roomId && message.data?.message) {
          this.broadcastToRoom(message.roomId, message.data.message, connection.id)
        }
        break

      case 'heartbeat':
        connection.lastHeartbeat = Date.now()
        connection.socket.send(`__cluster__${JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now(),
        })}`)
        break
    }
  }

  /**
   * Broadcast message to all workers
   */
  private broadcastToWorkers(message: ClusterMessage): void {
    if (this.isMainWorker) {
      this.workers.forEach((worker) => {
        worker.postMessage(message)
      })
    }
    else {
      process.send?.(message)
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const timeout = this.config.heartbeatInterval * 2

      // Check for stale connections
      this.connections.forEach((connection, connectionId) => {
        if (now - connection.lastHeartbeat > timeout) {
          console.log(`Closing stale connection: ${connectionId}`)
          this.closeConnection(connectionId, 1001, 'Connection timeout')
        }
      })

      // Send stats to other workers
      this.broadcastToWorkers({
        type: 'stats',
        workerId: this.workerId,
        data: {
          connections: this.connections.size,
          rooms: this.rooms.size,
          memoryUsage: process.memoryUsage().heapUsed,
          uptime: process.uptime(),
        },
        timestamp: now,
      })
    }, this.config.heartbeatInterval)
  }

  /**
   * Update worker statistics
   */
  private updateWorkerStats(): void {
    this.stats.workerStats[this.workerId] = {
      connections: this.connections.size,
      rooms: this.rooms.size,
      memoryUsage: process.memoryUsage().heapUsed,
      uptime: process.uptime(),
    }
  }
}

/**
 * WebSocket cluster factory
 */
export class WebSocketClusterFactory {
  /**
   * Create WebSocket cluster with default configuration
   */
  static create(config?: WebSocketClusterConfig): WebSocketCluster {
    return new WebSocketCluster(config)
  }

  /**
   * Create high-performance cluster for production
   */
  static createHighPerformance(): WebSocketCluster {
    return new WebSocketCluster({
      workers: Math.max(2, navigator.hardwareConcurrency),
      maxConnections: 50000,
      heartbeatInterval: 60000,
      compression: true,
      backpressureLimit: 128 * 1024,
      closeOnBackpressureLimit: true,
      idleTimeout: 300000,
      maxPayloadLength: 32 * 1024 * 1024,
    })
  }

  /**
   * Create development cluster with debugging
   */
  static createDevelopment(): WebSocketCluster {
    return new WebSocketCluster({
      workers: 1,
      maxConnections: 1000,
      heartbeatInterval: 10000,
      compression: false,
      backpressureLimit: 16 * 1024,
      closeOnBackpressureLimit: false,
      idleTimeout: 60000,
      maxPayloadLength: 1024 * 1024,
    })
  }
}

/**
 * WebSocket cluster helpers
 */
export const WebSocketClusterHelpers = {
  /**
   * Create room-based chat system
   */
  createChatSystem: (cluster: WebSocketCluster): any => ({
    joinRoom: (connectionId: string, roomId: string, userInfo: any) => {
      return cluster.joinRoom(connectionId, roomId, { userInfo, joinedAt: Date.now() })
    },

    leaveRoom: (connectionId: string, roomId: string) => {
      return cluster.leaveRoom(connectionId, roomId)
    },

    sendMessage: (roomId: string, message: any, fromConnectionId?: string) => {
      const chatMessage = JSON.stringify({
        type: 'chat_message',
        roomId,
        message,
        timestamp: Date.now(),
        from: fromConnectionId,
      })
      return cluster.broadcastToRoom(roomId, chatMessage, fromConnectionId)
    },

    getRoomUsers: (roomId: string) => {
      return cluster.getRoomConnections(roomId)
    },
  }),

  /**
   * Create real-time notifications system
   */
  createNotificationSystem: (cluster: WebSocketCluster): any => ({
    subscribe: (connectionId: string, topics: string[]) => {
      topics.forEach((topic) => {
        cluster.joinRoom(connectionId, `notification:${topic}`)
      })
    },

    unsubscribe: (connectionId: string, topics: string[]) => {
      topics.forEach((topic) => {
        cluster.leaveRoom(connectionId, `notification:${topic}`)
      })
    },

    notify: (topic: string, notification: any) => {
      const message = JSON.stringify({
        type: 'notification',
        topic,
        data: notification,
        timestamp: Date.now(),
      })
      return cluster.broadcastToRoom(`notification:${topic}`, message)
    },
  }),

  /**
   * Create presence system
   */
  createPresenceSystem: (cluster: WebSocketCluster): any => ({
    setPresence: (connectionId: string, status: 'online' | 'away' | 'busy' | 'offline', metadata?: any) => {
      cluster.broadcastToRoom('presence', JSON.stringify({
        type: 'presence_update',
        connectionId,
        status,
        metadata,
        timestamp: Date.now(),
      }), connectionId)
    },

    getOnlineUsers: () => {
      return cluster.getRoomConnections('presence')
    },
  }),
}
