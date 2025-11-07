<script setup lang="ts">
import type { Collection, RequestItem } from '../store/collectionsStore'
import { computed, onMounted, ref } from 'vue'
import CodeExporter from '../components/CodeExporter.vue'
import { useCollectionsStore } from '../store/collectionsStore'

const collectionsStore = useCollectionsStore()
const newCollectionName = ref('')
const newCollectionDescription = ref('')
const showNewCollectionForm = ref(false)
const searchQuery = ref('')
const selectedCollection = ref<Collection | null>(null)
const editingRequest = ref<RequestItem | null>(null)
const showRequestForm = ref(false)
const showCodeExporter = ref(false)
const selectedRequest = ref<RequestItem | null>(null)
const newRequestData = ref({
  name: '',
  method: 'GET',
  url: '',
  headers: {},
  body: '',
})

const headerKeys = ref<string[]>([''])
const headerValues = ref<string[]>([''])

// Method options
const methodOptions = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
]

// Load collections data
onMounted(async () => {
  try {
    await collectionsStore.fetchCollections()
  }
  catch (error) {
    console.error('Failed to load collections:', error)
  }
})

// Computed filtered collections
const filteredCollections = computed(() => {
  return collectionsStore.collections.filter((collection) => {
    const matchesSearch = searchQuery.value === ''
      || collection.name.toLowerCase().includes(searchQuery.value.toLowerCase())
      || (collection.description?.toLowerCase().includes(searchQuery.value.toLowerCase()) ?? false)
      || collection.requests.some(request =>
        request.name.toLowerCase().includes(searchQuery.value.toLowerCase())
        || request.url.toLowerCase().includes(searchQuery.value.toLowerCase()))

    return matchesSearch
  })
})

// Collection methods
function createCollection() {
  if (!newCollectionName.value.trim())
    return

  collectionsStore.createCollection(
    newCollectionName.value.trim(),
    newCollectionDescription.value.trim() || undefined,
  )

  // Reset form
  newCollectionName.value = ''
  newCollectionDescription.value = ''
  showNewCollectionForm.value = false
}

function selectCollection(collection: Collection) {
  selectedCollection.value = collection
}

function deleteSelectedCollection() {
  if (!selectedCollection.value)
    return

  // eslint-disable-next-line no-alert
  const confirmed = confirm(`Are you sure you want to delete "${selectedCollection.value.name}" collection?`)
  if (!confirmed)
    return

  collectionsStore.deleteCollection(selectedCollection.value.id)
  selectedCollection.value = null
}

// Request methods
function openRequestForm(request: RequestItem | null = null) {
  if (request) {
    editingRequest.value = request
    newRequestData.value = {
      name: request.name,
      method: request.method,
      url: request.url,
      headers: { ...request.headers },
      body: request.body || '',
    }

    // Parse headers for form
    headerKeys.value = Object.keys(request.headers)
    headerValues.value = Object.values(request.headers)

    // Ensure at least one empty header field
    if (headerKeys.value.length === 0) {
      headerKeys.value = ['']
      headerValues.value = ['']
    }
  }
  else {
    editingRequest.value = null
    newRequestData.value = {
      name: '',
      method: 'GET',
      url: '',
      headers: {},
      body: '',
    }
    headerKeys.value = ['']
    headerValues.value = ['']
  }

  showRequestForm.value = true
}

function saveRequest() {
  if (!selectedCollection.value)
    return
  if (!newRequestData.value.name.trim() || !newRequestData.value.url.trim())
    return

  // Build headers object from arrays
  const headers: Record<string, string> = {}
  for (let i = 0; i < headerKeys.value.length; i++) {
    if (headerKeys.value[i].trim() && headerValues.value[i].trim()) {
      headers[headerKeys.value[i].trim()] = headerValues.value[i].trim()
    }
  }

  if (editingRequest.value) {
    // Update existing request
    collectionsStore.updateRequest(
      selectedCollection.value.id,
      editingRequest.value.id,
      {
        name: newRequestData.value.name.trim(),
        method: newRequestData.value.method,
        url: newRequestData.value.url.trim(),
        headers,
        body: newRequestData.value.body.trim() || undefined,
        updatedAt: new Date().toISOString(),
      },
    )
  }
  else {
    // Add new request
    collectionsStore.addRequestToCollection(
      selectedCollection.value.id,
      {
        name: newRequestData.value.name.trim(),
        method: newRequestData.value.method,
        url: newRequestData.value.url.trim(),
        headers,
        body: newRequestData.value.body.trim() || undefined,
      },
    )
  }

  showRequestForm.value = false
}

function deleteRequest(requestId: string) {
  if (!selectedCollection.value)
    return

  // eslint-disable-next-line no-alert
  const confirmed = confirm('Are you sure you want to delete this request?')
  if (!confirmed)
    return

  collectionsStore.deleteRequest(selectedCollection.value.id, requestId)
}

