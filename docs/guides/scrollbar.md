# Scrollbar Styling Guide

This guide documents the scrollbar architecture in Buddy, the pitfalls we hit while iterating on it, and the rules future agents must follow.

## Architecture Overview

There are **two completely independent scrollbar systems** in the app. They must never interfere with each other.

| System | Where | How it works | Defined in |
|---|---|---|---|
| **Global native scrollbar** | Every `overflow: auto/scroll` element (sidebar, code blocks, etc.) | CSS `::-webkit-scrollbar` pseudo-elements on `*` | `packages/ui/src/index.css` (`@layer base`) |
| **Radix custom scrollbar** | `<ScrollArea>` components (chat transcript, etc.) | Radix hides the native scrollbar via overflow clipping and renders its own absolutely-positioned `<div>` scrollbar on top | `packages/ui/src/components/ui/scroll-area.tsx` |

These two systems are **architecturally different** and must be styled independently.

## Global Native Scrollbar (`@layer base`)

Defined in `packages/ui/src/index.css` inside `@layer base`:

```css
*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
*::-webkit-scrollbar-track {
  background: color-mix(in oklab, var(--background-base) 86%, transparent);
}
*::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--text-weak) 30%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
```

This applies to **every scrollable element** in the app — including elements inside Radix `<ScrollArea>`. However, Radix hides the native scrollbar via overflow clipping, so the global rules are invisible inside `<ScrollArea>` components even though they technically match.

### Rules

- **Do NOT add `:not()` exclusions** to the global `*::-webkit-scrollbar` selectors. We tried excluding `[data-slot="scroll-area-scrollbar"]` and `.scrollbar-hover` — it created cascading specificity nightmares. It's unnecessary because:
  - Radix hides the native scrollbar via clipping — the global rule matches but is invisible.
  - The `scrollbar-hover` utility is in `@layer utilities` which beats `@layer base` in Tailwind v4 cascade.

- **Do NOT change the width** to anything under 8px. We tried 6px and it was unusably thin.

- **Do NOT wrap in `@supports selector(::-webkit-scrollbar)`**. The original working code used plain `*::-webkit-scrollbar` selectors directly. Adding `@supports` changed the cascade behavior and broke things.

## Hover-Only Scrollbar (`@utility scrollbar-hover`)

Defined in `packages/ui/src/index.css` as a Tailwind v4 `@utility`:

```css
@utility scrollbar-hover {
  scrollbar-gutter: stable;
  scrollbar-color: transparent transparent;

  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: transparent; border-color: transparent; }

  &:hover {
    scrollbar-color: color-mix(in oklab, var(--text-weak) 30%, transparent) transparent;
  }
  &:hover::-webkit-scrollbar-track {
    background: color-mix(in oklab, var(--background-base) 86%, transparent);
  }
  &:hover::-webkit-scrollbar-thumb {
    background: color-mix(in oklab, var(--text-weak) 30%, transparent);
  }
  &:hover::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklab, var(--text-weak) 48%, transparent);
  }
}
```

### How it works

1. `scrollbar-gutter: stable` — always reserves space for the scrollbar, preventing layout shift when it appears/disappears.
2. At rest: thumb and track are `transparent` → scrollbar is invisible.
3. On `:hover` of the container: thumb and track become visible.
4. This utility is in `@layer utilities` (Tailwind v4), which **beats** the global `@layer base` rules — so `background: transparent` on the thumb wins over the global `background: color-mix(...)`.

### How to use

Apply the class to the **scrolling container** (the element with `overflow-y-auto`):

```tsx
// ✅ Correct: scrollbar-hover on the scrolling container
<div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto px-2">
  {content}
</div>
```

```tsx
// ❌ Wrong: scrollbar-hover on a parent that doesn't scroll
<div className="scrollbar-hover flex-1 min-h-0">
  <div className="overflow-y-auto px-2">{content}</div>
</div>
```

### No layout shift

`scrollbar-gutter: stable` is the mechanism that prevents layout shift. It reserves the scrollbar lane at all times — even when there isn't enough content to scroll. This means content is slightly inset from the right edge, which is fine for sidebars.

**Do NOT** combine `scrollbar-gutter: stable` with `scrollbar-hover-edge` (padding-right + negative margin-right). These are two different no-layout-shift strategies that conflict — using both causes the scrollbar to protrude into adjacent panels.

## Radix `<ScrollArea>` Scrollbar

Defined in `packages/ui/src/components/ui/scroll-area.tsx`.

Radix `<ScrollArea>` works completely differently from native scrollbars:

1. The `<Viewport>` has `overflow: scroll` but the native scrollbar is **hidden via clipping**.
2. Radix renders its own `<ScrollAreaScrollbar>` and `<ScrollAreaThumb>` as absolutely-positioned `<div>` elements overlaid on top of the content.
3. Radix toggles `data-state="visible"` / `data-state="hidden"` on the scrollbar element based on pointer activity.

### Visibility

