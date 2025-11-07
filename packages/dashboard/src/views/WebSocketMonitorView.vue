<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import WebSocketConnector from '../components/WebSocketConnector.vue'

interface WebSocketMessage {
  id: string
  direction: 'in' | 'out'
  type: 'text' | 'binary'
  content: string
  timestamp: string
  size: number
}

interface WebSocketConnection {
  id: string
  url: string
  status: 'connecting' | 'open' | 'closed' | 'error'
  protocol: string
  createdAt: string
  closedAt?: string
  messages: WebSocketMessage[]
}

// Active connections
const connections = ref<WebSocketConnection[]>([])
const activeConnectionId = ref<string | null>(null)
const newConnectionUrl = ref('ws://localhost:8080')
const newConnectionProtocol = ref('')
const isConnecting = ref(false)
const connectionError = ref('')
const filterText = ref('')
const filterDirection = ref<'all' | 'in' | 'out'>('all')
const filterType = ref<'all' | 'text' | 'binary'>('all')
const showConnectionForm = ref(false)
const messageDraft = ref('')

// Demo WebSocket connection (for UI demonstration)
// eslint-disable-next-line unused-imports/no-unused-vars
const demoWs: WebSocket | null = null
let demoConnectionId = ''
let demoMessageInterval: number | null = null

// Real WebSocket connection
const showRealConnectionPanel = ref(false)
const activeTab = ref('demo') // 'demo' or 'real'
const wsConnectorRef = ref<InstanceType<typeof WebSocketConnector> | null>(null)

// Format bytes to human-readable format
function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// Get URL host safely
function getHostFromUrl(urlString: string): string {
  try {
    return new URL(urlString).host
  }
  catch {
    return urlString
  }
}

// Get active connection
const activeConnection = computed(() => {
  return connections.value.find(conn => conn.id === activeConnectionId.value) || null
})

// Filtered messages for active connection
const filteredMessages = computed(() => {
  if (!activeConnection.value)
    return []

  return activeConnection.value.messages.filter((msg) => {
    const matchesDirection = filterDirection.value === 'all' || msg.direction === filterDirection.value
    const matchesType = filterType.value === 'all' || msg.type === filterType.value
    const matchesText = !filterText.value || msg.content.toLowerCase().includes(filterText.value.toLowerCase())

    return matchesDirection && matchesType && matchesText
  })
})

// Toggle connection form
function toggleConnectionForm() {
  showConnectionForm.value = !showConnectionForm.value
}

// Create a new WebSocket connection
function createConnection() {
  connectionError.value = ''
  isConnecting.value = true

  try {
    const url = newConnectionUrl.value
    const protocol = newConnectionProtocol.value || undefined

    // For demo purposes, we'll create a simulated connection
    const connectionId = `conn-${Date.now()}`
    demoConnectionId = connectionId

    const newConnection: WebSocketConnection = {
      id: connectionId,
      url,
      status: 'connecting',
      protocol: protocol || '-',
      createdAt: new Date().toISOString(),
      messages: [],
    }

    connections.value.push(newConnection)
    activeConnectionId.value = connectionId

    // Simulate connection opening after a delay
    setTimeout(() => {
      const connection = connections.value.find(conn => conn.id === connectionId)
      if (connection) {
        connection.status = 'open'

        // Start demo messages
        startDemoMessages(connectionId)
      }
      isConnecting.value = false
      showConnectionForm.value = false
    }, 1500)
  }
  catch (error) {
    connectionError.value = error instanceof Error ? error.message : 'Failed to connect'
    isConnecting.value = false
  }
}

// Start sending demo messages for UI demonstration
function startDemoMessages(connectionId: string) {
  // Add initial server welcome message
  addMessage(connectionId, {
    id: `msg-${Date.now()}`,
    direction: 'in',
    type: 'text',
    content: JSON.stringify({ type: 'welcome', message: 'Connection established' }),
    timestamp: new Date().toISOString(),
    size: 58,
  })

  // Simulate periodic messages from server
  demoMessageInterval = window.setInterval(() => {
    const messageTypes = ['update', 'notification', 'heartbeat', 'data']
    const type = messageTypes[Math.floor(Math.random() * messageTypes.length)]

    const demoMessages = {
      update: { type: 'update', id: Math.floor(Math.random() * 1000), status: 'active' },
      notification: { type: 'notification', title: 'New message', body: 'You have received a new message' },
      heartbeat: { type: 'heartbeat', timestamp: Date.now() },
      data: { type: 'data', values: [Math.random(), Math.random(), Math.random()] },
    }

    const message = demoMessages[type as keyof typeof demoMessages]
    const content = JSON.stringify(message)

    addMessage(connectionId, {
      id: `msg-${Date.now()}`,
      direction: 'in',
      type: 'text',
      content,
      timestamp: new Date().toISOString(),
      size: content.length,
    })
  }, 5000)
}

