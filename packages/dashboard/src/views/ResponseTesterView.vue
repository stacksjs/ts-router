<script setup lang="ts">
import { computed, ref } from 'vue'

// Request configuration
const url = ref('https://api.example.com/users')
const method = ref('GET')
const headers = ref('Content-Type: application/json\nAccept: application/json')
const requestBody = ref('{\n  "name": "John Doe",\n  "email": "john@example.com"\n}')
const isLoading = ref(false)
const showRequestParams = ref(false)
const queryParams = ref('page=1&limit=10')

// Response data
const response = ref<{
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  time: number
  size: string
} | null>(null)

// Available HTTP methods
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

// Headers parsing
// eslint-disable-next-line unused-imports/no-unused-vars
const parsedHeaders = computed(() => {
  const result: Record<string, string> = {}
  if (!headers.value)
    return result

  headers.value.split('\n').forEach((line) => {
    const colonPos = line.indexOf(':')
    if (colonPos > 0) {
      const name = line.slice(0, colonPos).trim()
      const value = line.slice(colonPos + 1).trim()
      result[name] = value
    }
  })

  return result
})

// Parse query params
const parsedQueryParams = computed(() => {
  const result: Record<string, string> = {}
  if (!queryParams.value)
    return result

  queryParams.value.split('&').forEach((pair) => {
    const equalsPos = pair.indexOf('=')
    if (equalsPos > 0) {
      const name = pair.slice(0, equalsPos).trim()
      const value = pair.slice(equalsPos + 1).trim()
      result[name] = value
    }
  })

  return result
})

// Build the URL with query params
const fullUrl = computed(() => {
  if (!url.value)
    return ''

  try {
    const urlObj = new URL(url.value)

    // Add query params
    Object.entries(parsedQueryParams.value).forEach(([key, value]) => {
      urlObj.searchParams.set(key, value)
    })

    return urlObj.toString()
  }
  catch {
    // If URL is invalid, just return it as is
    return url.value
  }
})

async function sendRequest() {
  isLoading.value = true
  response.value = null

  try {
    // In a real app, we would make an actual HTTP request here
    // For this demo, we'll simulate a response instead
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Generate a simulated response
    const startTime = performance.now()

    // Different responses based on method
    let status = 200
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=3600, public',
      'Server': 'nginx/1.18.0',
      'Access-Control-Allow-Origin': '*',
    }

    let responseBody = ''

    if (method.value === 'GET') {
      responseBody = JSON.stringify({
        data: [
          { id: 1, name: 'John Doe', email: 'john@example.com' },
          { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
        ],
        meta: {
          total: 2,
          page: 1,
          limit: 10,
        },
      }, null, 2)
    }
    else if (method.value === 'POST') {
      status = 201
      responseBody = JSON.stringify({
        message: 'Resource created successfully',
        data: {
          id: 3,
          ...JSON.parse(requestBody.value),
        },
      }, null, 2)
    }
    else if (method.value === 'PUT' || method.value === 'PATCH') {
      responseBody = JSON.stringify({
        message: 'Resource updated successfully',
        data: {
          id: 1,
          ...JSON.parse(requestBody.value),
        },
      }, null, 2)
    }
    else if (method.value === 'DELETE') {
      status = 204
      responseBody = ''
    }
    else if (method.value === 'HEAD') {
      responseBody = ''
    }
    else if (method.value === 'OPTIONS') {
      responseHeaders.Allow = 'GET, POST, PUT, PATCH, DELETE'
      responseBody = ''
    }

    const endTime = performance.now()

    response.value = {
      status,
      statusText: getStatusText(status),
      headers: responseHeaders,
      body: responseBody,
      time: Math.round(endTime - startTime),
      size: formatBytes(responseBody.length),
    }
  }
  catch (error) {
    console.error('Error sending request:', error)
    response.value = {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to send request' }, null, 2),
      time: 0,
      size: '0 B',
    }
  }
  finally {
    isLoading.value = false
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
  }

  return statusTexts[status] || 'Unknown'
}

