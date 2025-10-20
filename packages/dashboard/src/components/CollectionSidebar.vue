<script setup lang="ts">
import type { RequestItem } from '../store/collectionStore'
import { computed, onMounted, ref } from 'vue'
import { useCollectionStore } from '../store/collectionStore'

const emits = defineEmits(['selectRequest'])
const collectionStore = useCollectionStore()
const isLoading = computed(() => collectionStore.isLoading)
const collections = computed(() => collectionStore.collections)
const expandedCollections = ref<Set<string>>(new Set())
const showNewCollectionForm = ref(false)
const newCollectionName = ref('')
const newCollectionDescription = ref('')

function toggleCollection(collectionId: string) {
  if (expandedCollections.value.has(collectionId)) {
    expandedCollections.value.delete(collectionId)
  }
  else {
    expandedCollections.value.add(collectionId)
  }
}

function toggleNewCollectionForm() {
  showNewCollectionForm.value = !showNewCollectionForm.value
  if (showNewCollectionForm.value) {
    newCollectionName.value = ''
    newCollectionDescription.value = ''
  }
}

function createCollection() {
  if (newCollectionName.value.trim()) {
    collectionStore.createCollection(
      newCollectionName.value.trim(),
      newCollectionDescription.value.trim() || undefined,
    )
    toggleNewCollectionForm()

    // Auto-expand the new collection
    const newCollection = collections.value[collections.value.length - 1]
    if (newCollection) {
      expandedCollections.value.add(newCollection.id)
    }
  }
}

function selectRequest(request: RequestItem) {
  emits('selectRequest', request)
}

function deleteCollection(collectionId: string, event: Event) {
  event.stopPropagation()
  // eslint-disable-next-line no-alert
  if (confirm('Are you sure you want to delete this collection?')) {
    collectionStore.deleteCollection(collectionId)
  }
}

function deleteRequest(collectionId: string, requestId: string, event: Event) {
  event.stopPropagation()
  // eslint-disable-next-line no-alert
  if (confirm('Are you sure you want to delete this request?')) {
    collectionStore.deleteRequest(collectionId, requestId)
  }
}

onMounted(async () => {
  await collectionStore.fetchCollections()

  // Expand the first collection by default
  if (collections.value.length > 0) {
    expandedCollections.value.add(collections.value[0].id)
  }
})
</script>

<template>
  <div class="collections-sidebar">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-medium">
        Collections
      </h3>
      <button
        class="text-indigo-600 hover:text-indigo-800 text-sm"
        @click="toggleNewCollectionForm"
      >
        {{ showNewCollectionForm ? 'Cancel' : '+ New' }}
      </button>
    </div>

    <div v-if="showNewCollectionForm" class="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50">
      <h4 class="text-sm font-medium mb-2">
        New Collection
      </h4>
      <div class="mb-2">
        <input
          v-model="newCollectionName"
          type="text"
          class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="Collection Name"
        >
      </div>
      <div class="mb-3">
        <input
          v-model="newCollectionDescription"
          type="text"
          class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="Description (optional)"
        >
      </div>
      <button
        class="w-full px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
        :disabled="!newCollectionName.trim()"
        @click="createCollection"
      >
        Create Collection
      </button>
    </div>

    <div v-if="isLoading" class="p-4 text-center text-gray-500">
      Loading collections...
    </div>

    <div v-else-if="collections.length === 0" class="p-4 text-center text-gray-500">
      No collections yet. Create one to get started.
    </div>

    <div v-else class="mt-2 space-y-2">
      <div
        v-for="collection in collections"
        :key="collection.id"
        class="border border-gray-200 rounded-md overflow-hidden"
      >
        <div
          class="flex justify-between items-center p-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
          @click="toggleCollection(collection.id)"
        >
          <div class="flex items-center">
            <span
              class="mr-1 text-xs"
              :class="expandedCollections.has(collection.id) ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right'"
            />
            <span class="font-medium text-sm">{{ collection.name }}</span>
            <span class="ml-2 text-xs text-gray-500">{{ collection.requests.length }} requests</span>
          </div>
          <button
            class="text-gray-500 hover:text-red-600"
            title="Delete Collection"
            @click="deleteCollection(collection.id, $event)"
          >
            <span class="i-carbon-trash-can text-sm" />
          </button>
        </div>

        <div v-if="expandedCollections.has(collection.id)" class="bg-white">
          <div
            v-if="collection.requests.length === 0"
            class="p-3 text-center text-sm text-gray-500"
          >
            No requests in this collection
          </div>
          <div v-else>
            <div
              v-for="request in collection.requests"
              :key="request.id"
              class="p-2 border-t border-gray-200 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
              @click="selectRequest(request)"
            >
              <div>
                <div class="flex items-center">
                  <span
                    class="text-xs px-1.5 py-0.5 rounded mr-2"
                    :class="{
                      'bg-blue-100 text-blue-800': request.method === 'GET',
                      'bg-green-100 text-green-800': request.method === 'POST',
                      'bg-yellow-100 text-yellow-800': request.method === 'PUT',
                      'bg-red-100 text-red-800': request.method === 'DELETE',
                      'bg-purple-100 text-purple-800': request.method === 'PATCH',
                    }"
                  >
                    {{ request.method }}
                  </span>
                  <span class="text-sm">{{ request.name }}</span>
                </div>
                <div class="text-xs text-gray-500 truncate mt-0.5" style="max-width: 200px;">
                  {{ request.url }}
                </div>
              </div>
              <button
                class="text-gray-400 hover:text-red-600"
                title="Delete Request"
                @click="deleteRequest(collection.id, request.id, $event)"
              >
                <span class="i-carbon-trash-can text-xs" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collections-sidebar {
  height: 100%;
  overflow-y: auto;
}
</style>
