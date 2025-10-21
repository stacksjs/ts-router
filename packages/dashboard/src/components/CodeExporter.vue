<script setup lang="ts">
import type { RequestItem } from '../store/collectionsStore'
import { onMounted, ref } from 'vue'
import { generateCode, supportedLanguages } from '../utils/codeGenerator'

const props = defineProps<{
  request: RequestItem
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const selectedLanguage = ref('javascript')
const codeSnippet = ref('')
const copySuccess = ref(false)
const copyTimeout = ref<number | null>(null)

onMounted(() => {
  generateSnippet()
})

function generateSnippet() {
  codeSnippet.value = generateCode(props.request, selectedLanguage.value as any)
}

function copyToClipboard() {
  const codeElement = document.getElementById('code-snippet')
  if (!codeElement)
    return

  // Create a text area to copy from
  const textArea = document.createElement('textarea')
  textArea.value = codeSnippet.value
  document.body.appendChild(textArea)
  textArea.select()

  try {
    document.execCommand('copy')
    copySuccess.value = true

    // Reset copy success message after 2 seconds
    if (copyTimeout.value) {
      clearTimeout(copyTimeout.value)
    }
    copyTimeout.value = window.setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  }
  catch (err) {
    console.error('Failed to copy text: ', err)
  }

  document.body.removeChild(textArea)
}

function closeModal() {
  emit('close')
}

// Watch for language changes to update code snippet
function handleLanguageChange() {
  generateSnippet()
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
    <div class="relative bg-white rounded-lg shadow-xl mx-auto max-w-4xl w-full">
      <div class="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 class="text-lg font-medium text-gray-900">
          Export "{{ request.name }}" as Code
        </h2>
        <button
          class="text-gray-500 hover:text-gray-700"
          @click="closeModal"
        >
          <span class="i-carbon-close" />
        </button>
      </div>

      <div class="p-6">
        <div class="mb-6">
          <label for="language-select" class="block text-sm font-medium text-gray-700 mb-1">Select Language</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="language in supportedLanguages"
              :key="language.id"
              class="px-3 py-2 rounded-md border text-sm font-medium transition-colors"
              :class="selectedLanguage === language.id
                ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'"
              @click="selectedLanguage = language.id; handleLanguageChange()"
            >
              <span :class="language.icon" class="mr-1" />
              {{ language.name }}
            </button>
          </div>
        </div>

        <div class="mb-6">
          <div class="flex justify-between items-center mb-1">
            <label for="code-snippet" class="block text-sm font-medium text-gray-700">Code Snippet</label>
            <button
              class="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
              @click="copyToClipboard"
            >
              <span class="i-carbon-copy mr-1" />
              {{ copySuccess ? 'Copied!' : 'Copy to Clipboard' }}
            </button>
          </div>

          <div class="relative bg-gray-800 rounded-md overflow-hidden">
            <pre id="code-snippet" class="p-4 text-gray-100 overflow-x-auto text-sm font-mono whitespace-pre">{{ codeSnippet }}</pre>
          </div>
        </div>

        <div class="bg-gray-50 p-4 rounded-md text-sm text-gray-600">
          <p class="mb-2">
            <span class="i-carbon-information text-blue-500 mr-1" /> <strong>Usage Notes:</strong>
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>You may need to install dependencies mentioned in the code snippet.</li>
            <li>Replace any placeholder values (like API keys) before running.</li>
            <li>Modify error handling as needed for your application.</li>
          </ul>
        </div>
      </div>

      <div class="p-4 border-t border-gray-200 flex justify-end">
        <button
          class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
          @click="closeModal"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