function getStatusClass(status: number): string {
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

function clearForm() {
  url.value = 'https://api.example.com/users'
  method.value = 'GET'
  headers.value = 'Content-Type: application/json\nAccept: application/json'
  requestBody.value = '{\n  "name": "John Doe",\n  "email": "john@example.com"\n}'
  queryParams.value = 'page=1&limit=10'
  response.value = null
}

function toggleRequestParams() {
  showRequestParams.value = !showRequestParams.value
}

function shouldShowRequestBody(method: string): boolean {
  return ['POST', 'PUT', 'PATCH'].includes(method)
}
</script>

<template>
  <div class="response-tester-view">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">
        HTTP Response Tester
      </h1>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Request Panel -->
      <div class="bg-white rounded-lg shadow p-4">
        <h2 class="text-lg font-medium mb-4">
          Request
        </h2>

        <div class="space-y-4">
          <div class="flex flex-col md:flex-row md:space-x-4">
            <div class="w-full md:w-1/4 mb-4 md:mb-0">
              <label for="method" class="block text-sm font-medium text-gray-700 mb-1">Method</label>
              <select
                id="method"
                v-model="method"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option v-for="m in methods" :key="m" :value="m">
                  {{ m }}
                </option>
              </select>
            </div>

            <div class="w-full md:w-3/4">
              <label for="url" class="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                id="url"
                v-model="url"
                type="text"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="https://api.example.com/endpoint"
              >
            </div>
          </div>

          <div>
            <button
              class="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
              @click="toggleRequestParams"
            >
              <span :class="showRequestParams ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right'" class="mr-1" />
              {{ showRequestParams ? 'Hide' : 'Show' }} Query Parameters
            </button>

            <div v-if="showRequestParams" class="mt-2">
              <label for="query-params" class="block text-sm font-medium text-gray-700 mb-1">Query Parameters</label>
              <input
                id="query-params"
                v-model="queryParams"
                type="text"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="param1=value1&param2=value2"
              >
              <p class="mt-1 text-xs text-gray-500">
                Full URL: {{ fullUrl }}
              </p>
            </div>
          </div>

          <div>
            <label for="headers" class="block text-sm font-medium text-gray-700 mb-1">Headers</label>
            <textarea
              id="headers"
              v-model="headers"
              rows="4"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
              placeholder="Content-Type: application/json"
            />
          </div>

          <div v-if="shouldShowRequestBody(method)">
            <label for="request-body" class="block text-sm font-medium text-gray-700 mb-1">Request Body</label>
            <textarea
              id="request-body"
              v-model="requestBody"
              rows="6"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
              :placeholder="`{\n  &quot;key&quot;: &quot;value&quot;\n}`"
            />
          </div>

          <div class="flex justify-end space-x-3">
            <button
              class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
              @click="clearForm"
            >
              Reset
            </button>

            <button
              :disabled="isLoading || !url"
              class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 flex items-center"
              @click="sendRequest"
            >
              <span v-if="isLoading" class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mr-2" />
              <span v-else class="i-carbon-send mr-2" />
              {{ isLoading ? 'Sending...' : 'Send Request' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Response Panel -->
      <div class="bg-white rounded-lg shadow p-4">
        <h2 class="text-lg font-medium mb-4">
          Response
        </h2>

        <div v-if="isLoading" class="p-8 text-center">
          <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent" />
          <p class="mt-2 text-gray-600">
            Waiting for response...
          </p>
        </div>

        <div v-else-if="!response" class="p-8 text-center">
          <div class="flex justify-center mb-4">
            <span class="i-carbon-code text-6xl text-gray-300" />
          </div>
          <p class="text-gray-600 mb-2">
            No response yet.
          </p>
          <p class="text-gray-500 text-sm">
            Configure your request and click "Send Request" to see the response here.
          </p>
        </div>

        <div v-else class="space-y-4">
          <!-- Response Status -->
          <div class="bg-gray-50 p-3 rounded-md flex items-center justify-between">
            <div>
              <span :class="`text-lg font-bold ${getStatusClass(response.status)}`">{{ response.status }}</span>
              <span class="text-lg ml-2">{{ response.statusText }}</span>
            </div>
            <div class="text-sm text-gray-500">
              {{ response.time }}ms · {{ response.size }}
            </div>
          </div>

          <!-- Response Headers -->
          <div>
            <h3 class="text-md font-medium mb-2">
              Headers
            </h3>
            <div class="bg-gray-50 p-3 rounded-md">
              <table class="min-w-full text-sm">
                <tbody>
                  <tr v-for="(value, name) in response.headers" :key="name" class="border-b border-gray-200 last:border-b-0">
                    <td class="py-2 pr-4 font-medium text-gray-900">
                      {{ name }}
                    </td>
                    <td class="py-2 text-gray-600 break-all">
                      {{ value }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Response Body -->
          <div v-if="response.body">
            <h3 class="text-md font-medium mb-2">
              Body
            </h3>
            <pre class="bg-gray-50 p-3 rounded-md overflow-x-auto text-sm font-mono">{{ response.body }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Documentation -->
    <div class="mt-6 bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-medium mb-4">
        Quick Reference
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <h3 class="text-md font-medium mb-2">
            Common HTTP Methods
          </h3>
          <ul class="text-sm text-gray-600 space-y-2">
            <li><span class="font-medium">GET:</span> Retrieve data</li>
            <li><span class="font-medium">POST:</span> Create a new resource</li>
            <li><span class="font-medium">PUT:</span> Update a resource (complete replacement)</li>
            <li><span class="font-medium">PATCH:</span> Update a resource (partial update)</li>
            <li><span class="font-medium">DELETE:</span> Remove a resource</li>
            <li><span class="font-medium">HEAD:</span> Like GET but without response body</li>
            <li><span class="font-medium">OPTIONS:</span> Describes communication options</li>
          </ul>
        </div>

        <div>
          <h3 class="text-md font-medium mb-2">
            Common Status Codes
          </h3>
          <ul class="text-sm text-gray-600 space-y-2">
            <li><span class="font-medium text-green-600">200:</span> OK</li>
            <li><span class="font-medium text-green-600">201:</span> Created</li>
            <li><span class="font-medium text-green-600">204:</span> No Content</li>
            <li><span class="font-medium text-blue-600">301/302:</span> Redirects</li>
            <li><span class="font-medium text-orange-600">400:</span> Bad Request</li>
            <li><span class="font-medium text-orange-600">401:</span> Unauthorized</li>
            <li><span class="font-medium text-orange-600">404:</span> Not Found</li>
            <li><span class="font-medium text-red-600">500:</span> Internal Server Error</li>
          </ul>
        </div>

        <div>
          <h3 class="text-md font-medium mb-2">
            Common Headers
          </h3>
          <ul class="text-sm text-gray-600 space-y-2">
            <li><span class="font-medium">Content-Type:</span> application/json</li>
            <li><span class="font-medium">Authorization:</span> Bearer [token]</li>
            <li><span class="font-medium">Accept:</span> application/json</li>
            <li><span class="font-medium">Cache-Control:</span> no-cache</li>
            <li><span class="font-medium">User-Agent:</span> Browser/version</li>
            <li><span class="font-medium">Access-Control-Allow-Origin:</span> *</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
