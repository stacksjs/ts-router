<script setup lang="ts">
import type { RequestItem } from '../store/collectionStore'
import { computed, onMounted, ref } from 'vue'
import CodeGenerator from '../components/CodeGenerator.vue'
import CollectionSidebar from '../components/CollectionSidebar.vue'
import RequestHistory from '../components/RequestHistory.vue'
import SaveRequestModal from '../components/SaveRequestModal.vue'
import { requestService } from '../services/requestService'
import { useCollectionStore } from '../store/collectionStore'
import { useEnvironmentStore } from '../store/environmentStore'
import { useHistoryStore } from '../store/historyStore'

// Request form state
const method = ref('GET')
const url = ref('{{API_URL}}/users')
const headers = ref([
  { key: 'Authorization', value: 'Bearer {{API_KEY}}' },
  { key: 'Content-Type', value: 'application/json' },
])
const body = ref('{\n  "name": "John Doe",\n  "email": "{{TEST_EMAIL}}"\n}')
const bodyType = ref('json')
const queryParams = ref<{ key: string, value: string }[]>([])

// Auth state
const authType = ref('none')
const auth = ref({
  username: '',
  password: '',
  token: '',
  apiKeyName: '',
  apiKeyValue: '',
  apiKeyLocation: 'header',
})

// UI state
const activeRequestTab = ref('headers')
const activeResponseTab = ref('body')
const showSaveModal = ref(false)
const showCodeModal = ref(false)

const requestTabs = [
  { id: 'headers', name: 'Headers' },
  { id: 'body', name: 'Body' },
  { id: 'auth', name: 'Auth' },
  { id: 'params', name: 'Params' },
]

const responseTabs = [
  { id: 'body', name: 'Body' },
  { id: 'headers', name: 'Headers' },
]

// Request/response state
const isLoading = ref(false)
const response = ref<Response | null>(null)
const responseBody = ref('')
const responseHeaders = ref<Record<string, string>>({})
const responseTime = ref(0)

// Stores
const environmentStore = useEnvironmentStore()
const collectionStore = useCollectionStore()
const historyStore = useHistoryStore()

// Computed properties with resolved environment variables
const resolvedUrl = computed(() => {
  const processedUrl = requestService.processEnvironmentVariables(url.value)

  // Add query params if present
  if (queryParams.value.length > 0) {
    const urlObj = new URL(processedUrl.startsWith('http') ? processedUrl : `http://example.com${processedUrl.startsWith('/') ? '' : '/'}${processedUrl}`)
    queryParams.value.forEach((param) => {
      if (param.key) {
        urlObj.searchParams.append(
          requestService.processEnvironmentVariables(param.key),
          requestService.processEnvironmentVariables(param.value),
        )
      }
    })
    return urlObj.href.replace('http://example.com', '')
  }

  return processedUrl
})

const resolvedBody = computed(() => {
  return requestService.processEnvironmentVariables(body.value)
})

// Helper methods
function addHeader() {
  headers.value.push({ key: '', value: '' })
}

function removeHeader(index: number) {
  headers.value.splice(index, 1)
}

function addQueryParam() {
  queryParams.value.push({ key: '', value: '' })
}

function removeQueryParam(index: number) {
  queryParams.value.splice(index, 1)
}

function applyBasicAuth() {
  const username = requestService.processEnvironmentVariables(auth.value.username)
  const password = requestService.processEnvironmentVariables(auth.value.password)
  const token = btoa(`${username}:${password}`)

  // Remove existing Authorization header if any
  const authHeaderIndex = headers.value.findIndex(h => h.key.toLowerCase() === 'authorization')
  if (authHeaderIndex !== -1) {
    headers.value.splice(authHeaderIndex, 1)
  }

  // Add new Basic Auth header
  headers.value.push({ key: 'Authorization', value: `Basic ${token}` })
}

