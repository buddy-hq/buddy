# Agents instructions for package/ui

- `packages/ui` is Buddy product UI-only; it should not depend on vendored OpenCode core internals.
- Keep this package design-system focused. App/runtime behavior should stay in `packages/web` or `packages/buddy`.
- Shared components: `packages/ui/src/components/ui`; export from `packages/ui/src/index.ts`, consume via `@buddy/ui`.
- Tailwind v4 scanning enabled via `@source "./**/*.{ts,tsx}";` in `packages/ui/src/index.css` — do not remove.

- Component foundation: shadcn primitives/components
- Styling system: Buddy-owned token layer + Tailwind v4 (not shadcn out-of-the-box styles)

## How to build ui components

- first look into existing `packages/ui/src/components/ui` components.
  - many started from shadcn but are now Buddy-owned extensions
  - if found: use and adapt the Buddy component directly
- else
  - create a component in similar style/taste using Buddy tokens from `packages/ui/src/index.css`

## DON'T DO

- Never modify the theme file `packages/ui/src/index.css` without the consent of the user.
- Never write raw css, use tailwind v4, or tailwind plugins
- Do not re-introduce shadcn default theme mappings/classes; keep using Buddy token classes and generated token CSS.

## Misc

- For Radix/shadcn tooltips, avoid `asChild` wrappers unless they forward refs and DOM props correctly end-to-end.
- Prefer styling `TooltipTrigger` directly when possible; broken ref/event composition is a common cause of tooltips not opening.