// Add a message to a connection
function addMessage(connectionId: string, message: WebSocketMessage) {
  const connection = connections.value.find(conn => conn.id === connectionId)
  if (connection) {
    connection.messages.unshift(message)
  }
}

// Select a connection
function selectConnection(connectionId: string) {
  activeConnectionId.value = connectionId
}

// Close a connection
function closeConnection(connectionId: string) {
  const connection = connections.value.find(conn => conn.id === connectionId)
  if (connection && connection.status === 'open') {
    connection.status = 'closed'
    connection.closedAt = new Date().toISOString()

    if (connectionId === demoConnectionId && demoMessageInterval) {
      clearInterval(demoMessageInterval)
      demoMessageInterval = null
    }

    addMessage(connectionId, {
      id: `msg-${Date.now()}`,
      direction: 'in',
      type: 'text',
      content: JSON.stringify({ type: 'disconnect', reason: 'Connection closed by client' }),
      timestamp: new Date().toISOString(),
      size: 65,
    })
  }
}

// Remove a connection
function removeConnection(connectionId: string) {
  const index = connections.value.findIndex(conn => conn.id === connectionId)
  if (index !== -1) {
    if (connectionId === demoConnectionId && demoMessageInterval) {
      clearInterval(demoMessageInterval)
      demoMessageInterval = null
    }

    connections.value.splice(index, 1)

    if (activeConnectionId.value === connectionId) {
      activeConnectionId.value = connections.value.length > 0 ? connections.value[0].id : null
    }
  }
}

// Send a message
function sendMessage() {
  if (!activeConnection.value || activeConnection.value.status !== 'open' || !messageDraft.value) {
    return
  }

  const content = messageDraft.value

  addMessage(activeConnection.value.id, {
    id: `msg-${Date.now()}`,
    direction: 'out',
    type: 'text',
    content,
    timestamp: new Date().toISOString(),
    size: content.length,
  })

  // Simulate response after a delay
  setTimeout(() => {
    if (activeConnection.value && activeConnection.value.status === 'open') {
      const response = { type: 'response', message: 'Message received', timestamp: Date.now() }
      const content = JSON.stringify(response)

      addMessage(activeConnection.value.id, {
        id: `msg-${Date.now()}`,
        direction: 'in',
        type: 'text',
        content,
        timestamp: new Date().toISOString(),
        size: content.length,
      })
    }
  }, 1000)

  messageDraft.value = ''
}

// Clear all messages in a connection
function clearMessages(connectionId: string) {
  const connection = connections.value.find(conn => conn.id === connectionId)
  if (connection) {
    connection.messages = []
  }
}

// Get connection status class for UI styling
function getStatusClass(status: string): string {
  switch (status) {
    case 'open': return 'bg-green-500'
    case 'connecting': return 'bg-yellow-500'
    case 'closed': return 'bg-gray-500'
    case 'error': return 'bg-red-500'
    default: return 'bg-gray-500'
  }
}

// Get message direction class for UI styling
function getDirectionClass(direction: 'in' | 'out'): string {
  return direction === 'in' ? 'bg-blue-100 border-blue-200' : 'bg-green-100 border-green-200'
}

// Cleanup on component unmount
onUnmounted(() => {
  if (demoMessageInterval) {
    clearInterval(demoMessageInterval)
    demoMessageInterval = null
  }
})

// Handle real WebSocket connection messages
function handleRealWebsocketMessage(message: any) {
  if (!activeConnection.value || activeConnection.value.status !== 'open')
    return

  const messageContent = typeof message === 'string' ? message : JSON.stringify(message)

  addMessage(activeConnection.value.id, {
    id: `msg-${Date.now()}`,
    direction: 'in',
    type: 'text',
    content: messageContent,
    timestamp: new Date().toISOString(),
    size: messageContent.length,
  })
}

