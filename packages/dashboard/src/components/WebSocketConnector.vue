<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

const props = defineProps<{
  onMessage: (message: any) => void
  onOpen: () => void
  onClose: () => void
  onError: (error: any) => void
}>()

const wsUrl = ref('ws://echo.websocket.org')
const wsProtocol = ref('')
const isConnecting = ref(false)
const isConnected = ref(false)
const connectionError = ref('')
const _messageDraft = ref('')

let ws: WebSocket | null = null

function connect() {
  try {
    isConnecting.value = true
    connectionError.value = ''

    const protocols = wsProtocol.value ? [wsProtocol.value] : undefined
    ws = new WebSocket(wsUrl.value, protocols)

    ws.onopen = () => {
      isConnecting.value = false
      isConnected.value = true
      props.onOpen()
    }

    ws.onclose = () => {
      isConnected.value = false
      ws = null
      props.onClose()
    }

    ws.onerror = (error) => {
      connectionError.value = 'Connection error'
      isConnecting.value = false
      props.onError(error)
    }

    ws.onmessage = (event) => {
      props.onMessage(event.data)
    }
  }
  catch (error) {
    connectionError.value = error instanceof Error ? error.message : 'Failed to connect'
    isConnecting.value = false
    isConnected.value = false
  }
}

function disconnect() {
  if (ws) {
    ws.close()
    ws = null
    isConnected.value = false
  }
}

function sendMessage(message: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(message)
    return true
  }
  return false
}

// Expose methods to parent
defineExpose({
  connect,
  disconnect,
  sendMessage,
})

// Clean up on unmount
onUnmounted(() => {
  if (ws) {
    ws.close()
    ws = null
  }
})
</script>

<template>
  <div class="websocket-connector">
    <div class="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="md:col-span-2">
        <label for="ws-url-real" class="block text-sm font-medium text-gray-700 mb-1">WebSocket URL</label>
        <input
          id="ws-url-real"
          v-model="wsUrl"
          type="text"
          :disabled="isConnected"
          class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="ws://echo.websocket.org"
        >
      </div>

      <div>
        <label for="ws-protocol-real" class="block text-sm font-medium text-gray-700 mb-1">Protocol (optional)</label>
        <input
          id="ws-protocol-real"
          v-model="wsProtocol"
          type="text"
          :disabled="isConnected"
          class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="e.g. graphql-ws"
        >
      </div>
    </div>

    <div class="flex space-x-3">
      <button
        v-if="!isConnected"
        :disabled="isConnecting || !wsUrl"
        class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 disabled:bg-indigo-300"
        @click="connect"
      >
        <span v-if="isConnecting" class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mr-2" />
        {{ isConnecting ? 'Connecting...' : 'Connect' }}
      </button>

      <button
        v-else
        class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
        @click="disconnect"
      >
        Disconnect
      </button>
    </div>

    <div v-if="connectionError" class="mt-3 text-red-600 text-sm">
      {{ connectionError }}
    </div>
  </div>
</template>
