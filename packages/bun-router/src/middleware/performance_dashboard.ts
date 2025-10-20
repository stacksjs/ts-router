import type { EnhancedRequest, NextFunction } from '../types'
import type { TraceSpan } from './request_tracer'
import process from 'node:process'

export interface DashboardOptions {
  enabled?: boolean
  path?: string
  title?: string
  refreshInterval?: number
  maxMetrics?: number
  authentication?: {
    enabled?: boolean
    username?: string
    password?: string
    apiKey?: string
  }
  features?: {
    realTimeMetrics?: boolean
    historicalCharts?: boolean
    alertsPanel?: boolean
    tracingView?: boolean
    systemMetrics?: boolean
  }
}

export interface DashboardData {
  metrics: {
    current: {
      totalRequests: number
      averageResponseTime: number
      errorRate: number
      requestsPerSecond: number
      memoryUsage: number
      cpuUsage: number
    }
    historical: Array<{
      timestamp: number
      responseTime: number
      memoryUsage: number
      requestCount: number
      errorCount: number
    }>
    distribution: {
      statusCodes: Record<number, number>
      paths: Record<string, number>
      methods: Record<string, number>
      responseTimes: Array<{ range: string, count: number }>
    }
  }
  alerts: Array<{
    id: string
    type: 'warning' | 'critical'
    message: string
    timestamp: number
    resolved: boolean
  }>
  traces: TraceSpan[]
  system: {
    uptime: number
    nodeVersion: string
    bunVersion: string
    platform: string
    arch: string
    memory: NodeJS.MemoryUsage
    cpu: NodeJS.CpuUsage
  }
}

export default class PerformanceDashboard {
  private options: DashboardOptions
  private metricsHistory: Array<{
    timestamp: number
    responseTime: number
    memoryUsage: number
    requestCount: number
    errorCount: number
  }> = []

  private alerts: Array<{
    id: string
    type: 'warning' | 'critical'
    message: string
    timestamp: number
    resolved: boolean
  }> = []

  private startTime: number = Date.now()