The scrollbar fades in/out using opacity driven by Radix's own `data-state`:

```tsx
<ScrollAreaPrimitive.ScrollAreaScrollbar
  className={cn(
    "... flex touch-none p-px select-none",
    "opacity-0 transition-opacity duration-300 data-[state=visible]:opacity-100",
    className,
  )}
>
  <ScrollAreaPrimitive.ScrollAreaThumb
    className="relative flex-1 rounded-full bg-text-weak/40 hover:bg-text-weak/60 transition-colors"
  />
</ScrollAreaPrimitive.ScrollAreaScrollbar>
```

### Rules

- **Do NOT add `scrollbar-gutter: stable`** to the Radix `<Viewport>`. Radix hides the native scrollbar — `scrollbar-gutter` reserves space for a hidden scrollbar, causing content to shift left for no reason.

- **Do NOT add `scrollbar-hover` class** to Radix `<ScrollArea>` components. The Radix scrollbar is a custom `<div>`, not a native scrollbar. The `scrollbar-hover` utility targets `::-webkit-scrollbar` pseudo-elements which don't apply to Radix's custom elements.

- **Use `bg-text-weak/40`** (not `bg-border`) for the thumb color. `bg-border` is a border token — nearly invisible as a scrollbar thumb, especially in dark mode.

## Pitfalls & Lessons Learned

### 1. `:not()` exclusions on global `*::` rules cause cascading failures

```css
/* ❌ BAD: Adding :not() exclusions to the global rule */
*:not([data-slot="scroll-area-scrollbar"]):not(.scrollbar-hover)::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--text-weak) 30%, transparent);
}
```

**Why it fails:** The `:not()` pseudo-class adds specificity. This causes the global rule to have *higher* specificity than the `scrollbar-hover` utility's `&::-webkit-scrollbar-thumb { background: transparent }`, defeating the cascade. The fix we kept trying — `!important`, CSS custom property intermediaries, `@layer utilities` — all failed because the root cause was the `:not()` specificity bump.

**Fix:** Just don't add exclusions. The global rule works fine as plain `*::` selectors because:
- Radix hides the native scrollbar (global rule is invisible).
- Tailwind's layer cascade (`utilities` > `base`) handles priority for `scrollbar-hover`.

### 2. `@supports selector(::-webkit-scrollbar)` changes cascade behavior

```css
/* ❌ BAD: Wrapping in @supports */
@supports selector(::-webkit-scrollbar) {
  *::-webkit-scrollbar-thumb { ... }
}
```

**Why it fails:** Moving rules into `@supports` changes how they interact with rules outside `@supports`. The original working code had plain `*::` rules in `@layer base`. Wrapping in `@supports` broke the cascade relationship with `@utility scrollbar-hover`.

**Fix:** Keep the global rules as plain selectors inside `@layer base`, same as the original.

### 3. CSS custom property intermediary for hover-reveal didn't work

```css
/* ❌ BAD: Using --sb-thumb as intermediary */
.scrollbar-hover { --sb-thumb: transparent; }
.scrollbar-hover:hover { --sb-thumb: color-mix(...); }
.scrollbar-hover::-webkit-scrollbar-thumb { background: var(--sb-thumb); }
```

**Why it failed:** Even though CSS custom properties cascade to pseudo-elements in theory, this approach when placed in `@layer utilities` didn't produce the expected result in practice. The `@utility` nesting approach (`&:hover::-webkit-scrollbar-thumb`) works fine and is simpler.

### 4. `scrollbar-gutter: stable` on Radix viewport wastes space

```tsx
// ❌ BAD: scrollbar-gutter on Radix viewport
<ScrollAreaPrimitive.Viewport className="... [scrollbar-gutter:stable]">
```

**Why it fails:** Radix hides the native scrollbar. `scrollbar-gutter: stable` reserves space for a hidden native scrollbar → content shifts left by ~10px with no visual benefit.

### 5. Shrinking scrollbar width below 8px

```css
/* ❌ BAD: Too thin */
*::-webkit-scrollbar { width: 6px; }
```

At 6px with a 2px transparent border (for `background-clip: padding-box` rounding), the visible thumb is only 2px wide — almost invisible.

## Summary: What To Do

| Scenario | Solution |
|---|---|
| Normal always-visible scrollbar | Just use `overflow-y-auto`. The global `@layer base` rules handle it. |
| Hover-only scrollbar (e.g. sidebar) | Add `scrollbar-hover` class to the scrolling container alongside `overflow-y-auto`. |
| Radix `<ScrollArea>` scrollbar | Use the `<ScrollBar>` component with `opacity-0 data-[state=visible]:opacity-100`. Do not use `scrollbar-hover`. |
| Preventing layout shift (native) | `scrollbar-hover` already includes `scrollbar-gutter: stable`. |
| Preventing layout shift (Radix) | Not needed — Radix's scrollbar is absolutely positioned and never causes shift. |
| Hiding scrollbar entirely | Use the `no-scrollbar` utility class. |
