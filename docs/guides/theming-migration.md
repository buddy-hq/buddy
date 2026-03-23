# Theming Migration Guide

This plan removes the shadcn bridge without replacing it with another hand-maintained map.

The goal is:
- use vendor tokens as the only theme source of truth
- migrate shadcn classes only where the replacement is actually equivalent
- handle ambiguous classes by component recipe, not by a global blind replace
- remove the bridge only after runtime, preload, and class usage are ready

## Tailwind Token Strategy

Do not import the vendor Tailwind registry.

Also do not hand-maintain a new `@theme inline` table in `packages/ui/src/index.css`.

The stable Buddy contract should be:
- runtime values come from theme JSON via `resolveThemeVariant(...)` and `themeToCss(...)`
- Tailwind classes come from a Buddy-owned generated file that exposes every resolved token as a Tailwind color

That means we generate a file with entries like:
- `--color-background-base: var(--background-base);`
- `--color-surface-raised-base: var(--surface-raised-base);`
- `--color-text-base: var(--text-base);`
- `--color-border-base: var(--border-base);`
- `--color-border-interactive-base: var(--border-interactive-base);`
- `--color-icon-success-base: var(--icon-success-base);`

Generation rule:
1. Resolve the default theme variants and collect the union of token keys.
2. Generate a Buddy-owned Tailwind token file from that manifest.
3. Expose every token as `--color-<token>: var(--<token>)`.
4. Commit the generated file and treat it as build output, not hand-authored theme design.
5. Regenerate whenever the theme token surface changes.

This keeps theme JSON as the source of truth for values while keeping Tailwind class generation inside Buddy.

## Safe 1:1 Replacements

These match the current bridge behavior closely enough to bulk replace.

| Current Class | Replace With | Notes |
| :--- | :--- | :--- |
| `bg-background` | `bg-background-base` | App/page background |
| `bg-card` | `bg-surface-raised-base` | Transitional replacement for raised panels |
| `bg-muted` | `bg-surface-weak` | Subtle neutral fill |
| `bg-primary` | `bg-surface-interactive-base` | Interactive filled surface |
| `bg-destructive` | `bg-surface-critical-base` | Critical filled surface |
| `text-foreground` | `text-text-base` | Default body text in current bridge |
| `text-muted-foreground` | `text-text-weak` | Secondary copy |
| `text-card-foreground` | `text-text-base` | Card body text |
| `text-popover-foreground` | `text-text-base` | Overlay body text, but not highlighted rows/headings |
| `text-primary-foreground` | `text-text-on-interactive-base` | Text on interactive fills |
| `text-destructive-foreground` | `text-text-on-critical-base` | Text on critical fills |
| `border-border` | `border-border-base` | Default border |
| `border-input` | `border-border-base` | Transitional input border mapping |
| `ring-ring` | `ring-border-interactive-base` | Focus ring color |

## Recipe-Based Replacements

These are not safe global 1:1 swaps. They must be migrated by intent.

### Neutral hover and selected states

Do not bulk replace `bg-accent` with a single vendor token.

The current bridge is mode-dependent:
- light mode behaves like a soft neutral fill
- dark mode behaves like a stronger raised fill

Use a surface recipe based on the host component instead:
- row/button hover on base surfaces: `bg-surface-base-hover`
- row/button hover on raised surfaces: `bg-surface-raised-base-hover`
- persistent neutral emphasis fill: `bg-surface-weak`
- emphasized neutral content text: `text-text-strong`

Use this recipe for:
- `bg-accent`
- `text-accent-foreground`
- `hover:bg-accent`
- `data-[highlighted]:bg-accent`
- `data-open:bg-accent`
- sidebar hover/active states that currently use `bg-sidebar-accent`

### Overlay containers

Do not map `bg-popover` to `bg-surface-raised-strong`.

Vendor menus, dialogs, popovers, hover cards, and similar overlays should use:
- `bg-surface-raised-stronger-non-alpha`

Overlay text should usually be:
- body copy: `text-text-base`
- headings or active rows: `text-text-strong`

Use this recipe for:
- `bg-popover`
- `text-popover-foreground`
- command palettes
- dropdown menus
- context menus
- hover cards
- dialogs
- sheets/alert dialogs when they are meant to behave like vendor overlays

### Secondary buttons

Do not map `bg-secondary` to `bg-surface-weak`.

