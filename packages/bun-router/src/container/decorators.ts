/* eslint-disable ts/no-unsafe-function-type */
/**
 * Modern Dependency Injection Decorators
 */

import type { ResolutionContext } from './container'
import { Container } from './container'

// Metadata keys with explicit types
export const INJECTABLE_METADATA_KEY: unique symbol = Symbol('injectable')
export const INJECT_METADATA_KEY: unique symbol = Symbol('inject')
export const OPTIONAL_METADATA_KEY: unique symbol = Symbol('optional')
export const TAGGED_METADATA_KEY: unique symbol = Symbol('tagged')
export const CONTROLLER_METADATA_KEY: unique symbol = Symbol('controller')
export const ROUTE_METADATA_KEY: unique symbol = Symbol('route')
export const MIDDLEWARE_METADATA_KEY: unique symbol = Symbol('middleware')
export const PARAM_METADATA_KEY: unique symbol = Symbol('param')

// Decorator metadata interfaces
export interface InjectableMetadata {
  token?: string | symbol
  scope?: 'singleton' | 'transient' | 'scoped' | 'request'
  tags?: string[]
}

export interface InjectMetadata {
  token: string | symbol | Function
  optional?: boolean
  tags?: string[]
  when?: (context: ResolutionContext) => boolean
}

export interface ControllerMetadata {
  prefix?: string
  middleware?: Function[]
  tags?: string[]
}

export interface RouteMetadata {
  method: string
  path: string
  middleware?: Function[]
  tags?: string[]
}

export interface ParamMetadata {
  type: 'param' | 'query' | 'body' | 'header' | 'cookie'
  key?: string
  token?: string | symbol | Function
  optional?: boolean
  transform?: (value: any) => any
  validate?: (value: any) => boolean
}

/**
 * Injectable decorator - marks a class as injectable
 */
export function Injectable(metadata: InjectableMetadata = {}): ClassDecorator {
  return (target: any) => {
    // Store metadata directly on the class
    target[INJECTABLE_METADATA_KEY] = metadata
    return target
  }
}

/**
 * Inject decorator - specifies dependency injection for constructor parameters
 */
export function Inject(token: string | symbol | Function, options?: {
  optional?: boolean
  tags?: string[]
  when?: (context: ResolutionContext) => boolean
}): ParameterDecorator {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    if (!target[INJECT_METADATA_KEY]) {
      target[INJECT_METADATA_KEY] = []
    }
    const metadata: InjectMetadata = {
      token,
      optional: options?.optional,
      tags: options?.tags,
      when: options?.when,
    }
    target[INJECT_METADATA_KEY][parameterIndex] = metadata
  }
}

/**
 * Optional decorator - marks a dependency as optional
 */
export function Optional(): ParameterDecorator {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    if (!target[OPTIONAL_METADATA_KEY]) {
      target[OPTIONAL_METADATA_KEY] = []
    }
    target[OPTIONAL_METADATA_KEY][parameterIndex] = true
  }
}

/**
 * Tagged decorator - injects services with specific tags
 */
export function Tagged(tag: string): ParameterDecorator {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    if (!target[TAGGED_METADATA_KEY]) {
      target[TAGGED_METADATA_KEY] = []
    }
    target[TAGGED_METADATA_KEY][parameterIndex] = tag
  }
}

/**
 * Controller decorator - marks a class as a controller
 */
export function Controller(prefix?: string, options?: {
  middleware?: Function[]
  tags?: string[]
}): ClassDecorator {
  return function (target: any) {
    const metadata: ControllerMetadata = {
      prefix: prefix || '',
      middleware: options?.middleware || [],
      tags: options?.tags || [],
    }
    target[CONTROLLER_METADATA_KEY] = metadata
    return target
  }
}

/**
 * HTTP method decorators
 */
export function Get(path: string = '', options?: { middleware?: Function[], tags?: string[] }): MethodDecorator {
  return createRouteDecorator('GET', path, options)
}

export function Post(path: string = '', options?: { middleware?: Function[], tags?: string[] }): MethodDecorator {
  return createRouteDecorator('POST', path, options)
}

export function Put(path: string = '', options?: { middleware?: Function[], tags?: string[] }): MethodDecorator {
  return createRouteDecorator('PUT', path, options)
}

export function Delete(path: string = '', options?: { middleware?: Function[], tags?: string[] }): MethodDecorator {
  return createRouteDecorator('DELETE', path, options)
}

export function Patch(path: string = '', options?: { middleware?: Function[], tags?: string[] }): MethodDecorator {
  return createRouteDecorator('PATCH', path, options)
}

export function Options(path: string = '', options?: { middleware?: Function[], tags?: string[] }): MethodDecorator {
  return createRouteDecorator('OPTIONS', path, options)
}

export function Head(path: string = '', options?: { middleware?: Function[], tags?: string[] }): MethodDecorator {
  return createRouteDecorator('HEAD', path, options)
}

function createRouteDecorator(method: string, path: string, options?: { middleware?: Function[], tags?: string[] }): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    if (!target.constructor[ROUTE_METADATA_KEY]) {
      target.constructor[ROUTE_METADATA_KEY] = []
    }

    const metadata: RouteMetadata = {
      method,
      path,
      middleware: options?.middleware || [],
      tags: options?.tags || [],
    }

    target.constructor[ROUTE_METADATA_KEY].push({
      ...metadata,
      propertyKey,
      handler: descriptor.value,
    })

    return descriptor
  }
}

