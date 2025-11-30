/**
 * Enhanced Request Methods
 *
 * Implements fluent request methods with full TypeScript support
 */

import type {
  EnhancedRequest,
  InputValue,
  RequestInput,
  ValidatedData,
} from '../types'
import { Validator } from '../validation/validator'

// ============================================================================
// Types
// ============================================================================

/**
 * Validation rules type
 */
export type ValidationRules = Record<string, string | ValidationRule[]>

/**
 * Validation rule interface
 */
export interface ValidationRule {
  name: string
  validate: (value: unknown, parameters: string[], field: string, data: Record<string, unknown>) => Promise<boolean> | boolean
  message: string | ((field: string, parameters: string[]) => string)
}

/**
 * Safe validated data wrapper
 */
export interface SafeData<T extends Record<string, unknown> = Record<string, unknown>> {
  only: <K extends keyof T>(keys: K[]) => Pick<T, K>
  except: <K extends keyof T>(keys: K[]) => Omit<T, K>
  merge: <U extends Record<string, unknown>>(data: U) => T & U
  all: () => T
  has: (key: keyof T) => boolean
  get: <K extends keyof T>(key: K) => T[K]
}

/**
 * Collection interface for array data
 */
export interface Collection<T> {
  items: T[]
  count: () => number
  first: () => T | undefined
  last: () => T | undefined
  map: <U>(fn: (item: T, index: number) => U) => Collection<U>
  filter: (fn: (item: T, index: number) => boolean) => Collection<T>
  find: (fn: (item: T, index: number) => boolean) => T | undefined
  reduce: <U>(fn: (acc: U, item: T, index: number) => U, initial: U) => U
  forEach: (fn: (item: T, index: number) => void) => void
  toArray: () => T[]
  isEmpty: () => boolean
  isNotEmpty: () => boolean
  pluck: <K extends keyof T>(key: K) => Collection<T[K]>
  unique: () => Collection<T>
  sortBy: <K extends keyof T>(key: K, direction?: 'asc' | 'desc') => Collection<T>
  groupBy: <K extends keyof T>(key: K) => Map<T[K], Collection<T>>
  chunk: (size: number) => Collection<Collection<T>>
  take: (count: number) => Collection<T>
  skip: (count: number) => Collection<T>
  reverse: () => Collection<T>
  sum: (key?: keyof T) => number
  avg: (key?: keyof T) => number
  min: (key?: keyof T) => T | undefined
  max: (key?: keyof T) => T | undefined
}

// ============================================================================
// Collection Implementation
// ============================================================================

/**
 * Collection class for array manipulation
 */
export class CollectionImpl<T> implements Collection<T> {
  items: T[]

  constructor(items: T[]) {
    this.items = [...items]
  }

  count(): number {
    return this.items.length
  }

  first(): T | undefined {
    return this.items[0]
  }

  last(): T | undefined {
    return this.items[this.items.length - 1]
  }

  map<U>(fn: (item: T, index: number) => U): Collection<U> {
    return new CollectionImpl(this.items.map(fn))
  }

  filter(fn: (item: T, index: number) => boolean): Collection<T> {
    return new CollectionImpl(this.items.filter(fn))
  }

  find(fn: (item: T, index: number) => boolean): T | undefined {
    return this.items.find(fn)
  }

  reduce<U>(fn: (acc: U, item: T, index: number) => U, initial: U): U {
    return this.items.reduce(fn, initial)
  }

  forEach(fn: (item: T, index: number) => void): void {
    this.items.forEach(fn)
  }

  toArray(): T[] {
    return [...this.items]
  }

  isEmpty(): boolean {
    return this.items.length === 0
  }

  isNotEmpty(): boolean {
    return this.items.length > 0
  }

  pluck<K extends keyof T>(key: K): Collection<T[K]> {
    return new CollectionImpl(this.items.map(item => item[key]))
  }

  unique(): Collection<T> {
    return new CollectionImpl([...new Set(this.items)])
  }

  sortBy<K extends keyof T>(key: K, direction: 'asc' | 'desc' = 'asc'): Collection<T> {
    const sorted = [...this.items].sort((a, b) => {
      const aVal = a[key]
      const bVal = b[key]
      if (aVal < bVal)
        return direction === 'asc' ? -1 : 1
      if (aVal > bVal)
        return direction === 'asc' ? 1 : -1
      return 0
    })
    return new CollectionImpl(sorted)
  }

