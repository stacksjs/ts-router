# Bun Router Playground

This playground contains examples and demos for the bun-router framework.

## Files

- `basic-di-demo.ts` - Basic router usage with simple routes and named routes
- `storage/framework/core/advanced-di-demo.ts` - Advanced router features including middleware, route groups, and error handling

## Running the Demos

```bash
# Run basic router demo
bun run playground/basic-di-demo.ts

# Run advanced router demo
bun run playground/storage/framework/core/advanced-di-demo.ts
```

## Features Demonstrated

### Basic Demo

- Simple route definitions (GET, POST)
- Path parameters (`/users/{id}`)
- Named routes with URL generation
- Basic request/response handling

### Advanced Demo

- Middleware (auth, logging)
- Route groups (`/api`, `/admin`)
- Advanced route parameters
- Query parameter handling
- Error handling
- Static file serving

## Cleanup

To clean up node_modules directories (as requested):

```bash
find . -name "node_modules" -type d -prune -exec rm -rf {} +
```

This command will remove all node_modules directories from the project.
