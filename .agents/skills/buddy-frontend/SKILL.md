---
name: buddy-frontend
description: Guides development of the Buddy frontend, including architecture, design principles, and usage of core libraries, components, motion, and routing patterns.
---

# Buddy Frontend

- React-Vite App
- uses Tanstack Router, Tanstack Virtual,
- distributed via Electron
- uses tailwind v4
- modified `shadcn/ui` as the components library.
- framer motion as the motion library.
- theme colors: `packages/ui/src/generated/theme-tokens.css`

## Frontent Packages

- `packages/web`
- `packages/ui`
- `packages/desktop-electron`

## Icons
- icons library is installed as a dependency in `packages/ui`

## Design Philosophy

- Minimalism
- How to think about design: `.agents/skills/frontend-design`

## Components

- Buddy uses a heavily themed and modified version of `shadcn/ui` components library.
- Skill: `.agents/skills/shadcn-buddy`

## Motion

- Buddy uses framer motion and native tailwind animations for motion. The philosophy of using motion in buddy is described in:
- Skill `.agents/skills/emil-design-eng`

## React Best Practices

- Buddy is a React app that follows the react best practices described in
- Skill: `.agents/skills/react-best-practices`

## Tanstack (paths may be off; be careful)

Skill mappings - when working in these areas, load the linked skill file into context.

skills:

- task: "adding or changing file-based routes, route trees, or router setup in packages/web/src/routes and packages/web/src/app.tsx"
  load: "node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/SKILL.md"
- task: "working on redirects or route guards that use beforeLoad and redirect, such as the /skills route"
  load: "node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/auth-and-guards/SKILL.md"
- task: "changing validated search params or URL-backed settings state, such as the /settings tab search param"
  load: "node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/search-params/SKILL.md"
- task: "changing TanStack Router navigation flows, useNavigate behavior, or route preloading"
  load: "node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/navigation/SKILL.md"
- task: "changing TanStack Router Vite plugin setup, route generation, or automatic code splitting in packages/web/vite.config.ts"
  load: "/node_modules/@tanstack/router-plugin/skills/router-plugin/SKILL.md"
- task: "Virtualize long scroll lists in packages/web with @tanstack/react-virtual"
  load: ".agents/skills/tanstack-react-virtual/SKILL.md"
- task: "Adjust TanStack Router plugin route generation behavior"
  load: "packages/web/node_modules/@tanstack/router-plugin/skills/router-plugin/SKILL.md"
