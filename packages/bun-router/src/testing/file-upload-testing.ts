import type { EnhancedRequest, UploadedFile } from '../types'
import type { TestFile } from './types'
import { mock } from 'bun:test'
import { createMockRequest } from './test-request'

/**
 * File upload testing utilities
 */
export class FileUploadTester {
  private request: EnhancedRequest
  private files: UploadedFile[]

  constructor(request?: EnhancedRequest) {
    this.request = request || createMockRequest()
    this.files = []
  }

  /**
   * Add a test file to the request
   */
  addFile(testFile: TestFile): FileUploadTester {
    const uploadedFile: UploadedFile = {
      fieldName: testFile.fieldName,
      originalName: testFile.filename,
      filename: `test-${Date.now()}-${testFile.filename}`,
      path: `/tmp/test-uploads/${testFile.filename}`,
      size: testFile.content instanceof ArrayBuffer
        ? testFile.content.byteLength
        : new TextEncoder().encode(testFile.content.toString()).length,
      mimetype: testFile.mimetype || this.detectMimeType(testFile.filename),
      buffer: testFile.content instanceof ArrayBuffer
        ? testFile.content
        : new TextEncoder().encode(testFile.content.toString()).buffer as ArrayBuffer,
    }

    this.files.push(uploadedFile)
    this.request.files = [...(this.request.files || []), uploadedFile]
    return this
  }

  /**
   * Add multiple test files
   */
  addFiles(testFiles: TestFile[]): FileUploadTester {
    testFiles.forEach(file => this.addFile(file))
    return this
  }

  /**
   * Create an image file for testing
   */
  addImage(fieldName: string, filename: string = 'test.jpg', size: number = 1024): FileUploadTester {
    const content = new ArrayBuffer(size)
    return this.addFile({
      fieldName,
      filename,
      content,
      mimetype: 'image/jpeg',
    })
  }

  /**
   * Create a document file for testing
   */
  addDocument(fieldName: string, filename: string = 'test.pdf', content: string = 'Test PDF content'): FileUploadTester {
    return this.addFile({
      fieldName,
      filename,
      content,
      mimetype: 'application/pdf',
    })
  }

  /**
   * Create a text file for testing
   */
  addTextFile(fieldName: string, filename: string = 'test.txt', content: string = 'Test content'): FileUploadTester {
    return this.addFile({
      fieldName,
      filename,
      content,
      mimetype: 'text/plain',
    })
  }

  /**
   * Create a large file for testing upload limits
   */
  addLargeFile(fieldName: string, sizeInMB: number = 10): FileUploadTester {
    const size = sizeInMB * 1024 * 1024
    const content = new ArrayBuffer(size)
    return this.addFile({
      fieldName,
      filename: `large-file-${sizeInMB}mb.bin`,
      content,
      mimetype: 'application/octet-stream',
    })
  }

  /**
   * Create a file with invalid extension
   */
  addInvalidFile(fieldName: string, filename: string = 'malicious.exe'): FileUploadTester {
    return this.addFile({
      fieldName,
      filename,
      content: 'Potentially malicious content',
      mimetype: 'application/x-executable',
    })
  }

  /**
   * Set form data alongside files
   */
  withFormData(data: Record<string, any>): FileUploadTester {
    this.request.formBody = { ...this.request.formBody, ...data }
    return this
  }

  /**
   * Get the configured request
   */
  getRequest(): EnhancedRequest {
    return this.request
  }

  /**
   * Get uploaded files
   */
  getFiles(): UploadedFile[] {
    return this.files
  }

  /**
   * Clear all files
   */
  clearFiles(): FileUploadTester {
    this.files = []
    this.request.files = []
    return this
  }

  private detectMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
      zip: 'application/zip',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    return mimeTypes[ext || ''] || 'application/octet-stream'
  }
}

/**
 * File validation testing utilities
 */
export class FileValidationTester {
  /**
   * Test file size validation
   */
  static testFileSize(file: UploadedFile, maxSize: number): boolean {
    return file.size <= maxSize
  }

  /**
   * Test file type validation
   */
  static testFileType(file: UploadedFile, allowedTypes: string[]): boolean {
    return allowedTypes.includes(file.mimetype)
  }

  /**
   * Test file extension validation
   */
  static testFileExtension(file: UploadedFile, allowedExtensions: string[]): boolean {
    const ext = file.originalName.split('.').pop()?.toLowerCase()
    return ext ? allowedExtensions.includes(ext) : false
  }

