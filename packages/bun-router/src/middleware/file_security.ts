import type { UploadedFile } from './file_upload'

export interface FileSecurityConfig {
  scanForMalware?: boolean
  checkMagicNumbers?: boolean
  sanitizeFilenames?: boolean
  preventExecutableUploads?: boolean
  maxFilenameLength?: number
}

export default class FileSecurity {
  private config: Required<FileSecurityConfig>

  // Common file signatures (magic numbers)
  private readonly FILE_SIGNATURES: Record<string, Uint8Array[]> = {
    'image/jpeg': [
      new Uint8Array([0xFF, 0xD8, 0xFF]),
    ],
    'image/png': [
      new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    ],
    'image/gif': [
      new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]),
      new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    ],
    'application/pdf': [
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    ],
    'application/zip': [
      new Uint8Array([0x50, 0x4B, 0x03, 0x04]),
      new Uint8Array([0x50, 0x4B, 0x05, 0x06]),
      new Uint8Array([0x50, 0x4B, 0x07, 0x08]),
    ],
  }

  // Dangerous file extensions
  private readonly EXECUTABLE_EXTENSIONS = [
    '.exe',
    '.bat',
    '.cmd',
    '.com',
    '.pif',
    '.scr',
    '.vbs',
    '.js',
    '.jar',
    '.app',
    '.deb',
    '.pkg',
    '.dmg',
    '.sh',
    '.ps1',
    '.msi',
    '.dll',
  ]

  constructor(config: FileSecurityConfig = {}) {
    this.config = {
      scanForMalware: config.scanForMalware ?? false,
      checkMagicNumbers: config.checkMagicNumbers ?? true,
      sanitizeFilenames: config.sanitizeFilenames ?? true,
      preventExecutableUploads: config.preventExecutableUploads ?? true,
      maxFilenameLength: config.maxFilenameLength ?? 255,
    }
  }

  validateFile(file: UploadedFile): { isValid: boolean, errors: string[] } {
    const errors: string[] = []

    // Check filename length
    if (file.originalName.length > this.config.maxFilenameLength) {
      errors.push(`Filename too long (max ${this.config.maxFilenameLength} characters)`)
    }

    // Check for dangerous filename patterns (but don't reject if we're sanitizing)
    if (this.config.sanitizeFilenames) {
      const sanitizedName = this.sanitizeFilename(file.originalName)
      // Only error if sanitization results in empty filename
      if (!sanitizedName || sanitizedName.length === 0) {
        errors.push('Filename is invalid or empty after sanitization')
      }
    }

    // Check for executable files
    if (this.config.preventExecutableUploads) {
      const extension = this.getFileExtension(file.originalName).toLowerCase()
      if (this.EXECUTABLE_EXTENSIONS.includes(extension)) {
        errors.push('Executable files are not allowed')
      }
    }

    // Validate file signature (magic numbers)
    if (this.config.checkMagicNumbers) {
      const isValidSignature = this.validateFileSignature(file)
      if (!isValidSignature) {
        errors.push('File signature does not match declared MIME type')
      }
    }

    // Basic malware scan (simple heuristics)
    if (this.config.scanForMalware) {
      const malwareDetected = this.basicMalwareScan(file)
      if (malwareDetected) {
        errors.push('Potential malware detected')
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  private validateFileSignature(file: UploadedFile): boolean {
    const signatures = this.FILE_SIGNATURES[file.mimetype]
    if (!signatures) {
      // If we don't have signatures for this MIME type, allow it
      return true
    }

    const fileBuffer = new Uint8Array(file.buffer.slice(0, 16)) // Check first 16 bytes

    return signatures.some((signature) => {
      if (fileBuffer.length < signature.length)
        return false

      for (let i = 0; i < signature.length; i++) {
        if (fileBuffer[i] !== signature[i])
          return false
      }
      return true
    })
  }

  private sanitizeFilename(filename: string): string {
    // Remove or replace dangerous characters
    return filename
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace dangerous chars with underscore
      .replace(/^\.+/, '') // Remove leading dots
      .replace(/\.+$/, '') // Remove trailing dots
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, this.config.maxFilenameLength) // Truncate if too long
  }

  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.')
    return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex)
  }

  private basicMalwareScan(file: UploadedFile): boolean {
    // Simple heuristic-based malware detection
    const buffer = new Uint8Array(file.buffer)
    const content = new TextDecoder('utf-8', { fatal: false }).decode(buffer)

    // Check for common malware patterns (very basic)
    const malwarePatterns = [
      /eval\s*\(/gi,
      /document\.write/gi,
      /window\.location/gi,
      /<script[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
    ]

    return malwarePatterns.some(pattern => pattern.test(content))
  }

  // Utility method to get safe filename
  getSafeFilename(originalName: string): string {
    return this.sanitizeFilename(originalName)
  }

  // Check if file type is allowed based on whitelist
  isAllowedFileType(mimetype: string, allowedTypes: string[]): boolean {
    if (allowedTypes.length === 0)
      return true
    return allowedTypes.includes(mimetype)
  }

  // Check file size limits
  isWithinSizeLimit(fileSize: number, maxSize: number): boolean {
    return fileSize <= maxSize
  }
}

export function createFileSecurity(config: FileSecurityConfig = {}): FileSecurity {
  return new FileSecurity(config)
}
