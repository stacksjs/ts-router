<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface HttpRequest {
  id: string
  method: string
  path: string
  status: number
  time: string
  size: string
  timestamp: string
  ip: string
  userAgent?: string
  protocol: string
  host: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  requestBody?: string
  responseBody?: string
  queryParams?: Record<string, string>
  cookies?: Record<string, string>
}

const route = useRoute()
const router = useRouter()
const requestId = route.params.id as string
const request = ref<HttpRequest | null>(null)
const isLoading = ref(true)
const activeTab = ref('request')
const isCodeView = ref(true)

// Mock data for demonstration purposes
onMounted(() => {
  setTimeout(() => {
    // Simulate API call to get request details
    request.value = {
      id: requestId,
      method: 'POST',
      path: '/api/auth/login',
      status: 200,
      time: '245ms',
      size: '2.1KB',
      timestamp: '2023-05-15T14:22:30',
      ip: '192.168.1.102',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
      protocol: 'HTTP/1.1',
      host: 'api.example.com',
      requestHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Content-Length': '58',
      },
      responseHeaders: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, private',
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '59',
        'Access-Control-Allow-Origin': '*',
        'Server': 'nginx/1.18.0',
        'Date': 'Mon, 15 May 2023 14:22:30 GMT',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Length': '352',
      },
      requestBody: JSON.stringify({
        email: 'user@example.com',
        password: '********',
      }, null, 2),
      responseBody: JSON.stringify({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        user: {
          id: 123,
          name: 'John Doe',
          email: 'user@example.com',
          role: 'user',
          created_at: '2023-01-15T08:12:45Z',
          updated_at: '2023-05-15T14:22:30Z',
        },
      }, null, 2),
      queryParams: {},
      cookies: {
        session_id: 'abc123def456',
        preferences: 'theme=dark',
        _ga: 'GA1.2.1234567890.1620123456',
      },
    }
    isLoading.value = false
  }, 800)
})

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

// Get header entries for display
const requestHeaderEntries = computed(() => {
  if (!request.value)
    return []
  return Object.entries(request.value.requestHeaders).map(([key, value]) => ({ key, value }))
})

const responseHeaderEntries = computed(() => {
  if (!request.value)
    return []
  return Object.entries(request.value.responseHeaders).map(([key, value]) => ({ key, value }))
})

// Get cookie entries for display
const cookieEntries = computed(() => {
  if (!request.value || !request.value.cookies)
    return []
  return Object.entries(request.value.cookies).map(([key, value]) => ({ key, value }))
})

// Format JSON for display
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

function goBack() {
  router.push('/requests')
}
</script>