Use the button tokens directly:
- base: `bg-button-secondary-base`
- hover: `hover:bg-button-secondary-hover`
- text: `text-text-strong`

Use this recipe for:
- `bg-secondary`
- `text-secondary-foreground`
- secondary badges that are meant to read like secondary controls

### Inputs and editable surfaces

Do not treat `bg-input` as another neutral background.

Use input tokens:
- rest: `bg-input-base`
- hover: `hover:bg-input-hover`
- focus surface if needed: `bg-input-focus`
- border: `border-border-base`
- focus ring: `ring-border-interactive-base`

Use this recipe for:
- `bg-input`
- `dark:bg-input/30`
- `disabled:bg-input/50`
- input wrappers that currently mix `border-input`, `bg-input`, and `ring-ring`

### Status surfaces, text, and icons

Status classes need separate surface, text, and icon mappings.

Filled surfaces:
- `bg-success` -> `bg-surface-success-base`
- `bg-info` -> `bg-surface-info-base`
- `bg-warning` -> `bg-surface-warning-base`
- `bg-destructive` -> `bg-surface-critical-base`

Text on filled surfaces:
- success -> `text-text-on-success-base`
- info -> `text-text-on-info-base`
- warning -> `text-text-on-warning-base`
- destructive -> `text-text-on-critical-base`

Standalone icons or label text:
- success -> `text-icon-success-base`
- info -> `text-icon-info-base`
- warning -> `text-icon-warning-base`
- destructive -> `text-icon-critical-base`

Do not keep using `text-success`, `text-info`, or `text-warning` as generic replacements without checking whether the element is:
- a filled badge
- a standalone icon
- inline text inside normal flow

### Sidebar-specific shadcn tokens

The current sidebar vars are just another shadcn layer. Replace them with raw vendor surfaces instead of recreating sidebar-only tokens.

Use:
- sidebar container: `bg-surface-raised-base text-text-base`
- sidebar border: `border-border-base`
- sidebar focus ring: `ring-border-interactive-base`
- sidebar hover/active rows: the neutral hover recipe above

Use this recipe for:
- `bg-sidebar`
- `text-sidebar-foreground`
- `bg-sidebar-accent`
- `text-sidebar-accent-foreground`
- `border-sidebar-border`
- `ring-sidebar-ring`

### Ring and outline neutrals

Do not preserve `ring-foreground/10` as a vendor class target.

Vendor overlays usually communicate chrome with:
- shadow tokens
- border tokens
- raised surface tokens

When a soft neutral outline is still needed, choose an explicit token:
- `border-border-base`
- `border-border-weak-base`
- `shadow-xs-border`
- `shadow-lg-border-base`

## Live Repo Coverage

This migration must cover both:
- `packages/ui/src/components/ui/`
- `packages/web/src/`

Do not treat the shared UI package as the whole migration surface.

The repo still contains live classes outside the original table, including:
- `bg-input`
- `bg-info`
- `bg-success`
- `bg-warning`
- `bg-sidebar`
- `text-secondary-foreground`
- `text-sidebar-foreground`
- `text-sidebar-accent-foreground`
- `ring-foreground/10`

## Correct Migration Order

1. Add a Buddy generator that emits a Tailwind token file from resolved theme token keys.
2. Register that generated Buddy token file in `packages/ui`.
3. Keep the current shadcn vars working while the class migration is in progress.
4. Add raw theme-token emission to both theme runtime paths:
   - `packages/web/src/theme/context.tsx`
   - `packages/web/src/theme/preload-runtime.ts`
5. Migrate class usage across both `packages/ui/src/components/ui/` and `packages/web/src/`.
6. Bulk replace only the safe 1:1 mappings.
7. Convert recipe-based classes component-by-component.
8. After no shadcn theme classes remain, remove:
   - `packages/web/src/theme/shadcn-mapper.ts`
   - shadcn-only theme token registration that is no longer needed
9. Bump the theme cache version and update theme tests at the same time as bridge removal.

## Removal Rule

`packages/web/src/theme/shadcn-mapper.ts` is the last cleanup step, not the first migration step.

If we remove it before both runtime CSS generation and class usage are migrated, we will break:
- first paint preload styling
- cached theme CSS
- every remaining `bg-background`, `text-foreground`, `bg-popover`, `bg-accent`, and related shadcn class still present in the app
