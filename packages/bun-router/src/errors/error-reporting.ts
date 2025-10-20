// @ts-nocheck
/**
 * Advanced Error Handling - Error Reporting Integration
 *
 * Integration with external error reporting services (Sentry, Bugsnag, etc.)
 */

import type { ErrorContext, RouterException } from './exceptions'

export interface ErrorReportingConfig {
  enabled: boolean
  service: 'sentry' | 'bugsnag' | 'custom'
  dsn?: string
  apiKey?: string
  environment?: string
  release?: string
  sampleRate?: number
  beforeSend?: (error: RouterException, context: ErrorContext) => RouterException | null
  filters?: {
    ignoreErrors?: (string | RegExp)[]
    ignoreCodes?: string[]
    ignoreUrls?: (string | RegExp)[]
    allowUrls?: (string | RegExp)[]
  }
  tags?: Record<string, string>
  user?: {
    id?: string
    email?: string
    username?: string
  }
  extra?: Record<string, any>
  breadcrumbs?: {
    enabled: boolean
    maxBreadcrumbs: number
  }
  performance?: {
    enabled: boolean
    tracesSampleRate: number
  }
}

export interface ErrorReport {
  error: RouterException
  context: ErrorContext
  fingerprint?: string[]
  tags?: Record<string, string>
  extra?: Record<string, any>
  user?: Record<string, any>
  level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal'
}

export interface ErrorReporter {
  report: (error: RouterException, context?: ErrorContext) => Promise<string | null>
  addBreadcrumb: (message: string, category?: string, level?: string, data?: Record<string, any>) => void
  setUser: (user: Record<string, any>) => void
  setTag: (key: string, value: string) => void
  setExtra: (key: string, value: any) => void
  setContext: (key: string, context: Record<string, any>) => void
  close: (timeout?: number) => Promise<boolean>
}

/**
 * Sentry error reporter implementation
 */
export class SentryReporter implements ErrorReporter {
  private config: ErrorReportingConfig
  private sentry: any

  constructor(config: ErrorReportingConfig) {
    this.config = config
    this.initializeSentry()
  }

  private async initializeSentry(): Promise<void> {
    try {
      // Dynamic import to avoid bundling if not used
      const Sentry = await import('@sentry/node')

      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment || 'production',
        release: this.config.release,
        sampleRate: this.config.sampleRate || 1.0,
        beforeSend: (event, hint) => {
          const error = hint.originalException as RouterException
          if (error && this.config.beforeSend) {
            const filteredError = this.config.beforeSend(error, error.context)
            return filteredError ? event : null
          }
          return event
        },
        ignoreErrors: this.config.filters?.ignoreErrors,
        denyUrls: this.config.filters?.ignoreUrls,
        allowUrls: this.config.filters?.allowUrls,
        initialScope: {
          tags: this.config.tags,
          extra: this.config.extra,
          user: this.config.user,
        },
        maxBreadcrumbs: this.config.breadcrumbs?.maxBreadcrumbs || 100,
        tracesSampleRate: this.config.performance?.tracesSampleRate || 0.1,
      })