  groupBy<K extends keyof T>(key: K): Map<T[K], Collection<T>> {
    const groups = new Map<T[K], T[]>()
    for (const item of this.items) {
      const groupKey = item[key]
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(item)
    }
    const result = new Map<T[K], Collection<T>>()
    for (const [k, v] of groups) {
      result.set(k, new CollectionImpl(v))
    }
    return result
  }

  chunk(size: number): Collection<Collection<T>> {
    const chunks: Collection<T>[] = []
    for (let i = 0; i < this.items.length; i += size) {
      chunks.push(new CollectionImpl(this.items.slice(i, i + size)))
    }
    return new CollectionImpl(chunks)
  }

  take(count: number): Collection<T> {
    return new CollectionImpl(this.items.slice(0, count))
  }

  skip(count: number): Collection<T> {
    return new CollectionImpl(this.items.slice(count))
  }

  reverse(): Collection<T> {
    return new CollectionImpl([...this.items].reverse())
  }

  sum(key?: keyof T): number {
    if (key) {
      return this.items.reduce((acc, item) => acc + (Number(item[key]) || 0), 0)
    }
    return this.items.reduce((acc, item) => acc + (Number(item) || 0), 0)
  }

  avg(key?: keyof T): number {
    if (this.items.length === 0)
      return 0
    return this.sum(key) / this.items.length
  }

  min(key?: keyof T): T | undefined {
    if (this.items.length === 0)
      return undefined
    if (key) {
      return this.items.reduce((min, item) =>
        item[key] < min[key] ? item : min,
      )
    }
    return this.items.reduce((min, item) => (item < min ? item : min))
  }

  max(key?: keyof T): T | undefined {
    if (this.items.length === 0)
      return undefined
    if (key) {
      return this.items.reduce((max, item) =>
        item[key] > max[key] ? item : max,
      )
    }
    return this.items.reduce((max, item) => (item > max ? item : max))
  }
}

// ============================================================================
// Safe Data Implementation
// ============================================================================

/**
 * Create a safe data wrapper
 */
export function createSafeData<T extends Record<string, unknown>>(data: T): SafeData<T> {
  return {
    only: <K extends keyof T>(keys: K[]): Pick<T, K> => {
      const result = {} as Pick<T, K>
      for (const key of keys) {
        if (key in data) {
          result[key] = data[key]
        }
      }
      return result
    },

    except: <K extends keyof T>(keys: K[]): Omit<T, K> => {
      const result = { ...data }
      for (const key of keys) {
        delete result[key]
      }
      return result as Omit<T, K>
    },

    merge: <U extends Record<string, unknown>>(mergeData: U): T & U => {
      return { ...data, ...mergeData }
    },

    all: (): T => ({ ...data }),

    has: (key: keyof T): boolean => key in data,

    get: <K extends keyof T>(key: K): T[K] => data[key],
  }
}

// ============================================================================
// Enhanced Request Methods
// ============================================================================

/**
 * Enhanced request methods interface
 */
export interface EnhancedRequestMethods {
  /**
   * Validate the request data
   */
  validate: <T extends Record<string, unknown> = Record<string, unknown>>(
    rules: ValidationRules,
    messages?: Record<string, string>,
  ) => Promise<T>

  /**
   * Get validated data as typed object
   */
  getValidated: <T extends Record<string, unknown> = Record<string, unknown>>() => T

  /**
   * Get safe validated data wrapper
   */
  safe: <T extends Record<string, unknown> = Record<string, unknown>>() => SafeData<T>

  /**
   * Execute callback when input has a value
   */
  whenHas: <T>(
    key: string,
    callback: (value: T) => void,
    defaultCallback?: () => void,
  ) => void

  /**
   * Execute callback when input is filled (not empty)
   */
  whenFilled: <T>(
    key: string,
    callback: (value: T) => void,
    defaultCallback?: () => void,
  ) => void

  /**
   * Parse date input
   */
  date: (key: string, format?: string) => Date | null

  /**
   * Parse enum input
   */
  enum: <T extends Record<string, string | number>>(
    key: string,
    enumType: T,
  ) => T[keyof T] | null