function applyBearerAuth() {
  const token = requestService.processEnvironmentVariables(auth.value.token)

  // Remove existing Authorization header if any
  const authHeaderIndex = headers.value.findIndex(h => h.key.toLowerCase() === 'authorization')
  if (authHeaderIndex !== -1) {
    headers.value.splice(authHeaderIndex, 1)
  }

  // Add new Bearer token header
  headers.value.push({ key: 'Authorization', value: `Bearer ${token}` })
}

function applyApiKeyAuth() {
  const keyName = auth.value.apiKeyName
  const keyValue = requestService.processEnvironmentVariables(auth.value.apiKeyValue)

  if (auth.value.apiKeyLocation === 'header') {
    // Remove existing header with same name if any
    const headerIndex = headers.value.findIndex(h => h.key.toLowerCase() === keyName.toLowerCase())
    if (headerIndex !== -1) {
      headers.value.splice(headerIndex, 1)
    }

    // Add new API key header
    headers.value.push({ key: keyName, value: keyValue })
  }
  else {
    // Remove existing query param with same name if any
    const paramIndex = queryParams.value.findIndex(p => p.key.toLowerCase() === keyName.toLowerCase())
    if (paramIndex !== -1) {
      queryParams.value.splice(paramIndex, 1)
    }

    // Add new API key query param
    queryParams.value.push({ key: keyName, value: keyValue })
  }
}

function loadRequestFromCollection(request: RequestItem) {
  method.value = request.method
  url.value = request.url
  headers.value = [...request.headers]

  if (request.body) {
    body.value = request.body
  }

  // Reset other fields
  queryParams.value = []
  authType.value = 'none'

  // Switch to headers tab
  activeRequestTab.value = 'headers'
}

function loadRequestFromHistory(data: { method: string, url: string, headers: any[], body?: string }) {
  method.value = data.method
  url.value = data.url
  headers.value = [...data.headers]

  if (data.body) {
    body.value = data.body
  }

  // Reset other fields
  queryParams.value = []
  authType.value = 'none'

  // Switch to headers tab
  activeRequestTab.value = 'headers'
}

function onRequestSaved(data: { request: RequestItem, collectionId: string }) {
  // Handle after request is saved to collection
  console.log(`Request "${data.request.name}" saved to collection`)
}

async function sendRequest() {
  isLoading.value = true
  response.value = null
  responseBody.value = ''
  responseHeaders.value = {}

  const startTime = Date.now()

  try {
    // Convert headers array to object
    const headerObj: Record<string, string> = {}
    headers.value.forEach((h) => {
      if (h.key.trim()) {
        headerObj[h.key] = h.value
      }
    })

    // Send request
    response.value = await requestService.sendRequest(url.value, {
      method: method.value as any,
      headers: headerObj,
      body: ['POST', 'PUT', 'PATCH'].includes(method.value) ? body.value : undefined,
    })

    // Process response
    responseTime.value = Date.now() - startTime

    // Process headers
    response.value.headers.forEach((value, key) => {
      responseHeaders.value[key] = value
    })

    // Process body
    try {
      const text = await response.value.text()
      try {
        // Try to parse as JSON
        const json = JSON.parse(text)
        responseBody.value = JSON.stringify(json, null, 2)
      }
      catch {
        // If not JSON, use as text
        responseBody.value = text
      }
    }
    catch {
      responseBody.value = 'Error reading response body'
    }

    // Auto-switch to response body tab
    activeResponseTab.value = 'body'

    // Add to history
    historyStore.addToHistory({
      method: method.value,
      url: resolvedUrl.value,
      headers: [...headers.value],
      body: ['POST', 'PUT', 'PATCH'].includes(method.value) ? body.value : undefined,
      status: response.value.status,
      statusText: response.value.statusText,
      responseTime: responseTime.value,
      responseBody: responseBody.value,
      responseHeaders: { ...responseHeaders.value },
    })
  }
  catch (error: any) {
    console.error('Request error:', error)
    responseBody.value = `Error: ${error.message || 'Unknown error'}`

    // Add failed request to history
    historyStore.addToHistory({
      method: method.value,
      url: resolvedUrl.value,
      headers: [...headers.value],
      body: ['POST', 'PUT', 'PATCH'].includes(method.value) ? body.value : undefined,
      status: 0,
      statusText: 'Failed',
      responseTime: Date.now() - startTime,
      responseBody: `Error: ${error.message || 'Unknown error'}`,
    })
  }
  finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await environmentStore.fetchEnvironments()
  await collectionStore.fetchCollections()
})
</script>

