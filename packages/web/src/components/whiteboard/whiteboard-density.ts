/**
 * Excalidraw ships a single fixed desktop control size and has no idea how much room the Bench has
 * given it. Its chrome needs roughly 760px before the canvas gets anything — a 12.5rem (200px)
 * style panel plus a ~560px toolbar — so on a narrow board the controls visually dominate the
 * drawing surface.
 *
 * Density is keyed off the board's measured width rather than the Bench layout mode. The docked
 * bench is user-resizable, so mode is only a proxy: a docked board dragged wide needs no compaction
 * and a narrow floating board does. Width is the property the complaint is actually about, and it
 * is readable locally without threading layout state down from the workspace root.
 */

/**
 * Stock chrome needs ~760px before it collides with itself, but "not colliding" is a lower bar than
 * "not dominating". A Bench board is never as roomy as a full-window canvas, so the threshold sits
 * well above the collision point: chrome at stock scale still swamps a board of roughly a thousand
 * pixels, which is the common docked and split case.
 */
export const WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX = 1100

const COMPACT_LG_BUTTON_SIZE = "1.75rem"
const COMPACT_LG_ICON_SIZE = "0.875rem"
const COMPACT_DEFAULT_BUTTON_SIZE = "1.625rem"
const COMPACT_DEFAULT_ICON_SIZE = "0.875rem"
const COMPACT_STYLE_PANEL_PADDING = "0.5rem"
/**
 * `--bar-padding` is `calc(4 * --space-factor)`, so the toolbar's own inset shrinks with this.
 * Button count is fixed, which makes padding the only remaining lever once the buttons are small.
 */
const COMPACT_SPACE_FACTOR = "0.1875rem"

export type WhiteboardDensity = "comfortable" | "compact"

export const WHITEBOARD_DENSITY_COMFORTABLE: WhiteboardDensity = "comfortable"
export const WHITEBOARD_DENSITY_COMPACT: WhiteboardDensity = "compact"

/**
 * An unmeasured board (zero width, or a non-finite reading from a detached node) stays comfortable
 * so the chrome never flashes compact on the first frame before layout settles.
 */
export function resolveWhiteboardDensity(widthPx: number): WhiteboardDensity {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return WHITEBOARD_DENSITY_COMFORTABLE
  return widthPx <= WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX
    ? WHITEBOARD_DENSITY_COMPACT
    : WHITEBOARD_DENSITY_COMFORTABLE
}

/**
 * Excalidraw declares its sizing variables on `.excalidraw` (specificity 0,1,0), so the scoped
 * two-attribute selector below overrides them regardless of source order.
 *
 * Scale is the only lever pulled here. The style panel's width is deliberately left at its stock
 * 12.5rem: its rows are laid out to fill exactly that width, so constraining it does not make the
 * panel smaller — it wraps the swatch rows, font family, font size, layers, and actions onto extra
 * lines, and the panel grows taller and reads as cramped. Smaller controls inside an unchanged
 * width reduce prominence and shorten the panel, because more items fit per row.
 */
export const WHITEBOARD_COMPACT_DENSITY_CSS = `
[data-component="whiteboard-canvas"][data-density="${WHITEBOARD_DENSITY_COMPACT}"] .excalidraw {
  --lg-button-size: ${COMPACT_LG_BUTTON_SIZE};
  --lg-icon-size: ${COMPACT_LG_ICON_SIZE};
  --default-button-size: ${COMPACT_DEFAULT_BUTTON_SIZE};
  --default-icon-size: ${COMPACT_DEFAULT_ICON_SIZE};
  --space-factor: ${COMPACT_SPACE_FACTOR};
}

[data-component="whiteboard-canvas"][data-density="${WHITEBOARD_DENSITY_COMPACT}"] .App-menu__left {
  padding: ${COMPACT_STYLE_PANEL_PADDING};
}

/*
 * Excalidraw pins each tool's shortcut number to the button's bottom-right corner at a fixed
 * offset and a fixed font size, neither of which scales with the button. Once the buttons shrink
 * the digits sit on top of the glyphs. They are a hint, not a control, and an illegible one at
 * this size — the shortcuts still work.
 */
[data-component="whiteboard-canvas"][data-density="${WHITEBOARD_DENSITY_COMPACT}"] .ToolIcon__keybinding {
  display: none;
}
`
