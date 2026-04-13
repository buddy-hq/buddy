# Customization & Theming

Buddy is not styled like stock shadcn/ui.

The important difference is that Buddy has its own token layer and its own shared component conventions. Many components started from shadcn, but the live source of truth is the code in this repo.

## What Controls Buddy Styling

- `packages/ui/src/index.css` defines the Tailwind v4 setup, custom variants, font setup, and base theme wiring.
- `packages/ui/src/generated/theme-tokens.css` provides the generated Buddy token classes used across shared UI.
- `packages/ui/src/components/ui` contains Buddy-owned components that may diverge from upstream shadcn APIs and styles.

Do not treat upstream shadcn presets or theme names as authoritative for Buddy.

## Buddy Token Vocabulary

Buddy components use token classes such as:

- `bg-background-base`
- `bg-surface-base`
- `bg-surface-raised-base`
- `bg-surface-interactive-base`
- `text-text-base`
- `text-text-strong`
- `text-text-weak`
- `text-text-on-interactive-base`
- `border-border-base`
- `border-border-interactive-base`
- `ring-border-interactive-base`
- `bg-input-base`
- `bg-button-secondary-base`

Status and emphasis tokens also exist, such aøs:

- `text-icon-critical-base`
- `bg-surface-critical-base`
- `text-text-on-critical-base`
- `bg-surface-success-base`
- `bg-surface-warning-base`

There are more than 40 custom tokens.

Use the Buddy token names already present in the component or the design system. Do not reintroduce upstream shadcn tokens like `bg-primary`, `text-muted-foreground`, or `border-input` in shared Buddy UI.

Components reference semantic CSS variable tokens. Change the variables to change every component.

## Contents

- How it works (CSS variables → Tailwind utilities → components)
- Color variables and OKLCH format
- Dark mode setup
- Changing the theme (presets, CSS variables)
- Adding custom colors (Tailwind v3 and v4)
- Border radius
- Customizing components (variants, className, wrappers)
- Checking for updates

---

## Adding Custom Colors

Add variables to the file at `tailwindCssFile` from `npx shadcn@latest info` (typically `globals.css`). Never create a new CSS file for this.

```css
/* 1. Define in the global CSS file. */
:root {
  --warning: oklch(0.84 0.16 84);
  --warning-foreground: oklch(0.28 0.07 46);
}
.dark {
  --warning: oklch(0.41 0.11 46);
  --warning-foreground: oklch(0.99 0.02 95);
}
```

```css
/* 2a. Register with Tailwind v4 (@theme inline). */
@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

When `tailwindVersion` is `"v3"` (check via `npx shadcn@latest info`), register in `tailwind.config.js` instead:

```js
// 2b. Register with Tailwind v3 (tailwind.config.js).
module.exports = {
  theme: {
    extend: {
      colors: {
        warning: 'oklch(var(--warning) / <alpha-value>)',
        'warning-foreground':
          'oklch(var(--warning-foreground) / <alpha-value>)',
      },
    },
  },
}
```

```tsx
// 3. Use in components.
<div className="bg-warning text-warning-foreground">Warning</div>
```

---

## Border Radius

`--radius` controls border radius globally. Components derive values from it (`rounded-lg` = `var(--radius)`, `rounded-md` = `calc(var(--radius) - 2px)`).

---

## Customizing Components

See also: [rules/styling.md](./rules/styling.md) for Incorrect/Correct examples.

Prefer these approaches in order:

### 1. Built-in variants

```tsx
<Button variant="outline" size="sm">
  Click
</Button>
```

### 2. Tailwind classes via `className`

```tsx
<Card className="mx-auto max-w-md">...</Card>
```

### 3. Add a new variant

Edit the component source to add a variant via `cva`:

```tsx
// components/ui/button.tsx
warning: "bg-warning text-warning-foreground hover:bg-warning/90",
```

### 4. Wrapper components

Compose shadcn/ui primitives into higher-level components:

```tsx
export function ConfirmDialog({ title, description, onConfirm, children }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

---

## Checking for Updates

```bash
npx shadcn@latest add button --diff
```

To preview exactly what would change before updating, use `--dry-run` and `--diff`:

```bash
npx shadcn@latest add button --dry-run        # see all affected files
npx shadcn@latest add button --diff button.tsx # see the diff for a specific file
```

See [Updating Components in SKILL.md](./SKILL.md#updating-components) for the full smart merge workflow.
