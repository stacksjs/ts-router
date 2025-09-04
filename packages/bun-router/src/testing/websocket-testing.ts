import type { ServerWebSocket } from 'bun'
import type { WSTestClient, WSTestMessage } from './types'
import { mock } from 'bun:test'

/**
 * WebSocket testing utilities
 */
export class WebSocketTester {
  private messages: WSTestMessage[] = []
  private isConnected: boolean = false
  private readyState: number = 0 // CONNECTING
  private eventHandlers: Map<string, Function[]> = new Map()

  constructor() {
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.eventHandlers.set('open', [])
    this.eventHandlers.set('message', [])
    this.eventHandlers.set('close', [])
    this.eventHandlers.set('error', [])
  }

  /**
   * Simulate WebSocket connection
   */
  connect(): WebSocketTester {
    this.isConnected = true
    this.readyState = 1 // OPEN
    this.emit('open', { type: 'open' })
    return this
  }

  /**
   * Simulate WebSocket disconnection
   */
  disconnect(code: number = 1000, reason: string = 'Normal closure'): WebSocketTester {
    this.isConnected = false
    this.readyState = 3 // CLOSED
    this.emit('close', { type: 'close', code, reason })
    return this
  }

  /**
   * Simulate sending a message
   */
  send(data: string | ArrayBuffer | Uint8Array): WebSocketTester {
    if (!this.isConnected) {
      throw new Error('WebSocket is not connected')
    }

    const message: WSTestMessage = {
      type: typeof data === 'string' ? 'text' : 'binary',
      data,
      timestamp: Date.now(),
    }

    this.messages.push(message)
    return this
  }

  /**
   * Simulate receiving a message
   */
  receive(data: string | ArrayBuffer | Uint8Array): WebSocketTester {
    if (!this.isConnected) {
      throw new Error('WebSocket is not connected')
    }

    const message: WSTestMessage = {
      type: typeof data === 'string' ? 'text' : 'binary',
      data,
      timestamp: Date.now(),
    }

    this.emit('message', { type: 'message', data })
    return this
  }

  /**
   * Simulate ping
   */
  ping(data?: Uint8Array): WebSocketTester {
    if (!this.isConnected) {
      throw new Error('WebSocket is not connected')
    }
    this.emit('ping', { type: 'ping', data })
    return this
  }

  /**
   * Simulate pong
   */
  pong(data?: Uint8Array): WebSocketTester {
    if (!this.isConnected) {
      throw new Error('WebSocket is not connected')
    }
    this.emit('pong', { type: 'pong', data })
    return this
  }

  /**
   * Add event listener
   */
  on(event: string, handler: Function): WebSocketTester {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(handler)
    return this
  }

  /**
   * Remove event listener
   */
  off(event: string, handler: Function): WebSocketTester {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
    return this
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || []
    handlers.forEach(handler => handler(data))
  }

  /**
   * Get all sent messages
   */
  getSentMessages(): WSTestMessage[] {
    return [...this.messages]
  }

  /**
   * Get messages of specific type
   */
  getMessagesByType(type: 'text' | 'binary'): WSTestMessage[] {
    return this.messages.filter(msg => msg.type === type)
  }

  /**
   * Clear message history
   */
  clearMessages(): WebSocketTester {
    this.messages = []
    return this
  }

  /**
   * Get connection state
   */
  getState(): { isConnected: boolean, readyState: number } {
    return {
      isConnected: this.isConnected,
      readyState: this.readyState,
    }
  }

  /**
   * Create a test client interface
   */
  getTestClient(): WSTestClient {
    return {
      send: (message: string | ArrayBuffer | Uint8Array) => this.send(message),
      close: (code?: number, reason?: string) => this.disconnect(code, reason),
      ping: (data?: Uint8Array) => this.ping(data),
      pong: (data?: Uint8Array) => this.pong(data),
      messages: this.getSentMessages(),
      isConnected: this.isConnected,
      readyState: this.readyState,
    }
  }
}

/**
 * Mock ServerWebSocket for testing
 */
export class MockServerWebSocket {
  private tester: WebSocketTester
  private data: any

  constructor(data: any = {}) {
    this.tester = new WebSocketTester()
    this.data = data
  }

  send(message: string | ArrayBuffer | Uint8Array): void {
    this.tester.send(message)
  }

  close(code?: number, reason?: string): void {
    this.tester.disconnect(code, reason)
  }

