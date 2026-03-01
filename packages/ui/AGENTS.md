# Agents instructions for package/ui

- `packages/ui` is Buddy product UI-only; it should not depend on vendored OpenCode core internals.
- Keep this package design-system focused. App/runtime behavior should stay in `packages/web` or `packages/buddy`.
- Shared components: `packages/ui/src/components/ui`; export from `packages/ui/src/index.ts`, consume via `@buddy/ui`.
- Tailwind v4 scanning enabled via `@source "./**/*.{ts,tsx}";` in `packages/ui/src/index.css` — do not remove.

- Components library: shadcn
- Styling: tailwind v4

## How to build ui components

- first look into existing shadcn components.
  - if found: use it directly
- else
  - create a component with in similar style, taste, and theme using base theme in `packages/ui/src/index.css`

## DON'T DO

- Never modify the theme file `packages/ui/src/index.css` without the consent of the user.
- Never write raw css, use tailwind v4, or tailwind plugins
- Never modify the core shadcn components without user's explicit consent.
  - if consent to modify is given
    - copy the component in `components/ui/custom`
    - modify the copy
    - use the copy

## Misc

- For Radix/shadcn tooltips, avoid `asChild` wrappers unless they forward refs and DOM props correctly end-to-end.
- Prefer styling `TooltipTrigger` directly when possible; broken ref/event composition is a common cause of tooltips not opening.
