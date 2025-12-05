/**
 * Request Signing Middleware
 *
 * Provides HMAC-based request signature verification for secure API authentication.
 * Supports multiple algorithms, timestamp validation, and replay attack prevention.
 */

import type { EnhancedRequest, Middleware, NextFunction } from '../types'

export type SignatureAlgorithm = 'sha256' | 'sha384' | 'sha512'

export interface RequestSigningOptions {
  /**
   * Secret key(s) for HMAC verification.
   * Can be a single key or a function that returns the key based on key ID.
   */
  secret: string | ((keyId: string) => string | Promise<string | null> | null)

  /**
   * HMAC algorithm to use
   * @default 'sha256'
   */
  algorithm?: SignatureAlgorithm

  /**
   * Header name containing the signature
   * @default 'X-Signature'
   */
  signatureHeader?: string

  /**
   * Header name containing the timestamp
   * @default 'X-Timestamp'
   */
  timestampHeader?: string

  /**
   * Header name containing the key ID (for multi-key setups)
   * @default 'X-Key-Id'
   */
  keyIdHeader?: string

  /**
   * Header name containing the nonce (for replay protection)
   * @default 'X-Nonce'
   */
  nonceHeader?: string

  /**
   * Maximum age of request in seconds (timestamp validation)
   * @default 300 (5 minutes)
   */
  maxAge?: number

  /**
   * Whether to require timestamp validation
   * @default true
   */
  requireTimestamp?: boolean

  /**
   * Whether to require nonce for replay protection
   * @default false
   */
  requireNonce?: boolean

  /**
   * Custom function to check if nonce has been used (for replay protection)
   */
  nonceStore?: NonceStore

  /**
   * Parts of the request to include in signature
   * @default ['method', 'path', 'timestamp', 'body']
   */
  signedParts?: SignedPart[]

  /**
   * Custom function to build the string to sign
   */
  stringToSign?: (req: EnhancedRequest, timestamp: string, nonce?: string) => Promise<string> | string

  /**
   * Custom error handler
   */
  onError?: (error: SignatureError, req: EnhancedRequest) => Response | Promise<Response>

  /**
   * Skip signature verification for certain paths
   */
  exclude?: string[] | ((req: EnhancedRequest) => boolean)

  /**
   * Additional headers to include in signature
   */
  signedHeaders?: string[]

  /**
   * Signature encoding format
   * @default 'hex'
   */
  encoding?: 'hex' | 'base64'
}

export type SignedPart = 'method' | 'path' | 'query' | 'timestamp' | 'body' | 'nonce' | 'headers'

export interface NonceStore {
  /**
   * Check if nonce exists (has been used)
   */
  has: (nonce: string) => Promise<boolean> | boolean

  /**
   * Store a nonce
   */
  set: (nonce: string, expiry?: number) => Promise<void> | void
}

export type SignatureErrorCode =
  | 'MISSING_SIGNATURE'
  | 'MISSING_TIMESTAMP'
  | 'MISSING_NONCE'
  | 'MISSING_KEY_ID'
  | 'INVALID_KEY'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_TIMESTAMP'
  | 'FUTURE_TIMESTAMP'
  | 'NONCE_REUSED'
  | 'SIGNATURE_MISMATCH'

export class SignatureError extends Error {
  public readonly code: SignatureErrorCode
  public readonly statusCode: number

  constructor(code: SignatureErrorCode, message: string) {
    super(message)
    this.name = 'SignatureError'
    this.code = code
    this.statusCode = 401
  }
}

/**
 * In-memory nonce store with automatic expiry
 */
export class InMemoryNonceStore implements NonceStore {
  private nonces = new Map<string, number>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(cleanupIntervalMs: number = 60000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs)
  }

  has(nonce: string): boolean {
    const expiry = this.nonces.get(nonce)
    if (expiry === undefined)
      return false
    if (Date.now() > expiry) {
      this.nonces.delete(nonce)
      return false
    }
    return true
  }

  set(nonce: string, expirySeconds: number = 300): void {
    this.nonces.set(nonce, Date.now() + expirySeconds * 1000)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [nonce, expiry] of this.nonces.entries()) {
      if (now > expiry) {
        this.nonces.delete(nonce)
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.nonces.clear()
  }
}

/**
 * Request Signing Middleware
 */
export default class RequestSigning implements Middleware {
  private options: Required<Omit<RequestSigningOptions, 'onError' | 'exclude' | 'nonceStore' | 'stringToSign'>> & {
    onError?: RequestSigningOptions['onError']
    exclude?: RequestSigningOptions['exclude']
    nonceStore?: NonceStore
    stringToSign?: RequestSigningOptions['stringToSign']
  }