      this.sentry = Sentry
    }
    catch (error) {
      console.warn('Failed to initialize Sentry:', error)
    }
  }

  async report(error: RouterException, context?: ErrorContext): Promise<string | null> {
    if (!this.sentry || !this.config.enabled) {
      return null
    }

    try {
      // Check if error should be ignored
      if (this.shouldIgnoreError(error)) {
        return null
      }

      const mergedContext = { ...error.context, ...context }

      return this.sentry.withScope((scope: any) => {
        // Set error context
        if (mergedContext.requestId) {
          scope.setTag('requestId', mergedContext.requestId)
        }
        if (mergedContext.userId) {
          scope.setUser({ id: mergedContext.userId })
        }
        if (mergedContext.traceId) {
          scope.setTag('traceId', mergedContext.traceId)
        }
        if (mergedContext.route) {
          scope.setTag('route', mergedContext.route)
        }
        if (mergedContext.method) {
          scope.setTag('method', mergedContext.method)
        }

        // Set error metadata
        scope.setTag('errorCode', error.code)
        scope.setTag('severity', error.severity)
        scope.setTag('category', error.category)
        scope.setLevel(this.mapSeverityToLevel(error.severity))

        // Set extra context
        scope.setExtra('statusCode', error.statusCode)
        scope.setExtra('retryable', error.retryable)
        scope.setExtra('timestamp', error.timestamp)
        scope.setExtra('context', mergedContext)

        // Set fingerprint for grouping
        const fingerprint = this.generateFingerprint(error)
        if (fingerprint.length > 0) {
          scope.setFingerprint(fingerprint)
        }

        return this.sentry.captureException(error)
      })
    }
    catch (reportingError) {
      console.error('Failed to report error to Sentry:', reportingError)
      return null
    }
  }

  addBreadcrumb(message: string, category = 'default', level = 'info', data?: Record<string, any>): void {
    if (!this.sentry || !this.config.breadcrumbs?.enabled) {
      return
    }

    this.sentry.addBreadcrumb({
      message,
      category,
      level,
      data,
      timestamp: Date.now() / 1000,
    })
  }

  setUser(user: Record<string, any>): void {
    if (!this.sentry)
      return
    this.sentry.setUser(user)
  }

  setTag(key: string, value: string): void {
    if (!this.sentry)
      return
    this.sentry.setTag(key, value)
  }

  setExtra(key: string, value: any): void {
    if (!this.sentry)
      return
    this.sentry.setExtra(key, value)
  }

  setContext(key: string, context: Record<string, any>): void {
    if (!this.sentry)
      return
    this.sentry.setContext(key, context)
  }

  async close(timeout = 2000): Promise<boolean> {
    if (!this.sentry)
      return true
    return this.sentry.close(timeout)
  }

  private shouldIgnoreError(error: RouterException): boolean {
    const filters = this.config.filters
    if (!filters)
      return false

    // Check ignore codes
    if (filters.ignoreCodes?.includes(error.code)) {
      return true
    }

    // Check ignore errors (message patterns)
    if (filters.ignoreErrors?.some((pattern) => {
      if (typeof pattern === 'string') {
        return error.message.includes(pattern)
      }
      return pattern.test(error.message)
    })) {
      return true
    }

    return false
  }

  private mapSeverityToLevel(severity: string): string {
    switch (severity) {
      case 'low': return 'info'
      case 'medium': return 'warning'
      case 'high': return 'error'
      case 'critical': return 'fatal'
      default: return 'error'
    }
  }

  private generateFingerprint(error: RouterException): string[] {
    const fingerprint: string[] = []

    // Group by error code and category
    fingerprint.push(error.code)
    fingerprint.push(error.category)

    // Add route if available for better grouping
    if (error.context.route) {
      fingerprint.push(error.context.route)
    }

    return fingerprint
  }
}

/**
 * Bugsnag error reporter implementation
 */
export class BugsnagReporter implements ErrorReporter {
  private config: ErrorReportingConfig
  private bugsnag: any

  constructor(config: ErrorReportingConfig) {
    this.config = config
    this.initializeBugsnag()
  }

  private async initializeBugsnag(): Promise<void> {
    try {
      // Dynamic import to avoid bundling if not used
      const Bugsnag = await import('@bugsnag/js')

      Bugsnag.start({
        apiKey: this.config.apiKey!,
        appVersion: this.config.release,
        releaseStage: this.config.environment || 'production',
        enabledReleaseStages: ['production', 'staging'],
        maxBreadcrumbs: this.config.breadcrumbs?.maxBreadcrumbs || 25,
        onError: (event) => {
          const error = event.originalError as RouterException
          if (error && this.config.beforeSend) {
            const filteredError = this.config.beforeSend(error, error.context)
            return filteredError !== null
          }
          return !this.shouldIgnoreError(error)
        },
      })

      this.bugsnag = Bugsnag
    }
    catch (error) {
      console.warn('Failed to initialize Bugsnag:', error)
    }
  }

