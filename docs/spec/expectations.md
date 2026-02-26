# project expectations

## stack

this is the core buddy stack. these may be extended with any other dependencies that ar needed to achieve buddy objectives.

- language
  - typescript
- tooling
  - bun

### server

- server
  - bun
  - hono
- storage
  - sqlite
- ai
  - aisdk
  - tanstack ai

### client- react - vite

- routing
  - tanstack router
- styling
  - shadcn
  - tailwind v4
- state management
  - zustand store
- libraries
  - zod

### api

- zod-hono-openapi
- with hey api used for code generation for the client sdk

### misc

- zod
- other tanstack projects
- testing
  - bun test runner
  - happy dom
- tooling
  - linting
    - eslint prettier
  - bun
    - use bun as tooling wherever it provide native options

## repo

- buddy is a monorepo managed with turborepo.
- expected pacakges
  - packages/buddy - main backend/agent package
  - packages/app - main vite app
  - packages/ui - shadcnui components and other ui related stuff

## tauri

<!-- @agents: don't implement this unless i explicitly say so. -->

- i will eventually make buddy a tauri app but i will start by dev with plain vite app and migrate to tauri later
