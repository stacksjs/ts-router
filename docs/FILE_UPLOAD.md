# File Upload Handling

The bun-router provides comprehensive file upload handling through middleware that supports multipart/form-data requests with advanced security features, validation, and flexible configuration options.

## Features

- **Multiple file uploads** with configurable limits
- **File type validation** by MIME type and extension
- **Size limits** per file and total upload
- **Security scanning** including malware detection and magic number validation
- **Filename sanitization** to prevent path traversal attacks
- **Executable file prevention** to block dangerous file types
- **Flexible storage** with custom destination paths
- **Unique filename generation** with UUID support
- **Form field handling** alongside file uploads

## Basic Usage

```typescript
import { Router, fileUpload } from 'bun-router'

const router = new Router()

router.post('/upload', fileUpload({
  destination: './uploads',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
}), async (req) => {
  const files = req.files // Array of uploaded files
  const body = req.body   // Form fields
  
  return new Response(JSON.stringify({
    message: 'Files uploaded successfully',
    count: files.length,
  }))
})
```

## Configuration Options

### FileUploadConfig

```typescript
interface FileUploadConfig {
  // Storage options
  destination?: string              // Upload directory (default: './uploads')
  createDestination?: boolean       // Create directory if not exists (default: true)
  
  // File limits
  maxFileSize?: number             // Max file size in bytes (default: 10MB)
  maxFiles?: number                // Max number of files (default: 10)
  
  // File type validation
  allowedMimeTypes?: string[]      // Allowed MIME types (default: all)
  allowedExtensions?: string[]     // Allowed file extensions (default: all)
  
  // Filename handling
  preserveOriginalName?: boolean   // Keep original filename (default: false)
  generateUniqueFilename?: boolean // Generate UUID filenames (default: true)
  
  // Security options
  scanForMalware?: boolean         // Basic malware scanning (default: false)
  checkMagicNumbers?: boolean      // Validate file signatures (default: true)
  sanitizeFilenames?: boolean      // Sanitize filenames (default: true)
  preventExecutableUploads?: boolean // Block executable files (default: true)
  maxFilenameLength?: number       // Max filename length (default: 255)
}
```

## Factory Functions

### Basic File Upload

```typescript
import { fileUpload } from 'bun-router'

router.post('/upload', fileUpload({
  destination: './uploads',
  maxFileSize: 5 * 1024 * 1024, // 5MB
}), handler)
```

### Single File Upload

```typescript
import { singleFileUpload } from 'bun-router'

router.post('/avatar', singleFileUpload('avatar', {
  destination: './uploads/avatars',
  maxFileSize: 2 * 1024 * 1024, // 2MB
}), handler)
```

### Image Upload

```typescript
import { imageUpload } from 'bun-router'

router.post('/images', imageUpload({
  destination: './uploads/images',
  maxFiles: 10,
}), handler)
```

### Document Upload

```typescript
import { documentUpload } from 'bun-router'

router.post('/documents', documentUpload({
  destination: './uploads/docs',
  maxFileSize: 20 * 1024 * 1024, // 20MB
}), handler)
```

## Request Enhancement

The middleware enhances the request object with:

### `req.files`

Array of `UploadedFile` objects:

```typescript
interface UploadedFile {
  fieldName: string      // Form field name
  originalName: string   // Original filename
  filename: string       // Stored filename (may be different if unique generation enabled)
  path: string          // Full file path
  size: number          // File size in bytes
  mimetype: string      // MIME type
  buffer: ArrayBuffer   // File content buffer
}
```

### `req.body`

Object containing form fields (non-file data):

```typescript
// For form with: <input name="title" value="My Upload">
req.body.title // "My Upload"

// For multiple values: <input name="tags" value="tag1"> <input name="tags" value="tag2">
req.body.tags // ["tag1", "tag2"]
```

## Security Features

### File Type Validation

```typescript
router.post('/secure-upload', fileUpload({
  allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf'],
}), handler)
```

### Magic Number Validation

Validates file signatures to ensure files match their declared MIME types:

```typescript
router.post('/validated-upload', fileUpload({
  checkMagicNumbers: true, // Default: true
}), handler)
```

### Malware Scanning

Basic heuristic-based malware detection:

```typescript
router.post('/scanned-upload', fileUpload({
  scanForMalware: true,
}), handler)
```

### Executable File Prevention

Blocks dangerous file extensions:

```typescript
router.post('/safe-upload', fileUpload({
  preventExecutableUploads: true, // Default: true
}), handler)
```

### Filename Sanitization

Removes dangerous characters and path traversal attempts:

```typescript
router.post('/sanitized-upload', fileUpload({
  sanitizeFilenames: true, // Default: true
}), handler)
```