function handleRealWebsocketOpen() {
  if (!activeConnection.value)
    return

  // Update connection status
  activeConnection.value.status = 'open'

  // Add connection established message
  addMessage(activeConnection.value.id, {
    id: `msg-${Date.now()}`,
    direction: 'in',
    type: 'text',
    content: JSON.stringify({ type: 'welcome', message: 'Connection established' }),
    timestamp: new Date().toISOString(),
    size: 58,
  })
}

function handleRealWebsocketClose() {
  if (!activeConnection.value)
    return

  // Update connection status
  activeConnection.value.status = 'closed'
  activeConnection.value.closedAt = new Date().toISOString()

  // Add connection closed message
  addMessage(activeConnection.value.id, {
    id: `msg-${Date.now()}`,
    direction: 'in',
    type: 'text',
    content: JSON.stringify({ type: 'disconnect', reason: 'Connection closed' }),
    timestamp: new Date().toISOString(),
    size: 46,
  })
}

function handleRealWebsocketError(_error: any) {
  if (!activeConnection.value)
    return

  // Update connection status
  activeConnection.value.status = 'error'

  // Add error message
  addMessage(activeConnection.value.id, {
    id: `msg-${Date.now()}`,
    direction: 'in',
    type: 'text',
    content: JSON.stringify({ type: 'error', message: 'Connection error' }),
    timestamp: new Date().toISOString(),
    size: 44,
  })
}

// Send message through real WebSocket
function sendRealMessage() {
  if (!activeConnection.value || activeConnection.value.status !== 'open' || !messageDraft.value || !wsConnectorRef.value) {
    return
  }

  const content = messageDraft.value
  const success = wsConnectorRef.value.sendMessage(content)

  if (success) {
    // Add outgoing message
    addMessage(activeConnection.value.id, {
      id: `msg-${Date.now()}`,
      direction: 'out',
      type: 'text',
      content,
      timestamp: new Date().toISOString(),
      size: content.length,
    })

    messageDraft.value = ''
  }
}

// Toggle between demo and real connection modes
function toggleConnectionMode(mode: 'demo' | 'real') {
  activeTab.value = mode
}

// Toggle real connection panel
function toggleRealConnectionPanel() {
  showRealConnectionPanel.value = !showRealConnectionPanel.value
}
</script>

