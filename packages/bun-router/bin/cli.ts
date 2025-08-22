/**
 * This file is a simple entry point to the CLI implementation.
 * The actual CLI code is now modularized in src/cli/ directory.
 */
import { createCLI } from '../src/cli/index'

// Create and run the CLI
const cli = createCLI()
cli.parse()