  async report(error: RouterException, context?: ErrorContext): Promise<string | null> {
    if (!this.bugsnag || !this.config.enabled) {
      return null
    }

    try {
      if (this.shouldIgnoreError(error)) {
        return null
      }

      const mergedContext = { ...error.context, ...context }

      this.bugsnag.notify(error, (event: any) => {
        // Set severity
        event.severity = this.mapSeverityToBugsnag(error.severity)

        // Set context
        event.context = mergedContext.route || mergedContext.url

        // Set user
        if (mergedContext.userId) {
          event.setUser(mergedContext.userId, undefined, undefined)
        }

        // Add metadata
        event.addMetadata('error', {
          code: error.code,
          category: error.category,
          statusCode: error.statusCode,
          retryable: error.retryable,
          timestamp: error.timestamp,
        })

        event.addMetadata('request', {
          requestId: mergedContext.requestId,
          method: mergedContext.method,
          url: mergedContext.url,
          userAgent: mergedContext.userAgent,
          ip: mergedContext.ip,
        })

        // Set grouping hash
        event.groupingHash = this.generateGroupingHash(error)
      })

      return 'reported' // Bugsnag doesn't return event ID
    }
    catch (reportingError) {
      console.error('Failed to report error to Bugsnag:', reportingError)
      return null
    }
  }

  addBreadcrumb(message: string, category = 'manual', _level = 'info', data?: Record<string, any>): void {
    if (!this.bugsnag || !this.config.breadcrumbs?.enabled) {
      return
    }

    this.bugsnag.leaveBreadcrumb(message, data, category)
  }

  setUser(user: Record<string, any>): void {
    if (!this.bugsnag)
      return
    this.bugsnag.setUser(user.id, user.email, user.username)
  }

  setTag(key: string, value: string): void {
    // Bugsnag doesn't have tags, use metadata instead
    if (!this.bugsnag)
      return
    this.bugsnag.addMetadata('tags', { [key]: value })
  }

  setExtra(key: string, value: any): void {
    if (!this.bugsnag)
      return
    this.bugsnag.addMetadata('extra', { [key]: value })
  }

  setContext(key: string, context: Record<string, any>): void {
    if (!this.bugsnag)
      return
    this.bugsnag.addMetadata(key, context)
  }

  async close(): Promise<boolean> {
    // Bugsnag doesn't have a close method
    return true
  }

  private shouldIgnoreError(error: RouterException): boolean {
    const filters = this.config.filters
    if (!filters)
      return false

    if (filters.ignoreCodes?.includes(error.code)) {
      return true
    }

    if (filters.ignoreErrors?.some((pattern) => {
      if (typeof pattern === 'string') {
        return error.message.includes(pattern)
      }
      return pattern.test(error.message)
    })) {
      return true
    }

    return false
  }

  private mapSeverityToBugsnag(severity: string): string {
    switch (severity) {
      case 'low': return 'info'
      case 'medium': return 'warning'
      case 'high': return 'error'
      case 'critical': return 'error'
      default: return 'warning'
    }
  }

  private generateGroupingHash(error: RouterException): string {
    return `${error.code}-${error.category}-${error.context.route || 'unknown'}`
  }
}

/**
 * Custom error reporter for custom implementations
 */
export class CustomReporter implements ErrorReporter {
  private config: ErrorReportingConfig
  private reportHandler: (report: ErrorReport) => Promise<string | null>

  constructor(
    config: ErrorReportingConfig,
    reportHandler: (report: ErrorReport) => Promise<string | null>,
  ) {
    this.config = config
    this.reportHandler = reportHandler
  }

  async report(error: RouterException, context?: ErrorContext): Promise<string | null> {
    if (!this.config.enabled) {
      return null
    }

    try {
      const mergedContext = { ...error.context, ...context }

      if (this.config.beforeSend) {
        const filteredError = this.config.beforeSend(error, mergedContext)
        if (!filteredError) {
          return null
        }
      }

      const report: ErrorReport = {
        error,
        context: mergedContext,
        level: this.mapSeverityToLevel(error.severity),
        tags: this.config.tags,
        extra: this.config.extra,
        user: this.config.user,
      }

      return await this.reportHandler(report)
    }
    catch (reportingError) {
      console.error('Failed to report error with custom handler:', reportingError)
      return null
    }
  }

  addBreadcrumb(): void {
    // Custom implementation would handle this
  }

  setUser(): void {
    // Custom implementation would handle this
  }

  setTag(): void {
    // Custom implementation would handle this
  }

  setExtra(): void {
    // Custom implementation would handle this
  }

  setContext(): void {
    // Custom implementation would handle this
  }

  async close(): Promise<boolean> {
    return true
  }

  private mapSeverityToLevel(severity: string): 'debug' | 'info' | 'warning' | 'error' | 'fatal' {
    switch (severity) {
      case 'low': return 'info'
      case 'medium': return 'warning'
      case 'high': return 'error'
      case 'critical': return 'fatal'
      default: return 'error'
    }
  }
}