  constructor(options: RequestSigningOptions) {
    this.options = {
      secret: options.secret,
      algorithm: options.algorithm ?? 'sha256',
      signatureHeader: options.signatureHeader ?? 'X-Signature',
      timestampHeader: options.timestampHeader ?? 'X-Timestamp',
      keyIdHeader: options.keyIdHeader ?? 'X-Key-Id',
      nonceHeader: options.nonceHeader ?? 'X-Nonce',
      maxAge: options.maxAge ?? 300,
      requireTimestamp: options.requireTimestamp ?? true,
      requireNonce: options.requireNonce ?? false,
      signedParts: options.signedParts ?? ['method', 'path', 'timestamp', 'body'],
      signedHeaders: options.signedHeaders ?? [],
      encoding: options.encoding ?? 'hex',
      onError: options.onError,
      exclude: options.exclude,
      nonceStore: options.nonceStore,
      stringToSign: options.stringToSign,
    }
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response | null> {
    // Check exclusions
    if (this.shouldSkip(req)) {
      return next()
    }

    try {
      await this.verifySignature(req)
      return next()
    }
    catch (error) {
      if (error instanceof SignatureError) {
        if (this.options.onError) {
          return this.options.onError(error, req)
        }
        return this.defaultErrorResponse(error)
      }
      throw error
    }
  }

  private shouldSkip(req: EnhancedRequest): boolean {
    if (!this.options.exclude)
      return false

    if (typeof this.options.exclude === 'function') {
      return this.options.exclude(req)
    }

    const url = new URL(req.url)
    return this.options.exclude.some(path =>
      url.pathname === path || url.pathname.startsWith(`${path}/`),
    )
  }

  private async verifySignature(req: EnhancedRequest): Promise<void> {
    // Get signature from header
    const signature = req.headers.get(this.options.signatureHeader)
    if (!signature) {
      throw new SignatureError('MISSING_SIGNATURE', `Missing ${this.options.signatureHeader} header`)
    }

    // Get and validate timestamp
    const timestamp = req.headers.get(this.options.timestampHeader)
    if (this.options.requireTimestamp) {
      if (!timestamp) {
        throw new SignatureError('MISSING_TIMESTAMP', `Missing ${this.options.timestampHeader} header`)
      }
      this.validateTimestamp(timestamp)
    }

    // Get and validate nonce
    const nonce = req.headers.get(this.options.nonceHeader)
    if (this.options.requireNonce) {
      if (!nonce) {
        throw new SignatureError('MISSING_NONCE', `Missing ${this.options.nonceHeader} header`)
      }
      await this.validateNonce(nonce)
    }

    // Get secret key
    const secret = await this.getSecret(req)
    if (!secret) {
      throw new SignatureError('INVALID_KEY', 'Invalid or missing API key')
    }

    // Build string to sign
    const stringToSign = await this.buildStringToSign(req, timestamp || '', nonce || undefined)

    // Calculate expected signature
    const expectedSignature = await this.calculateSignature(stringToSign, secret)

    // Compare signatures (timing-safe)
    if (!this.timingSafeEqual(signature, expectedSignature)) {
      throw new SignatureError('SIGNATURE_MISMATCH', 'Invalid signature')
    }

    // Store nonce if replay protection is enabled
    if (this.options.requireNonce && nonce && this.options.nonceStore) {
      await this.options.nonceStore.set(nonce, this.options.maxAge)
    }
  }

  private async getSecret(req: EnhancedRequest): Promise<string | null> {
    if (typeof this.options.secret === 'string') {
      return this.options.secret
    }

    const keyId = req.headers.get(this.options.keyIdHeader)
    if (!keyId) {
      throw new SignatureError('MISSING_KEY_ID', `Missing ${this.options.keyIdHeader} header`)
    }

    return this.options.secret(keyId)
  }

  private validateTimestamp(timestamp: string): void {
    const requestTime = Number.parseInt(timestamp, 10)

    if (Number.isNaN(requestTime)) {
      throw new SignatureError('EXPIRED_TIMESTAMP', 'Invalid timestamp format')
    }

    const now = Math.floor(Date.now() / 1000)
    const age = now - requestTime

    if (age > this.options.maxAge) {
      throw new SignatureError('EXPIRED_TIMESTAMP', `Request timestamp expired (${age}s old, max ${this.options.maxAge}s)`)
    }

    // Check for future timestamps (with small tolerance)
    if (age < -30) {
      throw new SignatureError('FUTURE_TIMESTAMP', 'Request timestamp is in the future')
    }
  }

  private async validateNonce(nonce: string): Promise<void> {
    if (!this.options.nonceStore) {
      return
    }

    const exists = await this.options.nonceStore.has(nonce)
    if (exists) {
      throw new SignatureError('NONCE_REUSED', 'Nonce has already been used (possible replay attack)')
    }
  }

  private async buildStringToSign(req: EnhancedRequest, timestamp: string, nonce?: string): Promise<string> {
    // Use custom string builder if provided
    if (this.options.stringToSign) {
      return this.options.stringToSign(req, timestamp, nonce)
    }

    const url = new URL(req.url)
    const parts: string[] = []

    for (const part of this.options.signedParts) {
      switch (part) {
        case 'method':
          parts.push(req.method.toUpperCase())
          break
        case 'path':
          parts.push(url.pathname)
          break
        case 'query':
          parts.push(url.search)
          break
        case 'timestamp':
          parts.push(timestamp)
          break
        case 'nonce':
          if (nonce)
            parts.push(nonce)
          break
        case 'body':
          if (req.body) {
            const body = await req.clone().text()
            parts.push(body)
          }
          break
        case 'headers':
          for (const header of this.options.signedHeaders) {
            const value = req.headers.get(header)
            if (value) {
              parts.push(`${header.toLowerCase()}:${value}`)
            }
          }
          break
      }
    }

    return parts.join('\n')
  }

  private async calculateSignature(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(data)

    const algorithmName = {
      sha256: 'SHA-256',
      sha384: 'SHA-384',
      sha512: 'SHA-512',
    }[this.options.algorithm]

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: algorithmName },
      false,
      ['sign'],
    )

