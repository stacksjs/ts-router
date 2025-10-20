<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const error = ref<string | null>(null)
const isLoading = ref(false)

// Dashboard metrics
const totalRequests = ref(0)
const totalBytes = ref(0)
const avgResponseTime = ref(0)
const errorRate = ref(0)
const successRate = ref(0)
const requestsPerMinute = ref(0)

// Mock data for charts
const responseTimeData = ref([42, 50, 65, 59, 80, 81, 56, 55, 72, 64, 61, 68, 75, 62, 44, 35, 41, 48])
const requestsByStatusData = computed(() => ({
  labels: ['2xx Success', '3xx Redirect', '4xx Client Error', '5xx Server Error'],
  data: [72, 8, 15, 5],
}))

// Mock data for endpoint activity
const endpointActivityData = ref([
  { path: '/api/users', count: 245, avgResponseTime: 82 },
  { path: '/api/products', count: 189, avgResponseTime: 125 },
  { path: '/api/orders', count: 132, avgResponseTime: 167 },
  { path: '/api/auth/login', count: 87, avgResponseTime: 210 },
  { path: '/api/search', count: 76, avgResponseTime: 312 },
])

// Recent requests
const recentRequests = ref([
  { id: '1', method: 'GET', path: '/api/users', status: 200, time: '12ms', timestamp: '2023-05-15T14:23:45' },
  { id: '2', method: 'POST', path: '/api/auth/login', status: 200, time: '245ms', timestamp: '2023-05-15T14:22:30' },
  { id: '3', method: 'GET', path: '/api/products', status: 404, time: '34ms', timestamp: '2023-05-15T14:20:12' },
  { id: '4', method: 'PUT', path: '/api/users/5', status: 204, time: '89ms', timestamp: '2023-05-15T14:18:45' },
  { id: '5', method: 'DELETE', path: '/api/posts/12', status: 500, time: '120ms', timestamp: '2023-05-15T14:15:23' },
])

// HTTP Method distribution
const methodDistribution = ref({
  GET: 64,
  POST: 18,
  PUT: 10,
  DELETE: 6,
  PATCH: 2,
})

// Status code distribution
const statusDistribution = ref({
  '2xx': 72,
  '3xx': 8,
  '4xx': 15,
  '5xx': 5,
})

onMounted(async () => {
  await fetchDashboardData()
})

async function fetchDashboardData(_forceRefresh = false) {
  error.value = null
  isLoading.value = true

  try {
    // In a real app, this would fetch data from an API
    // Simulate API call with a delay
    await new Promise(resolve => setTimeout(resolve, 800))

    // Set mock dashboard metrics
    totalRequests.value = 1254
    totalBytes.value = 8.73
    avgResponseTime.value = 156
    errorRate.value = 2.3
    successRate.value = 92.4
    requestsPerMinute.value = 42

    // Generate response time data (last 18 minutes)
    responseTimeData.value = Array.from({ length: 18 }, () =>
      Math.max(20, Math.floor(Math.random() * 300)))
  }
  catch (err) {
    error.value = 'Failed to load dashboard data'
    console.error('Dashboard data loading error:', err)
  }
  finally {
    isLoading.value = false
  }
}