<template>
  <div class="requests-view grid grid-cols-5 gap-6">
    <!-- Collections Sidebar -->
    <div class="col-span-1 bg-white rounded-lg shadow p-4">
      <div class="h-full flex flex-col">
        <div class="mb-6">
          <CollectionSidebar @select-request="loadRequestFromCollection" />
        </div>
        <div class="flex-1 mt-4 border-t pt-4">
          <RequestHistory @use-request="loadRequestFromHistory" />
        </div>
      </div>
    </div>

    <!-- Request & Response View -->
    <div class="col-span-4">
      <div class="mb-6 bg-white rounded-lg shadow overflow-hidden">
        <div class="p-5">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">
              API Request
            </h2>
            <div class="flex gap-2">
              <button
                class="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50"
                @click="showCodeModal = true"
              >
                <span class="i-carbon-code mr-1" />
                Code
              </button>
              <button
                class="px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded text-sm hover:bg-indigo-50"
                @click="showSaveModal = true"
              >
                Save
              </button>
              <button
                class="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                :disabled="isLoading"
                @click="sendRequest"
              >
                <span v-if="isLoading">Sending...</span>
                <span v-else>Send</span>
              </button>
            </div>
          </div>

          <!-- Request URL Bar -->
          <div class="flex items-center space-x-2 mb-4">
            <select
              v-model="method"
              class="w-28 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
              <option>HEAD</option>
              <option>OPTIONS</option>
            </select>
            <input
              v-model="url"
              type="text"
              class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
              placeholder="{{API_URL}}/users"
            >
          </div>

          <!-- Resolved URL Preview -->
          <div v-if="resolvedUrl !== url" class="text-sm text-gray-500 -mt-2 mb-4 ml-30">
            <span class="font-medium">Resolved:</span> {{ resolvedUrl }}
          </div>

          <!-- Request Tabs -->
          <div>
            <nav class="flex space-x-4 border-b border-gray-200 mb-4">
              <button
                v-for="tab in requestTabs"
                :key="tab.id"
                class="px-3 py-2 text-sm font-medium -mb-px"
                :class="activeRequestTab === tab.id
                  ? 'border-b-2 border-indigo-500 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'"
                @click="activeRequestTab = tab.id"
              >
                {{ tab.name }}
              </button>
            </nav>

            <!-- Headers Tab -->
            <div v-if="activeRequestTab === 'headers'" class="request-tab-panel">
              <div class="flex justify-between items-center mb-2">
                <h3 class="text-sm font-medium text-gray-700">
                  Headers
                </h3>
                <button
                  class="text-xs text-indigo-600 hover:text-indigo-800"
                  @click="addHeader"
                >
                  + Add Header
                </button>
              </div>

              <div class="border border-gray-200 rounded-md overflow-hidden">
                <div class="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 uppercase grid grid-cols-12 gap-2">
                  <div class="col-span-3">
                    Key
                  </div>
                  <div class="col-span-8">
                    Value
                  </div>
                  <div class="col-span-1" />
                </div>

                <div v-if="headers.length === 0" class="p-4 text-center text-sm text-gray-500">
                  No headers added yet
                </div>

                <div v-else>
                  <div
                    v-for="(header, index) in headers"
                    :key="index"
                    class="border-t border-gray-200 px-4 py-2 grid grid-cols-12 gap-2 items-center"
                  >
                    <input
                      v-model="header.key"
                      type="text"
                      class="col-span-3 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
                      placeholder="Content-Type"
                    >
                    <input
                      v-model="header.value"
                      type="text"
                      class="col-span-8 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
                      placeholder="application/json"
                    >
                    <button
                      class="col-span-1 text-gray-400 hover:text-red-600"
                      @click="removeHeader(index)"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Body Tab -->
            <div v-if="activeRequestTab === 'body'" class="request-tab-panel">
              <div class="mb-2 flex justify-between items-center">
                <h3 class="text-sm font-medium text-gray-700">
                  Request Body
                </h3>
                <select
                  v-model="bodyType"
                  class="text-xs rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  :disabled="!['POST', 'PUT', 'PATCH'].includes(method)"
                >
                  <option value="json">
                    JSON
                  </option>
                  <option value="form">
                    Form Data
                  </option>
                  <option value="text">
                    Plain Text
                  </option>
                </select>
              </div>

              <div v-if="!['POST', 'PUT', 'PATCH'].includes(method)" class="p-4 text-center text-sm text-gray-500 bg-gray-50 rounded-md">
                This request method doesn't typically include a body
              </div>

              <textarea
                v-else
                v-model="body"
                rows="10"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
                placeholder='{ "name": "John", "email": "test@example.com" }'
              />

              <div v-if="['POST', 'PUT', 'PATCH'].includes(method) && resolvedBody !== body" class="mt-2 text-sm text-gray-500">
                <span class="font-medium">Resolved Body:</span>
                <pre class="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">{{ resolvedBody }}</pre>
              </div>
            </div>

            <!-- Auth Tab -->
            <div v-if="activeRequestTab === 'auth'" class="request-tab-panel">
              <div class="mb-2">
                <h3 class="text-sm font-medium text-gray-700">
                  Authentication
                </h3>
              </div>

              <div class="mb-3">
                <select
                  v-model="authType"
                  class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="none">
                    No Auth
                  </option>
                  <option value="basic">
                    Basic Auth
                  </option>
                  <option value="bearer">
                    Bearer Token
                  </option>
                  <option value="apikey">
                    API Key
                  </option>
                </select>
              </div>

              <div v-if="authType === 'basic'" class="space-y-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    v-model="auth.username"
                    type="text"
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Username or {{USERNAME}}"
                  >
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    v-model="auth.password"
                    type="text"
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Password or {{PASSWORD}}"
                  >
                </div>
                <button
                  class="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                  @click="applyBasicAuth"
                >
                  Update Auth Header
                </button>
              </div>

              <div v-if="authType === 'bearer'" class="space-y-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Token</label>
                  <input
                    v-model="auth.token"
                    type="text"
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Token or {{API_TOKEN}}"
                  >
                </div>
                <button
                  class="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                  @click="applyBearerAuth"
                >
                  Update Auth Header
                </button>
              </div>

              <div v-if="authType === 'apikey'" class="space-y-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Key</label>
                  <input
                    v-model="auth.apiKeyName"
                    type="text"
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="X-API-Key"
                  >
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Value</label>
                  <input
                    v-model="auth.apiKeyValue"
                    type="text"
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="API key or {{API_KEY}}"
                  >
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Add to</label>
                  <select
                    v-model="auth.apiKeyLocation"
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="header">
                      Header
                    </option>
                    <option value="query">
                      Query Parameter
                    </option>
                  </select>
                </div>
                <button
                  class="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                  @click="applyApiKeyAuth"
                >
                  Add API Key
                </button>
              </div>
            </div>

            <!-- Params Tab -->
            <div v-if="activeRequestTab === 'params'" class="request-tab-panel">
              <div class="flex justify-between items-center mb-2">
                <h3 class="text-sm font-medium text-gray-700">
                  Query Parameters
                </h3>
                <button
                  class="text-xs text-indigo-600 hover:text-indigo-800"
                  @click="addQueryParam"
                >
                  + Add Parameter
                </button>
              </div>

              <div class="border border-gray-200 rounded-md overflow-hidden">
                <div class="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 uppercase grid grid-cols-12 gap-2">
                  <div class="col-span-3">
                    Key
                  </div>
                  <div class="col-span-8">
                    Value
                  </div>
                  <div class="col-span-1" />
                </div>

                <div v-if="queryParams.length === 0" class="p-4 text-center text-sm text-gray-500">
                  No query parameters added yet
                </div>

                <div v-else>
                  <div
                    v-for="(param, index) in queryParams"
                    :key="index"
                    class="border-t border-gray-200 px-4 py-2 grid grid-cols-12 gap-2 items-center"
                  >
                    <input
                      v-model="param.key"
                      type="text"
                      class="col-span-3 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
                      placeholder="page"
                    >
                    <input
                      v-model="param.value"
                      type="text"
                      class="col-span-8 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
                      placeholder="1"
                    >
                    <button
                      class="col-span-1 text-gray-400 hover:text-red-600"
                      @click="removeQueryParam(index)"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Response Section -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-5">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">
              Response
            </h2>
            <div v-if="response" class="flex items-center">
              <span
                class="px-2 py-1 text-xs rounded mr-2"
                :class="{
                  'bg-green-100 text-green-800': response.status >= 200 && response.status < 300,
                  'bg-yellow-100 text-yellow-800': response.status >= 300 && response.status < 400,
                  'bg-red-100 text-red-800': response.status >= 400,
                }"
              >
                {{ response.status }} {{ response.statusText }}
              </span>
              <span class="text-sm text-gray-500">{{ responseTime }}ms</span>
            </div>
          </div>

          <div v-if="isLoading" class="h-60 flex items-center justify-center bg-gray-50 rounded border border-gray-200">
            <div class="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
          </div>

          <div v-else-if="!response" class="h-60 flex items-center justify-center bg-gray-50 rounded border border-gray-200 text-gray-500">
            Send a request to see the response
          </div>

          <div v-else>
            <!-- Response Tabs -->
            <nav class="flex space-x-4 border-b border-gray-200 mb-4">
              <button
                v-for="tab in responseTabs"
                :key="tab.id"
                class="px-3 py-2 text-sm font-medium -mb-px"
                :class="activeResponseTab === tab.id
                  ? 'border-b-2 border-indigo-500 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'"
                @click="activeResponseTab = tab.id"
              >
                {{ tab.name }}
              </button>
            </nav>

            <!-- Body Tab -->
            <div v-if="activeResponseTab === 'body'" class="response-tab-panel">
              <pre
                class="p-4 bg-gray-50 rounded-md border border-gray-200 overflow-x-auto text-sm font-mono max-h-96 overflow-y-auto"
              >{{ responseBody }}</pre>
            </div>

            <!-- Headers Tab -->
            <div v-if="activeResponseTab === 'headers'" class="response-tab-panel">
              <div class="border border-gray-200 rounded-md overflow-hidden">
                <div class="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 uppercase grid grid-cols-2 gap-2">
                  <div>Header</div>
                  <div>Value</div>
                </div>

                <div v-if="Object.keys(responseHeaders).length === 0" class="p-4 text-center text-sm text-gray-500">
                  No headers received
                </div>

                <div v-else class="max-h-96 overflow-y-auto">
                  <div
                    v-for="(value, key) in responseHeaders"
                    :key="key"
                    class="border-t border-gray-200 px-4 py-2 grid grid-cols-2 gap-2"
                  >
                    <div class="text-sm font-medium text-gray-700">
                      {{ key }}
                    </div>
                    <div class="text-sm text-gray-500 font-mono break-all">
                      {{ value }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Save Request Modal -->
  <SaveRequestModal
    :show="showSaveModal"
    :method="method"
    :url="url"
    :headers="headers"
    :body="body"
    @close="showSaveModal = false"
    @saved="onRequestSaved"
  />

  <!-- Code Generator Modal -->
  <CodeGenerator
    :show="showCodeModal"
    :method="method"
    :url="resolvedUrl"
    :headers="headers"
    :body="['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined"
    @close="showCodeModal = false"
  />
</template>

<style scoped>
.request-tab-panel, .response-tab-panel {
  min-height: 200px;
}
</style>
