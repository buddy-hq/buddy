# AGENTS.md

Buddy is a Bun + TypeScript monorepo managed by Turborepo and shipped as an Electron app for macOS and Windows.

## Product glossary

- Canonical vocabulary lives in `packages/buddy/src/learning/shared/teaching-vocabulary.ts`.
- **Persona:** Buddy's core agent; personas enable features.
- **Feature:** the only unit for authoring and access grouping; features own tools, skills, subagents, and surfaces.
- **Bench:** Buddy's first-class workspace for files, reading, artifacts, whiteboards, and other non-chat surfaces.
- **Easel:** a prototyping space inside Buddy DevTools.
- Tools, skills, and subagents are first-class OpenCode runtime capabilities.

## Ownership boundaries

- OpenCode owns the core agent loop, session runtime, tool registry, and permission engine under `vendor/opencode/packages/*`; Buddy integrates them through `packages/opencode-adapter`.
- Keep Buddy-specific product behavior, including Buddy tools, in Buddy-owned packages. Do not fork or reimplement the vendored runtime in `packages/buddy`.
- Edit `vendor/opencode` only when the user explicitly requests a tracked vendored patch.
- Internal APIs may break to simplify the design. Persisted user data and config must survive upgrades; migrate shape changes explicitly.

## Platform requirements

- Desktop changes must support both macOS and Windows unless the task is explicitly platform-specific.

## Local-state safety

- Never point tests, fixtures, or ad hoc scripts at the developer's real Buddy home, Electron `userData`, runtime XDG roots, or notebook `.buddy` state. Use configured temporary roots.
- Treat existing Buddy state as user data. Read it only when diagnosis requires it; mutate it only when the task explicitly requires that change.
- Stop only processes started by the current task. Never kill Buddy, Electron, or development servers by name or pattern.

## Generated files

- Do not edit `packages/web/src/routeTree.gen.ts`; change the route sources and regenerate it.
- Do not edit `packages/sdk/src/gen/`; change the OpenAPI source and regenerate the SDK.
- Do not edit build artifacts such as `dist/`, `.turbo/`, `*.tsbuildinfo`, or `*.log`.

## Verification

- For code changes, run `bun lint`, then `bun typecheck`, from the repository root. Never run typechecks concurrently.
- Use package scripts for focused tests of changed packages; never run raw `bun test`, vendor tests, or the full suite.
- Run `bun fmt` only when implementation is complete and the user is satisfied.

## Misc

- Use browser or computer-use verification only when the user explicitly requests or approves it.
- Address concrete security risks at deployed trust boundaries. Avoid disproportionate machinery for speculative threats, especially in development-only or maintainer-only paths.