async function refreshData() {
  await fetchDashboardData(true)
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
    default: return 'bg-gray-100 text-gray-800'
  }
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h2 class="text-2xl font-medium text-gray-800">
        API Overview
      </h2>
    </div>

    <div v-if="isLoading && !totalRequests" class="card p-8 text-center bg-white rounded-xl shadow-md">
      <div class="flex justify-center items-center space-x-3">
        <div class="w-5 h-5 rounded-full bg-indigo-600 animate-pulse" />
        <div class="w-5 h-5 rounded-full bg-indigo-600 animate-pulse" style="animation-delay: 0.2s" />
        <div class="w-5 h-5 rounded-full bg-indigo-600 animate-pulse" style="animation-delay: 0.4s" />
      </div>
      <p class="mt-4 text-gray-600 font-medium">
        Loading dashboard data...
      </p>
    </div>

    <div v-else-if="error" class="card bg-red-50 border border-red-200 text-red-600 p-8 text-center rounded-xl shadow">
      <span class="i-carbon-warning-alt text-4xl text-red-500 mb-3" />
      <p class="font-medium">
        {{ error }}
      </p>
      <button class="btn btn-primary mt-5 px-6 py-2.5" @click="refreshData">
        <span class="i-carbon-restart mr-2" />
        Retry
      </button>
    </div>

    <div v-else>
      <!-- Key metrics overview -->
      <div class="card bg-white rounded-lg shadow-sm mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <!-- Requests Per Minute -->
          <div class="p-6 border-b md:border-r border-gray-100 md:border-b-0">
            <div class="text-sm font-medium text-gray-500 mb-1">
              Requests Per Minute
            </div>
            <div class="text-2xl font-semibold">
              {{ requestsPerMinute }}
            </div>
          </div>

          <!-- Total Requests -->
          <div class="p-6 border-b lg:border-r border-gray-100 lg:border-b-0">
            <div class="text-sm font-medium text-gray-500 mb-1">
              Total Requests
            </div>
            <div class="text-2xl font-semibold">
              {{ totalRequests }}
            </div>
          </div>

          <!-- Avg Response Time -->
          <div class="p-6 border-b md:border-r md:border-b-0 border-gray-100 xl:border-r-0">
            <div class="text-sm font-medium text-gray-500 mb-1">
              Avg Response Time
            </div>
            <div class="text-2xl font-semibold">
              {{ avgResponseTime }}ms
            </div>
          </div>

          <!-- Success Rate -->
          <div class="p-6 border-b xl:border-r xl:border-b-0 border-gray-100">
            <div class="text-sm font-medium text-gray-500 mb-1">
              Success Rate
            </div>
            <div class="text-2xl font-semibold text-green-600">
              {{ successRate }}%
            </div>
          </div>

          <!-- Error Rate -->
          <div class="p-6 border-b lg:border-r lg:border-b-0 border-gray-100">
            <div class="text-sm font-medium text-gray-500 mb-1">
              Error Rate
            </div>
            <div class="text-2xl font-semibold text-red-600">
              {{ errorRate }}%
            </div>
          </div>

          <!-- Data Transferred -->
          <div class="p-6">
            <div class="text-sm font-medium text-gray-500 mb-1">
              Data Transferred
            </div>
            <div class="text-2xl font-semibold">
              {{ totalBytes }} MB
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <!-- Response Time Chart -->
        <div class="card p-5 rounded-xl shadow-sm bg-white">
          <div class="flex items-center mb-4">
            <span class="i-carbon-chart-line text-xl text-indigo-600 mr-2" />
            <h3 class="text-lg font-medium text-gray-800">
              Response Time Trend (Last 18 minutes)
            </h3>
          </div>
          <div class="p-2 h-64 bg-white rounded-lg">
            <div v-if="isLoading" class="flex h-full items-center justify-center">
              <div class="loader mr-2" />
              <span class="text-gray-500">Loading chart data...</span>
            </div>
            <div v-else>
              <!-- Simple bar chart implementation -->
              <div class="flex h-52 items-end justify-between">
                <div
                  v-for="(value, index) in responseTimeData"
                  :key="index"
                  class="w-2 bg-indigo-500 mx-1 rounded-t-sm"
                  :style="{ height: `${Math.min(100, value / responseTimeData.reduce((a, b) => Math.max(a, b), 0) * 100)}%` }"
                />
              </div>
              <div class="flex justify-between mt-2">
                <span class="text-xs text-gray-500">-18m</span>
                <span class="text-xs text-gray-500">-9m</span>
                <span class="text-xs text-gray-500">now</span>
              </div>
              <div class="text-center mt-2 text-sm text-gray-600">
                <span class="font-semibold">{{ avgResponseTime }}</span> ms average
              </div>
            </div>
          </div>
        </div>

        <!-- Requests by Status Chart -->
        <div class="card p-5 rounded-xl shadow-sm bg-white">
          <div class="flex items-center mb-4">
            <span class="i-carbon-chart-pie text-xl text-indigo-600 mr-2" />
            <h3 class="text-lg font-medium text-gray-800">
              Requests by Status
            </h3>
          </div>
          <div class="p-2 h-64 bg-white rounded-lg flex justify-center items-center">
            <div v-if="isLoading" class="flex items-center">
              <div class="loader mr-2" />
              <span class="text-gray-500">Loading chart data...</span>
            </div>
            <template v-else>
              <!-- Simple pie chart implementation -->
              <div class="relative w-48 h-48">
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="text-center">
                    <div class="text-3xl font-bold text-gray-800">
                      {{ requestsByStatusData.data.reduce((a, b) => a + b, 0) }}
                    </div>
                    <div class="text-sm text-gray-500">
                      Total Requests
                    </div>
                  </div>
                </div>
                <!-- Colored segments - a simplified pie chart representation -->
                <svg viewBox="0 0 100 100" class="absolute inset-0">
                  <circle
                    cx="50" cy="50" r="45" fill="transparent" stroke="#10b981" stroke-width="10"
                    stroke-dasharray="282.6" stroke-dashoffset="0"
                  />
                  <circle
                    cx="50" cy="50" r="45" fill="transparent" stroke="#3b82f6" stroke-width="10"
                    stroke-dasharray="282.6" stroke-dashoffset="203.47"
                  />
                  <circle
                    cx="50" cy="50" r="45" fill="transparent" stroke="#f97316" stroke-width="10"
                    stroke-dasharray="282.6" stroke-dashoffset="225.81"
                  />
                  <circle
                    cx="50" cy="50" r="45" fill="transparent" stroke="#ef4444" stroke-width="10"
                    stroke-dasharray="282.6" stroke-dashoffset="267.97"
                  />
                </svg>
              </div>
              <!-- Legend -->
              <div class="ml-4 space-y-3">
                <div class="flex items-center">
                  <div class="w-3 h-3 bg-emerald-500 rounded-full mr-2" />
                  <span class="text-sm text-gray-600">2xx Success ({{ requestsByStatusData.data[0] }}%)</span>
                </div>
                <div class="flex items-center">
                  <div class="w-3 h-3 bg-blue-500 rounded-full mr-2" />
                  <span class="text-sm text-gray-600">3xx Redirect ({{ requestsByStatusData.data[1] }}%)</span>
                </div>
                <div class="flex items-center">
                  <div class="w-3 h-3 bg-orange-500 rounded-full mr-2" />
                  <span class="text-sm text-gray-600">4xx Client Error ({{ requestsByStatusData.data[2] }}%)</span>
                </div>
                <div class="flex items-center">
                  <div class="w-3 h-3 bg-red-500 rounded-full mr-2" />
                  <span class="text-sm text-gray-600">5xx Server Error ({{ requestsByStatusData.data[3] }}%)</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow p-4">
          <h2 class="text-lg font-semibold mb-4">
            HTTP Method Distribution
          </h2>
          <div class="h-64">
            <div class="h-full flex flex-col justify-center">
              <!-- Method bars -->
              <div v-for="(value, method) in methodDistribution" :key="method" class="mb-3">
                <div class="flex items-center">
                  <div class="w-16 text-sm font-medium">
                    {{ method }}
                  </div>
                  <div class="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                    <div
                      class="h-full rounded"
                      :class="{
                        'bg-blue-500': method === 'GET',
                        'bg-green-500': method === 'POST',
                        'bg-yellow-500': method === 'PUT',
                        'bg-red-500': method === 'DELETE',
                        'bg-indigo-500': method === 'PATCH',
                      }"
                      :style="{ width: `${value}%` }"
                    />
                  </div>
                  <div class="w-12 text-right text-sm ml-2">
                    {{ value }}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-4">
          <h2 class="text-lg font-semibold mb-4">
            Response Status Distribution
          </h2>
          <div class="h-64">
            <div class="h-full flex flex-col justify-center">
              <!-- Status code bars -->
              <div v-for="(value, status) in statusDistribution" :key="status" class="mb-3">
                <div class="flex items-center">
                  <div class="w-16 text-sm font-medium">
                    {{ status }}
                  </div>
                  <div class="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                    <div
                      class="h-full rounded"
                      :class="{
                        'bg-green-500': status === '2xx',
                        'bg-blue-500': status === '3xx',
                        'bg-orange-500': status === '4xx',
                        'bg-red-500': status === '5xx',
                      }"
                      :style="{ width: `${value}%` }"
                    />
                  </div>
                  <div class="w-12 text-right text-sm ml-2">
                    {{ value }}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Endpoint Activity -->
      <div class="card p-5 rounded-xl shadow-sm bg-white mb-8">
        <div class="flex items-center mb-6">
          <span class="i-carbon-analytics text-xl text-indigo-600 mr-2" />
          <h3 class="text-lg font-medium text-gray-800">
            Top Endpoints
          </h3>
        </div>

        <div v-if="isLoading" class="py-8 text-center">
          <div class="loader mx-auto mb-4" />
          <p class="text-gray-500">
            Loading endpoint data...
          </p>
        </div>

        <div v-else-if="endpointActivityData.length === 0" class="py-8 text-center text-gray-500">
          No endpoint data available
        </div>

        <div v-else class="space-y-4">
          <div v-for="endpoint in endpointActivityData" :key="endpoint.path" class="flex items-center">
            <span class="w-32 text-sm text-gray-600 truncate">{{ endpoint.path }}</span>
            <div class="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden mx-4">
              <div
                class="h-full bg-indigo-500 rounded-full"
                :style="{ width: `${Math.min(100, endpoint.count / endpointActivityData.reduce((max, e) => Math.max(max, e.count), 0) * 100)}%` }"
              />
            </div>
            <span class="text-sm font-medium mr-6">{{ endpoint.count }} requests</span>
            <span class="text-sm text-gray-600">{{ endpoint.avgResponseTime }}ms</span>
          </div>
        </div>

        <div class="mt-6 text-right">
          <router-link to="/requests" class="btn btn-outline text-sm">
            <span class="i-carbon-list-boxes mr-2" />
            View All Requests
          </router-link>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow mb-8">
        <div class="flex justify-between items-center p-4 border-b">
          <h2 class="text-lg font-semibold">
            Recent Requests
          </h2>
          <router-link to="/requests" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
            View All
          </router-link>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
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
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="request in recentRequests" :key="request.id" class="hover:bg-gray-50">
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
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <router-link :to="`/requests/${request.id}`" class="text-indigo-600 hover:text-indigo-900">
                    Details
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loader {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(79, 70, 229, 0.2);
  border-radius: 50%;
  border-top-color: #4f46e5;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