    const signature = await crypto.subtle.sign('HMAC', key, messageData)

    if (this.options.encoding === 'base64') {
      return btoa(String.fromCharCode(...new Uint8Array(signature)))
    }

    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }

    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }

    return result === 0
  }

  private defaultErrorResponse(error: SignatureError): Response {
    return new Response(
      JSON.stringify({
        error: {
          code: error.code,
          message: error.message,
        },
      }),
      {
        status: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'HMAC-SHA256',
        },
      },
    )
  }
}

/**
 * Factory function to create request signing middleware
 */
export function requestSigning(options: RequestSigningOptions): RequestSigning {
  return new RequestSigning(options)
}

/**
 * Helper to sign a request (for clients)
 */
export async function signRequest(
  request: Request,
  secret: string,
  options: {
    algorithm?: SignatureAlgorithm
    signedParts?: SignedPart[]
    signedHeaders?: string[]
    signatureHeader?: string
    timestampHeader?: string
    nonceHeader?: string
    keyId?: string
    keyIdHeader?: string
    encoding?: 'hex' | 'base64'
  } = {},
): Promise<Request> {
  const {
    algorithm = 'sha256',
    signedParts = ['method', 'path', 'timestamp', 'body'],
    signedHeaders = [],
    signatureHeader = 'X-Signature',
    timestampHeader = 'X-Timestamp',
    nonceHeader = 'X-Nonce',
    keyId,
    keyIdHeader = 'X-Key-Id',
    encoding = 'hex',
  } = options

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomUUID()

  const url = new URL(request.url)
  const parts: string[] = []

  for (const part of signedParts) {
    switch (part) {
      case 'method':
        parts.push(request.method.toUpperCase())
        break
      case 'path':
        parts.push(url.pathname)
        break
      case 'query':
        parts.push(url.search)
        break
      case 'timestamp':
        parts.push(timestamp)
        break
      case 'nonce':
        parts.push(nonce)
        break
      case 'body':
        if (request.body) {
          const body = await request.clone().text()
          parts.push(body)
        }
        break
      case 'headers':
        for (const header of signedHeaders) {
          const value = request.headers.get(header)
          if (value) {
            parts.push(`${header.toLowerCase()}:${value}`)
          }
        }
        break
    }
  }

  const stringToSign = parts.join('\n')

  // Calculate signature
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(stringToSign)

  const algorithmName = {
    sha256: 'SHA-256',
    sha384: 'SHA-384',
    sha512: 'SHA-512',
  }[algorithm]

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: algorithmName },
    false,
    ['sign'],
  )

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData)

  let signature: string
  if (encoding === 'base64') {
    signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
  }
  else {
    signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Create new request with signature headers
  const headers = new Headers(request.headers)
  headers.set(signatureHeader, signature)
  headers.set(timestampHeader, timestamp)
  headers.set(nonceHeader, nonce)

  if (keyId) {
    headers.set(keyIdHeader, keyId)
  }

  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
    integrity: request.integrity,
    signal: request.signal,
  })
}

/**
 * Verify a signature (utility function)
 */
export async function verifySignature(
  stringToSign: string,
  signature: string,
  secret: string,
  algorithm: SignatureAlgorithm = 'sha256',
  encoding: 'hex' | 'base64' = 'hex',
): Promise<boolean> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(stringToSign)

  const algorithmName = {
    sha256: 'SHA-256',
    sha384: 'SHA-384',
    sha512: 'SHA-512',
  }[algorithm]

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: algorithmName },
    false,
    ['sign'],
  )

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData)

  let expectedSignature: string
  if (encoding === 'base64') {
    expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
  }
  else {
    expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Timing-safe comparison
  if (signature.length !== expectedSignature.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
  }

  return result === 0
}
