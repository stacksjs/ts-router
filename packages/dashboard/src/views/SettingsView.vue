<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useEnvironmentStore } from '../store/environmentStore'

// App settings
const darkMode = ref(false)
const autoSave = ref(true)
const notificationsEnabled = ref(true)
const maxHistoryItems = ref(100)
const defaultContentType = ref('application/json')
const proxyEnabled = ref(false)
const proxyUrl = ref('http://localhost:8080')
const requestTimeout = ref(30)
const showDeprecationWarnings = ref(true)

// Theme options
const themes = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
  { id: 'system', name: 'System Default' },
]
const selectedTheme = ref('system')

// Export formats
const exportFormats = [
  { id: 'json', name: 'JSON' },
  { id: 'har', name: 'HAR (HTTP Archive)' },
  { id: 'curl', name: 'cURL Commands' },
]
const defaultExportFormat = ref('json')

// API key for sharing/sync
const apiKey = ref('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
const showApiKey = ref(false)

// Environment management
const environmentStore = useEnvironmentStore()
const showNewEnvironmentForm = ref(false)
const showNewVariableForm = ref(false)
const editingEnvironmentId = ref<string | null>(null)
const newEnvironment = ref({ name: '', description: '' })
const newVariable = ref({ name: '', value: '', description: '' })

function toggleApiKeyVisibility() {
  showApiKey.value = !showApiKey.value
}

function resetSettings() {
  darkMode.value = false
  autoSave.value = true
  notificationsEnabled.value = true
  maxHistoryItems.value = 100
  defaultContentType.value = 'application/json'
  proxyEnabled.value = false
  proxyUrl.value = 'http://localhost:8080'
  requestTimeout.value = 30
  showDeprecationWarnings.value = true
  selectedTheme.value = 'system'
  defaultExportFormat.value = 'json'
}

function saveSettings() {
  // In a real app, would save to local storage or server
  // For demo purposes, just show success message
  const saveMessage = document.getElementById('save-message')
  if (saveMessage) {
    saveMessage.classList.remove('opacity-0')
    saveMessage.classList.add('opacity-100')

    setTimeout(() => {
      saveMessage.classList.remove('opacity-100')
      saveMessage.classList.add('opacity-0')
    }, 3000)
  }
}

function regenerateApiKey() {
  // In a real app, would call an API to regenerate the key
  apiKey.value = 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'
}

// Environment management functions
function toggleNewEnvironmentForm() {
  showNewEnvironmentForm.value = !showNewEnvironmentForm.value
  if (showNewEnvironmentForm.value) {
    newEnvironment.value = { name: '', description: '' }
  }
}

function toggleNewVariableForm(environmentId: string) {
  editingEnvironmentId.value = environmentId
  showNewVariableForm.value = !showNewVariableForm.value
  if (showNewVariableForm.value) {
    newVariable.value = { name: '', value: '', description: '' }
  }
}

function createEnvironment() {
  if (newEnvironment.value.name.trim()) {
    environmentStore.createEnvironment(
      newEnvironment.value.name.trim(),
      newEnvironment.value.description.trim() || undefined,
    )
    toggleNewEnvironmentForm()
  }
}

function createVariable() {
  if (editingEnvironmentId.value && newVariable.value.name.trim()) {
    environmentStore.addVariable(
      editingEnvironmentId.value,
      {
        name: newVariable.value.name.trim(),
        value: newVariable.value.value,
        description: newVariable.value.description.trim() || undefined,
      },
    )
    toggleNewVariableForm(editingEnvironmentId.value)
  }
}

function deleteEnv(envId: string) {
  // eslint-disable-next-line no-alert
  if (confirm('Are you sure you want to delete this environment?')) {
    environmentStore.deleteEnvironment(envId)
  }
}

function deleteVar(envId: string, varId: string) {
  environmentStore.deleteVariable(envId, varId)
}

function setActiveEnv(envId: string) {
  environmentStore.setActiveEnvironment(envId)
}

onMounted(async () => {
  await environmentStore.fetchEnvironments()
})
</script>

<template>
  <div class="settings-view">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">
        Settings
      </h1>
      <div id="save-message" class="text-green-600 opacity-0 transition-opacity duration-300">
        Settings saved successfully
      </div>
    </div>

    <!-- Environment section -->
    <div id="environments" class="mb-8">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold">
          Environment Variables
        </h2>
        <button
          class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
          @click="toggleNewEnvironmentForm"
        >
          {{ showNewEnvironmentForm ? 'Cancel' : 'New Environment' }}
        </button>
      </div>

      <!-- New environment form -->
      <div v-if="showNewEnvironmentForm" class="bg-white rounded-lg shadow p-4 mb-4">
        <h3 class="text-md font-medium mb-3">
          Create New Environment
        </h3>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="newEnvironment.name"
              type="text"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="e.g. Development, Staging, Production"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              v-model="newEnvironment.description"
              type="text"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="e.g. Local development environment"
            >
          </div>
          <div class="flex justify-end">
            <button
              class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
              :disabled="!newEnvironment.name.trim()"
              @click="createEnvironment"
            >
              Create Environment
            </button>
          </div>
        </div>
      </div>

      <!-- Environment list -->
      <div v-if="environmentStore.environments.length === 0" class="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        No environments defined. Create one to get started.
      </div>

      <div v-else class="space-y-4">
        <div v-for="env in environmentStore.environments" :key="env.id" class="bg-white rounded-lg shadow overflow-hidden">
          <div class="p-4 bg-gray-50 border-b flex justify-between items-center">
            <div class="flex items-center">
              <span
                v-if="env.isActive"
                class="w-2 h-2 bg-green-500 rounded-full mr-2"
                title="Active Environment"
              />
              <div>
                <h3 class="font-medium">
                  {{ env.name }}
                </h3>
                <p v-if="env.description" class="text-sm text-gray-500">
                  {{ env.description }}
                </p>
              </div>
            </div>
            <div class="flex space-x-2">
              <button
                v-if="!env.isActive"
                class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200"
                title="Set as active environment"
                @click="setActiveEnv(env.id)"
              >
                Activate
              </button>
              <button
                class="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded hover:bg-indigo-200"
                @click="toggleNewVariableForm(env.id)"
              >
                Add Variable
              </button>
              <button
                class="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
                @click="deleteEnv(env.id)"
              >
                Delete
              </button>
            </div>
          </div>

          <!-- New variable form -->
          <div v-if="showNewVariableForm && editingEnvironmentId === env.id" class="p-4 bg-indigo-50 border-b">
            <h4 class="text-sm font-medium mb-2">
              Add New Variable
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input
                  v-model="newVariable.name"
                  type="text"
                  class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="e.g. API_URL"
                >
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Value</label>
                <input
                  v-model="newVariable.value"
                  type="text"
                  class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="e.g. https://api.example.com"
                >
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  v-model="newVariable.description"
                  type="text"
                  class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="e.g. API endpoint URL"
                >
              </div>
            </div>
            <div class="flex justify-end">
              <button
                class="px-2 py-1 text-xs mr-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                @click="toggleNewVariableForm(env.id)"
              >
                Cancel
              </button>
              <button
                class="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                :disabled="!newVariable.name.trim()"
                @click="createVariable"
              >
                Add Variable
              </button>
            </div>
          </div>

          <!-- Variables table -->
          <div class="p-4">
            <div v-if="env.variables.length === 0" class="text-center text-sm text-gray-500 py-4">
              No variables defined for this environment.
            </div>
            <table v-else class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="variable in env.variables" :key="variable.id">
                  <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                    {{ variable.name }}
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-600 font-mono">
                    {{ variable.value }}
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                    {{ variable.description || '-' }}
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      class="text-red-600 hover:text-red-900"
                      @click="deleteVar(env.id, variable.id)"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- General Settings -->
      <div class="bg-white rounded-lg shadow p-4 md:col-span-2">
        <h2 class="text-lg font-medium mb-4">
          General Settings
        </h2>

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <label for="dark-mode" class="block text-sm font-medium text-gray-700">Dark Mode</label>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" :class="[
                darkMode ? 'bg-indigo-600' : 'bg-gray-200',
              ]"
              @click="darkMode = !darkMode"
            >
              <span
                aria-hidden="true"
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" :class="[
                  darkMode ? 'translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>
          </div>

          <div class="flex items-center justify-between">
            <label for="auto-save" class="block text-sm font-medium text-gray-700">Auto-save Requests</label>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" :class="[
                autoSave ? 'bg-indigo-600' : 'bg-gray-200',
              ]"
              @click="autoSave = !autoSave"
            >
              <span
                aria-hidden="true"
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" :class="[
                  autoSave ? 'translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>
          </div>

          <div class="flex items-center justify-between">
            <label for="notifications" class="block text-sm font-medium text-gray-700">Notifications</label>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" :class="[
                notificationsEnabled ? 'bg-indigo-600' : 'bg-gray-200',
              ]"
              @click="notificationsEnabled = !notificationsEnabled"
            >
              <span
                aria-hidden="true"
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" :class="[
                  notificationsEnabled ? 'translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>
          </div>

          <div>
            <label for="theme" class="block text-sm font-medium text-gray-700 mb-1">Theme</label>
            <select
              id="theme"
              v-model="selectedTheme"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option v-for="theme in themes" :key="theme.id" :value="theme.id">
                {{ theme.name }}
              </option>
            </select>
          </div>

          <div>
            <label for="export-format" class="block text-sm font-medium text-gray-700 mb-1">Default Export Format</label>
            <select
              id="export-format"
              v-model="defaultExportFormat"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option v-for="format in exportFormats" :key="format.id" :value="format.id">
                {{ format.name }}
              </option>
            </select>
          </div>

          <div>
            <label for="history-items" class="block text-sm font-medium text-gray-700 mb-1">Max History Items</label>
            <input
              id="history-items"
              v-model="maxHistoryItems"
              type="number"
              min="10"
              max="1000"
              step="10"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
          </div>

          <div>
            <label for="content-type" class="block text-sm font-medium text-gray-700 mb-1">Default Content Type</label>
            <input
              id="content-type"
              v-model="defaultContentType"
              type="text"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
          </div>

          <div>
            <label for="request-timeout" class="block text-sm font-medium text-gray-700 mb-1">Request Timeout (seconds)</label>
            <input
              id="request-timeout"
              v-model="requestTimeout"
              type="number"
              min="1"
              max="300"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
          </div>
        </div>
      </div>

      <!-- Proxy Settings -->
      <div class="bg-white rounded-lg shadow p-4">
        <h2 class="text-lg font-medium mb-4">
          Proxy Settings
        </h2>

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <label for="proxy-enabled" class="block text-sm font-medium text-gray-700">Enable Proxy</label>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" :class="[
                proxyEnabled ? 'bg-indigo-600' : 'bg-gray-200',
              ]"
              @click="proxyEnabled = !proxyEnabled"
            >
              <span
                aria-hidden="true"
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" :class="[
                  proxyEnabled ? 'translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>
          </div>

          <div>
            <label for="proxy-url" class="block text-sm font-medium text-gray-700 mb-1">Proxy URL</label>
            <input
              id="proxy-url"
              v-model="proxyUrl"
              type="text"
              :disabled="!proxyEnabled"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="http://localhost:8080"
            >
          </div>

          <div class="flex items-center justify-between">
            <label for="deprecation-warnings" class="block text-sm font-medium text-gray-700">Show Deprecation Warnings</label>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" :class="[
                showDeprecationWarnings ? 'bg-indigo-600' : 'bg-gray-200',
              ]"
              @click="showDeprecationWarnings = !showDeprecationWarnings"
            >
              <span
                aria-hidden="true"
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" :class="[
                  showDeprecationWarnings ? 'translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- API Key -->
      <div class="bg-white rounded-lg shadow p-4 md:col-span-2">
        <h2 class="text-lg font-medium mb-4">
          API Key
        </h2>

        <p class="text-sm text-gray-600 mb-4">
          Your API key is used to synchronize your requests and collections across devices.
          Keep this private and secure.
        </p>

        <div class="flex items-center space-x-2 mb-4">
          <input
            v-model="apiKey"
            :type="showApiKey ? 'text' : 'password'"
            readonly
            class="block w-full rounded-md border-gray-300 bg-gray-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
          <button
            class="p-2 text-gray-600 hover:text-gray-900"
            :title="showApiKey ? 'Hide API Key' : 'Show API Key'"
            @click="toggleApiKeyVisibility"
          >
            <span :class="showApiKey ? 'i-carbon-view-off' : 'i-carbon-view'" />
          </button>
          <button
            class="p-2 text-gray-600 hover:text-gray-900"
            title="Regenerate API Key"
            @click="regenerateApiKey"
          >
            <span class="i-carbon-renew" />
          </button>
        </div>
      </div>

      <!-- Data Management -->
      <div class="bg-white rounded-lg shadow p-4">
        <h2 class="text-lg font-medium mb-4">
          Data Management
        </h2>

        <div class="space-y-4">
          <button
            class="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
          >
            Export All Data
          </button>

          <button
            class="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
          >
            Import Data
          </button>

          <button
            class="w-full px-4 py-2 bg-white border border-red-300 text-red-700 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
          >
            Clear Request History
          </button>

          <button
            class="w-full px-4 py-2 bg-white border border-red-300 text-red-700 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
          >
            Reset All Settings
          </button>
        </div>
      </div>
    </div>

    <div class="mt-6 flex justify-end space-x-3">
      <button
        class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
        @click="resetSettings"
      >
        Reset
      </button>

      <button
        class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
        @click="saveSettings"
      >
        Save Settings
      </button>
    </div>
  </div>
</template>
