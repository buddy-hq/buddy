# Agents instructions for package/ui

- `packages/ui` is Buddy product UI-only; it should not depend on vendored OpenCode core internals.
- Keep this package design-system focused. App/runtime behavior should stay in `packages/web` or `packages/buddy`.
- For Radix/shadcn tooltips, avoid `asChild` wrappers unless they forward refs and DOM props correctly end-to-end.
- Prefer styling `TooltipTrigger` directly when possible; broken ref/event composition is a common cause of tooltips not opening.
