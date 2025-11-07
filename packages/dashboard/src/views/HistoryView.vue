<script setup lang="ts">
import type { HistoryItem } from '../store/historyStore'
import { computed, onMounted, ref, watch } from 'vue'
import { useHistoryStore } from '../store/historyStore'

const historyStore = useHistoryStore()
const searchQuery = ref('')
const selectedItem = ref<HistoryItem | null>(null)
const statusFilter = ref<number | null>(null)
const methodFilter = ref<string | null>(null)
const showDetailPanel = ref(false)
const isSearching = ref(false)
const searchTimeout = ref<number | null>(null)

// Status filter options
const statusOptions = [
  { label: 'All', value: null },
  { label: '2xx Success', value: 200 },
  { label: '3xx Redirect', value: 300 },
  { label: '4xx Client Error', value: 400 },
  { label: '5xx Server Error', value: 500 },
]

// Method filter options
const methodOptions = [
  { label: 'All', value: null },
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
]

// Date range filter
const dateRange = ref<{ from: Date | null, to: Date | null }>({
  from: null,
  to: null,
})

// Load history data
onMounted(async () => {
  try {
    await historyStore.fetchHistory()
  }
  catch (error) {
    console.error('Failed to load history:', error)
  }
})

// Perform search with debounce
function performSearch() {
  isSearching.value = true

  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }

  searchTimeout.value = window.setTimeout(() => {
    isSearching.value = false
  }, 300)
}

// Watch for search query changes
watch(searchQuery, performSearch)

// Filtered history items
const filteredHistory = computed(() => {
  // Start with search results or all history
  let results = searchQuery.value.trim()
    ? historyStore.searchHistory(searchQuery.value)
    : historyStore.history

  // Apply status filter
  if (statusFilter.value && statusFilter.value !== null) {
    const filterValue = statusFilter.value
    results = results.filter(item =>
      item.status && item.status >= filterValue
      && item.status < filterValue + 100,
    )
  }

  // Apply method filter
  if (methodFilter.value) {
    results = results.filter(item => item.method === methodFilter.value)
  }

  // Apply date range filter
  if (dateRange.value.from) {
    results = results.filter(item =>
      new Date(item.timestamp) >= dateRange.value.from!,
    )
  }

  if (dateRange.value.to) {
    results = results.filter(item =>
      new Date(item.timestamp) <= dateRange.value.to!,
    )
  }

  return results
})

// Get status class for styling
function getStatusClass(status: number) {
  if (status >= 200 && status < 300)
    return 'text-green-600'
  if (status >= 300 && status < 400)
    return 'text-blue-600'
  if (status >= 400 && status < 500)
    return 'text-orange-600'
  if (status >= 500)
    return 'text-red-600'
  return 'text-gray-600'
}