  constructor(options: DashboardOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      path: options.path ?? '/performance',
      title: options.title ?? 'Performance Dashboard',
      refreshInterval: options.refreshInterval ?? 5000,
      maxMetrics: options.maxMetrics ?? 1000,
      authentication: {
        enabled: false,
        ...options.authentication,
      },
      features: {
        realTimeMetrics: true,
        historicalCharts: true,
        alertsPanel: true,
        tracingView: true,
        systemMetrics: true,
        ...options.features,
      },
    }
  }

  private isAuthenticated(req: EnhancedRequest): boolean {
    if (!this.options.authentication?.enabled)
      return true

    const auth = req.headers.get('authorization')
    const apiKey = req.headers.get('x-api-key')

    if (this.options.authentication.apiKey && apiKey === this.options.authentication.apiKey) {
      return true
    }

    if (auth && this.options.authentication.username && this.options.authentication.password) {
      const [type, credentials] = auth.split(' ')
      if (type === 'Basic') {
        const decoded = atob(credentials)
        const [username, password] = decoded.split(':')
        return username === this.options.authentication.username
          && password === this.options.authentication.password
      }
    }

    return false
  }

  private generateDashboardHTML(data: DashboardData): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.options.title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }
        .header {
            background: #2c3e50;
            color: white;
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 { font-size: 1.5rem; }
        .status { 
            display: flex; 
            gap: 1rem; 
            align-items: center;
        }
        .status-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            font-size: 0.8rem;
        }
        .status-value {
            font-size: 1.2rem;
            font-weight: bold;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
        }
        .card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card h2 {
            margin-bottom: 1rem;
            color: #2c3e50;
            font-size: 1.2rem;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid #eee;
        }
        .metric:last-child { border-bottom: none; }
        .metric-label { font-weight: 500; }
        .metric-value { 
            font-weight: bold;
            color: #27ae60;
        }
        .metric-value.warning { color: #f39c12; }
        .metric-value.critical { color: #e74c3c; }
        .alert {
            padding: 0.75rem;
            margin: 0.5rem 0;
            border-radius: 4px;
            border-left: 4px solid;
        }
        .alert.warning {
            background: #fff3cd;
            border-color: #f39c12;
            color: #856404;
        }
        .alert.critical {
            background: #f8d7da;
            border-color: #e74c3c;
            color: #721c24;
        }
        .chart-container {
            height: 200px;
            background: #f8f9fa;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #666;
        }
        .distribution {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }
        .distribution-item {
            text-align: center;
            padding: 1rem;
            background: #f8f9fa;
            border-radius: 4px;
        }
        .distribution-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: #2c3e50;
        }
        .distribution-label {
            font-size: 0.8rem;
            color: #666;
            margin-top: 0.5rem;
        }
        .trace {
            padding: 0.75rem;
            margin: 0.5rem 0;
            background: #f8f9fa;
            border-radius: 4px;
            border-left: 4px solid #3498db;
        }
        .trace-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }
        .trace-operation {
            font-weight: bold;
            color: #2c3e50;
        }
        .trace-duration {
            color: #666;
            font-size: 0.9rem;
        }
        .trace-details {
            font-size: 0.8rem;
            color: #666;
        }
        .refresh-indicator {
            position: fixed;
            top: 1rem;
            right: 1rem;
            background: #27ae60;
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            font-size: 0.8rem;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .refresh-indicator.active { opacity: 1; }
        @media (max-width: 768px) {
            .container {
                grid-template-columns: 1fr;
                padding: 1rem;
            }
            .header {
                padding: 1rem;
                flex-direction: column;
                gap: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.options.title}</h1>
        <div class="status">
            <div class="status-item">
                <div class="status-value">${data.metrics.current.totalRequests}</div>
                <div>Total Requests</div>
            </div>
            <div class="status-item">
                <div class="status-value">${Math.round(data.metrics.current.averageResponseTime)}ms</div>
                <div>Avg Response</div>
            </div>
            <div class="status-item">
                <div class="status-value">${Math.round(data.metrics.current.errorRate * 100)}%</div>
                <div>Error Rate</div>
            </div>
            <div class="status-item">
                <div class="status-value">${Math.round(data.metrics.current.requestsPerSecond)}/s</div>
                <div>Requests/sec</div>
            </div>
        </div>
    </div>

    <div class="container">
        ${this.options.features?.realTimeMetrics
          ? `
        <div class="card">
            <h2>Real-time Metrics</h2>
            <div class="metric">
                <span class="metric-label">Response Time</span>
                <span class="metric-value">${Math.round(data.metrics.current.averageResponseTime)}ms</span>
            </div>
            <div class="metric">
                <span class="metric-label">Memory Usage</span>
                <span class="metric-value">${Math.round(data.metrics.current.memoryUsage / 1024 / 1024)}MB</span>
            </div>
            <div class="metric">
                <span class="metric-label">CPU Usage</span>
                <span class="metric-value">${Math.round(data.metrics.current.cpuUsage)}%</span>
            </div>
            <div class="metric">
                <span class="metric-label">Requests/sec</span>
                <span class="metric-value">${Math.round(data.metrics.current.requestsPerSecond)}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Error Rate</span>
                <span class="metric-value ${data.metrics.current.errorRate > 0.1 ? 'critical' : data.metrics.current.errorRate > 0.05 ? 'warning' : ''}">${Math.round(data.metrics.current.errorRate * 100)}%</span>
            </div>
        </div>
        `
          : ''}

        ${this.options.features?.historicalCharts
          ? `
        <div class="card">
            <h2>Historical Performance</h2>
            <div class="chart-container">
                Response Time Chart (${data.metrics.historical.length} data points)
            </div>
        </div>
        `
          : ''}

        <div class="card">
            <h2>Request Distribution</h2>
            <div class="distribution">
                ${Object.entries(data.metrics.distribution.statusCodes).map(([code, count]) => `
                    <div class="distribution-item">
                        <div class="distribution-value">${count}</div>
                        <div class="distribution-label">HTTP ${code}</div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="card">
            <h2>Top Endpoints</h2>
            ${Object.entries(data.metrics.distribution.paths)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 10)
              .map(([path, count]) => `
                    <div class="metric">
                        <span class="metric-label">${path}</span>
                        <span class="metric-value">${count}</span>
                    </div>
                `)
              .join('')}
        </div>

        ${this.options.features?.alertsPanel
          ? `
        <div class="card">
            <h2>Active Alerts</h2>
            ${data.alerts.length === 0 ? '<p>No active alerts</p>' : ''}
            ${data.alerts.filter(alert => !alert.resolved).map(alert => `
                <div class="alert ${alert.type}">
                    <strong>${alert.type.toUpperCase()}:</strong> ${alert.message}
                    <br><small>${new Date(alert.timestamp).toLocaleString()}</small>
                </div>
            `).join('')}
        </div>
        `
          : ''}

        ${this.options.features?.tracingView
          ? `
        <div class="card">
            <h2>Recent Traces</h2>
            ${data.traces.slice(0, 10).map(trace => `
                <div class="trace">
                    <div class="trace-header">
                        <span class="trace-operation">${trace.operationName}</span>
                        <span class="trace-duration">${Math.round((trace.duration || 0) * 100) / 100}ms</span>
                    </div>
                    <div class="trace-details">
                        Trace ID: ${trace.traceId} | Status: ${trace.status}
                        ${trace.error ? ` | Error: ${trace.error}` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
        `
          : ''}

        ${this.options.features?.systemMetrics
          ? `
        <div class="card">
            <h2>System Information</h2>
            <div class="metric">
                <span class="metric-label">Uptime</span>
                <span class="metric-value">${Math.round(data.system.uptime / 1000 / 60)} minutes</span>
            </div>
            <div class="metric">
                <span class="metric-label">Node.js</span>
                <span class="metric-value">${data.system.nodeVersion}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Platform</span>
                <span class="metric-value">${data.system.platform} ${data.system.arch}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Heap Used</span>
                <span class="metric-value">${Math.round(data.system.memory.heapUsed / 1024 / 1024)}MB</span>
            </div>
            <div class="metric">
                <span class="metric-label">RSS</span>
                <span class="metric-value">${Math.round(data.system.memory.rss / 1024 / 1024)}MB</span>
            </div>
        </div>
        `
          : ''}
    </div>

    <div class="refresh-indicator" id="refreshIndicator">Updated</div>

    <script>
        let refreshInterval;
        
        function startAutoRefresh() {
            refreshInterval = setInterval(async () => {
                try {
                    const response = await fetch('${this.options.path}/api/data');
                    if (response.ok) {
                        const indicator = document.getElementById('refreshIndicator');
                        indicator.classList.add('active');
                        setTimeout(() => indicator.classList.remove('active'), 1000);
                        
                        // In a real implementation, we would update the DOM with new data
                        // For now, we'll just refresh the page
                        setTimeout(() => window.location.reload(), ${this.options.refreshInterval});
                    }
                } catch (error) {
                    console.error('Failed to refresh data:', error);
                }
            }, ${this.options.refreshInterval});
        }

        // Start auto-refresh
        startAutoRefresh();

        // Stop refresh when page is hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearInterval(refreshInterval);
            } else {
                startAutoRefresh();
            }
        });
    </script>
</body>
</html>
    `
  }

  private async getDashboardData(
    performanceMonitor?: any,
    requestTracer?: any,
  ): Promise<DashboardData> {
    const now = Date.now()

    // Get metrics from performance monitor if available
    const metrics = {
      current: {
        totalRequests: 0,
        averageResponseTime: 0,
        errorRate: 0,
        requestsPerSecond: 0,
        memoryUsage: 0,
        cpuUsage: 0,
      },
      historical: this.metricsHistory,
      distribution: {
        statusCodes: {} as Record<number, number>,
        paths: {} as Record<string, number>,
        methods: {} as Record<string, number>,
        responseTimes: [] as Array<{ range: string, count: number }>,
      },
    }

    if (performanceMonitor && typeof performanceMonitor.getAggregatedMetrics === 'function') {
      const aggregated = performanceMonitor.getAggregatedMetrics(60000) // Last minute
      metrics.current = {
        totalRequests: aggregated.totalRequests,
        averageResponseTime: aggregated.averageResponseTime,
        errorRate: aggregated.errorRate,
        requestsPerSecond: aggregated.requestsPerSecond,
        memoryUsage: aggregated.averageMemoryUsage,
        cpuUsage: 0, // Would need CPU monitoring
      }
      metrics.distribution.statusCodes = aggregated.statusCodeDistribution
      metrics.distribution.paths = aggregated.pathDistribution
    }

    // Get traces from request tracer if available
    let traces: TraceSpan[] = []
    if (requestTracer && typeof requestTracer.getActiveSpans === 'function') {
      traces = requestTracer.getActiveSpans()
    }

    // System information
    const system = {
      uptime: now - this.startTime,
      nodeVersion: process.version,
      bunVersion: process.versions.bun || 'N/A',
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    }

    return {
      metrics,
      alerts: this.alerts,
      traces,
      system,
    }
  }

  async handle(req: EnhancedRequest, next: NextFunction): Promise<Response | null> {
    if (!this.options.enabled) {
      const response = await next()
      return response || new Response('Internal Server Error', { status: 500 })
    }

    const url = new URL(req.url)

    // Check if this is a dashboard request
    if (url.pathname === this.options.path) {
      if (!this.isAuthenticated(req)) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Performance Dashboard"',
          },
        })
      }

      const data = await this.getDashboardData()
      const html = this.generateDashboardHTML(data)

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    // API endpoint for dashboard data
    if (url.pathname === `${this.options.path}/api/data`) {
      if (!this.isAuthenticated(req)) {
        return new Response('Unauthorized', { status: 401 })
      }

      const data = await this.getDashboardData()

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    return await next()
  }

  addAlert(type: 'warning' | 'critical', message: string): void {
    this.alerts.push({
      id: Math.random().toString(36).substring(2, 15),
      type,
      message,
      timestamp: Date.now(),
      resolved: false,
    })

    // Keep only recent alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100)
    }
  }

  resolveAlert(id: string): void {
    const alert = this.alerts.find(a => a.id === id)
    if (alert) {
      alert.resolved = true
    }
  }

  updateMetricsHistory(data: {
    responseTime: number
    memoryUsage: number
    requestCount: number
    errorCount: number
  }): void {
    this.metricsHistory.push({
      timestamp: Date.now(),
      ...data,
    })

    // Keep only recent history
    const maxEntries = this.options.maxMetrics || 1000
    if (this.metricsHistory.length > maxEntries) {
      this.metricsHistory = this.metricsHistory.slice(-maxEntries)
    }
  }
}

// Factory function for easy use
export function performanceDashboard(options: DashboardOptions = {}): (req: EnhancedRequest, next: NextFunction) => Promise<Response | null> {
  const instance = new PerformanceDashboard(options)
  return async (req: EnhancedRequest, next: NextFunction) => instance.handle(req, next)
}
