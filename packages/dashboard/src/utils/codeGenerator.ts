/**
 * Generates code snippets for API requests in different programming languages
 */

type Language = 'curl' | 'javascript' | 'python' | 'php' | 'java' | 'csharp' | 'go' | 'rust'

interface RequestData {
  method: string
  url: string
  headers: { key: string, value: string }[]
  body?: string
}

interface RequestItem {
  id: string
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  createdAt: string
  updatedAt: string
}

function escapeQuotes(str: string, quoteChar: string = '"'): string {
  if (quoteChar === '"') {
    return str.replace(/"/g, '\\"')
  }
  else if (quoteChar === '\'') {
    return str.replace(/'/g, '\\\'')
  }
  return str
}

/**
 * Generate a cURL command for the request
 */
function generateCurl(request: RequestData): string {
  const { method, url, headers, body } = request

  let cmd = `curl -X ${method} "${url}"`

  // Add headers
  headers.forEach((header) => {
    if (header.key.trim()) {
      cmd += ` \\\n  -H "${escapeQuotes(header.key)}: ${escapeQuotes(header.value)}"`
    }
  })

  // Add body if present
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    cmd += ` \\\n  -d '${escapeQuotes(body, '\'')}'`
  }

  return cmd
}

/**
 * Generate JavaScript (fetch) code for the request
 */
function generateJavaScript(request: RequestData): string {
  const { method, url, headers, body } = request

  let code = 'const options = {\n'
  code += `  method: "${method}",\n`

  // Add headers if present
  if (headers.length > 0) {
    code += '  headers: {\n'
    headers.forEach((header) => {
      if (header.key.trim()) {
        code += `    "${escapeQuotes(header.key)}": "${escapeQuotes(header.value)}",\n`
      }
    })
    code += '  },\n'
  }

  // Add body if present
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    code += `  body: ${body.trim().startsWith('{') ? body : `"${escapeQuotes(body)}"`}\n`
  }
  else {
    code = `${code.slice(0, -2)}\n` // Remove trailing comma
  }

  code += '};\n\n'
  code += `fetch("${url}", options)\n`
  code += '  .then(response => response.json())\n'
  code += '  .then(data => console.log(data))\n'
  code += '  .catch(error => console.error(error));'

  return code
}

/**
 * Generate Python (requests) code for the request
 */
function generatePython(request: RequestData): string {
  const { method, url, headers, body } = request

  let code = 'import requests\n\n'

  // Add headers if present
  if (headers.length > 0) {
    code += 'headers = {\n'
    headers.forEach((header) => {
      if (header.key.trim()) {
        code += `    "${escapeQuotes(header.key)}": "${escapeQuotes(header.value)}",\n`
      }
    })
    code += '}\n\n'
  }
  else {
    code += 'headers = {}\n\n'
  }

  // Prepare body if present
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    if (body.trim().startsWith('{')) {
      code += 'import json\n'
      code += 'data = json.loads(\'\'\''
      code += body
      code += '\'\'\')\n\n'
    }
    else {
      code += `data = "${escapeQuotes(body)}"\n\n`
    }
    code += `response = requests.${method.toLowerCase()}("${url}", headers=headers, json=data)\n`
  }
  else {
    code += `response = requests.${method.toLowerCase()}("${url}", headers=headers)\n`
  }

  code += '\n# Print response\n'
  code += 'print(response.status_code)\n'
  code += 'print(response.json())'

  return code
}

/**
 * Generate PHP code for the request
 */
function generatePhp(request: RequestData): string {
  const { method, url, headers, body } = request

  let code = '<?php\n\n'
  code += '$curl = curl_init();\n\n'
  code += 'curl_setopt_array($curl, [\n'
  code += `    CURLOPT_URL => "${url}",\n`
  code += '    CURLOPT_RETURNTRANSFER => true,\n'
  code += `    CURLOPT_CUSTOMREQUEST => "${method}",\n`

  // Add headers if present
  if (headers.length > 0) {
    code += '    CURLOPT_HTTPHEADER => [\n'
    headers.forEach((header) => {
      if (header.key.trim()) {
        code += `        "${escapeQuotes(header.key)}: ${escapeQuotes(header.value)}",\n`
      }
    })
    code += '    ],\n'
  }

  // Add body if present
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    code += `    CURLOPT_POSTFIELDS => '${escapeQuotes(body, '\'')}',\n`
  }

  code += ']);\n\n'
  code += '$response = curl_exec($curl);\n'
  code += '$error = curl_error($curl);\n\n'
  code += 'curl_close($curl);\n\n'
  code += 'if ($error) {\n'
  code += '    echo "cURL Error: " . $error;\n'
  code += '} else {\n'
  code += '    echo $response;\n'
  code += '}\n'

  return code
}

/**
 * Generate C# code for the request
 */
