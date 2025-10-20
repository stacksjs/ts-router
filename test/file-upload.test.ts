// @ts-nocheck
import type { EnhancedRequest, NextFunction } from '../packages/bun-router/src/types'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import FileUpload, { fileUpload, imageUpload, singleFileUpload } from '../packages/bun-router/src/middleware/file_upload'

describe('FileUpload Middleware', () => {
  let testDir: string
  let middleware: FileUpload
  let mockNext: NextFunction

  beforeEach(() => {
    testDir = join(tmpdir(), `test-uploads-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    middleware = new FileUpload({
      destination: testDir,
      maxFileSize: 1024 * 1024, // 1MB
      maxFiles: 5,
    })

    mockNext = async () => new Response('OK', { status: 200 })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('Constructor', () => {
    it('should create upload directory if it does not exist', () => {
      const newDir = join(tmpdir(), `new-uploads-${Date.now()}`)
      const _upload = new FileUpload({ destination: newDir })

      expect(existsSync(newDir)).toBe(true)
      rmSync(newDir, { recursive: true, force: true })
    })

    it('should use default configuration', () => {
      const upload = new FileUpload()
      expect(upload).toBeInstanceOf(FileUpload)
    })
  })

  describe('File Upload Handling', () => {
    it('should pass through non-multipart requests', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test: 'data' }),
      }) as EnhancedRequest

      const response = await middleware.handle(request, mockNext)
      expect(response.status).toBe(200)
    })

    it('should handle single file upload', async () => {
      const formData = new FormData()
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      formData.append('file', file)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await middleware.handle(request, async () => {
        if (!request.files || request.files.length === 0) {
          throw new Error('No files found in request')
        }
        expect(request.files).toBeDefined()
        expect(request.files).toHaveLength(1)
        expect(request.files[0].originalName).toBe('test.txt')
        expect(request.files[0].mimetype).toBe('text/plain;charset=utf-8')
        expect(request.files[0].size).toBe(12)
        return new Response('Upload successful', { status: 200 })
      })

      if (response.status !== 200) {
        const errorText = await response.text()
        console.error('Error response:', response.status, errorText)
      }
      expect(response.status).toBe(200)
    })

    it('should handle multiple file uploads', async () => {
      const formData = new FormData()
      const file1 = new File(['content 1'], 'file1.txt', { type: 'text/plain' })
      const file2 = new File(['content 2'], 'file2.txt', { type: 'text/plain' })
      formData.append('files', file1)
      formData.append('files', file2)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await middleware.handle(request, async () => {
        expect(request.files).toHaveLength(2)
        return new Response('Upload successful', { status: 200 })
      })

      expect(response.status).toBe(200)
    })

    it('should handle form fields alongside files', async () => {
      const formData = new FormData()
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      formData.append('file', file)
      formData.append('title', 'Test Upload')
      formData.append('description', 'A test file upload')

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await middleware.handle(request, async () => {
        expect(request.files).toHaveLength(1)
        expect(request.formBody).toBeDefined()
        expect(request.formBody!.title).toBe('Test Upload')
        expect(request.formBody!.description).toBe('A test file upload')
        return new Response('Upload successful', { status: 200 })
      })

      expect(response.status).toBe(200)
    })
  })

  describe('File Validation', () => {
    it('should reject files exceeding size limit', async () => {
      const largeContent = 'x'.repeat(2 * 1024 * 1024) // 2MB
      const formData = new FormData()
      const file = new File([largeContent], 'large.txt', { type: 'text/plain' })
      formData.append('file', file)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await middleware.handle(request, mockNext)
      expect(response.status).toBe(413)

      const errorData = await response.json() as { error: string }
      expect(errorData.error).toContain('exceeds maximum size')
    })

    it('should reject too many files', async () => {
      const formData = new FormData()
      for (let i = 0; i < 10; i++) {
        const file = new File([`content ${i}`], `file${i}.txt`, { type: 'text/plain' })
        formData.append('files', file)
      }

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await middleware.handle(request, mockNext)
      expect(response.status).toBe(400)

      const errorData = await response.json() as { error: string }
      expect(errorData.error).toContain('Maximum 5 files allowed')
    })

    it('should validate MIME types when specified', async () => {
      const restrictedMiddleware = new FileUpload({
        destination: testDir,
        allowedMimeTypes: ['image/jpeg', 'image/png'],
      })

      const formData = new FormData()
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      formData.append('file', file)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await restrictedMiddleware.handle(request, mockNext)
      expect(response.status).toBe(415)

      const errorData = await response.json() as { error: string }
      expect(errorData.error).toContain('File type text/plain not allowed')
    })

    it('should validate file extensions when specified', async () => {
      const restrictedMiddleware = new FileUpload({
        destination: testDir,
        allowedExtensions: ['.jpg', '.png'],
      })

      const formData = new FormData()
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      formData.append('file', file)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await restrictedMiddleware.handle(request, mockNext)
      expect(response.status).toBe(415)

      const errorData = await response.json() as { error: string }
      expect(errorData.error).toContain('File extension .txt not allowed')
    })
  })

  describe('Security Features', () => {
    it('should detect and reject executable files', async () => {
      const formData = new FormData()
      const file = new File(['malicious code'], 'malware.exe', { type: 'application/octet-stream' })
      formData.append('file', file)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await middleware.handle(request, mockNext)
      expect(response.status).toBe(400)

      const errorData = await response.json() as { error: string }
      expect(errorData.error).toContain('Security validation failed')
    })

    it('should sanitize filenames', async () => {
      const formData = new FormData()
      const file = new File(['test'], '../../../etc/passwd', { type: 'text/plain' })
      formData.append('file', file)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      const response = await middleware.handle(request, async () => {
        expect(request.files![0].originalName).toBe('../../../etc/passwd')
        expect(request.files![0].filename).not.toContain('../')
        expect(request.files![0].filename).not.toContain('/')
        return new Response('OK', { status: 200 })
      })

      if (response.status !== 200) {
        const errorText = await response.text()
        console.error('Sanitize filename error:', response.status, errorText)
      }
      expect(response.status).toBe(200)
    })
  })

  describe('Factory Functions', () => {
    it('should create middleware with fileUpload factory', () => {
      const upload = fileUpload({ maxFileSize: 500000 })
      expect(upload).toBeInstanceOf(FileUpload)
    })

    it('should create single file upload middleware', () => {
      const upload = singleFileUpload('avatar')
      expect(upload).toBeInstanceOf(FileUpload)
    })

    it('should create image upload middleware', () => {
      const upload = imageUpload()
      expect(upload).toBeInstanceOf(FileUpload)
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed form data', async () => {
      const request = new Request('http://localhost/upload', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=invalid' },
        body: 'invalid form data',
      }) as EnhancedRequest

      const response = await middleware.handle(request, mockNext)
      expect(response.status).toBe(500)

      const errorData = await response.json() as { error: string }
      expect(errorData.error).toContain('File upload failed')
    })
  })

  describe('File Storage', () => {
    it('should save files to specified destination', async () => {
      const formData = new FormData()
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      formData.append('file', file)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      await middleware.handle(request, async () => {
        const uploadedFile = request.files![0]
        expect(existsSync(uploadedFile.path)).toBe(true)
        return new Response('OK', { status: 200 })
      })
    })

    it('should generate unique filenames when configured', async () => {
      const uniqueMiddleware = new FileUpload({
        destination: testDir,
        generateUniqueFilename: true,
        preserveOriginalName: false,
      })

      const formData = new FormData()
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      formData.append('file', file)

      const request = new Request('http://localhost/upload', {
        method: 'POST',
        body: formData,
      }) as EnhancedRequest

      await uniqueMiddleware.handle(request, async () => {
        const uploadedFile = request.files![0]
        expect(uploadedFile.filename).not.toBe('test.txt')
        expect(uploadedFile.filename).toMatch(/^[a-f0-9-]+\.txt$/)
        return new Response('OK', { status: 200 })
      })
    })
  })
})
