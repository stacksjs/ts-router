<script setup lang="ts">
import { computed, ref } from 'vue'
import { generateCode, supportedLanguages } from '../utils/codeGenerator'

const props = defineProps<{
  method: string
  url: string
  headers: { key: string, value: string }[]
  body?: string
  show: boolean
}>()

const emit = defineEmits(['close'])

const selectedLanguage = ref(supportedLanguages[0].id)
const showCopied = ref(false)

const generatedCode = computed(() => {
  if (!props.show)
    return ''

  try {
    return generateCode(selectedLanguage.value, {
      method: props.method,
      url: props.url,
      headers: props.headers.filter(h => h.key.trim() !== ''),
      body: props.body,
    })
  }
  catch (error) {
    console.error('Error generating code:', error)
    return '// Error generating code'
  }
})

function copyCode() {
  navigator.clipboard.writeText(generatedCode.value)
    .then(() => {
      showCopied.value = true
      setTimeout(() => {
        showCopied.value = false
      }, 2000)
    })
    .catch((err) => {
      console.error('Failed to copy: ', err)
    })
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="emit('close')" />

      <!-- Modal panel -->
      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="sm:flex sm:items-start">
            <div class="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 id="modal-title" class="text-lg leading-6 font-medium text-gray-900">
                Code Snippet
              </h3>

              <div class="mt-4">
                <div class="flex justify-between items-center mb-3">
                  <div class="flex space-x-2">
                    <button
                      v-for="language in supportedLanguages"
                      :key="language.id"
                      class="px-3 py-1 text-sm rounded"
                      :class="selectedLanguage === language.id
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'"
                      @click="selectedLanguage = language.id"
                    >
                      {{ language.name }}
                    </button>
                  </div>

                  <button
                    class="relative px-3 py-1 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                    @click="copyCode"
                  >
                    <span v-if="showCopied" class="absolute -top-8 right-0 bg-gray-800 text-white px-2 py-1 text-xs rounded">
                      Copied!
                    </span>
                    <span class="i-carbon-copy mr-1" />
                    Copy
                  </button>
                </div>

                <pre class="bg-gray-800 text-white p-4 rounded-md max-h-96 overflow-y-auto text-sm font-mono">{{ generatedCode }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            type="button"
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            @click="emit('close')"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