function addHeaderField() {
  headerKeys.value.push('')
  headerValues.value.push('')
}

function removeHeaderField(index: number) {
  headerKeys.value.splice(index, 1)
  headerValues.value.splice(index, 1)

  // Always keep at least one header field
  if (headerKeys.value.length === 0) {
    headerKeys.value = ['']
    headerValues.value = ['']
  }
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

function clearSelection() {
  selectedCollection.value = null
}

// Code export functionality
function openCodeExporter(request: RequestItem) {
  selectedRequest.value = request
  showCodeExporter.value = true
}

function closeCodeExporter() {
  showCodeExporter.value = false
}
</script>

<template>
  <div class="collections-view">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">
        Request Collections
      </h1>
      <div class="flex space-x-3">
        <button
          v-if="!showNewCollectionForm"
          class="btn-primary px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
          @click="showNewCollectionForm = true"
        >
          <span class="i-carbon-add mr-2" />
          New Collection
        </button>
      </div>
    </div>

    <!-- New Collection Form -->
    <div v-if="showNewCollectionForm" class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">
        Create New Collection
      </h2>
      <div class="space-y-4">
        <div>
          <label for="collection-name" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            id="collection-name"
            v-model="newCollectionName"
            type="text"
            placeholder="Collection name"
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
        </div>
        <div>
          <label for="collection-description" class="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
          <textarea
            id="collection-description"
            v-model="newCollectionDescription"
            placeholder="Description of this collection"
            rows="3"
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <div class="flex justify-end space-x-3">
          <button
            class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
            @click="showNewCollectionForm = false"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
            :disabled="!newCollectionName.trim()"
            @click="createCollection"
          >
            Create
          </button>
        </div>
      </div>
    </div>

    <!-- Search -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div>
        <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search Collections</label>
        <input
          id="search"
          v-model="searchQuery"
          type="text"
          placeholder="Search by name, description, or request details..."
          class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
      </div>
    </div>

    <!-- Collection List and Details View -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Collections List -->
      <div
        class="bg-white rounded-lg shadow overflow-hidden lg:col-span-1"
        :class="{ 'h-[calc(100vh-16rem)]': filteredCollections.length > 5 }"
      >
        <div class="p-4 border-b border-gray-200">
          <h2 class="text-lg font-medium text-gray-900">
            Your Collections
          </h2>
          <p class="text-sm text-gray-500">
            {{ collectionsStore.collections.length }} collections, {{ collectionsStore.totalRequests }} requests
          </p>
        </div>

        <div v-if="collectionsStore.isLoading" class="p-8 text-center">
          <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent" />
          <p class="mt-2 text-gray-600">
            Loading collections...
          </p>
        </div>

        <div v-else-if="filteredCollections.length === 0" class="p-8 text-center">
          <p class="text-gray-600">
            No collections found. Create your first collection to get started.
          </p>
        </div>

        <ul v-else class="divide-y divide-gray-200 overflow-y-auto max-h-[calc(100vh-18rem)]">
          <li
            v-for="collection in filteredCollections"
            :key="collection.id"
            class="p-4 hover:bg-gray-50 cursor-pointer"
            :class="selectedCollection?.id === collection.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''"
            @click="selectCollection(collection)"
          >
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-sm font-medium text-gray-900">
                  {{ collection.name }}
                </h3>
                <p v-if="collection.description" class="text-sm text-gray-500 mt-1 line-clamp-2">
                  {{ collection.description }}
                </p>
              </div>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                {{ collection.requests.length }}
              </span>
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Last updated: {{ new Date(collection.updatedAt).toLocaleString() }}
            </p>
          </li>
        </ul>
      </div>

      <!-- Collection Details -->
      <div v-if="selectedCollection" class="bg-white rounded-lg shadow overflow-hidden lg:col-span-2">
        <div class="p-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <div class="flex items-center">
              <button
                class="mr-2 p-1 text-gray-500 hover:text-gray-700 lg:hidden"
                @click="clearSelection"
              >
                <span class="i-carbon-arrow-left" />
              </button>
              <h2 class="text-lg font-medium text-gray-900">
                {{ selectedCollection.name }}
              </h2>
            </div>
            <p v-if="selectedCollection.description" class="text-sm text-gray-500 mt-1">
              {{ selectedCollection.description }}
            </p>
          </div>
          <div class="flex space-x-2">
            <button
              class="p-2 text-red-600 hover:text-red-800"
              title="Delete Collection"
              @click="deleteSelectedCollection"
            >
              <span class="i-carbon-trash-can" />
            </button>
            <button
              class="p-2 text-indigo-600 hover:text-indigo-800"
              title="Add Request"
              @click="openRequestForm()"
            >
              <span class="i-carbon-add" />
            </button>
          </div>
        </div>

        <div v-if="selectedCollection.requests.length === 0" class="p-8 text-center">
          <p class="text-gray-600">
            No requests in this collection. Add your first request to get started.
          </p>
          <button
            class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
            @click="openRequestForm()"
          >
            Add Request
          </button>
        </div>

        <ul v-else class="divide-y divide-gray-200">
          <li v-for="request in selectedCollection.requests" :key="request.id" class="p-4 hover:bg-gray-50">
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <div class="flex items-center mb-2">
                  <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${getMethodClass(request.method)} mr-3`">
                    {{ request.method }}
                  </span>
                  <h3 class="text-sm font-medium text-gray-900">
                    {{ request.name }}
                  </h3>
                </div>
                <p class="text-sm text-gray-600 font-mono mb-2">
                  {{ request.url }}
                </p>
                <p v-if="Object.keys(request.headers).length > 0" class="text-xs text-gray-500 mb-1">
                  <strong>Headers:</strong> {{ Object.keys(request.headers).length }} defined
                </p>
                <p v-if="request.body" class="text-xs text-gray-500">
                  <strong>Body:</strong> {{ request.body.length }} characters
                </p>
              </div>
              <div class="flex space-x-2">
                <button
                  class="p-1 text-indigo-600 hover:text-indigo-800"
                  title="Export as Code"
                  @click="openCodeExporter(request)"
                >
                  <span class="i-carbon-code" />
                </button>
                <button
                  class="p-1 text-indigo-600 hover:text-indigo-800"
                  title="Edit Request"
                  @click="openRequestForm(request)"
                >
                  <span class="i-carbon-edit" />
                </button>
                <button
                  class="p-1 text-red-600 hover:text-red-800"
                  title="Delete Request"
                  @click="deleteRequest(request.id)"
                >
                  <span class="i-carbon-trash-can" />
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <!-- Empty State when no collection is selected -->
      <div v-else-if="!selectedCollection && !showNewCollectionForm" class="bg-white rounded-lg shadow p-8 text-center lg:col-span-2">
        <div class="text-gray-500">
          <span class="i-carbon-folder text-5xl mb-3" />
          <h3 class="text-lg font-medium text-gray-900 mb-1">
            No Collection Selected
          </h3>
          <p class="mb-4">
            Select a collection to view and manage its requests
          </p>
          <button
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
            @click="showNewCollectionForm = true"
          >
            Create New Collection
          </button>
        </div>
      </div>
    </div>

    <!-- Request Form Modal -->
    <div v-if="showRequestForm" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div class="relative bg-white rounded-lg shadow-xl mx-auto max-w-2xl w-full">
        <div class="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 class="text-lg font-medium text-gray-900">
            {{ editingRequest ? 'Edit Request' : 'New Request' }}
          </h2>
          <button
            class="text-gray-500 hover:text-gray-700"
            @click="showRequestForm = false"
          >
            <span class="i-carbon-close" />
          </button>
        </div>

        <div class="p-6 space-y-4">
          <div>
            <label for="request-name" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="request-name"
              v-model="newRequestData.name"
              type="text"
              placeholder="Request name"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
          </div>

          <div class="grid grid-cols-4 gap-4">
            <div>
              <label for="request-method" class="block text-sm font-medium text-gray-700 mb-1">Method</label>
              <select
                id="request-method"
                v-model="newRequestData.method"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option v-for="method in methodOptions" :key="method" :value="method">
                  {{ method }}
                </option>
              </select>
            </div>

            <div class="col-span-3">
              <label for="request-url" class="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                id="request-url"
                v-model="newRequestData.url"
                type="text"
                placeholder="https://example.com/api/resource"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
            </div>
          </div>

          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="block text-sm font-medium text-gray-700">Headers</label>
              <button
                class="text-sm text-indigo-600 hover:text-indigo-800"
                @click="addHeaderField"
              >
                Add Header
              </button>
            </div>

            <div v-for="(key, index) in headerKeys" :key="index" class="grid grid-cols-5 gap-2 mb-2">
              <input
                v-model="headerKeys[index]"
                placeholder="Header name"
                class="col-span-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
              <input
                v-model="headerValues[index]"
                placeholder="Value"
                class="col-span-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
              <button
                class="text-red-600 hover:text-red-800"
                :disabled="headerKeys.length <= 1"
                @click="removeHeaderField(index)"
              >
                <span class="i-carbon-trash-can" />
              </button>
            </div>
          </div>

          <div>
            <label for="request-body" class="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              id="request-body"
              v-model="newRequestData.body"
              placeholder="Request body (JSON, form data, etc.)"
              rows="5"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
            />
          </div>
        </div>

        <div class="p-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
            @click="showRequestForm = false"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
            :disabled="!newRequestData.name.trim() || !newRequestData.url.trim()"
            @click="saveRequest"
          >
            {{ editingRequest ? 'Update' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Code Exporter Modal -->
    <CodeExporter
      v-if="selectedRequest"
      :request="selectedRequest"
      :show="showCodeExporter"
      @close="closeCodeExporter"
    />
  </div>
</template>
