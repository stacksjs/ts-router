/**
 * Hot Reload Tests
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import {
  HotReloadManager,
  createHotReloadMiddleware,
  HotReloadUtils,
  HotReloadHelpers,
  HotReloadDecorators,
  initializeHotReload,
  getHotReload,
  HotReloadFactory
} from '../packages/bun-router/src/development/hot-reload'

describe('Hot Reload', () => {
  let tempDir: string
  let hotReload: HotReloadManager

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = join(process.cwd(), 'test-temp-' + Date.now())
    mkdirSync(tempDir, { recursive: true })

    // Clear global state
    globalThis.__HOT_RELOAD_STATE__ = undefined
    globalThis.__HOT_RELOAD_PRESERVE__ = undefined
  })

  afterEach(() => {
    // Cleanup
    if (hotReload) {
      hotReload.stop()
    }

    // Remove temporary directory
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('HotReloadManager', () => {
    it('should initialize with default config', () => {
      hotReload = new HotReloadManager()
      
      const stats = hotReload.getStats()
      expect(stats.reloadCount).toBe(0)
      expect(stats.watchedPaths).toContain(process.cwd())
    })

    it('should initialize with custom config', () => {
      hotReload = new HotReloadManager({
        enabled: true,
        watchPaths: [tempDir],
        extensions: ['.ts'],
        debounceMs: 50,
        verbose: false
      })

      const stats = hotReload.getStats()
      expect(stats.watchedPaths).toContain(tempDir)
    })

    it('should preserve state across reloads', () => {
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        preserveState: true
      })

      // Preserve some state
      hotReload.preserveState('testKey', { value: 'test' })
      
      // Simulate reload by creating new instance
      const newHotReload = new HotReloadManager({
        watchPaths: [tempDir],
        preserveState: true
      })

      const restored = newHotReload.restoreState('testKey')
      expect(restored).toEqual({ value: 'test' })
      
      newHotReload.stop()
    })

    it('should clear preserved state', () => {
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        preserveState: true
      })

      hotReload.preserveState('testKey', 'testValue')
      expect(hotReload.restoreState('testKey')).toBe('testValue')

      hotReload.clearState('testKey')
      expect(hotReload.restoreState('testKey')).toBeUndefined()
    })

    it('should handle file changes with debouncing', async () => {
      const onReload = mock(() => {})
      
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        extensions: ['.ts'],
        debounceMs: 50,
        onReload,
        verbose: false
      })

      // Create a test file
      const testFile = join(tempDir, 'test.ts')
      writeFileSync(testFile, 'export const test = "initial"')

      // Wait for initial setup
      await new Promise(resolve => setTimeout(resolve, 100))

      // Modify the file
      writeFileSync(testFile, 'export const test = "modified"')

      // Wait for debounce and reload
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(onReload).toHaveBeenCalled()
    })

    it('should ignore files based on config', async () => {
      const onReload = mock(() => {})
      
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        ignorePaths: ['node_modules'],
        extensions: ['.ts'],
        debounceMs: 50,
        onReload,
        verbose: false
      })

      // Create ignored directory and file
      const nodeModulesDir = join(tempDir, 'node_modules')
      mkdirSync(nodeModulesDir)
      const ignoredFile = join(nodeModulesDir, 'test.ts')
      writeFileSync(ignoredFile, 'export const test = "ignored"')

      // Wait for potential reload
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(onReload).not.toHaveBeenCalled()
    })

    it('should get accurate statistics', () => {
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        preserveState: true
      })

      hotReload.preserveState('key1', 'value1')
      hotReload.preserveState('key2', 'value2')

      const stats = hotReload.getStats()
      expect(stats.reloadCount).toBe(0)
      expect(stats.watchedPaths).toContain(tempDir)
      expect(stats.preservedKeys).toContain('key1')
      expect(stats.preservedKeys).toContain('key2')
      expect(typeof stats.uptime).toBe('number')
    })
  })

  describe('Hot Reload Middleware', () => {
    it('should create middleware that adds headers', async () => {
      hotReload = new HotReloadManager({
        watchPaths: [tempDir]
      })

      // Simulate a reload to increment count
      globalThis.__HOT_RELOAD_STATE__!.reloadCount = 5
      globalThis.__HOT_RELOAD_STATE__!.lastReload = Date.now()

      const middleware = createHotReloadMiddleware(hotReload)
      
      const request = new Request('http://localhost:3000/test')
      const response = await middleware(request, async () => {
        return new Response('test response')
      })

      expect(response.headers.get('X-Hot-Reload-Count')).toBe('5')
      expect(response.headers.get('X-Hot-Reload-Last')).toBeTruthy()
    })

    it('should not add headers when no reloads occurred', async () => {
      hotReload = new HotReloadManager({
        watchPaths: [tempDir]
      })

      const middleware = createHotReloadMiddleware(hotReload)
      
      const request = new Request('http://localhost:3000/test')
      const response = await middleware(request, async () => {
        return new Response('test response')
      })

      expect(response.headers.get('X-Hot-Reload-Count')).toBeNull()
      expect(response.headers.get('X-Hot-Reload-Last')).toBeNull()
    })
  })

  describe('Hot Reload Utils', () => {
    it('should detect hot reload mode', () => {
      // Test without hot reload
      expect(HotReloadUtils.isHotReloadEnabled()).toBe(false)

      // Test with global state
      globalThis.__HOT_RELOAD_STATE__ = {
        reloadCount: 1,
        lastReload: Date.now(),
        changedFiles: [],
        preservedState: {},
        watchers: new Map()
      }
      expect(HotReloadUtils.isHotReloadEnabled()).toBe(true)
    })

    it('should get reload count', () => {
      expect(HotReloadUtils.getReloadCount()).toBe(0)

      globalThis.__HOT_RELOAD_STATE__ = {
        reloadCount: 5,
        lastReload: Date.now(),
        changedFiles: [],
        preservedState: {},
        watchers: new Map()
      }
      expect(HotReloadUtils.getReloadCount()).toBe(5)
    })

    it('should create module cache', () => {
      const cache = HotReloadUtils.createModuleCache<string>()
      
      expect(cache.size()).toBe(0)
      
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')
      expect(cache.has('key1')).toBe(true)
      expect(cache.size()).toBe(1)
      
      cache.delete('key1')
      expect(cache.has('key1')).toBe(false)
      expect(cache.size()).toBe(0)
    })

    it('should create hot config', async () => {
      const initialConfig = { setting1: 'value1', setting2: 42 }
      const hotConfig = HotReloadUtils.createHotConfig(initialConfig)
      
      expect(hotConfig.get()).toEqual(initialConfig)
      
      // Test onChange callback
      const onChange = mock(() => {})
      hotConfig.onChange(onChange)
      
      await hotConfig.reload()
      expect(onChange).toHaveBeenCalledWith(initialConfig)
    })
  })

  describe('Hot Reload Helpers', () => {
    it('should create hot handler', async () => {
      // Create a test handler file
      const handlerFile = join(tempDir, 'handler.js')
      writeFileSync(handlerFile, `
        module.exports = async (request) => {
          return new Response('handler response')
        }
      `)

      const hotHandler = HotReloadHelpers.createHotHandler(handlerFile)
      const request = new Request('http://localhost:3000/test')
      const response = await hotHandler(request)
      
      expect(await response.text()).toBe('handler response')
    })

    it('should create hot middleware', async () => {
      // Create a test middleware file
      const middlewareFile = join(tempDir, 'middleware.js')
      writeFileSync(middlewareFile, `
        module.exports = async (request, next) => {
          const response = await next()
          response.headers.set('X-Hot-Middleware', 'true')
          return response
        }
      `)

      const hotMiddleware = HotReloadHelpers.createHotMiddleware(middlewareFile)
      const request = new Request('http://localhost:3000/test')
      
      const response = await hotMiddleware(request, async () => {
        return new Response('test')
      })
      
      expect(response.headers.get('X-Hot-Middleware')).toBe('true')
    })

    it('should handle handler errors gracefully', async () => {
      const handlerFile = join(tempDir, 'bad-handler.js')
      writeFileSync(handlerFile, `
        module.exports = () => {
          throw new Error('Handler error')
        }
      `)

      const hotHandler = HotReloadHelpers.createHotHandler(handlerFile)
      const request = new Request('http://localhost:3000/test')
      const response = await hotHandler(request)
      
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Handler Error')
    })

    it('should create development server', () => {
      const devServer = HotReloadHelpers.createDevelopmentServer({
        port: 0, // Use random port
        hostname: 'localhost'
      })

      expect(devServer.server).toBeDefined()
      expect(devServer.hotReload).toBeDefined()
      expect(typeof devServer.stop).toBe('function')

      devServer.stop()
    })
  })

  describe('Hot Reload Decorators', () => {
    it('should create hot-reloadable class', () => {
      @HotReloadDecorators.hotReloadable
      class TestClass {
        value = 'initial'
        
        getValue() {
          return this.value
        }
      }

      const instance = new TestClass()
      expect(instance.getValue()).toBe('initial')
    })

    it('should apply hot method decorator', () => {
      class TestClass {
        @HotReloadDecorators.hotMethod
        testMethod() {
          return 'method result'
        }
      }

      const instance = new TestClass()
      expect(instance.testMethod()).toBe('method result')
    })

    it('should handle method errors', () => {
      class TestClass {
        @HotReloadDecorators.hotMethod
        errorMethod() {
          throw new Error('Method error')
        }
      }

      const instance = new TestClass()
      expect(() => instance.errorMethod()).toThrow('Method error')
    })
  })

  describe('Global Hot Reload', () => {
    it('should initialize global hot reload', () => {
      const global1 = initializeHotReload({ watchPaths: [tempDir] })
      const global2 = initializeHotReload({ watchPaths: ['/other'] })
      
      // Should return same instance
      expect(global1).toBe(global2)
      expect(getHotReload()).toBe(global1)
      
      global1.stop()
    })
  })

  describe('Hot Reload Factory', () => {
    it('should create development hot reload', () => {
      const devHotReload = HotReloadFactory.createDevelopment()
      
      const stats = devHotReload.getStats()
      expect(stats.watchedPaths.length).toBeGreaterThan(0)
      
      devHotReload.stop()
    })

    it('should create production hot reload (disabled)', () => {
      const prodHotReload = HotReloadFactory.createProduction()
      
      // Production should be disabled
      const stats = prodHotReload.getStats()
      expect(stats.reloadCount).toBe(0)
      
      prodHotReload.stop()
    })

    it('should create testing hot reload', () => {
      const testHotReload = HotReloadFactory.createTesting()
      
      const stats = testHotReload.getStats()
      expect(stats.reloadCount).toBe(0)
      
      testHotReload.stop()
    })
  })

  describe('Integration Tests', () => {
    it('should handle multiple file changes', async () => {
      const onReload = mock(() => {})
      
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        extensions: ['.ts', '.js'],
        debounceMs: 100,
        onReload,
        verbose: false
      })

      // Create multiple test files
      const files = ['test1.ts', 'test2.js', 'test3.ts']
      files.forEach(file => {
        writeFileSync(join(tempDir, file), `export const ${file.replace('.', '_')} = "initial"`)
      })

      // Wait for initial setup
      await new Promise(resolve => setTimeout(resolve, 150))

      // Modify all files
      files.forEach(file => {
        writeFileSync(join(tempDir, file), `export const ${file.replace('.', '_')} = "modified"`)
      })

      // Wait for debounce and reload
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(onReload).toHaveBeenCalled()
      const callArgs = onReload.mock.calls[0][0]
      expect(callArgs.length).toBeGreaterThan(0)
    })

    it('should preserve complex state across reloads', () => {
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        preserveState: true
      })

      // Preserve complex state
      const complexState = {
        user: { id: 1, name: 'Test User' },
        settings: { theme: 'dark', notifications: true },
        cache: new Map([['key1', 'value1'], ['key2', 'value2']])
      }

      hotReload.preserveState('complexState', complexState)
      
      // Simulate reload
      const newHotReload = new HotReloadManager({
        watchPaths: [tempDir],
        preserveState: true
      })

      const restored = newHotReload.restoreState('complexState')
      expect(restored.user).toEqual(complexState.user)
      expect(restored.settings).toEqual(complexState.settings)
      
      newHotReload.stop()
    })

    it('should handle rapid file changes', async () => {
      const onReload = mock(() => {})
      
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        extensions: ['.ts'],
        debounceMs: 50,
        onReload,
        verbose: false
      })

      const testFile = join(tempDir, 'rapid-test.ts')
      writeFileSync(testFile, 'export const test = "initial"')

      // Wait for initial setup
      await new Promise(resolve => setTimeout(resolve, 100))

      // Make rapid changes
      for (let i = 0; i < 5; i++) {
        writeFileSync(testFile, `export const test = "change-${i}"`)
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should only trigger once due to debouncing
      expect(onReload).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle watch errors gracefully', () => {
      const onError = mock(() => {})
      
      hotReload = new HotReloadManager({
        watchPaths: ['/nonexistent/path'],
        onError,
        verbose: false
      })

      // Should handle the error without crashing
      expect(onError).toHaveBeenCalled()
    })

    it('should handle reload callback errors', async () => {
      const onError = mock(() => {})
      const onReload = mock(() => {
        throw new Error('Reload error')
      })
      
      hotReload = new HotReloadManager({
        watchPaths: [tempDir],
        extensions: ['.ts'],
        debounceMs: 50,
        onReload,
        onError,
        verbose: false
      })

      const testFile = join(tempDir, 'error-test.ts')
      writeFileSync(testFile, 'export const test = "initial"')

      // Wait for initial setup
      await new Promise(resolve => setTimeout(resolve, 100))

      // Modify file to trigger error
      writeFileSync(testFile, 'export const test = "modified"')

      // Wait for reload attempt
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(onError).toHaveBeenCalled()
    })
  })
})