  /**
   * Test filename validation (security)
   */
  static testFilename(file: UploadedFile): boolean {
    const filename = file.originalName
    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return false
    }
    // Check for null bytes
    if (filename.includes('\0')) {
      return false
    }
    // Check for reserved names (Windows)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
    const baseName = filename.split('.')[0].toUpperCase()
    if (reservedNames.includes(baseName)) {
      return false
    }
    return true
  }

  /**
   * Test image file validation
   */
  static testImageFile(file: UploadedFile): boolean {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    return imageTypes.includes(file.mimetype)
  }

  /**
   * Test document file validation
   */
  static testDocumentFile(file: UploadedFile): boolean {
    const documentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
    ]
    return documentTypes.includes(file.mimetype)
  }
}

/** Middleware function type */
export type MiddlewareFn = (req: EnhancedRequest, next: () => Promise<Response>) => Promise<Response>

/** File storage service interface */
export interface FileStorageService {
  store: (file: UploadedFile, path?: string) => Promise<string>
  delete: (path: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  getUrl: (path: string) => string
}

/** Virus scanner interface */
export interface VirusScanResult {
  clean: boolean
  threat?: string
}

export interface VirusScanner {
  scan: (file: UploadedFile) => Promise<VirusScanResult>
}

/** Validation middleware options */
export interface ValidationMiddlewareOptions {
  maxSize?: number
  allowedTypes?: string[]
  maxFiles?: number
}

/** Image upload middleware options */
export interface ImageUploadMiddlewareOptions {
  maxSize?: number
  maxWidth?: number
  maxHeight?: number
}

/**
 * File upload mock factories
 */
export const fileUploadMocks: {
  validationMiddleware: (options?: ValidationMiddlewareOptions) => MiddlewareFn
  imageUploadMiddleware: (options?: ImageUploadMiddlewareOptions) => MiddlewareFn
  storageService: FileStorageService
  virusScanner: VirusScanner
} = {
  /**
   * Mock file upload middleware that validates files
   */
  validationMiddleware: (options: ValidationMiddlewareOptions = {}): MiddlewareFn => {
    const fn = async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      const files = req.files || []
      const { maxSize = 5 * 1024 * 1024, allowedTypes = [], maxFiles = 10 } = options

      // Check file count
      if (files.length > maxFiles) {
        return new Response(`Too many files. Maximum ${maxFiles} allowed.`, { status: 400 })
      }

      // Validate each file
      for (const file of files) {
        // Check file size
        if (file.size > maxSize) {
          return new Response(`File ${file.originalName} is too large. Maximum size: ${maxSize} bytes.`, { status: 400 })
        }

        // Check file type
        if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
          return new Response(`File type ${file.mimetype} not allowed.`, { status: 400 })
        }

        // Check filename security
        if (!FileValidationTester.testFilename(file)) {
          return new Response(`Invalid filename: ${file.originalName}`, { status: 400 })
        }
      }

      return await next()
    }
    return mock(fn) as MiddlewareFn
  },

  /**
   * Mock image upload middleware
   */
  imageUploadMiddleware: (options: ImageUploadMiddlewareOptions = {}): MiddlewareFn => {
    const fn = async (req: EnhancedRequest, next: () => Promise<Response>): Promise<Response> => {
      const files = req.files || []
      const { maxSize = 2 * 1024 * 1024 } = options

      for (const file of files) {
        if (!FileValidationTester.testImageFile(file)) {
          return new Response(`File ${file.originalName} is not a valid image.`, { status: 400 })
        }

        if (file.size > maxSize) {
          return new Response(`Image ${file.originalName} is too large.`, { status: 400 })
        }
      }

      return await next()
    }
    return mock(fn) as MiddlewareFn
  },

  /**
   * Mock file storage service
   */
  storageService: {
    store: mock(async (file: UploadedFile, path?: string): Promise<string> => {
      const storagePath = path || `/uploads/${Date.now()}-${file.filename}`
      return storagePath
    }),

    delete: mock(async (_path: string): Promise<void> => {
      // Mock file deletion
    }),

    exists: mock(async (path: string): Promise<boolean> => {
      return !path.includes('not-found')
    }),

    getUrl: mock((path: string): string => {
      return `https://example.com/storage${path}`
    }),
  },

  /**
   * Mock virus scanner
   */
  virusScanner: {
    scan: mock(async (file: UploadedFile): Promise<VirusScanResult> => {
      // Mock virus scanning - mark .exe files as threats
      if (file.originalName.endsWith('.exe') || file.mimetype === 'application/x-executable') {
        return { clean: false, threat: 'Potentially malicious executable' }
      }
      return { clean: true }
    }),
  },
}

