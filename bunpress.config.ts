import type { BunPressConfig } from 'bunpress'

const config: BunPressConfig = {
  name: 'bun-router',
  description: 'High-performance router for Bun',
  url: 'https://bun-router.stacksjs.com',

  theme: 'vitepress',

  themeConfig: {
    colors: {
      primary: '#f472b6',
    },
  },

  cloud: {
    driver: 'aws',
    region: 'us-east-1',
    domain: 'bun-router.stacksjs.com',
    subdomain: 'bun-router',
    baseDomain: 'stacksjs.com',
  },

  sidebar: [
    {
      text: 'Introduction',
      items: [
        { text: 'Overview', link: '/' },
        { text: 'Why bun-router', link: '/intro' },
        { text: 'Installation', link: '/install' },
        { text: 'Quick Start', link: '/quick-start' },
      ],
    },
    {
      text: 'Core Concepts',
      items: [
        { text: 'Routing Basics', link: '/features/routing-basics' },
        { text: 'Route Parameters', link: '/features/route-parameters' },
        { text: 'Route Groups', link: '/features/route-groups' },
        { text: 'Named Routes', link: '/features/named-routes' },
        { text: 'Resource Routes', link: '/features/resource-routes' },
        { text: 'Domain Routing', link: '/features/domain-routing' },
      ],
    },
    {
      text: 'Features',
      items: [
        { text: 'Middleware', link: '/features/middleware' },
        { text: 'Authentication', link: '/features/authentication' },
        { text: 'WebSockets', link: '/features/websockets' },
        { text: 'Cookie Handling', link: '/features/cookie-handling' },
        { text: 'Session Management', link: '/features/session-management' },
        { text: 'CSRF Protection', link: '/features/csrf-protection' },
        { text: 'File Streaming', link: '/features/file-streaming' },
        { text: 'Response Caching', link: '/features/response-caching' },
        { text: 'Rate Limiting', link: '/features/rate-limiting' },
        { text: 'View Rendering', link: '/features/view-rendering' },
        { text: 'Action Handlers', link: '/features/action-handlers' },
        { text: 'Security', link: '/features/security' },
      ],
    },
    {
      text: 'Advanced',
      items: [
        { text: 'Advanced Routing', link: '/ADVANCED_ROUTING' },
        { text: 'Error Handling', link: '/ADVANCED_ERROR_HANDLING' },
        { text: 'Bun Optimizations', link: '/BUN_OPTIMIZATIONS' },
        { text: 'TypeScript Enhancements', link: '/TYPESCRIPT_ENHANCEMENTS' },
        { text: 'Performance Monitoring', link: '/PERFORMANCE_MONITORING' },
        { text: 'Observability', link: '/OBSERVABILITY' },
        { text: 'Security', link: '/SECURITY' },
        { text: 'Dependency Injection', link: '/DEPENDENCY_INJECTION' },
        { text: 'Development Tools', link: '/DEVELOPMENT_TOOLS' },
        { text: 'File Upload', link: '/FILE_UPLOAD' },
        { text: 'Request/Response', link: '/REQUEST_RESPONSE_ENHANCEMENTS' },
      ],
    },
    {
      text: 'Reference',
      items: [
        { text: 'Configuration', link: '/config' },
        { text: 'API Reference', link: '/api-reference' },
      ],
    },
    {
      text: 'Community',
      items: [
        { text: 'Team', link: '/team' },
        { text: 'Sponsors', link: '/sponsors' },
        { text: 'Partners', link: '/partners' },
        { text: 'Showcase', link: '/showcase' },
        { text: 'Stargazers', link: '/stargazers' },
      ],
    },
    {
      text: 'Other',
      items: [
        { text: 'License', link: '/license' },
        { text: 'Postcardware', link: '/postcardware' },
      ],
    },
  ],

  navbar: [
    { text: 'Home', link: '/' },
    { text: 'Guide', link: '/quick-start' },
    { text: 'Features', link: '/features/middleware' },
    { text: 'API', link: '/api-reference' },
    { text: 'GitHub', link: 'https://github.com/stacksjs/bun-router' },
  ],

  socialLinks: [
    { icon: 'github', link: 'https://github.com/stacksjs/bun-router' },
    { icon: 'discord', link: 'https://discord.gg/stacksjs' },
    { icon: 'twitter', link: 'https://twitter.com/stacksjs' },
  ],
}

export default config