<template>
  <div class="request-details-view">
    <div class="flex items-center mb-6">
      <button class="mr-4 text-gray-600 hover:text-gray-900" @click="goBack">
        <span class="i-carbon-arrow-left text-xl" />
      </button>
      <h1 class="text-2xl font-bold">
        Request Details
      </h1>
    </div>

    <div v-if="isLoading" class="p-8 text-center bg-white rounded-lg shadow">
      <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent" />
      <p class="mt-2 text-gray-600">
        Loading request details...
      </p>
    </div>

    <template v-else-if="request">
      <!-- Request Summary -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <div>
            <div class="text-sm font-medium text-gray-500 mb-1">
              Method
            </div>
            <div class="flex items-center">
              <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${getMethodClass(request.method)}`">
                {{ request.method }}
              </span>
            </div>
          </div>

          <div>
            <div class="text-sm font-medium text-gray-500 mb-1">
              Status
            </div>
            <div class="flex items-center">
              <span :class="`font-medium ${getStatusClass(request.status)}`">
                {{ request.status }}
              </span>
            </div>
          </div>

          <div>
            <div class="text-sm font-medium text-gray-500 mb-1">
              Time
            </div>
            <div>{{ request.time }}</div>
          </div>

          <div>
            <div class="text-sm font-medium text-gray-500 mb-1">
              Size
            </div>
            <div>{{ request.size }}</div>
          </div>

          <div class="md:col-span-2">
            <div class="text-sm font-medium text-gray-500 mb-1">
              URL
            </div>
            <div class="font-mono text-sm break-all">
              {{ request.host }}{{ request.path }}
            </div>
          </div>

          <div>
            <div class="text-sm font-medium text-gray-500 mb-1">
              IP Address
            </div>
            <div>{{ request.ip }}</div>
          </div>

          <div>
            <div class="text-sm font-medium text-gray-500 mb-1">
              Timestamp
            </div>
            <div>{{ new Date(request.timestamp).toLocaleString() }}</div>
          </div>

          <div class="md:col-span-2">
            <div class="text-sm font-medium text-gray-500 mb-1">
              User Agent
            </div>
            <div class="text-sm break-all">
              {{ request.userAgent }}
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="bg-white rounded-lg shadow mb-6 overflow-hidden">
        <div class="border-b border-gray-200">
          <nav class="flex -mb-px">
            <button
              class="px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap" :class="[
                activeTab === 'request'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ]"
              @click="activeTab = 'request'"
            >
              Request
            </button>
            <button
              class="px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap" :class="[
                activeTab === 'response'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ]"
              @click="activeTab = 'response'"
            >
              Response
            </button>
            <button
              class="px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap" :class="[
                activeTab === 'cookies'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ]"
              @click="activeTab = 'cookies'"
            >
              Cookies
            </button>
          </nav>
        </div>

        <!-- Request Tab -->
        <div v-if="activeTab === 'request'" class="p-6">
          <div class="mb-6">
            <h3 class="text-lg font-medium mb-4">
              Headers
            </h3>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(header, index) in requestHeaderEntries" :key="index" class="hover:bg-gray-50">
                    <td class="px-6 py-3 text-sm font-medium text-gray-900">
                      {{ header.key }}
                    </td>
                    <td class="px-6 py-3 text-sm text-gray-500 break-all">
                      {{ header.value }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="request.requestBody">
            <h3 class="text-lg font-medium mb-4">
              Body
            </h3>
            <div class="flex justify-between items-center mb-2">
              <div class="text-sm text-gray-500">
                {{ isCodeView ? 'Formatted JSON' : 'Raw' }}
              </div>
              <button
                class="text-sm text-indigo-600 hover:text-indigo-800"
                @click="isCodeView = !isCodeView"
              >
                {{ isCodeView ? 'View Raw' : 'View Formatted' }}
              </button>
            </div>
            <pre
              class="bg-gray-50 p-4 rounded-md overflow-x-auto text-sm font-mono"
            >{{ isCodeView ? formatJson(request.requestBody) : request.requestBody }}</pre>
          </div>
        </div>

        <!-- Response Tab -->
        <div v-if="activeTab === 'response'" class="p-6">
          <div class="mb-6">
            <h3 class="text-lg font-medium mb-4">
              Headers
            </h3>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(header, index) in responseHeaderEntries" :key="index" class="hover:bg-gray-50">
                    <td class="px-6 py-3 text-sm font-medium text-gray-900">
                      {{ header.key }}
                    </td>
                    <td class="px-6 py-3 text-sm text-gray-500 break-all">
                      {{ header.value }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="request.responseBody">
            <h3 class="text-lg font-medium mb-4">
              Body
            </h3>
            <div class="flex justify-between items-center mb-2">
              <div class="text-sm text-gray-500">
                {{ isCodeView ? 'Formatted JSON' : 'Raw' }}
              </div>
              <button
                class="text-sm text-indigo-600 hover:text-indigo-800"
                @click="isCodeView = !isCodeView"
              >
                {{ isCodeView ? 'View Raw' : 'View Formatted' }}
              </button>
            </div>
            <pre
              class="bg-gray-50 p-4 rounded-md overflow-x-auto text-sm font-mono"
            >{{ isCodeView ? formatJson(request.responseBody) : request.responseBody }}</pre>
          </div>
        </div>

        <!-- Cookies Tab -->
        <div v-if="activeTab === 'cookies'" class="p-6">
          <div v-if="cookieEntries.length > 0">
            <h3 class="text-lg font-medium mb-4">
              Cookies
            </h3>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(cookie, index) in cookieEntries" :key="index" class="hover:bg-gray-50">
                    <td class="px-6 py-3 text-sm font-medium text-gray-900">
                      {{ cookie.key }}
                    </td>
                    <td class="px-6 py-3 text-sm text-gray-500 break-all">
                      {{ cookie.value }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-else class="text-center py-8 text-gray-500">
            No cookies found for this request.
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex space-x-4 mb-6">
        <button class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50">
          <span class="i-carbon-repeat mr-2" />
          Replay Request
        </button>

        <router-link :to="`/requests/compare?id=${request.id}`" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 flex items-center">
          <span class="i-carbon-compare mr-2" />
          Add to Comparison
        </router-link>

        <button class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50">
          <span class="i-carbon-export mr-2" />
          Export as cURL
        </button>

        <button class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50">
          <span class="i-carbon-document-export mr-2" />
          Save as HAR
        </button>
      </div>
    </template>

    <div v-else class="bg-white rounded-lg shadow p-8 text-center">
      <p class="text-gray-600">
        Request not found.
      </p>
      <button class="mt-4 text-indigo-600 hover:text-indigo-800" @click="goBack">
        Back to Requests
      </button>
    </div>
  </div>
</template>
