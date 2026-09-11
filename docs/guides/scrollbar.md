# Scrollbar Styling Guide

This guide documents scrollbar architecture, rules, and failed anti-patterns in Buddy.

---

## 1. Architecture Overview

Buddy uses two distinct, non-interfering scrollbar systems:

- **Global Native:** Standard `overflow: auto/scroll` elements styled via CSS `::-webkit-scrollbar` on `*` in `packages/ui/src/index.css` (`@layer base`).
- **Hover Native:** Sidebars and hover-revealed containers using `@utility scrollbar-hover` in `packages/ui/src/index.css` (`@layer utilities`).
- **Radix Custom:** `<ScrollArea>` components (e.g. chat transcript) using overflow clipping and an overlaid `<div>` scrollbar in `packages/ui/src/components/ui/scroll-area.tsx`.

---

## 2. Rules & Failed Anti-Patterns

### Global Native Scrollbar (`@layer base`)
- **No `:not()` exclusions:** Never use `*:not(.scrollbar-hover)::-webkit-scrollbar`. `:not()` increases specificity above `@layer utilities`, breaking hover reveal. Keep plain `*::-webkit-scrollbar`; Tailwind's layer cascade (`utilities` > `base`) resolves precedence.
- **Minimum 8px width:** Widths under 8px (e.g. 6px) with 2px transparent borders collapse the visible thumb to 2px. Keep 8–10px with `background-clip: padding-box`.
- **No `@supports` wrapping:** Wrapping in `@supports selector(::-webkit-scrollbar)` alters cascade ordering against `@utility`. Use plain selectors directly in `@layer base`.

### Hover Native Scrollbar (`scrollbar-hover`)
- **Apply to scrolling container:** Place `scrollbar-hover` on the element with `overflow-y-auto`, never on a non-scrolling parent.
- **Prevent layout shift:** Relies on `scrollbar-gutter: stable`. Never combine with negative-margin hacks (`scrollbar-hover-edge`), which cause protruding scrollbars.
- **Direct nesting:** Use nested hover rules (`&:hover::-webkit-scrollbar-thumb`). CSS variable intermediaries (`--sb-thumb`) fail to cascade reliably across pseudo-elements.

### Radix `<ScrollArea>`
- **No `scrollbar-gutter: stable` on `<Viewport>`:** Radix already clips native scrollbars; reserving gutter wastes 10px of content space.
- **Do not apply `scrollbar-hover`:** Radix scrollbars are custom DOM elements; native pseudo-element utilities have no effect.
- **Thumb color token:** Use `bg-text-weak/40` (hover `bg-text-weak/60`). Never use `bg-border`, which is nearly invisible in dark mode.
