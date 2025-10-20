import { Router } from '../src'
import { fileUpload, singleFileUpload, imageUpload, documentUpload } from '../src/middleware'

const router = new Router()

// Basic file upload endpoint
router.post('/upload', fileUpload({
  destination: './uploads',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
}), async (req) => {
  const files = req.files
  const body = req.body

  return new Response(JSON.stringify({
    message: 'Files uploaded successfully',
    files: files.map(f => ({
      originalName: f.originalName,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype,
    })),
    fields: body,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// Single file upload (e.g., profile avatar)
router.post('/upload/avatar', singleFileUpload('avatar', {
  destination: './uploads/avatars',
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxFileSize: 2 * 1024 * 1024, // 2MB
}), async (req) => {
  const file = req.files[0]

  return new Response(JSON.stringify({
    message: 'Avatar uploaded successfully',
    avatar: {
      filename: file.filename,
      path: file.path,
      size: file.size,
    },
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// Image upload with validation
router.post('/upload/images', imageUpload({
  destination: './uploads/images',
  maxFiles: 10,
  maxFileSize: 5 * 1024 * 1024, // 5MB per image
  generateUniqueFilename: true,
}), async (req) => {
  const images = req.files

  return new Response(JSON.stringify({
    message: `${images.length} images uploaded successfully`,
    images: images.map(img => ({
      originalName: img.originalName,
      filename: img.filename,
      size: img.size,
      url: `/images/${img.filename}`,
    })),
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// Document upload
router.post('/upload/documents', documentUpload({
  destination: './uploads/documents',
  maxFiles: 3,
  maxFileSize: 20 * 1024 * 1024, // 20MB
  preserveOriginalName: true,
}), async (req) => {
  const documents = req.files

  return new Response(JSON.stringify({
    message: 'Documents uploaded successfully',
    documents: documents.map(doc => ({
      originalName: doc.originalName,
      filename: doc.filename,
      size: doc.size,
      type: doc.mimetype,
    })),
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// Advanced upload with custom validation
router.post('/upload/advanced', fileUpload({
  destination: './uploads/advanced',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 20,
  allowedMimeTypes: [
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'text/plain', 'text/csv',
    'application/json',
  ],
  allowedExtensions: [
    '.jpg', '.jpeg', '.png', '.webp',
    '.pdf',
    '.txt', '.csv',
    '.json',
  ],
  generateUniqueFilename: true,
  preserveOriginalName: false,
  // Security options
  scanForMalware: true,
  checkMagicNumbers: true,
  sanitizeFilenames: true,
  preventExecutableUploads: true,
}), async (req) => {
  const files = req.files
  const metadata = req.body

  // Process files based on type
  const processedFiles = files.map(file => {
    const isImage = file.mimetype.startsWith('image/')
    const isPdf = file.mimetype === 'application/pdf'
    const isText = file.mimetype.startsWith('text/')

    return {
      id: file.filename.split('.')[0], // Use UUID part as ID
      originalName: file.originalName,
      filename: file.filename,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      category: isImage ? 'image' : isPdf ? 'document' : isText ? 'text' : 'other',
      url: `/files/${file.filename}`,
    }
  })

  return new Response(JSON.stringify({
    message: 'Advanced upload completed',
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    files: processedFiles,
    metadata,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// File serving endpoint
router.get('/files/:filename', async (req) => {
  const filename = req.params.filename
  const filePath = `./uploads/${filename}`

  try {
    const file = Bun.file(filePath)
    const exists = await file.exists()

    if (!exists) {
      return new Response('File not found', { status: 404 })
    }

    return new Response(file)
  } catch (error) {
    return new Response('Error serving file', { status: 500 })
  }
})

// Error handling example
router.post('/upload/with-error-handling', fileUpload({
  destination: './uploads',
  maxFileSize: 1024 * 1024, // 1MB - small limit for demo
  maxFiles: 2,
}), async (req) => {
  try {
    const files = req.files

    // Custom validation
    for (const file of files) {
      if (file.originalName.includes('test')) {
        return new Response(JSON.stringify({
          error: 'Files with "test" in name are not allowed',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({
      message: 'Upload successful',
      files: files.length,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Upload processing failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

export default router