## Error Handling

The middleware returns appropriate HTTP status codes:

- **400 Bad Request**: Validation failures, too many files, security issues
- **413 Payload Too Large**: File size exceeds limit
- **415 Unsupported Media Type**: Invalid file type or extension
- **500 Internal Server Error**: Upload processing failures

```typescript
router.post('/upload', fileUpload(), async (req) => {
  try {
    const files = req.files
    
    // Process files
    for (const file of files) {
      console.log(`Uploaded: ${file.originalName} (${file.size} bytes)`)
    }
    
    return new Response(JSON.stringify({ success: true }))
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Processing failed',
      details: error.message 
    }), { status: 500 })
  }
})
```

## Advanced Examples

### Multi-step Upload Processing

```typescript
router.post('/process-upload', fileUpload({
  destination: './temp-uploads',
  maxFiles: 5,
}), async (req) => {
  const files = req.files
  const processedFiles = []
  
  for (const file of files) {
    // Validate file content
    if (file.mimetype.startsWith('image/')) {
      // Process image (resize, optimize, etc.)
      const processedPath = await processImage(file.path)
      processedFiles.push({ ...file, processedPath })
    } else if (file.mimetype === 'application/pdf') {
      // Extract text from PDF
      const text = await extractPdfText(file.path)
      processedFiles.push({ ...file, extractedText: text })
    }
  }
  
  return new Response(JSON.stringify({
    message: 'Files processed successfully',
    files: processedFiles,
  }))
})
```

### Upload with Database Integration

```typescript
import { db } from './database'

router.post('/upload-with-db', fileUpload({
  destination: './uploads',
}), async (req) => {
  const files = req.files
  const { title, description } = req.body
  
  // Save file metadata to database
  const uploadRecord = await db.uploads.create({
    title,
    description,
    files: files.map(f => ({
      originalName: f.originalName,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype,
      path: f.path,
    })),
    uploadedAt: new Date(),
  })
  
  return new Response(JSON.stringify({
    message: 'Upload saved successfully',
    uploadId: uploadRecord.id,
  }))
})
```

### Streaming Large Files

```typescript
router.post('/stream-upload', fileUpload({
  destination: './large-uploads',
  maxFileSize: 100 * 1024 * 1024, // 100MB
}), async (req) => {
  const files = req.files
  
  // For very large files, consider streaming processing
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) { // 50MB+
      // Stream process large file
      await processLargeFileInChunks(file.path)
    }
  }
  
  return new Response(JSON.stringify({
    message: 'Large files processed successfully',
  }))
})
```

## File Serving

Serve uploaded files securely:

```typescript
router.get('/files/:filename', async (req) => {
  const filename = req.params.filename
  
  // Validate filename to prevent path traversal
  if (filename.includes('..') || filename.includes('/')) {
    return new Response('Invalid filename', { status: 400 })
  }
  
  const filePath = `./uploads/${filename}`
  const file = Bun.file(filePath)
  
  if (!(await file.exists())) {
    return new Response('File not found', { status: 404 })
  }
  
  return new Response(file)
})
```

## Testing

```typescript
import { describe, it, expect } from 'bun:test'
import { fileUpload } from 'bun-router'

describe('File Upload', () => {
  it('should handle file upload', async () => {
    const formData = new FormData()
    formData.append('file', new File(['test'], 'test.txt'))
    
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: formData,
    })
    
    const middleware = fileUpload({ destination: './test-uploads' })
    const response = await middleware.handle(request, async () => {
      expect(request.files).toHaveLength(1)
      expect(request.files[0].originalName).toBe('test.txt')
      return new Response('OK')
    })
    
    expect(response.status).toBe(200)
  })
})
```

## Best Practices

1. **Always validate file types** and sizes appropriate for your use case
2. **Use unique filenames** to prevent conflicts and security issues
3. **Implement proper error handling** for upload failures
4. **Store files outside** the web root when possible
5. **Scan uploads** for malware in production environments
6. **Set reasonable limits** on file size and count
7. **Clean up temporary files** after processing
8. **Use HTTPS** for file uploads containing sensitive data
9. **Implement rate limiting** to prevent abuse
10. **Log upload activities** for security monitoring

## Integration with Other Middleware

File upload middleware works seamlessly with other bun-router middleware:

```typescript
import { Router, auth, rateLimit, fileUpload } from 'bun-router'

const router = new Router()

router.post('/protected-upload',
  auth(), // Require authentication
  rateLimit({ max: 10, timeWindow: 60000 }), // Rate limiting
  fileUpload({ maxFiles: 3 }), // File upload
  async (req) => {
    // Handle authenticated, rate-limited file upload
    return new Response('Upload successful')
  }
)
```
