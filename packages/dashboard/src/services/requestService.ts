import { useEnvironmentStore } from '../store/environmentStore'

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  headers?: Record<string, string>
  body?: any
  timeout?: number
}

/**
 * Makes HTTP requests with environment variable substitution.
 * Any value in the form {{VARIABLE_NAME}} will be replaced with
 * the corresponding environment variable value if it exists.
 */
export const requestService = {
  /**
   * Process a string and replace any environment variables with their values
   * @param text The text to process
   * @returns The processed text with environment variables replaced
   */
  processEnvironmentVariables(text: string): string {
    const environmentStore = useEnvironmentStore()
    return environmentStore.resolveVariables(text)
  },

  /**
   * Process request headers and body for environment variables
   * @param options The request options
   * @returns New options with environment variables processed
   */
  processRequestOptions(options: RequestOptions): RequestOptions {
    const processedOptions = { ...options }

    // Process headers
    if (processedOptions.headers) {
      const processedHeaders: Record<string, string> = {}

      for (const [key, value] of Object.entries(processedOptions.headers)) {
        const processedKey = this.processEnvironmentVariables(key)
        const processedValue = this.processEnvironmentVariables(value)
        processedHeaders[processedKey] = processedValue
      }

      processedOptions.headers = processedHeaders
    }

    // Process body if it's a string
    if (typeof processedOptions.body === 'string') {
      processedOptions.body = this.processEnvironmentVariables(processedOptions.body)
    }

    return processedOptions
  },

  /**
   * Send an HTTP request with environment variable substitution
   * @param url The URL to send the request to
   * @param options The request options
   * @returns Promise with the response data
   */
  async sendRequest(url: string, options: RequestOptions): Promise<Response> {
    // Process URL for environment variables
    const processedUrl = this.processEnvironmentVariables(url)

    // Process request options
    const processedOptions = this.processRequestOptions(options)

    // Convert body to string if it's an object
    if (processedOptions.body && typeof processedOptions.body === 'object') {
      processedOptions.body = JSON.stringify(processedOptions.body)

      // Add content-type header if not present
      if (!processedOptions.headers?.['Content-Type']) {
        processedOptions.headers = {
          ...processedOptions.headers,
          'Content-Type': 'application/json',
        }
      }
    }

    // Set up timeout
    const timeout = processedOptions.timeout || 30000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      // Make the request
      const response = await fetch(processedUrl, {
        method: processedOptions.method,
        headers: processedOptions.headers,
        body: processedOptions.body,
        signal: controller.signal,
      })

      return response
    }
    finally {
      // Clear timeout
      clearTimeout(timeoutId)
    }
  },

  // Convenience methods for common HTTP methods
  async get(url: string, options: Omit<RequestOptions, 'method'> = {}): Promise<Response> {
    return this.sendRequest(url, { ...options, method: 'GET' })
  },

  async post(url: string, body: any, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<Response> {
    return this.sendRequest(url, { ...options, method: 'POST', body })
  },

  async put(url: string, body: any, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<Response> {
    return this.sendRequest(url, { ...options, method: 'PUT', body })
  },

  async delete(url: string, options: Omit<RequestOptions, 'method'> = {}): Promise<Response> {
    return this.sendRequest(url, { ...options, method: 'DELETE' })
  },

  async patch(url: string, body: any, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<Response> {
    return this.sendRequest(url, { ...options, method: 'PATCH', body })
  },
}