function generateCSharp(request: RequestData): string {
  const { method, url, headers, body } = request

  let code = 'using System;\n'
  code += 'using System.Net.Http;\n'
  code += 'using System.Text;\n'
  code += 'using System.Threading.Tasks;\n\n'

  code += 'class Program\n{\n'
  code += '    static async Task Main()\n'
  code += '    {\n'
  code += '        using var client = new HttpClient();\n\n'

  // Add headers
  headers.forEach((header) => {
    if (header.key.trim()) {
      code += `        client.DefaultRequestHeaders.Add("${escapeQuotes(header.key)}", "${escapeQuotes(header.value)}");\n`
    }
  })

  if (headers.length > 0) {
    code += '\n'
  }

  // Add request
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    code += '        var content = new StringContent(\n'
    code += `            @"${escapeQuotes(body)}",\n`
    code += '            Encoding.UTF8,\n'

    // Try to determine content type from headers
    const contentTypeHeader = headers.find(h => h.key.toLowerCase() === 'content-type')
    if (contentTypeHeader) {
      code += `            "${escapeQuotes(contentTypeHeader.value)}"\n`
    }
    else {
      code += '            "application/json"\n'
    }
    code += '        );\n\n'

    code += `        var response = await client.${method.charAt(0) + method.slice(1).toLowerCase()}Async("${url}", content);\n`
  }
  else {
    code += `        var response = await client.${method.charAt(0) + method.slice(1).toLowerCase()}Async("${url}");\n`
  }

  code += '\n        var responseContent = await response.Content.ReadAsStringAsync();\n'
  code += '        Console.WriteLine(responseContent);\n'
  code += '    }\n'
  code += '}'

  return code
}

/**
 * Generate Go code for the request
 */
function generateGo(request: RequestData): string {
  const { method, url, headers, body } = request

  let code = 'package main\n\n'
  code += 'import (\n'
  code += '    "fmt"\n'
  code += '    "io/ioutil"\n'
  code += '    "net/http"\n'
  code += '    "strings"\n'
  code += ')\n\n'

  code += 'func main() {\n'

  // Prepare the body
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    code += `    payload := strings.NewReader(\`${body}\`)\n\n`
    code += `    req, err := http.NewRequest("${method}", "${url}", payload)\n`
  }
  else {
    code += `    req, err := http.NewRequest("${method}", "${url}", nil)\n`
  }

  code += '    if err != nil {\n'
  code += '        fmt.Println("Error creating request:", err)\n'
  code += '        return\n'
  code += '    }\n\n'

  // Add headers
  if (headers.length > 0) {
    headers.forEach((header) => {
      if (header.key.trim()) {
        code += `    req.Header.Add("${escapeQuotes(header.key)}", "${escapeQuotes(header.value)}")\n`
      }
    })
    code += '\n'
  }

  code += '    client := &http.Client{}\n'
  code += '    resp, err := client.Do(req)\n'
  code += '    if err != nil {\n'
  code += '        fmt.Println("Error sending request:", err)\n'
  code += '        return\n'
  code += '    }\n'
  code += '    defer resp.Body.Close()\n\n'

  code += '    body, err := ioutil.ReadAll(resp.Body)\n'
  code += '    if err != nil {\n'
  code += '        fmt.Println("Error reading response:", err)\n'
  code += '        return\n'
  code += '    }\n\n'

  code += '    fmt.Println("Status:", resp.Status)\n'
  code += '    fmt.Println("Response:", string(body))\n'
  code += '}'

  return code
}

/**
 * Convert RequestItem to RequestData format
 */
function convertRequestItem(request: RequestItem): RequestData {
  return {
    method: request.method,
    url: request.url,
    headers: Object.entries(request.headers).map(([key, value]) => ({ key, value })),
    body: request.body,
  }
}

/**
 * Generate a code snippet based on the language and request data
 */
export function generateCode(request: RequestItem, language: Language): string {
  const requestData = convertRequestItem(request)
  
  switch (language) {
    case 'curl':
      return generateCurl(requestData)
    case 'javascript':
      return generateJavaScript(requestData)
    case 'python':
      return generatePython(requestData)
    case 'php':
      return generatePhp(requestData)
    case 'csharp':
      return generateCSharp(requestData)
    case 'go':
      return generateGo(requestData)
    default:
      throw new Error(`Language ${language} not supported`)
  }
}

export const supportedLanguages: { id: Language, name: string, icon: string }[] = [
  { id: 'curl', name: 'cURL', icon: 'i-carbon-terminal' },
  { id: 'javascript', name: 'JavaScript', icon: 'i-carbon-logo-javascript' },
  { id: 'python', name: 'Python', icon: 'i-carbon-logo-python' },
  { id: 'php', name: 'PHP', icon: 'i-carbon-logo-php' },
  { id: 'csharp', name: 'C#', icon: 'i-carbon-logo-c-sharp' },
  { id: 'go', name: 'Go', icon: 'i-carbon-logo-go' },
]
