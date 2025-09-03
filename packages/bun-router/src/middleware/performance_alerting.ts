import type { EnhancedRequest, NextFunction } from '../types'
import type { PerformanceMetrics } from './performance_monitor'

export interface AlertRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  metric: 'responseTime' | 'errorRate' | 'memoryUsage' | 'cpuUsage' | 'requestRate' | 'custom'
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  threshold: number
  duration?: number // Time window in ms to evaluate the condition
  severity: 'info' | 'warning' | 'critical'
  cooldown?: number // Minimum time between alerts in ms
  customEvaluator?: (metrics: PerformanceMetrics[]) => boolean
}

export interface AlertNotification {
  id: string
  ruleId: string
  ruleName: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  timestamp: number
  resolved: boolean
  resolvedAt?: number
  metadata: Record<string, any>
}

export interface AlertChannel {
  type: 'webhook' | 'slack' | 'email' | 'console' | 'custom'
  enabled: boolean
  config: {
    url?: string
    token?: string
    channel?: string
    email?: string
    customHandler?: (notification: AlertNotification) => Promise<void>
  }
  filters?: {
    severities?: Array<'info' | 'warning' | 'critical'>
    rules?: string[]
  }
}

export interface AlertingOptions {
  enabled?: boolean
  rules?: AlertRule[]
  channels?: AlertChannel[]
  defaultCooldown?: number
  maxAlerts?: number
  autoResolve?: boolean
  autoResolveTimeout?: number
}

export default class PerformanceAlerting {
  private options: AlertingOptions
  private rules: Map<string, AlertRule> = new Map()
  private channels: AlertChannel[] = []
  private notifications: AlertNotification[] = []
  private lastAlertTimes: Map<string, number> = new Map()
  private metricsBuffer: PerformanceMetrics[] = []
  private checkInterval?: Timer

  constructor(options: AlertingOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      defaultCooldown: options.defaultCooldown ?? 300000, // 5 minutes
      maxAlerts: options.maxAlerts ?? 1000,
      autoResolve: options.autoResolve ?? true,
      autoResolveTimeout: options.autoResolveTimeout ?? 600000, // 10 minutes
      ...options,
    }

    // Initialize rules
    if (options.rules) {
      for (const rule of options.rules) {
        this.rules.set(rule.id, rule)
      }
    }

    // Initialize channels
    this.channels = options.channels || []

    // Add default rules if none provided
    if (this.rules.size === 0) {
      this.addDefaultRules()
    }

    // Add default console channel if none provided
    if (this.channels.length === 0) {
      this.channels.push({
        type: 'console',
        enabled: true,
        config: {},
      })
    }