  ping(data?: Uint8Array): void {
    this.tester.ping(data)
  }

  pong(data?: Uint8Array): void {
    this.tester.pong(data)
  }

  publish(topic: string, message: string | ArrayBuffer | Uint8Array): void {
    // Mock publish functionality
    this.tester.send(message)
  }

  subscribe(topic: string): void {
    // Mock subscribe functionality
  }

  unsubscribe(topic: string): void {
    // Mock unsubscribe functionality
  }

  isSubscribed(topic: string): boolean {
    return true // Mock implementation
  }

  cork(callback: () => void): void {
    callback()
  }

  get readyState(): number {
    return this.tester.getState().readyState
  }

  get data(): any {
    return this.data
  }

  set data(value: any) {
    this.data = value
  }

  getTester(): WebSocketTester {
    return this.tester
  }
}

/**
 * WebSocket handler testing utilities
 */
export const wsHandlerMocks = {
  /**
   * Mock WebSocket open handler
   */
  onOpen: () => mock(async (ws: ServerWebSocket<any>) => {
    // Mock open handler
  }),

  /**
   * Mock WebSocket message handler
   */
  onMessage: (response?: string | ArrayBuffer | Uint8Array) =>
    mock(async (ws: ServerWebSocket<any>, message: string | Uint8Array | ArrayBuffer) => {
      if (response) {
        ws.send(response)
      }
    }),

  /**
   * Mock WebSocket close handler
   */
  onClose: () => mock(async (ws: ServerWebSocket<any>, code: number, reason: string) => {
    // Mock close handler
  }),

  /**
   * Mock WebSocket error handler
   */
  onError: () => mock(async (ws: ServerWebSocket<any>, error: Error) => {
    // Mock error handler
  }),

  /**
   * Mock echo handler
   */
  echo: () => mock(async (ws: ServerWebSocket<any>, message: string | Uint8Array | ArrayBuffer) => {
    ws.send(message)
  }),

  /**
   * Mock broadcast handler
   */
  broadcast: (clients: ServerWebSocket<any>[]) =>
    mock(async (ws: ServerWebSocket<any>, message: string | Uint8Array | ArrayBuffer) => {
      clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(message)
        }
      })
    }),

  /**
   * Mock chat room handler
   */
  chatRoom: (room: string) =>
    mock(async (ws: ServerWebSocket<any>, message: string | Uint8Array | ArrayBuffer) => {
      ws.publish(room, message)
    }),
}

/**
 * WebSocket test scenarios
 */
export const wsTestScenarios = {
  /**
   * Test basic connection and message exchange
   */
  basicConnection: (): WebSocketTester => {
    return new WebSocketTester()
      .connect()
      .send('Hello WebSocket')
      .receive('Hello Client')
  },

  /**
   * Test connection failure
   */
  connectionFailure: (): WebSocketTester => {
    const tester = new WebSocketTester()
    tester.on('error', () => {
      // Handle connection error
    })
    return tester
  },

  /**
   * Test message broadcasting
   */
  messageBroadcast: (clientCount: number = 3): WebSocketTester[] => {
    const clients = Array.from({ length: clientCount }, () =>
      new WebSocketTester().connect())

    // Simulate one client sending a message
    clients[0].send('Broadcast message')

    // Simulate other clients receiving the message
    clients.slice(1).forEach(client =>
      client.receive('Broadcast message'),
    )

    return clients
  },

  /**
   * Test ping/pong mechanism
   */
  pingPong: (): WebSocketTester => {
    return new WebSocketTester()
      .connect()
      .ping()
      .pong()
  },

  /**
   * Test connection timeout
   */
  connectionTimeout: (): WebSocketTester => {
    const tester = new WebSocketTester()
    setTimeout(() => {
      tester.disconnect(1006, 'Connection timeout')
    }, 100)
    return tester
  },
}

/**
 * WebSocket assertion helpers
 */
