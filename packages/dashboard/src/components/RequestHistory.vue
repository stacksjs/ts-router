<script setup lang="ts">
import type { HistoryItem } from '../store/historyStore'
import { computed, ref } from 'vue'
import { useHistoryStore } from '../store/historyStore'

const emit = defineEmits(['useRequest'])
const historyStore = useHistoryStore()
const history = computed(() => historyStore.sortedHistory)
const isExpanded = ref<Record<string, boolean>>({})

function toggleExpand(id: string) {
  isExpanded.value[id] = !isExpanded.value[id]
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleString()
}

function formatJson(json: string) {
  try {
    const parsed = JSON.parse(json)
    return JSON.stringify(parsed, null, 2)
  }
  catch {
    return json
  }
}

function reuseRequest(item: HistoryItem) {
  emit('useRequest', {
    method: item.method,
    url: item.url,
    headers: item.headers,
    body: item.body,
  })
}

function deleteItem(id: string) {
  // eslint-disable-next-line no-alert
  if (confirm('Are you sure you want to delete this request from history?')) {
    historyStore.removeHistoryItem(id)
  }
}

function clearAllHistory() {
  // eslint-disable-next-line no-alert
  if (confirm('Are you sure you want to clear all request history?')) {
    historyStore.clearHistory()
  }
}
</script>

<template>
  <div class="request-history">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-medium">
        Recent Requests
      </h3>
      <button
        v-if="history.length > 0"
        class="text-sm text-red-600 hover:text-red-800"
        @click="clearAllHistory"
      >
        Clear All
      </button>
    </div>

    <div v-if="history.length === 0" class="text-center py-8 text-gray-500">
      No request history yet. Send requests to see them here.
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in history"
        :key="item.id"
        class="border border-gray-200 rounded-md overflow-hidden"
      >
        <!-- Header -->
        <div
          class="p-3 bg-gray-50 flex justify-between items-center cursor-pointer hover:bg-gray-100"
          @click="toggleExpand(item.id)"
        >
          <div class="flex items-center space-x-3">
            <span
              class="px-2 py-1 text-xs rounded font-medium"
              :class="{
                'bg-blue-100 text-blue-800': item.method === 'GET',
                'bg-green-100 text-green-800': item.method === 'POST',
                'bg-yellow-100 text-yellow-800': item.method === 'PUT',
                'bg-red-100 text-red-800': item.method === 'DELETE',
                'bg-purple-100 text-purple-800': item.method === 'PATCH',
              }"
            >
              {{ item.method }}
            </span>
            <span class="text-sm font-medium truncate max-w-xs">{{ item.url }}</span>
          </div>

          <div class="flex items-center space-x-2">
            <span
              v-if="item.status"
              class="px-2 py-1 text-xs rounded"
              :class="{
                'bg-green-100 text-green-800': item.status >= 200 && item.status < 300,
                'bg-yellow-100 text-yellow-800': item.status >= 300 && item.status < 400,
                'bg-red-100 text-red-800': item.status >= 400,
              }"
            >
              {{ item.status }}
            </span>
            <span class="text-sm text-gray-500">{{ formatDate(item.timestamp) }}</span>
            <span
              class="text-xs"
              :class="isExpanded[item.id] ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
            />
          </div>
        </div>

        <!-- Details (expandable) -->
        <div v-if="isExpanded[item.id]" class="p-3 border-t border-gray-200">
          <div class="flex justify-end space-x-2 mb-3">
            <button
              class="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded hover:bg-indigo-200"
              @click="reuseRequest(item)"
            >
              Use This Request
            </button>
            <button
              class="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
              @click="deleteItem(item.id)"
            >
              Delete
            </button>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- Request details -->
            <div>
              <h4 class="text-sm font-medium mb-2">
                Request
              </h4>

              <div class="mb-2">
                <div class="text-xs font-medium text-gray-500 mb-1">
                  URL
                </div>
                <div class="text-sm font-mono bg-gray-50 p-2 rounded break-all">
                  {{ item.url }}
                </div>
              </div>

              <div class="mb-2">
                <div class="text-xs font-medium text-gray-500 mb-1">
                  Headers
                </div>
                <div class="text-sm font-mono bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                  <div v-for="(header, i) in item.headers" :key="i" class="mb-1">
                    <span class="text-indigo-700">{{ header.key }}:</span> {{ header.value }}
                  </div>
                </div>
              </div>

              <div v-if="item.body" class="mb-2">
                <div class="text-xs font-medium text-gray-500 mb-1">
                  Body
                </div>
                <pre class="text-sm font-mono bg-gray-50 p-2 rounded max-h-48 overflow-y-auto">{{ formatJson(item.body) }}</pre>
              </div>
            </div>

            <!-- Response details -->
            <div>
              <h4 class="text-sm font-medium mb-2">
                Response
              </h4>

              <div v-if="item.status" class="mb-2">
                <div class="text-xs font-medium text-gray-500 mb-1">
                  Status
                </div>
                <div class="text-sm font-mono bg-gray-50 p-2 rounded">
                  {{ item.status }} {{ item.statusText }}
                </div>
              </div>

              <div v-if="item.responseTime" class="mb-2">
                <div class="text-xs font-medium text-gray-500 mb-1">
                  Time
                </div>
                <div class="text-sm font-mono bg-gray-50 p-2 rounded">
                  {{ item.responseTime }}ms
                </div>
              </div>

              <div v-if="item.responseHeaders" class="mb-2">
                <div class="text-xs font-medium text-gray-500 mb-1">
                  Headers
                </div>
                <div class="text-sm font-mono bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                  <div v-for="(value, key) in item.responseHeaders" :key="key" class="mb-1">
                    <span class="text-indigo-700">{{ key }}:</span> {{ value }}
                  </div>
                </div>
              </div>

              <div v-if="item.responseBody" class="mb-2">
                <div class="text-xs font-medium text-gray-500 mb-1">
                  Body
                </div>
                <pre class="text-sm font-mono bg-gray-50 p-2 rounded max-h-48 overflow-y-auto">{{ formatJson(item.responseBody) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.request-history {
  height: 100%;
  overflow-y: auto;
}
</style>