    if (this.options.enabled) {
      this.startAlertingEngine()
    }
  }

  private addDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-response-time',
        name: 'High Response Time',
        description: 'Alert when average response time exceeds threshold',
        enabled: true,
        metric: 'responseTime',
        condition: 'gt',
        threshold: 1000, // 1 second
        duration: 60000, // 1 minute
        severity: 'warning',
      },
      {
        id: 'critical-response-time',
        name: 'Critical Response Time',
        description: 'Alert when response time is critically high',
        enabled: true,
        metric: 'responseTime',
        condition: 'gt',
        threshold: 5000, // 5 seconds
        duration: 30000, // 30 seconds
        severity: 'critical',
      },
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds threshold',
        enabled: true,
        metric: 'errorRate',
        condition: 'gt',
        threshold: 0.05, // 5%
        duration: 120000, // 2 minutes
        severity: 'warning',
      },
      {
        id: 'critical-error-rate',
        name: 'Critical Error Rate',
        description: 'Alert when error rate is critically high',
        enabled: true,
        metric: 'errorRate',
        condition: 'gt',
        threshold: 0.1, // 10%
        duration: 60000, // 1 minute
        severity: 'critical',
      },
      {
        id: 'high-memory-usage',
        name: 'High Memory Usage',
        description: 'Alert when memory usage exceeds threshold',
        enabled: true,
        metric: 'memoryUsage',
        condition: 'gt',
        threshold: 512 * 1024 * 1024, // 512MB
        duration: 300000, // 5 minutes
        severity: 'warning',
      },
      {
        id: 'low-request-rate',
        name: 'Low Request Rate',
        description: 'Alert when request rate drops significantly',
        enabled: false,
        metric: 'requestRate',
        condition: 'lt',
        threshold: 1, // 1 request per second
        duration: 300000, // 5 minutes
        severity: 'info',
      },
    ]

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule)
    }
  }

  private startAlertingEngine(): void {
    this.checkInterval = setInterval(() => {
      this.evaluateRules()
      this.cleanupOldNotifications()
      this.autoResolveAlerts()
    }, 10000) // Check every 10 seconds
  }

  private evaluateRules(): void {
    const now = Date.now()

    for (const rule of this.rules.values()) {
      if (!rule.enabled)
        continue

      // Check cooldown
      const lastAlert = this.lastAlertTimes.get(rule.id)
      const cooldown = rule.cooldown || this.options.defaultCooldown || 300000
      if (lastAlert && now - lastAlert < cooldown)
        continue

      // Get relevant metrics for evaluation
      const duration = rule.duration || 60000
      const relevantMetrics = this.metricsBuffer.filter(
        m => now - m.timestamp <= duration,
      )

      if (relevantMetrics.length === 0)
        continue

      let shouldAlert = false
      let alertValue: any

      if (rule.metric === 'custom' && rule.customEvaluator) {
        shouldAlert = rule.customEvaluator(relevantMetrics)
        alertValue = 'custom condition'
      }
      else {
        const values = this.extractMetricValues(relevantMetrics, rule.metric)
        if (values.length === 0)
          continue

        const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length
        alertValue = avgValue

        shouldAlert = this.evaluateCondition(avgValue, rule.condition, rule.threshold)
      }

      if (shouldAlert) {
        this.triggerAlert(rule, alertValue, relevantMetrics)
        this.lastAlertTimes.set(rule.id, now)
      }
    }
  }

  private extractMetricValues(metrics: PerformanceMetrics[], metricType: string): number[] {
    switch (metricType) {
      case 'responseTime':
        return metrics.map(m => m.responseTime)
      case 'errorRate':
        return metrics.map(m => m.statusCode >= 400 ? 1 : 0)
      case 'memoryUsage':
        return metrics.map(m => m.memoryUsage)
      case 'cpuUsage':
        return metrics.map(m => m.cpuUsage || 0)
      case 'requestRate':
        // Calculate requests per second over the time window
        if (metrics.length < 2)
          return []
        const timeSpan = (metrics[metrics.length - 1].timestamp - metrics[0].timestamp) / 1000
        return [metrics.length / Math.max(timeSpan, 1)]
      default:
        return []
    }
  }

  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    switch (condition) {
      case 'gt': return value > threshold
      case 'gte': return value >= threshold
      case 'lt': return value < threshold
      case 'lte': return value <= threshold
      case 'eq': return Math.abs(value - threshold) < 0.001
      default: return false
    }
  }

  private async triggerAlert(rule: AlertRule, value: any, metrics: PerformanceMetrics[]): Promise<void> {
    const notification: AlertNotification = {
      id: this.generateId(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: this.formatAlertMessage(rule, value, metrics),
      timestamp: Date.now(),
      resolved: false,
      metadata: {
        rule,
        value,
        threshold: rule.threshold,
        condition: rule.condition,
        metricsCount: metrics.length,
      },
    }

    this.notifications.push(notification)

    // Send to channels
    for (const channel of this.channels) {
      if (!channel.enabled)
        continue
      if (channel.filters?.severities && !channel.filters.severities.includes(rule.severity))
        continue
      if (channel.filters?.rules && !channel.filters.rules.includes(rule.id))
        continue

      try {
        await this.sendNotification(channel, notification)
      }
      catch (error) {
        console.error(`Failed to send alert to ${channel.type}:`, error)
      }
    }

    // Cleanup old notifications
    if (this.notifications.length > (this.options.maxAlerts || 1000)) {
      this.notifications = this.notifications.slice(-(this.options.maxAlerts || 1000))
    }
  }

  private formatAlertMessage(rule: AlertRule, value: any, metrics: PerformanceMetrics[]): string {
    const formatValue = (val: number, metric: string): string => {
      switch (metric) {
        case 'responseTime':
          return `${Math.round(val)}ms`
        case 'errorRate':
          return `${Math.round(val * 100)}%`
        case 'memoryUsage':
          return `${Math.round(val / 1024 / 1024)}MB`
        case 'cpuUsage':
          return `${Math.round(val)}%`
        case 'requestRate':
          return `${Math.round(val)}/s`
        default:
          return String(val)
      }
    }

    const valueStr = typeof value === 'number' ? formatValue(value, rule.metric) : String(value)
    const thresholdStr = formatValue(rule.threshold, rule.metric)

    return `${rule.name}: ${valueStr} ${rule.condition} ${thresholdStr} (${metrics.length} samples)`
  }

  private async sendNotification(channel: AlertChannel, notification: AlertNotification): Promise<void> {
    switch (channel.type) {
      case 'console':
        this.sendConsoleNotification(notification)
        break
      case 'webhook':
        await this.sendWebhookNotification(channel, notification)
        break
      case 'slack':
        await this.sendSlackNotification(channel, notification)
        break
      case 'email':
        await this.sendEmailNotification(channel, notification)
        break
      case 'custom':
        if (channel.config.customHandler) {
          await channel.config.customHandler(notification)
        }
        break
    }
  }

  private sendConsoleNotification(notification: AlertNotification): void {
    const emoji = notification.severity === 'critical'
      ? '🚨'
      : notification.severity === 'warning' ? '⚠️' : 'ℹ️'

    console.log(`${emoji} ALERT [${notification.severity.toUpperCase()}]: ${notification.message}`)
    console.log(`   Rule: ${notification.ruleName} (${notification.ruleId})`)
    console.log(`   Time: ${new Date(notification.timestamp).toISOString()}`)
  }

  private async sendWebhookNotification(channel: AlertChannel, notification: AlertNotification): Promise<void> {
    if (!channel.config.url)
      return

    const payload = {
      alert: notification,
      timestamp: new Date(notification.timestamp).toISOString(),
      service: 'bun-router',
    }

    await fetch(channel.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(channel.config.token && { Authorization: `Bearer ${channel.config.token}` }),
      },
      body: JSON.stringify(payload),
    })
  }

  private async sendSlackNotification(channel: AlertChannel, notification: AlertNotification): Promise<void> {
    if (!channel.config.url)
      return

    const color = notification.severity === 'critical'
      ? 'danger'
      : notification.severity === 'warning' ? 'warning' : 'good'

    const emoji = notification.severity === 'critical'
      ? ':rotating_light:'
      : notification.severity === 'warning' ? ':warning:' : ':information_source:'

    const payload = {
      channel: channel.config.channel,
      username: 'Performance Monitor',
      icon_emoji: ':chart_with_upwards_trend:',
      attachments: [{
        color,
        title: `${emoji} ${notification.ruleName}`,
        text: notification.message,
        fields: [
          {
            title: 'Severity',
            value: notification.severity.toUpperCase(),
            short: true,
          },
          {
            title: 'Time',
            value: new Date(notification.timestamp).toISOString(),
            short: true,
          },
        ],
        footer: 'bun-router Performance Monitor',
        ts: Math.floor(notification.timestamp / 1000),
      }],
    }

    await fetch(channel.config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  private async sendEmailNotification(channel: AlertChannel, notification: AlertNotification): Promise<void> {
    // Email implementation would require an email service integration
    // This is a placeholder for the interface
    console.log(`Email notification would be sent to ${channel.config.email}:`, notification.message)
  }

  private cleanupOldNotifications(): void {
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    const cutoff = Date.now() - maxAge

    this.notifications = this.notifications.filter(n => n.timestamp > cutoff)
  }

  private autoResolveAlerts(): void {
    if (!this.options.autoResolve)
      return

    const timeout = this.options.autoResolveTimeout || 600000
    const cutoff = Date.now() - timeout

    for (const notification of this.notifications) {
      if (!notification.resolved && notification.timestamp < cutoff) {
        notification.resolved = true
        notification.resolvedAt = Date.now()
      }
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15)
      + Math.random().toString(36).substring(2, 15)
  }

  // Public API methods
  addMetrics(metrics: PerformanceMetrics): void {
    this.metricsBuffer.push(metrics)

    // Keep only recent metrics (last hour)
    const maxAge = 60 * 60 * 1000 // 1 hour
    const cutoff = Date.now() - maxAge
    this.metricsBuffer = this.metricsBuffer.filter(m => m.timestamp > cutoff)
  }

  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule)
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId)
  }

  updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(ruleId)
    if (rule) {
      this.rules.set(ruleId, { ...rule, ...updates })
    }
  }

  addChannel(channel: AlertChannel): void {
    this.channels.push(channel)
  }

  removeChannel(index: number): void {
    this.channels.splice(index, 1)
  }

  getActiveAlerts(): AlertNotification[] {
    return this.notifications.filter(n => !n.resolved)
  }

  getAllNotifications(): AlertNotification[] {
    return [...this.notifications]
  }

  resolveAlert(alertId: string): void {
    const alert = this.notifications.find(n => n.id === alertId)
    if (alert && !alert.resolved) {
      alert.resolved = true
      alert.resolvedAt = Date.now()
    }
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response> {
    // This middleware doesn't intercept requests, it just provides the alerting service
    return await next()
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
    this.rules.clear()
    this.channels = []
    this.notifications = []
    this.lastAlertTimes.clear()
    this.metricsBuffer = []
  }
}

// Factory function for easy use
export function performanceAlerting(options: AlertingOptions = {}): PerformanceAlerting {
  return new PerformanceAlerting(options)
}