  /**
   * Get input as collection
   */
  collect: <T = unknown>(key: string) => Collection<T>

  /**
   * Get all input keys
   */
  keys: () => string[]

  /**
   * Get input with type casting
   */
  string: (key: string, defaultValue?: string) => string
  integer: (key: string, defaultValue?: number) => number
  float: (key: string, defaultValue?: number) => number
  boolean: (key: string, defaultValue?: boolean) => boolean

  /**
   * Check if input matches a value
   */
  isValue: (key: string, value: unknown) => boolean

  /**
   * Get old input (for form repopulation)
   */
  old: <T = unknown>(key: string, defaultValue?: T) => T

  /**
   * Flash input to session for form repopulation
   */
  flashInput: (keys?: string[]) => void

  /**
   * Flash only specific keys
   */
  flashInputOnly: (keys: string[]) => void

  /**
   * Flash except specific keys
   */
  flashInputExcept: (keys: string[]) => void

  /**
   * Get input as array
   */
  array: <T = unknown>(key: string) => T[]
}

// ============================================================================
// Request Enhancement
// ============================================================================

/**
 * Enhance request with additional methods
 */
export function enhanceRequestWithMethods(request: EnhancedRequest): EnhancedRequest & EnhancedRequestMethods {
  const enhanced = request as EnhancedRequest & EnhancedRequestMethods & {
    _validatedData?: ValidatedData
    _oldInput?: RequestInput
  }

  // Get all input data
  const getAllInput = (): RequestInput => {
    const input: RequestInput = {}

    // Query parameters
    if (request.query) {
      for (const [key, value] of Object.entries(request.query)) {
        input[key] = value as InputValue
      }
    }

    // JSON body
    if (request.jsonBody) {
      for (const [key, value] of Object.entries(request.jsonBody as Record<string, unknown>)) {
        input[key] = value as InputValue
      }
    }

    // Form body
    if (request.formBody) {
      for (const [key, value] of Object.entries(request.formBody)) {
        input[key] = value as InputValue
      }
    }

    // Route params
    if (request.params) {
      for (const [key, value] of Object.entries(request.params)) {
        input[key] = value
      }
    }

    return input
  }

  /**
   * Validate the request
   */
  enhanced.validate = async <T extends Record<string, unknown>>(
    rules: ValidationRules,
    messages?: Record<string, string>,
  ): Promise<T> => {
    const input = getAllInput()
    const validator = new Validator({
      customMessages: messages,
    })

    const errors = await validator.validate(input as Record<string, unknown>, rules as Record<string, string>)

    if (Object.keys(errors).length > 0) {
      const error = new Error('Validation failed') as Error & { errors: Record<string, string[]> }
      error.errors = errors
      throw error
    }

    enhanced._validatedData = input as ValidatedData
    return input as T
  }

  /**
   * Get validated data as typed object
   */
  enhanced.getValidated = <T extends Record<string, unknown>>(): T => {
    return (enhanced._validatedData || {}) as T
  }

  /**
   * Get safe validated data wrapper
   */
  enhanced.safe = <T extends Record<string, unknown>>(): SafeData<T> => {
    return createSafeData(enhanced.getValidated<T>())
  }

  /**
   * Execute callback when input has a value
   */
  enhanced.whenHas = <T>(
    key: string,
    callback: (value: T) => void,
    defaultCallback?: () => void,
  ): void => {
    const input = getAllInput()
    if (key in input && input[key] !== undefined) {
      callback(input[key] as T)
    }
    else if (defaultCallback) {
      defaultCallback()
    }
  }

  /**
   * Execute callback when input is filled
   */
  enhanced.whenFilled = <T>(
    key: string,
    callback: (value: T) => void,
    defaultCallback?: () => void,
  ): void => {
    const input = getAllInput()
    const value = input[key]
    const isFilled = value !== undefined
      && value !== null
      && value !== ''
      && !(Array.isArray(value) && value.length === 0)

    if (isFilled) {
      callback(value as T)
    }
    else if (defaultCallback) {
      defaultCallback()
    }
  }

  /**
   * Parse date input
   */
  enhanced.date = (key: string, _format?: string): Date | null => {
    const input = getAllInput()
    const value = input[key]

    if (!value)
      return null

    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? null : date
  }

  /**
   * Parse enum input
   */
  enhanced.enum = <T extends Record<string, string | number>>(
    key: string,
    enumType: T,
  ): T[keyof T] | null => {
    const input = getAllInput()
    const value = input[key]

    if (value === undefined || value === null)
      return null

    const enumValues = Object.values(enumType)
    if (enumValues.includes(value as T[keyof T])) {
      return value as T[keyof T]
    }

    // Try to match by key
    const stringValue = String(value)
    if (stringValue in enumType) {
      return enumType[stringValue as keyof T]
    }

    return null
  }

  /**
   * Get input as collection
   */
  enhanced.collect = <T = unknown>(key: string): Collection<T> => {
    const input = getAllInput()
    const value = input[key]

    if (Array.isArray(value)) {
      return new CollectionImpl(value as T[])
    }

    return new CollectionImpl(value ? [value as T] : [])
  }

  /**
   * Get all input keys
   */
  enhanced.keys = (): string[] => {
    return Object.keys(getAllInput())
  }

  /**
   * Get string input
   */
  enhanced.string = (key: string, defaultValue: string = ''): string => {
    const input = getAllInput()
    const value = input[key]
    return value !== undefined && value !== null ? String(value) : defaultValue
  }

  /**
   * Get integer input
   */
  enhanced.integer = (key: string, defaultValue: number = 0): number => {
    const input = getAllInput()
    const value = input[key]
    const parsed = Number.parseInt(String(value), 10)
    return Number.isNaN(parsed) ? defaultValue : parsed
  }

  /**
   * Get float input
   */
  enhanced.float = (key: string, defaultValue: number = 0): number => {
    const input = getAllInput()
    const value = input[key]
    const parsed = Number.parseFloat(String(value))
    return Number.isNaN(parsed) ? defaultValue : parsed
  }

  /**
   * Get boolean input
   */
  enhanced.boolean = (key: string, defaultValue: boolean = false): boolean => {
    const input = getAllInput()
    const value = input[key]

    if (value === undefined || value === null)
      return defaultValue
    if (typeof value === 'boolean')
      return value
    if (value === 'true' || value === '1' || value === 1)
      return true
    if (value === 'false' || value === '0' || value === 0)
      return false

    return defaultValue
  }

  /**
   * Check if input matches a value
   */
  enhanced.isValue = (key: string, value: unknown): boolean => {
    const input = getAllInput()
    return input[key] === value
  }

  /**
   * Get old input
   */
  enhanced.old = <T = unknown>(key: string, defaultValue?: T): T => {
    const oldInput = enhanced._oldInput || {}
    return (oldInput[key] as T) ?? (defaultValue as T)
  }

  /**
   * Flash input to session for form repopulation
   */
  enhanced.flashInput = (keys?: string[]): void => {
    const input = getAllInput()
    if (keys) {
      const filtered: RequestInput = {}
      for (const key of keys) {
        if (key in input) {
          filtered[key] = input[key]
        }
      }
      enhanced._oldInput = filtered
    }
    else {
      enhanced._oldInput = input
    }
  }

  /**
   * Flash only specific keys
   */
  enhanced.flashInputOnly = (keys: string[]): void => {
    enhanced.flashInput(keys)
  }

  /**
   * Flash except specific keys
   */
  enhanced.flashInputExcept = (keys: string[]): void => {
    const input = getAllInput()
    const filtered: RequestInput = {}
    for (const [key, value] of Object.entries(input)) {
      if (!keys.includes(key)) {
        filtered[key] = value
      }
    }
    enhanced._oldInput = filtered
  }

  /**
   * Get input as array
   */
  enhanced.array = <T = unknown>(key: string): T[] => {
    const input = getAllInput()
    const value = input[key]

    if (Array.isArray(value)) {
      return value as T[]
    }

    return value !== undefined && value !== null ? [value as T] : []
  }

  return enhanced
}

// ============================================================================
// Middleware for Request Enhancement
// ============================================================================

/**
 * Middleware to enhance request with additional methods
 */
export function enhancedRequestMiddleware() {
  return async (req: EnhancedRequest, next: () => Promise<Response | null>): Promise<Response | null> => {
    enhanceRequestWithMethods(req)
    return next()
  }
}

// Note: Collection interface and CollectionImpl class are already exported above
// enhanceRequestWithMethods is already exported above
