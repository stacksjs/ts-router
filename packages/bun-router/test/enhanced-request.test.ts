/**
 * Enhanced Request Tests
 *
 * Tests for Laravel-style request methods
 */

import type { EnhancedRequestMethods } from '../src/request/enhanced-request'
import type { EnhancedRequest } from '../src/types'
import { describe, expect, it } from 'bun:test'
import { CollectionImpl, createSafeData, enhanceRequestWithMethods } from '../src/request/enhanced-request'

// Extended request type with methods
type ExtendedRequest = EnhancedRequest & EnhancedRequestMethods

// Helper to create an enhanced request for testing
function createEnhancedRequest(url: string, options: RequestInit = {}): ExtendedRequest {
  const request = new Request(url, options) as ExtendedRequest
  request.params = {}
  request.query = {}

  // Parse query params
  const urlObj = new URL(url)
  urlObj.searchParams.forEach((value, key) => {
    request.query[key] = value
  })

  enhanceRequestWithMethods(request)
  return request
}

describe('EnhancedRequest Methods', () => {
  describe('string()', () => {
    it('should get string value', () => {
      const request = createEnhancedRequest('http://localhost/test?name=John')
      expect(request.string('name')).toBe('John')
      expect(request.string('missing')).toBe('')
    })
  })

  describe('integer()', () => {
    it('should parse integer values', () => {
      const request = createEnhancedRequest('http://localhost/test?count=42&invalid=abc')
      expect(request.integer('count')).toBe(42)
      expect(request.integer('invalid')).toBe(0)
      expect(request.integer('missing', 10)).toBe(10)
    })
  })

  describe('float()', () => {
    it('should parse float values', () => {
      const request = createEnhancedRequest('http://localhost/test?price=19.99&invalid=abc')
      expect(request.float('price')).toBe(19.99)
      expect(request.float('invalid')).toBe(0)
      expect(request.float('missing', 5.5)).toBe(5.5)
    })
  })

  describe('boolean()', () => {
    it('should parse boolean values', () => {
      const request = createEnhancedRequest('http://localhost/test?active=true&disabled=false&yes=1&no=0')
      expect(request.boolean('active')).toBe(true)
      expect(request.boolean('disabled')).toBe(false)
      expect(request.boolean('yes')).toBe(true)
      expect(request.boolean('no')).toBe(false)
      expect(request.boolean('missing')).toBe(false)
    })
  })

  describe('date()', () => {
    it('should parse date values', () => {
      const request = createEnhancedRequest('http://localhost/test?created=2024-01-15')
      const date = request.date('created')
      expect(date).toBeInstanceOf(Date)
      expect(date?.getFullYear()).toBe(2024)
    })

    it('should return null for invalid date', () => {
      const request = createEnhancedRequest('http://localhost/test?invalid=not-a-date')
      expect(request.date('invalid')).toBeNull()
    })
  })

  describe('keys()', () => {
    it('should return all input keys', () => {
      const request = createEnhancedRequest('http://localhost/test?name=John&age=30')
      const keys = request.keys()
      expect(keys).toContain('name')
      expect(keys).toContain('age')
    })
  })

  describe('array()', () => {
    it('should get input as array', () => {
      const request = createEnhancedRequest('http://localhost/test?item=value')
      const arr = request.array('item')
      expect(arr).toEqual(['value'])
    })
  })
})