<template>
  <div class="websocket-monitor-view">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">
        WebSocket Monitor
      </h1>

      <div class="flex space-x-3">
        <div class="inline-flex rounded-md shadow-sm">
          <button
            class="px-4 py-2 rounded-l-md font-medium text-sm" :class="[
              activeTab === 'demo'
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
            ]"
            @click="toggleConnectionMode('demo')"
          >
            Demo Mode
          </button>
          <button
            class="px-4 py-2 rounded-r-md font-medium text-sm" :class="[
              activeTab === 'real'
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
            ]"
            @click="toggleConnectionMode('real')"
          >
            Real WebSockets
          </button>
        </div>

        <button
          v-if="activeTab === 'demo'"
          class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
          @click="toggleConnectionForm"
        >
          <span class="i-carbon-add mr-2" />
          New Connection
        </button>

        <button
          v-if="activeTab === 'real'"
          class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
          @click="toggleRealConnectionPanel"
        >
          <span class="i-carbon-add mr-2" />
          Real Connection
        </button>
      </div>
    </div>

    <!-- Demo Connection Form -->
    <div v-if="showConnectionForm && activeTab === 'demo'" class="bg-white rounded-lg shadow p-4 mb-6">
      <h2 class="text-lg font-medium mb-4">
        New WebSocket Connection
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label for="ws-url" class="block text-sm font-medium text-gray-700 mb-1">WebSocket URL</label>
          <input
            id="ws-url"
            v-model="newConnectionUrl"
            type="text"
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="ws://localhost:8080"
          >
        </div>

        <div>
          <label for="ws-protocol" class="block text-sm font-medium text-gray-700 mb-1">Protocol (optional)</label>
          <input
            id="ws-protocol"
            v-model="newConnectionProtocol"
            type="text"
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="e.g. graphql-ws"
          >
        </div>

        <div class="flex items-end">
          <button
            :disabled="isConnecting || !newConnectionUrl"
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 disabled:bg-indigo-300"
            @click="createConnection"
          >
            <span v-if="isConnecting" class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mr-2" />
            {{ isConnecting ? 'Connecting...' : 'Connect' }}
          </button>
        </div>
      </div>
      <div v-if="connectionError" class="mt-3 text-red-600 text-sm">
        {{ connectionError }}
      </div>
    </div>

    <!-- Real WebSocket Connection Form -->
    <div v-if="showRealConnectionPanel && activeTab === 'real'" class="bg-white rounded-lg shadow p-4 mb-6">
      <h2 class="text-lg font-medium mb-4">
        Real WebSocket Connection
      </h2>
      <WebSocketConnector
        ref="wsConnectorRef"
        :on-message="handleRealWebsocketMessage"
        :on-open="handleRealWebsocketOpen"
        :on-close="handleRealWebsocketClose"
        :on-error="handleRealWebsocketError"
      />
    </div>

    <div v-if="connections.length === 0" class="bg-white rounded-lg shadow p-8 text-center">
      <div class="flex justify-center mb-4">
        <span class="i-carbon-chat-off text-6xl text-gray-300" />
      </div>
      <p class="text-gray-600 mb-2">
        No WebSocket connections yet.
      </p>
      <p class="text-gray-500 text-sm mb-4">
        Click "New Connection" to start monitoring a WebSocket connection.
      </p>
      <button
        class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
        @click="toggleConnectionForm"
      >
        <span class="i-carbon-add mr-2" />
        New Connection
      </button>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- Connection List -->
      <div class="lg:col-span-1">
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 class="text-sm font-medium text-gray-700">
              Connections
            </h2>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-indigo-100 text-indigo-800">
              {{ connections.length }}
            </span>
          </div>

          <ul class="max-h-96 overflow-y-auto">
            <li v-for="connection in connections" :key="connection.id" class="border-b border-gray-200 last:border-b-0">
              <div
                class="px-4 py-3 hover:bg-gray-50 cursor-pointer" :class="[
                  activeConnectionId === connection.id ? 'bg-indigo-50' : '',
                ]"
                @click="selectConnection(connection.id)"
              >
                <div class="flex justify-between items-center mb-1">
                  <div class="font-medium text-indigo-600 truncate max-w-44">
                    {{ getHostFromUrl(connection.url) }}
                  </div>
                  <div class="flex items-center">
                    <div :class="`inline-block w-2 h-2 rounded-full mr-1 ${getStatusClass(connection.status)}`" />
                    <span class="text-xs text-gray-500 capitalize">{{ connection.status }}</span>
                  </div>
                </div>
                <div class="text-xs text-gray-500 truncate mb-1">
                  {{ connection.url }}
                </div>
                <div class="flex justify-between text-xs text-gray-500">
                  <span>{{ connection.messages.length }} messages</span>
                  <span>{{ new Date(connection.createdAt).toLocaleTimeString() }}</span>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Connection Details & Messages -->
      <div class="lg:col-span-3">
        <div v-if="!activeConnection" class="bg-white rounded-lg shadow p-8 text-center h-full flex items-center justify-center">
          <div>
            <p class="text-gray-600 mb-2">
              Select a connection to view details.
            </p>
          </div>
        </div>

        <div v-else class="bg-white rounded-lg shadow">
          <!-- Connection details header -->
          <div class="px-6 py-4 border-b border-gray-200">
            <div class="flex justify-between">
              <div>
                <h2 class="text-lg font-medium text-gray-900 mb-1">
                  {{ activeConnection.url }}
                </h2>
                <div class="flex items-center text-sm text-gray-500">
                  <div :class="`inline-block w-2 h-2 rounded-full mr-1 ${getStatusClass(activeConnection.status)}`" />
                  <span class="capitalize mr-4">{{ activeConnection.status }}</span>
                  <span v-if="activeConnection.protocol !== '-'" class="mr-4">Protocol: {{ activeConnection.protocol }}</span>
                  <span>Connected: {{ new Date(activeConnection.createdAt).toLocaleString() }}</span>
                  <span v-if="activeConnection.closedAt" class="ml-4">
                    Closed: {{ new Date(activeConnection.closedAt).toLocaleString() }}
                  </span>
                </div>
              </div>
              <div class="flex space-x-2">
                <button
                  v-if="activeConnection.status === 'open'"
                  class="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 text-sm"
                  @click="closeConnection(activeConnection.id)"
                >
                  Close
                </button>
                <button
                  v-if="activeConnection.messages.length > 0"
                  class="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 text-sm"
                  @click="clearMessages(activeConnection.id)"
                >
                  Clear
                </button>
                <button
                  class="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 text-sm"
                  @click="removeConnection(activeConnection.id)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          <!-- Message filters -->
          <div class="px-6 py-3 border-b border-gray-200 bg-gray-50">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex items-center">
                <label for="filter-text" class="block text-sm font-medium text-gray-700 mr-2">Filter:</label>
                <input
                  id="filter-text"
                  v-model="filterText"
                  type="text"
                  class="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Filter messages..."
                >
              </div>

              <div class="flex items-center">
                <label for="filter-direction" class="block text-sm font-medium text-gray-700 mr-2">Direction:</label>
                <select
                  id="filter-direction"
                  v-model="filterDirection"
                  class="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="all">
                    All
                  </option>
                  <option value="in">
                    Incoming
                  </option>
                  <option value="out">
                    Outgoing
                  </option>
                </select>
              </div>

              <div class="flex items-center">
                <label for="filter-type" class="block text-sm font-medium text-gray-700 mr-2">Type:</label>
                <select
                  id="filter-type"
                  v-model="filterType"
                  class="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="all">
                    All
                  </option>
                  <option value="text">
                    Text
                  </option>
                  <option value="binary">
                    Binary
                  </option>
                </select>
              </div>

              <div class="ml-auto text-sm text-gray-500">
                {{ filteredMessages.length }} of {{ activeConnection.messages.length }} messages
              </div>
            </div>
          </div>

          <!-- Message input (if connection is open) -->
          <div v-if="activeConnection.status === 'open'" class="px-6 py-3 border-b border-gray-200">
            <div class="flex space-x-2">
              <input
                v-model="messageDraft"
                type="text"
                placeholder="Type a message to send..."
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                @keyup.enter="activeTab === 'real' ? sendRealMessage() : sendMessage()"
              >
              <button
                :disabled="!messageDraft"
                class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 disabled:bg-indigo-300"
                @click="activeTab === 'real' ? sendRealMessage() : sendMessage()"
              >
                Send
              </button>
            </div>
          </div>

          <!-- Message list -->
          <div class="p-4 max-h-96 overflow-y-auto bg-gray-50">
            <div v-if="filteredMessages.length === 0" class="text-center py-8 text-gray-500">
              No messages to display.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="message in filteredMessages"
                :key="message.id"
                class="border rounded-md p-3" :class="[
                  getDirectionClass(message.direction),
                ]"
              >
                <div class="flex justify-between items-start mb-2">
                  <div class="flex items-center">
                    <span class="font-medium mr-2">
                      {{ message.direction === 'in' ? 'Received' : 'Sent' }}
                    </span>
                    <span class="text-xs text-gray-500">
                      {{ new Date(message.timestamp).toLocaleTimeString() }}
                    </span>
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ formatBytes(message.size) }}
                  </div>
                </div>

                <pre class="text-sm bg-white p-2 rounded border border-gray-200 overflow-x-auto">{{ message.content }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Connection Instructions -->
    <div class="mt-6 bg-indigo-50 rounded-lg p-4 border border-indigo-100">
      <h3 class="text-lg font-medium text-indigo-800 mb-2">
        Working with WebSockets
      </h3>
      <p class="text-indigo-700 mb-3">
        To monitor WebSocket connections from your application, you can use the WebSocket Interceptor:
      </p>
      <div class="bg-indigo-800 text-indigo-100 p-3 rounded-md font-mono text-sm overflow-x-auto">
        <code>npm install @websocket-analyzer/interceptor</code>
      </div>
      <div class="mt-3">
        <p class="text-indigo-700 mb-2">
          Then initialize it in your application:
        </p>
        <div class="bg-indigo-800 text-indigo-100 p-3 rounded-md font-mono text-sm overflow-x-auto">
          <code>import { WebSocketInterceptor } from '@websocket-analyzer/interceptor';<br>
            <br>
            // Connect to this dashboard<br>
            const interceptor = new WebSocketInterceptor({<br>
            &nbsp;&nbsp;dashboardUrl: 'http://localhost:5173',<br>
            &nbsp;&nbsp;appName: 'My Application'<br>
            });<br>
            <br>
            // Start intercepting<br>
            interceptor.start();</code>
        </div>
      </div>
    </div>
  </div>
</template>