// Get method class for styling
function getMethodClass(method: string) {
  switch (method) {
    case 'GET': return 'bg-blue-100 text-blue-800'
    case 'POST': return 'bg-green-100 text-green-800'
    case 'PUT': return 'bg-yellow-100 text-yellow-800'
    case 'PATCH': return 'bg-indigo-100 text-indigo-800'
    case 'DELETE': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

// View details of a history item
function viewDetails(item: HistoryItem) {
  selectedItem.value = item
  showDetailPanel.value = true
}

// Clear selected item
function clearSelection() {
  selectedItem.value = null
  showDetailPanel.value = false
}

// Delete history item
function deleteHistoryItem(id: string) {
  // eslint-disable-next-line no-alert
  const confirmed = confirm('Are you sure you want to delete this request from history?')
  if (!confirmed)
    return

  historyStore.deleteHistoryItem(id)
  if (selectedItem.value?.id === id) {
    clearSelection()
  }
}

// Clear all history
function clearAllHistory() {
  // eslint-disable-next-line no-alert
  const confirmed = confirm('Are you sure you want to clear all request history?')
  if (!confirmed)
    return

  historyStore.clearHistory()
  clearSelection()
}

// Add tag to history item
function addTag(item: HistoryItem, tag: string) {
  historyStore.addTagToHistoryItem(item.id, tag)
}

// Remove tag from history item
function removeTag(item: HistoryItem, tag: string) {
  historyStore.removeTagFromHistoryItem(item.id, tag)
}

// Get prompt input
function getPromptInput(message: string): string | null {
  // eslint-disable-next-line no-alert
  return window.prompt(message)
}

// Format date
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString()
}

// Format duration
function formatDuration(duration: number) {
  return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`
}

// Highlight search terms in text
function highlightSearchTerms(text: string) {
  if (!searchQuery.value.trim())
    return text

  const terms = searchQuery.value.toLowerCase().split(' ').filter(t => t.length > 0)
  if (terms.length === 0)
    return text

  let result = text
  terms.forEach((term) => {
    const regex = new RegExp(term, 'gi')
    result = result.replace(regex, match => `<mark class="bg-yellow-200">${match}</mark>`)
  })

  return result
}
</script>

<template>
  <div class="history-view">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">
        Request History
      </h1>
      <button
        class="btn-secondary px-4 py-2 bg-white border border-red-300 text-red-700 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
        @click="clearAllHistory"
      >
        <span class="i-carbon-trash-can mr-2" />
        Clear History
      </button>
    </div>

    <!-- Search and Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div class="md:col-span-3">
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Full-text Search</label>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
              <span class="i-carbon-search" />
            </span>
            <input
              id="search"
              v-model="searchQuery"
              type="text"
              placeholder="Search in URLs, headers, request/response bodies, status codes..."
              class="block w-full rounded-md border-gray-300 pl-10 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
            <div v-if="isSearching" class="absolute inset-y-0 right-0 pr-3 flex items-center">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-solid border-indigo-600 border-r-transparent" />
            </div>
          </div>
        </div>

        <div>
          <label for="status-filter" class="block text-sm font-medium text-gray-700 mb-1">Status Code</label>
          <select
            id="status-filter"
            v-model="statusFilter"
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option v-for="option in statusOptions" :key="option.label" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div>
          <label for="method-filter" class="block text-sm font-medium text-gray-700 mb-1">HTTP Method</label>
          <select
            id="method-filter"
            v-model="methodFilter"
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option v-for="option in methodOptions" :key="option.label" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Results grid with detail panel -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Results List -->
      <div class="bg-white rounded-lg shadow overflow-hidden lg:col-span-3" :class="{ 'lg:col-span-2': showDetailPanel }">
        <div v-if="historyStore.isLoading" class="p-8 text-center">
          <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent" />
          <p class="mt-2 text-gray-600">
            Loading request history...
          </p>
        </div>

        <div v-else-if="filteredHistory.length === 0" class="p-8 text-center">
          <p class="text-gray-600">
            No request history found matching your filters.
          </p>
        </div>

        <table v-else class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Method
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                URL
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr
              v-for="item in filteredHistory"
              :key="item.id"
              class="hover:bg-gray-50 cursor-pointer"
              :class="selectedItem?.id === item.id ? 'bg-indigo-50' : ''"
              @click="viewDetails(item)"
            >
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${getMethodClass(item.method)}`">
                  {{ item.method }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                <span v-html="highlightSearchTerms(item.path || '')" />
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span :class="`font-medium ${getStatusClass(item.status || 0)}`">
                  {{ item.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatDate(item.timestamp) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatDuration(item.duration || 0) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  class="text-red-600 hover:text-red-900 mr-2"
                  title="Delete from history"
                  @click.stop="deleteHistoryItem(item.id)"
                >
                  <span class="i-carbon-trash-can" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Detail Panel -->
      <div
        v-if="showDetailPanel && selectedItem"
        class="bg-white rounded-lg shadow overflow-hidden lg:col-span-1"
      >
        <div class="p-4 border-b border-gray-200 flex justify-between items-center">
          <div class="flex items-center">
            <button
              class="mr-2 p-1 text-gray-500 hover:text-gray-700 lg:hidden"
              @click="clearSelection"
            >
              <span class="i-carbon-arrow-left" />
            </button>
            <h2 class="text-lg font-medium text-gray-900">
              Request Details
            </h2>
          </div>
          <button
            class="p-1 text-gray-500 hover:text-gray-700 hidden lg:block"
            @click="clearSelection"
          >
            <span class="i-carbon-close" />
          </button>
        </div>

        <div class="p-4 border-b border-gray-200">
          <div class="flex justify-between items-start mb-4">
            <div>
              <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${getMethodClass(selectedItem.method)} mb-2`">
                {{ selectedItem.method }}
              </span>
              <h3 class="text-sm font-medium text-gray-900">
                {{ selectedItem.path }}
              </h3>
              <p class="text-xs text-gray-500 mt-1">
                {{ selectedItem.url }}
              </p>
            </div>
            <span :class="`font-medium text-lg ${getStatusClass(selectedItem.status || 0)}`">
              {{ selectedItem.status }}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-gray-500">
                Time
              </p>
              <p>{{ formatDate(selectedItem.timestamp) }}</p>
            </div>
            <div>
              <p class="text-gray-500">
                Duration
              </p>
              <p>{{ formatDuration(selectedItem.duration || 0) }}</p>
            </div>
          </div>

          <!-- Tags -->
          <div class="mt-4">
            <p class="text-sm text-gray-500 mb-2">
              Tags
            </p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="tag in selectedItem.tags"
                :key="tag"
                class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800"
              >
                {{ tag }}
                <button
                  class="ml-1 text-gray-500 hover:text-gray-700"
                  @click="removeTag(selectedItem, tag)"
                >
                  <span class="i-carbon-close" />
                </button>
              </span>
              <button
                class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:text-gray-700"
                @click="addTag(selectedItem, getPromptInput('Enter tag name:') || '')"
              >
                <span class="i-carbon-add mr-1" />
                Add Tag
              </button>
            </div>
          </div>
        </div>

        <!-- Request Details -->
        <div class="p-4 border-b border-gray-200">
          <h3 class="text-sm font-medium text-gray-900 mb-2">
            Request
          </h3>

          <!-- Query Params -->
          <div v-if="selectedItem.queryParams && Object.keys(selectedItem.queryParams).length > 0" class="mb-4">
            <p class="text-xs text-gray-500 mb-1">
              Query Parameters
            </p>
            <div class="bg-gray-50 p-2 rounded-md">
              <div v-for="(value, key) in selectedItem.queryParams" :key="key" class="text-xs font-mono">
                <span class="text-indigo-700">{{ key }}</span>: <span class="text-gray-800">{{ value }}</span>
              </div>
            </div>
          </div>

          <!-- Request Headers -->
          <div class="mb-4">
            <p class="text-xs text-gray-500 mb-1">
              Headers
            </p>
            <div class="bg-gray-50 p-2 rounded-md">
              <div v-for="(value, key) in selectedItem.requestHeaders" :key="key" class="text-xs font-mono">
                <span class="text-indigo-700">{{ key }}</span>: <span class="text-gray-800">{{ value }}</span>
              </div>
            </div>
          </div>

          <!-- Request Body -->
          <div v-if="selectedItem.requestBody" class="mb-2">
            <p class="text-xs text-gray-500 mb-1">
              Body
            </p>
            <div class="bg-gray-50 p-2 rounded-md">
              <pre class="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-40">{{ selectedItem.requestBody }}</pre>
            </div>
          </div>
        </div>

        <!-- Response Details -->
        <div class="p-4">
          <h3 class="text-sm font-medium text-gray-900 mb-2">
            Response
          </h3>

          <!-- Response Headers -->
          <div class="mb-4">
            <p class="text-xs text-gray-500 mb-1">
              Headers
            </p>
            <div class="bg-gray-50 p-2 rounded-md">
              <div v-for="(value, key) in selectedItem.responseHeaders" :key="key" class="text-xs font-mono">
                <span class="text-indigo-700">{{ key }}</span>: <span class="text-gray-800">{{ value }}</span>
              </div>
            </div>
          </div>

          <!-- Response Body -->
          <div v-if="selectedItem.responseBody" class="mb-2">
            <p class="text-xs text-gray-500 mb-1">
              Body
            </p>
            <div class="bg-gray-50 p-2 rounded-md">
              <pre class="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-40">{{ selectedItem.responseBody }}</pre>
            </div>
          </div>

          <!-- Error -->
          <div v-if="selectedItem.error" class="mt-4">
            <p class="text-xs text-gray-500 mb-1">
              Error
            </p>
            <div class="bg-red-50 p-2 rounded-md text-xs text-red-800 font-medium">
              {{ selectedItem.error }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
