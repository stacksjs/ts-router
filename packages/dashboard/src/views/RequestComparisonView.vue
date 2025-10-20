<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface HttpRequest {
  id: string
  method: string
  path: string
  status: number
  time: string
  size: string
  timestamp: string
  host: string
  protocol: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  requestBody?: string
  responseBody?: string
  queryParams?: Record<string, string>
  cookies?: Record<string, string>
}

const router = useRouter()
const route = useRoute()
const selectedRequests = ref<HttpRequest[]>([])
const allRequests = ref<HttpRequest[]>([])
const isLoading = ref(true)
const compareSection = ref<'headers' | 'requestBody' | 'responseBody' | 'overview'>('overview')
const diffMode = ref(true)

// Load all requests
onMounted(() => {
  setTimeout(() => {
    // Mock data for demonstration purposes
    allRequests.value = [
      {
        id: '1',
        method: 'GET',
        path: '/api/users',
        status: 200,
        time: '12ms',
        size: '14.2KB',
        timestamp: '2023-05-15T14:23:45',
        host: 'api.example.com',
        protocol: 'HTTP/1.1',
        requestHeaders: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Authorization': 'Bearer token123',
        },
        responseHeaders: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=3600',
        },
        responseBody: JSON.stringify({ users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }] }, null, 2),
      },
      {
        id: '2',
        method: 'POST',
        path: '/api/auth/login',
        status: 200,
        time: '245ms',
        size: '2.1KB',
        timestamp: '2023-05-15T14:22:30',
        host: 'api.example.com',
        protocol: 'HTTP/1.1',
        requestHeaders: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        responseHeaders: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session=abc123; Path=/; HttpOnly',
        },
        requestBody: JSON.stringify({ email: 'user@example.com', password: '********' }, null, 2),
        responseBody: JSON.stringify({ token: 'eyJhbGciOiJ9...' }, null, 2),
      },
      {
        id: '3',
        method: 'GET',
        path: '/api/products',
        status: 404,
        time: '34ms',
        size: '0.8KB',
        timestamp: '2023-05-15T14:20:12',
        host: 'api.example.com',
        protocol: 'HTTP/1.1',
        requestHeaders: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        responseHeaders: {
          'Content-Type': 'application/json',
        },
        responseBody: JSON.stringify({ error: 'Not found' }, null, 2),
      },
      {
        id: '4',
        method: 'PUT',
        path: '/api/users/5',
        status: 204,
        time: '89ms',
        size: '0.5KB',
        timestamp: '2023-05-15T14:18:45',
        host: 'api.example.com',
        protocol: 'HTTP/1.1',
        requestHeaders: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer token123',
          'User-Agent': 'Mozilla/5.0',
        },
        responseHeaders: {
          'Content-Length': '0',
        },
        requestBody: JSON.stringify({ name: 'Updated Name', email: 'updated@example.com' }, null, 2),
      },
    ]

    // Check if there are request IDs in the query parameters
    const requestId = route.query.id
    if (requestId) {
      if (Array.isArray(requestId)) {
        // Multiple IDs
        requestId.forEach((id) => {
          const request = allRequests.value.find(r => r.id === id)
          if (request) {
            addToComparison(request)
          }
        })
      }
      else {
        // Single ID
        const request = allRequests.value.find(r => r.id === requestId)
        if (request) {
          addToComparison(request)
        }
      }
    }

    isLoading.value = false
  }, 800)
})

function addToComparison(request: HttpRequest) {
  if (!selectedRequests.value.some(r => r.id === request.id)) {
    selectedRequests.value.push(request)
  }
}

function removeFromComparison(requestId: string) {
  selectedRequests.value = selectedRequests.value.filter(r => r.id !== requestId)
}

function clearComparison() {
  selectedRequests.value = []
}

function formatJson(json: string | undefined) {
  if (!json)
    return ''
  try {
    const obj = JSON.parse(json)
    return JSON.stringify(obj, null, 2)
  }
  catch {
    return json
  }
}