describe('Collection', () => {
  describe('basic operations', () => {
    it('should count items', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      expect(collection.count()).toBe(5)
    })

    it('should get first and last items', () => {
      const collection = new CollectionImpl([1, 2, 3])
      expect(collection.first()).toBe(1)
      expect(collection.last()).toBe(3)
    })

    it('should check if empty', () => {
      const empty = new CollectionImpl([])
      const notEmpty = new CollectionImpl([1])

      expect(empty.isEmpty()).toBe(true)
      expect(empty.isNotEmpty()).toBe(false)
      expect(notEmpty.isEmpty()).toBe(false)
      expect(notEmpty.isNotEmpty()).toBe(true)
    })
  })

  describe('transformations', () => {
    it('should map items', () => {
      const collection = new CollectionImpl([1, 2, 3])
      const doubled = collection.map(x => x * 2)

      expect(doubled.toArray()).toEqual([2, 4, 6])
    })

    it('should filter items', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      const even = collection.filter(x => x % 2 === 0)

      expect(even.toArray()).toEqual([2, 4])
    })

    it('should find items', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      const found = collection.find(x => x > 3)

      expect(found).toBe(4)
    })

    it('should reduce items', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      const sum = collection.reduce((acc, x) => acc + x, 0)

      expect(sum).toBe(15)
    })
  })

  describe('object collections', () => {
    const users = [
      { id: 1, name: 'John', age: 30 },
      { id: 2, name: 'Jane', age: 25 },
      { id: 3, name: 'Bob', age: 35 },
    ]

    it('should pluck values', () => {
      const collection = new CollectionImpl(users)
      const names = collection.pluck('name')

      expect(names.toArray()).toEqual(['John', 'Jane', 'Bob'])
    })

    it('should sort by key', () => {
      const collection = new CollectionImpl(users)
      const sorted = collection.sortBy('age')

      expect(sorted.toArray()[0].name).toBe('Jane')
      expect(sorted.toArray()[2].name).toBe('Bob')
    })

    it('should sort descending', () => {
      const collection = new CollectionImpl(users)
      const sorted = collection.sortBy('age', 'desc')

      expect(sorted.toArray()[0].name).toBe('Bob')
      expect(sorted.toArray()[2].name).toBe('Jane')
    })

    it('should group by key', () => {
      const items = [
        { category: 'A', value: 1 },
        { category: 'B', value: 2 },
        { category: 'A', value: 3 },
      ]
      const collection = new CollectionImpl(items)
      const grouped = collection.groupBy('category')

      expect(grouped.get('A')?.count()).toBe(2)
      expect(grouped.get('B')?.count()).toBe(1)
    })
  })

  describe('slicing', () => {
    it('should take items', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      const taken = collection.take(3)

      expect(taken.toArray()).toEqual([1, 2, 3])
    })

    it('should skip items', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      const skipped = collection.skip(2)

      expect(skipped.toArray()).toEqual([3, 4, 5])
    })

    it('should chunk items', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      const chunks = collection.chunk(2)

      expect(chunks.count()).toBe(3)
      expect(chunks.first()?.toArray()).toEqual([1, 2])
    })

    it('should reverse items', () => {
      const collection = new CollectionImpl([1, 2, 3])
      const reversed = collection.reverse()

      expect(reversed.toArray()).toEqual([3, 2, 1])
    })
  })

  describe('unique', () => {
    it('should get unique items', () => {
      const collection = new CollectionImpl([1, 2, 2, 3, 3, 3])
      const unique = collection.unique()

      expect(unique.toArray()).toEqual([1, 2, 3])
    })
  })

  describe('aggregations', () => {
    it('should sum values', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      expect(collection.sum()).toBe(15)
    })

    it('should average values', () => {
      const collection = new CollectionImpl([1, 2, 3, 4, 5])
      expect(collection.avg()).toBe(3)
    })

    it('should find min', () => {
      const collection = new CollectionImpl([3, 1, 4, 1, 5])
      expect(collection.min()).toBe(1)
    })

    it('should find max', () => {
      const collection = new CollectionImpl([3, 1, 4, 1, 5])
      expect(collection.max()).toBe(5)
    })

    it('should sum by key', () => {
      const items = [{ value: 10 }, { value: 20 }, { value: 30 }]
      const collection = new CollectionImpl(items)
      expect(collection.sum('value')).toBe(60)
    })
  })
})

describe('SafeData', () => {
  it('should get only specified keys', () => {
    const data = { name: 'John', email: 'john@example.com', password: 'secret' }
    const safe = createSafeData(data)

    const result = safe.only(['name', 'email'])
    expect(result).toEqual({ name: 'John', email: 'john@example.com' })
  })

  it('should get all except specified keys', () => {
    const data = { name: 'John', email: 'john@example.com', password: 'secret' }
    const safe = createSafeData(data)

    const result = safe.except(['password'])
    expect(result).toEqual({ name: 'John', email: 'john@example.com' })
  })

  it('should merge additional data', () => {
    const data = { name: 'John' }
    const safe = createSafeData(data)

    const result = safe.merge({ verified: true })
    expect(result).toEqual({ name: 'John', verified: true })
  })

  it('should get all data', () => {
    const data = { name: 'John', email: 'john@example.com' }
    const safe = createSafeData(data)

    expect(safe.all()).toEqual(data)
  })

  it('should check if key exists', () => {
    const data = { name: 'John' }
    const safe = createSafeData(data)

    expect(safe.has('name')).toBe(true)
    expect(safe.has('missing' as keyof typeof data)).toBe(false)
  })

  it('should get specific key', () => {
    const data = { name: 'John', age: 30 }
    const safe = createSafeData(data)

    expect(safe.get('name')).toBe('John')
    expect(safe.get('age')).toBe(30)
  })
})
