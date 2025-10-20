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
    'no-console': 'off',
    // Disable regex strictness rules as requested
    'no-control-regex': 'off',
    'new-cap': 'off',
    'regexp/no-super-linear-backtracking': 'off',
  },
  ignores: [
    'fixtures/**',
    '**/examples',
    '**/*.md',
  ],
})

export default config