/**
 * Error reporting manager
 */
export class ErrorReportingManager {
  private reporters: ErrorReporter[] = []
  private breadcrumbs: Array<{ message: string, timestamp: Date, data?: any }> = []
  private maxBreadcrumbs = 50

  constructor(configs: ErrorReportingConfig[]) {
    this.initializeReporters(configs)
  }

  private initializeReporters(configs: ErrorReportingConfig[]): void {
    for (const config of configs) {
      if (!config.enabled)
        continue

      switch (config.service) {
        case 'sentry':
          this.reporters.push(new SentryReporter(config))
          break
        case 'bugsnag':
          this.reporters.push(new BugsnagReporter(config))
          break
        case 'custom':
          // Custom reporter would be added separately
          break
      }
    }
  }

  addReporter(reporter: ErrorReporter): void {
    this.reporters.push(reporter)
  }

  async report(error: RouterException, context?: ErrorContext): Promise<string[]> {
    const reportIds: string[] = []

    // Add breadcrumb for this error
    this.addBreadcrumb(`Error occurred: ${error.message}`, 'error', {
      code: error.code,
      severity: error.severity,
    })

    // Report to all configured reporters
    const promises = this.reporters.map(async (reporter) => {
      try {
        const reportId = await reporter.report(error, context)
        if (reportId) {
          reportIds.push(reportId)
        }
      }
      catch (reportingError) {
        console.error('Reporter failed:', reportingError)
      }
    })

    await Promise.allSettled(promises)
    return reportIds
  }

  addBreadcrumb(message: string, category = 'default', data?: any): void {
    // Add to internal breadcrumbs
    this.breadcrumbs.push({
      message,
      timestamp: new Date(),
      data: { category, ...data },
    })

    // Keep only recent breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs)
    }

    // Add to all reporters
    this.reporters.forEach((reporter) => {
      reporter.addBreadcrumb(message, category, 'info', data)
    })
  }

  setUser(user: Record<string, any>): void {
    this.reporters.forEach(reporter => reporter.setUser(user))
  }

  setTag(key: string, value: string): void {
    this.reporters.forEach(reporter => reporter.setTag(key, value))
  }

  setExtra(key: string, value: any): void {
    this.reporters.forEach(reporter => reporter.setExtra(key, value))
  }

  setContext(key: string, context: Record<string, any>): void {
    this.reporters.forEach(reporter => reporter.setContext(key, context))
  }

  async close(timeout = 5000): Promise<boolean> {
    const promises = this.reporters.map(reporter => reporter.close(timeout))
    const results = await Promise.allSettled(promises)
    return results.every(result => result.status === 'fulfilled' && result.value)
  }

  getBreadcrumbs(): Array<{ message: string, timestamp: Date, data?: any }> {
    return [...this.breadcrumbs]
  }
}

/**
 * Factory function to create error reporting manager
 */
export function createErrorReporting(configs: ErrorReportingConfig[]): ErrorReportingManager {
  return new ErrorReportingManager(configs)
}

/**
 * Default configuration presets
 */
export const ErrorReportingPresets = {
  sentry: (dsn: string, environment = 'production'): ErrorReportingConfig => ({
    enabled: true,
    service: 'sentry',
    dsn,
    environment,
    sampleRate: 1.0,
    breadcrumbs: {
      enabled: true,
      maxBreadcrumbs: 100,
    },
    performance: {
      enabled: true,
      tracesSampleRate: 0.1,
    },
    filters: {
      ignoreErrors: [
        'Non-Error promise rejection captured',
        'ResizeObserver loop limit exceeded',
      ],
      ignoreCodes: ['VALIDATION_ERROR'],
    },
  }),

  bugsnag: (apiKey: string, environment = 'production'): ErrorReportingConfig => ({
    enabled: true,
    service: 'bugsnag',
    apiKey,
    environment,
    breadcrumbs: {
      enabled: true,
      maxBreadcrumbs: 25,
    },
    filters: {
      ignoreCodes: ['VALIDATION_ERROR'],
    },
  }),

  development: (): ErrorReportingConfig => ({
    enabled: false,
    service: 'custom',
    environment: 'development',
  }),
}
