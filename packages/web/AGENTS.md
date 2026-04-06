# AGENTS.md
- call bakend using the sdk; NOT manual fetch.
  - we use @hey-api/openapi-ts to automatically generate its JavaScript/TypeScript SDK from an OpenAPI schema. 


<!-- intent-skills:start -->
# Skill mappings - when working in these areas, load the linked skill file into context.
skills:
  - task: "adding or changing file-based routes, route trees, or router setup in packages/web/src/routes and packages/web/src/app.tsx"
    load: "../../node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/SKILL.md"
  - task: "working on redirects or route guards that use beforeLoad and redirect, such as the /skills route"
    load: "../../node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/auth-and-guards/SKILL.md"
  - task: "changing validated search params or URL-backed settings state, such as the /settings tab search param"
    load: "../../node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/search-params/SKILL.md"
  - task: "changing TanStack Router navigation flows, useNavigate behavior, or route preloading"
    load: "../../node_modules/.bun/@tanstack+router-core@1.168.6/node_modules/@tanstack/router-core/skills/router-core/navigation/SKILL.md"
  - task: "changing TanStack Router Vite plugin setup, route generation, or automatic code splitting in packages/web/vite.config.ts"
    load: "./node_modules/@tanstack/router-plugin/skills/router-plugin/SKILL.md"
  - task: "Virtualize long scroll lists in packages/web with @tanstack/react-virtual"
    load: ".agents/skills/tanstack-react-virtual/SKILL.md"
  - task: "Adjust TanStack Router plugin route generation behavior"
    load: "packages/web/node_modules/@tanstack/router-plugin/skills/router-plugin/SKILL.md"
<!-- intent-skills:end -->
