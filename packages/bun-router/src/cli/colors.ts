/**
 * Simple color utility for CLI output without external dependencies
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
}

export const chalk = {
  red: (text: string) => `${colors.red}${text}${colors.reset}`,
  green: (text: string) => `${colors.green}${text}${colors.reset}`,
  yellow: (text: string) => `${colors.yellow}${text}${colors.reset}`,
  blue: (text: string) => `${colors.blue}${text}${colors.reset}`,
  cyan: (text: string) => `${colors.cyan}${text}${colors.reset}`,
  white: (text: string) => `${colors.white}${text}${colors.reset}`,
  gray: (text: string) => `${colors.gray}${text}${colors.reset}`,
  bold: (text: string) => `${colors.bold}${text}${colors.reset}`,
  dim: (text: string) => `${colors.dim}${text}${colors.reset}`,
  hex: (color: string) => (text: string) => text, // Simple passthrough for hex colors
}
