import type { ESLintConfig } from '@stacksjs/eslint-config'
import stacks from '@stacksjs/eslint-config'

const config: ESLintConfig = stacks({
  stylistic: {
    indent: 2,
    quotes: 'single',
  },

  typescript: true,
  jsonc: true,
  yaml: true,
  rules: {
    // Allow console.log in development and test files
    'no-console': ['error', { allow: ['warn', 'error', 'log', 'info', 'debug'] }],
  },
  ignores: [
    'fixtures/**',
    '**/examples',
    '**/*.md',
  ],
})

export default config
