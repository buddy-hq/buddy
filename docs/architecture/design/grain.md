# Composer Surface System ("Grain")

Every surface the prompt composer spawns — the composer itself, its model/thinking dropdowns, the `@`/`/` autocomplete menus, the arcade and sketch docks, the context-usage popover, the Bench tab, and the chat transcript's sent user-message bubble — shares one paper-grained, borderless surface material with soft lift and consistent geometry.

**Source of truth:** [`packages/web/src/components/prompt/composer-surfaces.css`](../../../packages/web/src/components/prompt/composer-surfaces.css)

## Architectural Principles

### 1. Unlayered CSS Rules
Surface classes are declared **outside `@layer`**. Unlayered CSS rules take precedence over Tailwind's layered utilities, allowing shared UI components (`SelectContent`, `ComposerDock`, `TooltipContent`) to adopt the grain system without specificity hacks or fighting local component utility classes. The host element must be positioned (`relative`/`absolute`) so the grain overlay anchors correctly.

### 2. Synchronous Inline Clamp vs. Virtualizer Stability
Sent user messages cap content at `COLLAPSED_MAX_HEIGHT_PX` with a fade gradient and Show more/less toggle:
- **Synchronous inline clamp:** Clamping must be applied via inline `max-height` during render, never via post-mount JS animation.
- **Virtualizer protection:** TanStack React Virtual measures row heights during layout via `ResizeObserver`. Any post-layout animation (e.g. Motion animating `height: auto` in its own frame) causes measurement cascade oscillations and continuous scroll flicker.
- **No inner scrollbars:** The grain `::after` anchors to the bubble's box; scrolling content underneath it would drag the tooth along and uncover the fill. Clamp-and-reveal keeps the grain still.
- **Observer bail-out:** The `ResizeObserver` measurement `setState` bails out when measured numbers are unchanged to prevent observer re-render loops.
- **CSS transitions:** Expand/collapse transitions run purely via CSS `max-height` and only after an explicit user toggle (`hasToggledRef`). `motion-reduce:transition-none` honors reduced motion.

### 3. Grain Controller Rationale
All visual properties derive from CSS custom properties on `:root`. The `--composer-grain-opacity` token (default `0.06`) is the global controller knob: setting it to `0` removes grain across every surface without component changes.

## Tokens & Classes Summary

| Variable / Token | Default / Role |
|---|---|
| `--composer-grain-opacity` | `0.06` (grain strength; global controller knob) |
| `--composer-grain-size` | `180px` (uniform tile size across large docks and small menus) |
| `--composer-grain-image` | Inline SVG noise (`feTurbulence` texture as `data:` URI) |
| `--composer-surface-radius` | `16px` (composer shell, floating docks) |
| `--composer-surface-radius-sm` | `10px` (compact dropdowns, autocomplete menus, popovers, Bench tab) |
| `--composer-surface-bg` | `--surface-raised-base` (anchored surface fill) |
| `--composer-surface-bg-floating` | `--surface-raised-stronger-non-alpha` (opaque floating surface fill) |
| `--composer-surface-hairline` | `border-weak-base @ 55%` (faint edge baked into floating shadow) |
| `--composer-surface-shadow` | Soft two-layer anchored lift |
| `--composer-surface-shadow-floating` | Hairline + deeper floating lift |
| `--composer-focus-ring` | `border-interactive-base @ 12%` |

| Class | Use On | Material / Effect |
|---|---|---|
| `composer-grain` | Any positioned surface | SVG `feTurbulence` noise overlay (`::after` at `z-index: 2`). |
| `composer-surface` | Composer shell | Panel radius + anchored bg + resting shadow, borderless. |
| `composer-surface-floating` | Floating panels (docks) | Panel radius + opaque bg + lift shadow + hairline. |
| `composer-surface-menu` | Compact popovers | Compact radius + floating material (dropdowns, autocomplete menus). |
| `composer-surface-bubble` | Sent message bubble | Fill + radius + grain only (**no shadow/ring**), pinched bottom-right tail. |
| `composer-surface-tab` | Selected Bench tab | Compact radius anchored material. |
| `composer-shell` | Composer shell | Focus-ring behavior (`:has(:focus-visible)`). |
| `composer-scroll` | Editor scroll container | Thin, trackless, hover-firming scrollbar overriding global scrollbars. |

## CSS Edge Cases

Both edge cases are keyed off `composer-surface-menu`:
- **Select scroll chevrons:** Ship an opaque fill at `z-10`; they are dropped to `z-1` so the grain (`z-2`) covers them too while they still mask scrolling list items underneath.
- **Context popover Radix arrow:** The Radix arrow is explicitly hidden. The system is arrow-less, and the hardcoded light fill of the default Radix arrow appears as a pale diamond artifact on dark surfaces.

## Surface File Mapping

| Surface | File | Class(es) |
|---|---|---|
| Composer shell | `packages/web/src/components/prompt/prompt-composer.tsx` | `composer-surface composer-grain composer-shell` |
| Editor scrollbar | `packages/web/src/components/prompt/prompt-composer.tsx` | `composer-scroll` |
| Model / thinking dropdowns | `packages/web/src/components/prompt/components/prompt-composer-toolbar.tsx` | `composer-surface-menu composer-grain` |
| `@` / `/` autocomplete menu | `packages/web/src/components/prompt/components/prompt-autocomplete-menu.tsx` | `composer-surface-menu composer-grain` |
| Arcade dock, Sketch dock | `packages/web/src/components/prompt/prompt-composer.tsx` | `composer-surface-floating composer-grain` |
| Context-usage popover | `packages/web/src/components/directory-chat/session-context-usage.tsx` | `composer-surface-menu composer-grain` |
| Sent user-message bubble | `packages/web/src/components/chat/parts/user-message.tsx` | `composer-surface-bubble composer-grain` |
| Selected Bench tab | `packages/web/src/components/bench/bench-tabs.tsx` | `composer-surface-tab composer-grain` |

## Adding a New Composer Surface

1. Make sure the host element is positioned (`relative`/`absolute`).
2. Add `composer-grain` plus one of `composer-surface` / `composer-surface-floating` / `composer-surface-menu`.
3. Drop local `rounded-*`, `border`, `shadow-*`, `bg-surface-*` utilities — the system classes own geometry and styling.
