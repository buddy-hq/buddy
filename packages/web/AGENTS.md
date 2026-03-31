# AGENTS.md

## Web Learnings (non-obvious)

- Treat backend+SDK as a compatibility contract and keep web state decoupled from vendored OpenCode internals.
- Stream reconnect logic must include state reconciliation; reconnecting transport alone is not enough to guarantee correct UI state.
- Busy/idle UI state should come from authoritative message lifecycle markers after sync/recovery, not only transient local flags.
- Keep import boundaries explicit so web-only modules do not accidentally resolve into other workspace packages through aliases.
- Markdown behavior should remain consistent across parsing and rendering layers when introducing formatting/link/math/code changes.
- Desktop directory selection should prefer platform bridge APIs when available, with a safe manual fallback for unsupported runtimes.


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
