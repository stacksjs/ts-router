import type { ActionHandlerClass, EnhancedRequest } from '../src/types'
import { describe, expect, it } from 'bun:test'
import {
  createPathRegex,
  extractParamNames,
  isActionClass,
  isRouteHandler,
  joinPaths,
  matchPath,
  normalizePath,
  processHtmlTemplate,
  toActionPath,
  validatePath,
} from '../src/utils'

describe('Utils', () => {
  describe('normalizePath', () => {
    it('should add leading slash if missing', () => {
      expect(normalizePath('api/users')).toBe('/api/users')
    })

    it('should remove trailing slash unless path is just /', () => {
      expect(normalizePath('/api/users/')).toBe('/api/users')
      expect(normalizePath('/')).toBe('/')
    })

    it('should handle empty path', () => {
      expect(normalizePath('')).toBe('/')
    })

    it('should normalize double slashes', () => {
      expect(normalizePath('/api//users')).toBe('/api/users')
    })
  })

  describe('matchPath', () => {
    it('should match exact path', () => {
      const params: Record<string, string> = {}
      expect(matchPath('/users', '/users', params)).toBe(true)
    })

    it('should not match different paths', () => {
      const params: Record<string, string> = {}
      expect(matchPath('/users', '/posts', params)).toBe(false)
    })

    it('should match path with parameters', () => {
      const params: Record<string, string> = {}
      expect(matchPath('/users/{id}', '/users/123', params)).toBe(true)
      expect(params.id).toBe('123')
    })

    it('should match path with multiple parameters', () => {
      const params: Record<string, string> = {}
      expect(matchPath('/users/{userId}/posts/{postId}', '/users/123/posts/456', params)).toBe(true)
      expect(params.userId).toBe('123')
      expect(params.postId).toBe('456')
    })

    it('should not match path with missing parameters', () => {
      const params: Record<string, string> = {}
      expect(matchPath('/users/{id}/posts', '/users/posts', params)).toBe(false)
    })

    it('should match path with optional parameters present', () => {
      const params: Record<string, string> = {}
      expect(matchPath('/users/{id?}', '/users/123', params)).toBe(true)
      expect(params.id).toBe('123')
    })

    it('should match path with optional parameters missing', () => {
      const params: Record<string, string> = {}
      expect(matchPath('/users/{id?}', '/users', params)).toBe(true)
      expect(params.id).toBeUndefined()
    })

    it('should match wildcard paths', () => {
      const params: Record<string, string> = {}
      expect(matchPath('/assets/*', '/assets/images/logo.png', params)).toBe(true)
    })
  })

  describe('isRouteHandler', () => {
    it('should identify function route handlers', () => {
      const handler = (_req: EnhancedRequest) => new Response()
      expect(isRouteHandler(handler)).toBe(true)
    })

    it('should reject non-function values', () => {
      expect(isRouteHandler('not a function' as any)).toBe(false)
      expect(isRouteHandler(123 as any)).toBe(false)
      expect(isRouteHandler({} as any)).toBe(false)
    })
  })

  describe('isActionClass', () => {
    it('should identify action handler classes', () => {
      class TestAction implements ActionHandlerClass {
        async handle(_req: EnhancedRequest): Promise<Response> {
          return new Response()
        }
      }

      expect(isActionClass(TestAction as any)).toBe(true)
    })

    it('should reject objects without handle method', () => {
      expect(isActionClass({} as any)).toBe(false)
    })

    it('should reject non-objects', () => {
      expect(isActionClass('string' as any)).toBe(false)
      expect(isActionClass(123 as any)).toBe(false)
    })
  })

  describe('processHtmlTemplate', () => {
    it('should replace variables in templates', () => {
      const template = '<h1>{{title}}</h1><p>{{content}}</p>'
      const data = { title: 'Hello', content: 'World' }

      const result = processHtmlTemplate(template, data)
      expect(result).toBe('<h1>Hello</h1><p>World</p>')
    })

    it('should handle nested object properties', () => {
      const template = '<h1>{{user.name}}</h1><p>{{user.email}}</p>'
      const data = { user: { name: 'John', email: 'john@example.com' } }

      const result = processHtmlTemplate(template, data)
      expect(result).toBe('<h1>John</h1><p>john@example.com</p>')
    })

    it('should ignore variables not found in data', () => {
      const template = '<h1>{{title}}</h1><p>{{missing}}</p>'
      const data = { title: 'Hello' }

      const result = processHtmlTemplate(template, data)
      expect(result).toBe('<h1>Hello</h1><p>{{missing}}</p>')
    })

    it('should handle conditional blocks', () => {
      const template = '{{#if showHeader}}<header>Header</header>{{/if}}<main>Content</main>'

      const resultWithHeader = processHtmlTemplate(template, { showHeader: true })
      expect(resultWithHeader).toBe('<header>Header</header><main>Content</main>')

      const resultWithoutHeader = processHtmlTemplate(template, { showHeader: false })
      expect(resultWithoutHeader).toBe('<main>Content</main>')
    })

    it('should handle loop blocks', () => {
      const template = '<ul>{{#each items}}<li>{{this}}</li>{{/each}}</ul>'
      const data = { items: ['one', 'two', 'three'] }

      const result = processHtmlTemplate(template, data)
      expect(result).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>')
    })
  })

  describe('createPathRegex', () => {
    it('should create regex for simple paths', () => {
      const regex = createPathRegex('/users')
      expect('/users'.match(regex)).toBeTruthy()
      expect('/users/'.match(regex)).toBeFalsy()
      expect('/users/123'.match(regex)).toBeFalsy()
    })

    it('should create regex for paths with parameters', () => {
      const regex = createPathRegex('/users/{id}')
      expect('/users/123'.match(regex)).toBeTruthy()
      expect('/users/abc'.match(regex)).toBeTruthy()
      expect('/users/'.match(regex)).toBeFalsy()
      expect('/users'.match(regex)).toBeFalsy()
    })

    it('should create regex for paths with multiple parameters', () => {
      const regex = createPathRegex('/users/{userId}/posts/{postId}')
      expect('/users/123/posts/456'.match(regex)).toBeTruthy()
      expect('/users/abc/posts/def'.match(regex)).toBeTruthy()
      expect('/users/123/posts'.match(regex)).toBeFalsy()
      expect('/users/posts/456'.match(regex)).toBeFalsy()
    })
  })

  describe('extractParamNames', () => {
    it('should extract parameter names from path pattern', () => {
      expect(extractParamNames('/users/{id}')).toEqual(['id'])
      expect(extractParamNames('/users/{userId}/posts/{postId}')).toEqual(['userId', 'postId'])
      expect(extractParamNames('/static/path')).toEqual([])
    })

    it('should handle optional parameters', () => {
      expect(extractParamNames('/users/{id?}')).toEqual(['id'])
      expect(extractParamNames('/users/{id}/posts/{page?}')).toEqual(['id', 'page'])
    })
  })

  describe('joinPaths', () => {
    it('should join path segments correctly', () => {
      expect(joinPaths('api', 'users')).toBe('/api/users')
      expect(joinPaths('/api', '/users')).toBe('/api/users')
      expect(joinPaths('/api/', '/users/')).toBe('/api/users')
      expect(joinPaths('', 'users')).toBe('/users')
    })
  })

  describe('validatePath', () => {
    it('should validate correct paths', () => {
      expect(validatePath('/users')).toBe(true)
      expect(validatePath('/users/{id}')).toBe(true)
      expect(validatePath('/users/{id}/posts/{postId}')).toBe(true)
    })

    it('should reject invalid paths', () => {
      expect(validatePath('users')).toBe(false) // Missing leading slash
      expect(validatePath('/users/{id')).toBe(false) // Unbalanced braces
      expect(validatePath('/users/}id{')).toBe(false) // Reversed braces
    })
  })

  describe('toActionPath', () => {
    it('should convert paths to action paths', () => {
      expect(toActionPath('Actions/Home/IndexAction')).toBe('actions_home_indexaction')
      expect(toActionPath('controllers/user/show')).toBe('controllers_user_show')
    })
  })
})
