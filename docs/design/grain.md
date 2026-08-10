# Composer surface system ("grain")

Every surface the prompt composer spawns — the composer itself, its model/
thinking dropdowns, the `@`/`/` autocomplete menus, the arcade and sketch
docks, and the context-usage popover — plus the chat transcript's sent
user-message bubble, shares one material: a paper-grained, borderless surface
with a soft shadow and a consistent radius. This doc is the map.

**Source of truth:** [`packages/web/src/components/prompt/composer-surfaces.css`](../../packages/web/src/components/prompt/composer-surfaces.css)

## The idea

The whole look is driven by CSS custom properties declared once on `:root`.
Components never hardcode a radius, shadow, background, or grain value — they
wear a class that reads those variables. Retune the system, or wire up a future
**grain controller**, by writing the variables in one place; every surface
follows.

The classes are deliberately **unlayered** (declared outside any `@layer`).
Unlayered rules beat Tailwind's layered utilities, so a surface built from a
shared UI component (`SelectContent`, `ComposerDock`, `TooltipContent`) adopts
the system by adding one class — without fighting the component's own
`rounded-*` / `shadow-*` / `bg-*` utilities. The only requirement is that the
host element is already positioned (all our surfaces are), so the grain overlay
can anchor to it.

## Tokens

| Variable | Default | What it controls |
| --- | --- | --- |
| `--composer-grain-opacity` | `0.06` | Grain strength. **The grain-controller knob** — set to `0` to remove grain everywhere. |
| `--composer-grain-size` | `180px` | Grain tile size (kept uniform so a big dock and a small menu share the same tooth). |
| `--composer-grain-image` | inline SVG noise | The `feTurbulence` texture, as a `data:` URI. |
| `--composer-surface-radius` | `16px` | Panel radius (composer, docks). |
| `--composer-surface-radius-sm` | `10px` | Compact radius (dropdowns, menus, popover). |
| `--composer-surface-bg` | `--surface-raised-base` | Anchored surface fill. |
| `--composer-surface-bg-floating` | `--surface-raised-stronger-non-alpha` | Floating surface fill (opaque, so menus read over busy content). |
| `--composer-surface-hairline` | `border-weak-base @ 55%` | Faint edge, baked into the floating shadow instead of a hard border. |
| `--composer-surface-shadow` | soft two-layer | Anchored lift (the composer resting on the page). |
| `--composer-surface-shadow-floating` | hairline + deeper lift | Floating lift (menus, docks, popovers). |
| `--composer-focus-ring` | `border-interactive-base @ 12%` | Composer shell focus ring. |

## Classes

| Class | Use on | Gives |
| --- | --- | --- |
| `composer-grain` | any positioned surface | The paper-tooth `::after` overlay (non-interactive, sits at `z-index: 2` so it runs across the whole surface). |
| `composer-surface` | the composer shell | Panel radius + anchored bg + resting shadow, borderless. |
| `composer-surface-tab` | selected Bench tab | Anchored composer material at the compact radius. |
| `composer-surface-floating` | large floating panels (docks) | Panel radius + floating bg + floating shadow + hairline. |
| `composer-surface-menu` | compact popovers (dropdowns, `@`/`/` menu, context popover) | Same material as floating, but the compact radius. |
| `composer-surface-bubble` | the sent user-message bubble | Minimal: fill + radius + grain only, **no shadow/ring**, with a pinched bottom-right corner (the chat-bubble tail). |
| `composer-shell` | the composer shell | Focus-ring behaviour (`:has(:focus-visible)`). |
| `composer-scroll` | the editor's scroll container | Track-less, thin, hover-firming scrollbar (overrides the app's chunky global one). |

Two edge cases the CSS also handles, both keyed off `composer-surface-menu`:

- **Select scroll chevrons** ship an opaque fill at `z-10`; they're dropped to
  `z-1` so the grain (`z-2`) covers them too, while they still mask the list
  scrolling beneath.
- **The context popover's Radix arrow** is hidden — the rest of the system is
  arrow-less, and its hardcoded light fill would show as a pale diamond on the
  dark surface.

## Where each surface lives

| Surface | File | Class(es) |
| --- | --- | --- |
| Composer shell | `prompt/prompt-composer.tsx` | `composer-surface composer-grain composer-shell` |
| Editor scrollbar | `prompt/prompt-composer.tsx` | `composer-scroll` |
| Model / thinking dropdowns | `prompt/components/prompt-composer-toolbar.tsx` | `composer-surface-menu composer-grain` |
| `@` / `/` autocomplete menu | `prompt/components/prompt-autocomplete-menu.tsx` | `composer-surface-menu composer-grain` |
| Arcade dock, Sketch dock | `prompt/prompt-composer.tsx` (call sites) | `composer-surface-floating composer-grain` |
| Context-usage popover | `directory-chat/session-context-usage.tsx` | `composer-surface-menu composer-grain` |
| Sent user-message bubble | `chat/parts/user-message.tsx` | `composer-surface-bubble composer-grain` |
| Selected Bench tab | `bench/bench-tabs.tsx` | `composer-surface-tab composer-grain` |

The docks are styled at their call sites (passed via `className` into the
shared `ComposerDock`) so the `@buddy/ui` package stays decoupled from the app's
CSS.

### The height-capped message bubble

A long sent message is clamped instead of running full-length. The bubble caps
its content at `COLLAPSED_MAX_HEIGHT_PX`, lays a short fade (a `to top` gradient
in `--composer-surface-bg-floating`, the bubble's own fill, so it dissolves into
the surface) over the bottom of the clamped text, and offers a **Show more /
Show less** toggle. No inner scrollbar — the grain `::after` anchors to the
bubble's box, so scrolling content underneath it would drag the tooth along and
uncover the fill; clamp-and-reveal keeps the grain still. Overflow is measured
off the content's `scrollHeight` via a `ResizeObserver`.

**The clamp must be applied synchronously**, never through a JS animation
library. The transcript virtualiser measures every row's height in a layout
effect and observes it with a `ResizeObserver`; anything that sets the height
*after* layout (e.g. Motion animating `height: auto` in its own frame) is
measured full-height first, then collapsed, and the correction cascades into a
continuous scroll flicker as rows mount and unmount. So the height is a plain
inline `max-height` set during render — capped at `COLLAPSED_MAX_HEIGHT_PX` even
before the first measurement (a no-op for short messages, but it keeps a long
one from ever being measured full-height) — and the measurement `setState` bails
out when the numbers are unchanged so the observer can't drive a re-render loop.

Open/close animates with a **CSS** `max-height` transition (~0.3s) plus an
opacity cross-fade on the gradient, and only after the first real toggle
(`hasToggledRef`) — never on mount or a re-measure, so loading a chat never
animates row heights. `motion-reduce:transition-none` honours reduced motion.
The expanded target is the measured `scrollHeight`, so the transition eases to
the exact content height; the virtualiser tracks that one bounded, user-driven
resize normally.

## Adding a new composer surface

1. Make sure the host element is positioned (`relative`/`absolute`).
2. Add `composer-grain` plus one of `composer-surface` / `composer-surface-floating`
   / `composer-surface-menu`.
3. Drop any local `rounded-*`, `border`, `shadow-*`, `bg-surface-*` utilities —
   the system class owns them now.

## A future grain controller

Because grain is a single variable, a control only has to write it — e.g. a
setting that does `document.documentElement.style.setProperty('--composer-grain-opacity', value)`,
or a `[data-grain="off"] { --composer-grain-opacity: 0 }` rule. No component
changes, no per-surface edits. Same story for radius, shadow, or fill: retune
the token, every surface moves together.