// Helper function to determine if property is different across requests
function hasDifferences(property: string) {
  if (selectedRequests.value.length < 2)
    return false

  const firstValue = (selectedRequests.value[0] as any)[property]
  return selectedRequests.value.some((request) => {
    const value = (request as any)[property]

    if (typeof firstValue === 'object' && typeof value === 'object') {
      return JSON.stringify(firstValue) !== JSON.stringify(value)
    }

    return firstValue !== value
  })
}

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

function getMethodClass(method: string) {
  switch (method) {
    case 'GET': return 'bg-blue-100 text-blue-800'
    case 'POST': return 'bg-green-100 text-green-800'
    case 'PUT': return 'bg-yellow-100 text-yellow-800'
    case 'PATCH': return 'bg-indigo-100 text-indigo-800'
    case 'DELETE': return 'bg-red-100 text-red-800'
    case 'OPTIONS': return 'bg-purple-100 text-purple-800'
    case 'HEAD': return 'bg-gray-100 text-gray-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

// Get header differences
function getHeaderDiffs(requestIndex: number, headerType: 'requestHeaders' | 'responseHeaders') {
  if (!diffMode.value || selectedRequests.value.length < 2) {
    return selectedRequests.value[requestIndex][headerType] || {}
  }

  const result: Record<string, { value: string, status: 'same' | 'different' | 'missing' }> = {}
  const allHeaders = new Set<string>()

  // Collect all header keys
  selectedRequests.value.forEach((req) => {
    const headers = req[headerType] || {}
    Object.keys(headers).forEach(key => allHeaders.add(key))
  })

  // Check each header
  allHeaders.forEach((header) => {
    const currentValue = selectedRequests.value[requestIndex][headerType]?.[header]

    if (currentValue === undefined) {
      result[header] = { value: '(missing)', status: 'missing' }
      return
    }

    // Check if any other request has a different value for this header
    const isDifferent = selectedRequests.value.some((req, idx) => {
      if (idx === requestIndex)
        return false
      return req[headerType]?.[header] !== currentValue
    })

    result[header] = {
      value: currentValue,
      status: isDifferent ? 'different' : 'same',
    }
  })

  return result
}

// Navigate back to requests
function goBack() {
  router.push('/requests')
}
</script>

<template>
  <div class="request-comparison-view">
    <div class="flex items-center mb-6">
      <button class="mr-4 text-gray-600 hover:text-gray-900" @click="goBack">
        <span class="i-carbon-arrow-left text-xl" />
      </button>
      <h1 class="text-2xl font-bold">
        Request Comparison
      </h1>
    </div>

    <div v-if="isLoading" class="p-8 text-center bg-white rounded-lg shadow">
      <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent" />
      <p class="mt-2 text-gray-600">
        Loading requests...
      </p>
    </div>

    <template v-else>
      <!-- Selection Area -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-medium mb-4">
          Select Requests to Compare
        </h2>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Method
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Path
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="request in allRequests" :key="request.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <button
                    v-if="!selectedRequests.some(r => r.id === request.id)"
                    class="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
                    @click="addToComparison(request)"
                  >
                    Add
                  </button>
                  <button
                    v-else
                    class="px-3 py-1 bg-gray-200 text-gray-800 text-sm rounded hover:bg-gray-300"
                    @click="removeFromComparison(request.id)"
                  >
                    Remove
                  </button>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${getMethodClass(request.method)}`">
                    {{ request.method }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ request.path }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <span :class="`font-medium ${getStatusClass(request.status)}`">
                    {{ request.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ request.time }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ new Date(request.timestamp).toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Comparison Area (if requests selected) -->
      <div v-if="selectedRequests.length > 0" class="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div class="border-b border-gray-200 bg-gray-50 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 class="text-lg font-medium">
              Comparing {{ selectedRequests.length }} Requests
            </h2>
            <p class="text-sm text-gray-600">
              Select which section to compare
            </p>
          </div>
          <div class="flex items-center space-x-4">
            <div class="flex items-center">
              <input
                id="diff-mode"
                v-model="diffMode"
                type="checkbox"
                class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              >
              <label for="diff-mode" class="ml-2 text-sm text-gray-700">Highlight Differences</label>
            </div>
            <button
              class="px-3 py-1 bg-gray-100 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-200"
              @click="clearComparison"
            >
              Clear
            </button>
          </div>
        </div>

        <!-- Comparison Sections -->
        <div class="p-4 bg-gray-100">
          <div class="flex space-x-2 mb-4">
            <button
              class="px-4 py-2 rounded-md text-sm font-medium" :class="[
                compareSection === 'overview'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
              ]"
              @click="compareSection = 'overview'"
            >
              Overview
            </button>
            <button
              class="px-4 py-2 rounded-md text-sm font-medium" :class="[
                compareSection === 'headers'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
              ]"
              @click="compareSection = 'headers'"
            >
              Headers
            </button>
            <button
              class="px-4 py-2 rounded-md text-sm font-medium" :class="[
                compareSection === 'requestBody'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
              ]"
              @click="compareSection = 'requestBody'"
            >
              Request Body
            </button>
            <button
              class="px-4 py-2 rounded-md text-sm font-medium" :class="[
                compareSection === 'responseBody'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
              ]"
              @click="compareSection = 'responseBody'"
            >
              Response Body
            </button>
          </div>

          <!-- Overview Comparison -->
          <div v-if="compareSection === 'overview'" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 bg-white">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th v-for="(request, index) in selectedRequests" :key="`header-${request.id}`" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request #{{ index + 1 }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <!-- Method row -->
                <tr :class="{ 'bg-yellow-50': diffMode && hasDifferences('method') }">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    Method
                  </td>
                  <td v-for="request in selectedRequests" :key="`method-${request.id}`" class="px-4 py-3 text-sm">
                    <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${getMethodClass(request.method)}`">
                      {{ request.method }}
                    </span>
                  </td>
                </tr>

                <!-- Path row -->
                <tr :class="{ 'bg-yellow-50': diffMode && hasDifferences('path') }">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    Path
                  </td>
                  <td v-for="request in selectedRequests" :key="`path-${request.id}`" class="px-4 py-3 text-sm">
                    {{ request.path }}
                  </td>
                </tr>

                <!-- Status row -->
                <tr :class="{ 'bg-yellow-50': diffMode && hasDifferences('status') }">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    Status
                  </td>
                  <td v-for="request in selectedRequests" :key="`status-${request.id}`" class="px-4 py-3 text-sm">
                    <span :class="`font-medium ${getStatusClass(request.status)}`">
                      {{ request.status }}
                    </span>
                  </td>
                </tr>

                <!-- Host row -->
                <tr :class="{ 'bg-yellow-50': diffMode && hasDifferences('host') }">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    Host
                  </td>
                  <td v-for="request in selectedRequests" :key="`host-${request.id}`" class="px-4 py-3 text-sm">
                    {{ request.host }}
                  </td>
                </tr>

                <!-- Protocol row -->
                <tr :class="{ 'bg-yellow-50': diffMode && hasDifferences('protocol') }">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    Protocol
                  </td>
                  <td v-for="request in selectedRequests" :key="`protocol-${request.id}`" class="px-4 py-3 text-sm">
                    {{ request.protocol }}
                  </td>
                </tr>

                <!-- Time row -->
                <tr :class="{ 'bg-yellow-50': diffMode && hasDifferences('time') }">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    Time
                  </td>
                  <td v-for="request in selectedRequests" :key="`time-${request.id}`" class="px-4 py-3 text-sm">
                    {{ request.time }}
                  </td>
                </tr>

                <!-- Size row -->
                <tr :class="{ 'bg-yellow-50': diffMode && hasDifferences('size') }">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">
                    Size
                  </td>
                  <td v-for="request in selectedRequests" :key="`size-${request.id}`" class="px-4 py-3 text-sm">
                    {{ request.size }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Headers Comparison -->
          <div v-if="compareSection === 'headers'" class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Request Headers -->
            <div class="bg-white rounded-lg shadow">
              <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 class="text-sm font-medium text-gray-700">
                  Request Headers
                </h3>
              </div>
              <div class="p-4 space-y-6">
                <div v-for="(request, index) in selectedRequests" :key="`req-headers-${request.id}`">
                  <h4 class="text-sm font-medium text-gray-700 mb-2">
                    Request #{{ index + 1 }} - {{ request.method }} {{ request.path }}
                  </h4>
                  <div class="bg-gray-50 p-3 rounded">
                    <table class="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-200">
                        <template v-if="Object.keys(getHeaderDiffs(index, 'requestHeaders')).length > 0">
                          <tr
                            v-for="(header, name) in getHeaderDiffs(index, 'requestHeaders')" :key="`req-header-${name}-${index}`"
                            :class="{
                              'bg-red-50': diffMode && header.status === 'missing',
                              'bg-yellow-50': diffMode && header.status === 'different',
                            }"
                          >
                            <td class="px-3 py-2 text-sm font-medium text-gray-900">
                              {{ name }}
                            </td>
                            <td class="px-3 py-2 text-sm text-gray-500 break-all">
                              {{ header.value }}
                            </td>
                          </tr>
                        </template>
                        <tr v-else>
                          <td colspan="2" class="px-3 py-2 text-sm text-gray-500 text-center">
                            No request headers
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <!-- Response Headers -->
            <div class="bg-white rounded-lg shadow">
              <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 class="text-sm font-medium text-gray-700">
                  Response Headers
                </h3>
              </div>
              <div class="p-4 space-y-6">
                <div v-for="(request, index) in selectedRequests" :key="`resp-headers-${request.id}`">
                  <h4 class="text-sm font-medium text-gray-700 mb-2">
                    Request #{{ index + 1 }} - {{ request.method }} {{ request.path }}
                  </h4>
                  <div class="bg-gray-50 p-3 rounded">
                    <table class="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-200">
                        <template v-if="Object.keys(getHeaderDiffs(index, 'responseHeaders')).length > 0">
                          <tr
                            v-for="(header, name) in getHeaderDiffs(index, 'responseHeaders')" :key="`resp-header-${name}-${index}`"
                            :class="{
                              'bg-red-50': diffMode && header.status === 'missing',
                              'bg-yellow-50': diffMode && header.status === 'different',
                            }"
                          >
                            <td class="px-3 py-2 text-sm font-medium text-gray-900">
                              {{ name }}
                            </td>
                            <td class="px-3 py-2 text-sm text-gray-500 break-all">
                              {{ header.value }}
                            </td>
                          </tr>
                        </template>
                        <tr v-else>
                          <td colspan="2" class="px-3 py-2 text-sm text-gray-500 text-center">
                            No response headers
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Request Body Comparison -->
          <div v-if="compareSection === 'requestBody'" class="space-y-6">
            <div v-for="(request, index) in selectedRequests" :key="`req-body-${request.id}`" class="bg-white rounded-lg shadow">
              <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 class="text-sm font-medium text-gray-700">
                  Request #{{ index + 1 }} - {{ request.method }} {{ request.path }}
                </h3>
              </div>
              <div class="p-4">
                <pre v-if="request.requestBody" class="bg-gray-50 p-4 rounded-md overflow-x-auto text-sm font-mono">{{ formatJson(request.requestBody) }}</pre>
                <div v-else class="bg-gray-50 p-4 rounded-md text-center text-gray-500">
                  No request body
                </div>
              </div>
            </div>
          </div>

          <!-- Response Body Comparison -->
          <div v-if="compareSection === 'responseBody'" class="space-y-6">
            <div v-for="(request, index) in selectedRequests" :key="`resp-body-${request.id}`" class="bg-white rounded-lg shadow">
              <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 class="text-sm font-medium text-gray-700">
                  Request #{{ index + 1 }} - {{ request.method }} {{ request.path }}
                </h3>
              </div>
              <div class="p-4">
                <pre v-if="request.responseBody" class="bg-gray-50 p-4 rounded-md overflow-x-auto text-sm font-mono">{{ formatJson(request.responseBody) }}</pre>
                <div v-else class="bg-gray-50 p-4 rounded-md text-center text-gray-500">
                  No response body
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- No Selections Message -->
      <div v-else class="bg-white rounded-lg shadow p-8 text-center">
        <div class="flex justify-center mb-4">
          <span class="i-carbon-compare text-6xl text-gray-300" />
        </div>
        <p class="text-gray-600 mb-2">
          Select two or more requests to compare
        </p>
        <p class="text-gray-500 text-sm">
          You can compare headers, request bodies, response bodies, and other request properties.
        </p>
      </div>
    </template>
  </div>
</template>
