import type { EnhancedRequest, NextFunction } from '../types'
import type { FileSecurityConfig } from './file_security'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import FileSecurity from './file_security'

export interface UploadedFile {
  fieldName: string
  originalName: string
  filename: string
  path: string
  size: number
  mimetype: string
  buffer: ArrayBuffer
}

export interface FileUploadConfig extends FileSecurityConfig {
  destination?: string
  maxFileSize?: number // in bytes
  maxFiles?: number
  allowedMimeTypes?: string[]
  allowedExtensions?: string[]
  preserveOriginalName?: boolean
  generateUniqueFilename?: boolean
  createDestination?: boolean
}

export interface FileUploadOptions extends FileUploadConfig {
  fieldName?: string | string[]
}

export default class FileUpload {
  private config: Required<FileUploadConfig>

  private fileSecurity: FileSecurity

  constructor(config: FileUploadConfig = {}) {
    this.config = {
      destination: config.destination || './uploads',
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB default
      maxFiles: config.maxFiles || 10,
      allowedMimeTypes: config.allowedMimeTypes || [],
      allowedExtensions: config.allowedExtensions || [],
      preserveOriginalName: config.preserveOriginalName ?? false,
      generateUniqueFilename: config.generateUniqueFilename ?? true,
      createDestination: config.createDestination ?? true,
      scanForMalware: config.scanForMalware ?? false,
      checkMagicNumbers: config.checkMagicNumbers ?? true,
      sanitizeFilenames: config.sanitizeFilenames ?? true,
      preventExecutableUploads: config.preventExecutableUploads ?? true,
      maxFilenameLength: config.maxFilenameLength ?? 255,
    }

    this.fileSecurity = new FileSecurity(config)

    // Create destination directory if it doesn't exist
    if (this.config.createDestination && !existsSync(this.config.destination)) {
      mkdirSync(this.config.destination, { recursive: true })
    }
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    const contentType = req.headers.get('content-type')

    if (!contentType || !contentType.includes('multipart/form-data')) {
      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }

    try {
      const formData = await req.formData()
      const uploadedFiles: UploadedFile[] = []
      const fields: Record<string, any> = {}

      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          // Validate file count
          if (uploadedFiles.length >= this.config.maxFiles) {
            return this.createErrorResponse(`Maximum ${this.config.maxFiles} files allowed`, 400)
          }

          // Validate file size
          if (value.size > this.config.maxFileSize) {
            return this.createErrorResponse(
              `File ${value.name} exceeds maximum size of ${this.formatBytes(this.config.maxFileSize)}`,
              413,
            )
          }

          // Validate MIME type
          if (this.config.allowedMimeTypes.length > 0) {
            const baseType = value.type.split(';')[0] // Remove charset info
            if (!this.config.allowedMimeTypes.includes(baseType)) {
              return this.createErrorResponse(
                `File type ${baseType} not allowed. Allowed types: ${this.config.allowedMimeTypes.join(', ')}`,
                415,
              )
            }
          }

          // Validate file extension
          const fileExtension = extname(value.name).toLowerCase()
          if (this.config.allowedExtensions.length > 0 && !this.config.allowedExtensions.includes(fileExtension)) {
            return this.createErrorResponse(
              `File extension ${fileExtension} not allowed. Allowed extensions: ${this.config.allowedExtensions.join(', ')}`,
              415,
            )
          }

          // Generate filename
          const filename = this.generateFilename(value.name)
          const filePath = join(this.config.destination, filename)

          // Convert file to buffer and save
          const buffer = await value.arrayBuffer()

          const uploadedFile: UploadedFile = {
            fieldName: key,
            originalName: value.name,
            filename,
            path: filePath,
            size: value.size,
            mimetype: value.type,
            buffer,
          }

          // Validate file security
          const securityCheck = this.fileSecurity.validateFile(uploadedFile)
          if (!securityCheck.isValid) {
            return this.createErrorResponse(
              `Security validation failed: ${securityCheck.errors.join(', ')}`,
              400,
            )
          }

          writeFileSync(filePath, new Uint8Array(buffer))
          uploadedFiles.push(uploadedFile)
        }
        else {
          // Handle regular form fields
          if (fields[key]) {
            // Convert to array if multiple values
            if (Array.isArray(fields[key])) {
              fields[key].push(value)
            }
            else {
              fields[key] = [fields[key], value]
            }
          }
          else {
            fields[key] = value
          }
        }
      }

      // Attach files and fields to request
      Object.defineProperty(req, 'files', {
        value: uploadedFiles,
        writable: true,
        enumerable: true,
        configurable: true,
      })

      Object.defineProperty(req, 'formBody', {
        value: fields,
        writable: true,
        enumerable: true,
        configurable: true,
      })

      const response = await next()
      return response || new Response('Not Found', { status: 404 })
    }
    catch (error) {
      return this.createErrorResponse(
        `File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
      )
    }
  }

  private generateFilename(originalName: string): string {
    // Always sanitize the filename first
    const sanitizedName = this.fileSecurity.getSafeFilename(originalName)

    if (this.config.preserveOriginalName && !this.config.generateUniqueFilename) {
      return sanitizedName
    }

    const extension = extname(sanitizedName)
    const baseName = basename(sanitizedName, extension)

    if (this.config.generateUniqueFilename) {
      const uuid = randomUUID()
      return this.config.preserveOriginalName
        ? `${baseName}_${uuid}${extension}`
        : `${uuid}${extension}`
    }

    return sanitizedName
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0)
      return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }

  private createErrorResponse(message: string, status: number): Response {
    return new Response(
      JSON.stringify({ error: message }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

// Factory function for easier usage
export function fileUpload(config: FileUploadConfig = {}): FileUpload {
  return new FileUpload(config)
}

// Specialized factory functions
export function singleFileUpload(fieldName: string, config: FileUploadConfig = {}): FileUpload {
  return new FileUpload({ ...config, maxFiles: 1 })
}

export function multipleFileUpload(maxFiles: number = 10, config: FileUploadConfig = {}): FileUpload {
  return new FileUpload({ ...config, maxFiles })
}

export function imageUpload(config: FileUploadConfig = {}): FileUpload {
  return new FileUpload({
    ...config,
    allowedMimeTypes: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  })
}

export function documentUpload(config: FileUploadConfig = {}): FileUpload {
  return new FileUpload({
    ...config,
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    allowedExtensions: ['.pdf', '.doc', '.docx', '.txt'],
  })
}