/**
 * UseMiddleware decorator - applies middleware to a class or method
 */
export function UseMiddleware(...middleware: Function[]): ClassDecorator & MethodDecorator {
  return function (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) {
    if (propertyKey && descriptor) {
      // Method decorator
      if (!target.constructor[MIDDLEWARE_METADATA_KEY]) {
        target.constructor[MIDDLEWARE_METADATA_KEY] = new Map()
      }
      target.constructor[MIDDLEWARE_METADATA_KEY].set(propertyKey, middleware)
    } else {
      // Class decorator
      target[MIDDLEWARE_METADATA_KEY] = middleware
    }
    return descriptor || target
  }
}

/**
 * Parameter decorators for route handlers
 */
export function Param(key?: string): ParameterDecorator {
  return createParamDecorator('param', key)
}

export function Query(key?: string): ParameterDecorator {
  return createParamDecorator('query', key)
}

export function Body(): ParameterDecorator {
  return createParamDecorator('body')
}

export function Header(key?: string): ParameterDecorator {
  return createParamDecorator('header', key)
}

export function Cookie(key?: string): ParameterDecorator {
  return createParamDecorator('cookie', key)
}

export function InjectParam(token: string | symbol | Function): ParameterDecorator {
  return createParamDecorator('param', undefined, token)
}

function createParamDecorator(
  type: 'param' | 'query' | 'body' | 'header' | 'cookie',
  key?: string,
  token?: string | symbol | Function
): ParameterDecorator {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    if (!target.constructor[PARAM_METADATA_KEY]) {
      target.constructor[PARAM_METADATA_KEY] = new Map()
    }

    if (!target.constructor[PARAM_METADATA_KEY].has(propertyKey)) {
      target.constructor[PARAM_METADATA_KEY].set(propertyKey, [])
    }

    const metadata: ParamMetadata = {
      type,
      key,
      token,
    }

    target.constructor[PARAM_METADATA_KEY].get(propertyKey)[parameterIndex] = metadata
  }
}

/**
 * Metadata reader utility class
 */
export class MetadataReader {
  static getInjectableMetadata(target: Function): InjectableMetadata | undefined {
    return (target as any)[INJECTABLE_METADATA_KEY]
  }

  static getInjectMetadata(target: Function): InjectMetadata[] {
    return (target as any)[INJECT_METADATA_KEY] || []
  }

  static getOptionalMetadata(target: Function): boolean[] {
    return (target as any)[OPTIONAL_METADATA_KEY] || []
  }

  static getTaggedMetadata(target: Function): string[] {
    return (target as any)[TAGGED_METADATA_KEY] || []
  }

  static getControllerMetadata(target: Function): ControllerMetadata | undefined {
    return (target as any)[CONTROLLER_METADATA_KEY]
  }

  static getAllRoutes(target: Function): any[] {
    return (target as any)[ROUTE_METADATA_KEY] || []
  }

  static getMiddlewareMetadata(target: Function, propertyKey?: string | symbol): Function[] {
    if (propertyKey) {
      const methodMiddleware = (target as any)[MIDDLEWARE_METADATA_KEY]?.get(propertyKey)
      return methodMiddleware || []
    }
    return (target as any)[MIDDLEWARE_METADATA_KEY] || []
  }

  static getParamMetadata(target: Function, propertyKey: string | symbol): ParamMetadata[] {
    return (target as any)[PARAM_METADATA_KEY]?.get(propertyKey) || []
  }
}

/**
 * Modern Decorator Container
 */
export class DecoratorContainer extends Container {
  /**
   * Register a controller with automatic route discovery
   */
  registerController(controllerClass: Function): void {
    const metadata = MetadataReader.getControllerMetadata(controllerClass)
    if (!metadata) {
      throw new Error(`Class ${controllerClass.name} is not decorated with @Controller`)
    }

    // Register the controller as a service using the class constructor as token
    this.singleton(controllerClass, controllerClass as any)

    // Process routes
    const routes = MetadataReader.getAllRoutes(controllerClass)
    for (const route of routes) {
      // Route registration logic would go here
      // This is a simplified version for the DI system
    }
  }

  /**
   * Enhanced resolve method that handles decorator metadata
   */
  resolve<T>(token: string | symbol | Function, context?: ResolutionContext): T {
    // Check if token is a class with injectable metadata
    if (typeof token === 'function') {
      const metadata = MetadataReader.getInjectableMetadata(token)
      if (metadata) {
        // Auto-register if not already registered
        try {
          // Try to resolve first to see if it exists
          return super.resolve<T>(token, context)
        } catch {
          // If it doesn't exist, register it
          const scope = metadata.scope || 'transient'
          switch (scope) {
            case 'singleton':
              this.singleton(token, token as any)
              break
            case 'transient':
              this.transient(token, token as any)
              break
            default:
              this.transient(token, token as any)
          }
        }
      }
    }

    return super.resolve<T>(token, context)
  }
}

// Export a default instance
export const decoratorContainer: DecoratorContainer = new DecoratorContainer()