/**
 * File upload test scenarios
 */
export const fileUploadScenarios = {
  /**
   * Test successful single file upload
   */
  singleFileUpload: (): FileUploadTester => {
    return new FileUploadTester()
      .addImage('avatar', 'profile.jpg')
      .withFormData({ description: 'Profile picture' })
  },

  /**
   * Test multiple file upload
   */
  multipleFileUpload: (): FileUploadTester => {
    return new FileUploadTester()
      .addImage('images', 'photo1.jpg')
      .addImage('images', 'photo2.png')
      .addDocument('documents', 'report.pdf')
      .withFormData({ album: 'vacation' })
  },

  /**
   * Test file size limit exceeded
   */
  fileSizeExceeded: (): FileUploadTester => {
    return new FileUploadTester()
      .addLargeFile('file', 50) // 50MB file
  },

  /**
   * Test invalid file type
   */
  invalidFileType: (): FileUploadTester => {
    return new FileUploadTester()
      .addInvalidFile('file', 'virus.exe')
  },

  /**
   * Test empty file upload
   */
  emptyFileUpload: (): FileUploadTester => {
    return new FileUploadTester()
      .addFile({
        fieldName: 'file',
        filename: 'empty.txt',
        content: '',
        mimetype: 'text/plain',
      })
  },

  /**
   * Test file with malicious filename
   */
  maliciousFilename: (): FileUploadTester => {
    return new FileUploadTester()
      .addFile({
        fieldName: 'file',
        filename: '../../../etc/passwd',
        content: 'malicious content',
        mimetype: 'text/plain',
      })
  },
}

/**
 * File upload assertion helpers
 */
export const fileUploadAssertions = {
  /**
   * Assert that request has files
   */
  hasFiles: (request: EnhancedRequest, count?: number): void => {
    const files = request.files || []
    if (count !== undefined && files.length !== count) {
      throw new Error(`Expected ${count} files, but got ${files.length}`)
    }
    if (files.length === 0) {
      throw new Error('Expected request to have files')
    }
  },

  /**
   * Assert that request has file with specific field name
   */
  hasFileWithField: (request: EnhancedRequest, fieldName: string): void => {
    const files = request.files || []
    const hasField = files.some(file => file.fieldName === fieldName)
    if (!hasField) {
      throw new Error(`Expected file with field name '${fieldName}'`)
    }
  },

  /**
   * Assert file properties
   */
  fileMatches: (file: UploadedFile, expected: Partial<UploadedFile>): void => {
    Object.entries(expected).forEach(([key, value]) => {
      if (file[key as keyof UploadedFile] !== value) {
        throw new Error(`Expected file.${key} to be '${value}', got '${file[key as keyof UploadedFile]}'`)
      }
    })
  },

  /**
   * Assert file size is within limits
   */
  fileSizeWithinLimit: (file: UploadedFile, maxSize: number): void => {
    if (file.size > maxSize) {
      throw new Error(`File size ${file.size} exceeds limit of ${maxSize}`)
    }
  },

  /**
   * Assert file type is allowed
   */
  fileTypeAllowed: (file: UploadedFile, allowedTypes: string[]): void => {
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`File type '${file.mimetype}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`)
    }
  },
}

/**
 * Factory functions
 */
export function createFileUploadTester(request?: EnhancedRequest): FileUploadTester {
  return new FileUploadTester(request)
}

/**
 * Helper to create test files
 */
export const testFiles = {
  image: (fieldName: string = 'image', filename: string = 'test.jpg'): TestFile => ({
    fieldName,
    filename,
    content: new ArrayBuffer(1024),
    mimetype: 'image/jpeg',
  }),

  document: (fieldName: string = 'document', filename: string = 'test.pdf'): TestFile => ({
    fieldName,
    filename,
    content: 'PDF content',
    mimetype: 'application/pdf',
  }),

  text: (fieldName: string = 'file', filename: string = 'test.txt', content: string = 'Test content'): TestFile => ({
    fieldName,
    filename,
    content,
    mimetype: 'text/plain',
  }),

  large: (fieldName: string = 'file', sizeInMB: number = 10): TestFile => ({
    fieldName,
    filename: `large-${sizeInMB}mb.bin`,
    content: new ArrayBuffer(sizeInMB * 1024 * 1024),
    mimetype: 'application/octet-stream',
  }),

  malicious: (fieldName: string = 'file'): TestFile => ({
    fieldName,
    filename: '../../../malicious.exe',
    content: 'malicious content',
    mimetype: 'application/x-executable',
  }),
}