export const wsAssertions = {
  /**
   * Assert WebSocket is connected
   */
  isConnected: (tester: WebSocketTester): void => {
    const state = tester.getState()
    if (!state.isConnected) {
      throw new Error('Expected WebSocket to be connected')
    }
  },

  /**
   * Assert WebSocket is disconnected
   */
  isDisconnected: (tester: WebSocketTester): void => {
    const state = tester.getState()
    if (state.isConnected) {
      throw new Error('Expected WebSocket to be disconnected')
    }
  },

  /**
   * Assert message was sent
   */
  messageSent: (tester: WebSocketTester, expectedMessage: string | ArrayBuffer | Uint8Array): void => {
    const messages = tester.getSentMessages()
    const found = messages.some((msg) => {
      if (typeof expectedMessage === 'string' && typeof msg.data === 'string') {
        return msg.data === expectedMessage
      }
      return msg.data === expectedMessage
    })

    if (!found) {
      throw new Error(`Expected message not found in sent messages`)
    }
  },

  /**
   * Assert number of messages sent
   */
  messageCount: (tester: WebSocketTester, expectedCount: number): void => {
    const messages = tester.getSentMessages()
    if (messages.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} messages, but got ${messages.length}`)
    }
  },

  /**
   * Assert message type
   */
  messageType: (tester: WebSocketTester, index: number, expectedType: 'text' | 'binary'): void => {
    const messages = tester.getSentMessages()
    if (index >= messages.length) {
      throw new Error(`Message at index ${index} does not exist`)
    }

    if (messages[index].type !== expectedType) {
      throw new Error(`Expected message type '${expectedType}', got '${messages[index].type}'`)
    }
  },

  /**
   * Assert ready state
   */
  readyState: (tester: WebSocketTester, expectedState: number): void => {
    const state = tester.getState()
    if (state.readyState !== expectedState) {
      throw new Error(`Expected ready state ${expectedState}, got ${state.readyState}`)
    }
  },
}

/**
 * WebSocket performance testing
 */
export const wsPerformance = {
  /**
   * Test message throughput
   */
  testThroughput: async (
    messageCount: number = 1000,
    messageSize: number = 1024,
  ): Promise<{
    messagesPerSecond: number
    totalTime: number
    averageLatency: number
  }> => {
    const tester = new WebSocketTester().connect()
    const message = 'x'.repeat(messageSize)

    const startTime = performance.now()

    for (let i = 0; i < messageCount; i++) {
      tester.send(message)
    }

    const endTime = performance.now()
    const totalTime = endTime - startTime
    const messagesPerSecond = (messageCount / totalTime) * 1000
    const averageLatency = totalTime / messageCount

    return {
      messagesPerSecond,
      totalTime,
      averageLatency,
    }
  },

  /**
   * Test concurrent connections
   */
  testConcurrentConnections: async (
    connectionCount: number = 100,
  ): Promise<{
    successfulConnections: number
    failedConnections: number
    averageConnectionTime: number
  }> => {
    const results = {
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionTime: 0,
    }

    const connectionTimes: number[] = []

    const promises = Array.from({ length: connectionCount }, async () => {
      const startTime = performance.now()
      try {
        const tester = new WebSocketTester()
        tester.connect()
        const endTime = performance.now()
        connectionTimes.push(endTime - startTime)
        results.successfulConnections++
      }
      catch (error) {
        results.failedConnections++
      }
    })

    await Promise.all(promises)

    results.averageConnectionTime = connectionTimes.length > 0
      ? connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length
      : 0

    return results
  },
}

/**
 * Factory functions
 */
export function createWebSocketTester(): WebSocketTester {
  return new WebSocketTester()
}

export function createMockServerWebSocket(data?: any): MockServerWebSocket {
  return new MockServerWebSocket(data)
}

/**
 * WebSocket test utilities
 */
export const wsTestUtils = {
  /**
   * Create multiple connected clients
   */
  createClients: (count: number): WebSocketTester[] => {
    return Array.from({ length: count }, () =>
      new WebSocketTester().connect())
  },

  /**
   * Simulate network latency
   */
  withLatency: (tester: WebSocketTester, latencyMs: number): WebSocketTester => {
    const originalSend = tester.send.bind(tester)
    tester.send = (data: string | ArrayBuffer | Uint8Array) => {
      setTimeout(() => originalSend(data), latencyMs)
      return tester
    }
    return tester
  },

  /**
   * Simulate packet loss
   */
  withPacketLoss: (tester: WebSocketTester, lossRate: number): WebSocketTester => {
    const originalSend = tester.send.bind(tester)
    tester.send = (data: string | ArrayBuffer | Uint8Array) => {
      if (Math.random() > lossRate) {
        originalSend(data)
      }
      return tester
    }
    return tester
  },

  /**
   * Create message generator
   */
  * messageGenerator(count: number, prefix: string = 'Message'): Generator<string> {
    for (let i = 1; i <= count; i++) {
      yield `${prefix} ${i}`
    }
  },
}
